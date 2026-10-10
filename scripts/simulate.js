// Prints a simulated question to the terminal: prompt, settings, an ASCII histogram, the explanation.
//   node scripts/simulate.js [YYYY-MM-DD] [target|avoid|underbid] [--tau 1.5] [--noise 0.04] [--joker 0.02]

import { generateQuestion, dailySettings, summarize, explain, promptText, decodeCrowd } from '../site/js/engine/question.js';
import { fmt } from '../site/js/engine/format.js';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? undefined : Number(args.splice(i, 2)[1]);
};
const overrides = { tau: flag('tau'), noise: flag('noise'), joker: flag('joker') };
const date = args[0] ?? new Date().toISOString().slice(0, 10);
const template = args[1] ?? 'target';

const settings = { ...dailySettings(date) };
for (const [k, v] of Object.entries(overrides)) if (v !== undefined) settings[k] = v;

const t0 = performance.now();
const q = generateQuestion({ seed: `stratle|${date}|cli|${template}`, template, settings });
const ms = performance.now() - t0;
const s = summarize(q);
const { all } = decodeCrowd(q);

console.log(`${date} · ${template} · ${settings.persona} · ${JSON.stringify(q.settings)} · ${fmt(ms, 0)} ms`);
console.log(promptText(q));
console.log(`depth mix: ${s.levelCounts.map((n, k) => `L${k} ${n}`).join('  ')}  theorists ${s.theorists}  jokers ${s.jokers}`);

const bins = Math.min(50, all.max - all.min + 1);
const width = (all.max - all.min + 1) / bins;
const hist = new Array(bins).fill(0);
all.w.forEach((n, i) => { hist[Math.min(bins - 1, Math.floor(i / width))] += n; });
const top = Math.max(...hist);
hist.forEach((n, b) => {
  const lo = all.min + Math.ceil(b * width);
  console.log(`${String(lo).padStart(5)} ${'#'.repeat(Math.round((50 * n) / top))} ${n || ''}`);
});
console.log();
console.log(explain(q, s));
