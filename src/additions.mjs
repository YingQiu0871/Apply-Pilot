// Merge batch "tracker additions" (one TSV per evaluation) into the tracker and
// keep a pipeline inbox (data/pipeline.md, "- [ ] url | company | role | location | posted: date").
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { localDate } from './config.mjs';
import { findDuplicates, normalizeUrl } from './tracker.mjs';

function parseTsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const head = lines[0].split('\t').map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((l) => Object.fromEntries(l.split('\t').map((v, i) => [head[i], v.trim()])));
}

export function mergeAdditions(tracker, dir, { dryRun = false } = {}) {
  const res = { added: [], updated: [], files: 0 };
  if (!existsSync(dir)) return res;
  const files = readdirSync(dir).filter((f) => f.endsWith('.tsv'));
  for (const f of files) {
    for (const r of parseTsv(readFileSync(join(dir, f), 'utf8'))) {
      const candidate = { company: r.company, role: r.role, url: r.url };
      const dupe = findDuplicates(tracker.rows(), candidate)[0];
      if (dupe) {
        if (!dryRun) tracker.setStatus(dupe.num, dupe.status, `${r.date || localDate()}: re-evaluated ${r.score || ''}: ${r.notes || ''}`.trim());
        res.updated.push(dupe.num);
      } else {
        const row = dryRun ? { num: '?' } : tracker.add({ date: r.date, company: r.company, role: r.role, score: r.score, status: r.status, pdf: r.pdf, report: r.report, notes: r.notes, url: r.url });
        res.added.push(row.num);
      }
    }
    res.files += 1;
    if (!dryRun) {
      mkdirSync(join(dir, 'merged'), { recursive: true });
      renameSync(join(dir, f), join(dir, 'merged', f));
    }
  }
  if (!dryRun && files.length) tracker.save();
  return res;
}

/** Unchecked "- [ ] url | company | role | location" lines of data/pipeline.md, oldest first. */
export function pendingPipeline(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => /^- \[ \] https?:\/\//.test(l)).map((l) => {
    const [url, company = '', role = '', location = ''] = l.replace(/^- \[ \] /, '').split(' | ').map((s) => s.trim());
    return { url, company, role, location };
  });
}

/** Tick a posting off, so it is not evaluated again. */
export function closePipeline(file, url) {
  if (!existsSync(file)) return false;
  const text = readFileSync(file, 'utf8');
  const next = text.split('\n').map((l) => (l.startsWith(`- [ ] ${url} `) || l.trimEnd() === `- [ ] ${url}` ? l.replace('- [ ]', '- [x]') : l)).join('\n');
  if (next !== text) writeFileSync(file, next);
  return next !== text;
}

/** Append scan candidates to data/pipeline.md, skipping URLs already listed there. */
export function appendPipeline(file, candidates) {
  const existing = existsSync(file) ? readFileSync(file, 'utf8') : '# Pipeline\n\n## Pending\n';
  const known = new Set((existing.match(/https?:\/\/[^\s|]+/g) || []).map(normalizeUrl));
  const fresh = candidates.filter((c) => c.url && !known.has(normalizeUrl(c.url)));
  if (!existsSync(file)) writeFileSync(file, existing);
  if (fresh.length) {
    const lines = fresh.map((c) => `- [ ] ${c.url} | ${c.company} | ${c.role} | ${c.location || ''}${c.posted ? ` | posted: ${c.posted}` : ''}`);
    appendFileSync(file, `\n${lines.join('\n')}\n`);
  }
  return fresh.length;
}
