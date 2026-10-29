// Which applications are due a follow-up. Rules come from profile.followUp:
//   afterDays          days of silence before a follow-up is due (default 14)
//   maxFollowUps       follow-ups already sent before we stop suggesting (default 1)
//   skipAppliedBefore  ignore applications older than this date ("too early to bother")
// Applications through job portals usually have no person to write to, so they
// are reported separately as "portal".
import { localDate } from './config.mjs';
import { events, lastActivity } from './tracker.mjs';

const PORTAL_RE = /workday|icims|successfactors|teamtailor|workable|smartrecruiters|greenhouse|lever\.co|taleo|eightfold|phenom|personio|career site|careers?[ -]?(portal|site|page)|jobs\.[a-z0-9-]+\.(com|fr|de)|myworkdayjobs|easy apply|candidature en ligne|官网|网申|\babg\b/i;
// "applied with my university address" is not an email application, so look
// for a recipient: an address after sent/to/à/发送至, or an explicit email send.
const EMAIL_RE = /(sent|emailed|envoy[ée]|发送至|发至|to|à)\s*[^;]{0,40}@[a-z0-9.-]+\.[a-z]{2,}|\bemailed\b|e-?mail (sent|application)|邮件投递|发送(给|至)/i;

const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

/** How the application went out: a person to write to ("email") or a portal. */
export function channelOf(row) {
  const notes = String(row.notes || '');
  if (PORTAL_RE.test(`${notes} ${row.url || ''}`)) return EMAIL_RE.test(notes) && !/workday|icims|successfactors|myworkdayjobs/i.test(notes) ? 'email' : 'portal';
  return EMAIL_RE.test(notes) ? 'email' : 'unknown';
}

export function followUpStatus(row, rules, today = localDate()) {
  if (!['Applied', 'Responded'].includes(row.status)) return null;
  const last = lastActivity(row, today);
  const silent = daysBetween(last, today);
  const sent = events(row, today).filter((e) => e.kind === 'followup').length;
  const tooOld = rules.skipAppliedBefore && row.date < rules.skipAppliedBefore;
  const due = !tooOld && silent >= rules.afterDays && sent < rules.maxFollowUps;
  return { num: row.num, due, silentDays: silent, lastActivity: last, followUpsSent: sent, channel: channelOf(row), tooOld: Boolean(tooOld) };
}

export function dueFollowUps(rows, rules, today = localDate()) {
  return rows
    .map((r) => ({ row: r, f: followUpStatus(r, rules, today) }))
    .filter(({ f }) => f && f.due)
    .sort((a, b) => b.f.silentDays - a.f.silentDays);
}
