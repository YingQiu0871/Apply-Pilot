// Job boards, public employment services and web search engines.
// Only official, documented APIs or plain public pages are used. Sources that
// block automated access (bot protection, login walls) are left to your agent's
// browser instead of being worked around.
//
// profile.sources.boards = [
//   { name: "JobTech Sweden", provider: "jobtech", keywords: ["praktik läkemedel", "internship pharmaceutical"] },
//   { name: "Euraxess", provider: "euraxess", keywords: ["pharmaceutical internship", "drug delivery master"] },
//   { name: "France Travail", provider: "francetravail", keywords: ["stage formulation"], francetravail: { natureContrat: "E2", publieeDepuis: 14 } },
//   { name: "Adzuna", provider: "adzuna", countries: ["fr", "de"], keywords: { fr: ["stage formulation"], de: ["Praktikum Formulierung"] }, maxDays: 14 },
//   { name: "Jooble", provider: "jooble", locations: ["France", "Deutschland"], keywords: ["internship formulation"] },
//   { name: "Careerjet", provider: "careerjet", locales: ["fr_FR", "de_DE"], keywords: ["stage formulation"] },
//   { name: "jobRxiv", provider: "jobrxiv", academic: true, keywords: ["drug delivery"] }
// ]
// A board with academic: true skips the title rule, which is usually written for
// internships and would drop every PhD position. Its keywords decide instead, and
// senior, postdoc and faculty positions are dropped.
// profile.sources.websearch = { engine: "brave" | "mojeek" | "searxng", count: 20, freshness: "pw" }
//   runs sources.portals.searchQueries and every company with provider "websearch" and a query.
//
// Keys come from the environment or APPLY_PILOT_HOME/.env (never from profile.json):
//   FRANCE_TRAVAIL_CLIENT_ID / FRANCE_TRAVAIL_CLIENT_SECRET  (francetravail.io, free)
//   ADZUNA_APP_ID / ADZUNA_APP_KEY                            (developer.adzuna.com, free)
//   JOOBLE_API_KEY                                            (jooble.org/api/about, free)
//   CAREERJET_AFFID                                           (careerjet partner id, free)
//   BRAVE_API_KEY                                             (api.search.brave.com)
//   MOJEEK_API_KEY                                            (mojeek.com/services/search/web-search-api)
//   SEARXNG_URL                                               (your own SearXNG instance with format=json enabled)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { localDate } from '../config.mjs';
import { passesFilters } from './portals.mjs';

const UA = 'apply-pilot (+https://github.com/YingQiu0871/apply-pilot)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const decode = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/\s+/g, ' ').trim();
const day = (v) => { if (!v) return ''; const d = new Date(v); return Number.isNaN(+d) ? '' : d.toLocaleDateString('sv-SE'); };
const need = (...names) => { const miss = names.filter((n) => !process.env[n]); if (miss.length) throw Object.assign(new Error(`missing ${miss.join(', ')} (put it in APPLY_PILOT_HOME/.env)`), { config: true }); };
const kwList = (b, lang) => (Array.isArray(b.keywords) ? b.keywords : (b.keywords?.[lang] || b.keywords?.en || []));

async function request(url, { method = 'GET', body, headers = {}, json = true, form } = {}) {
  const res = await fetch(url, {
    method,
    headers: { 'user-agent': UA, accept: json ? 'application/json' : 'text/html,*/*', ...(body ? { 'content-type': 'application/json' } : {}), ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}), ...headers },
    body: body ? JSON.stringify(body) : form ? new URLSearchParams(form).toString() : undefined,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return json ? res.json() : res.text();
}

// ---- public, no key -----------------------------------------------------

async function jobtech(b) {
  const out = [];
  for (const q of kwList(b, 'sv')) {
    const d = await request(`https://jobsearch.api.jobtechdev.se/search?${new URLSearchParams({ q, limit: '100' })}`);
    for (const h of d.hits || []) out.push({ title: h.headline, company: h.employer?.name || b.name, url: h.webpage_url || `https://arbetsformedlingen.se/platsbanken/annonser/${h.id}`, location: [h.workplace_address?.municipality, h.workplace_address?.country || 'Sverige'].filter(Boolean).join(', '), posted: day(h.publication_date) });
  }
  return out;
}

// The search form posts back to Drupal, so GET parameters do not filter: read the
// newest pages and let the shared title rules (or b.keywords) pick the relevant ones.
async function euraxess(b) {
  const out = [];
  const words = kwList(b, 'en').map((k) => k.toLowerCase());
  {
    for (let page = 0; page < (b.maxPages || 5); page += 1) {
      const html = await request(`https://euraxess.ec.europa.eu/jobs/search?page=${page}`, { json: false });
      const items = String(html).split('<article class="ecl-content-item"').slice(1);
      for (const a of items) {
        const link = a.match(/href="(\/jobs\/\d+)"[^>]*>\s*<span>([\s\S]*?)<\/span>/);
        if (!link) continue;
        const org = decode((a.match(/primary-meta-item"><a[^>]*>([\s\S]*?)<\/a>/) || [])[1]);
        const posted = (a.match(/Posted on:\s*([^<]+)</) || [])[1];
        const loc = decode((a.match(/id-Work-Locations[\s\S]*?<\/div>\s*<div[^>]*>([\s\S]*?)<\/div>/) || [])[1]).replace(/^Number of offers:\s*\d+,\s*/i, '');
        const title = decode(link[2]);
        if (words.length && !words.some((w) => w.split(/\s+/).every((t) => `${title} ${org}`.toLowerCase().includes(t)))) continue;
        out.push({ title, company: org || 'Euraxess', url: `https://euraxess.ec.europa.eu${link[1]}`, location: loc, posted: day(posted) });
      }
      if (items.length < 10) break;
      await sleep(500);
    }
  }
  return out;
}

// ---- academic feeds, no key ----------------------------------------------

const feedItems = (xml) => String(xml).split('<item>').slice(1);
function field(item, name) {
  const m = item.match(new RegExp(`<${name}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${name}>`));
  return m ? m[1] : '';
}
const hasTerm = (text, words) => !words.length || words.some((w) => w.split(/\s+/).every((t) => text.toLowerCase().includes(t)));

// DAAD's feed has no search, so the keywords are checked here.
async function daad(b) {
  const words = kwList(b, 'en').map((k) => k.toLowerCase());
  const xml = await request('https://api.daad.de/api/feeds/rss/en/phd.xml', { json: false });
  return feedItems(xml).map((it) => ({
    title: decode(field(it, 'title')), text: decode(field(it, 'description')), company: decode(field(it, 'company')) || 'DAAD PhDGermany', url: decode(field(it, 'link')),
    location: decode(field(it, 'location')) || 'Germany', posted: day(field(it, 'pubDate').replace('.', '')),
  })).filter((j) => hasTerm(`${j.title} ${j.text}`, words)).map(({ text, ...j }) => j);
}

async function jobrxiv(b) {
  const out = [];
  for (const q of kwList(b, 'en')) {
    for (let paged = 1; paged <= (b.maxPages || 3); paged += 1) {
      const items = feedItems(await request(`https://jobrxiv.org/?${new URLSearchParams({ feed: 'job_feed', search_keywords: q, paged: String(paged) })}`, { json: false }));
      for (const it of items) out.push({ title: decode(field(it, 'title')), company: decode(field(it, 'job_listing:company')) || 'jobRxiv', url: decode(field(it, 'link')), location: decode(field(it, 'job_listing:location')), posted: day(field(it, 'pubDate')) });
      if (items.length < 10) break;
      await sleep(500);
    }
  }
  return out;
}

// PhDFinder reposts positions, so its pages lead to the original announcement.
async function phdfinder(b) {
  const out = [];
  for (const q of kwList(b, 'en')) {
    const items = feedItems(await request(`https://phdfinder.com/search/${encodeURIComponent(q)}/feed/`, { json: false }));
    for (const it of items) {
      const [country, ...rest] = decode(field(it, 'title')).split(' – ');
      const about = decode(field(it, 'description'));
      out.push({ title: rest.join(' – ') || country, company: (about.match(/University:\s*(.+?)\s*Country:/) || [])[1] || 'PhDFinder', url: decode(field(it, 'link')), location: (about.match(/Country:\s*(.+?)\s*Deadline:/) || [])[1] || country, posted: day(field(it, 'pubDate')) });
    }
    await sleep(500);
  }
  return out;
}

// One page of cards. Only master and PhD positions are kept.
async function pasteur() {
  const html = await request('https://research.pasteur.fr/en/jobs/', { json: false });
  return String(html).split('<article ').slice(1).filter((a) => /position-(master-student|phd-student)/.test(a.slice(0, 400))).map((a) => ({
    title: `${decode((a.match(/<h3[^>]*>([\s\S]*?)<\/h3>/) || [])[1])} (${/position-master/.test(a.slice(0, 400)) ? 'Master' : 'PhD'})`,
    company: `Institut Pasteur${(a.match(/<span class="lab[^"]*">([\s\S]*?)<\/span>/) || [])[1] ? ` - ${decode(a.match(/<span class="lab[^"]*">([\s\S]*?)<\/span>/)[1])}` : ''}`,
    url: (a.match(/<a href="([^"]+)" rel="bookmark"/) || [])[1], location: 'Paris, France', posted: '',
  })).filter((j) => j.url);
}

// ---- official APIs with a free key --------------------------------------

let ftToken = null;
async function francetravail(b) {
  need('FRANCE_TRAVAIL_CLIENT_ID', 'FRANCE_TRAVAIL_CLIENT_SECRET');
  if (!ftToken || ftToken.exp < Date.now()) {
    const t = await request('https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire', {
      method: 'POST', form: { grant_type: 'client_credentials', client_id: process.env.FRANCE_TRAVAIL_CLIENT_ID, client_secret: process.env.FRANCE_TRAVAIL_CLIENT_SECRET, scope: 'api_offresdemploiv2 o2dsoffre' },
    });
    ftToken = { value: t.access_token, exp: Date.now() + (t.expires_in - 60) * 1000 };
  }
  const opts = { natureContrat: 'E2', publieeDepuis: 14, ...(b.francetravail || {}) };
  const out = [];
  for (const motsCles of kwList(b, 'fr')) {
    const qs = new URLSearchParams({ motsCles, range: '0-149', ...Object.fromEntries(Object.entries(opts).map(([k, v]) => [k, String(v)])) });
    let d;
    try { d = await request(`https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search?${qs}`, { headers: { authorization: `Bearer ${ftToken.value}` } }); } catch (e) { if (/HTTP 204/.test(e.message)) continue; throw e; }
    for (const o of d?.resultats || []) out.push({ title: o.intitule, company: o.entreprise?.nom || 'France Travail', url: o.origineOffre?.urlOrigine || `https://candidat.francetravail.fr/offres/recherche/detail/${o.id}`, location: `${o.lieuTravail?.libelle || ''}, France`, posted: day(o.dateCreation) });
    await sleep(300);
  }
  return out;
}

async function adzuna(b) {
  need('ADZUNA_APP_ID', 'ADZUNA_APP_KEY');
  const langOf = { fr: 'fr', be: 'fr', de: 'de', at: 'de', ch: 'de', it: 'it', es: 'es', pl: 'en', nl: 'en' };
  const out = [];
  for (const cc of b.countries || ['fr']) {
    for (const what of kwList(b, langOf[cc] || 'en')) {
      const qs = new URLSearchParams({ app_id: process.env.ADZUNA_APP_ID, app_key: process.env.ADZUNA_APP_KEY, what, max_days_old: String(b.maxDays || 14), results_per_page: '50' });
      const d = await request(`https://api.adzuna.com/v1/api/jobs/${cc}/search/1?${qs}`);
      for (const j of d.results || []) out.push({ title: decode(j.title), company: j.company?.display_name || 'Adzuna', url: j.redirect_url, location: j.location?.display_name || cc.toUpperCase(), posted: day(j.created) });
      await sleep(300);
    }
  }
  return out;
}

async function jooble(b) {
  need('JOOBLE_API_KEY');
  const out = [];
  for (const location of b.locations || ['']) {
    for (const keywords of kwList(b, 'en')) {
      const d = await request(`https://jooble.org/api/${process.env.JOOBLE_API_KEY}`, { method: 'POST', body: { keywords, location, page: '1' } });
      for (const j of d.jobs || []) out.push({ title: decode(j.title), company: j.company || 'Jooble', url: j.link, location: j.location || location, posted: day(j.updated) });
      await sleep(300);
    }
  }
  return out;
}

async function careerjet(b) {
  need('CAREERJET_AFFID');
  const out = [];
  for (const locale of b.locales || ['fr_FR']) {
    for (const keywords of kwList(b, locale.slice(0, 2))) {
      const qs = new URLSearchParams({ locale_code: locale, keywords, affid: process.env.CAREERJET_AFFID, pagesize: '50', sort: 'date', user_ip: '127.0.0.1', user_agent: UA });
      const d = await request(`https://public.api.careerjet.net/search?${qs}`);
      for (const j of d.jobs || []) out.push({ title: decode(j.title), company: j.company || 'Careerjet', url: j.url, location: j.locations || '', posted: day(j.date) });
      await sleep(300);
    }
  }
  return out;
}

export const BOARDS = { jobtech, euraxess, francetravail, adzuna, jooble, careerjet, daad, jobrxiv, phdfinder, pasteur };

// ---- web search engines --------------------------------------------------

export const ENGINES = {
  brave: async (q, o) => {
    need('BRAVE_API_KEY');
    const qs = new URLSearchParams({ q, count: String(o.count || 20), freshness: o.freshness || 'pw', ...(o.country ? { country: o.country } : {}), ...(o.lang ? { search_lang: o.lang } : {}) });
    const d = await request(`https://api.search.brave.com/res/v1/web/search?${qs}`, { headers: { 'X-Subscription-Token': process.env.BRAVE_API_KEY } });
    return (d.web?.results || []).map((x) => ({ title: decode(x.title), url: x.url, snippet: decode(x.description), posted: day(x.page_age) }));
  },
  mojeek: async (q, o) => {
    need('MOJEEK_API_KEY');
    const qs = new URLSearchParams({ q, api_key: process.env.MOJEEK_API_KEY, fmt: 'json', t: String(o.count || 20), ...(o.lang ? { lb: o.lang.toUpperCase() } : {}) });
    const d = await request(`https://api.mojeek.com/search?${qs}`);
    return (d.response?.results || []).map((x) => ({ title: decode(x.title), url: x.url, snippet: decode(x.desc), posted: day(x.date) }));
  },
  searxng: async (q, o) => {
    need('SEARXNG_URL');
    const qs = new URLSearchParams({ q, format: 'json', time_range: o.timeRange || 'week', ...(o.lang ? { language: o.lang } : {}) });
    const d = await request(`${process.env.SEARXNG_URL.replace(/\/$/, '')}/search?${qs}`);
    return (d.results || []).slice(0, o.count || 20).map((x) => ({ title: decode(x.title), url: x.url, snippet: decode(x.content), posted: day(x.publishedDate) }));
  },
};

const SENIOR = /\b(post-?doc\w*|senior|sr\.|manager|director|professor\w*|faculty|lecturer|principal|head of)(?=\W|$)/i;

/** Run every board in profile.sources.boards through the shared title/location/age filters. */
export async function scanBoards(profile, { only, log = console.log } = {}) {
  const cfg = profile.sources.portals || {};
  const result = { scannedAt: new Date().toISOString(), jobs: [], skipped: {}, errors: [], perCompany: [] };
  for (const b of profile.sources.boards || []) {
    if (b.enabled === false || (only && !b.name.toLowerCase().includes(only.toLowerCase()))) continue;
    const fn = BOARDS[b.provider];
    const t0 = Date.now();
    if (!fn) { result.errors.push(`${b.name}: unsupported board "${b.provider}" (use one of ${Object.keys(BOARDS).join(', ')})`); continue; }
    try {
      const jobs = await fn(b);
      let kept = 0;
      for (const j of jobs) {
        const why = b.academic && SENIOR.test(j.title) ? 'senior' : b.filters === false ? null : passesFilters(j, { ...cfg, maxAgeDays: b.maxDays || cfg.maxAgeDays, ...(b.academic ? { titleFilter: undefined } : {}) });
        if (why) { result.skipped[why] = (result.skipped[why] || 0) + 1; continue; }
        result.jobs.push({ provider: b.provider, source: b.name, ...j });
        kept += 1;
      }
      result.perCompany.push({ company: b.name, provider: b.provider, found: jobs.length, kept, ms: Date.now() - t0 });
      log(`${b.name} (${b.provider}): ${jobs.length} found, ${kept} kept`);
    } catch (e) {
      result.errors.push(`${b.name}: ${e.message}`);
      result.perCompany.push({ company: b.name, provider: b.provider, found: 0, kept: 0, error: e.message });
      log(`${b.name} (${b.provider}): ${e.config ? 'NOT CONFIGURED' : 'ERROR'} ${e.message}`);
    }
  }
  return result;
}

// The configured engine first, then every other engine that has its key.
const ENGINE_KEYS = { brave: 'BRAVE_API_KEY', mojeek: 'MOJEEK_API_KEY', searxng: 'SEARXNG_URL' };
export function searchEngines(ws = {}) {
  const first = ws.engine || 'brave';
  const others = Object.keys(ENGINE_KEYS).filter((e) => e !== first && (e === ws.fallback || process.env[ENGINE_KEYS[e]]));
  return [first, ...others];
}

/** Run search queries (portals.searchQueries + websearch companies) through the configured engine. */
export async function scanWebsearch(profile, { engine: forced, only, log = console.log } = {}) {
  const ws = profile.sources.websearch || {};
  const engines = forced ? [forced] : searchEngines(ws);
  const cfg = profile.sources.portals || {};
  const queries = [
    ...(cfg.searchQueries || []).filter((q) => q.enabled !== false).map((q) => ({ name: q.name, query: q.query, lang: q.locale, country: q.country })),
    ...(cfg.companies || []).filter((c) => c.provider === 'websearch' && c.query && c.enabled !== false).map((c) => ({ name: c.name, query: c.query, company: c.name })),
  ].filter((q) => !only || q.name.toLowerCase().includes(only.toLowerCase()));
  const result = { scannedAt: new Date().toISOString(), engine: engines[0], jobs: [], skipped: {}, errors: [], perCompany: [] };
  const seen = new Set();
  for (const q of queries) {
    let hits = null, used = null, lastErr = null;
    const tried = [];
    for (const name of engines) {
      if (!ENGINES[name]) { tried.push(`${name}: unknown engine`); continue; }
      try { hits = await ENGINES[name](q.query, { ...ws, lang: q.lang, country: q.country }); used = name; break; } catch (e) { tried.push(`${name}: ${e.message}`); lastErr = e; }
    }
    if (!hits && lastErr) lastErr = Object.assign(new Error(tried.join('; ')), { config: lastErr.config });
    if (!hits) {
      result.errors.push(`${q.name}: ${lastErr?.message}`);
      log(`${q.name}: ${lastErr?.config ? 'NOT CONFIGURED' : 'ERROR'} ${lastErr?.message}`);
      if (lastErr?.config) break; // no key: every other query would fail the same way
      continue;
    }
    let kept = 0;
    for (const h of hits) {
      if (seen.has(h.url)) continue;
      seen.add(h.url);
      // Search results carry no structured location; keep the title rule and let triage dedupe.
      const why = passesFilters({ title: `${h.title} ${h.snippet}`, posted: h.posted }, { titleFilter: cfg.titleFilter, maxAgeDays: cfg.maxAgeDays });
      if (why) { result.skipped[why] = (result.skipped[why] || 0) + 1; continue; }
      result.jobs.push({ provider: `websearch:${used}`, source: q.name, company: q.company || new URL(h.url).hostname.replace(/^www\./, ''), title: h.title, url: h.url, location: '', posted: h.posted, snippet: h.snippet });
      kept += 1;
    }
    result.perCompany.push({ company: q.name, provider: `websearch:${used}`, found: hits.length, kept });
    log(`${q.name} (${used}): ${hits.length} results, ${kept} kept`);
    await sleep(ws.delayMs ?? 1100);
  }
  return result;
}

export function saveScan(result, inboxDir, prefix) {
  mkdirSync(inboxDir, { recursive: true });
  const file = join(inboxDir, `${prefix}-${localDate()}-${Date.now()}.json`);
  writeFileSync(file, JSON.stringify(result, null, 2));
  return file;
}
