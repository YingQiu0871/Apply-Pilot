// Keyword coverage: which keywords from a report's "## Keywords extracted"
// block appear in the CV. Diagnostic only; it never edits the CV. Add a missing
// keyword only if it reflects real experience.

export function extractKeywords(reportText) {
  const out = [];
  let inBlock = false;
  for (const raw of String(reportText || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (/^##\s+keywords\s+extracted\b/i.test(line)) { inBlock = true; continue; }
    if (!inBlock) continue;
    if (/^##\s+/.test(line)) break;
    if (!line || /^\(.*\)$/.test(line)) continue;
    for (const part of line.replace(/^[-*]\s+/, '').split(',')) {
      const kw = part.trim().replace(/\.+$/, '').trim();
      if (kw) out.push(kw);
    }
  }
  return out;
}

export const htmlToText = (html) => String(html || '')
  .replace(/<!--[\s\S]*?-->/g, ' ').replace(/<script\b[\s\S]*?<\/script\s*>/gi, ' ').replace(/<style\b[\s\S]*?<\/style\s*>/gi, ' ')
  .replace(/<(br|\/p|\/li|\/h\d|\/div)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
  .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();

const fold = (s) => String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function count(text, kw) {
  const esc = fold(kw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[\s-]+/g, '[\\s-]+');
  return (fold(text).match(new RegExp(`(^|[^a-z0-9])${esc}(s|es)?(?=[^a-z0-9]|$)`, 'g')) || []).length;
}

export function coverage(keywords, cvText) {
  const cleaned = [...new Set(keywords.map((k) => k.trim()).filter(Boolean))];
  const present = [], thin = [], missing = [];
  for (const kw of cleaned) {
    const n = count(cvText, kw);
    if (!n) missing.push(kw);
    else { present.push(kw); if (n === 1) thin.push(kw); }
  }
  const total = cleaned.length;
  return { total, presentCount: present.length, coveragePct: total ? Math.round((present.length / total) * 100) : 0, present, thin, missing };
}

export function coverageMarkdown(cov, cvLabel = 'cv.md') {
  const list = (a) => (a.length ? a.join(', ') : '—');
  return [
    '## Keyword Coverage', '',
    `**ATS coverage: ${cov.coveragePct}%** (${cov.presentCount}/${cov.total} keywords present)`, '',
    `_Scanned: ${cvLabel}._`, '',
    `**Present (${cov.present.length}):** ${list(cov.present)}`, '',
    `**Thin — mentioned once, consider reinforcing (${cov.thin.length}):** ${list(cov.thin)}`, '',
    `**Missing (${cov.missing.length}):** ${list(cov.missing)}`, '',
    '> Diagnostic only. Add a missing keyword **only** if it reflects real experience — reformulated from your background, never fabricated.',
  ].join('\n');
}
