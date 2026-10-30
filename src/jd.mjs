// Fetch the full text of a job description.
// 1. Known ATS JSON APIs (Workday, SmartRecruiters, Personio) when the URL matches.
// 2. Plain HTTP fetch of the page, keeping <main>/<article> or JSON-LD JobPosting text.
// 3. The local Chrome or Edge for JavaScript-only pages (--browser), see browser.mjs.
import { asksForHuman, asksForSignIn, renderPage, siteAllowed } from './browser.mjs';
import { htmlToText } from './keywords.mjs';

const UA = 'apply-pilot (+https://github.com/YingQiu0871/apply-pilot)';

const FULL_PAGE = 3000;

async function get(url, json = false, timeout = 25000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { 'user-agent': UA, accept: json ? 'application/json' : 'text/html,*/*' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return json ? res.json() : res.text();
  } finally { clearTimeout(t); }
}

async function viaApi(url) {
  const u = new URL(url);
  const wd = u.hostname.match(/^([\w-]+)\.wd[\w-]*\.myworkdayjobs\.com$/);
  if (wd) {
    // https://tenant.wd3.myworkdayjobs.com/[locale/]Site/job/Location/slug_ID
    const parts = u.pathname.split('/').filter((p) => p && !/^[a-z]{2}-[A-Za-z]{2}$/.test(p));
    const i = parts.indexOf('job');
    if (i > 0) {
      const data = await get(`${u.origin}/wday/cxs/${wd[1]}/${parts[i - 1]}/${parts.slice(i).join('/')}`, true);
      const info = data?.jobPostingInfo;
      if (info) return { title: info.title, text: `${info.title}\n${info.location || ''}\n\n${htmlToText(info.jobDescription)}`, source: 'workday-api' };
    }
  }
  const sr = url.match(/smartrecruiters\.com\/([^/]+)\/(\d+)/);
  if (sr) {
    const d = await get(`https://api.smartrecruiters.com/v1/companies/${sr[1]}/postings/${sr[2]}`, true);
    const s = d?.jobAd?.sections || {};
    const text = ['companyDescription', 'jobDescription', 'qualifications', 'additionalInformation'].map((k) => htmlToText(s[k]?.text || '')).join('\n\n');
    return { title: d.name, text: `${d.name}\n${d.location?.city || ''}\n\n${text}`, source: 'smartrecruiters-api' };
  }
  return null;
}

export function fromHtml(html, minChars = 300) {
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const items = [].concat(JSON.parse(m[1])).flatMap((x) => x['@graph'] || [x]);
      const job = items.find((x) => /JobPosting/i.test(x['@type']));
      // A short teaser here means the full text is on the page itself.
      const text = job?.description ? `${job.title || ''}\n\n${htmlToText(job.description)}` : '';
      if (text.length >= minChars) return { title: job.title || '', text, source: 'json-ld' };
    } catch { /* ignore malformed blocks */ }
  }
  const title = htmlToText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
  // Some pages wrap only a header in <main> or <article>; then the whole page is the better source.
  const areas = [html.match(/<main[\s\S]*?<\/main>/i)?.[0], html.match(/<article[\s\S]*?<\/article>/i)?.[0], html];
  const text = areas.filter(Boolean).map((a) => htmlToText(a)).find((t) => t.length >= minChars) || htmlToText(html);
  return { title, text, source: 'html' };
}

/** session: { profile, sites } from the user's sign-ins, used only for those sites. */
export async function fetchJd(url, { browser = false, minChars = 300, render = renderPage, session = null } = {}) {
  if (browser && session && siteAllowed(url, session.sites)) {
    const page = fromHtml(await render(url, { profile: session.profile }), minChars);
    if (asksForHuman(page.text)) throw new Error(`${url} asks for a human check; open it yourself`);
    if (asksForSignIn(page.text)) throw new Error(`the sign-in for ${url} has run out; sign in again`);
    if (page.text.length < minChars) throw new Error(`no job description on ${url}, even signed in`);
    return { url, ...page, source: 'browser-signed-in' };
  }
  try { const r = await viaApi(url); if (r && r.text.length >= minChars) return { url, ...r }; } catch { /* fall through */ }
  let plain = null;
  try { const r = fromHtml(await get(url)); if (r.text.length >= minChars) plain = { url, ...r }; } catch { /* fall through */ }
  // A script-built page can pass the length check with only its cookie notice and menus.
  if (plain && (!browser || plain.text.length >= FULL_PAGE)) return plain;
  if (!browser) throw new Error(`could not fetch a job description from ${url} (try --browser)`);
  let seen;
  try { seen = fromHtml(await render(url), minChars); } catch (e) { if (plain) return plain; throw e; }
  if (asksForHuman(seen.text)) { if (plain) return plain; throw new Error(`${url} asks for a human check; open it yourself`); }
  if (plain && plain.text.length >= seen.text.length) return plain;
  if (seen.text.length < minChars) throw new Error(`no job description on ${url}, even in a browser`);
  return { url, ...seen, source: 'browser' };
}
