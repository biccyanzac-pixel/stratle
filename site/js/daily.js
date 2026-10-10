// Shared by the site and the leaderboard worker (worker/src/index.js imports this file),
// so the day, the puzzle number and the share text can never disagree between the two.

export const EPOCH = '2026-10-10'; // Stratle #1. Never change once live: it renumbers every day.
export const QUESTIONS = 5;

/** UTC day key YYYY-MM-DD. */
export function todayKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function dayNumber(day) {
  return Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${EPOCH}T00:00:00Z`)) / 864e5) + 1;
}

export function addDays(day, n) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
}

export function msUntilNextUtcDay(now = Date.now()) {
  return Math.ceil((now + 1) / 864e5) * 864e5 - now;
}

export function validDay(day) {
  return typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day)
    && !Number.isNaN(Date.parse(`${day}T00:00:00Z`))
    && new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day;
}

/** One emoji per question: 🟩 80+, 🟨 40+, 🟥 below. */
export function scoreEmoji(points) {
  if (points === null || points === undefined) return '⬜';
  return points >= 80 ? '🟩' : points >= 40 ? '🟨' : '🟥';
}
