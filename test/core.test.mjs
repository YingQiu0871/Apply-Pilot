import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULTS } from '../src/config.mjs';
import { Tracker, canonicalStatus, events, findDuplicates, lastActivity, normalizeUrl } from '../src/tracker.mjs';
import { eventKind, eventType, stageOf } from '../src/events.mjs';
import { hardFilter, scoreEvaluation } from '../src/scoring.mjs';
import { dueFollowUps } from '../src/followups.mjs';
import { lintText } from '../src/lint.mjs';
import { finishEvaluation, parseModelJson } from '../src/evaluate.mjs';

const tmp = () => join(mkdtempSync(join(tmpdir(), 'apply-pilot-')), 'applications.md');

test('tracker add, setStatus, save and reload keep the career-ops layout', () => {
  const file = tmp();
  const t = new Tracker(file);
  const a = t.add({ date: '2026-09-01', company: 'Lab A', role: 'M2 internship | formulation', url: 'https://www.linkedin.com/jobs/view/1000000001/' });
  t.add({ date: '2026-09-02', company: 'Lab B', role: 'Analytics intern' });
  t.setStatus(a.num, 'applied', '2026-09-03: sent from school mailbox');
  t.save();
  const text = readFileSync(file, 'utf8');
  assert.match(text, /\| # \| Date \| Company \| Role \| Score \| Status \| PDF \| Report \| Notes \| URL \|/);
  const rows = new Tracker(file).rows();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].status, 'Applied');
  assert.equal(rows[0].role, 'M2 internship / formulation', 'pipes inside cells are escaped');
  assert.match(rows[0].notes, /^2026-09-03: sent/);
});

test('setStatus rejects unknown states and missing rows', () => {
  const t = new Tracker(tmp());
  t.add({ company: 'X', role: 'Y' });
  assert.throws(() => t.setStatus(1, 'maybe'), /unknown status/);
  assert.throws(() => t.setStatus(9, 'Applied'), /not found/);
  assert.equal(canonicalStatus('submitted'), 'Applied');
});

test('duplicates are found by LinkedIn id and by company + role', () => {
  const rows = [
    { num: 1, company: 'Sanofi – Vitry', role: 'stage 6 mois purification anticorps', url: 'https://fr.linkedin.com/jobs/view/stage-x-1000000002', notes: '' },
  ];
  assert.equal(normalizeUrl('https://www.linkedin.com/jobs/view/1000000002/?ref=x'), 'linkedin#1000000002');
  assert.equal(findDuplicates(rows, { url: 'https://www.linkedin.com/jobs/view/1000000002/' }).length, 1);
  assert.equal(findDuplicates(rows, { company: 'Sanofi', role: 'Stage purification anticorps (6 mois)' }).length, 1);
  assert.equal(findDuplicates(rows, { company: 'Danone', role: 'purification anticorps' }).length, 0);
});

test('events ignore future dates and classify follow-ups and rejections', () => {
  const row = { date: '2026-09-14', notes: 'Applied for a start on 2027-01-04; 2026-10-29: follow-up scheduled (reply-all); 2026-10-30: rejection email: position already filled' };
  const ev = events(row, '2026-10-30');
  assert.deepEqual(ev.map((e) => e.kind), ['followup', 'rejected']);
  const inline = events({ notes: '2026-10-29: follow-up scheduled for 2026-10-30 09:00, approved' }, '2026-10-30');
  assert.equal(inline.length, 1);
  assert.match(inline[0].text, /for 2026-10-30 09:00, approved/);
  assert.equal(lastActivity(row, '2026-10-30'), '2026-10-30');
});

test('event types read what happened, not words used in passing', () => {
  const cases = {
    "application emailed from school mailbox to two contacts; asked whether the internship can run in English.": 'applied',
    'search on a job board. Closest fit. Not applied; JD not yet opened.': 'evaluation',
    'user approved applying; materials in output/x. Not yet submitted.': 'prep',
    'user approved; materials ready. Not submitted.; Submitted via Workday': 'applied',
    "audit: submitted CV lists the wrong grade; bring it up at the interview": 'audit',
    'Dr Roe replied: position filled at the end of last week.': 'filled',
    'J. Doe: after interview, a higher-ranked student accepted the internship.': 'afterinterview',
    '收到回复：项目高度依赖细胞技术。结果：拒绝；无需回复。': 'rejected',
    'Prof Lee replied: will read applications and invite some to interview.': 'pending',
    'video interview held (questions on past experience)': 'held',
    'Dr Kim replied: interested in hosting a six-month internship': 'positive',
    'A. Smith: application caught his interest, asked for 2 references': 'request',
    'references sent (A, B). No outcome since.': 'materials',
    'auto-reply to the 12:15 reply: out of office, back 3 November': 'autoreply',
    'Acme acknowledgement email received': 'ack',
    'cold email scheduled from school mailbox for 2026-10-30 09:00': 'outreach',
    'reply sent to Dr Kim from personal mailbox': 'response',
    'LinkedIn reminder email to apply to saved job received; already Applied, no action.': 'note',
    '用户决定跳过该项目；保留记录用于去重。': 'note',
  };
  for (const [text, type] of Object.entries(cases)) assert.equal(eventType(text), type, text);
  assert.equal(eventKind('Acme acknowledgement email received'), 'ack');
});

test('events keep the time, the send date and the whole text, and drop link tails', () => {
  const long = 'x'.repeat(400);
  const [a, b, c] = events({ notes: `2026-10-29 12:16: cold email scheduled for 2026-10-30 09:00; 2026-10-29: ${long}; Link: https://x.test/1; Note: 2026-10-30 已收到回复。` }, '2026-10-30');
  assert.equal(a.time, '12:16');
  assert.equal(a.sendAt, '2026-10-30 09:00');
  assert.equal(b.text, long);
  assert.equal(c.type, 'reply');
});

test('stages split a status by what the notes show', () => {
  const stage = (row, opts = {}) => stageOf(row, events(row, '2026-10-30'), { today: '2026-10-30', thresholds: { apply: 80, consider: 65 }, ...opts });
  assert.equal(stage({ status: 'Evaluated', notes: '' }, { score: 90 }), 'recommended');
  assert.equal(stage({ status: 'Evaluated', notes: '' }, { score: 70 }), 'consider');
  assert.equal(stage({ status: 'Evaluated', notes: 'Skip; score 3.9/5' }, { score: 78 }), 'weak');
  assert.equal(stage({ status: 'Evaluated', notes: '' }), 'unscored');
  assert.equal(stage({ status: 'Applied', notes: '2026-10-29: cold email scheduled for 2026-11-02 09:00' }), 'queued');
  assert.equal(stage({ status: 'Applied', notes: '2026-10-01: submitted; 2026-10-20: follow-up sent' }), 'followedup');
  assert.equal(stage({ status: 'Applied', notes: '2026-10-01: submitted' }, { channel: 'portal' }), 'byportal');
  assert.equal(stage({ status: 'Responded', notes: '2026-10-02: X replied: interested in hosting' }), 'positive');
  assert.equal(stage({ status: 'Rejected', notes: '2026-10-02: X replied: position filled' }), 'filled');
  assert.equal(stage({ status: 'SKIP', notes: '' }), null);
});

test('audit notes and bracketed tags do not count as activity', () => {
  const row = { date: '2026-09-01', notes: '2026-09-10: submitted through the portal [mailbox audit 2026-10-29]; 2026-10-30 audit: CV lists the wrong grade' };
  assert.equal(lastActivity(row, '2026-10-30'), '2026-09-10');
  assert.equal(lastActivity({ date: '2026-09-01', notes: '2026-10-29: follow-up sent; 2026-10-30 audit: checked' }, '2026-10-30'), '2026-10-29');
  const rules = { afterDays: 14, maxFollowUps: 1, skipAppliedBefore: '2026-09-01' };
  assert.deepEqual(dueFollowUps([{ ...row, num: 1, status: 'Applied' }], rules, '2026-10-30').map((d) => d.row.num), [1]);
});

test('follow-ups respect afterDays, maxFollowUps and skipAppliedBefore', () => {
  const rules = { afterDays: 14, maxFollowUps: 1, skipAppliedBefore: '2026-09-01' };
  const rows = [
    { num: 1, status: 'Applied', date: '2026-09-10', notes: '2026-09-10: sent from school mailbox' },
    { num: 2, status: 'Applied', date: '2026-09-10', notes: '2026-10-20: follow-up sent' },
    { num: 3, status: 'Applied', date: '2026-08-10', notes: '' },
    { num: 4, status: 'Rejected', date: '2026-09-10', notes: '' },
  ];
  assert.deepEqual(dueFollowUps(rows, rules, '2026-10-29').map((d) => d.row.num), [1]);
});

const profile = {
  ...DEFAULTS,
  scoring: { thresholds: { apply: 80, consider: 65 }, dimensions: [{ id: 'fit', label: 'Fit', weight: 3 }, { id: 'lang', label: 'Language', weight: 1 }] },
  filters: { excludeCompanies: ['BadCo'], excludeKeywords: ['alternance'], requireKeywords: [] },
  writing: { bannedPhrases: ['synergies'], forbiddenClaims: ['flow cytometry'], maxSemicolons: 0 },
};

test('weighted score and decision', () => {
  const r = scoreEvaluation(profile, { fit: 5, lang: { score: 1, reason: 'French only' } });
  assert.equal(r.score100, 80);
  assert.equal(r.decision, 'Apply');
  assert.throws(() => scoreEvaluation(profile, { fit: 5 }), /missing rating/);
});

test('hard filters override the score', () => {
  assert.deepEqual(hardFilter(profile, { company: 'BadCo SA', text: '' }), ['excluded company: BadCo']);
  const res = finishEvaluation(profile, { company: 'Good', ratings: { fit: 5, lang: 5 } }, 'contrat en alternance');
  assert.equal(res.decision, 'Skip');
  assert.deepEqual(parseModelJson('Sure! {"a": 1} done'), { a: 1 });
});

test('lint flags stock phrases and claims, but allows honest negations', () => {
  const bad = lintText('I am passionate about synergies. I ran flow cytometry daily; it was great.', profile);
  const rules = bad.issues.map((i) => i.rule);
  assert.ok(rules.includes('stock-phrase'));
  assert.ok(rules.includes('forbidden-claim'));
  assert.ok(rules.includes('semicolons'));
  const ok = lintText('I have not used flow cytometry yet, and I would learn it with the team.', profile);
  assert.equal(ok.issues.length, 0);
});

test('portal title and location rules', async () => {
  const { ruleMatch, passesFilters } = await import('../src/scan/portals.mjs');
  assert.ok(ruleMatch('STAGE R&D Oncologie - Biologie Cellulaire', 'stage + biologie'));
  assert.ok(!ruleMatch('Internal auditor', 'word:intern'));
  const cfg = { titleFilter: { positive: ['stage + formulation'], negative: ['word:RH'] }, locationFilter: { allow: ['word:FR', 'France'], deny: ['Netherlands'] }, maxAgeDays: 14 };
  assert.equal(passesFilters({ title: 'Stage formulation', location: 'SURESNES, FR', posted: '2026-10-20' }, cfg, '2026-10-29'), null);
  assert.equal(passesFilters({ title: 'Stage formulation', location: 'Leiden, Netherlands' }, cfg), 'location-deny');
  assert.equal(passesFilters({ title: 'Stage formulation', location: 'Paris, France', posted: '2026-09-01' }, cfg, '2026-10-29'), 'too-old');
});

test('merge-additions adds new rows and re-notes known ones', async () => {
  const { mergeAdditions, appendPipeline } = await import('../src/additions.mjs');
  const { mkdtempSync, writeFileSync: w, existsSync: ex, readFileSync: r } = await import('node:fs');
  const dir = mkdtempSync(join(tmpdir(), 'ap-add-'));
  const t = new Tracker(join(dir, 'applications.md'));
  t.add({ company: 'Sanofi', role: 'Old role', url: 'https://www.linkedin.com/jobs/view/1000000003/' });
  w(join(dir, 'a.tsv'), '#\tDate\tCompany\tRole\tScore\tStatus\tPDF\tReport\tNotes\tvia\tlocation\turl\n517\t2026-10-22\tSanofi\tDrug product\t3.95/5\tEvaluated\t-\t-\tConsider\t-\tLyon\thttps://www.linkedin.com/jobs/view/1000000003/\n518\t2026-10-22\tIpsen\tAnalytical intern\t4.1/5\tEvaluated\t-\t-\tApply\t-\tParis\thttps://ipsen.example/job/1\n');
  const res = mergeAdditions(t, dir);
  assert.deepEqual([res.added.length, res.updated.length], [1, 1]);
  assert.ok(ex(join(dir, 'merged', 'a.tsv')));
  const pipe = join(dir, 'pipeline.md');
  assert.equal(appendPipeline(pipe, [{ url: 'https://x.example/1', company: 'X', role: 'Stage' }]), 1);
  assert.equal(appendPipeline(pipe, [{ url: 'https://x.example/1', company: 'X', role: 'Stage' }]), 0);
  assert.match(r(pipe, 'utf8'), /- \[ \] https:\/\/x\.example\/1 \| X \| Stage/);
});

test('hard filters match whole words only', () => {
  const p = { ...DEFAULTS, filters: { excludeCompanies: ['CEA'], excludeKeywords: ['alternance'], requireKeywords: [] } };
  assert.deepEqual(hardFilter(p, { company: 'Ceapro Inc', text: 'Stage formulation' }), []);
  assert.deepEqual(hardFilter(p, { company: 'CEA Saclay', text: '' }), ['excluded company: CEA']);
  assert.deepEqual(hardFilter(p, { company: 'X', text: 'Stage en alternance' }), ['excluded keyword: alternance']);
});

test('new ATS providers map their public feeds', async () => {
  const { PROVIDERS } = await import('../src/scan/portals.mjs');
  const real = globalThis.fetch;
  const reply = {
    'boards-api.greenhouse.io': { jobs: [{ title: 'Formulation intern', absolute_url: 'https://x/gh/1', location: { name: 'Paris' }, first_published: '2026-10-20T10:00:00Z' }] },
    'api.lever.co': [{ text: 'Analytical intern', hostedUrl: 'https://x/lv/1', categories: { location: 'Lyon' }, createdAt: 1792000000000 }],
    'api.ashbyhq.com': { jobs: [{ title: 'CMC intern', jobUrl: 'https://x/ab/1', location: 'Basel', publishedAt: '2026-10-21T00:00:00Z' }] },
    'example.recruitee.com': { offers: [{ title: 'Stage R&D', careers_url: 'https://x/rc/1', city: 'Gent', country: 'Belgium', published_at: '2026-10-22' }] },
    'apply.workable.com': { jobs: [{ title: 'Praktikum Analytik', url: 'https://x/wk/1', city: 'Berlin', country: 'Germany', published_on: '2026-10-23' }] },
  };
  globalThis.fetch = async (url) => {
    const host = new URL(url).hostname;
    if (host === 'example.teamtailor.com') return new Response('<rss><channel><item><title>ML Internship</title><link>https://x/tt/1</link><pubDate>Mon, 13 Oct 2026 10:00:00 +0200</pubDate><tt:city>Paris</tt:city></item></channel></rss>', { status: 200 });
    return new Response(JSON.stringify(reply[host]), { status: 200 });
  };
  try {
    const cases = [['greenhouse', 'https://boards.greenhouse.io/acme'], ['lever', 'https://jobs.lever.co/acme'], ['ashby', 'https://jobs.ashbyhq.com/acme'],
      ['teamtailor', 'https://example.teamtailor.com'], ['recruitee', 'https://example.recruitee.com'], ['workable', 'https://apply.workable.com/acme']];
    for (const [p, url] of cases) {
      const jobs = await PROVIDERS[p]({ url }, []);
      assert.equal(jobs.length, 1, p);
      assert.ok(jobs[0].title && jobs[0].url.startsWith('https://x/'), p);
    }
  } finally { globalThis.fetch = real; }
});

test('loadEnv reads KEY=VALUE without overriding the environment', async () => {
  const { loadEnv } = await import('../src/config.mjs');
  const { mkdtempSync, writeFileSync: w } = await import('node:fs');
  const dir = mkdtempSync(join(tmpdir(), 'ap-env-'));
  w(join(dir, '.env'), 'AP_TEST_ONE=hello\nAP_TEST_TWO="quoted"\n# comment\n');
  process.env.AP_TEST_TWO = 'kept';
  loadEnv(dir);
  assert.equal(process.env.AP_TEST_ONE, 'hello');
  assert.equal(process.env.AP_TEST_TWO, 'kept');
});

test('import reads CSV, JSON, Markdown, Excel and SQLite, maps columns and statuses, skips tracked rows', async () => {
  const { previewImport, writeImport, mapStatus, mapColumns } = await import('../src/importer.mjs');
  const fs = await import('node:fs');
  const dir = fs.mkdtempSync(join(tmpdir(), 'ap-imp-'));
  const src = join(dir, 'old');
  fs.mkdirSync(src);
  fs.writeFileSync(join(src, 'jobs.csv'), '﻿公司;岗位;状态;投递日期;链接;备注\nLab A;Stage formulation;已投递;2026/09/14;https://a.example/1;"via email; reply pending"\nLab B;Stage analytique;未录用;14/09/2026;;\n');
  fs.writeFileSync(join(src, 'more.json'), JSON.stringify({ applications: [{ Company: 'Lab C', Position: 'Internship CMC', Status: 'Interview', Link: 'https://c.example/9' }] }));
  fs.writeFileSync(join(src, 'notes.md'), '# Notes\n\n| Entreprise | Poste | Statut |\n|---|---|---|\n| Lab D | Stage galénique | refusé |\n');
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Tracker');
  ws.addRow(['Overview']);
  ws.addRow(['Firma', 'Stelle', 'Status', 'Datum']);
  ws.addRow(['Lab E', 'Praktikum Formulierung', 'beworben', new Date('2026-10-01T12:00:00Z')]);
  await wb.xlsx.writeFile(join(src, 'tracker.xlsx'));
  let sqlite = false;
  try {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(join(src, 'apps.db'));
    db.exec("CREATE TABLE applications (company TEXT, role TEXT, status TEXT, url TEXT); INSERT INTO applications VALUES ('Lab F', 'M2 internship', 'Applied', 'https://f.example/2');");
    db.close();
    sqlite = true;
  } catch { /* node:sqlite needs Node 22.5+ */ }

  const trackerFile = join(dir, 'applications.md');
  const t = new Tracker(trackerFile);
  t.add({ company: 'Lab C', role: 'Internship CMC', url: 'https://c.example/9' });
  t.save();

  const pv = await previewImport(src, trackerFile);
  const names = pv.fresh.map((r) => r.company).sort();
  assert.deepEqual(names, ['Lab A', 'Lab B', 'Lab D', 'Lab E', ...(sqlite ? ['Lab F'] : [])]);
  assert.equal(pv.duplicates.length, 1);
  const byName = Object.fromEntries(pv.fresh.map((r) => [r.company, r]));
  assert.equal(byName['Lab A'].status, 'Applied');
  assert.equal(byName['Lab A'].date, '2026-09-14');
  assert.equal(byName['Lab B'].status, 'Rejected');
  assert.equal(byName['Lab B'].date, '2026-09-14');
  assert.equal(byName['Lab D'].status, 'Rejected');
  assert.equal(byName['Lab E'].status, 'Applied');
  assert.equal(mapStatus('面试已完成'), 'Interview');
  assert.equal(mapColumns(['Company name', 'Job title', 'State']).role, 1);

  const added = writeImport(pv, trackerFile);
  assert.equal(added.length, pv.fresh.length);
  const again = await previewImport(src, trackerFile);
  assert.equal(again.fresh.length, 0, 'a second import adds nothing');
  assert.match(new Tracker(trackerFile).rows().at(-1).notes, /imported from/);
});

test('data folder: env, then saved setting, then default; init and inspect', async () => {
  const { homeDir, homeSource, saveHome } = await import('../src/config.mjs');
  const { initHome, inspectHome } = await import('../src/home.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'ap-home-'));
  const keep = { home: process.env.APPLY_PILOT_HOME, settings: process.env.APPLY_PILOT_SETTINGS };
  try {
    delete process.env.APPLY_PILOT_HOME;
    process.env.APPLY_PILOT_SETTINGS = join(dir, 'settings', 'settings.json');
    assert.equal(homeSource(), 'default');

    const data = join(dir, 'data-folder');
    assert.equal(inspectHome(data).exists, false);
    const { wrote } = initHome(data);
    assert.equal(wrote.length, 3);
    assert.equal(initHome(data).wrote.length, 0, 'existing files are kept');
    const info = inspectHome(data);
    assert.ok(info.hasProfile && info.hasTracker);
    assert.equal(info.rows, 0);

    saveHome(data);
    assert.equal(homeSource(), 'settings');
    assert.equal(homeDir(), data);
    process.env.APPLY_PILOT_HOME = join(dir, 'other');
    assert.equal(homeSource(), 'env');
    assert.equal(homeDir(), join(dir, 'other'));
  } finally {
    if (keep.home === undefined) delete process.env.APPLY_PILOT_HOME; else process.env.APPLY_PILOT_HOME = keep.home;
    if (keep.settings === undefined) delete process.env.APPLY_PILOT_SETTINGS; else process.env.APPLY_PILOT_SETTINGS = keep.settings;
  }
});
