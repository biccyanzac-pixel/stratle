// localStorage, wrapped so the game works with storage blocked or empty (private mode, cleared data).
// Progress per day: { rounds: [{ answer, points }] } (one entry per question).
// Today's real game and archive replays are kept apart ('day' vs 'late').

const KEY = 'stratle:progress:v1';

function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}

let mem = readAll();

function writeAll() {
  try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch { /* storage blocked: progress lasts for this page */ }
}

const k = (day, late) => `${late ? 'late' : 'day'}:${day}`;

export function progress(day, late = false) {
  const p = mem[k(day, late)] || {};
  return { rounds: p.rounds || [] };
}

export function saveRound(day, late, index, result) {
  const p = progress(day, late);
  p.rounds[index] = result;
  mem[k(day, late)] = p;
  writeAll();
}

/** Consecutive days (ending today or yesterday) with all rounds finished on the day itself. */
export function streak(today, addDays, rounds) {
  let n = 0;
  let d = progress(today).rounds.filter(Boolean).length === rounds ? today : addDays(today, -1);
  while (progress(d).rounds.filter(Boolean).length === rounds) { n++; d = addDays(d, -1); }
  return n;
}
