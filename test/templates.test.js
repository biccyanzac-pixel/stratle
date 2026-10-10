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
