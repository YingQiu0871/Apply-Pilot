import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadProfile, saveEnv } from '../src/config.mjs';
import { initHome, updateProfile } from '../src/home.mjs';
import { closePipeline, pendingPipeline } from '../src/additions.mjs';
import { Tracker } from '../src/tracker.mjs';
import { ReviewQueue, applyDecision, reviewFile } from '../src/review.mjs';
import { runToday, setupState, validateFollowup, validateProfileDraft } from '../src/daily.mjs';
import { askJson, classifyFailure, dshArgs, dshPatch, dshStart, testAgent, workerCommand } from '../src/worker.mjs';

const JD = 'Formulation intern for a six month project on lipid nanoparticles. '.repeat(8);
const today = '2026-10-30';

function newHome() {
  const home = join(mkdtempSync(join(tmpdir(), 'apply-pilot-work-')), 'data-folder');
  initHome(home);
  writeFileSync(join(home, 'data', 'pipeline.md'), '# Pipeline\n\n## Pending\n\n- [ ] https://jobs.example.com/1 | Acme | Formulation intern | Lyon\n- [ ] https://jobs.example.com/2 | Beta | Analytics intern | Basel\n');
  return home;
}

const ratings = (profile, score) => Object.fromEntries(profile.scoring.dimensions.map((d) => [d.id, { score, reason: 'stated in the posting' }]));
const evalReply = (profile, score = 5) => JSON.stringify({ company: 'From the model', role: 'From the model', ratings: ratings(profile, score), gaps: ['no cell culture'], summary: 'Two plain sentences.' });
const mailReply = (extra = {}) => JSON.stringify({ to: 'pat@example.com', subject: 'Internship application', body: 'I applied on 1 October and I am still interested in this internship. Is the position still open?', ...extra });

const fakeAgent = (profile, calls = []) => async (prompt) => {
  calls.push(prompt);
  return prompt.user.includes('JOB POSTING') ? evalReply(profile) : mailReply();
};

function dueRow(home, notes = '2026-10-01: sent to pat@example.com') {
  const t = new Tracker(join(home, 'data', 'applications.md'));
  const row = t.add({ date: '2026-10-01', company: 'Gamma', role: 'Intern', status: 'Applied', notes });
  t.save();
  return row;
}

test('the dsh patch disables every tool plugin and keeps sessions in the temporary folder', () => {
  const config = '# == base\n- id: tools\n  name: x\n- id: tool-bash\r\n  name: y\n- id: sandbox\n- id: tool-new-thing\n- id: tool-bash\n';
  const patch = dshPatch(config, "C:/temp/o'k/sessions");
  assert.match(patch, /- id: tool-bash\n {2}disabled: true/);
  assert.match(patch, /- id: tool-new-thing\n {2}disabled: true/, 'a tool added later is disabled too');
  assert.equal(patch.match(/id: tool-bash/g).length, 1);
  assert.ok(!/- id: tools\b/.test(patch), 'the tool registry stays');
  assert.ok(!patch.includes('id: sandbox'));
  assert.match(patch, /- id: session-projection-cache\n {2}disabled: true/, 'no copy of the prompt in the dsh cache');
  assert.match(patch, /root: 'C:\/temp\/o''k\/sessions'/);
  assert.throws(() => dshPatch('- id: llm\n', 'x'), /tool list/);
});

test('dsh gets the prompt as one argument, and too long a prompt is refused', () => {
  const prompt = 'a "quoted" & | > text\nsecond line';
  assert.equal(dshArgs('p.yml', prompt).at(-1), prompt);
  assert.throws(() => dshArgs('p.yml', 'x'.repeat(28001)), /too long/);
});

test('dsh starts through its own node on Windows, never through the launcher', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ap-dsh-'));
  const [node, script, shim] = ['node.exe', 'bin.js', 'dsh.cmd'].map((f) => join(dir, f));
  writeFileSync(node, ''); writeFileSync(script, '');
  writeFileSync(shim, `@echo off\r\nset "NODE_BIN=${node}"\r\nset "DSH_BIN=${script}"\r\nset "DSH_HOME=${dir}"\r\n`);
  assert.deepEqual(dshStart(shim), { file: node, pre: [script], env: { DSH_HOME: dir } });
  assert.deepEqual(dshStart('/usr/bin/dsh'), { file: '/usr/bin/dsh', pre: [], env: {} });
  writeFileSync(shim, '@echo off\r\n');
  assert.throws(() => dshStart(shim), (e) => e.reason === 'missing');
});

test('worker commands never pass the prompt as an argument and switch tools off', () => {
  const claude = workerCommand('claude', 'x');
  assert.equal(claude[claude.indexOf('--tools') + 1], '');
  assert.ok(!claude.includes('--allowedTools'));
  const codex = workerCommand('codex', 'out.txt');
  assert.equal(codex[codex.indexOf('--sandbox') + 1], 'read-only');
  assert.equal(codex.at(-1), '-', 'codex reads the prompt from stdin');
  assert.throws(() => workerCommand('deepseek', 'x'));
});

test('failures are sorted so the panel can say what to do', () => {
  assert.equal(classifyFailure('Not logged in · Please run /login'), 'login');
  assert.equal(classifyFailure('deepseek 401: {"error":"Authentication Fails"}'), 'login');
  assert.equal(classifyFailure('deepseek 402: Insufficient Balance'), 'quota');
  assert.equal(classifyFailure('fetch failed: ENOTFOUND api.deepseek.com'), 'network');
  assert.equal(classifyFailure('something odd'), 'other');
});

test('askJson sends a bad answer back once, then gives up', async () => {
  const prompts = [];
  const ask = async (p) => { prompts.push(p.user); return prompts.length === 1 ? 'not json' : '{"ok":true}'; };
  assert.deepEqual(await askJson(ask, { system: '', user: 'q' }, (v) => v), { ok: true });
  assert.match(prompts[1], /previous answer was rejected/);
  await assert.rejects(askJson(async () => '{"ok":false}', { system: '', user: 'q' }, () => { throw new Error('bad'); }), (e) => e.reason === 'invalid');
});

test('a CLI that prints "Not logged in" with exit 0 is a login problem, not a bad answer', async () => {
  const r = await testAgent('claude', { ask: async () => 'Not logged in · Please run /login' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'login');
});

test('setup needs a tested agent, real facts and a source', () => {
  const home = newHome();
  const profile = loadProfile(home);
  assert.deepEqual(setupState(profile, { agent: 'codex' }), { agent: false, profile: false, sources: false, ready: false }, 'template placeholders do not count');
  updateProfile(home, { summary: 'Pharmacy student.', facts: ['6-month QC internship: HPLC'], languages: ['English (C1)'], keywords: ['formulation internship'] });
  const next = loadProfile(home);
  assert.equal(setupState(next, { agent: 'codex', verified: '2026-10-30' }).ready, true);
  assert.equal(next.sources.boards[0].provider, 'euraxess');
  assert.ok(readdirSync(home).some((f) => f.startsWith('profile.backup-')), 'the old profile is kept');
});

test('updateProfile leaves existing sources alone', () => {
  const home = newHome();
  const file = join(home, 'profile.json');
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  raw.sources.boards = [{ name: 'Mine', provider: 'jooble', keywords: ['x'] }];
  writeFileSync(file, JSON.stringify(raw));
  updateProfile(home, { summary: 'S', facts: ['F'], languages: [], keywords: ['y'] });
  assert.equal(loadProfile(home).sources.boards[0].name, 'Mine');
});

test('saveEnv replaces one line and keeps the others', () => {
  const home = newHome();
  writeFileSync(join(home, '.env'), 'OTHER=1\nAP_TEST_KEY=old\n');
  saveEnv(home, 'AP_TEST_KEY', 'new');
  assert.equal(readFileSync(join(home, '.env'), 'utf8'), 'OTHER=1\nAP_TEST_KEY=new\n');
  assert.equal(process.env.AP_TEST_KEY, 'new');
  delete process.env.AP_TEST_KEY;
});

test('runToday queues results and leaves the tracker untouched until the user decides', async () => {
  const home = newHome();
  const row = dueRow(home);
  const profile = loadProfile(home);
  const calls = [];
  const res = await runToday({ home, profile, agent: 'claude', steps: ['evaluate', 'followups'], ask: fakeAgent(profile, calls), fetch: async () => ({ text: JD }), log: () => {}, today });
  assert.deepEqual([res.evaluated, res.drafted, res.errors.length], [2, 1, 0]);
  assert.equal(new Tracker(join(home, 'data', 'applications.md')).rows().length, 1, 'nothing added yet');
  assert.equal(pendingPipeline(join(home, 'data', 'pipeline.md')).length, 2, 'postings stay open until decided');
  const queue = new ReviewQueue(reviewFile(home));
  const ev = queue.pending().find((i) => i.payload.url === 'https://jobs.example.com/1');
  assert.equal(ev.payload.company, 'Acme', 'company comes from the scan, not from the model');
  assert.equal(ev.payload.score100, 100);

  const again = await runToday({ home, profile, agent: 'claude', steps: ['evaluate', 'followups'], ask: fakeAgent(profile, calls), fetch: async () => ({ text: JD }), log: () => {}, today });
  assert.deepEqual([again.evaluated, again.drafted], [0, 0], 'a second run does not repeat work or spend tokens');
  assert.equal(calls.length, 3);
  assert.equal(queue.pending().filter((i) => i.type === 'followup')[0].payload.num, row.num);
});

test('approving an evaluation adds a row and closes the posting; rejecting only closes it', async () => {
  const home = newHome();
  const profile = loadProfile(home);
  await runToday({ home, profile, agent: 'claude', steps: ['evaluate'], ask: fakeAgent(profile), fetch: async () => ({ text: JD }), log: () => {}, today });
  const queue = new ReviewQueue(reviewFile(home));
  const [first, second] = queue.pending();
  const ctx = { queue, home, profile, trackerFile: join(home, 'data', 'applications.md'), today };
  const res = applyDecision({ ...ctx, id: first.id, action: 'approve' });
  assert.equal(res.num, 1);
  const row = new Tracker(ctx.trackerFile).get(1);
  assert.equal(row.status, 'Evaluated');
  assert.equal(row.score, '100/100');
  applyDecision({ ...ctx, id: second.id, action: 'reject' });
  assert.equal(new Tracker(ctx.trackerFile).rows().length, 1);
  assert.equal(pendingPipeline(join(home, 'data', 'pipeline.md')).length, 0);
  assert.throws(() => applyDecision({ ...ctx, id: first.id, action: 'approve' }), /already approved/);
  assert.equal(new ReviewQueue(reviewFile(home)).pending().length, 0, 'decisions survive a reload');
});

test('a follow-up is only logged after the user says it was sent, with their edits', async () => {
  const home = newHome();
  const row = dueRow(home);
  const profile = loadProfile(home);
  await runToday({ home, profile, agent: 'claude', steps: ['followups'], ask: fakeAgent(profile), log: () => {}, today });
  const queue = new ReviewQueue(reviewFile(home));
  const [item] = queue.pending();
  const trackerFile = join(home, 'data', 'applications.md');
  assert.doesNotMatch(new Tracker(trackerFile).get(row.num).notes, /follow-up/i);
  applyDecision({ queue, id: item.id, action: 'sent', edits: { subject: 'Edited subject' }, home, profile, trackerFile, today });
  const after = new Tracker(trackerFile).get(row.num);
  assert.equal(after.status, 'Applied');
  assert.match(after.notes, /2026-10-30: follow-up sent to pat@example\.com: Edited subject/);
});

test('a recipient the notes do not contain is dropped', () => {
  const v = validateFollowup({ writing: { forbiddenClaims: [] } }, { num: 1, company: 'A', role: 'R', notes: '2026-10-01: sent to pat@example.com' });
  const body = 'I applied on 1 October and I am still interested in this internship.';
  assert.equal(v({ to: 'PAT@example.com', subject: 'S', body }).to, 'PAT@example.com');
  assert.equal(v({ to: 'attacker@evil.test', subject: 'S', body }).to, '');
});

test('a forbidden claim is rejected in the draft and again after editing', async () => {
  const home = newHome();
  const row = dueRow(home);
  const profile = loadProfile(home);
  profile.writing.forbiddenClaims = ['flow cytometry'];
  const v = validateFollowup(profile, row);
  assert.throws(() => v({ subject: 'S', body: 'I have strong experience with flow cytometry and I am still interested in this role.' }), /forbidden claim/);
  await runToday({ home, profile, agent: 'claude', steps: ['followups'], ask: fakeAgent(profile), log: () => {}, today });
  const queue = new ReviewQueue(reviewFile(home));
  const trackerFile = join(home, 'data', 'applications.md');
  assert.throws(() => applyDecision({ queue, id: queue.pending()[0].id, action: 'sent', edits: { body: 'I used flow cytometry daily.' }, home, profile, trackerFile, today }), /forbidden claim/);
  assert.equal(queue.pending().length, 1, 'still waiting');
});

test('a login problem stops the run at once and keeps the postings pending', async () => {
  const home = newHome();
  const profile = loadProfile(home);
  let calls = 0;
  const ask = async () => { calls += 1; throw Object.assign(new Error('Not logged in'), { reason: 'login' }); };
  const res = await runToday({ home, profile, agent: 'claude', steps: ['evaluate', 'followups'], ask, fetch: async () => ({ text: JD }), log: () => {}, today });
  assert.equal(res.stopped, 'login');
  assert.equal(calls, 1);
  assert.equal(pendingPipeline(join(home, 'data', 'pipeline.md')).length, 2);
  assert.equal(existsSync(reviewFile(home)), false);
});

test('a posting that cannot be read goes to the user once and uses no AI call', async () => {
  const home = newHome();
  const profile = loadProfile(home);
  const calls = [];
  const fetch = async (url) => { if (url.endsWith('/2')) throw new Error('could not fetch a job description'); return { text: JD }; };
  const run = () => runToday({ home, profile, agent: 'claude', steps: ['evaluate'], ask: fakeAgent(profile, calls), fetch, log: () => {}, today });
  const res = await run();
  assert.deepEqual([res.evaluated, res.unread, res.errors.length, res.stopped], [1, 1, 0, null]);
  assert.equal(calls.length, 1);
  assert.equal((await run()).unread, 0, 'it is not retried on the next run');
  const queue = new ReviewQueue(reviewFile(home));
  const item = queue.pending().find((i) => i.type === 'unread');
  applyDecision({ queue, id: item.id, action: 'reject', home, profile, trackerFile: join(home, 'data', 'applications.md'), today });
  assert.equal(pendingPipeline(join(home, 'data', 'pipeline.md')).length, 1);
});

test('a network failure stops the run instead of filing every posting as unreadable', async () => {
  const home = newHome();
  const profile = loadProfile(home);
  const res = await runToday({ home, profile, agent: 'claude', steps: ['evaluate'], ask: fakeAgent(profile), fetch: async () => { throw new Error('fetch failed'); }, log: () => {}, today });
  assert.equal(res.stopped, 'network');
  assert.equal(res.unread, 0);
  assert.equal(existsSync(reviewFile(home)), false);
});

test('a posting tracked since the scan is closed without an AI call', async () => {
  const home = newHome();
  const t = new Tracker(join(home, 'data', 'applications.md'));
  t.add({ company: 'Acme', role: 'Formulation intern', url: 'https://jobs.example.com/1' });
  t.save();
  const profile = loadProfile(home);
  const calls = [];
  await runToday({ home, profile, agent: 'claude', steps: ['evaluate'], ask: fakeAgent(profile, calls), fetch: async () => ({ text: JD }), log: () => {}, today });
  assert.equal(calls.length, 1);
  assert.deepEqual(pendingPipeline(join(home, 'data', 'pipeline.md')).map((i) => i.company), ['Beta']);
});

test('closePipeline ticks one exact posting', () => {
  const home = newHome();
  const file = join(home, 'data', 'pipeline.md');
  assert.equal(closePipeline(file, 'https://jobs.example.com/1'), true);
  assert.equal(closePipeline(file, 'https://jobs.example.com/1'), false);
  assert.match(readFileSync(file, 'utf8'), /- \[x\] https:\/\/jobs\.example\.com\/1 /);
  assert.equal(pendingPipeline(file).length, 1);
});

test('the profile draft needs facts', () => {
  assert.throws(() => validateProfileDraft({ summary: 'x', facts: [] }), /no facts/);
  assert.equal(validateProfileDraft({ summary: 'x', facts: ['a'], languages: 'nope' }).languages.length, 0);
});
