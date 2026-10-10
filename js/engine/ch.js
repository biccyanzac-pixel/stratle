// The cognitive-hierarchy crowd model and the generic solver.
//
// A template supplies its rules (see templates/README.md); this file never looks inside them.
// Level 0 plays the template's naive distribution. Level k believes the crowd is levels 0..k-1 in
// Poisson(τ) proportions, finds every answer that maximises its expected payoff against that mix,
// and spreads over those answers with a small noise term. Everything here is deterministic; the
// only randomness is in sampleCrowd, which takes a seeded rng.

import { makeDist, mix, totalOf, pointMass } from './dist.js';
import { makeRng } from './rng.js';

export const MAX_LEVEL = 4;

/** Poisson(τ) weights for levels 0..maxLevel, truncated and renormalised. */
export function poissonWeights(tau, maxLevel = MAX_LEVEL) {
  const f = [];
  let p = Math.exp(-tau);
  for (let k = 0; k <= maxLevel; k++) {
    f.push(p);
    p = (p * tau) / (k + 1);
  }
  const s = f.reduce((a, b) => a + b, 0);
  return f.map((x) => x / s);
}

export const SAMPLE_ROUNDS = 128;

/**
 * Every answer on the grid that maximises the payoff against `belief`, and that payoff.
 * With `sample` > 0 the bot is unsure how the crowd will turn out: it scores each answer against
 * SAMPLE_ROUNDS imagined crowds of `sample` bots drawn from its belief (payoff sampling, after
 * Osborne & Rubinstein) and averages. Small samples mean more doubt, which makes cliff-edge
 * answers (just under a line, just inside a window) riskier. Needs a seeded `rng`.
 */
export function bestResponse(tpl, params, belief, { sample = 0, rng } = {}) {
  const { min, max } = tpl.grid(params);
  const ctx = tpl.prepare(params, belief);
  const n = max - min + 1;
  const pays = new Array(n).fill(0);
  if (sample > 0) {
    const cdf = cumulative(belief);
    const counts = new Array(n);
    for (let r = 0; r < SAMPLE_ROUNDS; r++) {
      counts.fill(0);
      for (let i = 0; i < sample; i++) counts[draw(cdf, rng())]++;
      const imagined = tpl.prepare(params, makeDist(min, max, counts));
      for (let v = min; v <= max; v++) pays[v - min] += tpl.payoff(params, imagined, v) / SAMPLE_ROUNDS;
    }
  } else {
    for (let v = min; v <= max; v++) pays[v - min] = tpl.payoff(params, ctx, v);
  }
  let best = -Infinity;
  for (const p of pays) if (p > best) best = p;
  const tol = 1e-9 * Math.max(1, Math.abs(best));
  const answers = [];
  pays.forEach((p, i) => { if (p >= best - tol) answers.push(min + i); });
  return { answers, payoff: best, ctx };
}

/**
 * Turns a set of best answers into a level's answer distribution.
 * Numbers: a share `exact` of the level hits a best answer exactly (the sharp spikes at 33 and 22 in
 * real 2/3 games); the rest spread as a Gaussian with sd = noise × range, kept inside the range.
 * Choices: the best options share 1 - noise, and every option gets an equal slice of noise.
 * A template may supply its own `noisy` (e.g. a vote plus a percentage).
 */
export function noisyChoice(tpl, params, answers, noise, exact = 0) {
  if (tpl.noisy) return tpl.noisy(params, answers, noise, exact);
  const { min, max } = tpl.grid(params);
  const n = max - min + 1;
  const w = new Array(n).fill(0);
  if (tpl.kind === 'choice') {
    for (const a of answers) w[a - min] += (1 - noise) / answers.length;
    for (let i = 0; i < n; i++) w[i] += noise / n;
    return makeDist(min, max, w);
  }
  const sd = noise * (max - min);
  if (sd < 0.05) return pointMass(min, max, answers);
  const reach = Math.ceil(4 * sd);
  for (const a of answers) w[a - min] += exact / answers.length;
  for (const a of answers) {
    const lo = Math.max(min, a - reach), hi = Math.min(max, a + reach);
    const k = [];
    let s = 0;
    for (let v = lo; v <= hi; v++) {
      const x = Math.exp(-((v - a) ** 2) / (2 * sd * sd));
      k.push(x);
      s += x;
    }
    for (let v = lo; v <= hi; v++) w[v - min] += ((1 - exact) * k[v - lo]) / s / answers.length;
  }
  return makeDist(min, max, w);
}

/**
 * Solves the hierarchy: returns the Poisson weights and each level's answer distribution, plus
 * each level's exact best answers (before noise) for explanations and tests.
 * `exact` is the share of each level with no noise; `sample` (imagined crowd size, 0 = certain)
 * needs `seed` for its imagined crowds.
 */
export function solveLevels(tpl, params, { tau, noise, exact = 0, sample = 0, seed = '', maxLevel = MAX_LEVEL }) {
  const f = poissonWeights(tau, maxLevel);
  const levels = [tpl.level0(params)];
  const bestAnswers = [null];
  for (let k = 1; k <= maxLevel; k++) {
    const belief = mix(levels.slice(0, k), f.slice(0, k));
    const opts = { sample, rng: sample ? makeRng(`${seed}|belief|${k}`) : undefined };
    // A template whose bots cannot see the scoring truth (the tank's real N) supplies its own best response.
    const br = tpl.bestResponse ? tpl.bestResponse(params, belief, opts) : bestResponse(tpl, params, belief, opts);
    bestAnswers.push(br.answers);
    levels.push(noisyChoice(tpl, params, br.answers, noise, exact));
  }
  return { f, levels, bestAnswers };
}

function cumulative(d) {
  const t = totalOf(d);
  let c = 0;
  return d.w.map((x) => (c += x / t));
}

function draw(cdf, u) {
  let lo = 0, hi = cdf.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cdf[mid] > u) hi = mid; else lo = mid + 1;
  }
  return lo;
}

/**
 * Samples `size` bots. Each bot is a theorist with probability `eq` (plays one of `eqAnswers`, the
 * game's equilibria), a joker with probability `joker` (one of `jokers`), and otherwise draws a level from f
 * and an answer from that level's distribution. Returns count distributions per type:
 * index 0..maxLevel are levels, then theorists, then jokers.
 */
export function sampleCrowd({ levels, f, eq = 0, eqAnswers = null, joker, jokers: all, size, rng }) {
  const { min, max } = levels[0];
  const jokers = all.filter((v) => v >= min && v <= max); // a joker list may name numbers outside a small range
  const K = levels.length;
  const counts = Array.from({ length: K + 2 }, () => new Array(max - min + 1).fill(0));
  const levelCdf = cumulative(makeDist(0, f.length - 1, f));
  const answerCdfs = levels.map(cumulative);
  const eqShare = eqAnswers ? eq : 0;
  for (let b = 0; b < size; b++) {
    const u = rng();
    if (u < eqShare) {
      counts[K][eqAnswers[Math.floor(rng() * eqAnswers.length)] - min]++;
    } else if (u < eqShare + joker) {
      counts[K + 1][jokers[Math.floor(rng() * jokers.length)] - min]++;
    } else {
      const k = draw(levelCdf, rng());
      counts[k][draw(answerCdfs[k], rng())]++;
    }
  }
  return counts.map((w) => makeDist(min, max, w));
}

/** The crowd's expected answer distribution (sums to 1), without sampling bots. Used for calibration. */
export function expectedCrowd({ levels, f, eq = 0, eqAnswers = null, joker, jokers: all }) {
  const { min, max } = levels[0];
  const jokers = all.filter((v) => v >= min && v <= max);
  const eqShare = eqAnswers ? eq : 0;
  const w = mix(levels, f).w.map((x) => x * (1 - eqShare - joker));
  for (const v of eqAnswers ?? []) w[v - min] += eqShare / eqAnswers.length;
  for (const v of jokers) w[v - min] += joker / jokers.length;
  return makeDist(min, max, w);
}
