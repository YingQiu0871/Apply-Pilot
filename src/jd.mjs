// Fetch the full text of a job description.
// 1. Known ATS JSON APIs (Workday, SmartRecruiters, Personio) when the URL matches.
// 2. Plain HTTP fetch of the page, keeping <main>/<article> or JSON-LD JobPosting text.
// 3. Optional Playwright render for JavaScript-only pages (--browser).
import { htmlToText } from './keywords.mjs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

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

function fromHtml(html) {
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const items = [].concat(JSON.parse(m[1])).flatMap((x) => x['@graph'] || [x]);
      const job = items.find((x) => /JobPosting/i.test(x['@type']));
      if (job?.description) return { title: job.title || '', text: `${job.title || ''}\n\n${htmlToText(job.description)}`, source: 'json-ld' };
    } catch { /* ignore malformed blocks */ }
  }
  const main = html.match(/<main[\s\S]*?<\/main>/i)?.[0] || html.match(/<article[\s\S]*?<\/article>/i)?.[0] || html;
  const title = htmlToText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
  return { title, text: htmlToText(main), source: 'html' };
}

async function viaBrowser(url) {
  let chromium;
  try { ({ chromium } = await import('playwright')); } catch { throw new Error('playwright not installed'); }
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ userAgent: UA });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3000);
    const text = await page.evaluate(() => (document.querySelector('main, article, [role=main]') || document.body).innerText);
    return { title: await page.title(), text, source: 'browser' };
  } finally { await browser.close(); }
}

export async function fetchJd(url, { browser = false, minChars = 300 } = {}) {
  try { const r = await viaApi(url); if (r && r.text.length >= minChars) return { url, ...r }; } catch { /* fall through */ }
  try { const r = fromHtml(await get(url)); if (r.text.length >= minChars) return { url, ...r }; } catch { /* fall through */ }
  if (browser) return { url, ...(await viaBrowser(url)) };
  throw new Error(`could not fetch a job description from ${url} (try --browser)`);
}
