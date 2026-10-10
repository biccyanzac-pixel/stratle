# Stratle: notes for coding agents

Daily game theory against a simulated crowd of 10,000 cognitive-hierarchy bots. Read `../jacob.gg/PLAYBOOK.md`
first (house rules, kit, hub, workers, deploy).

## Layout
- `site/js/engine/`: the engine, pure ES modules with no Node APIs, so the browser and the worker can use it.
  - `ch.js`: Poisson level weights, the generic best-response solver, noise, crowd sampling.
  - `templates/`: one file per question template (contract in `templates/README.md`).
  - `question.js`: daily settings from the date seed, question generation, crowd encoding, scoring, reveal summary.
  - `config.js`: crowd size and daily jitter; re-exports `calibrated.js` (generated: weekday personas and
    per-family scaling, from `calibration/apply.js`; never edit by hand).
- `data/schedule.json`: which 5 templates and params each date gets, 2026-10-12 .. 2028-10-10. Built by
  `scripts/schedule.js` (rules in `scripts/schedule-lib.js`: 5 different templates a day, no template repeats its
  exact params within 90 days). Not deployed.
- `site/data/days/<date>.json`: the day files the site plays (settings, 5 questions with params and crowd counts),
  written by `scripts/generate.js`. They are the golden fixtures: `test/schedule.test.js` regenerates a spread of
  them and requires identical bytes.
- `scripts/simulate.js`: print one simulated question (`node scripts/simulate.js 2026-10-14 tank`).
- `site/`: the game (`index.html`, `js/app.js`, `js/chart.js`, `js/api.js`, `js/daily.js` with `EPOCH = 2026-10-10`,
  never change it). Same structure and components as Factle; kit loaded first.
- `worker/`: leaderboard (Cloudflare Worker + D1 `stratle-leaderboard`). Scores answers itself with the shared engine
  against the day file fetched from the site (`SITE_URL`). Stores every answer (`answers`) for the later human layer;
  the hub counts plays from `totals`.
- `preview/`: local day explorer (`npm run preview` → http://localhost:8084/preview/), not deployed.
- `calibration/`: datasets (`datasets/published.json`), the fitter (`fit.js` → `fit.json`), `apply.js`
  (→ `calibrated.js`), and `tools/` (digitisers, dataset builder, plots, report). Full pipeline in
  `docs/calibration.md`. `calibration/raw/` (downloaded papers/charts) and `calibration/private/` (YouTube data,
  its histograms and plots) are git-ignored: never commit or publish anything from them, including derived stats.

## Rules
- No randomness at play time. Crowds are generated offline from seeds (`stratle|<date>|q<i>`) and shipped as day
  files; the browser only scores. Never change a past or current day:
  - schedule: `node scripts/schedule.js` keeps every day up to today (`--keep-until`) and re-plans only later days;
  - day files: `node scripts/generate.js --regenerate-future` rewrites only days after today, and fails if the
    engine would change a published day (then the engine change must be reverted or versioned).
- The YouTube survey spreadsheet is for calibration only: never commit or redistribute it, or histograms, means
  or plots derived from it. Its fitted model settings are fine to publish.
- Refitting or editing `calibrated.js`, or changing a template, changes future crowds: run
  `node scripts/generate.js --regenerate-future` and commit the changed future day files.
- No small LLMs anywhere. Free project: ask the owner before anything paid.
- UI (Phase 4): copy the page structure and components from `../perceptle` or `../factle` so it looks like the others.
- Hub registration (`games.json`, card, hub worker `sources.js`, kit `NAMES`, PLAYBOOK port table) is the **very
  last step**, after checking `git status` in `../jacob.gg`: other agents may be editing it.
- Ports: site/preview 8084, worker 8841 (in the PLAYBOOK table).
- `splitsteal` is retired from the schedule (steal wins ~74% of days); the template stays for a possible redesign.
- Commit as `biccyanzac-pixel <285977456+biccyanzac-pixel@users.noreply.github.com>` (repo-local).

## Tests
`npm test` (Node 24, no dependencies): determinism, golden day files, schedule rules, calibration still matching the
real datasets, solver hand-checks for all 9 templates, scoring edge cases, explanations built from data. Worker API: `cd worker && npm run db:init:local && npm run dev:local`, then `npm test`
in `worker/`. UI: `npm run preview` + the local worker, then `node tools/e2e-ui.mjs`.

## Phases (stop after each for the owner)
1. Crowd simulator + first 3 templates (target, avoid, underbid) + tests. **Done.**
2. Calibration against real datasets, `docs/calibration.md`. **Done** (beauty, beautyUp, avoid, underbid).
3. Remaining templates (calibrated on the YouTube survey), daily generation, 2-year schedule. **Done.**
4. Game UI, scoring, reveal, share. **Live** (leaderboard included).
5. Human score after midnight (min 2 players) with human-vs-bot overlay, recalibration from `answers`. Storage is live.
