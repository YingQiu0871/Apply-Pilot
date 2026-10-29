// Plain-writing checks for cover letters and emails. Recruiters and lab heads
// read many letters; stock phrases and invented claims cost more than they add.
// The checks are deliberately simple and explainable.

export const STOCK_PHRASES = [
  'passionate', 'dynamic', 'leverage', 'spearhead', 'cutting-edge', 'cutting edge', 'synergy', 'delve',
  'tapestry', 'testament to', 'i am writing to express', 'thrilled', 'excited to apply', 'unique opportunity',
  'perfect fit', 'ideal candidate', 'hit the ground running', 'fast-paced', 'results-driven', 'go-getter',
  'this experience taught me', 'taught me the importance', 'i firmly believe', 'in today\'s',
  'deeply passionate', 'strong passion', 'navigate the complexities', 'ever-evolving', 'pivotal role',
];

const sentences = (text) => text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).filter((s) => /[a-z]/i.test(s));

export function lintText(text, profile = { writing: {} }) {
  const w = profile.writing || {};
  const lower = text.toLowerCase();
  const issues = [];
  for (const p of [...STOCK_PHRASES, ...(w.bannedPhrases || [])]) {
    if (lower.includes(p.toLowerCase())) issues.push({ rule: 'stock-phrase', detail: p });
  }
  for (const claim of w.forbiddenClaims || []) {
    // A forbidden claim may still appear in an honest negation ("I have not used X").
    const re = new RegExp(`[^.]*\\b${claim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b[^.]*`, 'gi');
    for (const m of text.matchAll(re)) {
      if (!/\b(not|never|no|haven't|have not|hasn't|without|yet to|would learn|new to me)\b/i.test(m[0])) {
        issues.push({ rule: 'forbidden-claim', detail: `${claim}: "${m[0].trim().slice(0, 120)}"` });
      }
    }
  }
  const semis = (text.match(/;/g) || []).length;
  if (semis > (w.maxSemicolons ?? 0)) issues.push({ rule: 'semicolons', detail: `${semis} semicolon(s)` });
  const dashes = (text.match(/—/g) || []).length;
  if (dashes > 1) issues.push({ rule: 'em-dashes', detail: `${dashes} em dashes` });
  for (const s of sentences(text)) {
    const commas = (s.match(/,/g) || []).length;
    if (commas >= 4 && / and /.test(s)) issues.push({ rule: 'long-list', detail: s.slice(0, 120) });
    if (s.split(' ').length > 40) issues.push({ rule: 'long-sentence', detail: s.slice(0, 120) });
  }
  const lens = sentences(text).map((s) => s.split(' ').length);
  const mean = lens.reduce((a, b) => a + b, 0) / (lens.length || 1);
  return { issues, stats: { sentences: lens.length, meanWords: Math.round(mean * 10) / 10, words: text.split(/\s+/).filter(Boolean).length } };
}
