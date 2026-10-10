-- D1 schema for Stratle's shared daily leaderboard.
-- The browser sends only (day, question, answer). The worker fetches the day file from the site and scores the
-- answer itself with the shared engine (site/js/engine), so a client can't claim points.

CREATE TABLE IF NOT EXISTS players (
  id         TEXT PRIMARY KEY,   -- server-generated UUID
  token_hash TEXT NOT NULL,      -- SHA-256 of a server-issued session token
  created_at TEXT NOT NULL
);

-- One row per (player, day, board, question). Insert-only: the first answer counts.
-- These are also the real-player answers for the later human-crowd layer and recalibration.
CREATE TABLE IF NOT EXISTS answers (
  id           TEXT PRIMARY KEY,
  player_id    TEXT NOT NULL REFERENCES players (id),
  day_key      TEXT NOT NULL,                       -- puzzle's UTC day, YYYY-MM-DD
  is_late      INTEGER NOT NULL DEFAULT 0,          -- 1 = replayed from the archive after its day
  q            INTEGER NOT NULL CHECK (q >= 0 AND q < 5),
  template     TEXT NOT NULL,
  answer       INTEGER NOT NULL,
  points       INTEGER NOT NULL CHECK (points >= 0 AND points <= 100),
  submitted_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS answers_player_q ON answers (player_id, day_key, is_late, q);
CREATE INDEX IF NOT EXISTS answers_day ON answers (day_key, is_late, q);

-- Running totals per player per day/board, so a leaderboard view reads ~20 rows instead of every answer
-- (D1 free plan: 5M rows read/day). The jacob.gg hub counts plays from this table (one row per player per day).
CREATE TABLE IF NOT EXISTS totals (
  player_id    TEXT NOT NULL,
  day_key      TEXT NOT NULL,
  is_late      INTEGER NOT NULL,
  display_name TEXT NOT NULL,
  total        INTEGER NOT NULL,
  played       INTEGER NOT NULL,
  rounds       TEXT NOT NULL,     -- comma-separated points per question, in order
  last_at      TEXT NOT NULL,
  PRIMARY KEY (player_id, day_key, is_late)
);
CREATE INDEX IF NOT EXISTS totals_board ON totals (day_key, is_late, total DESC, last_at ASC);

-- Per-day counters for the board header and the archive list.
CREATE TABLE IF NOT EXISTS day_stats (
  day_key TEXT NOT NULL,
  is_late INTEGER NOT NULL,
  players INTEGER NOT NULL,
  top     INTEGER NOT NULL,
  PRIMARY KEY (day_key, is_late)
);

-- Per-question counters: the "average real player" shown in each reveal.
CREATE TABLE IF NOT EXISTS question_stats (
  day_key TEXT NOT NULL,
  is_late INTEGER NOT NULL,
  q       INTEGER NOT NULL,
  n       INTEGER NOT NULL,
  sum     INTEGER NOT NULL,
  PRIMARY KEY (day_key, is_late, q)
);
