// Job sources the panel can set up: which keys each one needs, whether it is on,
// and a small test. Key values stay in .env and are never returned, only whether
// they are set. A test calls that source's own official API and nothing else.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { paths } from './config.mjs';
import { BOARDS, ENGINES } from './scan/boards.mjs';
import { classifyFailure } from './worker.mjs';

export const SOURCES = {
  euraxess: { label: 'Euraxess', keys: [], site: 'https://euraxess.ec.europa.eu', caution: true },
  jobtech: { label: 'JobTech (Sweden)', keys: [], site: 'https://jobtechdev.se' },
  daad: { label: 'DAAD PhDGermany', keys: [], site: 'https://www2.daad.de/deutschland/promotion/phd/en/', extra: { academic: true } },
  jobrxiv: { label: 'jobRxiv', keys: [], site: 'https://jobrxiv.org', extra: { academic: true } },
  phdfinder: { label: 'PhDFinder', keys: [], site: 'https://phdfinder.com', extra: { academic: true } },
  pasteur: { label: 'Institut Pasteur', keys: [], site: 'https://research.pasteur.fr/en/jobs/', noTerms: true, extra: { academic: true } },
  francetravail: { label: 'France Travail', keys: ['FRANCE_TRAVAIL_CLIENT_ID', 'FRANCE_TRAVAIL_CLIENT_SECRET'], site: 'https://francetravail.io' },
  adzuna: { label: 'Adzuna', keys: ['ADZUNA_APP_ID', 'ADZUNA_APP_KEY'], site: 'https://developer.adzuna.com', extra: { countries: ['fr'] } },
  jooble: { label: 'Jooble', keys: ['JOOBLE_API_KEY'], site: 'https://jooble.org/api/about', extra: { locations: ['France'] } },
  careerjet: { label: 'Careerjet', keys: ['CAREERJET_AFFID'], site: 'https://www.careerjet.com/partners', extra: { locales: ['fr_FR'] } },
  brave: { label: 'Brave Search', keys: ['BRAVE_API_KEY'], site: 'https://api.search.brave.com', search: true },
  mojeek: { label: 'Mojeek', keys: ['MOJEEK_API_KEY'], site: 'https://www.mojeek.com/services/search/web-search-api/', search: true },
  searxng: { label: 'SearXNG', keys: ['SEARXNG_URL'], site: 'https://docs.searxng.org', search: true },
};

const boardOf = (profile, id) => (profile.sources?.boards || []).find((b) => b.provider === id) || null;

/** What the panel shows. Keywords written per language are not editable there. */
export function sourceState(profile) {
  return Object.entries(SOURCES).map(([id, s]) => {
    const keys = s.keys.map((name) => ({ name, set: Boolean(process.env[name]) }));
    const board = boardOf(profile, id);
    const queries = (profile.sources?.portals?.searchQueries || []).filter((q) => q.enabled !== false).length;
    return {
      id, label: s.label, site: s.site, keys, search: Boolean(s.search), queries: s.search ? queries : undefined,
      academic: Boolean(s.extra?.academic), noTerms: Boolean(s.noTerms), caution: Boolean(s.caution),
      ready: keys.every((k) => k.set),
      on: s.search ? keys.every((k) => k.set) && queries > 0 : Boolean(board) && board.enabled !== false,
      keywords: Array.isArray(board?.keywords) ? board.keywords : [],
      multi: Boolean(board?.keywords) && !Array.isArray(board.keywords),
    };
  });
}

/** Turn a board on or off and set its keywords. Everything else in the profile stays. */
export function updateSource(home, { id, on, keywords }) {
  const s = SOURCES[id];
  if (!s || s.search) throw new Error(`"${id}" cannot be set up here`);
  const file = paths(home).profile;
  const raw = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  raw.sources ||= {};
  raw.sources.boards ||= [];
  const words = (keywords || []).map((k) => String(k).trim()).filter(Boolean).slice(0, 12);
  let board = raw.sources.boards.find((b) => b.provider === id);
  if (!board) {
    if (on && !words.length && !s.noTerms) throw new Error('enter at least one search term');
    if (!on) return;
    board = { name: s.label, provider: id, ...s.extra };
    raw.sources.boards.push(board);
  }
  if (words.length && !(board.keywords && !Array.isArray(board.keywords))) board.keywords = words;
  if (on) delete board.enabled; else board.enabled = false;
  copyFileSync(file, `${file.replace(/\.json$/, '')}.backup-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}.json`);
  writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`);
}

// One request is enough for a test: the first term in the first place.
function firstOnly(board) {
  const first = (v) => (Array.isArray(v) ? v.slice(0, 1) : v);
  const kw = board.keywords;
  const keywords = Array.isArray(kw) ? kw.slice(0, 1) : Object.fromEntries(Object.entries(kw || {}).map(([k, v]) => [k, first(v)]));
  return { ...board, keywords, countries: first(board.countries), locations: first(board.locations), locales: first(board.locales), maxPages: 1 };
}

/** One small live request. Returns { ok, found } or { ok: false, reason, detail }. */
export async function testSource(profile, id) {
  const s = SOURCES[id];
  if (!s) throw new Error(`unknown source "${id}"`);
  try {
    if (s.search) return { ok: true, found: (await ENGINES[id]('internship', { count: 1 })).length };
    const board = boardOf(profile, id) || { name: s.label, provider: id, keywords: ['internship'], ...s.extra };
    return { ok: true, found: (await BOARDS[id](firstOnly(board))).length };
  } catch (e) {
    return { ok: false, reason: e.config ? 'key' : classifyFailure(e.message), detail: e.message };
  }
}
