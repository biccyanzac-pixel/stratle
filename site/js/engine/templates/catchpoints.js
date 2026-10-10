// Template 6: points with a catch. "Pick 1, 3, 5 or 8 points. The most common choice gets 0 instead."
// Variant: "the least common choice gets a bonus". Level 0 takes the points at face value.

import { pick } from '../rng.js';
import { fmt, pct } from '../format.js';
import { shares, weights } from './choice.js';

const VALUE_SETS = [
  [1, 3, 5, 8], [0, 1, 3, 5], [2, 4, 6, 10], [1, 2, 4, 7], [1, 3, 6, 10], [2, 3, 5, 8], [1, 4, 6, 9],
  [1, 2, 3, 5, 8], [0, 2, 4, 6], [3, 5, 7, 9], [1, 5, 10], [2, 5, 9, 12], [1, 3, 4, 6, 10], [0, 3, 5, 8],
];

const label = (v) => `${v} point${v === 1 ? '' : 's'}`;

export const catchpoints = {
  id: 'catch',
  family: 'catch',
  kind: 'choice',

  sampleParams(rng) {
    const values = pick(rng, VALUE_SETS);
    return rng() < 0.6 ? { values, rule: 'mostZero' } : { values, rule: 'leastBonus', bonus: pick(rng, [3, 4, 5, 6]) };
  },

  options: ({ values }) => values.map(label),
  grid: ({ values }) => ({ min: 0, max: values.length - 1 }),
  // Face value: most naive players grab the biggest number.
  level0: ({ values }) => weights(values.map((v, i) => (i === values.length - 1 ? 4 : 0) + v / values[values.length - 1] + 0.1)),
  jokers: ({ values }) => values.map((v, i) => i),
  equilibrium: () => null,

  prompt: ({ values, rule, bonus }) => `Pick how many points you want: ${values.map(label).join(', ')}. ${rule === 'mostZero'
    ? 'Catch: the most common choice gets 0 instead.'
    : `Bonus: the least common choice gets ${bonus} extra points.`}`,

  // Every option tied for most (or least) common gets the catch (or the bonus).
  prepare({ values, rule, bonus }, d) {
    const extreme = rule === 'mostZero' ? Math.max(...d.w) : Math.min(...d.w);
    const flag = d.w.map((x) => (Math.abs(x - extreme) <= 1e-12 * Math.max(1, extreme) ? 1 : 0));
    return { shares: shares(d), flag, values, rule, bonus };
  },

  payoff(params, { flag, values, rule, bonus }, i) {
    return rule === 'mostZero' ? values[i] * (1 - flag[i]) : values[i] + bonus * flag[i];
  },

  reveal: (params, { shares: sh, flag }) => ({ optionShares: sh, flagged: flag }),

  explain(p, s) {
    const top = p.values.map((v, i) => i).sort((a, b) => s.optionShares[b] - s.optionShares[a]);
    const best = s.bestAnswers.map((i) => label(p.values[i]));
    let text = `Today's crowd averaged ${s.depth.toFixed(1)} steps of thinking. `;
    text += `${label(p.values[top[0]])} was the most common choice (${pct(s.optionShares[top[0]])})`;
    text += p.rule === 'mostZero' ? ', so it paid nothing. ' : `, and ${label(p.values[top[top.length - 1]])} the least common (${pct(s.optionShares[top[top.length - 1]])}). `;
    text += `The best choice was ${best.join(' or ')}, worth ${fmt(s.bestPayoff)}. `;
    text += `Level-0 bots took the biggest number at face value; level-1 bots saw the ${p.rule === 'mostZero' ? 'catch coming and stepped down' : 'bonus and hunted for the empty option'}; deeper bots second-guessed them.`;
    return text;
  },
};
