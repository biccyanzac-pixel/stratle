// Fits the crowd model to every calibration dataset.
//   node calibration/fit.js            all datasets (published + private YouTube if present)
//   node calibration/fit.js ft nyt2015 only these ids
// Writes calibration/fit.json (no raw data in it: only fitted settings, metrics and model curves).
//
// For each dataset: grid search over imagined-crowd size (sample), noise and τ, then the theorist and
// joker shares (cheap: they only change the final mix), then a finer τ pass. Datasets that report only
// a mean fit τ alone, holding the other settings at their family's median from the full-histogram fits.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { TEMPLATES } from '../site/js/engine/templates/index.js';
import { solveLevels, expectedCrowd } from '../site/js/engine/ch.js';
import { meanOf } from '../site/js/engine/dist.js';

const here = (p) => new URL(p, import.meta.url);
const SEED = 'stratle|calibration';
const TAUS = range(0.2, 5.0, 0.1);
const NOISES = [0.02, 0.04, 0.07, 0.1, 0.14, 0.2, 0.28];
const EXACTS = [0, 0.2, 0.4, 0.6];
const JOKERS = [0, 0.01, 0.02, 0.03, 0.05, 0.07, 0.1, 0.13, 0.17, 0.22, 0.28, 0.35];
const EQS = [0, 0.01, 0.02, 0.03, 0.05, 0.07, 0.1, 0.13, 0.16, 0.2, 0.25, 0.3];
const SAMPLES = [0, 2, 3, 5, 8, 15, 30];

function range(a, b, step) {
  const out = [];
  for (let x = a; x <= b + 1e-9; x += step) out.push(Math.round(x * 1000) / 1000);
  return out;
}

/**
 * Fit metrics. W1 (earth-mover distance between the CDFs) and the mean error are in % of the answer
 * range; TV is the share of answers in the wrong place on 5%-wide bins, TV1 on single numbers.
 * Loss = W1 + 20·TV + 10·TV1 + mean error (the reported mean, which beats a digitised one).
 * Choice games (options have no order) use TV over the options only: loss = 30·TV.
 */
function metrics(ds, model, tpl) {
  const { min, max } = model;
  const span = max - min;
  const m = { modelMean: meanOf(model) };
  if (tpl.kind === 'choice') {
    m.tv = model.w.reduce((s, x, i) => s + Math.abs(x - ds.freq[i]), 0) / 2;
    m.loss = 30 * m.tv;
    return m;
  }
  if (ds.reported?.mean !== undefined) m.meanErr = (100 * Math.abs(m.modelMean - ds.reported.mean)) / span;
  if (ds.freq) {
    let cm = 0, cd = 0, w1 = 0, ks = 0;
    const width = Math.max(1, Math.round(span / 20));
    const binsM = {}, binsD = {};
    model.w.forEach((x, i) => {
      cm += x; cd += ds.freq[i];
      w1 += Math.abs(cm - cd);
      ks = Math.max(ks, Math.abs(cm - cd));
      const b = Math.floor(i / width);
      binsM[b] = (binsM[b] ?? 0) + x;
      binsD[b] = (binsD[b] ?? 0) + ds.freq[i];
    });
    m.w1 = (100 * w1) / span;
    m.ks = ks;
    m.tv = Object.keys(binsM).reduce((s, b) => s + Math.abs(binsM[b] - binsD[b]), 0) / 2;
    m.loss = m.w1 + 20 * m.tv + (m.meanErr ?? 0);
    if (span <= 100) {
      // Per-number gap, so the sharp spikes (33, 22, 50, 0) count on 0-100 games.
      m.tv1 = model.w.reduce((s, x, i) => s + Math.abs(x - ds.freq[i]), 0) / 2;
      m.loss += 10 * m.tv1;
    }
  } else if (ds.bins) {
    const share = (lo, hi) => model.w.slice(lo - min, hi - min + 1).reduce((a, b) => a + b, 0);
    m.tv = ds.bins.reduce((s, [lo, hi, p]) => s + Math.abs(share(lo, hi) - p), 0) / 2;
    m.loss = 20 * m.tv + (m.meanErr ?? 0);
  } else {
    m.loss = m.meanErr;
  }
  return m;
}

/** A dataset's parts: several questions fitted with one set of settings, or the dataset itself. */
const partsOf = (ds) => ds.parts ?? [ds];

/** Every theorist/joker combination for one (τ, noise, exact, sample); loss is the mean over parts. */
function evaluate(ds, s) {
  const solved = partsOf(ds).map((part) => {
    const tpl = TEMPLATES[part.template];
    const { levels, f } = solveLevels(tpl, part.params, { tau: s.tau, noise: s.noise, exact: s.exact, sample: s.sample, seed: SEED });
    return { part, tpl, levels, f, eqAnswers: tpl.equilibrium(part.params) };
  });
  const jokers = s.joker === undefined ? JOKERS : [s.joker];
  const anyEq = solved.some((x) => x.eqAnswers !== null);
  const eqs = !anyEq ? [0] : s.eq === undefined ? EQS : [s.eq];
  const out = [];
  for (const joker of jokers) for (const eq of eqs) {
    const each = solved.map(({ part, tpl, levels, f, eqAnswers }) => {
      const model = expectedCrowd({ levels, f, eq, eqAnswers, joker, jokers: tpl.jokers(part.params) });
      return { model, m: metrics(part, model, tpl) };
    });
    const loss = each.reduce((a, x) => a + x.m.loss, 0) / each.length;
    out.push({ settings: { ...s, joker, eq }, each, m: { ...each[0].m, loss } });
  }
  return out;
}

function fit(ds, fixed) {
  const kinds = partsOf(ds).map((p) => TEMPLATES[p.template].kind);
  let best = null;
  const consider = (r) => { if (!best || r.m.loss < best.m.loss) best = r; };
  const samples = fixed ? [fixed.sample] : SAMPLES;
  const noises = fixed ? [fixed.noise] : NOISES;
  const exacts = fixed ? [fixed.exact] : kinds.includes('number') ? EXACTS : [0];
  for (const sample of samples) for (const noise of noises) for (const exact of exacts) for (const tau of TAUS) {
    evaluate(ds, { tau, noise, exact, sample, joker: fixed?.joker, eq: fixed?.eq }).forEach(consider);
  }
  const t = best.settings.tau;
  for (const tau of range(Math.max(0.05, t - 0.1), t + 0.1, 0.02)) {
    evaluate(ds, { ...best.settings, tau }).forEach(consider);
  }
  return best;
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
}

const load = (p) => (existsSync(here(p)) ? JSON.parse(readFileSync(here(p), 'utf8')) : []);
const published = load('./datasets/published.json').map((d) => ({ ...d, private: false }));
const youtube = load('./private/youtube.json').map((d) => ({ ...d, private: true }));
const only = process.argv.slice(2);
const all = [...published, ...youtube].filter((d) => !only.length || only.includes(d.id));

const previous = only.length ? load('./fit.json').datasets ?? {} : {};
const results = {};
const round = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Math.round(v * 10000) / 10000]));
const curve = (d) => ({ min: d.min, max: d.max, w: d.w.map((x) => Math.round(x * 1e6) / 1e6) });
const report = (ds, r, ms) => {
  results[ds.id] = {
    label: ds.label, family: ds.family, template: ds.template, params: ds.params, n: ds.n, private: ds.private,
    // Private (YouTube) datasets keep only the fit, never statistics of the data itself.
    kind: ds.parts ? 'parts' : ds.freq ? 'freq' : ds.bins ? 'bins' : 'mean', reported: ds.private ? {} : ds.reported,
    settings: r.settings,
    metrics: round(r.m),
    model: curve(r.each[0].model),
    ...(ds.parts && {
      parts: ds.parts.map((p, i) => ({ label: p.label, template: p.template, params: p.params, metrics: round(r.each[i].m), model: curve(r.each[i].model) })),
    }),
  };
  const m = r.m;
  console.log(`${ds.id.padEnd(16)} τ=${r.settings.tau.toFixed(2)} noise=${r.settings.noise} exact=${r.settings.exact} joker=${r.settings.joker} eq=${r.settings.eq} sample=${r.settings.sample}  ` +
    `loss ${m.loss.toFixed(2)} mean ${m.modelMean.toFixed(2)} vs ${ds.reported?.mean ?? '-'}  ${m.w1 !== undefined ? `W1 ${m.w1.toFixed(2)}% ` : ''}${m.tv !== undefined ? `TV ${m.tv.toFixed(3)} ` : ''}(${ms} ms)`);
};

const full = all.filter((d) => d.freq || d.bins || d.parts);
for (const ds of full) {
  const t0 = Date.now();
  report(ds, fit(ds), Date.now() - t0);
}

// Mean-only datasets borrow the other settings from the published full-histogram fits in their family.
for (const ds of all.filter((d) => !d.freq && !d.bins && !d.parts)) {
  const fam = Object.values({ ...previous, ...results }).filter((r) => r.family === ds.family && r.kind !== 'mean' && !r.private);
  if (!fam.length) { console.log(`${ds.id}: no full fits in family ${ds.family} to borrow from, skipped`); continue; }
  const fixed = {
    noise: median(fam.map((r) => r.settings.noise)),
    exact: median(fam.map((r) => r.settings.exact)),
    joker: median(fam.map((r) => r.settings.joker)),
    eq: median(fam.map((r) => r.settings.eq)),
    sample: median(fam.map((r) => r.settings.sample)),
  };
  const t0 = Date.now();
  report(ds, fit(ds, fixed), Date.now() - t0);
}

const outPath = here('./fit.json');
writeFileSync(outPath, `${JSON.stringify({ generated: new Date().toISOString().slice(0, 10), datasets: { ...previous, ...results } }, null, 1)}\n`);
console.log(`wrote calibration/fit.json`);
