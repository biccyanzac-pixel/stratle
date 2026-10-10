// Template 1: target the crowd. "Pick a number closest to 2/3 of the average." The crowd statistic can be
// the average, the median, the average of the middle half (jokers barely move it) or of the top half.
// Payoff: the share of the crowd you are closer to the target than (ties count half), less a tiny
// distance term, so the best answer is always the whole number nearest the target. With integer bot counts the target is
// kept as an exact fraction N/D, so equal distances are detected exactly.

import { uniform, totalOf, sumOf, quantile, partialMean } from '../dist.js';
import { pick } from '../rng.js';
import { fmt, fraction, answerList } from '../format.js';

// Rules whose reasoning chain runs to the edge of the range (1.5 × or 5/4 × the average, the average
// minus 10) were trivial too often, so every rule here has its end point inside the range or near 0.
// b is in % of the range.
const RULES = [
  { a: [2, 3], b: 0 }, { a: [1, 2], b: 0 }, { a: [3, 4], b: 0 }, { a: [4, 5], b: 0 }, { a: [3, 5], b: 0 },
  { a: [2, 3], b: 10 }, { a: [1, 3], b: 10 }, { a: [1, 2], b: 20 }, { a: [3, 4], b: 10 }, { a: [4, 5], b: 15 },
  { a: [1, 1], b: 5 }, { a: [1, 1], b: -5 }, { a: [6, 5], b: -5 },
];
const STATS = [['mean', 0.45], ['median', 0.2], ['trimmed', 0.2], ['upper', 0.15]];

const STAT_WORD = { mean: 'average', median: 'median', trimmed: 'middle-half average', upper: 'top-half average' };
const STAT_PHRASE = {
  mean: "the average of everyone's numbers",
  median: "the median of everyone's numbers",
  trimmed: "the average of the middle half of everyone's numbers (the lowest and highest quarters are ignored)",
  upper: "the average of the top half of everyone's numbers",
};

/** Short form for the reveal: "2/3 of the average plus 10". */
export function ruleText({ stat = 'mean', a, b }) {
  const word = STAT_WORD[stat];
  const head = a[0] === a[1] ? `the ${word}` : a[0] < a[1] ? `${fraction(a)} of the ${word}` : `${fraction(a)} × the ${word}`;
  if (!b) return head;
  return `${head} ${b > 0 ? 'plus' : 'minus'} ${Math.abs(b)}`;
}

function promptRule({ stat = 'mean', a, b }) {
  const phrase = STAT_PHRASE[stat];
  const head = a[0] === a[1] ? phrase : a[0] < a[1] ? `${fraction(a)} of ${phrase}` : `${fraction(a)} × ${phrase}`;
  return b ? `${head}, ${b > 0 ? 'plus' : 'minus'} ${Math.abs(b)}` : head;
}

/** The crowd statistic the rule is applied to. */
export function statOf(stat, d) {
  if (stat === 'median') return quantile(d, 0.5);
  if (stat === 'trimmed') return partialMean(d, 0.25, 0.75);
  if (stat === 'upper') return partialMean(d, 0.5, 1);
  return sumOf(d) / totalOf(d);
}

/**
 * Where perfectly logical players end up: follow the reasoning chain x -> rule(x) from 50 (the naive
 * average) to its limit, then take the whole numbers next to it that win when everyone says them
 * (v is a closest whole number to rule(v)). In the 2/3 game that is 0 and 1; in "1.5 × the average"
 * it is 100 (0 also wins if everyone says it, but no chain of reasoning leads there).
 * Null when every number qualifies (the rule is just "the average").
 */
function equilibrium({ a, b, range }) {
  if (a[0] === a[1] && !b) return null;
  const rule = (x) => Math.min(range, Math.max(0, (a[0] * x) / a[1] + b));
  let x = range / 2;
  for (let i = 0; i < 2000; i++) x = rule(x);
  const out = [];
  for (let v = Math.max(0, Math.floor(x) - 1); v <= Math.min(range, Math.ceil(x) + 1); v++) {
    if (Math.abs(v - rule(v)) <= 0.5 + 1e-9) out.push(v);
  }
  return out;
}

export const target = {
  id: 'target',
  // Rules that unravel upwards ("average + 5", "1.5 × the median") are played differently from the
  // classic downward ones (people think fewer steps), so they are calibrated as their own family.
  family(p) {
    const eq = equilibrium(p);
    return eq && eq[0] > p.range / 2 ? 'beautyUp' : 'beauty';
  },
  kind: 'number',

  sampleParams(rng) {
    const r = rng();
    const range = r < 0.5 ? 100 : r < 0.7 ? 200 : r < 0.85 ? 500 : 1000;
    let u = rng(), stat = 'mean';
    for (const [name, w] of STATS) { if (u < w) { stat = name; break; } u -= w; }
    const rule = pick(rng, RULES);
    return { range, stat, a: rule.a, b: (rule.b * range) / 100 };
  },

  grid: ({ range }) => ({ min: 0, max: range }),
  level0: ({ range }) => uniform(0, range),
  jokers: ({ range }) => (range === 1000 ? [0, 1000, 69, 420, 500, 666] : [0, range, 69, 42, range / 2]),
  // Theorists play these: the 0/1 spike in every real 2/3 game, the 100 spike in "average + 5".
  equilibrium,

  prompt: (p) => `Pick a whole number from 0 to ${p.range}. The best answer is the one closest to ${promptRule(p)}. You score by how many of the crowd you are closer than.`,

  prepare({ stat, a, b, range }, d) {
    const total = totalOf(d);
    let N, D;
    if (stat === 'mean' || !stat) {
      // Exact with integer counts: no division until the end.
      N = a[0] * sumOf(d) + b * a[1] * total;
      D = a[1] * total;
    } else {
      N = a[0] * statOf(stat, d) + b * a[1];
      D = a[1];
    }
    N = Math.min(range * D, Math.max(0, N));
    const occupied = [];
    d.w.forEach((x, i) => { if (x) occupied.push(i); });
    return { d, occupied, total, N, D, target: N / D, tol: 1e-9 * D };
  },

  payoff(params, { d, occupied, total, N, D, tol }, answer) {
    const mine = Math.abs(answer * D - N);
    let farther = 0, ties = 0;
    for (const i of occupied) {
      const gap = Math.abs((d.min + i) * D - N) - mine;
      if (gap > tol) farther += d.w[i];
      else if (gap >= -tol) ties += d.w[i];
    }
    // The tiny closeness term only breaks ties: with nobody between two answers, the nearer one wins.
    return (farther + ties / 2) / total - (1e-6 * mine) / (D * params.range);
  },

  reveal: (params, ctx, d) => ({ target: ctx.target, statValue: statOf(params.stat, d) }),

  explain(p, s) {
    const statWord = STAT_WORD[p.stat ?? 'mean'];
    const statValue = s.statValue;
    const chain = s.levelBest.slice(1).map((ans, i) => (ans ? `level ${i + 1} went for ${answerList(ans)}` : null)).filter(Boolean);
    const eq = equilibrium(p);
    const deep = s.levelShares.slice(3).reduce((x, y) => x + y, 0);
    let text = `Today's crowd averaged ${s.depth.toFixed(1)} steps of thinking, so the crowd's ${statWord} was ${fmt(statValue)} and the target (${ruleText(p)}) was ${fmt(s.target)}. The best number was ${answerList(s.bestAnswers)}. `;
    text += `Level-0 bots picked at random; ${chain.join(', ')}. `;
    if (eq !== null && s.bestAnswers.some((v) => eq.includes(v))) {
      text += `This time the logic ran all the way: the crowd went far enough that the end point, ${answerList(eq)}, was also the best answer.`;
    } else if (eq !== null) {
      text += `Perfectly logical players would all end up at ${answerList(eq)}, but only ${fmt(100 * deep, 0)}% of the crowd thought three or more steps ahead, so the winner was at ${answerList(s.bestAnswers)} instead.`;
    }
    return text.trim();
  },
};
