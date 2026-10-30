// What a dated note means. Two levels: `kind` is the broad group the dashboard
// colours and filters by, `type` the finer label. `stageOf` then works out where
// a whole application stands, inside its tracker status. Nothing here is stored:
// it is all derived from the notes, so the tracker stays career-ops compatible.

// Fine event type -> broad kind. Order is the display order.
export const EVENT_TYPES = {
  applied: 'sent', outreach: 'sent', materials: 'sent', response: 'sent',
  followup: 'followup',
  ack: 'ack', autoreply: 'ack',
  positive: 'reply', request: 'reply', pending: 'reply', reply: 'reply',
  invite: 'interview', held: 'interview',
  offer: 'offer',
  filled: 'rejected', afterinterview: 'rejected', rejected: 'rejected',
  prep: 'note', evaluation: 'note', audit: 'note', note: 'note',
};

// Phrases that mention an action without it having happened.
const NEGATED = /\b(?:not|never)\s+(?:yet\s+)?(?:applied|submitted|sent|replied)\b|\bno\s+(?:further\s+|new\s+)?(?:recruiter\s+)?(?:follow-?ups?|repl(?:y|ies)|responses?|rejection\s+emails?|corrections?)\b|\balready\s+applied\b|未投递|未提交|未发送|尚未(?:投递|提交|发送)/gi;

// Checked in order on one piece of text; the first match wins.
const REJECTED = /\breject|not retained|non retenue|not selected|not progressed|\bregret|already filled|(?:position|place|post[ei]|poste)s?\b.{0,40}\b(?:filled|closed|pourvu)|has been filled|cannot host|full capacity|unable to offer|(?:another|other) (?:candidate|student)|higher-ranked|priority to candidates|not .{0,20}moving forward|\babsage\b|未被保留|未获保留|未进入下一轮|招满|拒|未录用/i;
const FILLED = /filled|\bclosed\b|cannot host|full capacity|pourvu|招满/i;
const RULES = [
  ['offer', /\boffer (?:received|accepted|extended)\b|\boffered (?:me )?(?:the|a) (?:internship|position|place)\b|录用通知|已录用|被录用|收到 ?offer/i],
  ['autoreply', /auto-?reply|automatic reply|自动回复/i],
  ['ack', /acknowledge?ment (?:of receipt|email)|confirmation of application|accus[ée] de r[ée]ception|merci pour votre candidature|application received|收件确认|确认邮件/i],
  ['pending', /\bwill (?:read|review|contact|get back|let (?:me|you) know|come back)\b|会在.{0,30}联系|稍后回复/i],
  ['held', /\binterview (?:held|done|completed)|\b(?:held|had|attended|passed) .{0,20}interview|已面试|面试(?:结束|完成)/i],
  ['invite', /\binterview|entretien|vorstellungsgespr|面试|\bvisio\b/i],
  ['followup', /^follow-?up|\bfollow-?up (?:sent|email|scheduled|reply)|relancer|\bcheck-in\b|跟进邮件|跟进/i],
  ['request', /^(?!(?:the )?user\b).*\b(?:asked for|requested|requests)\b|要求(?:补充|提供)/i],
  ['positive', /^(?!(?:the )?user\b).*(?:\binterested\b|caught .{0,12}interest|int[ée]ress[ée]|感兴趣|有意向)/i],
  ['response', /^reply sent\b|^replied to\b/i],
  ['reply', /\b(?:replied|replies|responded)\b|^reply:|回信|回复了|收到.{0,40}回复/i],
  ['materials', /\breferences? sent\b|\bsent .{0,20}\b(?:references?|transcripts?)\b|补交/i],
  ['outreach', /cold email|spontaneous|question email|\benquiry\b|\binquiry\b|主动(?:申请|联系)/i],
  ['applied', /\bsubmit|\bapplied\b|\bsent\b|\bscheduled\b|\bemailed\b|candidature .{0,30}(?:transmise|prise en compte)|投递|提交|发送|已发/i],
];
const WEAK_RULES = [
  ['prep', /\bmaterials?\b|\b(?:re)?draft(?:s|ed)?\b|\bprepared\b|\bbuilt\b|\bapproved\b|\btailored\b|草稿|准备|定制/i],
  ['evaluation', /\bscore|\brubric\b|re-?eval|\bJD\b|\bsearch\b|\bscan\b|\btriage\b|\bgates?\b|\bresearched\b|still online|搜索|筛查|新增|评估/i],
];

const firstMatch = (rules, text) => rules.find(([, re]) => re.test(text))?.[0];

/** Fine type of a note fragment. The opening clause decides first, because later ones are often asides. */
export function eventType(text) {
  const raw = String(text || '').trim();
  if (/^(?:audit|correction)\b/i.test(raw)) return 'audit';
  const clean = raw.replace(NEGATED, ' ').replace(/\[[^\]]*\]/g, ' ').trim();
  if (REJECTED.test(clean)) return /\binterview|面试/i.test(clean) ? 'afterinterview' : FILLED.test(clean) ? 'filled' : 'rejected';
  const opening = clean.split(/[;；。]|\.\s/)[0];
  return firstMatch(RULES, opening) || firstMatch(RULES, clean) || firstMatch(WEAK_RULES, clean) || 'note';
}

/** Broad kind of a note fragment. */
export const eventKind = (text) => EVENT_TYPES[eventType(text)];

/** The date a send was scheduled for, when the note says so and does not report it sent. */
export function scheduledFor(text) {
  if (/\bsent\b(?! to\b)/i.test(String(text).replace(NEGATED, ' '))) return null;
  const m = String(text).match(/\b(?:scheduled|planned)\b[^;]*?\bfor (20\d\d-\d\d-\d\d(?: \d\d:\d\d)?)/i);
  return m ? m[1] : null;
}

// Stages are sub-states of the tracker status. Order is the display order.
export const STAGES = {
  Evaluated: ['ready', 'recommended', 'consider', 'weak', 'unscored'],
  Applied: ['queued', 'followedup', 'acknowledged', 'byemail', 'outreached', 'byportal', 'channelunknown'],
  Responded: ['meeting', 'positive', 'request', 'pending', 'answered'],
  Interview: ['interviewupcoming', 'interviewdone'],
  Rejected: ['afterinterview', 'filled', 'closed'],
};

const lastOf = (evs, types) => evs.filter((e) => types.includes(e.type)).at(-1);

/** Where an application stands within its status; null for statuses with no stages. */
export function stageOf(row, evs, { score = null, thresholds = {}, channel = null, today = '' } = {}) {
  const has = (...types) => evs.some((e) => types.includes(e.type));
  switch (row.status) {
    case 'Evaluated':
      if (has('prep')) return 'ready';
      if (score === null) return 'unscored';
      if (/^\s*skip\b/i.test(row.notes)) return 'weak';
      return score >= (thresholds.apply ?? 80) ? 'recommended' : score >= (thresholds.consider ?? 65) ? 'consider' : 'weak';
    case 'Applied':
      if (evs.some((e) => e.sendAt && e.sendAt.slice(0, 10) > today)) return 'queued';
      if (has('followup')) return 'followedup';
      if (has('ack')) return 'acknowledged';
      if (has('outreach')) return 'outreached';
      return channel === 'email' ? 'byemail' : channel === 'portal' ? 'byportal' : 'channelunknown';
    case 'Responded': {
      if (has('invite', 'held')) return 'meeting';
      const type = lastOf(evs, ['positive', 'request', 'pending', 'reply'])?.type;
      return type === 'reply' || !type ? 'answered' : type;
    }
    case 'Interview':
      return lastOf(evs, ['invite', 'held'])?.type === 'held' ? 'interviewdone' : 'interviewupcoming';
    case 'Rejected':
      if (has('held', 'invite', 'afterinterview')) return 'afterinterview';
      return has('filled') ? 'filled' : 'closed';
    default:
      return null;
  }
}
