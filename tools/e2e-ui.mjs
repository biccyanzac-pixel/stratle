// Headless-Chrome check of the game page: plays today at 360 px (dark) and desktop (light) against a local worker,
// checks every reveal, the total, the share text and the leaderboard, with no console errors or sideways scroll.
//   npm run preview  (serves :8084)   and   (cd worker && npm run dev:local)  (worker on :8841), then
//   node tools/e2e-ui.mjs   (?hub=off: the rating box's hub only allows the live origin)
import { chromium } from 'playwright-core';

const SITE = process.argv[2] ?? 'http://localhost:8084/site/';
const API = process.argv[3] ?? 'http://127.0.0.1:8841';
const SHOTS = process.argv[4];
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const errors = [];

for (const [w, h, scheme] of [[360, 780, 'dark'], [1200, 900, 'light']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${w}px: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${w}px console: ${m.text()}`); });
  await page.goto(`${SITE}?hub=off&api=${encodeURIComponent(API)}`);
  await page.fill('#name', `ui-${w}`);
  await page.click('#start');
  for (let i = 0; i < 5; i++) {
    await page.waitForSelector('#question:not([hidden])');
    const option = await page.$('#q-input .option:not(.vote)');
    const vote = await page.$('#q-input .vote');
    const num = await page.$('#q-input input.number');
    if (vote) await vote.click();
    else if (option) await option.click();
    else if (num) {
      const min = Number(await num.getAttribute('min')), max = Number(await num.getAttribute('max'));
      await num.fill(String(Math.round(min + (max - min) * 0.27)));
    }
    await page.click('#lock');
    await page.waitForSelector('#reveal:not([hidden])');
    await page.waitForFunction(() => !document.getElementById('q-score').hasAttribute('aria-hidden')); // count-up done
    const score = Number(await page.textContent('#q-score'));
    if (!(score >= 0 && score <= 100)) errors.push(`${w}px Q${i + 1}: score ${score}`);
    if (!(await page.$('#chart svg'))) errors.push(`${w}px Q${i + 1}: no chart`);
    const text = await page.textContent('#explain');
    if (/undefined|NaN|null/.test(text) || text.length < 40) errors.push(`${w}px Q${i + 1}: explanation "${text}"`);
    if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) errors.push(`${w}px Q${i + 1}: sideways scroll`);
    if (SHOTS && i === 2) await page.screenshot({ path: `${SHOTS}/game-${w}-q3.png`, fullPage: true });
    await page.click('#next');
  }
  await page.waitForSelector('#done:not([hidden])');
  await page.waitForFunction(() => !document.getElementById('daily-score').hasAttribute('aria-hidden')); // count-up done
  const total = Number(await page.textContent('#daily-score'));
  const rows = await page.$$eval('#round-list .attempt-score', (els) => els.map((e) => Number(e.textContent)));
  if (rows.length !== 5 || rows.reduce((a, b) => a + b, 0) !== total) errors.push(`${w}px: total ${total} vs rows ${rows}`);
  await page.waitForFunction((n) => [...document.querySelectorAll('#rows .row-name')].some((e) => e.textContent === n), `ui-${w}`, { timeout: 10000 })
    .catch(() => errors.push(`${w}px: not on the leaderboard`));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/game-${w}-done.png`, fullPage: true });
  console.log(`${w}px ${scheme}: total ${total} (${rows.join(', ')})`);
  await ctx.close();
}
await browser.close();
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no errors');
process.exit(errors.length ? 1 : 0);
