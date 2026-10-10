import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../site/js/engine/rng.js';
import { generateQuestion, dailySettings, weekdayOf } from '../site/js/engine/question.js';
import { PERSONAS, PERSONA_BY_WEEKDAY, JITTER } from '../site/js/engine/config.js';
import { TEMPLATES } from '../site/js/engine/templates/index.js';

test('the rng is a pure function of its seed', () => {
  const a = makeRng('stratle'), b = makeRng('stratle'), c = makeRng('stratle!');
  const xs = Array.from({ length: 1000 }, a);
  assert.deepEqual(xs, Array.from({ length: 1000 }, b));
  assert.notDeepEqual(xs, Array.from({ length: 1000 }, c));
  assert.ok(xs.every((x) => x >= 0 && x < 1));
});

test('the same seed gives byte-identical crowd data', () => {
  for (const template of Object.keys(TEMPLATES)) {
    const settings = dailySettings('2026-10-10');
    const one = JSON.stringify(generateQuestion({ seed: 'repeat', template, settings }));
    const two = JSON.stringify(generateQuestion({ seed: 'repeat', template, settings }));
    assert.equal(one, two, template);
    assert.notEqual(one, JSON.stringify(generateQuestion({ seed: 'other', template, settings })), template);
  }
});

test('a crowd has exactly 10,000 bots', () => {
  const q = generateQuestion({ seed: 'size', template: 'target', settings: dailySettings('2026-10-10') });
  const n = q.crowd.types.reduce((s, t) => s + t.c.reduce((a, b) => a + b, 0), 0);
  assert.equal(n, 10000);
});

test('daily settings follow the weekday curve and stay near their persona', () => {
  // A persona's 2/3-game mean falls from Monday to Saturday; Sunday's is the lowest (deepest crowd).
  const means = PERSONA_BY_WEEKDAY.map((id) => PERSONAS[id].mean);
  for (let w = 2; w <= 6; w++) assert.ok(means[w] < means[w - 1], `weekday ${w} should be deeper than ${w - 1}`);
  assert.ok(means[0] < means[6], 'Sunday is the deepest');
  const start = Date.UTC(2026, 0, 1);
  for (let i = 0; i < 365; i++) {
    const day = new Date(start + i * 864e5).toISOString().slice(0, 10);
    const s = dailySettings(day);
    const p = PERSONAS[PERSONA_BY_WEEKDAY[weekdayOf(day)]];
    assert.deepEqual(s, dailySettings(day));
    assert.equal(s.persona, PERSONA_BY_WEEKDAY[weekdayOf(day)]);
    for (const k of ['tau', 'noise', 'eq', 'joker']) {
      assert.ok(Math.abs(s[k] - p[k]) <= JITTER[k] * p[k] + 1e-3, `${day} ${k}`);
    }
    assert.equal(s.sample, p.sample);
  }
});
