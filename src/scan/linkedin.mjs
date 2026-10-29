// LinkedIn job and post search with your own logged-in browser profile.
// Playwright is an optional dependency; the profile directory keeps your
// session, and you log in yourself with `apply-pilot linkedin login`.
//
// profile.sources.linkedin = {
//   profileDir: "browser/linkedin",            // relative to APPLY_PILOT_HOME
//   jobs: [{ q: "internship formulation", geo: "FR" }, ...],
//   posts: ["M2 internship opportunity", ...],
//   jobWindowDays: 14, scrolls: 2, delayMs: [4000, 8000], locale: "en-US"
// }
// Search pages change often. Selectors below match the 2026 layout
// (cards under [data-testid="lazy-column"]).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { localDate } from '../config.mjs';

export const GEO = {
  FR: '105015875', DE: '101282230', BE: '100565514', CH: '106693272', AT: '103883259', IT: '103350119',
  ES: '105646813', DK: '104514075', SE: '105117694', NO: '103819153', NL: '102890719', UK: '101165590',
  IE: '104738515', PT: '100364837', PL: '105072130', FI: '100456013', EU: '91000000', US: '103644278', CA: '101174742',
};

async function loadPlaywright() {
  try { return (await import('playwright')).chromium; } catch {
    throw new Error('playwright is not installed: run `npm i playwright` (and `npx playwright install chrome` if needed)');
  }
}

function settings(profile, home) {
  const li = profile.sources.linkedin || {};
  return {
    profileDir: resolve(home, li.profileDir || 'browser/linkedin'),
    jobs: li.jobs || [], posts: li.posts || [],
    windowSeconds: (li.jobWindowDays || 14) * 86400,
    scrolls: li.scrolls || 2,
    delay: li.delayMs || [4000, 8000],
    locale: li.locale || 'en-US',
    timezoneId: li.timezoneId || Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

async function openContext(s, headed) {
  const chromium = await loadPlaywright();
  return chromium.launchPersistentContext(s.profileDir, {
    channel: 'chrome', locale: s.locale, timezoneId: s.timezoneId, viewport: { width: 1440, height: 1000 },
    headless: !headed, args: ['--disable-blink-features=AutomationControlled'],
  });
}

/** Opens a visible browser on the login page; the user signs in by hand. */
export async function login(profile, home) {
  const s = settings(profile, home);
  mkdirSync(s.profileDir, { recursive: true });
  const ctx = await openContext(s, true);
  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto('https://www.linkedin.com/login');
  console.log('Sign in in the opened window, then close it. The session stays in', s.profileDir);
  await new Promise((r) => ctx.on('close', r));
}

async function extractCards(page, minText) {
  return page.evaluate((threshold) => {
    const column = document.querySelector('[data-testid="lazy-column"]');
    if (!column) return [];
    const items = [];
    for (const el of column.children) {
      const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
      if (el.tagName === 'HR' || text.length < threshold) continue;
      const links = [...new Set([...el.querySelectorAll('a[href]')].map((a) => a.href.split('?')[0]))];
      const host = el.getAttribute('componentkey')?.startsWith('job-card-component-ref-') ? el : el.querySelector('[componentkey^="job-card-component-ref-"]');
      const jobId = host ? host.getAttribute('componentkey').replace('job-card-component-ref-', '') : null;
      items.push({ jobId, url: jobId ? `https://www.linkedin.com/jobs/view/${jobId}/` : null, text: text.slice(0, 3000), people: links.filter((h) => h.includes('/in/')).slice(0, 2), links: links.slice(0, 8) });
      if (items.length >= 40) break;
    }
    return items;
  }, minText);
}

export async function scan(profile, home, { only } = {}) {
  const s = settings(profile, home);
  const ctx = await openContext(s, false);
  const page = ctx.pages()[0] || (await ctx.newPage());
  const result = { scannedAt: new Date().toISOString(), jobs: [], posts: [], requiresLogin: false, errors: [] };
  const wait = () => new Promise((r) => setTimeout(r, s.delay[0] + Math.random() * (s.delay[1] - s.delay[0])));
  const visit = async (url, minText, label) => {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(4000);
      for (let i = 0; i < s.scrolls; i += 1) { await page.mouse.wheel(0, 1600); await page.waitForTimeout(1500); }
      const items = await extractCards(page, minText);
      console.log(`${label}: ${items.length}`);
      return items;
    } catch (e) { result.errors.push(`${label}: ${e.message}`); return []; }
  };
  try {
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    if (/\/login|\/authwall|checkpoint/.test(page.url())) { result.requiresLogin = true; return result; }
    if (only !== 'posts') {
      for (const { q, geo } of s.jobs) {
        await wait();
        const geoId = GEO[geo] || geo;
        const url = `https://www.linkedin.com/jobs/search-results/?keywords=${encodeURIComponent(q)}${geoId ? `&geoId=${geoId}` : ''}&f_TPR=r${s.windowSeconds}`;
        result.jobs.push({ query: q, geo, items: await visit(url, 80, `job ${q} @ ${geo || 'any'}`) });
      }
    }
    if (only !== 'jobs') {
      for (const q of s.posts) {
        await wait();
        const url = `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(q)}&datePosted=%22past-week%22&sortBy=%22date_posted%22`;
        result.posts.push({ query: q, items: await visit(url, 200, `post ${q}`) });
      }
    }
  } finally { await ctx.close(); }
  return result;
}

export function saveScan(result, inboxDir) {
  mkdirSync(inboxDir, { recursive: true });
  const file = join(inboxDir, `linkedin-${localDate()}-${Date.now()}.json`);
  writeFileSync(file, JSON.stringify(result, null, 2));
  return file;
}
