// A distribution over the whole numbers min..max: { min, max, w } where w[i] is the weight of min + i.
// Weights are probabilities (bot beliefs) or bot counts (a real crowd); nothing here assumes they sum to 1.
// With integer counts every statistic below is exact, so scoring a real crowd has no float ties.

export const makeDist = (min, max, w) => ({ min, max, w });

export const uniform = (min, max) => makeDist(min, max, new Array(max - min + 1).fill(1));

export function pointMass(min, max, values) {
  const w = new Array(max - min + 1).fill(0);
  for (const v of values) w[v - min] += 1 / values.length;
  return makeDist(min, max, w);
}

export function totalOf(d) {
  let s = 0;
  for (const x of d.w) s += x;
  return s;
}

/** Σ value × weight. Divide by totalOf for the mean. */
export function sumOf(d) {
  let s = 0;
  for (let i = 0; i < d.w.length; i++) s += d.w[i] * (d.min + i);
  return s;
}

export const meanOf = (d) => sumOf(d) / totalOf(d);

/** Smallest value whose cumulative share reaches q (q in (0, 1]). The median is quantile(d, 0.5). */
export function quantile(d, q) {
  const total = totalOf(d);
  const goal = q * total - 1e-9 * total;
  let c = 0;
  for (let i = 0; i < d.w.length; i++) {
    c += d.w[i];
    if (d.w[i] > 0 && c >= goal) return d.min + i;
  }
  return d.max;
}

/** Weighted mixture of distributions on the same range; each is normalised first. */
export function mix(dists, weights) {
  const { min, max } = dists[0];
  const w = new Array(max - min + 1).fill(0);
  dists.forEach((d, j) => {
    const scale = weights[j] / totalOf(d);
    for (let i = 0; i < w.length; i++) w[i] += d.w[i] * scale;
  });
  return makeDist(min, max, w);
}

export function normalised(d) {
  const t = totalOf(d);
  return makeDist(d.min, d.max, d.w.map((x) => x / t));
}

/** Sums several count distributions on the same range. */
export function addAll(dists) {
  const { min, max } = dists[0];
  const w = new Array(max - min + 1).fill(0);
  for (const d of dists) for (let i = 0; i < w.length; i++) w[i] += d.w[i];
  return makeDist(min, max, w);
}

/**
 * Mean of the part of the crowd between two cumulative shares, e.g. (0.25, 0.75) is the average of the middle
 * half and (0.5, 1) of the top half. Answers straddling a boundary count in proportion.
 */
export function partialMean(d, lo, hi) {
  const total = totalOf(d), a = lo * total, b = hi * total;
  let c = 0, s = 0;
  for (let i = 0; i < d.w.length; i++) {
    const w = d.w[i];
    const overlap = Math.max(0, Math.min(c + w, b) - Math.max(c, a));
    s += overlap * (d.min + i);
    c += w;
  }
  return s / (b - a);
}
