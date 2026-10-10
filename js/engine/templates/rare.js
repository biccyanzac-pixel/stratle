// Template 12: rare number. "Pick a whole number from 1 to 30. The least picked number scores 100, the most
// picked 0, and everything in between by its rank." (Or the reverse: the most popular scores most.)
// Smooth scores across many options; calibrated as the least/most common family.
//
// Level 0 picks by salience: 7 and 3, the ends of the range, round numbers, "random-looking" primes
// (13, 17, 23, 37) and meme numbers (42, 69) are picked more than plain numbers.

import { makeDist } from '../dist.js';
import { pick } from '../rng.js';
import { pct, answerList } from '../format.js';
import { rankPoints } from './choice.js';

const BOOST = { 7: 4, 3: 2, 1: 2, 13: 1.5, 17: 1.5, 23: 1, 37: 1.5, 42: 1.5, 69: 1.5, 11: 0.7, 22: 0.7, 33: 0.7, 77: 0.7, 99: 0.7 };
const SHAPES = {
  least: {
    linear: 'everything in between by its rank',
    half: 'the rarer half scores by rank and the more popular half scores 0',
    quarter: 'only the rarest quarter scores, by rank',
  },
  most: {
    linear: 'everything in between by its rank',
    half: 'the more popular half scores by rank and the rarer half scores 0',
    quarter: 'only the most popular quarter scores, by rank',
  },
};

function salience(n, max) {
  let w = 1 + (BOOST[n] ?? 0);
  if (n === max) w += 2;
  if (n % 10 === 0) w += 1.5; else if (n % 5 === 0) w += 0.5;
  return w;
}

/** Points for each rank position 0..n-1 (0 = best placed): 100 down to 0, cut off by the shape. */
function rankScale(n, shape) {
  const keep = shape === 'quarter' ? Math.max(2, Math.ceil(n / 4)) : shape === 'half' ? Math.max(2, Math.ceil(n / 2)) : n;
  return Array.from({ length: n }, (_, r) => (r < keep ? (100 * (keep - 1 - r)) / Math.max(1, keep - 1) : 0));
}

export const rare = {
  id: 'rare',
  family: (p) => (p.order === 'most' ? 'commonMost' : 'commonLeast'),
  kind: 'number',

  sampleParams(rng) {
    return { max: pick(rng, [10, 15, 20, 25, 30, 40, 50, 60, 75, 100]), order: rng() < 0.8 ? 'least' : 'most', shape: pick(rng, ['linear', 'half', 'quarter']) };
  },

  grid: ({ max }) => ({ min: 1, max }),
  level0: ({ max }) => makeDist(1, max, Array.from({ length: max }, (_, i) => salience(i + 1, max))),
  jokers: ({ max }) => [69, 42, 7, max].filter((v) => v <= max),
  equilibrium: () => null,

  prompt: ({ max, order, shape }) => (order === 'least'
    ? `Pick a whole number from 1 to ${max}. The least picked number scores 100, the most picked scores 0, and ${SHAPES.least[shape]}.`
    : `Pick a whole number from 1 to ${max}. The most picked number scores 100, the least picked scores 0, and ${SHAPES.most[shape]}.`),

  prepare: ({ max, order, shape }, d) => ({ d, pts: rankPoints(d.w, order, rankScale(max, shape)) }),
  payoff: (p, { d, pts }, n) => pts[n - d.min],

  reveal(p, { d }) {
    const t = d.w.reduce((a, b) => a + b, 0);
    const byCount = d.w.map((x, i) => i).sort((a, b) => d.w[b] - d.w[a]);
    return { popular: byCount.slice(0, 3).map((i) => ({ v: d.min + i, share: d.w[i] / t })) };
  },

  explain(p, s) {
    const pop = s.popular.map((x) => `${x.v} (${pct(x.share)})`).join(', ');
    let text = `Today's crowd averaged ${s.depth.toFixed(1)} steps of thinking. The most picked numbers were ${pop}. `;
    text += `The best pick was ${answerList(s.bestAnswers)}. `;
    text += p.order === 'least'
      ? 'Level-0 bots picked numbers that feel random (7, 3, round numbers, the ends); level-1 bots avoided those, and in doing so made the plain-looking numbers they fled to more crowded.'
      : 'Level-0 bots picked numbers that feel random (7, 3, round numbers, the ends); deeper bots piled onto the one they expected to be most popular.';
    return text;
  },
};
