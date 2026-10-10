import { makeDist } from '../site/js/engine/dist.js';
import { TEMPLATES } from '../site/js/engine/templates/index.js';

/** A count distribution on min..max from { value: count }. */
export function counts(min, max, map) {
  const w = new Array(max - min + 1).fill(0);
  for (const [v, n] of Object.entries(map)) w[Number(v) - min] += n;
  return makeDist(min, max, w);
}

/** A hand-built question whose whole crowd is level 0, for scoring tests. */
export function handQuestion(template, params, map) {
  const { min, max } = TEMPLATES[template].grid(params);
  const d = counts(min, max, map);
  const empty = { o: 0, c: [] };
  return {
    template, params, settings: { tau: 0, noise: 0, joker: 0 }, size: d.w.reduce((a, b) => a + b, 0),
    levelBest: [null, [min], null, null, null],
    crowd: { min, max, types: [{ o: 0, c: d.w }, empty, empty, empty, empty, empty, empty] },
  };
}

export const everyValue = (min, max, n = 1) => Object.fromEntries(Array.from({ length: max - min + 1 }, (_, i) => [min + i, n]));
