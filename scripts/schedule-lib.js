// The question schedule: which 5 templates and parameters each UTC date gets.
//
// Rules (checked by checkSchedule and test/schedule.test.js):
//   - every day has QUESTIONS_PER_DAY different templates;
//   - no template is given an identical parameter set within REPEAT_WINDOW days.
// Templates are picked at random, weighted towards the ones used least recently, so each appears
// about equally often. Everything is seeded by the date, but a day also depends on the days before it
// (the repeat rule), so the schedule is extended from the kept past, never re-planned from scratch.

import { makeRng } from '../site/js/engine/rng.js';
import { TEMPLATES } from '../site/js/engine/templates/index.js';

export const QUESTIONS_PER_DAY = 5;
// Templates that exist but are not scheduled. splitsteal: steal wins ~74% of days (always with no penalty).
export const RETIRED = ['splitsteal'];
export const SCHEDULED = Object.keys(TEMPLATES).filter((t) => !RETIRED.includes(t));
export const REPEAT_WINDOW = 90;
const MAX_TRIES = 200;

export const addDays = (dateKey, n) => new Date(Date.parse(`${dateKey}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
const keyOf = (template, params) => `${template}|${JSON.stringify(params)}`;

/** Usage so far, from scheduled days (any order): template -> last date, and key -> dates used. */
function historyOf(days) {
  const last = new Map(), used = new Map();
  for (const [date, questions] of Object.entries(days).sort()) {
    for (const q of questions) {
      last.set(q.template, date);
      const k = keyOf(q.template, q.params);
      if (!used.has(k)) used.set(k, []);
      used.get(k).push(date);
    }
  }
  return { last, used };
}

function freshParams(template, date, used) {
  const tpl = TEMPLATES[template];
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const params = tpl.sampleParams(makeRng(`stratle|schedule|${date}|${template}|${attempt}`));
    const recent = (used.get(keyOf(template, params)) ?? []).some((d) => Math.abs(daysBetween(d, date)) < REPEAT_WINDOW);
    if (!recent) return params;
  }
  return null;
}

/** Plans one day given the usage so far. */
export function planDay(date, { last, used }) {
  const rng = makeRng(`stratle|schedule|${date}`);
  const pool = [...SCHEDULED];
  const chosen = [];
  while (chosen.length < QUESTIONS_PER_DAY && pool.length) {
    const weights = pool.map((t) => (last.has(t) ? Math.min(30, daysBetween(last.get(t), date)) : 30) ** 2);
    let u = rng() * weights.reduce((a, b) => a + b, 0);
    let i = 0;
    while (u >= weights[i]) u -= weights[i++];
    const [template] = pool.splice(Math.min(i, pool.length - 1), 1);
    const params = freshParams(template, date, used);
    if (params) chosen.push({ template, params });
  }
  if (chosen.length < QUESTIONS_PER_DAY) throw new Error(`${date}: not enough templates with fresh parameters`);
  // Shuffle the order so the same template does not always come first.
  for (let k = chosen.length - 1; k > 0; k--) {
    const j = Math.floor(rng() * (k + 1));
    [chosen[k], chosen[j]] = [chosen[j], chosen[k]];
  }
  return chosen;
}

/**
 * Extends `days` (date -> questions) so it covers start .. start + count - 1, keeping every existing
 * day up to and including `keepUntil` and re-planning the later ones in date order.
 */
export function extendSchedule(days, start, count, keepUntil) {
  const kept = Object.fromEntries(Object.entries(days).filter(([d]) => d <= keepUntil));
  const hist = historyOf(kept);
  const out = { ...kept };
  for (let i = 0; i < count; i++) {
    const date = addDays(start, i);
    if (out[date]) continue;
    const questions = planDay(date, hist);
    out[date] = questions;
    for (const q of questions) {
      hist.last.set(q.template, date);
      const k = keyOf(q.template, q.params);
      if (!hist.used.has(k)) hist.used.set(k, []);
      hist.used.get(k).push(date);
    }
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
}

/** Every rule violation in a schedule, as messages (empty when valid). */
export function checkSchedule(days) {
  const problems = [];
  const seen = new Map();
  for (const [date, questions] of Object.entries(days).sort()) {
    const ids = questions.map((q) => q.template);
    if (questions.length !== QUESTIONS_PER_DAY) problems.push(`${date}: ${questions.length} questions`);
    if (new Set(ids).size !== ids.length) problems.push(`${date}: repeated template`);
    for (const q of questions) {
      if (!TEMPLATES[q.template]) problems.push(`${date}: unknown template ${q.template}`);
      const k = keyOf(q.template, q.params);
      const prev = seen.get(k);
      if (prev && daysBetween(prev, date) < REPEAT_WINDOW) problems.push(`${date}: ${q.template} repeats params from ${prev}`);
      seen.set(k, date);
    }
  }
  return problems;
}
