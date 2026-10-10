// Template 5: most / least common choice. "Pick a colour: the least common answer wins" or "the 1st,
// 2nd, 3rd and 4th most common get 8, 5, 3 and 1 points". Ties share their rank positions' points.
//
// Level 0 picks by salience: what people pick when asked for "a number from 1 to 10" or "a colour"
// with no game (hand-set priors from the well-known patterns: 7 dominates 1-10 with 1 and the top number
// as focal end points, blue leads colours, letters follow English frequency, first options get a bonus).
// Calibration fits depth on top.

import { pick } from '../rng.js';
import { fmt, pct } from '../format.js';
import { LETTERS, shares, weights, rankPoints, shareList } from './choice.js';

// 7 is the classic 'random' pick; 1 and the top number are focal end points when people try to coordinate.
const NUMBER_SALIENCE = { 1: 0.14, 2: 0.05, 3: 0.1, 4: 0.07, 5: 0.09, 6: 0.06, 7: 0.24, 8: 0.07, 9: 0.06, 10: 0.12 };
const COLOUR_SALIENCE = { Blue: 0.3, Green: 0.18, Red: 0.16, Purple: 0.14, Orange: 0.08, Yellow: 0.08, Pink: 0.06, Black: 0.05, White: 0.03, Brown: 0.02 };
const LETTER_FREQ = { A: 8.2, B: 1.5, C: 2.8, D: 4.3, E: 12.7, F: 2.2, G: 2.0, H: 6.1, I: 7.0, J: 0.15, K: 0.77, L: 4.0, M: 2.4, N: 6.7, O: 7.5, P: 1.9, Q: 0.1, R: 6.0, S: 6.3, T: 9.1, U: 2.8, V: 1.0, W: 2.4, X: 0.15, Y: 2.0, Z: 0.07 };

export const SCORINGS = [
  { order: 'least', points: [5], text: 'The least common answer scores 5 points.' },
  { order: 'least', points: [8, 5, 3, 1], text: 'The 1st, 2nd, 3rd and 4th least common answers score 8, 5, 3 and 1 points.' },
  { order: 'most', points: [8, 5, 3, 1], text: 'The 1st, 2nd, 3rd and 4th most common answers score 8, 5, 3 and 1 points.' },
  { order: 'most', points: [0, 8, 3], text: 'The most common answer scores 0, the 2nd most common 8 and the 3rd most common 3.' },
  { order: 'least', points: [0, 8, 3], text: 'The least common answer scores 0, the 2nd least common 8 and the 3rd least common 3.' },
];

function salience(set, labels) {
  if (set === 'numbers') return labels.map((l, i) => (i === labels.length - 1 ? Math.max(0.12, NUMBER_SALIENCE[l]) : NUMBER_SALIENCE[l]));
  if (set === 'colours') return labels.map((l) => COLOUR_SALIENCE[l]);
  if (set === 'letters') return labels.map((l) => Math.sqrt(LETTER_FREQ[l]));
  return labels.map((l, i) => 1 / (1 + 0.15 * i)); // A, B, C...: first options get picked more
}

function sampleLabels(rng, set) {
  const take = (pool, n) => {
    const out = [];
    while (out.length < n) {
      const x = pick(rng, pool);
      if (!out.includes(x)) out.push(x);
    }
    return out;
  };
  if (set === 'numbers') return Array.from({ length: 5 + Math.floor(rng() * 6) }, (_, i) => String(i + 1));
  if (set === 'colours') return take(Object.keys(COLOUR_SALIENCE), 4 + Math.floor(rng() * 3));
  if (set === 'letters') return take(LETTERS.split(''), 5 + Math.floor(rng() * 8)).sort();
  return LETTERS.slice(0, 3 + Math.floor(rng() * 3)).split('');
}

export const common = {
  id: 'common',
  // People coordinate on "most common" (they pick the focal answer) but play "least common" almost
  // naively, so the two are calibrated separately.
  family: (p) => (p.order === 'most' ? 'commonMost' : 'commonLeast'),
  kind: 'choice',

  sampleParams(rng) {
    const set = pick(rng, ['numbers', 'colours', 'letters', 'abc']);
    const labels = sampleLabels(rng, set);
    const scoring = pick(rng, SCORINGS.filter((sc) => sc.points.length < labels.length));
    return { set, labels, order: scoring.order, points: scoring.points };
  },

  options: ({ labels }) => labels,
  grid: ({ labels }) => ({ min: 0, max: labels.length - 1 }),
  level0: ({ set, labels }) => weights(salience(set, labels)),
  jokers: ({ labels }) => labels.map((l, i) => i),
  equilibrium: () => null,

  prompt({ labels, order, points }) {
    const sc = SCORINGS.find((x) => x.order === order && x.points.join() === points.join());
    return `Pick one: ${labels.join(', ')}. ${sc ? sc.text : ''}`.trim();
  },

  prepare: ({ order, points }, d) => ({ shares: shares(d), pts: rankPoints(d.w, order, points) }),
  payoff: (params, { pts }, i) => pts[i],
  reveal: (params, { shares: sh, pts }) => ({ optionShares: sh, optionPoints: pts }),

  explain(p, s) {
    const best = s.bestAnswers.map((i) => p.labels[i]);
    const byShare = p.labels.map((l, i) => i).sort((a, b) => s.optionShares[b] - s.optionShares[a]);
    const sorted = byShare.map((i) => p.labels[i]);
    let text = `Today's crowd averaged ${s.depth.toFixed(1)} steps of thinking. The crowd split ${shareList(sorted, byShare.map((i) => s.optionShares[i]))}. `;
    text += `The best pick was ${best.join(' or ')}, worth ${fmt(s.bestPayoff)} point${s.bestPayoff === 1 ? '' : 's'}. `;
    text += p.order === 'least'
      ? `Level-0 bots picked what first came to mind (${p.labels[byShare[0]]} took ${pct(s.optionShares[byShare[0]])}); level-1 bots ran from it, and deeper bots ran from them.`
      : p.points[0] >= Math.max(...p.points)
        ? `Level-0 bots picked what first came to mind; deeper bots piled onto the answer they expected to be popular.`
        : `Level-0 bots picked what first came to mind; deeper bots aimed for second place, just behind the answer they expected to be popular.`;
    return text;
  },
};
