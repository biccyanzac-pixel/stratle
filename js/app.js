// Stratle UI: intro -> 5 questions (answer, then the reveal) -> daily score, share, leaderboard. Archive replays.
// Scores are computed here from the day file with the shared engine; the worker recomputes them itself.
import { QUESTIONS, addDays, dayNumber, msUntilNextUtcDay, scoreEmoji, todayKey } from './daily.js';
import * as api from './api.js';
import * as store from './storage.js';
import { TEMPLATES } from './engine/templates/index.js';
import { scoreAnswer, summarize, explain, promptText, scoreCurve } from './engine/question.js';
import { PERSONAS } from './engine/config.js';
import { poissonWeights } from './engine/ch.js';
import { encode } from './engine/templates/selfref.js';
import { crowdChart, depthMix, shortLabel } from './chart.js';

const $ = (id) => document.getElementById(id);
const SITE = 'https://biccyanzac-pixel.github.io/stratle/';
const NAMES = {
  target: 'Hit the target', avoid: 'Stand out', underbid: 'Bid under the line', threshold: 'Under the cap',
  common: 'Most or least common', catch: 'Points with a catch', selfref: 'YES or NO?', tank: 'Estimate N', splitsteal: 'Split or steal',
};

let index = null;           // data/index.json: { first, last }
const dayCache = new Map(); // day -> data/days/<day>.json
let mode = { day: todayKey(), late: false };
let current = null;         // { i, q, answer, done }

function el(tag, props = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) n.append(c);
  return n;
}

const show = (id, on = true) => { $(id).hidden = !on; };

async function loadDay(day) {
  if (!dayCache.has(day)) {
    const res = await fetch(`data/days/${day}.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`No game for ${day}.`);
    dayCache.set(day, await res.json());
  }
  return dayCache.get(day);
}

const pad = (n) => String(n).padStart(2, '0');

function tickCountdown() {
  const s = Math.floor(msUntilNextUtcDay() / 1000);
  $('countdown').textContent = `Next in ${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
  if (!mode.late && mode.day !== todayKey() && !current) {
    mode = { day: todayKey(), late: false };
    render();
  }
}

const rounds = () => store.progress(mode.day, mode.late).rounds;
const doneCount = (day, late) => store.progress(day, late).rounds.filter(Boolean).length;
const total = (rs) => rs.reduce((a, r) => a + (r?.points || 0), 0);

// --- the weekday hint about the crowd (Monday says most, Saturday nothing) --------------------------

function crowdHint(day, settings) {
  const p = PERSONAS[settings.persona];
  if (!p) return null;
  const f = poissonWeights(settings.tau);
  const depth = f.reduce((a, x, k) => a + x * k, 0);
  const word = settings.tau < 1.6 ? 'shallow' : settings.tau < 3 ? 'middling' : 'deep';
  switch (new Date(`${day}T00:00:00Z`).getUTCDay()) {
    case 1: return `Monday hint: today's crowd is modelled on ${p.label}. They think about ${depth.toFixed(1)} steps ahead on average.`;
    case 2: return `Tuesday hint: today's crowd is modelled on ${p.label}, a ${word}-thinking crowd.`;
    case 3: return `Wednesday hint: today's crowd is modelled on ${p.label}.`;
    case 4: return `Thursday hint: today's crowd is a ${word}-thinking one.`;
    case 5: return 'Friday: no hints about the crowd from here to the weekend.';
    case 0: return 'Sunday special: the deepest-thinking crowd of the week, and no hints.';
    default: return null;
  }
}

// --- views ----------------------------------------------------------------------------------------

async function render() {
  const { day, late } = mode;
  $('daynum').textContent = `Stratle #${dayNumber(day)}${late ? ` · ${day} (played later)` : ''}`;
  if (window.JGG) $('level').replaceChildren(JGG.levelChip(day));
  show('question', false);
  const n = doneCount(day, late);
  if (n >= QUESTIONS) {
    show('intro', false);
    renderDone();
  } else {
    show('done', false);
    show('intro', true);
    const scheduled = !index || (day >= index.first && day <= index.last);
    $('start').disabled = !scheduled;
    show('start-error', false);
    if (!scheduled) showError('start-error', "Today's questions aren't ready yet. Check back soon!");
    $('start-label').textContent = n === 0 ? `Start question 1 of ${QUESTIONS}` : `Continue: question ${n + 1} of ${QUESTIONS}`;
    const name = api.savedName();
    $('name').value = name;
    show('name-field', !name);
    if (window.JGG) JGG.playingAs({ mount: $('playing-as'), name, onChange: (v) => { api.saveName(v); $('name').value = v; } });
    else { $('playing-as').textContent = name ? `Playing as ${name}.` : ''; show('playing-as', !!name); }
    try {
      const hint = crowdHint(day, (await loadDay(day)).settings);
      $('crowd-hint').textContent = hint ?? '';
      show('crowd-hint', !!hint);
    } catch { show('crowd-hint', false); }
  }
  renderBoard();
}

function inputFor(q, onAnswer) {
  const tpl = TEMPLATES[q.template];
  if (tpl.kind === 'choice') {
    const buttons = tpl.options(q.params).map((label, k) => el('button', {
      class: 'option', type: 'button', 'aria-pressed': 'false',
      onclick: () => { buttons.forEach((b, j) => b.setAttribute('aria-pressed', String(j === k))); onAnswer(k); },
    }, label));
    return el('div', { class: 'options' }, ...buttons);
  }
  if (q.template === 'selfref') {
    let vote = null, guess = 50;
    const out = el('strong', { class: 'slider-value', text: '50%' });
    const votes = ['YES', 'NO'].map((v, k) => el('button', {
      class: 'option vote', type: 'button', 'aria-pressed': 'false',
      onclick: () => { vote = k; votes.forEach((b, j) => b.setAttribute('aria-pressed', String(j === k))); onAnswer(encode(vote, guess)); },
    }, v));
    const slider = el('input', { type: 'range', min: '0', max: '100', value: '50', 'aria-label': `Your guess for the % answering ${q.params.focus}` });
    slider.addEventListener('input', () => { guess = Number(slider.value); out.textContent = `${guess}%`; if (vote !== null) onAnswer(encode(vote, guess)); });
    return el('div', { class: 'number-input' },
      el('div', { class: 'votes' }, ...votes),
      el('p', { class: 'slider-label' }, `Your guess for the % of the crowd answering ${q.params.focus}: `, out), slider);
  }
  const { min, max } = tpl.grid(q.params);
  const num = el('input', { type: 'number', class: 'number', min: String(min), max: String(max), step: '1', inputmode: 'numeric', placeholder: `${min}–${max}`, 'aria-label': 'Your answer' });
  const slider = q.template === 'tank' ? null : el('input', { type: 'range', min: String(min), max: String(max), value: String(Math.round((min + max) / 2)), 'aria-label': 'Your answer' });
  const check = () => {
    const v = Number(num.value);
    onAnswer(num.value !== '' && Number.isInteger(v) && v >= min && v <= max ? v : null);
  };
  num.addEventListener('input', () => { if (slider && num.value !== '') slider.value = num.value; check(); });
  slider?.addEventListener('input', () => { num.value = slider.value; check(); });
  return el('div', { class: 'number-input' }, num, slider, el('p', { class: 'fineprint left', text: `A whole number from ${min} to ${max}.` }));
}

function questionPrompt(q) {
  const text = promptText(q);
  // Option texts are on the buttons; keep only the question's first line.
  return q.template === 'threshold' ? text.split('\n')[0] : text;
}

async function startQuestion(i, review = false) {
  let data;
  try { data = await loadDay(mode.day); } catch (e) { showError('start-error', e.message); return; }
  const q = data.questions[i];
  current = { i, q, answer: null, done: false, review };
  show('intro', false); show('done', false); show('reveal', false); show('question', true); show('q-error', false);
  $('q-label').textContent = `Question ${i + 1} of ${QUESTIONS} · ${NAMES[q.template] ?? q.template}`;
  const before = total(rounds().slice(0, i));
  $('running').textContent = i ? `${before} points so far` : '';
  $('q-prompt').textContent = questionPrompt(q);
  $('q-input').replaceChildren(inputFor(q, (a) => { current.answer = a; $('lock').disabled = a === null; }));
  $('lock').hidden = false;
  $('lock').disabled = true;
  $('card').scrollIntoView({ block: 'start', behavior: 'smooth' });
  if (review) revealQuestion(rounds()[i]);
}

function lock() {
  if (!current || current.answer === null || current.done) return;
  const { i, q, answer } = current;
  let result;
  try { result = scoreAnswer(q, answer); } catch (e) { showError('q-error', e.message); return; }
  const curve = scoreCurve(q);
  const r = { answer, points: result.score, crowdAvg: Math.round(curve.crowdAverage) };
  store.saveRound(mode.day, mode.late, i, r);
  revealQuestion(r, curve);
  if (api.enabled()) {
    api.submitAnswer({ day: mode.day, q: i, answer, name: api.savedName() })
      .then(() => renderBoard())
      .catch((e) => showError('q-error', `Couldn't save this answer to the leaderboard: ${e.message}`));
  }
}

function revealQuestion(r, curve = scoreCurve(current.q)) {
  const { q, i } = current;
  current.done = true;
  $('q-input').querySelectorAll('button, input').forEach((x) => { x.disabled = true; });
  if (TEMPLATES[q.template].kind === 'choice') {
    $('q-input').querySelectorAll('.option').forEach((b, k) => b.setAttribute('aria-pressed', String(k === r.answer)));
  }
  $('lock').hidden = true;
  const s = summarize(q);
  const sc = $('q-score');
  sc.textContent = r.points;
  sc.className = `score ${r.points >= 50 ? 'good' : 'bad'}`;
  $('crowd-avg').textContent = Math.round(curve.crowdAverage);
  const best = s.bestAnswers.length > 4
    ? `${s.bestAnswers.length} answers tied`
    : s.bestAnswers.map((a) => shortLabel(q, a)).join(' or ');
  $('you-best').textContent = `You: ${shortLabel(q, r.answer)} · Best: ${q.template === 'tank' ? `N = ${q.params.N}` : best}`;
  $('chart').replaceChildren(crowdChart({ q, summary: s, curve, answer: r.answer, width: $('card').clientWidth - 48 }));
  $('chart-note').textContent = TEMPLATES[q.template].kind === 'choice'
    ? 'Bars: how the crowd answered. Under each option: the score it got, out of 100.'
    : 'Bars: how the crowd answered. The strip under the axis: what each answer would have scored (darker = higher).';
  $('depth').replaceChildren(depthMix(s, el));
  $('explain').textContent = explain(q, s);
  $('next').textContent = current.review ? 'Back to your score' : i + 1 < QUESTIONS ? 'Next question →' : 'See your score →';
  show('players-avg-row', false);
  showPlayersAverage(i);
  show('reveal', true);
}

async function showPlayersAverage(i) {
  if (!api.enabled()) return;
  try {
    const b = await api.board(mode.day, mode.late);
    const s = b.questions?.[i];
    if (s && s.n >= 2 && current?.i === i) {
      $('players-avg-label').textContent = `Average real player (${s.n})`;
      $('players-avg').textContent = Math.round(s.avg);
      show('players-avg-row', true);
    }
  } catch { /* the reveal works without it */ }
}

function next() {
  const i = current.i + 1;
  const review = current.review;
  current = null;
  if (!review && i < QUESTIONS) startQuestion(i);
  else { show('question', false); renderDone(); renderBoard(); $('card').scrollIntoView({ block: 'start', behavior: 'smooth' }); }
}

function deepestRead(rs) {
  let best = 0;
  rs.forEach((r, i) => { if (r.points - r.crowdAvg > rs[best].points - rs[best].crowdAvg) best = i; });
  return best + 1;
}

async function renderDone() {
  const { day, late } = mode;
  const rs = rounds();
  show('done', true);
  $('daily-score-caption').textContent = late ? `Your replay of ${day}` : "Today's score";
  $('daily-score').textContent = total(rs);
  let data = null;
  try { data = await loadDay(day); } catch { /* names fall back to numbers */ }
  $('round-list').replaceChildren(...rs.map((r, i) => {
    const q = data?.questions[i];
    return el('li', { class: 'attempt-row' },
      el('button', { class: 'attempt-head review', type: 'button', onclick: () => startQuestion(i, true) },
        el('span', { class: 'attempt-label', text: `${scoreEmoji(r.points)} Q${i + 1} · ${q ? NAMES[q.template] : ''}` }),
        el('span', { class: `attempt-score ${r.points >= 50 ? 'good' : 'bad'}`, text: String(r.points) })),
      el('p', { class: 'attempt-answer' },
        q ? `You: ${shortLabel(q, r.answer)} · simulated players averaged ${r.crowdAvg}` : `Simulated players averaged ${r.crowdAvg}`));
  }));
  show('share-done', false);
  window.JGG?.rate({ game: 'stratle', day, mount: $('rate') });
}

function shareText() {
  const { day, late } = mode;
  const rs = rounds();
  const streak = late ? 0 : store.streak(todayKey(), addDays, QUESTIONS);
  return `🧠 Stratle #${dayNumber(day)}${late ? ' (replay)' : ''} — ${total(rs)}/500, deepest read: Q${deepestRead(rs)}\n` +
    `${rs.map((r) => scoreEmoji(r.points)).join('')}${streak > 1 ? `  🔥${streak}` : ''}\n${SITE}`;
}

async function share() {
  const text = shareText();
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) { await navigator.share({ text }); return; }
    await navigator.clipboard.writeText(text);
    show('share-done', true);
  } catch {
    prompt('Copy your result:', text);
  }
}

// --- leaderboard ----------------------------------------------------------------------------------

async function renderBoard() {
  if (!api.enabled()) { show('board', false); return; }
  const { day, late } = mode;
  show('board', true);
  $('board').querySelector('h2').textContent = late ? `Played later: ${day}` : "Today's leaderboard";
  let b;
  try { b = await api.board(day, late); } catch (e) { $('board-note').textContent = `Leaderboard unavailable: ${e.message}`; show('board-note', true); return; }
  show('board-note', false);
  $('players').textContent = b.players ? `${b.players} player${b.players === 1 ? '' : 's'}` : '';
  const rows = [...b.top];
  if (b.you) rows.push(null, b.you);
  $('rows').replaceChildren(...rows.map((r) => r === null ? el('li', { class: 'row-gap', text: '···' })
    : el('li', { class: `row${r.you ? ' me' : ''}` },
      el('span', { class: 'row-rank', text: `${r.rank}` }),
      el('div', { class: 'row-main' },
        el('div', { class: 'row-name', text: r.name }),
        el('div', { class: 'row-sub' },
          el('span', { class: 'row-emoji', text: r.rounds.map(scoreEmoji).join('') }),
          r.played < QUESTIONS ? ` · ${r.played}/${QUESTIONS} questions` : '')),
      el('span', { class: 'row-score', text: String(r.total) }))));
  show('board-empty', !b.top.length);
}

// --- archive --------------------------------------------------------------------------------------

async function browseArchive() {
  const list = $('archive-list');
  if (!list.hidden) { list.hidden = true; return; }
  const today = todayKey();
  const items = [];
  for (let d = addDays(today, -1); index && d >= index.first; d = addDays(d, -1)) items.push(d);
  let summary = {};
  try { if (api.enabled() && items.length) summary = (await api.days(items[items.length - 1], items[0])).days || {}; } catch { /* list works without counts */ }
  list.replaceChildren(...(items.length ? items.map((d) => {
    const s = summary[d];
    const mine = doneCount(d, false) >= QUESTIONS ? total(store.progress(d).rounds)
      : doneCount(d, true) >= QUESTIONS ? total(store.progress(d, true).rounds) : null;
    return el('li', {}, el('button', { class: 'archive-list-item', type: 'button', onclick: () => openArchive(d) },
      el('span', { class: 'archive-list-day', text: `Stratle #${dayNumber(d)} · ${d}` }),
      el('span', { class: 'archive-list-prompt', text: [
        s?.players ? `${s.players} played on the day, best ${s.top}` : 'Nobody played on the day',
        mine !== null ? `you: ${mine}` : null].filter(Boolean).join(' · ') })));
  }) : [el('li', { class: 'archive-list-empty', text: 'No past days yet. Stratle started today.' })]));
  list.hidden = false;
}

function openArchive(d) {
  current = null;
  mode = doneCount(d, false) >= QUESTIONS ? { day: d, late: false } : { day: d, late: true };
  $('archive-list').hidden = true;
  render();
  $('card').scrollIntoView({ block: 'start', behavior: 'smooth' });
}

function showError(id, msg) { $(id).textContent = msg; show(id, true); }

// --- boot -----------------------------------------------------------------------------------------

$('start-form').addEventListener('submit', (e) => {
  e.preventDefault();
  show('start-error', false);
  const name = ($('name').value || api.savedName()).replace(/\s+/g, ' ').trim();
  if (!name) { showError('start-error', 'Enter a name for the leaderboard.'); return; }
  api.saveName(name.slice(0, 20));
  startQuestion(doneCount(mode.day, mode.late));
});
$('lock').addEventListener('click', lock);
$('next').addEventListener('click', next);
$('share').addEventListener('click', share);
$('archive-browse').addEventListener('click', browseArchive);

(async function boot() {
  await api.loadConfig();
  try { index = await (await fetch('data/index.json', { cache: 'no-cache' })).json(); } catch { index = null; }
  const q = new URLSearchParams(location.search).get('day');
  if (q && index && q >= index.first && q < todayKey()) openArchive(q);
  else render();
  tickCountdown();
  setInterval(tickCountdown, 1000);
})();
