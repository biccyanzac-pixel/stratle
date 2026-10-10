# Question templates

Each template is a plain object registered in `index.js`. The solver (`../ch.js`) only uses these parts:

| Part | What it does |
| --- | --- |
| `id`, `family`, `kind` | `kind` is `'number'` (Gaussian noise around best answers) or `'choice'` (answers are option indexes; best options share 1 − noise, everything gets noise). `family` (a string, or a function of params) picks the calibration settings in `../calibrated.js`. |
| `options(params)` | Choice templates: the option labels, in answer-index order. |
| `sampleParams(rng)` | Draws the question's parameters from its seed. Must return plain JSON. |
| `grid(params)` | `{ min, max }`: the whole-number answers allowed. |
| `level0(params)` | The naive answer distribution (uniform, or a naive default). |
| `jokers(params)` | Meme answers (0, 100, 69, …) that a small share of bots give. All must be inside the grid. |
| `equilibrium(params)` | The answers perfectly logical players end up at (an array, e.g. `[0, 1]` in the 2/3 game), or `null` if there is none. A calibrated share of "theorist" bots play these. |
| `prompt(params)` | The question text. |
| `prepare(params, dist)` | Precomputes what the payoff needs from a crowd (mean, median, target, window, …). `dist` holds probabilities (a bot's belief) or integer counts (the real crowd). |
| `payoff(params, ctx, answer)` | The payoff of one answer against that crowd. The score is payoff ÷ the best payoff on the grid. |
| `reveal(params, ctx, dist)` | Extra numbers for the reveal (target, window, line, …), merged into the summary. |
| `explain(params, summary)` | The reveal paragraph, built only from `summary` (see `summarize` in `../question.js`). |

Optional hooks:

| Part | When |
| --- | --- |
| `bestResponse(params, belief, opts)` | Bots cannot see what scoring uses (the tank's real N): return `{ answers, payoff }` from what they can know. Scoring still uses `payoff`. |
| `noisy(params, answers, noise, exact)` | Answers that are not a plain line or a list of options (selfref's vote × 101 + guess). |
| `label(params, answer)` | How to show an encoded answer (selfref: "YES, 70%"). |

Templates: `target` (1), `avoid` (2), `underbid` (3), `threshold` (4), `common` (5), `catch` (6, in `catchpoints.js`),
`splitsteal` (7), `selfref` (8), `tank` (9).

Rules:
- A payoff must be a function of the crowd *distribution*: one player's own answer does not move a crowd of
  10,000, so it is ignored. `prepare` must also work on a small imagined crowd (a handful of integer counts):
  bots with a calibrated `sample` size judge answers against those.
- Keep exact arithmetic where the real crowd uses integer counts: compare `answer × D` with `N` rather than
  dividing, so equal distances and "strictly below" are decided exactly.
- `sampleParams` needs a large parameter space: the schedule never repeats a template's exact params within 90 days,
  and each template comes up about 50 times in that window.
- Adding a template changes no other template's crowds, but it does change the schedule from the day it is added:
  extend the schedule only for days after today.
