// Template 3: under-the-average bid. "Bid 1–20. You win your bid, but only if it is below the
// crowd's average bid (or below 4/5 of it, or below its median bid)." The line is kept as an exact
// fraction N/D.

import { makeDist, totalOf, sumOf, quantile } from '../dist.js';
import { pick } from '../rng.js';
import { fmt, fraction, answerList } from '../format.js';

const FACTORS = [[1, 1], [9, 10], [4, 5], [3, 4], [2, 3]];

const statWord = (stat) => (stat === 'median' ? 'median' : 'average');
const lineText = (c, stat) => (c[0] === c[1] ? `the crowd's ${statWord(stat)} bid` : `${fraction(c)} of the crowd's ${statWord(stat)} bid`);

export const underbid = {
  id: 'underbid',
  family: 'underbid',
  kind: 'number',

  // Small ranges (1-10, 1-15) collapsed to "bid 1 or 2" too often, so bids now go up to 20-100, and two
  // days in three have a soft line: over it you lose `over` points per 1 you are over, instead of everything.
  sampleParams(rng) {
    const p = { max: pick(rng, [20, 30, 50, 100]), c: pick(rng, FACTORS), stat: rng() < 0.75 ? 'mean' : 'median' };
    if (rng() < 2 / 3) p.over = pick(rng, [2, 3, 5]);
    return p;
  },

  grid: ({ max }) => ({ min: 1, max }),

  // Naive bidders take points at face value: half bid at random, half lean towards big bids.
  level0({ max }) {
    const w = [];
    for (let v = 1; v <= max; v++) w.push(0.5 / max + (0.5 * v) / ((max * (max + 1)) / 2));
    return makeDist(1, max, w);
  },

  jokers: ({ max }) => [max, 7, Math.min(max, 13), Math.round(max / 2)],
  equilibrium: () => [1], // undercutting all the way down: the safest bid

  prompt: ({ max, c, stat, over }) => (over
    ? `Bid a whole number from 1 to ${max}. Below ${lineText(c, stat)} you win your bid in points. At or above that line, you win your bid minus ${over} points for every 1 you are over (never below 0).`
    : `Bid a whole number from 1 to ${max}. You win your bid in points, but only if it is below ${lineText(c, stat)}.`),

  prepare({ c, stat }, d) {
    const total = totalOf(d), sum = sumOf(d);
    const [N, D] = stat === 'median' ? [c[0] * quantile(d, 0.5), c[1]] : [c[0] * sum, c[1] * total];
    return { N, D, mean: sum / total, line: N / D, tol: 1e-9 * N };
  },

  payoff({ over }, { N, D, tol, line }, bid) {
    if (bid * D < N - tol) return bid;
    return over ? Math.max(0, bid - over * (bid - line)) : 0;
  },

  reveal: (params, ctx) => ({ line: ctx.line }),

  explain(p, s) {
    const best = s.bestAnswers.length ? Math.max(...s.bestAnswers) : null;
    const chain = s.levelBest.slice(1).map((ans, i) => (ans ? `level ${i + 1} bid ${answerList(ans)}` : null)).filter(Boolean);
    const word = statWord(p.stat);
    const statValue = p.stat === 'median' ? s.median : s.mean;
    let text = `Today's crowd averaged ${s.depth.toFixed(1)} steps of thinking and its ${word} bid was ${fmt(statValue, 2)}`;
    text += p.c[0] === p.c[1] ? '. ' : `, so the line (${fraction(p.c)} of it) was ${fmt(s.line, 2)}. `;
    if (p.over) {
      text += `The best bid was ${answerList(s.bestAnswers)}: just under the line keeps the whole bid, while going over costs ${p.over} points for every 1 over. `;
    } else {
      text += best && s.bestPayoff > 0
        ? `The highest bid under the line was ${best}, so that was the best answer; every bid of ${best + 1} or more scored nothing. `
        : 'No bid was under the line today, so nobody could score. ';
    }
    text += `Level-0 bots took the points at face value and bid high; ${chain.join(', ')}. `;
    text += p.over ? `${fmt(100 * s.zeroShare, 0)}% of the crowd went so far over that it scored nothing.` : `${fmt(100 * s.zeroShare, 0)}% of the crowd bid too high and scored nothing.`;
    return text;
  },
};
