// Import an existing application database from a file or folder the user names:
// apply-pilot / career-ops applications.md, other Markdown tables, Excel (.xlsx),
// CSV / TSV, JSON and SQLite (.db / .sqlite). Column names are matched in
// English, French, German and Chinese; statuses are mapped to the tracker's states.
// Reading never changes the source files. Writing only appends new rows to the
// tracker, skipping rows that look like postings already tracked.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, extname, join, resolve } from 'node:path';
import { localDate } from './config.mjs';
import { HEADER, Tracker, findDuplicates, normalizeUrl } from './tracker.mjs';

const EXTS = new Set(['.md', '.markdown', '.csv', '.tsv', '.json', '.xlsx', '.xlsm', '.db', '.sqlite', '.sqlite3']);
const fold = (s) => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[\s_\-./()#:：]+/g, ' ').trim();

// Header synonyms per field. Matching is on the folded header text.
const FIELDS = {
  company: ['company', 'company name', 'employer', 'organisation', 'organization', 'lab', 'laboratory', 'institution', 'entreprise', 'societe', 'organisme', 'laboratoire', 'firma', 'unternehmen', '公司', '单位', '机构', '公司 实验室', '雇主'],
  role: ['role', 'position', 'title', 'job', 'job title', 'offer', 'posting', 'poste', 'intitule', 'offre', 'stelle', 'stellenbezeichnung', '岗位', '职位', '岗位名称', '职位名称', '项目', '课题'],
  status: ['status', 'state', 'stage of process', 'statut', 'etat', 'zustand', '状态', '进度', '申请状态', '结果'],
  date: ['date', 'applied', 'applied on', 'date applied', 'application date', 'submitted', 'date de candidature', 'datum', 'bewerbungsdatum', '日期', '投递日期', '申请日期', '投递时间'],
  url: ['url', 'link', 'job url', 'posting url', 'lien', 'adresse', '链接', '网址', '岗位链接'],
  notes: ['notes', 'note', 'comments', 'comment', 'remarks', 'remarques', 'commentaire', 'bemerkung', 'notizen', '备注', '说明', '评论', '记录'],
  score: ['score', 'rating', 'fit', 'match', 'evaluation', 'priorite', 'bewertung', '评分', '分数', '匹配度', '匹配分', '最终分', '加权分'],
  location: ['location', 'city', 'place', 'lieu', 'ville', 'ort', 'standort', '地点', '城市', '地区'],
  contact: ['contact', 'recruiter', 'supervisor', 'pi', 'email', 'e mail', 'interlocuteur', 'ansprechpartner', '联系人', '导师', '邮箱'],
};

export function mapColumns(headers) {
  const map = {};
  const used = new Set();
  for (const [field, names] of Object.entries(FIELDS)) {
    let best = -1;
    headers.forEach((h, i) => {
      if (used.has(i)) return;
      const f = fold(h);
      if (!f || f.length > 40) return; // headers are short labels, not sentences
      if (names.includes(f) && best < 0) best = i;
    });
    if (best < 0) headers.forEach((h, i) => { if (best < 0 && !used.has(i) && fold(h).length <= 40 && names.some((n) => (n.length > 3 || /[一-鿿]/.test(n)) && fold(h).includes(n))) best = i; });
    if (best >= 0) { map[field] = best; used.add(best); }
  }
  return map;
}

/** Map a free-text status (any language in the tracker's vocabulary) to a tracker state. */
export function mapStatus(raw) {
  const v = fold(raw);
  if (!v) return 'Evaluated';
  if (/offer|accept|retenu e? definitivement|zusage|录用(?!失败)|已接受/.test(v) && !/未录用|not/.test(v)) return 'Offer';
  if (/reject|declin|refus|non retenu|pas retenu|absage|未录用|未录取|拒|未通过|unsuccessful|not selected/.test(v)) return 'Rejected';
  if (/interview|entretien|vorstellungsgesprach|面试/.test(v)) return 'Interview';
  if (/respon|repl|reponse|antwort|回复|回信/.test(v)) return 'Responded';
  if (/appl|submit|sent|postule|candidature envoyee|envoye|beworben|已投递|投递|已申请|已发送|提交/.test(v)) return 'Applied';
  if (/skip|ignore|pas interess|跳过|不申请|放弃/.test(v)) return 'SKIP';
  if (/clos|ferme|expired|duplicate|geschlossen|关闭|过期|重复|不推进/.test(v)) return 'Discarded';
  return 'Evaluated';
}

function normDate(v) {
  if (v instanceof Date) return Number.isNaN(+v) ? '' : v.toLocaleDateString('sv-SE');
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10); // Excel serial
  const s = String(v ?? '').trim();
  let m = s.match(/(20\d\d)[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](20\d\d)/); // dd/mm/yyyy (European order)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
}

const cellText = (v) => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return normDate(v);
  if (typeof v === 'object') return String(v.text ?? v.result ?? v.hyperlink ?? (v.richText ? v.richText.map((r) => r.text).join('') : '') ?? '');
  return String(v);
};

/** Turn a 2-D table into normalized rows, finding the header row in the first 15 rows. */
export function rowsFromTable(table, source) {
  let headerAt = -1, map = {};
  for (let i = 0; i < Math.min(15, table.length); i += 1) {
    const m = mapColumns(table[i].map(cellText));
    // A header names the company and the role, plus at least one of status / link / date.
    if (m.company !== undefined && m.role !== undefined && (m.status !== undefined || m.url !== undefined || m.date !== undefined)) { headerAt = i; map = m; break; }
  }
  if (headerAt < 0) return { rows: [], mapping: null };
  const headers = table[headerAt].map(cellText);
  const rows = [];
  for (const raw of table.slice(headerAt + 1)) {
    const get = (f) => (map[f] === undefined ? '' : raw[map[f]]);
    const company = cellText(get('company')).trim(), role = cellText(get('role')).trim();
    if (!company && !role) continue;
    const link = get('url');
    const url = (typeof link === 'object' && link?.hyperlink) || cellText(link).trim();
    const extras = [get('location') && `City: ${cellText(get('location')).trim()}`, get('contact') && `Contact: ${cellText(get('contact')).trim()}`].filter(Boolean);
    rows.push({
      company: company || '?', role: role || '?', status: mapStatus(cellText(get('status'))), statusRaw: cellText(get('status')).trim(),
      date: normDate(get('date')) || '', score: cellText(get('score')).trim(), url: /^https?:\/\//.test(url) ? url : '',
      notes: [...extras, cellText(get('notes')).trim()].filter(Boolean).join('; '), source,
    });
  }
  return { rows, mapping: Object.fromEntries(Object.entries(map).map(([f, i]) => [f, headers[i]])) };
}

// ---- readers ---------------------------------------------------------------

function parseDelimited(text, sep) {
  const out = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i += 1; } else if (ch === '"') q = false; else cur += ch; continue; }
    if (ch === '"') q = true; else if (ch === sep) { row.push(cur); cur = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i += 1; row.push(cur); out.push(row); row = []; cur = ''; } else cur += ch;
  }
  if (cur || row.length) { row.push(cur); out.push(row); }
  return out.filter((r) => r.some((c) => c.trim()));
}

function markdownTables(text) {
  const tables = []; let cur = null;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*\|.*\|\s*$/.test(line)) {
      if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) continue; // separator row
      (cur ||= []).push(line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
    } else if (cur) { tables.push(cur); cur = null; }
  }
  if (cur) tables.push(cur);
  return tables;
}

// Minimal .xlsx reader on JSZip: workbook → sheets → cells (shared and inline
// strings, numbers, hyperlinks). Works on files other tools refuse to open.
const xmlText = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const colIndex = (ref) => [...ref.replace(/\d+/g, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

export async function readXlsx(file) {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(readFileSync(file));
  // Some writers prefix every element (<x:sheet>, <x:row>); drop element prefixes, keep attributes such as r:id.
  const read = async (p) => (zip.file(p) ? (await zip.file(p).async('string')).replace(/<(\/?)[A-Za-z]\w*:(?=[A-Za-z])/g, '<$1') : '');
  const shared = [...(await read('xl/sharedStrings.xml')).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => xmlText(t[1])).join(''));
  const rels = Object.fromEntries([...(await read('xl/_rels/workbook.xml.rels')).matchAll(/<Relationship\b[^>]*>/g)].map(([tag]) => [tag.match(/Id="([^"]+)"/)?.[1], tag.match(/Target="([^"]+)"/)?.[1]]));
  const sheets = [...(await read('xl/workbook.xml')).matchAll(/<sheet\b[^>]*>/g)].map(([tag]) => ({ name: xmlText(tag.match(/name="([^"]+)"/)?.[1]), rid: tag.match(/r:id="([^"]+)"/)?.[1] }));
  const out = [];
  for (const s of sheets) {
    const target = rels[s.rid] || '';
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    const xml = await read(path);
    if (!xml) continue;
    // Hyperlinks live outside the cells: <hyperlink ref="E7" r:id="rId3"/> → sheet rels.
    const sheetRels = Object.fromEntries([...(await read(path.replace(/([^/]+)$/, '_rels/$1.rels'))).matchAll(/<Relationship\b[^>]*>/g)].map(([tag]) => [tag.match(/Id="([^"]+)"/)?.[1], tag.match(/Target="([^"]+)"/)?.[1]]));
    const links = Object.fromEntries([...xml.matchAll(/<hyperlink\b[^>]*>/g)].map(([tag]) => [tag.match(/ref="([^"]+)"/)?.[1], sheetRels[tag.match(/r:id="([^"]+)"/)?.[1]]]).filter(([k, v]) => k && v));
    const table = [];
    for (const [, row] of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = [];
      for (const m of row.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = m[1], body = m[2] || '';
        const ref = attrs.match(/r="([A-Z]+\d+)"/)?.[1];
        const type = attrs.match(/t="([^"]+)"/)?.[1];
        const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        let val = type === 's' ? shared[Number(v)] : type === 'inlineStr' ? [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => xmlText(t[1])).join('') : type === 'str' || type === 'b' ? xmlText(v) : v !== undefined ? Number(v) : '';
        if (ref && links[ref]) val = { text: String(val ?? ''), hyperlink: links[ref] };
        cells[ref ? colIndex(ref) : cells.length] = val;
      }
      table.push(Array.from(cells, (c) => (c === undefined ? '' : c)));
    }
    out.push({ sheet: s.name, table });
  }
  return out;
}

async function readSqlite(file) {
  let DatabaseSync;
  try { ({ DatabaseSync } = await import('node:sqlite')); } catch { throw new Error('reading SQLite needs Node 22.5 or later'); }
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((t) => t.name);
    return tables.map((name) => {
      const rows = db.prepare(`SELECT * FROM "${name.replace(/"/g, '""')}" LIMIT 50000`).all();
      const cols = rows.length ? Object.keys(rows[0]) : [];
      return { sheet: name, table: [cols, ...rows.map((r) => cols.map((c) => r[c]))] };
    });
  } finally { db.close(); }
}

export async function readSource(file) {
  const ext = extname(file).toLowerCase();
  const name = basename(file);
  const results = [];
  const push = (sheet, table) => { const r = rowsFromTable(table, sheet ? `${name} › ${sheet}` : name); if (r.rows.length) results.push({ file, sheet: sheet || null, ...r }); };
  if (ext === '.md' || ext === '.markdown') {
    const text = readFileSync(file, 'utf8');
    if (text.includes(HEADER)) {
      // apply-pilot / career-ops tracker: keep the exact fields.
      const rows = new Tracker(file).rows().map((r) => ({ company: r.company, role: r.role, status: mapStatus(r.status), statusRaw: r.status, date: normDate(r.date), score: r.score === '-' ? '' : r.score, url: /^https?:/.test(r.url) ? r.url : '', notes: r.notes, source: name }));
      if (rows.length) results.push({ file, sheet: null, rows, mapping: { format: 'apply-pilot / career-ops tracker' } });
    } else markdownTables(text).forEach((t, i) => push(`table ${i + 1}`, t));
  } else if (ext === '.csv' || ext === '.tsv') {
    const text = readFileSync(file, 'utf8').replace(/^﻿/, '');
    const sep = ext === '.tsv' ? '\t' : (text.split('\n')[0].split(';').length > text.split('\n')[0].split(',').length ? ';' : ',');
    push(null, parseDelimited(text, sep));
  } else if (ext === '.json') {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    const list = Array.isArray(data) ? data : (data.rows || data.applications || data.data || data.jobs || []);
    if (Array.isArray(list) && list.length && typeof list[0] === 'object') {
      const cols = [...new Set(list.flatMap((o) => Object.keys(o)))];
      push(null, [cols, ...list.map((o) => cols.map((c) => o[c]))]);
    }
  } else if (ext === '.xlsx' || ext === '.xlsm') {
    for (const { sheet, table } of await readXlsx(file)) push(sheet, table);
  } else if (ext === '.db' || ext === '.sqlite' || ext === '.sqlite3') {
    for (const { sheet, table } of await readSqlite(file)) push(sheet, table);
  }
  return results;
}

/** Expand "~", accept a file or a folder; folders are searched two levels deep. */
export function findSources(input) {
  const p = resolve(String(input).replace(/^~(?=$|[\\/])/, homedir()));
  if (!existsSync(p)) throw new Error(`not found: ${p}`);
  if (statSync(p).isFile()) return [p];
  const out = [];
  const walk = (dir, depth) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules' || /^~\$/.test(e.name)) continue; // skip Office lock files
      const full = join(dir, e.name);
      if (e.isDirectory() && depth < 2) walk(full, depth + 1);
      else if (e.isFile() && EXTS.has(extname(e.name).toLowerCase())) out.push(full);
    }
  };
  walk(p, 0);
  return out;
}

/** Read everything under `input` and compare it with the tracker. Changes nothing. */
export async function previewImport(input, trackerFile) {
  const files = findSources(input);
  const sources = [], errors = [];
  for (const f of files) {
    try { sources.push(...(await readSource(f))); } catch (e) { errors.push(`${basename(f)}: ${e.message}`); }
  }
  const existing = new Tracker(trackerFile).rows();
  const seen = [];
  const fresh = [], duplicates = [];
  for (const s of sources) {
    for (const r of s.rows) {
      const inTracker = findDuplicates(existing, r)[0];
      const inBatch = findDuplicates(seen, r)[0] || (r.url && seen.find((x) => normalizeUrl(x.url) === normalizeUrl(r.url)));
      if (inTracker || inBatch) { duplicates.push({ ...r, matches: inTracker ? `#${inTracker.num}` : 'earlier row in this import' }); continue; }
      seen.push({ ...r, num: seen.length });
      fresh.push(r);
    }
  }
  return {
    input: resolve(String(input).replace(/^~(?=$|[\\/])/, homedir())), files: files.length,
    sources: sources.map((s) => ({ file: s.file, sheet: s.sheet, rows: s.rows.length, mapping: s.mapping })),
    fresh, duplicates, errors,
  };
}

/** Append the fresh rows from a preview to the tracker. */
export function writeImport(preview, trackerFile) {
  const t = new Tracker(trackerFile);
  const today = localDate();
  const added = preview.fresh.map((r) => t.add({
    date: r.date || today, company: r.company, role: r.role, score: r.score || '-', status: r.status, url: r.url,
    notes: [r.notes, `${today}: imported from ${r.source}${r.statusRaw && r.statusRaw !== r.status ? ` (original status "${r.statusRaw}")` : ''}`].filter(Boolean).join('; '),
  }));
  t.save();
  return added.map((r) => r.num);
}
