// Template 9: estimation (the German tank problem). "We picked 10 random whole numbers from 1 to N:
// 21, 22, 103, ... 318. What is N?" Scored by relative error against the real N, so the crowd does not
// affect the score; it is simulated only for the reveal.
//
// Bots never see N. Level 0 goes for "a bit above the biggest number seen". Higher levels maximise their
// expected score under the posterior P(N | sample) ∝ 1 / C(N, k) for N ≥ max (flat prior). Jokers give
// round-ups and "double the average" (the 400, 500 and 404 spikes in the YouTube survey).

import { makeDist } from '../dist.js';
import { between } from '../rng.js';
import { pct } from '../format.js';

/** Score out of 100: full marks within 1% (at least ±1), falling linearly to 0 at 30% off. */
export function relScore(answer, N) {
  const off = Math.abs(answer - N);
  if (off <= Math.max(1, 0.01 * N)) return 100;
  return Math.max(0, 100 * (1 - (off / N - 0.01) / 0.29));
}

const sampleMax = (p) => p.samples[p.samples.length - 1];
const mvue = (p) => Math.round(sampleMax(p) * (1 + 1 / p.samples.length) - 1);
const doubleMean = (p) => Math.round((2 * p.samples.reduce((a, b) => a + b, 0)) / p.samples.length);

/** log C(n, k) differences are all we need: log P(n) = −Σ log((n − i)/(k − i)). */
function posterior(p, lo, hi) {
  const k = p.samples.length;
  const lp = [];
  for (let n = lo; n <= hi; n++) {
    let s = 0;
    for (let i = 0; i < k; i++) s -= Math.log(n - i);
    lp.push(s);
  }
  const top = Math.max(...lp);
  const w = lp.map((x) => Math.exp(x - top));
  const t = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / t);
}

const BR_CACHE = new Map();

function bayesBest(p) {
  const m = sampleMax(p), { max } = tank.grid(p);
  const hi = Math.min(max, 3 * m);
  const post = posterior(p, m, hi);
  let best = -1, answers = [];
  for (let a = m; a <= hi; a++) {
    let e = 0;
    for (let n = m; n <= hi; n++) e += post[n - m] * relScore(a, n);
    if (e > best + 1e-9) { best = e; answers = [a]; } else if (e >= best - 1e-9) answers.push(a);
  }
  return { answers, payoff: best };
}

export const tank = {
  id: 'tank',
  family: 'tank',
  kind: 'number',

  // N is log-uniform in 40..2000; k from 5 to 15. Redraw until N ≤ 3 × max seen, so the answer grid
  // (1 .. 4 × max seen) always contains N without its size giving N away.
  sampleParams(rng) {
    for (;;) {
      const N = Math.round(Math.exp(between(rng, Math.log(40), Math.log(2000))));
      const k = 5 + Math.floor(rng() * 11);
      const set = new Set();
      while (set.size < k) set.add(1 + Math.floor(rng() * N));
      const samples = [...set].sort((a, b) => a - b);
      if (N <= 3 * samples[k - 1]) return { N, samples };
    }
  },

  grid: (p) => ({ min: 1, max: 4 * sampleMax(p) }),

  level0(p) {
    const m = sampleMax(p), { max } = tank.grid(p);
    const w = new Array(max).fill(0);
    for (let v = m; v <= Math.min(max, Math.round(1.3 * m)); v++) w[v - 1] = Math.exp(-(v - m) / (0.06 * m));
    return makeDist(1, max, w);
  },

  jokers(p) {
    const m = sampleMax(p), { max } = tank.grid(p);
    const up = Math.ceil((m + 1) / 100) * 100;
    // Round-ups past the max (350, 400 and 500 after a max of 318) and "double the average" (404).
    return [Math.ceil((m + 1) / 50) * 50, up, up + 100, doubleMean(p)].filter((v) => v >= 1 && v <= max);
  },

  equilibrium: () => null,

  // The same for every level and every crowd (bots reason about N, not about each other), so cached.
  bestResponse(p) {
    const key = p.samples.join();
    if (!BR_CACHE.has(key)) BR_CACHE.set(key, bayesBest(p));
    return BR_CACHE.get(key);
  },

  prompt: (p) => `We picked ${p.samples.length} different random whole numbers from 1 to N: ${p.samples.join(', ')}. What is N? (Full marks within 1% or ±1, nothing beyond 30% off.)`,

  prepare: (p) => ({ N: p.N }),
  payoff: (p, { N }, answer) => relScore(answer, N),

  reveal(p, ctx, d) {
    return { N: p.N, sampleMax: sampleMax(p), mvue: mvue(p), doubleMean: doubleMean(p), crowd: d };
  },

  explain(p, s) {
    let near = 0;
    s.crowd.w.forEach((x, i) => { if (relScore(s.crowd.min + i, p.N) >= 100) near += x; });
    const median = s.median;
    let text = `The real N was ${p.N}. The biggest number you saw was ${s.sampleMax}, so N had to be at least that. `;
    text += `The textbook estimate is max + max/k − 1 = ${s.mvue}: the numbers you saw split 1..N into ${p.samples.length + 1} gaps, and the gap above the max should be about the average gap. `;
    text += `"Double the average" gives ${s.doubleMean}, which is unbiased too but much noisier. `;
    text += `The crowd's median guess was ${median}, and ${pct(near / s.size)} of it got full marks.`;
    return text;
  },
};

