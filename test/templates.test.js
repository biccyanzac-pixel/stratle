// Hand-computed best responses and scoring edge cases for templates 4-9.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestResponse } from '../site/js/engine/ch.js';
import { TEMPLATES } from '../site/js/engine/templates/index.js';
import { rankPoints } from '../site/js/engine/templates/choice.js';
import { encode } from '../site/js/engine/templates/selfref.js';
import { relScore } from '../site/js/engine/templates/tank.js';
import { scoreAnswer, summarize, explain, generateQuestion } from '../site/js/engine/question.js';
import { counts, handQuestion } from './helpers.js';

const br = (id, params, map) => {
  const tpl = TEMPLATES[id];
  const { min, max } = tpl.grid(params);
  return bestResponse(tpl, params, counts(min, max, map));
};

test('threshold: an option pays only under its cap; the safe option always pays', () => {
  const p = { options: [{ points: 10, cap: 20 }, { points: 8, cap: 25 }, { points: 2, cap: 100 }] };
  assert.deepEqual(br('threshold', p, { 0: 10, 1: 30, 2: 60 }).answers, [0]); // A 10% < 20%: 10 points
  assert.deepEqual(br('threshold', p, { 0: 20, 1: 24, 2: 56 }).answers, [1]); // A at exactly 20% fails
  assert.deepEqual(br('threshold', p, { 0: 40, 1: 40, 2: 20 }).answers, [2]); // both crowded: take the safe 2
});

test('rank points: ties share their positions', () => {
  assert.deepEqual(rankPoints([5, 3, 3, 9], 'least', [5]), [0, 2.5, 2.5, 0]);
  assert.deepEqual(rankPoints([9, 5, 3], 'most', [0, 8, 3]), [0, 8, 3]);
  assert.deepEqual(rankPoints([4, 4, 1], 'most', [8, 5, 3, 1]), [6.5, 6.5, 3]);
});

test('common: least and most common best responses, including ties', () => {
  const least = { set: 'abc', labels: ['A', 'B', 'C', 'D'], order: 'least', points: [5] };
  assert.deepEqual(br('common', least, { 0: 5, 1: 3, 2: 3, 3: 9 }).answers, [1, 2]);
  const second = { set: 'colours', labels: ['Blue', 'Red', 'Green'], order: 'most', points: [0, 8, 3] };
  assert.deepEqual(br('common', second, { 0: 9, 1: 5, 2: 3 }).answers, [1]);
  // Tied for least common: both score 100.
  const q = handQuestion('common', least, { 0: 5, 1: 3, 2: 3, 3: 9 });
  assert.equal(scoreAnswer(q, 1).score, 100);
  assert.equal(scoreAnswer(q, 2).score, 100);
  assert.equal(scoreAnswer(q, 0).score, 0);
});

test('catch: the most common choice pays 0, and every option tied for most common does', () => {
  const p = { values: [1, 3, 5, 8], rule: 'mostZero' };
  assert.deepEqual(br('catch', p, { 3: 50, 2: 30, 1: 20 }).answers, [2]); // 8 is most common: take 5
  assert.deepEqual(br('catch', p, { 3: 40, 2: 40, 1: 20 }).answers, [1]); // 8 and 5 tie: both pay 0
  const bonus = { values: [0, 1, 3, 5], rule: 'leastBonus', bonus: 5 };
  assert.deepEqual(br('catch', bonus, { 0: 10, 1: 20, 2: 30, 3: 40 }).answers, [0, 3]); // 0 + 5 bonus ties a plain 5
  assert.deepEqual(br('catch', bonus, { 0: 30, 1: 20, 2: 30, 3: 40 }).answers, [1]); // 1 + 5 = 6 beats 5
});

test('split or steal: payoffs against the whole crowd and the break-even split share', () => {
  const p = { mode: 'single', pot: 6, penalty: 6 }; // break-even at 2/3 splitting
  assert.deepEqual(br('splitsteal', p, { 0: 60, 1: 40 }).answers, [0]); // split 1.8 vs steal 1.2
  assert.deepEqual(br('splitsteal', p, { 0: 90, 1: 10 }).answers, [1]); // split 2.7 vs steal 4.8
  assert.ok(Math.abs(summarize(handQuestion('splitsteal', p, { 0: 1, 1: 1 })).breakEven - 2 / 3) < 1e-9);
  const n = { mode: 'neighbours', pot: 6, penalty: 5 };
  // s = 0.5: split 2·0.5·3 = 3; steal 2·0.5·6 − 0.25·5 = 4.75.
  const r = br('splitsteal', n, { 0: 1, 1: 1 });
  assert.deepEqual(r.answers, [1]);
  assert.ok(Math.abs(r.payoff - 4.75) < 1e-12);
});

test('selfref: vote with the minority and guess the share', () => {
  const p = { bonus: 50, width: 20, focus: 'NO' };
  const crowd = { [encode(1, 50)]: 70, [encode(0, 50)]: 30 }; // 70% NO
  const r = br('selfref', p, crowd);
  assert.deepEqual(r.answers, [encode(0, 70)]); // NO is the majority, so YES is right; 70% NO
  assert.equal(r.payoff, 100);
  const q = handQuestion('selfref', p, crowd);
  assert.equal(scoreAnswer(q, encode(1, 70)).score, 50); // wrong vote, perfect guess
  assert.equal(scoreAnswer(q, encode(0, 80)).score, 75); // right vote, 10 off: half the guess points
  assert.equal(scoreAnswer(q, encode(0, 0)).score, 50); // limits of the grid are valid
  assert.equal(scoreAnswer(q, encode(1, 100)).score, 0);
  assert.throws(() => scoreAnswer(q, 202), RangeError);
});

test('tank: relative-error score, at least ±1 tolerance, and a sensible Bayesian guess', () => {
  assert.equal(relScore(1000, 1000), 100);
  assert.equal(relScore(1010, 1000), 100); // within 1%
  assert.equal(relScore(47, 46), 100); // ±1 for small N
  assert.equal(relScore(1300, 1000), 0); // 30% off
  assert.ok(Math.abs(relScore(1155, 1000) - 50) < 1e-9); // halfway
  const p = { N: 55, samples: [10, 20, 30, 40, 50] };
  const guess = TEMPLATES.tank.bestResponse(p).answers;
  assert.ok(guess.every((a) => a >= 50 && a <= 65), String(guess));
  const q = handQuestion('tank', p, { 50: 10 });
  assert.equal(scoreAnswer(q, 55).score, 100);
  assert.throws(() => scoreAnswer(q, 201), RangeError); // grid is 1 .. 4 × 50
});

test('every template explains a generated crowd from its data', () => {
  for (const template of Object.keys(TEMPLATES)) {
    for (const seed of ['a', 'b', 'c']) {
      const q = generateQuestion({ seed, template, settings: { tau: 1.5, noise: 0.05, joker: 0.02, eq: 0.05 } });
      const s = summarize(q);
      const text = explain(q, s);
      assert.doesNotMatch(text, /undefined|NaN|null|\[object/, `${template}/${seed}: ${text}`);
      assert.ok(s.bestAnswers.length > 0, template);
      for (const a of s.bestAnswers) assert.equal(scoreAnswer(q, a).score, 100, template);
    }
  }
});

test('target: middle-half and top-half averages', async () => {
  const { partialMean } = await import('../site/js/engine/dist.js');
  const d = counts(0, 100, { 10: 1, 20: 2, 30: 1 });
  assert.equal(partialMean(d, 0.25, 0.75), 20);
  assert.equal(partialMean(d, 0.5, 1), 25);
  assert.deepEqual(br('target', { range: 100, stat: 'trimmed', a: [2, 3], b: 0 }, { 10: 1, 20: 2, 30: 1 }).answers, [13]); // 13.3
  assert.deepEqual(br('target', { range: 100, stat: 'upper', a: [2, 3], b: 0 }, { 10: 1, 20: 2, 30: 1 }).answers, [17]); // 16.7
  // A joker at 100 moves the average but not the middle-half average.
  assert.deepEqual(br('target', { range: 100, stat: 'trimmed', a: [2, 3], b: 0 }, { 10: 1, 20: 2, 30: 1, 100: 0 }).answers, [13]);
});

test('stand out: farther is better, but the outer x% score nothing', () => {
  const every = Object.fromEntries(Array.from({ length: 101 }, (_, v) => [v, 1]));
  const far = { mode: 'far', range: 100, stat: 'median', outer: 10 };
  const r = br('avoid', far, every);
  assert.deepEqual(r.answers, [10, 90]); // 40 from the median, just inside the outer 10%
  const q = handQuestion('avoid', far, every);
  assert.equal(scoreAnswer(q, 30).score, 50); // 20 away out of 40
  assert.equal(scoreAnswer(q, 9).score, 0);
  assert.equal(scoreAnswer(q, 50).score, 0);
  const rank = { mode: 'farRank', range: 100, outer: 10 };
  assert.deepEqual(br('avoid', rank, every).answers, [10, 90]);
  assert.equal(scoreAnswer(handQuestion('avoid', rank, every), 5).score, 0);
});

test('bid under the line: the soft line costs points instead of everything', () => {
  const p = { max: 20, c: [1, 1], stat: 'mean', over: 2 };
  const q = handQuestion('underbid', p, { 10: 10 }); // line exactly 10
  assert.equal(scoreAnswer(q, 9).score, 90);
  assert.equal(scoreAnswer(q, 10).score, 100); // 0 over: keeps the bid
  assert.equal(scoreAnswer(q, 11).score, 90); // 11 - 2
  assert.equal(scoreAnswer(q, 16).score, 40); // 16 - 12
  assert.equal(scoreAnswer(q, 20).score, 0); // 20 - 20
  assert.equal(scoreAnswer(handQuestion('underbid', { max: 20, c: [1, 1], stat: 'mean' }, { 10: 10 }), 10).score, 0); // hard line
});

test('lowball: you score only under the crowd percentile', () => {
  const crowd = { 2: 30, 5: 30, 9: 40 };
  assert.deepEqual(br('lowball', { max: 20, share: 30 }, crowd).answers, [1]); // 30th percentile is 2
  assert.deepEqual(br('lowball', { max: 20, share: 50 }, crowd).answers, [4]); // median is 5
  const q = handQuestion('lowball', { max: 20, share: 50, over: 2 }, crowd);
  assert.equal(scoreAnswer(q, 4).score, 100);
  assert.equal(scoreAnswer(q, 5).score, 75); // 5 - 2 × 1 = 3 of 4
});

test('crowded points: crowded numbers score 0', () => {
  const crowd = { 10: 50, 9: 30, 8: 5, 7: 15 };
  assert.deepEqual(br('crowdpoints', { max: 10, rule: 'cap', cap: 10 }, crowd).answers, [8]);
  assert.deepEqual(br('crowdpoints', { max: 10, rule: 'top', k: 2 }, crowd).answers, [8]);
  assert.deepEqual(br('crowdpoints', { max: 10, rule: 'top', k: 3 }, crowd).answers, [8]); // 10, 9 and 7 are out; 8 is not top 3
});

test('rare number: smooth scores by rank, ties shared', () => {
  const p = { max: 5, order: 'least', shape: 'linear' };
  const q = handQuestion('rare', p, { 1: 40, 2: 30, 3: 20, 4: 10, 5: 10 });
  assert.equal(scoreAnswer(q, 4).score, 100); // 4 and 5 tie for rarest: (100 + 75) / 2 each, the best
  assert.equal(scoreAnswer(q, 5).score, 100);
  assert.equal(scoreAnswer(q, 3).score, Math.round((50 / 87.5) * 100));
  assert.equal(scoreAnswer(q, 1).score, 0);
});

test('every template keeps its jokers and theorist answers inside its range', async () => {
  const { makeRng } = await import('../site/js/engine/rng.js');
  for (const [id, tpl] of Object.entries(TEMPLATES)) {
    for (let i = 0; i < 200; i++) {
      const p = tpl.sampleParams(makeRng(`range-check|${id}|${i}`));
      const { min, max } = tpl.grid(p);
      const inside = (v) => Number.isInteger(v) && v >= min && v <= max;
      const eq = tpl.equilibrium(p);
      if (eq) assert.ok(eq.every(inside), `${id} ${JSON.stringify(p)} theorists ${eq}`);
      // Jokers outside a small range are dropped by the engine, but at least one must fit.
      assert.ok(tpl.jokers(p).some(inside), `${id} ${JSON.stringify(p)} jokers`);
    }
  }
});
