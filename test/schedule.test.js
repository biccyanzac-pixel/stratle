import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { checkSchedule, addDays, QUESTIONS_PER_DAY, REPEAT_WINDOW, SCHEDULED } from '../scripts/schedule-lib.js';
import { generateDay } from '../site/js/engine/question.js';

const schedule = JSON.parse(readFileSync(new URL('../data/schedule.json', import.meta.url), 'utf8'));
const dates = Object.keys(schedule.days);
const dayFile = (date) => new URL(`../site/data/days/${date}.json`, import.meta.url);

test('the schedule covers two years without gaps', () => {
  assert.equal(dates[0], schedule.start);
  assert.ok(dates.length >= 730, `${dates.length} days`);
  dates.forEach((d, i) => assert.equal(d, addDays(schedule.start, i)));
});

test(`each day has ${QUESTIONS_PER_DAY} different templates and no params repeat within ${REPEAT_WINDOW} days`, () => {
  assert.deepEqual(checkSchedule(schedule.days), []);
});

test('every scheduled template is used, and about equally often', () => {
  const counts = {};
  for (const qs of Object.values(schedule.days)) for (const q of qs) counts[q.template] = (counts[q.template] ?? 0) + 1;
  const ids = [...SCHEDULED];
  assert.deepEqual(Object.keys(counts).sort(), ids.sort());
  const expected = (dates.length * QUESTIONS_PER_DAY) / ids.length;
  for (const [t, n] of Object.entries(counts)) assert.ok(Math.abs(n - expected) / expected < 0.15, `${t}: ${n}`);
});

test('every scheduled day has a day file that matches the schedule', () => {
  for (const date of dates) {
    assert.ok(existsSync(dayFile(date)), `missing ${date}.json (run node scripts/generate.js)`);
  }
  for (const date of dates.filter((d, i) => i % 37 === 0)) {
    const day = JSON.parse(readFileSync(dayFile(date), 'utf8'));
    assert.deepEqual(day.questions.map(({ template, params }) => ({ template, params })), schedule.days[date], date);
  }
});

test('golden days: regenerating a spread of day files gives byte-identical output', () => {
  // Pins "never change a published day": if this fails, an engine or calibration change would rewrite
  // days. Only future days may change, via node scripts/generate.js --regenerate-future.
  for (const date of dates.filter((d, i) => i % 61 === 0 || i === dates.length - 1)) {
    const regenerated = `${JSON.stringify(generateDay(date, schedule.days[date]))}\n`;
    assert.equal(regenerated, readFileSync(dayFile(date), 'utf8'), date);
  }
});

test('every day file has 5 crowds of exactly 10,000 bots', () => {
  for (const date of dates.filter((d, i) => i % 13 === 0)) {
    const day = JSON.parse(readFileSync(dayFile(date), 'utf8'));
    for (const q of day.questions) {
      const n = q.crowd.types.reduce((s, t) => s + t.c.reduce((a, b) => a + b, 0), 0);
      assert.equal(n, 10000, `${date} ${q.template}`);
    }
  }
});
