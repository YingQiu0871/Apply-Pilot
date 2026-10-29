// Profile and path resolution. Everything personal lives in the data directory,
// never in the package: APPLY_PILOT_HOME (default ./apply-data) holds
// profile.json, data/applications.md, inbox/ and output/.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const DEFAULTS = {
  tracker: 'data/applications.md',
  inbox: 'inbox',
  output: 'output',
  followUp: { afterDays: 14, maxFollowUps: 1, skipAppliedBefore: null },
  scoring: { thresholds: { apply: 80, consider: 65 }, dimensions: [] },
  filters: { excludeCompanies: [], excludeKeywords: [], requireKeywords: [] },
  writing: { bannedPhrases: [], forbiddenClaims: [], maxSemicolons: 0 },
  sources: {},
};

export function homeDir() {
  return resolve(process.env.APPLY_PILOT_HOME || 'apply-data');
}

export function profilePath(home = homeDir()) {
  return process.env.APPLY_PILOT_PROFILE ? resolve(process.env.APPLY_PILOT_PROFILE) : join(home, 'profile.json');
}

function merge(base, extra) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return extra ?? base;
  const out = { ...base };
  for (const [k, v] of Object.entries(extra || {})) out[k] = k in base ? merge(base[k], v) : v;
  return out;
}

/** Load KEY=VALUE lines from APPLY_PILOT_HOME/.env without overriding the real environment. */
export function loadEnv(home = homeDir()) {
  const file = join(home, '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

export function loadProfile(home = homeDir()) {
  const file = profilePath(home);
  const raw = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  return merge(DEFAULTS, raw);
}

export function paths(home = homeDir(), profile = loadProfile(home)) {
  const at = (p) => resolve(home, p);
  return {
    home,
    profile: profilePath(home),
    tracker: process.env.APPLY_PILOT_TRACKER ? resolve(process.env.APPLY_PILOT_TRACKER) : at(profile.tracker),
    inbox: at(profile.inbox),
    output: at(profile.output),
  };
}

// Dates in the tracker are local calendar dates; toISOString() is UTC and
// would put late-evening actions on the previous day.
export const localDate = (d = new Date()) => d.toLocaleDateString('sv-SE');
