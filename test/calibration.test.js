import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TEMPLATES } from '../site/js/engine/templates/index.js';
import { solveLevels, expectedCrowd } from '../site/js/engine/ch.js';
import { meanOf } from '../site/js/engine/dist.js';
import { PERSONAS } from '../site/js/engine/config.js';

const datasets = JSON.parse(readFileSync(new URL('../calibration/datasets/published.json', import.meta.url), 'utf8'));

test('each persona reproduces its real crowd: 2/3-game mean within 1 point', () => {
  for (const [id, p] of Object.entries(PERSONAS)) {
    const ds = datasets.find((d) => d.id === id);
    assert.ok(ds, `persona ${id} has a dataset`);
    const tpl = TEMPLATES[ds.template];
    const { levels, f } = solveLevels(tpl, ds.params, { ...p, seed: 'stratle|calibration' });
    const crowd = expectedCrowd({ levels, f, eq: p.eq, eqAnswers: tpl.equilibrium(ds.params), joker: p.joker, jokers: tpl.jokers(ds.params) });
    const mean = meanOf(crowd);
    assert.ok(Math.abs(mean - ds.reported.mean) <= 1, `${id}: model mean ${mean.toFixed(2)} vs real ${ds.reported.mean}`);
    assert.ok(Math.abs(mean - p.mean) < 1e-3, `${id}: calibrated.js is stale (rerun node calibration/apply.js)`);
  }
});

test('every published dataset records its source and terms', () => {
  for (const d of datasets) {
    assert.ok(d.source?.url && d.source?.terms, d.id);
    assert.ok(d.freq || d.bins || d.mean, d.id);
  }
});
