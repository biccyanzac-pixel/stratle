// Template 11: crowded points. "Pick how many points you want, 1 to 20. You get them, unless more than 8% of
// the crowd picked the same number" (or: "the 2 most popular numbers score 0"). A numeric version of points
// with a catch, calibrated as that family.

import { makeDist, totalOf } from '../dist.js';
import { pick } from '../rng.js';
import { pct, answerList } from '../format.js';

export const crowdpoints = {
  id: 'crowdpoints',
  family: 'catch',
  kind: 'number',

  sampleParams(rng) {
    const max = pick(rng, [10, 12, 15, 20, 25, 30, 40, 50]);
    // The cap is 0.8-2 × an even share (100 / max %), so some numbers can stay under it.
    const cap = Math.round((2 * pick(rng, [0.8, 1, 1.25, 1.5, 2]) * 100) / max) / 2;
    return rng() < 0.65 ? { max, rule: 'cap', cap } : { max, rule: 'top', k: pick(rng, [1, 2, 3]) };
  },

  grid: ({ max }) => ({ min: 1, max }),

  // Face value: most naive players grab the biggest number.
  level0({ max }) {
    const w = [];
    for (let v = 1; v <= max; v++) w.push((v === max ? 4 : 0) + v / max + 0.1);
    return makeDist(1, max, w);
  },

  jokers: ({ max }) => [max, 1, Math.min(max, 7), Math.round(max / 2)],
  equilibrium: () => null,

  prompt: (p) => (p.rule === 'cap'
    ? `Pick how many points you want, from 1 to ${p.max}. You get them, unless more than ${p.cap}% of the crowd picked the same number: then you get 0.`
    : `Pick how many points you want, from 1 to ${p.max}. You get them, unless your number is one of the ${p.k === 1 ? 'most popular number' : `${p.k} most popular numbers`}: ${p.k === 1 ? 'it scores' : 'they score'} 0.`),

  prepare(p, d) {
    const t = totalOf(d);
    const share = d.w.map((x) => x / t);
    let zero;
    if (p.rule === 'cap') {
      zero = share.map((x) => 100 * x > p.cap + 1e-9);
    } else {
      // The k most popular numbers, and anything tied with the k-th.
      const kth = [...share].sort((a, b) => b - a)[p.k - 1];
      zero = share.map((x) => x >= kth - 1e-12);
    }
    return { d, share, zero };
  },

  payoff: (p, { d, zero }, n) => (zero[n - d.min] ? 0 : n),

  reveal(p, { d, share, zero }) {
    const crowded = zero.map((z, i) => (z ? d.min + i : null)).filter((v) => v !== null);
    return { crowded, crowdedShare: crowded.reduce((a, v) => a + share[v - d.min], 0) };
  },

  explain(p, s) {
    const top = s.crowded.length ? answerList(s.crowded).replace(/ or (?=[^ ]+$)/, ' and ') : 'nothing';
    let text = `Today's crowd averaged ${s.depth.toFixed(1)} steps of thinking. `;
    text += p.rule === 'cap'
      ? `More than ${p.cap}% of the crowd piled onto ${top}, so ${s.crowded.length === 1 ? 'it' : 'those'} paid 0. `
      : `The most popular ${p.k === 1 ? 'number was' : 'numbers were'} ${top}, so ${p.k === 1 ? 'it' : 'they'} paid 0. `;
    text += `The best pick was ${answerList(s.bestAnswers)}: the biggest number that stayed uncrowded. `;
    text += `Level-0 bots grabbed the maximum at face value; deeper bots stepped down to dodge them, and crowded the numbers just below. `;
    text += `${pct(s.crowdedShare)} of the crowd picked a crowded number and scored 0.`;
    return text;
  },
};

