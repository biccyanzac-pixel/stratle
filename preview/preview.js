// Local day explorer: play any scheduled day with the real engine and day files. Not the game UI.
import { TEMPLATES } from '../site/js/engine/templates/index.js';
import { scoreAnswer, summarize, explain, promptText, decodeCrowd } from '../site/js/engine/question.js';
import { PERSONAS } from '../site/js/engine/config.js';
import { encode, decode } from '../site/js/engine/templates/selfref.js';
import { answerList } from '../site/js/engine/format.js';

const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null) e.append(kid);
  return e;
};
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const schedule = await (await fetch('../data/schedule.json')).json();
const dates = Object.keys(schedule.days);
const todayUtc = new Date().toISOString().slice(0, 10);
const scores = [];

$('date').min = dates[0];
$('date').max = dates[dates.length - 1];
const step = (n) => {
  const i = dates.indexOf($('date').value);
  load(dates[Math.min(dates.length - 1, Math.max(0, i + n))]);
};
$('prev').onclick = () => step(-1);
$('next').onclick = () => step(1);
$('today').onclick = () => load(dates.includes(todayUtc) ? todayUtc : dates[0]);
$('date').onchange = () => dates.includes($('date').value) && load($('date').value);

function labelOf(q, a) {
  const tpl = TEMPLATES[q.template];
  if (tpl.label) return tpl.label(q.params, a);
  if (tpl.options) return tpl.options(q.params)[a];
  return String(a);
}
const shortLabel = (q, a) => (q.template === 'threshold' ? 'ABCDEF'[a] : q.template === 'catch' ? String(q.params.values[a]) : labelOf(q, a));

async function load(date) {
  $('date').value = date;
  history.replaceState(null, '', `#${date}`);
  const day = await (await fetch(`../site/data/days/${date}.json`)).json();
  const persona = PERSONAS[day.settings.persona];
  const weekday = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
  $('persona').textContent = `${weekday}: crowd modelled on ${persona?.label ?? day.settings.persona} (τ ${day.settings.tau}).`;
  scores.length = 0;
  $('questions').replaceChildren(...day.questions.map((q, i) => questionCard(q, i)));
  renderTotal(date);
}

function questionCard(q, i) {
  const tpl = TEMPLATES[q.template];
  const card = el('section', { class: 'card' });
  const reveal = el('div');
  let answer = null;
  const lock = el('button', { class: 'primary', disabled: '' }, 'Lock in');
  const set = (a) => { answer = a; lock.removeAttribute('disabled'); };

  let input;
  if (tpl.kind === 'choice') {
    const buttons = tpl.options(q.params).map((label, k) => el('button', {
      class: 'pick',
      onclick: () => { buttons.forEach((b) => b.classList.remove('on')); buttons[k].classList.add('on'); set(k); },
    }, label));
    input = el('div', {}, buttons);
  } else if (q.template === 'selfref') {
    let vote = null, guess = 50;
    const out = el('strong', {}, '50%');
    const votes = ['YES', 'NO'].map((v, k) => el('button', {
      onclick: () => { vote = k; votes.forEach((b) => b.classList.remove('on')); votes[k].classList.add('on'); set(encode(vote, guess)); },
      class: 'pick',
    }, v));
    const slider = el('input', { type: 'range', min: 0, max: 100, value: 50 });
    slider.oninput = () => { guess = Number(slider.value); out.textContent = `${guess}%`; if (vote !== null) set(encode(vote, guess)); };
    input = el('div', {}, el('div', { class: 'row' }, votes), el('p', {}, `Your guess for the share answering ${q.params.focus}: `, out), slider);
  } else {
    const { min, max } = tpl.grid(q.params);
    const num = el('input', { type: 'number', min, max, step: 1, inputmode: 'numeric', placeholder: `${min}–${max}` });
    num.oninput = () => {
      const v = Number(num.value);
      if (num.value !== '' && Number.isInteger(v) && v >= min && v <= max) set(v); else { answer = null; lock.setAttribute('disabled', ''); }
    };
    input = el('div', { class: 'row' }, num);
  }

  const finish = (a) => {
    lock.remove(); skip.remove();
    input.querySelectorAll('button, input').forEach((x) => x.setAttribute('disabled', ''));
    const s = summarize(q);
    const result = a === null ? { score: 0 } : scoreAnswer(q, a);
    scores[i] = result.score;
    reveal.replaceChildren(revealBlock(q, s, a, result.score));
    renderTotal($('date').value);
  };
  lock.onclick = () => answer !== null && finish(answer);
  const skip = el('button', { onclick: () => finish(null) }, 'Just show me');

  card.append(
    el('div', { class: 'eyebrow' }, `Question ${i + 1} · ${q.template}`),
    el('div', { class: 'prompt' }, tpl.kind === 'choice' && q.template === 'threshold' ? promptText(q).split('\n')[0] : promptText(q)),
    input, el('div', { class: 'row', style: 'margin-top:10px' }, lock, skip), reveal,
  );
  return card;
}

function revealBlock(q, s, a, score) {
  const best = s.bestAnswers.length > 6 ? `${s.bestAnswers.length} answers (${answerList(s.bestAnswers).slice(0, 60)}…)`
    : s.bestAnswers.map((x) => labelOf(q, x)).join(' or ');
  return el('div', {},
    el('hr', { style: `border:0;border-top:1px solid ${css('--border')};margin:14px 0` }),
    el('div', { class: 'row' }, el('span', { class: 'score' }, a === null ? '–' : `${score}/100`),
      el('span', { class: 'note' }, a === null ? 'No answer' : `You: ${labelOf(q, a)} · Best: ${best}`)),
    chart(q, s, a),
    depthBar(s),
    el('p', { class: 'explain' }, explain(q, s)),
  );
}

/** Crowd answers as bars; your answer and the best answer marked. */
function chart(q, s, a) {
  const { all } = decodeCrowd(q);
  const tpl = TEMPLATES[q.template];
  // Draw at the card's real width so labels stay readable on phones.
  const W = Math.max(300, Math.min(700, document.getElementById('questions').clientWidth - 34)), H = W < 500 ? 170 : 200;
  const pad = { l: 8, r: 8, t: 22, b: 30 };
  let bars, xOf, ticks;
  if (tpl.kind === 'choice') {
    bars = all.w.map((n, i) => ({ x0: i, x1: i + 1, n, label: shortLabel(q, i) }));
    xOf = (v) => v + 0.5;
    ticks = bars.map((b, i) => ({ v: i + 0.5, text: b.label }));
  } else if (q.template === 'selfref') {
    // Collapse to the % guesses (both votes); the vote split goes in the caption.
    const g = new Array(101).fill(0);
    all.w.forEach((n, i) => { g[decode(i).guess] += n; });
    bars = g.map((n, v) => ({ x0: v, x1: v + 1, n }));
    xOf = (v) => decode(v).guess + 0.5;
    ticks = [0, 25, 50, 75, 100].map((v) => ({ v: v + 0.5, text: `${v}%` }));
  } else {
    let lo = all.min, hi = all.max;
    if (q.template === 'tank') {
      // Zoom to where the crowd is (1st..99th percentile), keeping N and your answer in view.
      let c = 0; const t = s.size; const cum = all.w.map((x) => (c += x) / t);
      lo = all.min + cum.findIndex((x) => x >= 0.01);
      hi = all.min + cum.findIndex((x) => x >= 0.99);
      for (const v of [q.params.N, a]) if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      const padv = Math.max(5, Math.round((hi - lo) * 0.05)); lo = Math.max(all.min, lo - padv); hi = Math.min(all.max, hi + padv);
    }
    const span = hi - lo + 1, nb = Math.min(span, 80), width = span / nb;
    bars = Array.from({ length: nb }, (_, b) => ({ x0: lo + b * width, x1: lo + (b + 1) * width, n: 0 }));
    all.w.forEach((n, i) => { const v = all.min + i; if (v >= lo && v <= hi) bars[Math.min(nb - 1, Math.floor((v - lo) / width))].n += n; });
    xOf = (v) => v + 0.5;
    ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => { const v = Math.round(lo + f * (hi - lo)); return { v: v + 0.5, text: String(v) }; });
  }
  const x0 = bars[0].x0, x1 = bars[bars.length - 1].x1;
  const X = (v) => pad.l + ((v - x0) / (x1 - x0)) * (W - pad.l - pad.r);
  const top = Math.max(...bars.map((b) => b.n)) || 1;
  const Y = (n) => H - pad.b - (n / top) * (H - pad.t - pad.b);
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'How the crowd answered');
  const add = (tag, attrs, text) => {
    const e = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text != null) e.textContent = text;
    svg.append(e);
    return e;
  };
  const gap = bars.length > 40 ? 0.5 : 2;
  for (const b of bars) {
    const w = Math.max(1, X(b.x1) - X(b.x0) - gap);
    const r = add('rect', { x: X(b.x0) + gap / 2, y: Y(b.n), width: w, height: Math.max(0, H - pad.b - Y(b.n)), fill: css('--bar'), rx: Math.min(3, w / 2) });
    r.append(Object.assign(document.createElementNS(ns, 'title'), { textContent: `${b.label ?? `${Math.round(b.x0)}${b.x1 - b.x0 > 1.5 ? `–${Math.round(b.x1) - 1}` : ''}`}: ${b.n} bots (${((100 * b.n) / s.size).toFixed(1)}%)` }));
  }
  add('line', { x1: pad.l, x2: W - pad.r, y1: H - pad.b, y2: H - pad.b, stroke: css('--muted'), 'stroke-width': 1 });
  for (const t of ticks) add('text', { x: X(t.v), y: H - pad.b + 16, 'text-anchor': 'middle' }, t.text);
  const marker = (v, colour, text, row) => {
    if (v < x0 || v > x1) return;
    add('line', { x1: X(v), x2: X(v), y1: pad.t - 4, y2: H - pad.b, stroke: colour, 'stroke-width': 2, 'stroke-dasharray': '4 3' });
    add('text', { x: X(v), y: 10 + row * 12, 'text-anchor': 'middle', style: `fill:${colour};font-weight:600` }, text);
  };
  const bestV = q.template === 'tank' ? q.params.N : s.bestAnswers[Math.floor(s.bestAnswers.length / 2)];
  marker(xOf(bestV), css('--best'), q.template === 'tank' ? `N = ${q.params.N}` : 'best', 0);
  if (a != null) marker(xOf(a), css('--you'), 'you', 1);
  const caption = q.template === 'selfref' ? `Vote: ${(100 * (1 - s.noShare)).toFixed(0)}% YES, ${(100 * s.noShare).toFixed(0)}% NO. Bars: % guesses.` : null;
  return el('div', {}, svg, caption && el('div', { class: 'note' }, caption));
}

function depthBar(s) {
  const parts = [...s.levelCounts.map((n, k) => ({ n, label: `L${k}`, colour: `color-mix(in oklab, ${css('--accent')} ${25 + k * 18}%, ${css('--surface')})` })),
    { n: s.theorists, label: 'theorists', colour: css('--best') }, { n: s.jokers, label: 'jokers', colour: css('--you') }].filter((p) => p.n > 0);
  return el('div', { style: 'margin-top:8px' },
    el('div', { class: 'eyebrow' }, `Crowd depth mix · average ${s.depth.toFixed(1)} steps`),
    el('div', { class: 'depth' }, parts.map((p) => el('span', { style: `width:${(100 * p.n) / s.size}%;background:${p.colour}`, title: `${p.label}: ${p.n}` }))),
    el('div', { class: 'legend' }, parts.map((p) => el('span', {}, el('i', { class: 'key', style: `background:${p.colour}` }), `${p.label} ${((100 * p.n) / s.size).toFixed(0)}%`))));
}

function renderTotal(date) {
  const done = scores.filter((x) => x !== undefined);
  const total = done.reduce((a, b) => a + b, 0);
  const n = dates.indexOf(date) + 1;
  const deepest = done.length ? scores.indexOf(Math.max(...done)) + 1 : null;
  $('total').replaceChildren(
    el('div', { class: 'row' }, el('span', { class: 'score' }, `${total}/${done.length * 100}`), el('span', { class: 'note' }, `${done.length} of 5 answered`)),
    done.length === 5 ? el('div', {}, `🧠 Stratle #${n} — ${total}/500, deepest read: Q${deepest}`) : null,
  );
}

window.addEventListener('hashchange', () => {
  const d = location.hash.slice(1);
  if (dates.includes(d) && d !== $('date').value) load(d);
});
load(dates.includes(location.hash.slice(1)) ? location.hash.slice(1) : dates.includes(todayUtc) ? todayUtc : dates[0]);
