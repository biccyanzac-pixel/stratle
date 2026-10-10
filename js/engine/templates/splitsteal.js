// Template 7: split or steal, scored against the whole crowd: your payoff is the average over every
// bot as your partner. Split + split share the pot; steal takes it all from a splitter; steal + steal
// get nothing, and optionally a penalty.
//   single:     one partner. Steal pays s·pot − (1−s)·penalty, split pays s·pot/2 (s = share splitting).
//   neighbours: two partners, a pot with each; the penalty hits a stealer only if BOTH partners steal
//               (the YouTube survey's version): steal 2·s·pot − (1−s)²·penalty, split s·pot.
// With no penalty, stealing always wins; a penalty makes it a bet on how trusting the crowd is.

import { pick } from '../rng.js';
import { fmt, pct } from '../format.js';
import { shares, weights } from './choice.js';

const OPTIONS = ['Split', 'Steal'];

function payoffs({ mode, pot, penalty }, s) {
  if (mode === 'neighbours') return [s * pot, 2 * s * pot - (1 - s) ** 2 * penalty];
  return [(s * pot) / 2, s * pot - (1 - s) * penalty];
}

/** The split share above which stealing pays more. */
function breakEven(p) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const [sp, st] = payoffs(p, mid);
    if (st > sp) hi = mid; else lo = mid;
  }
  return hi;
}

export const splitsteal = {
  id: 'splitsteal',
  family: 'splitsteal',
  kind: 'choice',

  sampleParams(rng) {
    const pot = pick(rng, [2, 4, 6, 10, 20, 100]);
    const penalty = Math.round(pot * pick(rng, [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 3]));
    return { mode: rng() < 0.5 ? 'single' : 'neighbours', pot, penalty };
  },

  options: () => OPTIONS,
  grid: () => ({ min: 0, max: 1 }),
  level0: () => weights([0.8, 0.2]), // the naive default is to split
  jokers: () => [0, 1],
  equilibrium: ({ penalty }) => (penalty === 0 ? [1] : null), // with no penalty, stealing dominates

  prompt({ mode, pot, penalty }) {
    const partner = mode === 'neighbours'
      ? `You play against two random members of the crowd, with ${pot} points in the pot with each.`
      : `You play against every member of the crowd in turn (your score is the average), with ${pot} points in each pot.`;
    const pen = !penalty ? 'If you both steal, you both get nothing.'
      : mode === 'neighbours' ? `If you both steal, you both get nothing, and if BOTH your partners steal while you steal, you lose ${penalty} points.`
        : `If you both steal, you both lose ${penalty} points.`;
    return `Split or steal? ${partner} If you both split, you share the pot. If you steal and they split, you take it all. ${pen}`;
  },

  prepare(params, d) {
    const sh = shares(d);
    return { shares: sh, pays: payoffs(params, sh[0]) };
  },

  payoff: (params, { pays }, i) => pays[i],

  reveal: (params, { shares: sh, pays }) => ({ optionShares: sh, optionPayoffs: pays, breakEven: breakEven(params) }),

  explain(p, s) {
    const best = OPTIONS[s.bestAnswers[0]];
    let text = `Today's crowd averaged ${s.depth.toFixed(1)} steps of thinking, and ${pct(s.optionShares[0])} of it split. `;
    text += `Against that crowd, splitting averaged ${fmt(s.optionPayoffs[0], 2)} points and stealing ${fmt(s.optionPayoffs[1], 2)}, so the best move was to ${best.toLowerCase()}. `;
    text += p.penalty
      ? `Stealing only pays when more than ${pct(s.breakEven)} of the crowd splits. `
      : 'With no penalty, stealing always pays at least as much as splitting: the only question is whether you trust yourself to do it. ';
    text += `Level-0 bots split by default; level-1 bots expected that and stole; deeper bots weighed how many thieves the crowd would hold.`;
    return text;
  },
};
