import { target } from './target.js';
import { avoid } from './avoid.js';
import { underbid } from './underbid.js';
import { threshold } from './threshold.js';
import { common } from './common.js';
import { catchpoints } from './catchpoints.js';
import { splitsteal } from './splitsteal.js';
import { selfref } from './selfref.js';
import { tank } from './tank.js';
import { lowball } from './lowball.js';
import { crowdpoints } from './crowdpoints.js';
import { rare } from './rare.js';

export const TEMPLATES = { target, avoid, underbid, threshold, common, catch: catchpoints, splitsteal, selfref, tank, lowball, crowdpoints, rare };
