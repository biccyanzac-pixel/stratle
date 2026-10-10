// API end-to-end test against a running worker.
//   (cd worker && npm run db:init:local && npm run dev:local) with the site served on :8084 (npm run preview), then
//   node test/e2e.mjs http://127.0.0.1:8841
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scoreAnswer, summarize } from '../../site/js/engine/question.js';
import { todayKey, addDays } from '../../site/js/daily.js';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8841';
const day = todayKey();
const data = JSON.parse(readFileSync(new URL(`../../site/data/days/${day}.json`, import.meta.url), 'utf8'));

async function call(path, body) {
  const res = await fetch(BASE + path, body === undefined ? undefined
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}

const results = [];
async function check(name, fn) {
  try { await fn(); results.push(`ok   ${name}`); } catch (e) { results.push(`FAIL ${name}: ${e.message}`); }
}

const p1 = (await call('/api/session', {})).body;
const p2 = (await call('/api/session', {})).body;
const name = `e2e-${Date.now() % 100000}`;
const best = data.questions.map((q) => summarize(q).bestAnswers[0]);

await check('a session gives a player id and token', () => assert.ok(p1.playerId && p1.token));

await check('a bad session is rejected', async () => {
  const r = await call('/api/answer', { playerId: p1.playerId, token: 'nope', day, q: 0, answer: best[0], name });
  assert.equal(r.status, 401);
});

await check('the server scores the first answer like the engine does', async () => {
  const r = await call('/api/answer', { ...p1, day, q: 0, answer: best[0], name });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.points, scoreAnswer(data.questions[0], best[0]).score);
  assert.equal(r.body.points, 100);
});

await check('the same question cannot be answered twice', async () => {
  const r = await call('/api/answer', { ...p1, day, q: 0, answer: best[0], name });
  assert.equal(r.status, 409);
});

await check('questions must be answered in order', async () => {
  const r = await call('/api/answer', { ...p1, day, q: 2, answer: best[2], name });
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'out_of_order');
});

await check('an answer outside the question\'s range is rejected', async () => {
  const r = await call('/api/answer', { ...p1, day, q: 1, answer: 999999, name });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'bad_answer');
});

await check('a future day is rejected', async () => {
  const r = await call('/api/answer', { ...p1, day: addDays(day, 1), q: 0, answer: 0, name });
  assert.equal(r.status, 400);
});

await check('a bad name is rejected', async () => {
  const r = await call('/api/answer', { ...p1, day, q: 1, answer: best[1], name: '' });
  assert.equal(r.status, 400);
});

await check('finishing all 5 gives the right total on the board', async () => {
  for (let q = 1; q < 5; q++) {
    const r = await call('/api/answer', { ...p1, day, q, answer: best[q], name });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  }
  const b = (await call(`/api/leaderboard?day=${day}&playerId=${p1.playerId}`)).body;
  const me = [...b.top, b.you].find((r) => r?.you);
  assert.ok(me, 'player on the board');
  assert.equal(me.total, 500);
  assert.equal(me.played, 5);
});

await check('per-question averages count real players', async () => {
  const q0 = data.questions[0];
  const worst = summarize(q0).bestAnswers[0] === 0 ? 1 : 0;
  const pts = scoreAnswer(q0, worst).score;
  const before = (await call(`/api/leaderboard?day=${day}`)).body.questions[0];
  const r = await call('/api/answer', { ...p2, day, q: 0, answer: worst, name: `${name}b` });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const after = (await call(`/api/leaderboard?day=${day}`)).body.questions[0];
  assert.equal(after.n, before.n + 1);
  assert.ok(Math.abs(after.avg * after.n - (before.avg * before.n + pts)) < 1e-6);
});

await check('days lists today with its players', async () => {
  const r = (await call(`/api/days?from=${day}&to=${day}`)).body;
  assert.ok(r.days[day].players >= 2);
});

console.log(results.join('\n'));
if (results.some((r) => r.startsWith('FAIL'))) process.exit(1);
