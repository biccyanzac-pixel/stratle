# Stratle

Daily game theory against a simulated crowd: https://biccyanzac-pixel.github.io/stratle/ (part of [jacob.gg](https://biccyanzac-pixel.github.io/jacob.gg/)).

Five questions a day ("closest to 2/3 of the average", "bid under the line", "least common choice", the German tank
problem, ...). Every answer is scored against the same crowd of 10,000 bots: a cognitive-hierarchy model calibrated
on real beauty-contest experiments and surveys ([docs/calibration.md](docs/calibration.md)). The crowds are
generated offline and shipped as day files; the browser only scores.

| What | Where |
| --- | --- |
| Engine (crowd model, templates, scoring) | `site/js/engine/` |
| Game page | `site/` (GitHub Pages, `gh-pages` branch) |
| Schedule and day files | `data/schedule.json`, `site/data/days/` |
| Leaderboard worker (Cloudflare + D1) | `worker/` |
| Calibration | `calibration/`, `docs/calibration.md` |
| Local day explorer | `npm run preview` → http://localhost:8084/preview/ |

Tests: `npm test`; worker API: `cd worker && npm run db:init:local && npm run dev:local`, then `npm test` there;
UI: `npm run preview` plus the local worker, then `node tools/e2e-ui.mjs`.

Deploy: site `git subtree split --prefix site -b gh-pages && git push -f origin gh-pages`; worker `cd worker && npx wrangler deploy`.
See `CLAUDE.md` and `../jacob.gg/PLAYBOOK.md`.
