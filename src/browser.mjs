// Reads a page that only appears in a real browser. It runs the Chrome or Edge
// already on this computer, headless, with an empty throwaway profile, so it has
// none of your sign-ins and leaves nothing behind. It prints one page and exits:
// no clicks, no typing, no form. A page asking for a human check is left alone.
//
// Sites the user opened through "sign in to a site" are the exception. They use a
// separate profile in the data folder, never the user's everyday browser profile,
// and only the user's own action adds a site. A link in a posting cannot.
import { execFile, spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { which } from './agents.mjs';

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.localhost|127\.\S*|10\.\S*|192\.168\.\S*|169\.254\.\S*|172\.(1[6-9]|2\d|3[01])\.\S*|0\.0\.0\.0|\[.*\])$/i;

/** Only public web pages: a posting must not be able to point at this computer or its network. */
export function assertPublicUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`not a web address: ${value}`); }
  if (!/^https?:$/.test(url.protocol) || PRIVATE_HOST.test(url.hostname)) throw new Error(`not a public web page: ${url.protocol}//${url.hostname}`);
  return url.href;
}

function installed() {
  const env = process.env;
  if (process.platform === 'win32') {
    const roots = [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA].filter(Boolean);
    return roots.flatMap((r) => [join(r, 'Google', 'Chrome', 'Application', 'chrome.exe'), join(r, 'Microsoft', 'Edge', 'Application', 'msedge.exe')]);
  }
  if (process.platform === 'darwin') return ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium'];
  return [];
}

/** APPLY_PILOT_BROWSER, else Chrome or Edge from the usual places, else PATH. */
export function findBrowser() {
  const set = process.env.APPLY_PILOT_BROWSER;
  if (set) return existsSync(set) ? set : null;
  return installed().find((p) => existsSync(p)) || ['chrome', 'google-chrome', 'chromium', 'chromium-browser', 'msedge', 'microsoft-edge'].map(which).find(Boolean) || null;
}

export const loginProfile = (home) => join(home, 'browser', 'apply-pilot');
const sitesFile = (home) => join(home, 'browser', 'sites.json');

export function readSites(home) {
  try { return JSON.parse(readFileSync(sitesFile(home), 'utf8')); } catch { return []; }
}
const saveSites = (home, sites) => writeFileSync(sitesFile(home), `${JSON.stringify(sites, null, 2)}\n`);

const siteOf = (url) => new URL(assertPublicUrl(url)).hostname.replace(/^www\./, '').toLowerCase();
const within = (host, site) => host === site || host.endsWith(`.${site}`);

/** A listed site and its subdomains. */
export function siteAllowed(url, sites) {
  let host;
  try { host = siteOf(url); } catch { return false; }
  return sites.some((s) => within(host, s));
}

// What a signed-in page holds goes to the AI, and a mailbox is all private mail.
const MAILBOXES = ['gmail.com', 'mail.google.com', 'outlook.com', 'outlook.live.com', 'outlook.office.com', 'outlook.office365.com', 'live.com', 'hotmail.com', 'mail.yahoo.com', 'proton.me', 'protonmail.com', 'icloud.com', 'mail.qq.com', 'mail.163.com', 'mail.126.com'];

/** Cookies must never reach a git history. */
function ignoreProfile(home) {
  const file = join(home, '.gitignore');
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (!/^\/?browser\/?\s*$/m.test(text)) appendFileSync(file, `${text && !text.endsWith('\n') ? '\n' : ''}browser/\n`);
}

/** Open a visible window on the separate profile. Opening a site adds it to the list. */
export function openLogin(home, url, { browser = findBrowser(), start = spawn } = {}) {
  const site = siteOf(url);
  if (MAILBOXES.some((m) => within(site, m))) throw new Error('a mailbox is not added: its private mail would reach the AI');
  if (!browser) throw new Error('no Chrome or Edge found');
  const profile = loginProfile(home);
  mkdirSync(profile, { recursive: true });
  ignoreProfile(home);
  const child = start(browser, [`--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', assertPublicUrl(url)], { detached: true, stdio: 'ignore' });
  child.on?.('error', () => {});
  child.unref?.();
  const sites = readSites(home);
  if (!sites.includes(site)) saveSites(home, [...sites, site].sort());
  return { site };
}

export function removeSite(home, site) {
  saveSites(home, readSites(home).filter((s) => s !== site));
}

/** Delete the separate profile with every sign-in in it. */
export function clearLogins(home) {
  try { rmSync(join(home, 'browser', 'apply-pilot'), { recursive: true, force: true, maxRetries: 3 }); } catch { throw new Error('close the sign-in window first'); }
  rmSync(sitesFile(home), { force: true });
}

const HUMAN_CHECK = /verify you are (a )?human|are you a human|checking your browser|just a moment|captcha|access denied|attention required|unusual traffic/i;

/** A short page with one of these phrases is a check, not a posting. */
export function asksForHuman(text) {
  return String(text).length < 2000 && HUMAN_CHECK.test(text);
}

const SIGN_IN = /\b(sign in|log ?in|connexion|se connecter|anmelden|mot de passe|password)\b/i;

/** A short page like this means the sign-in has run out. */
export function asksForSignIn(text) {
  return String(text).length < 2500 && SIGN_IN.test(text);
}

/** The page as HTML after its scripts ran. `profile` is the separate signed-in profile, else a throwaway one. */
export async function renderPage(value, { timeoutMs = 45000, waitMs = 8000, browser = findBrowser(), profile: signedIn = null } = {}) {
  const url = assertPublicUrl(value);
  if (!browser) throw new Error('no Chrome or Edge found');
  const profile = signedIn || mkdtempSync(join(tmpdir(), 'apply-pilot-browser-'));
  const args = ['--headless=new', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync', '--disable-background-networking', '--disable-gpu', '--mute-audio', `--virtual-time-budget=${waitMs}`, '--dump-dom', url];
  try {
    const html = await new Promise((resolve, reject) => {
      execFile(browser, args, { timeout: timeoutMs, maxBuffer: 1 << 26, windowsHide: true }, (e, out) => {
        if (!e) return resolve(out);
        // A second browser on a profile in use cannot start: the sign-in window holds it.
        reject(new Error(signedIn && !e.killed ? 'close the sign-in window first' : `the browser could not read the page: ${e.killed ? 'timed out' : e.message.slice(0, 200)}`));
      });
    });
    if (signedIn && !html.trim()) throw new Error('close the sign-in window first');
    return html;
  } finally { if (!signedIn) rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); }
}
