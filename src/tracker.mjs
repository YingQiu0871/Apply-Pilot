// Markdown application tracker. The table layout is the same as career-ops'
// data/applications.md, so either tool can read the other's file:
// | # | Date | Company | Role | Score | Status | PDF | Report | Notes | URL |
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { localDate } from './config.mjs';
import { EVENT_TYPES, eventType, scheduledFor } from './events.mjs';

export const HEADER = '| # | Date | Company | Role | Score | Status | PDF | Report | Notes | URL |';
const RULE = '|---|------|---------|------|-------|--------|-----|--------|-------|-----|';

// Canonical states, in lifecycle order. Terminal states supersede earlier ones.
export const STATES = [
  { id: 'Evaluated', aliases: ['evaluated', 'consider', 'hold'], rank: 0 },
  { id: 'SKIP', aliases: ['skip', 'skipped'], rank: 0 },
  { id: 'Discarded', aliases: ['discarded', 'closed', 'duplicate'], rank: 0.5 },
  { id: 'Applied', aliases: ['applied', 'sent', 'submitted'], rank: 1 },
  { id: 'Responded', aliases: ['responded', 'replied'], rank: 2 },
  { id: 'Interview', aliases: ['interview'], rank: 3 },
  { id: 'Offer', aliases: ['offer'], rank: 4, terminal: true },
  { id: 'Rejected', aliases: ['rejected'], rank: 4, terminal: true },
];

export function canonicalStatus(value) {
  const v = String(value || '').trim().toLowerCase();
  const hit = STATES.find((s) => s.id.toLowerCase() === v || s.aliases.includes(v));
  return hit ? hit.id : null;
}

const DATE_RE = /20\d\d-\d\d-\d\d/g;
const cell = (v) => String(v ?? '').replace(/\|/g, '/').replace(/\s*\n\s*/g, ' ').trim();

export function parseScore(raw) {
  const m = String(raw || '').match(/([\d.]+)\s*(\/\s*(100|5))?/);
  if (!m) return null;
  const v = Number(m[1]);
  return m[3] === '100' || v > 5 ? Math.round(v) : Math.round(v * 20);
}

function parseLine(line) {
  const c = line.split('|').map((x) => x.trim());
  return {
    num: Number(c[1]), date: c[2], company: c[3], role: c[4], score: c[5], status: c[6],
    pdf: c[7], report: c[8], notes: c[9] || '', url: c[10] || '',
  };
}

const formatLine = (r) => `| ${r.num} | ${cell(r.date)} | ${cell(r.company)} | ${cell(r.role)} | ${cell(r.score || '-')} | ${cell(r.status)} | ${cell(r.pdf || '-')} | ${cell(r.report || '-')} | ${cell(r.notes)} | ${cell(r.url || '-')} |`;

export class Tracker {
  constructor(file) {
    this.file = file;
    this.lines = existsSync(file) ? readFileSync(file, 'utf8').split(/\r?\n/) : ['# Applications Tracker', '', HEADER, RULE];
  }

  rows() {
    return this.lines.filter((l) => /^\| *\d+ \|/.test(l)).map(parseLine);
  }

  get(num) {
    return this.rows().find((r) => r.num === Number(num)) || null;
  }

  nextNumber() {
    return this.rows().reduce((m, r) => Math.max(m, r.num), 0) + 1;
  }

  add(row) {
    const status = canonicalStatus(row.status) || 'Evaluated';
    const full = { date: localDate(), score: '-', ...row, status, num: this.nextNumber() };
    while (this.lines.length && this.lines.at(-1) === '') this.lines.pop();
    this.lines.push(formatLine(full));
    return full;
  }

  /** Set status and append a dated note. Notes without a leading date get today's. */
  setStatus(num, status, note) {
    const canon = canonicalStatus(status);
    if (!canon) throw new Error(`unknown status "${status}" (use one of ${STATES.map((s) => s.id).join(', ')})`);
    const i = this.lines.findIndex((l) => new RegExp(`^\\| *${Number(num)} \\|`).test(l));
    if (i < 0) throw new Error(`row #${num} not found`);
    const row = parseLine(this.lines[i]);
    const before = row.status;
    row.status = canon;
    if (note) {
      const dated = /^20\d\d-\d\d-\d\d/.test(note.trim()) ? note.trim() : `${localDate()}: ${note.trim()}`;
      row.notes = row.notes ? `${row.notes}; ${dated}` : dated;
    }
    this.lines[i] = formatLine(row);
    return { before, after: canon, row };
  }

  save() {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, `${this.lines.join('\n').replace(/\n*$/, '')}\n`, 'utf8');
    renameSync(tmp, this.file);
  }
}

// ---- derived views -------------------------------------------------------

export function normalizeUrl(raw) {
  const value = String(raw || '').match(/https?:\/\/[^\s|;)]+/i)?.[0] || '';
  if (!value) return '';
  try {
    const url = new URL(value);
    const li = url.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d{8,})/);
    if (/linkedin\.com$/i.test(url.hostname) && li) return `linkedin#${li[1]}`;
    const jk = /indeed\./i.test(url.hostname) ? url.searchParams.get('jk') : null;
    if (jk) return `indeed#${jk}`;
    url.hash = ''; url.search = '';
    return url.toString().replace(/\/$/, '').replace(/^https?:\/\/(www\.)?/, '').toLowerCase();
  } catch { return value.toLowerCase(); }
}

const norm = (v) => String(v || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const STOP = new Set(['stage', 'stagiaire', 'intern', 'internship', 'm2', 'mois', 'months', 'month', 'de', 'du', 'des', 'la', 'le', 'les', 'et', 'en', 'and', 'the', 'of', 'for', 'pour', 'h', 'f', 'x']);
const tokens = (v) => new Set(norm(v).split(' ').filter((t) => t.length > 2 && !STOP.has(t) && !/^\d+$/.test(t)));

export function similarity(a, b) {
  const l = tokens(a), r = tokens(b);
  if (!l.size || !r.size) return 0;
  let i = 0;
  for (const t of l) if (r.has(t)) i += 1;
  return Math.max(i / (l.size + r.size - i), (i / Math.min(l.size, r.size)) * 0.9);
}

const sameCompany = (a, b) => {
  const x = norm(a).split(' ')[0], y = norm(b).split(' ')[0];
  return x.length >= 3 && y.length >= 3 && (norm(a).includes(y) || norm(b).includes(x));
};

/** Existing rows that look like the same posting (URL first, then company + role). */
export function findDuplicates(rows, candidate, threshold = 0.7) {
  const key = normalizeUrl(candidate.url);
  return rows.filter((r) => {
    if (key && normalizeUrl(r.url || r.notes) === key) return true;
    return sameCompany(r.company, candidate.company) && similarity(r.role, candidate.role) >= threshold;
  });
}

// An event starts at a date at the beginning of the cell or after "; ", "。" or ". ",
// optionally labelled "Note:"; dates inside a sentence ("scheduled for 2026-10-30")
// stay part of the text.
const EVENT_RE = /(?:^|[;。]\s*|\.\s+)(?:Note:\s*)?(20\d\d-\d\d-\d\d)(?:[ T](\d\d:\d\d))?[:\s]+([^]*?)(?=(?:[;。]\s*|\.\s+)(?:Note:\s*)?20\d\d-\d\d-\d\d|$)/g;

/** Dated fragments of the notes cell, ignoring future dates such as start dates. */
export function events(row, today = localDate()) {
  const out = [];
  for (const m of String(row.notes || '').matchAll(EVENT_RE)) {
    if (m[1] > today) continue;
    const text = m[3].replace(/[;.。]?\s*Link:\s.*$/i, '').trim().replace(/^[:;,\s]+/, '');
    if (!text) continue;
    const type = eventType(text);
    out.push({ date: m[1], time: m[2] || null, kind: EVENT_TYPES[type], type, sendAt: scheduledFor(text), text });
  }
  return out;
}

/** Latest date in the row. Internal checks (audit notes, [bracketed] tags) are not activity. */
export function lastActivity(row, today = localDate()) {
  const notes = String(row.notes || '')
    .replace(EVENT_RE, (m, _date, _time, body) => (eventType(body) === 'audit' ? ' ' : m))
    .replace(/\[[^\]]*\]/g, ' ');
  const dates = [row.date, ...(notes.match(DATE_RE) || [])].filter((d) => d && d <= today).sort();
  return dates.at(-1) || row.date;
}
