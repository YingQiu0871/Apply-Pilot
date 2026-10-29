// Company career-site scan through the public JSON/HTML feeds that applicant
// tracking systems expose to their own search pages. No login, no API key.
//
// profile.sources.portals = {
//   keywords: ["stage", "internship", "stagiaire"],      // sent to boards that support search
//   titleFilter: { positive: ["stage + formulation", "internship"], negative: ["word:RH", "sales"] },
//   locationFilter: { allow: ["France", "Germany"], deny: ["Netherlands"] },
//   maxAgeDays: 14,
//   companies: [
//     { name: "Example", url: "https://example.wd3.myworkdayjobs.com/en-US/Careers", provider: "workday" },
//     { name: "Example", url: "https://jobs.example.com", provider: "successfactors", locales: ["en_US", "fr_FR"] },
//     { name: "Example", url: "https://careers.example.com/global/en", provider: "phenom", phenom: { urlPrefix: "global/en", selectedFields: { country: ["France"] } } },
//     { name: "Example", url: "https://example.eightfold.ai/careers?domain=example.com", provider: "eightfold" },
//     { name: "Example", url: "https://careers.smartrecruiters.com/Example", provider: "smartrecruiters" },
//     { name: "Example", url: "https://example.jobs.personio.de", provider: "personio" },
//     { name: "Example", url: "https://careers.example.com", provider: "websearch", query: "site:careers.example.com internship" }
//   ]
// }
// Boards change. Every provider fails soft: errors are collected, never thrown.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { localDate } from '../config.mjs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const decode = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(n)).replace(/\s+/g, ' ').trim();
const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'job';

async function request(url, { method = 'GET', body, json = true, timeout = 30000 } = {}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout);
    try {
      const res = await fetch(url, {
        method, signal: ctl.signal,
        headers: { 'user-agent': UA, accept: json ? 'application/json' : 'text/html,*/*', ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { fatal: true });
      return json ? await res.json() : await res.text();
    } catch (e) {
      if (e.fatal || attempt === 2) throw e;
      await sleep(800 * (attempt + 1));
    } finally { clearTimeout(t); }
  }
  return null;
}

// ---- providers -----------------------------------------------------------

async function workday(c, kw) {
  const u = new URL(c.url);
  const tenant = c.tenant || u.hostname.split('.')[0];
  const parts = u.pathname.split('/').filter((p) => p && !/^[a-z]{2}-[A-Za-z]{2}$/.test(p));
  const site = c.site || parts[0];
  if (!site) throw new Error('cannot read the Workday site name from url');
  const api = `${u.origin}/wday/cxs/${tenant}/${site}/jobs`;
  const out = new Map();
  for (const searchText of kw.length ? kw : ['']) {
    for (let page = 0; page < (c.maxPages || 10); page += 1) {
      const data = await request(api, { method: 'POST', body: { appliedFacets: {}, limit: 20, offset: page * 20, searchText } });
      const posts = data?.jobPostings || [];
      for (const j of posts) {
        if (!j.externalPath) continue;
        out.set(j.externalPath, { title: j.title, url: `${u.origin}/en-US/${site}${j.externalPath}`, location: j.locationsText || '', posted: j.postedOn || '' });
      }
      if (posts.length < 20) break;
      await sleep(250);
    }
  }
  return [...out.values()];
}

async function smartrecruiters(c, kw) {
  const id = c.companyId || new URL(c.url).pathname.split('/').filter(Boolean)[0];
  const out = new Map();
  for (const q of kw.length ? kw : ['']) {
    for (let offset = 0; offset < (c.maxPages || 5) * 100; offset += 100) {
      const data = await request(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(id)}/postings?limit=100&offset=${offset}${q ? `&q=${encodeURIComponent(q)}` : ''}`);
      const rows = data?.content || [];
      for (const j of rows) out.set(j.id, { title: j.name, url: `https://jobs.smartrecruiters.com/${id}/${j.id}`, location: [j.location?.city, j.location?.country].filter(Boolean).join(', '), posted: j.releasedDate || '' });
      if (rows.length < 100) break;
    }
  }
  return [...out.values()];
}

async function eightfold(c, kw) {
  const u = new URL(c.url);
  const domain = c.domain || u.searchParams.get('domain');
  const out = new Map();
  for (const query of kw.length ? kw : ['']) {
    for (let page = 0; page < (c.maxPages || 30); page += 1) {
      const qs = new URLSearchParams({ start: String(page * 10), num: '10' });
      if (domain) qs.set('domain', domain);
      if (query) qs.set('query', query);
      const data = await request(`${u.origin}/api/apply/v2/jobs?${qs}`);
      const rows = data?.positions || [];
      for (const j of rows) {
        out.set(j.id, { title: j.posting_name || j.name, url: j.canonicalPositionUrl || `${u.origin}/careers/job/${j.id}`, location: j.location || (j.locations || []).join('; '), posted: j.t_create ? new Date(j.t_create * 1000).toISOString().slice(0, 10) : '' });
      }
      if (rows.length < 10) break;
      await sleep(250);
    }
  }
  return [...out.values()];
}

async function phenom(c, kw) {
  const u = new URL(c.url);
  const cfg = { lang: 'en_global', country: 'global', urlPrefix: 'global/en', selectedFields: {}, ...(c.phenom || {}) };
  const out = new Map();
  for (const keywords of kw.length ? kw : ['']) {
    for (let page = 0; page < (c.maxPages || 10); page += 1) {
      const data = await request(`${u.origin}/widgets`, {
        method: 'POST',
        body: {
          lang: cfg.lang, deviceType: 'desktop', country: cfg.country, pageName: 'search-results', ddoKey: 'refineSearch',
          sortBy: '', subsearch: '', from: page * 100, jobs: true, counts: true, all_fields: ['category', 'country', 'city'],
          size: 100, clearAll: false, jdsource: 'facets', isSliderEnable: false, pageId: 'page10', siteType: 'external',
          keywords, global: cfg.country === 'global', selected_fields: cfg.selectedFields, locationData: {},
        },
      });
      const rows = data?.refineSearch?.data?.jobs || [];
      for (const j of rows) {
        if (!j.jobId) continue;
        out.set(j.jobId, { title: decode(j.title), url: `${u.origin}/${cfg.urlPrefix}/job/${j.jobId}/${slug(decode(j.title))}`, location: j.location || [j.city, j.country].filter(Boolean).join(', '), posted: (j.postedDate || '').slice(0, 10) });
      }
      if (rows.length < 100) break;
      await sleep(250);
    }
  }
  return [...out.values()];
}

async function successfactors(c, kw) {
  const origin = new URL(c.api || c.url).origin;
  const out = new Map();
  // Older Recruiting Marketing sites: HTML tile fragment.
  for (const q of kw.length ? kw : ['']) {
    let startrow = 0;
    for (let page = 0; page < (c.maxPages || 8); page += 1) {
      const html = await request(`${origin}/tile-search-results/?q=${encodeURIComponent(q)}&startrow=${startrow}`, { json: false });
      const tiles = [...String(html).matchAll(/<li[^>]*class="[^"]*job-tile[^"]*"[^>]*data-url="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g)];
      for (const [, path, inner] of tiles) {
        const title = decode((inner.match(/<a[^>]*class="[^"]*jobTitle-link[^"]*"[^>]*>([\s\S]*?)<\/a>/) || inner.match(/<a[^>]*>([\s\S]*?)<\/a>/) || [])[1]);
        // Field values sit in "...-section-location-value" / "...-section-date-value"; the label span before them is not data.
        const field = (name) => decode((inner.match(new RegExp(`id="[^"]*section-${name}-value"[^>]*>([\\s\\S]*?)</div>`)) || [])[1]);
        const href = path.replace(/&amp;/g, '&');
        if (title) out.set(href, { title, url: origin + href, location: field('location'), posted: field('date') });
      }
      if (!tiles.length) break;
      startrow += tiles.length;
      await sleep(250);
    }
  }
  if (out.size) return [...out.values()];
  // Newer Career Site Builder sites: JSON search API, gated by locale.
  for (const locale of c.locales || ['en_US', 'fr_FR', 'de_DE', 'en_GB']) {
    for (const keywords of kw.length ? kw : ['']) {
      for (let pageNumber = 0; pageNumber < (c.maxPages || 10); pageNumber += 1) {
        let data;
        try { data = await request(`${origin}/services/recruiting/v1/jobs`, { method: 'POST', body: { keywords, locale, location: '', pageNumber, sortBy: 'recent' } }); } catch { break; }
        const rows = data?.jobSearchResult || [];
        for (const { response: j } of rows) {
          if (!j?.id) continue;
          out.set(String(j.id), { title: decode(j.unifiedStandardTitle), url: `${origin}/job/${j.unifiedUrlTitle}/${j.id}-${locale}`, location: (j.jobLocationShort || []).map(decode).join('; '), posted: j.unifiedStandardStart || '' });
        }
        if (rows.length < 10) break;
        await sleep(250);
      }
    }
  }
  return [...out.values()];
}

async function personio(c) {
  const origin = new URL(c.url).origin;
  const xml = await request(`${origin}/xml`, { json: false });
  return [...String(xml).matchAll(/<position>([\s\S]*?)<\/position>/g)].map(([, p]) => {
    const tag = (t) => decode((p.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)) || [])[1]);
    return { title: tag('name'), url: `${origin}/job/${tag('id')}`, location: tag('office'), posted: tag('createdAt').slice(0, 10) };
  });
}

export const PROVIDERS = { workday, smartrecruiters, eightfold, phenom, successfactors, personio };

// ---- filters -------------------------------------------------------------

function termMatch(text, term) {
  const t = term.trim().toLowerCase();
  if (t.startsWith('word:')) return new RegExp(`(^|[^\\p{L}])${t.slice(5).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}]|$)`, 'iu').test(text);
  return text.includes(t);
}
/** "a + b" means both terms must appear; "word:X" matches X as a whole word. */
export const ruleMatch = (text, rule) => rule.split('+').every((part) => termMatch(text.toLowerCase(), part));

export function passesFilters(job, cfg, today = localDate()) {
  const title = job.title || '';
  const tf = cfg.titleFilter || {};
  if (tf.positive?.length && !tf.positive.some((r) => ruleMatch(title, r))) return 'title';
  if (tf.negative?.some((r) => ruleMatch(title, r))) return 'title-negative';
  const loc = String(job.location || '');
  const lf = cfg.locationFilter || {};
  if (loc && lf.deny?.some((r) => ruleMatch(loc, r))) return 'location-deny';
  if (loc && lf.allow?.length && !lf.allow.some((r) => ruleMatch(loc, r))) return 'location';
  const posted = /^\d{4}-\d\d-\d\d/.test(job.posted) ? job.posted.slice(0, 10) : null;
  if (posted && cfg.maxAgeDays && (Date.parse(today) - Date.parse(posted)) / 86400000 > cfg.maxAgeDays) return 'too-old';
  return null;
}

export async function scanPortals(profile, { only, log = console.log } = {}) {
  const cfg = profile.sources.portals || {};
  const kw = cfg.keywords || [];
  const result = { scannedAt: new Date().toISOString(), jobs: [], skipped: {}, errors: [], websearch: [] };
  for (const c of cfg.companies || []) {
    if (c.enabled === false || (only && !c.name.toLowerCase().includes(only.toLowerCase()))) continue;
    const fn = PROVIDERS[c.provider];
    if (!fn) { result.websearch.push({ company: c.name, url: c.url, query: c.query || null }); continue; }
    try {
      const jobs = await fn(c, c.keywords || kw);
      let kept = 0;
      for (const j of jobs) {
        const why = passesFilters(j, cfg);
        if (why) { result.skipped[why] = (result.skipped[why] || 0) + 1; continue; }
        result.jobs.push({ company: c.name, provider: c.provider, ...j });
        kept += 1;
      }
      log(`${c.name} (${c.provider}): ${jobs.length} found, ${kept} kept`);
    } catch (e) {
      result.errors.push(`${c.name}: ${e.message}`);
      log(`${c.name} (${c.provider}): ERROR ${e.message}`);
    }
  }
  for (const q of cfg.searchQueries || []) if (q.enabled !== false) result.websearch.push({ name: q.name, query: q.query });
  return result;
}

export function savePortalScan(result, inboxDir) {
  mkdirSync(inboxDir, { recursive: true });
  const file = join(inboxDir, `portals-${localDate()}-${Date.now()}.json`);
  writeFileSync(file, JSON.stringify(result, null, 2));
  return file;
}
