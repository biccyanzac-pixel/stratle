// Crowd settings. The calibrated values (personas per weekday, family scaling) are generated into
// calibrated.js by calibration/apply.js; this file holds the hand-set parts.

export { PERSONAS, PERSONA_BY_WEEKDAY, FAMILY } from './calibrated.js';

export const CROWD_SIZE = 10000;

// Day-to-day variation around the weekday's persona, as relative spreads drawn from the date seed:
// τ × (1 ± 0.1), and so on. Exact share and imagined-crowd size are not jittered.
export const JITTER = { tau: 0.1, noise: 0.15, eq: 0.25, joker: 0.25 };
