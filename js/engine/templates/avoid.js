// Template 2: avoid the crowd. Two modes:
//   distance: "1 point for every full 10 you are from the crowd's median, but nothing if you land
//             outside the middle 80% of answers." Stand out without being an outlier.
//   rank:     "Everyone's numbers are lined up. The middle 10% score nothing, the next 10% on each
//             side 10 points, the next 10% on each side 5 points, the rest nothing." (The YouTube
//             survey's version.) Scores depend on where your number ranks in the crowd.

import { uniform, totalOf, sumOf, quantile } from '../dist.js';
import { pick } from '../rng.js';
import { fmt, answerList } from '../format.js';

const FENCES = [[10, 90], [5, 95], [15, 85], [20, 80]];
// edges: distance from the 50th percentile, in percentage points, where each ring ends.
const RINGS = [
  { edges: [5, 15, 25], points: [0, 10, 5] },
  { edges: [10, 20, 30], points: [0, 10, 5] },
  { edges: [5, 15, 30], points: [0, 8, 4] },
  { edges: [10, 25, 40], points: [0, 10, 3] },
  { edges: [5, 10, 20, 30], points: [0, 10, 6, 2] },
];

const statWord = (p) => (p.stat === 'median' ? 'median' : 'average');

function ringText({ edges, points }) {
  const parts = [`the middle ${2 * edges[0]}% score ${points[0] || 'nothing'}`];
  for (let i = 1; i < edges.length; i++) parts.push(`the next ${edges[i] - edges[i - 1]}% on each side score ${points[i]} points`);
  return `${parts.join(', ')}, and the rest score nothing`;
}

export const avoid = {
  id: 'avoid',
  family: 'avoid',
  kind: 'number',

  sampleParams(rng) {
    if (rng() < 0.5) return { mode: 'rank', range: pick(rng, [100, 200, 500, 1000]), ...pick(rng, RINGS) };
    const range = pick(rng, [100, 200]);
    return { mode: 'distance', range, stat: rng() < 0.5 ? 'median' : 'mean', band: (pick(rng, [5, 10]) * range) / 100, fence: pick(rng, FENCES) };
  },

  grid: ({ range }) => ({ min: 0, max: range }),
  level0: ({ range }) => uniform(0, range),
  jokers: ({ range }) => (range === 1000 ? [0, 1000, 500, 69, 420, 666] : [0, range, range / 2, 69, 42]),
  equilibrium: () => null, // no single answer that logic leads everyone to

  prompt(p) {
    if (p.mode === 'rank') {
      return `Pick a whole number from 0 to ${p.range}. Everyone's numbers are lined up from lowest to highest: ${ringText(p)}.`;
    }
    return `Pick a whole number from 0 to ${p.range}. You score 1 point for every full ${p.band} your number is from the crowd's ${statWord(p)}, but nothing if it lands outside the middle ${p.fence[1] - p.fence[0]}% of the crowd's answers.`;
  },

  prepare(p, d) {
    if (p.mode === 'rank') {
      const below = [];
      let c = 0;
      for (const x of d.w) { below.push(c); c += x; }
      return { d, below, total: c };
    }
    const [N, D] = p.stat === 'median' ? [quantile(d, 0.5), 1] : [sumOf(d), totalOf(d)];
    return { N, D, mid: N / D, lo: quantile(d, p.fence[0] / 100), hi: quantile(d, p.fence[1] / 100) };
  },

  payoff(p, ctx, answer) {
    if (p.mode === 'rank') {
      const i = answer - ctx.d.min;
      const gap = 100 * Math.abs((ctx.below[i] + ctx.d.w[i] / 2) / ctx.total - 0.5);
      const ring = p.edges.findIndex((e) => gap < e - 1e-9);
      return ring < 0 ? 0 : p.points[ring];
    }
    const { N, D, lo, hi } = ctx;
    if (answer < lo || answer > hi) return 0;
    return Math.floor(Math.abs(answer * D - N) / (p.band * D) + 1e-9);
  },

  reveal(p, ctx, d) {
    if (p.mode === 'rank') {
      const at = (gap) => quantile(d, (50 + gap) / 100);
      return { rings: p.edges.map((e, i) => ({ points: p.points[i], lo: at(-e), hi: at(e) })) };
    }
    const { mid, lo, hi } = ctx;
    let outside = 0;
    d.w.forEach((n, i) => { if (d.min + i < lo || d.min + i > hi) outside += n; });
    return { mid, lo, hi, outsideShare: outside / totalOf(d) };
  },

  explain(p, s) {
    const l1 = s.levelBest[1];
    const deepest = [...s.levelBest].reverse().find(Boolean);
    const plural = s.bestPayoff === 1 ? '' : 's';
    let text = `Today's crowd averaged ${s.depth.toFixed(1)} steps of thinking. `;
    if (p.mode === 'rank') {
      const [mid, ...rest] = s.rings;
      text += `Lined up from lowest to highest, the middle ${2 * p.edges[0]}% of answers ran from ${mid.lo} to ${mid.hi}`;
      text += rest.length ? `, and the ${rest[0].points}-point ring covered ${rest[0].lo}–${mid.lo} and ${mid.hi}–${rest[0].hi}. ` : '. ';
      text += `The best answers were ${answerList(s.bestAnswers)}, worth ${fmt(s.bestPayoff)} point${plural}. `;
    } else {
      text += `Its ${statWord(p)} was ${fmt(s.mid)} and the middle ${p.fence[1] - p.fence[0]}% of answers ran from ${s.lo} to ${s.hi}, so anything outside that window scored nothing. `;
      text += `The best answers were ${answerList(s.bestAnswers)}, worth ${s.bestPayoff} point${plural}: as far from the ${statWord(p)} as the window allowed. `;
    }
    text += `Level-1 bots expected a random crowd and went for ${answerList(l1)}; deeper bots expected that and settled on ${answerList(deepest)}. `;
    text += `${fmt(100 * s.zeroShare, 0)}% of the crowd scored nothing.`;
    return text;
  },
};
