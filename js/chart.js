// The reveal chart: how the crowd answered (bars), what every answer would have scored (a shaded strip
// under the axis, darker = more points, or points under each option), your answer and the best answer.
import { TEMPLATES } from './engine/templates/index.js';
import { decodeCrowd } from './engine/question.js';
import { decode, encode } from './engine/templates/selfref.js';

const NS = 'http://www.w3.org/2000/svg';
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function answerLabel(q, a) {
  const tpl = TEMPLATES[q.template];
  if (tpl.label) return tpl.label(q.params, a);
  if (tpl.options) return tpl.options(q.params)[a];
  return String(a);
}

export function shortLabel(q, a) {
  if (q.template === 'threshold') return 'ABCDEF'[a];
  if (q.template === 'catch') return String(q.params.values[a]);
  return answerLabel(q, a);
}

/** Bins for the bars: [{ x0, x1, n, pts (mean points of the answers in the bin), label? }]. */
function binsFor(q, s, curve, answer) {
  const { all } = decodeCrowd(q);
  const tpl = TEMPLATES[q.template];
  const ptsAt = (v) => curve.scores[v - curve.min];
  if (tpl.kind === 'choice') {
    return { bars: all.w.map((n, i) => ({ x0: i, x1: i + 1, n, pts: ptsAt(i), label: shortLabel(q, i) })), xOf: (v) => v + 0.5, choice: true };
  }
  if (q.template === 'selfref') {
    // Bars: the % guesses (both votes). Strip: points for each guess with the right vote.
    const vote = s.noShare > 0.5 ? 0 : 1;
    const g = new Array(101).fill(0);
    all.w.forEach((n, i) => { g[decode(i).guess] += n; });
    return { bars: g.map((n, v) => ({ x0: v, x1: v + 1, n, pts: ptsAt(encode(vote, v)) })), xOf: (v) => decode(v).guess + 0.5, ticks: [0, 25, 50, 75, 100], suffix: '%' };
  }
  let lo = all.min, hi = all.max;
  if (q.template === 'tank') {
    // Zoom to where the crowd is (1st..99th percentile), keeping N and your answer in view.
    let c = 0;
    const cum = all.w.map((x) => (c += x) / s.size);
    lo = all.min + cum.findIndex((x) => x >= 0.01);
    hi = all.min + cum.findIndex((x) => x >= 0.99);
    for (const v of [q.params.N, answer]) if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const pad = Math.max(5, Math.round((hi - lo) * 0.05));
    lo = Math.max(all.min, lo - pad); hi = Math.min(all.max, hi + pad);
  }
  const span = hi - lo + 1, nb = Math.min(span, 70), width = span / nb;
  const bars = Array.from({ length: nb }, (_, b) => ({ x0: lo + b * width, x1: lo + (b + 1) * width, n: 0, ptsSum: 0, k: 0 }));
  for (let v = lo; v <= hi; v++) {
    const b = bars[Math.min(nb - 1, Math.floor((v - lo) / width))];
    b.n += all.w[v - all.min];
    b.ptsSum += ptsAt(v); b.k++;
  }
  for (const b of bars) b.pts = b.k ? b.ptsSum / b.k : 0;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(lo + f * (hi - lo)));
  return { bars, xOf: (v) => v + 0.5, ticks };
}

export function crowdChart({ q, summary: s, curve, answer, width }) {
  const { bars, xOf, ticks, choice, suffix = '' } = binsFor(q, s, curve, answer);
  const W = Math.max(280, Math.min(640, width)), H = W < 460 ? 190 : 220;
  const pad = { l: 6, r: 6, t: 30, b: choice ? 46 : 40 };
  const stripY = H - pad.b + 4, stripH = 8;
  const x0 = bars[0].x0, x1 = bars[bars.length - 1].x1;
  const X = (v) => pad.l + ((v - x0) / (x1 - x0)) * (W - pad.l - pad.r);
  const top = Math.max(1, ...bars.map((b) => b.n));
  const Y = (n) => H - pad.b - (n / top) * (H - pad.t - pad.b);
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'chart');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'How the crowd answered, and the points each answer would have scored');
  const add = (tag, attrs, text, parent = svg) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text != null) e.textContent = text;
    parent.append(e);
    return e;
  };
  const accent = css('--accent'), surface = css('--surface'), muted = css('--muted');
  const gap = bars.length > 40 ? 0.6 : 2;
  for (const b of bars) {
    const bx = X(b.x0) + gap / 2, bw = Math.max(1, X(b.x1) - X(b.x0) - gap);
    const g = add('g', {});
    const range = choice || b.x1 - b.x0 <= 1.5 ? `${b.label ?? Math.round(b.x0)}${suffix}` : `${Math.round(b.x0)}–${Math.ceil(b.x1) - 1}${suffix}`;
    add('title', {}, `${range}: ${((100 * b.n) / s.size).toFixed(1)}% of the crowd · scores ${Math.round(b.pts)}/100`, g);
    add('rect', { x: bx, y: Y(b.n), width: bw, height: Math.max(0, H - pad.b - Y(b.n)), rx: Math.min(4, bw / 2), fill: `color-mix(in oklab, ${accent} 55%, ${surface})` }, null, g);
    if (!choice) add('rect', { x: X(b.x0), y: stripY, width: Math.max(1, X(b.x1) - X(b.x0)), height: stripH, fill: `color-mix(in oklab, ${accent} ${Math.round(b.pts)}%, ${surface})` }, null, g);
    // a wide invisible hit target for the tooltip
    add('rect', { x: X(b.x0), y: pad.t, width: Math.max(1, X(b.x1) - X(b.x0)), height: H - pad.t - pad.b + stripH + 4, fill: 'transparent' }, null, g);
  }
  add('line', { x1: pad.l, x2: W - pad.r, y1: H - pad.b, y2: H - pad.b, stroke: muted, 'stroke-width': 1 });
  if (choice) {
    for (const b of bars) {
      add('text', { x: X(b.x0 + 0.5), y: H - pad.b + 15, 'text-anchor': 'middle', class: 'chart-tick' }, b.label);
      add('text', { x: X(b.x0 + 0.5), y: H - pad.b + 30, 'text-anchor': 'middle', class: 'chart-pts' }, `${Math.round(b.pts)}/100`);
    }
  } else {
    for (const t of ticks) add('text', { x: X(t + 0.5), y: H - 6, 'text-anchor': 'middle', class: 'chart-tick' }, `${t}${suffix}`);
  }
  const marker = (v, colour, text, row) => {
    if (v < x0 || v > x1) return;
    add('line', { x1: X(v), x2: X(v), y1: 6 + row * 12 + 4, y2: H - pad.b, stroke: colour, 'stroke-width': 2, 'stroke-dasharray': '4 3' });
    add('text', { x: Math.min(W - 18, Math.max(18, X(v))), y: 9 + row * 12, 'text-anchor': 'middle', class: 'chart-mark', fill: colour }, text);
  };
  const bestV = q.template === 'tank' ? q.params.N : s.bestAnswers[Math.floor(s.bestAnswers.length / 2)];
  marker(xOf(bestV), css('--good'), q.template === 'tank' ? `N = ${q.params.N}` : 'best', 0);
  if (answer != null) marker(xOf(answer), css('--warn') || '#d97706', 'you', 1);
  return svg;
}

/** The crowd's depth mix as one stacked bar with a legend. */
export function depthMix(s, el) {
  const accent = css('--accent'), surface = css('--surface');
  const parts = [
    ...s.levelCounts.map((n, k) => ({ n, label: `${k} step${k === 1 ? '' : 's'}`, colour: `color-mix(in oklab, ${accent} ${22 + k * 19}%, ${surface})` })),
    { n: s.theorists, label: 'game theorists', colour: css('--good') },
    { n: s.jokers, label: 'jokers', colour: css('--muted') },
  ].filter((p) => p.n > 0);
  return el('div', { class: 'depth' },
    el('p', { class: 'eyebrow', text: `The crowd · average ${s.depth.toFixed(1)} steps of thinking` }),
    el('div', { class: 'depth-bar' }, ...parts.map((p) => el('span', { style: `width:${(100 * p.n) / s.size}%;background:${p.colour}`, title: `${p.label}: ${((100 * p.n) / s.size).toFixed(0)}%` }))),
    el('p', { class: 'depth-legend' }, ...parts.map((p) => el('span', {}, el('i', { style: `background:${p.colour}` }), `${p.label} ${((100 * p.n) / s.size).toFixed(0)}%`))));
}
