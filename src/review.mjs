// Review queue (data/review.json). Everything the AI produces waits here, and
// only the user's decision changes the tracker or the pipeline. Nothing in this
// file sends anything: "sent" records that the user sent a follow-up themselves.
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { closePipeline } from './additions.mjs';
import { localDate } from './config.mjs';
import { lintText } from './lint.mjs';
import { Tracker, findDuplicates } from './tracker.mjs';

export const reviewFile = (home) => join(home, 'data', 'review.json');

export class ReviewQueue {
  constructor(file) {
    this.file = file;
    this.items = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
  }

  pending() { return this.items.filter((i) => i.status === 'pending'); }

  get(id) { return this.items.find((i) => i.id === id) || null; }

  /** A key is reviewed once: a rejected draft does not come back the next day. */
  has(key) { return this.items.some((i) => i.key === key); }

  add({ type, key, title, payload }) {
    const item = { id: randomBytes(4).toString('hex'), type, key, title, payload, status: 'pending', created: new Date().toISOString() };
    this.items.push(item);
    return item;
  }

  save() {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(this.items, null, 2)}\n`);
    renameSync(tmp, this.file);
  }
}

function approveEvaluation(item, { trackerFile, pipelineFile, today }) {
  const e = item.payload;
  const tracker = new Tracker(trackerFile);
  const dupe = findDuplicates(tracker.rows(), { company: e.company, role: e.role, url: e.url })[0];
  let num = dupe?.num;
  if (!dupe) {
    const row = tracker.add({ date: today, company: e.company || '?', role: e.role || '?', score: `${e.score100}/100`, status: e.decision === 'Skip' ? 'SKIP' : 'Evaluated', url: e.url, notes: `${e.decision}: ${e.summary || ''}` });
    tracker.save();
    num = row.num;
  }
  closePipeline(pipelineFile, e.url);
  return { num, duplicate: Boolean(dupe) };
}

function recordFollowup(item, edits, { trackerFile, profile, today }) {
  const draft = { ...item.payload, ...edits };
  const blocked = lintText(draft.body, profile).issues.filter((i) => i.rule === 'forbidden-claim');
  if (blocked.length) throw new Error(`forbidden claim in the draft: ${blocked[0].detail}`);
  const tracker = new Tracker(trackerFile);
  const row = tracker.get(draft.num);
  if (!row) throw new Error(`row #${draft.num} not found`);
  tracker.setStatus(row.num, row.status, `${today}: follow-up sent${draft.to ? ` to ${draft.to}` : ''}: ${draft.subject}`);
  tracker.save();
  item.payload = draft;
  return { num: row.num };
}

/** action: approve | reject for evaluations, sent | reject for follow-ups. */
export function applyDecision({ queue, id, action, edits = {}, home, profile, trackerFile, today = localDate() }) {
  const item = queue.get(id);
  if (!item) throw new Error(`no review item ${id}`);
  if (item.status !== 'pending') throw new Error(`already ${item.status}`);
  const pipelineFile = join(home, 'data', 'pipeline.md');
  let result = {};
  if (action === 'reject') {
    if (item.type !== 'followup') closePipeline(pipelineFile, item.payload.url);
  } else if (item.type === 'evaluation' && action === 'approve') {
    result = approveEvaluation(item, { trackerFile, pipelineFile, today });
  } else if (item.type === 'followup' && action === 'sent') {
    result = recordFollowup(item, edits, { trackerFile, profile, today });
  } else throw new Error(`cannot ${action} a ${item.type}`);
  item.status = action === 'reject' ? 'rejected' : action === 'sent' ? 'sent' : 'approved';
  item.decided = new Date().toISOString();
  queue.save();
  return { ok: true, status: item.status, ...result };
}
