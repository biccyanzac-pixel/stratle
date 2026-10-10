// Builds or extends the question schedule (data/schedule.json).
//   node scripts/schedule.js                         extend to 730 days from START, keeping days up to today
//   node scripts/schedule.js --days 800 --keep-until 2026-12-31
// Days up to --keep-until (default: today, UTC) are never changed. Then run scripts/generate.js.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { extendSchedule, checkSchedule } from './schedule-lib.js';

export const START = '2026-10-10'; // = EPOCH in site/js/daily.js: Stratle #1
const PATH = new URL('../data/schedule.json', import.meta.url);

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? fallback : args[i + 1];
};
const count = Number(opt('days', 730));
const keepUntil = opt('keep-until', new Date().toISOString().slice(0, 10));

const existing = existsSync(PATH) ? JSON.parse(readFileSync(PATH, 'utf8')).days : {};
const days = extendSchedule(existing, START, count, keepUntil);
const problems = checkSchedule(days);
if (problems.length) {
  console.error(problems.slice(0, 20).join('\n'));
  process.exit(1);
}
mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
writeFileSync(PATH, `${JSON.stringify({ start: START, rules: 'see scripts/schedule-lib.js', days }, null, 0).replace(/("\d{4}-\d{2}-\d{2}":)/g, '\n$1')}\n`);

const counts = {};
for (const qs of Object.values(days)) for (const q of qs) counts[q.template] = (counts[q.template] ?? 0) + 1;
const dates = Object.keys(days);
console.log(`schedule: ${dates.length} days, ${dates[0]} .. ${dates[dates.length - 1]} (kept up to ${keepUntil})`);
console.log('template counts:', counts);
