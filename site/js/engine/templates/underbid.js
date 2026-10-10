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

  sampleParams(rng) {
    return { max: pick(rng, [10, 12, 15, 20, 25, 30]), c: pick(rng, FACTORS), stat: rng() < 0.75 ? 'mean' : 'median' };
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

  prompt: ({ max, c, stat }) => `Bid a whole number from 1 to ${max}. You win your bid in points, but only if it is below ${lineText(c, stat)}.`,

  prepare({ c, stat }, d) {
    const total = totalOf(d), sum = sumOf(d);
    const [N, D] = stat === 'median' ? [c[0] * quantile(d, 0.5), c[1]] : [c[0] * sum, c[1] * total];
    return { N, D, mean: sum / total, line: N / D, tol: 1e-9 * N };
  },

  payoff(params, { N, D, tol }, bid) {
    return bid * D < N - tol ? bid : 0;
  },

  reveal: (params, ctx) => ({ line: ctx.line }),

  explain(p, s) {
    const best = s.bestAnswers.length ? Math.max(...s.bestAnswers) : null;
    const chain = s.levelBest.slice(1).map((ans, i) => (ans ? `level ${i + 1} bid ${answerList(ans)}` : null)).filter(Boolean);
    const word = statWord(p.stat);
    const statValue = p.stat === 'median' ? s.median : s.mean;
    let text = `Today's crowd averaged ${s.depth.toFixed(1)} steps of thinking and its ${word} bid was ${fmt(statValue, 2)}`;
    text += p.c[0] === p.c[1] ? '. ' : `, so the line (${fraction(p.c)} of it) was ${fmt(s.line, 2)}. `;
    text += best && s.bestPayoff > 0
      ? `The highest bid under the line was ${best}, so that was the best answer; every bid of ${best + 1} or more scored nothing. `
      : 'No bid was under the line today, so nobody could score. ';
    text += `Level-0 bots took the points at face value and bid high; ${chain.join(', ')}. `;
    text += `${fmt(100 * s.zeroShare, 0)}% of the crowd bid too high and scored nothing.`;
    return text;
  },
};
