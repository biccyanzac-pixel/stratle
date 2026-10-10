// Template 10: lowball. "Pick a whole number from 1 to 50. You get that many points, but only if your number
// is among the lowest 25% of the crowd's numbers." A percentile line instead of the bid game's average line,
// so a few huge jokers cannot drag it up. Calibrated as the bid family. Optional soft line: above it you
// lose `over` points for every 1 you are above it.

import { makeDist, quantile } from '../dist.js';
import { pick } from '../rng.js';
import { fmt, answerList } from '../format.js';

export const lowball = {
  id: 'lowball',
  family: 'underbid',
  kind: 'number',

  sampleParams(rng) {
    const p = { max: pick(rng, [20, 30, 50, 100]), share: pick(rng, [20, 25, 30, 40, 50]) };
    if (rng() < 0.5) p.over = pick(rng, [2, 3]);
    return p;
  },

  grid: ({ max }) => ({ min: 1, max }),

  // Face value: half at random, half leaning towards the big numbers.
  level0({ max }) {
    const w = [];
    for (let v = 1; v <= max; v++) w.push(0.5 / max + (0.5 * v) / ((max * (max + 1)) / 2));
    return makeDist(1, max, w);
  },

  jokers: ({ max }) => [max, Math.min(max, 7), Math.round(max / 2)],
  equilibrium: () => [1],

  prompt: ({ max, share, over }) => (over
    ? `Pick a whole number from 1 to ${max}. If it is among the lowest ${share}% of the crowd's numbers, you get that many points. If not, you get it minus ${over} points for every 1 you are above the line (never below 0).`
    : `Pick a whole number from 1 to ${max}. You get that many points, but only if your number is among the lowest ${share}% of the crowd's numbers.`),

  // The line: the crowd's share-th percentile. You are "among the lowest share%" if fewer than share% of the
  // crowd picked a number below yours and your number is below the line, i.e. strictly under the percentile.
  prepare: ({ share }, d) => ({ line: quantile(d, share / 100) }),

  payoff({ over }, { line }, n) {
    if (n < line) return n;
    return over ? Math.max(0, n - over * (n - line + 1)) : 0;
  },

  reveal: (p, { line }) => ({ line }),

  explain(p, s) {
    const chain = s.levelBest.slice(1).map((ans, i) => (ans ? `level ${i + 1} picked ${answerList(ans)}` : null)).filter(Boolean);
    let text = `Today's crowd averaged ${s.depth.toFixed(1)} steps of thinking. The lowest ${p.share}% of its numbers ran up to ${s.line - 1}, so the line was ${s.line}. `;
    text += `The best pick was ${answerList(s.bestAnswers)}: the biggest number still under the line${p.over ? `, since going over cost ${p.over} points for every 1` : ''}. `;
    text += `Level-0 bots grabbed big numbers; ${chain.join(', ')}. `;
    text += `${fmt(100 * s.zeroShare, 0)}% of the crowd scored nothing.`;
    return text;
  },
};
