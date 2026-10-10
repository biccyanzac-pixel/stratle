// Helpers for templates whose answers are options (answer = option index 0..n-1).

import { makeDist, totalOf } from '../dist.js';
import { pct } from '../format.js';

export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Each option's share of the crowd (0..1). */
export function shares(d) {
  const t = totalOf(d);
  return d.w.map((x) => x / t);
}

/** A distribution over options from weights (normalised). */
export function weights(w) {
  const s = w.reduce((a, b) => a + b, 0);
  return makeDist(0, w.length - 1, w.map((x) => x / s));
}

/**
 * Points by popularity rank. `order` 'most' ranks the most common first, 'least' the least common
 * first; `points[r]` is paid to rank r (missing ranks pay 0). Tied options share the average of the
 * points of the rank positions they cover, so ties are exact and symmetric.
 */
export function rankPoints(counts, order, points) {
  const idx = counts.map((c, i) => i).sort((a, b) => (order === 'most' ? counts[b] - counts[a] : counts[a] - counts[b]) || a - b);
  const out = new Array(counts.length).fill(0);
  let r = 0;
  while (r < idx.length) {
    let q = r;
    while (q + 1 < idx.length && Math.abs(counts[idx[q + 1]] - counts[idx[r]]) <= 1e-12 * Math.max(1, counts[idx[r]])) q++;
    let sum = 0;
    for (let k = r; k <= q; k++) sum += points[k] ?? 0;
    for (let k = r; k <= q; k++) out[idx[k]] = sum / (q - r + 1);
    r = q + 1;
  }
  return out;
}

/** "Red 22%, Blue 18% and Green 9%" for the reveal. */
export function shareList(labels, sh) {
  return labels.map((l, i) => `${l} ${pct(sh[i])}`).join(', ');
}
