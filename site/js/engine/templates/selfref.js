// Template 8: self-referential prediction. "Will more of today's crowd answer NO to this question than
// YES? And what % will answer NO?" A YES is right when NO is the majority, so a right vote means being
// in the minority. The vote pays `bonus` points if right; the % guess pays up to 100 − bonus, falling
// to 0 at `width` points off. One answer encodes both: a = vote × 101 + guess (vote 0 = YES, 1 = NO).

import { pick } from '../rng.js';
import { makeDist, totalOf } from '../dist.js';
import { fmt, pct } from '../format.js';

export const encode = (vote, guess) => vote * 101 + guess;
export const decode = (a) => ({ vote: a >= 101 ? 1 : 0, guess: a % 101 });
const VOTES = ['YES', 'NO'];

/** Share of the crowd voting NO. */
function noShare(d) {
  let no = 0;
  d.w.forEach((x, i) => { if (d.min + i >= 101) no += x; });
  return no / totalOf(d);
}

export const selfref = {
  id: 'selfref',
  family: 'selfref',
  kind: 'number',

  sampleParams(rng) {
    return { bonus: pick(rng, [30, 40, 50, 60, 70]), width: pick(rng, [10, 15, 20, 25, 30]), focus: pick(rng, ['NO', 'YES']) };
  },

  grid: () => ({ min: 0, max: 201 }),
  label: (params, a) => `${VOTES[decode(a).vote]}, ${decode(a).guess}%`,

  // Naive: 60% vote YES (the surface reading of the question), guesses round 50.
  level0() {
    const w = new Array(202).fill(0);
    for (let g = 0; g <= 100; g++) {
      const k = Math.exp(-((g - 50) ** 2) / (2 * 20 * 20));
      w[encode(0, g)] = 0.6 * k;
      w[encode(1, g)] = 0.4 * k;
    }
    return makeDist(0, 201, w);
  },

  // Votes flip with probability min(0.5, 2·noise); guesses spread as a Gaussian (sd = noise × 100).
  noisy(params, answers, noise, exact = 0) {
    const w = new Array(202).fill(0);
    const flip = Math.min(0.5, 2 * noise);
    const sd = Math.max(0.5, noise * 100);
    for (const a of answers) {
      const { vote, guess } = decode(a);
      const k = [];
      let s = 0;
      for (let g = 0; g <= 100; g++) { const x = Math.exp(-((g - guess) ** 2) / (2 * sd * sd)); k.push(x); s += x; }
      for (const [v, pv] of [[vote, 1 - flip], [1 - vote, flip]]) {
        w[encode(v, guess)] += (pv * exact) / answers.length;
        for (let g = 0; g <= 100; g++) w[encode(v, g)] += (pv * (1 - exact) * k[g]) / s / answers.length;
      }
    }
    return makeDist(0, 201, w);
  },

  jokers: () => [encode(1, 69), encode(0, 100), encode(1, 0), encode(0, 50), encode(1, 50)],
  equilibrium: () => null,

  prompt: ({ bonus, width, focus }) => `Will more of today's crowd answer NO to this question than YES? Answer YES or NO (${bonus} points if you're right), then guess what % of the crowd answers ${focus} (up to ${100 - bonus} points, falling to 0 at ${width} points off).`,

  prepare(params, d) {
    const no = noShare(d);
    return { no, actual: 100 * (params.focus === 'NO' ? no : 1 - no) };
  },

  payoff({ bonus, width }, { no, actual }, a) {
    const { vote, guess } = decode(a);
    const right = vote === 0 ? no > 0.5 + 1e-9 : no < 0.5 - 1e-9;
    return (right ? bonus : 0) + (100 - bonus) * Math.max(0, 1 - Math.abs(guess - actual) / width);
  },

  reveal: (params, { no, actual }) => ({ noShare: no, actual }),

  explain(p, s) {
    const best = s.bestAnswers.map((a) => selfref.label(p, a));
    const majority = s.noShare > 0.5 ? 'NO' : s.noShare < 0.5 ? 'YES' : 'neither';
    let text = `Today's crowd averaged ${s.depth.toFixed(1)} steps of thinking, and ${pct(s.noShare)} of it answered NO. `;
    text += majority === 'neither' ? 'It was an exact tie, so no vote was right. '
      : `So ${majority} was the majority, and the right answer was ${majority === 'NO' ? 'YES' : 'NO'}: the minority wins this one. `;
    text += `The exact share answering ${p.focus} was ${fmt(s.actual)}%, so the best answers were ${best.slice(0, 3).join(' or ')}. `;
    text += `Level-0 bots took the question at face value; level-1 bots joined the side they expected to be the minority, and in doing so changed which side that was.`;
    return text;
  },
};
