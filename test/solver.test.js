import { test } from 'node:test';
import assert from 'node:assert/strict';
import { poissonWeights, bestResponse, noisyChoice, solveLevels } from '../site/js/engine/ch.js';
import { totalOf, uniform } from '../site/js/engine/dist.js';
import { TEMPLATES } from '../site/js/engine/templates/index.js';
import { generateQuestion, summarize } from '../site/js/engine/question.js';
import { counts, everyValue } from './helpers.js';

const { target, avoid, underbid } = TEMPLATES;
const twoThirds = { range: 100, stat: 'mean', a: [2, 3], b: 0 };
const br = (tpl, params, d) => bestResponse(tpl, params, d).answers;

test('Poisson weights are truncated at level 4 and renormalised', () => {
  const f = poissonWeights(1.5);
  assert.equal(f.length, 5);
  assert.ok(Math.abs(f.reduce((a, b) => a + b, 0) - 1) < 1e-12);
  assert.ok(Math.abs(f[1] / f[0] - 1.5) < 1e-12);
  assert.ok(Math.abs(f[2] / f[1] - 0.75) < 1e-12);
});

test('noise keeps a level inside the range and sums to 1', () => {
  for (const a of [0, 50, 100]) {
    const d = noisyChoice(target, twoThirds, [a], 0.05);
    assert.ok(Math.abs(totalOf(d) - 1) < 1e-12);
    assert.equal(d.w.length, 101);
    assert.equal(d.w.indexOf(Math.max(...d.w)), a);
  }
  assert.deepEqual(noisyChoice(target, twoThirds, [40], 0).w.filter(Boolean), [1]);
});

test('2/3 of the average with τ≈1.5 is won in the low 20s', () => {
  for (const joker of [0, 0.02]) {
    for (const seed of ['a', 'b', 'c']) {
      const q = generateQuestion({ seed, template: 'target', params: twoThirds, settings: { tau: 1.5, noise: 0.04, joker } });
      const { bestAnswers } = summarize(q);
      assert.ok(bestAnswers.every((v) => v >= 20 && v <= 25), `seed ${seed}, joker ${joker}: ${bestAnswers}`);
    }
  }
});

test('2/3 levels step down 50 → 33 → 27 → 24 → 23 at τ=1.5', () => {
  const { bestAnswers } = solveLevels(target, twoThirds, { tau: 1.5, noise: 0.04 });
  assert.deepEqual(bestAnswers, [null, [33], [27], [24], [23]]);
});

test('a deeper crowd wins lower in the 2/3 game', () => {
  const winner = (tau) => summarize(generateQuestion({ seed: 'depth', template: 'target', params: twoThirds, settings: { tau, noise: 0.04, joker: 0 } })).bestAnswers[0];
  assert.ok(winner(1.1) > winner(1.5) && winner(1.5) > winner(2.0));
});

test('target: best responses match hand calculations', () => {
  assert.deepEqual(br(target, twoThirds, counts(0, 100, { 60: 5 })), [40]);
  assert.deepEqual(br(target, { ...twoThirds, a: [1, 2] }, counts(0, 100, { 21: 1 })), [10, 11]); // 10.5: a tie
  assert.deepEqual(br(target, { range: 100, stat: 'median', a: [1, 1], b: 5 }, counts(0, 100, { 10: 1, 20: 1, 90: 1 })), [25]);
  assert.deepEqual(br(target, { range: 100, stat: 'mean', a: [3, 2], b: 0 }, counts(0, 100, { 100: 1 })), [100]); // clamped
  assert.deepEqual(br(target, { range: 100, stat: 'mean', a: [1, 1], b: -5 }, counts(0, 100, { 3: 1 })), [0]); // clamped
  assert.deepEqual(br(target, { range: 1000, stat: 'mean', a: [2, 3], b: 0 }, uniform(0, 1000)), [333]);
});

test('avoid: best responses match hand calculations', () => {
  const p = { range: 100, stat: 'median', band: 10, fence: [10, 90] };
  // Uniform 0..100: median 50, 10th percentile 10, 90th 90, so 40 away (4 bands) at the fence edges.
  const r = bestResponse(avoid, p, counts(0, 100, everyValue(0, 100)));
  assert.deepEqual(r.answers, [10, 90]);
  assert.equal(r.payoff, 4);
  // Crowd piled low: median 20, window 10..80, so 80 is 60 away (6 bands) and 10 only 1.
  const low = counts(0, 100, { 20: 6, 80: 2, 10: 1, 95: 1 });
  assert.deepEqual(br(avoid, p, low), [80]);
});

test('underbid: best responses match hand calculations', () => {
  const c1 = { max: 20, c: [1, 1] };
  assert.deepEqual(br(underbid, c1, counts(1, 20, { 8: 10 })), [7]); // mean exactly 8: strictly below
  assert.deepEqual(br(underbid, c1, counts(1, 20, { 7: 7, 8: 3 })), [7]); // mean 7.3
  assert.deepEqual(br(underbid, { max: 20, c: [4, 5] }, counts(1, 20, { 10: 4 })), [7]); // line exactly 8
  assert.deepEqual(br(underbid, { max: 20, c: [9, 10] }, counts(1, 20, { 10: 4 })), [8]); // line exactly 9
  const level1 = solveLevels(underbid, c1, { tau: 1.5, noise: 0.04 }).bestAnswers[1];
  const naiveMean = underbid.level0(c1).w.reduce((s, x, i) => s + x * (i + 1), 0);
  assert.deepEqual(level1, [Math.ceil(naiveMean) - 1]);
});

test('every template has the full set of parts', () => {
  for (const tpl of Object.values(TEMPLATES)) {
    for (const part of ['sampleParams', 'grid', 'level0', 'jokers', 'equilibrium', 'prompt', 'prepare', 'payoff', 'reveal', 'explain']) {
      assert.equal(typeof tpl[part], 'function', `${tpl.id}.${part}`);
    }
  }
});
