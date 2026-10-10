// Number and text formatting shared by the reveal explanations.

/** 31.04 -> "31", 31.25 -> "31.3"; whole numbers lose the ".0". */
export function fmt(x, dp = 1) {
  const r = Math.round(x * 10 ** dp) / 10 ** dp;
  return Number.isInteger(r) ? String(r) : r.toFixed(dp);
}

export const pct = (share) => `${fmt(100 * share, 0)}%`;

/** [8, 9, 10, 90, 91] -> "8–10 or 90–91". */
export function answerList(values) {
  const v = [...values].sort((a, b) => a - b);
  const runs = [];
  for (const x of v) {
    const last = runs[runs.length - 1];
    if (last && x === last[1] + 1) last[1] = x; else runs.push([x, x]);
  }
  const parts = runs.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`));
  return parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} or ${parts[parts.length - 1]}`;
}

/** [2, 3] -> "2/3", [3, 2] -> "1.5", [1, 1] -> "1". */
export function fraction([num, den]) {
  if (num % den === 0) return String(num / den);
  if (num > den) return fmt(num / den, 2);
  return `${num}/${den}`;
}

/** "1st"-free list joiner: ["a", "b", "c"] -> "a, b and c". */
export function joinAnd(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
