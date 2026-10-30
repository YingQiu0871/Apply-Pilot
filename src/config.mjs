// Profile and path resolution. Everything personal lives in the data directory,
// never in the package: it holds profile.json, data/applications.md, inbox/
// and output/. The directory is APPLY_PILOT_HOME if set, else the one chosen
// in the panel (saved in the user settings file), else ./apply-data.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

export const DEFAULTS = {
  tracker: 'data/applications.md',
  inbox: 'inbox',
  output: 'output',
  followUp: { afterDays: 14, maxFollowUps: 1, skipAppliedBefore: null },
  scoring: { thresholds: { apply: 80, consider: 65 }, dimensions: [] },
  filters: { excludeCompanies: [], excludeKeywords: [], requireKeywords: [] },
  writing: { bannedPhrases: [], forbiddenClaims: [], maxSemicolons: 0 },
  sources: {},
  daily: { evaluate: 10, followups: 5 },
};

/** Per-user settings (not personal data): which data directory to use. */
export function settingsFile() {
  if (process.env.APPLY_PILOT_SETTINGS) return resolve(process.env.APPLY_PILOT_SETTINGS);
  if (process.platform === 'win32') return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'Apply-Pilot', 'settings.json');
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'Apply-Pilot', 'settings.json');
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'apply-pilot', 'settings.json');
}

function readSettings() {
  try { return JSON.parse(readFileSync(settingsFile(), 'utf8')); } catch { return {}; }
}

export function savedHome() {
  const h = readSettings().home;
  return typeof h === 'string' && h ? resolve(h) : null;
}

export function saveHome(home) {
  const file = settingsFile();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ ...readSettings(), home: resolve(home) }, null, 2)}\n`);
  return file;
}

/** Where the data directory comes from: 'env', 'settings' or 'default'. */
export function homeSource() {
  if (process.env.APPLY_PILOT_HOME) return 'env';
  return savedHome() ? 'settings' : 'default';
}

export function homeDir() {
  return resolve(process.env.APPLY_PILOT_HOME || savedHome() || 'apply-data');
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

/** Save one KEY=VALUE line in APPLY_PILOT_HOME/.env and use it from now on. */
export function saveEnv(home, name, value) {
  const file = join(home, '.env');
  const lines = existsSync(file) ? readFileSync(file, 'utf8').split(/\r?\n/).filter((l, i, all) => l || i < all.length - 1) : [];
  const at = lines.findIndex((l) => l.match(/^\s*([A-Z0-9_]+)\s*=/)?.[1] === name);
  if (at >= 0) lines[at] = `${name}=${value}`; else lines.push(`${name}=${value}`);
  mkdirSync(home, { recursive: true });
  writeFileSync(file, `${lines.join('\n')}\n`);
  process.env[name] = value;
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
