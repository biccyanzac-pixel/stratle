// Builds a day's questions offline, and scores and explains them in the browser.
//
// Offline (scripts/): dailySettings + generateQuestion produce plain JSON, the only thing shipped.
// Browser: decodeCrowd, scoreAnswer and summarize read that JSON and never draw a random number.

import { makeRng, between } from './rng.js';
import { makeDist, addAll, totalOf, meanOf, quantile } from './dist.js';
import { solveLevels, sampleCrowd, bestResponse } from './ch.js';
import { TEMPLATES } from './templates/index.js';
import { CROWD_SIZE, PERSONAS, PERSONA_BY_WEEKDAY, FAMILY, JITTER } from './config.js';

const round3 = (x) => Math.round(x * 1000) / 1000;

export const weekdayOf = (dateKey) => new Date(`${dateKey}T00:00:00Z`).getUTCDay();

/**
 * The day's crowd: the weekday's persona (a real crowd, see calibrated.js) with its settings jittered
 * by the date seed. Rounded so they are exact in JSON.
 */
export function dailySettings(dateKey) {
  const rng = makeRng(`stratle|${dateKey}|settings`);
  const persona = PERSONA_BY_WEEKDAY[weekdayOf(dateKey)];
  const p = PERSONAS[persona];
  const jitter = (x, spread) => round3(x * (1 + between(rng, -spread, spread)));
  return {
    persona,
    tau: jitter(p.tau, JITTER.tau),
    noise: jitter(p.noise, JITTER.noise),
    exact: p.exact,
    eq: jitter(p.eq, JITTER.eq),
    joker: jitter(p.joker, JITTER.joker),
    sample: p.sample,
  };
}

export const familyOf = (tpl, params) => (typeof tpl.family === 'function' ? tpl.family(params) : tpl.family);

/**
 * The day's settings adapted to a question's family (how differently people play that kind of game):
 * τ scales by the family's ratio; the family's own theorist and joker shares keep the day's jitter.
 */
function familySettings(tpl, params, day) {
  const m = FAMILY[familyOf(tpl, params)] ?? {};
  const base = PERSONAS[day.persona];
  const share = (k) => {
    if (m[k] === undefined) return day[k] ?? 0;
    return base?.[k] > 0 ? (m[k] * day[k]) / base[k] : m[k];
  };
  return {
    tau: round3(day.tau * (m.tau ?? 1)),
    noise: m.noise ?? day.noise,
    exact: m.exact ?? day.exact ?? 0,
    eq: tpl.equilibrium(params) === null ? 0 : Math.min(0.5, round3(share('eq'))),
    joker: Math.min(0.3, round3(share('joker'))),
    sample: m.sample ?? day.sample ?? 0,
  };
}

function encodeCounts(d) {
  let a = 0, b = d.w.length - 1;
  while (a <= b && !d.w[a]) a++;
  while (b >= a && !d.w[b]) b--;
  return a > b ? { o: 0, c: [] } : { o: a, c: d.w.slice(a, b + 1) };
}

/**
 * One question from a seed string. `params` and `settings` may be fixed (tests, calibration);
 * otherwise params come from the seed and settings must be given (normally dailySettings).
 * Params and crowd use separate rng streams so neither shifts when the other changes.
 */
export function generateQuestion({ seed, template, params, settings, size = CROWD_SIZE }) {
  const tpl = TEMPLATES[template];
  if (!tpl) throw new Error(`unknown template ${template}`);
  params = params ?? tpl.sampleParams(makeRng(`${seed}|params`));
  const s = familySettings(tpl, params, settings);
  const { f, levels, bestAnswers } = solveLevels(tpl, params, { ...s, seed });
  const types = sampleCrowd({
    levels, f, eq: s.eq, eqAnswers: tpl.equilibrium(params), joker: s.joker, jokers: tpl.jokers(params), size, rng: makeRng(`${seed}|crowd`),
  });
  const { min, max } = tpl.grid(params);
  return { template, params, settings: s, size, levelBest: bestAnswers, crowd: { min, max, types: types.map(encodeCounts) } };
}

/**
 * The questions for one date. `questions` is the day's schedule entry: [{ template, params }, ...]
 * (a bare template id samples its params from the seed instead).
 */
export function generateDay(dateKey, questions) {
  const settings = dailySettings(dateKey);
  return {
    date: dateKey,
    settings,
    questions: questions.map((q, i) => {
      const { template, params } = typeof q === 'string' ? { template: q } : q;
      return generateQuestion({ seed: `stratle|${dateKey}|q${i}`, template, params, settings });
    }),
  };
}

/** Count distributions per type (levels 0..4, theorists, jokers) and in total. */
export function decodeCrowd({ crowd }) {
  const { min, max, types } = crowd;
  const dists = types.map(({ o, c }) => {
    const w = new Array(max - min + 1).fill(0);
    c.forEach((x, i) => { w[o + i] = x; });
    return makeDist(min, max, w);
  });
  return { types: dists, all: addAll(dists) };
}

function validAnswer(tpl, params, answer) {
  const { min, max } = tpl.grid(params);
  return Number.isInteger(answer) && answer >= min && answer <= max;
}

/**
 * Score out of 100: the player's payoff ÷ the best payoff anyone could get against this crowd.
 * Only the best payoff earns 100 (no rounding up). If nothing could score, every answer earns 100.
 */
export function scoreAnswer(question, answer) {
  const tpl = TEMPLATES[question.template];
  if (!validAnswer(tpl, question.params, answer)) throw new RangeError(`answer ${answer} is out of range`);
  const { all } = decodeCrowd(question);
  const br = bestResponse(tpl, question.params, all);
  const payoff = tpl.payoff(question.params, br.ctx, answer);
  if (br.payoff <= 0) return { payoff, best: br.payoff, score: 100 };
  const score = payoff >= br.payoff ? 100 : Math.max(0, Math.min(99, Math.round((100 * payoff) / br.payoff)));
  return { payoff, best: br.payoff, score };
}

/** Everything the reveal needs, all computed from the question data. */
export function summarize(question) {
  const tpl = TEMPLATES[question.template];
  const { params } = question;
  const { types, all } = decodeCrowd(question);
  const levelCounts = types.slice(0, -2).map(totalOf);
  const theorists = totalOf(types[types.length - 2]);
  const jokers = totalOf(types[types.length - 1]);
  const thinkers = levelCounts.reduce((a, b) => a + b, 0);
  const br = bestResponse(tpl, params, all);
  const total = totalOf(all);
  let zero = 0;
  all.w.forEach((n, i) => { if (n && tpl.payoff(params, br.ctx, all.min + i) <= 0) zero += n; });
  return {
    size: total,
    levelCounts,
    theorists,
    theoristShare: theorists / total,
    equilibrium: tpl.equilibrium(params),
    jokers,
    levelShares: levelCounts.map((n) => n / thinkers),
    depth: levelCounts.reduce((a, n, k) => a + n * k, 0) / thinkers,
    mean: meanOf(all),
    median: quantile(all, 0.5),
    bestAnswers: br.answers,
    bestPayoff: br.payoff,
    zeroShare: zero / total,
    levelBest: question.levelBest,
    ...tpl.reveal(params, br.ctx, all),
  };
}

export function explain(question, summary = summarize(question)) {
  return TEMPLATES[question.template].explain(question.params, summary);
}

export function promptText(question) {
  return TEMPLATES[question.template].prompt(question.params);
}

/**
 * The score (0..100) every possible answer would get against this crowd, in grid order, plus the
 * crowd's own average score. One best-response pass, then one payoff per answer.
 */
export function scoreCurve(question) {
  const tpl = TEMPLATES[question.template];
  const { all } = decodeCrowd(question);
  const br = bestResponse(tpl, question.params, all);
  const scores = all.w.map((_, i) => {
    if (br.payoff <= 0) return 100;
    const p = tpl.payoff(question.params, br.ctx, all.min + i);
    return p >= br.payoff ? 100 : Math.max(0, Math.min(99, Math.round((100 * p) / br.payoff)));
  });
  let sum = 0;
  all.w.forEach((n, i) => { sum += n * scores[i]; });
  return { min: all.min, scores, crowdAverage: sum / totalOf(all) };
}
