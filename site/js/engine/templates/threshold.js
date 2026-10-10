// Template 4: threshold options. "A: 10 points if under 20% of the crowd picks it. B: 8 points if
// under 25% ... E: 2 points, always." An option pays only if fewer than its cap pick it.

import { pick } from '../rng.js';
import { pct, fmt } from '../format.js';
import { LETTERS, shares, weights } from './choice.js';

const CAPS = [10, 15, 20, 25, 30, 35, 40, 50, 60];

function optionText({ points, cap }) {
  return cap >= 100 ? `${points} points, always` : `${points} points if under ${fmt(cap)}% of the crowd picks it`;
}

export const threshold = {
  id: 'threshold',
  family: 'threshold',
  kind: 'choice',

  // 3-5 capped options plus one safe option; tighter caps pay more (points ≈ scale × 100 / cap).
  sampleParams(rng) {
    const n = 3 + Math.floor(rng() * 3);
    const caps = [];
    while (caps.length < n) {
      const c = pick(rng, CAPS);
      if (!caps.includes(c)) caps.push(c);
    }
    caps.sort((a, b) => a - b);
    const scale = pick(rng, [1, 1.5, 2]);
    const safe = pick(rng, [1, 2, 3]);
    const options = caps.map((cap) => ({ points: Math.max(safe + 1, Math.round((scale * 100) / cap)), cap }));
    options.push({ points: safe, cap: 100 });
    return { options };
  },

  options: ({ options }) => options.map((o, i) => `${LETTERS[i]}: ${optionText(o)}`),
  grid: ({ options }) => ({ min: 0, max: options.length - 1 }),
  // Naive players are drawn to the bigger numbers.
  level0: ({ options }) => weights(options.map((o) => o.points)),
  jokers: ({ options }) => options.map((o, i) => i),
  equilibrium: () => null,

  prompt: ({ options }) => `Pick one option. Each pays its points only if fewer than its cap of the crowd pick it.\n${options.map((o, i) => `${LETTERS[i]}: ${optionText(o)}`).join('\n')}`,

  prepare: (params, d) => ({ shares: shares(d) }),

  payoff({ options }, { shares: sh }, i) {
    const o = options[i];
    return o.cap >= 100 || 100 * sh[i] < o.cap - 1e-9 ? o.points : 0;
  },

  reveal({ options }, { shares: sh }) {
    return { optionShares: sh, paid: options.map((o, i) => o.cap >= 100 || 100 * sh[i] < o.cap - 1e-9) };
  },

  explain(p, s) {
    const lines = p.options.map((o, i) => (o.cap >= 100
      ? `${LETTERS[i]} (safe) took ${pct(s.optionShares[i])}`
      : `${LETTERS[i]} drew ${pct(s.optionShares[i])} against a ${fmt(o.cap)}% cap, so it ${s.paid[i] ? `paid ${o.points}` : 'paid nothing'}`));
    const best = s.bestAnswers.map((i) => LETTERS[i]);
    let text = `Today's crowd averaged ${s.depth.toFixed(1)} steps of thinking. ${lines.join('; ')}. `;
    text += `The best pick was ${best.join(' or ')}, worth ${fmt(s.bestPayoff)} points. `;
    text += `Level-0 bots chased the biggest numbers; deeper bots expected that crowding and spread into the options they thought would stay under their caps. `;
    text += `${fmt(100 * s.zeroShare, 0)}% of the crowd picked an option that paid nothing.`;
    return text;
  },
};

