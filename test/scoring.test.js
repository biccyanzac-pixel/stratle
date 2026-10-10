import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreAnswer, summarize, explain, generateQuestion } from '../site/js/engine/question.js';
import { handQuestion, everyValue } from './helpers.js';

const score = (q, a) => scoreAnswer(q, a).score;

test('target: rank payoff, ties count half', () => {
  // Crowd 10, 10, 30, 30: average 20, target 20.
  const q = handQuestion('target', { range: 100, stat: 'mean', a: [1, 1], b: 0 }, { 10: 2, 30: 2 });
  assert.equal(score(q, 20), 100);
  assert.equal(score(q, 10), 50); // closer than the two at 30, level with the two at 10
  assert.equal(score(q, 30), 50);
  assert.equal(score(q, 0), 0); // 20 away: every bot is only 10 away
  assert.equal(score(q, 100), 0);
});

test('answers at the range limits score, answers outside are rejected', () => {
  const q = handQuestion('target', { range: 100, stat: 'mean', a: [2, 3], b: 0 }, { 0: 3, 3: 1 });
  assert.equal(score(q, 0), 100); // target 0.5: 0 and 1 tie for best
  assert.equal(score(q, 1), 100);
  assert.ok(score(q, 100) < 5);
  for (const bad of [-1, 101, 2.5, NaN, '5']) assert.throws(() => scoreAnswer(q, bad), RangeError);
  const big = handQuestion('target', { range: 1000, stat: 'mean', a: [3, 2], b: 0 }, { 900: 2 });
  assert.equal(score(big, 1000), 100); // target 1350 is clamped to 1000
  assert.throws(() => scoreAnswer(big, 1001), RangeError);
});

test('only the best payoff earns 100', () => {
  // 10,000 bots: one at 40, the rest at 60. Answer 41 is almost as good as 40 but not best.
  const q = handQuestion('target', { range: 100, stat: 'median', a: [2, 3], b: 0 }, { 40: 1, 60: 9999 });
  assert.equal(score(q, 40), 100);
  assert.ok(score(q, 39) <= 99);
});

test('avoid: outside the window scores nothing, bands inside', () => {
  const q = handQuestion('avoid', { range: 100, stat: 'median', band: 10, fence: [10, 90] }, everyValue(0, 100));
  assert.equal(score(q, 10), 100);
  assert.equal(score(q, 90), 100);
  assert.equal(score(q, 9), 0);
  assert.equal(score(q, 91), 0);
  assert.equal(score(q, 0), 0);
  assert.equal(score(q, 100), 0);
  assert.equal(score(q, 30), 50); // 20 away: 2 bands of 4
  assert.equal(score(q, 50), 0);
});

test('underbid: strictly below the line, at the limits, and a day nobody can score', () => {
  const q = handQuestion('underbid', { max: 20, c: [1, 1] }, { 8: 10 });
  assert.equal(score(q, 7), 100);
  assert.equal(score(q, 8), 0); // equal to the average is not below it
  assert.equal(score(q, 1), 14); // 1/7
  assert.equal(score(q, 20), 0);
  assert.throws(() => scoreAnswer(q, 0), RangeError);
  assert.throws(() => scoreAnswer(q, 21), RangeError);
  const stuck = handQuestion('underbid', { max: 20, c: [1, 1] }, { 1: 50 });
  assert.equal(scoreAnswer(stuck, 1).best, 0);
  assert.equal(score(stuck, 1), 100);
  assert.match(explain(stuck), /nobody could score/);
});

test('ties for the best answer: every tied answer earns 100', () => {
  const q = handQuestion('target', { range: 100, stat: 'mean', a: [1, 2], b: 0 }, { 21: 4 }); // target 10.5
  assert.deepEqual(summarize(q).bestAnswers, [10, 11]);
  assert.equal(score(q, 10), 100);
  assert.equal(score(q, 11), 100);
});

test('explanations are built from the data, not hard-coded', () => {
  const p = { range: 100, stat: 'mean', a: [2, 3], b: 0 };
  const a = handQuestion('target', p, { 30: 10 });
  const b = handQuestion('target', p, { 60: 10 });
  assert.match(explain(a), /crowd's average was 30 and the target \(2\/3 of the average\) was 20\. The best number was 20/);
  assert.match(explain(b), /crowd's average was 60 and the target \(2\/3 of the average\) was 40\. The best number was 40/);
  for (const template of ['target', 'avoid', 'underbid']) {
    const q = generateQuestion({ seed: 'explain', template, settings: { tau: 1.5, noise: 0.04, joker: 0.02 } });
    const s = summarize(q);
    const text = explain(q, s);
    assert.ok(text.includes(`averaged ${s.depth.toFixed(1)} steps`), template);
    assert.ok(text.includes(String(Math.max(...s.bestAnswers))), template);
    assert.doesNotMatch(text, /undefined|NaN|null/, template);
  }
});
