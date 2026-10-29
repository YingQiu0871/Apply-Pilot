// Data directory helpers for `init` and the panel's folder picker: look at a
// folder, create one from a template, and suggest a default location.
import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { paths } from './config.mjs';
import { Tracker } from './tracker.mjs';

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const expand = (p) => resolve(String(p).trim().replace(/^~(?=$|[\\/])/, homedir()));

/** Documents/Apply-Pilot; the user can type any other folder. */
export function suggestedHome() {
  return join(homedir(), 'Documents', 'Apply-Pilot');
}

/** What is in a folder: does it hold Apply-Pilot data already? */
export function inspectHome(input) {
  const home = expand(input);
  const exists = existsSync(home);
  if (exists && !statSync(home).isDirectory()) return { home, exists, isFile: true, hasProfile: false, hasTracker: false, rows: 0 };
  const p = paths(home);
  const hasProfile = existsSync(p.profile);
  const hasTracker = existsSync(p.tracker);
  return { home, exists, isFile: false, hasProfile, hasTracker, rows: hasTracker ? new Tracker(p.tracker).rows().length : 0 };
}

/** Create the data folder; existing files are kept. Returns what was written. */
export function initHome(input, example = 'generic') {
  const home = expand(input);
  const src = example === 'generic' ? join(PKG, 'config', 'profile.example.json') : join(PKG, 'examples', example, 'profile.json');
  if (!existsSync(src)) throw new Error(`no example "${example}"`);
  mkdirSync(join(home, 'data'), { recursive: true });
  const p = paths(home);
  const wrote = [];
  if (!existsSync(p.profile)) { copyFileSync(src, p.profile); wrote.push(p.profile); }
  if (!existsSync(p.tracker)) { new Tracker(p.tracker).save(); wrote.push(p.tracker); }
  const ignore = join(home, '.gitignore');
  if (!existsSync(ignore)) { writeFileSync(ignore, 'browser/\ninbox/\noutput/\n*.xlsx\n.env\n'); wrote.push(ignore); }
  return { home, wrote };
}
