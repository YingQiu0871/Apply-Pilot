import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULTS } from '../src/config.mjs';
import { Tracker, canonicalStatus, events, findDuplicates, lastActivity, normalizeUrl } from '../src/tracker.mjs';
import { hardFilter, scoreEvaluation } from '../src/scoring.mjs';
import { dueFollowUps } from '../src/followups.mjs';
import { lintText } from '../src/lint.mjs';
import { finishEvaluation, parseModelJson } from '../src/evaluate.mjs';

const tmp = () => join(mkdtempSync(join(tmpdir(), 'apply-pilot-')), 'applications.md');

test('tracker add, setStatus, save and reload keep the career-ops layout', () => {
  const file = tmp();
  const t = new Tracker(file);
  const a = t.add({ date: '2026-09-01', company: 'Lab A', role: 'M2 internship | formulation', url: 'https://www.linkedin.com/jobs/view/4484102144/' });
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
    { num: 1, company: 'Sanofi – Vitry', role: 'stage 6 mois purification anticorps', url: 'https://fr.linkedin.com/jobs/view/stage-x-4474739067', notes: '' },
  ];
  assert.equal(normalizeUrl('https://www.linkedin.com/jobs/view/4474739067/?ref=x'), 'linkedin#4474739067');
  assert.equal(findDuplicates(rows, { url: 'https://www.linkedin.com/jobs/view/4474739067/' }).length, 1);
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
