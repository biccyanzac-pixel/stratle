// Writes the day files the site plays: site/data/days/<date>.json, from data/schedule.json.
//   node scripts/generate.js                       every scheduled day that has no file yet
//   node scripts/generate.js --from 2026-11-01 --to 2026-12-31
//   node scripts/generate.js --regenerate-future   also rewrite existing files for days after today
// Existing files for today and earlier are never rewritten: the script checks they still match and
// stops with an error if regenerating them would change them.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { generateDay } from '../site/js/engine/question.js';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? fallback : args[i + 1];
};
const today = new Date().toISOString().slice(0, 10);
const { days } = JSON.parse(readFileSync(new URL('../data/schedule.json', import.meta.url), 'utf8'));
const dates = Object.keys(days).filter((d) => d >= opt('from', '0000') && d <= opt('to', '9999'));
const regenerateFuture = args.includes('--regenerate-future');
const dir = new URL('../site/data/days/', import.meta.url);
mkdirSync(dir, { recursive: true });

const dayJson = (date) => `${JSON.stringify(generateDay(date, days[date]))}\n`;

let written = 0, kept = 0, bytes = 0;
const changedPast = [];
for (const date of dates) {
  const file = new URL(`${date}.json`, dir);
  if (existsSync(file)) {
    if (date <= today) {
      if (readFileSync(file, 'utf8') !== dayJson(date)) changedPast.push(date);
      kept++;
      continue;
    }
    if (!regenerateFuture) { kept++; continue; }
  }
  const json = dayJson(date);
  writeFileSync(file, json);
  written++;
  bytes += json.length;
}
// The site reads the scheduled range from here.
writeFileSync(new URL('../site/data/index.json', import.meta.url), `${JSON.stringify({ first: Object.keys(days)[0], last: Object.keys(days).at(-1) })}
`);

console.log(`wrote ${written} day files (${(bytes / 1024 / Math.max(1, written)).toFixed(0)} KB each on average), kept ${kept}`);
if (changedPast.length) {
  console.error(`ERROR: the engine would now change ${changedPast.length} published days (${changedPast.slice(0, 5).join(', ')}...). Revert the engine change or version it.`);
  process.exit(1);
}
