// Which AI agent the user pairs with apply-pilot: Claude Code, Codex CLI or
// DeepSeek. The choice is stored in APPLY_PILOT_HOME/agent.json.
//
// Every delegated task writes files under output/ and nothing else. The task
// prompt repeats the AGENTS.md ground rules, and Claude Code additionally runs
// with a narrow tool allow-list. DeepSeek has no local agent loop, so its
// tasks call the API through apply-pilot itself.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { localDate } from './config.mjs';

export const AGENTS = {
  claude: { label: 'Claude Code', bin: 'claude', site: 'https://claude.com/claude-code' },
  codex: { label: 'Codex CLI', bin: 'codex', site: 'https://github.com/openai/codex' },
  deepseek: { label: 'DeepSeek', bin: 'opencode', keyEnv: 'DEEPSEEK_API_KEY', site: 'https://platform.deepseek.com' },
};

function which(bin) {
  try {
    const out = execFileSync(process.platform === 'win32' ? 'where.exe' : 'which', [bin], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split(/\r?\n/).find(Boolean) || null;
  } catch { return null; }
}

export function detectAgents() {
  return Object.fromEntries(Object.entries(AGENTS).map(([id, a]) => {
    const path = which(a.bin);
    const key = a.keyEnv ? Boolean(process.env[a.keyEnv]) : null;
    return [id, { id, label: a.label, site: a.site, cli: path, apiKey: key, ready: id === 'deepseek' ? key || Boolean(path) : Boolean(path) }];
  }));
}

const agentFile = (home) => join(home, 'agent.json');
export function readAgent(home) {
  try { return JSON.parse(readFileSync(agentFile(home), 'utf8')).agent || null; } catch { return null; }
}
export function saveAgent(home, agent) {
  if (!AGENTS[agent]) throw new Error(`unknown agent "${agent}"`);
  mkdirSync(home, { recursive: true });
  writeFileSync(agentFile(home), `${JSON.stringify({ agent, updated: new Date().toISOString() }, null, 2)}\n`);
  return agent;
}

const RULES = `Ground rules (from apply-pilot AGENTS.md, mandatory):
- Do not send email, submit applications, post messages or fill in forms. Only write files.
- Only write inside the output/ folder of this data directory. Do not edit profile.json, cv.md or data/applications.md.
- Use only facts from profile.json "candidate.facts" and cv.md. Items in "writing.forbiddenClaims" may appear only as honest gaps.
- Write plainly: no stock phrases, no "this taught me" morals, short sentences. Run \`apply-pilot lint FILE\` on every draft and fix what it flags.
- The user is the sole author of anything you produce; add no AI attribution.`;

export const AGENT_TASKS = {
  'agent-evaluate': {
    label: 'evaluate new postings',
    prompt: (o) => `You are working in an apply-pilot data directory (APPLY_PILOT_HOME). ${RULES}

Task: evaluate the pending postings in data/pipeline.md (lines starting with "- [ ]"), at most 10, newest first.
For each: run \`node "${o.cli}" jd URL --out output/jd-NN.txt\` to fetch the description, then \`node "${o.cli}" eval prompt output/jd-NN.txt\` and answer that prompt yourself as strict JSON into output/eval-NN.json, then \`node "${o.cli}" eval score output/eval-NN.json --jd output/jd-NN.txt\`.
Finally write output/agent-evaluation-${o.date}.md: one table (company, role, score/100, decision, main gap, URL), then two plain sentences per posting. Do not add rows to the tracker.`,
  },
  'agent-followups': {
    label: 'draft follow-ups',
    prompt: (o) => `You are working in an apply-pilot data directory (APPLY_PILOT_HOME). ${RULES}

Task: run \`node "${o.cli}" followups --json\`. For every item whose channel is "email", read its tracker row with \`node "${o.cli}" list --q "#NUM"\` or by reading data/applications.md, and draft a short follow-up (3-4 sentences: when you applied, still interested, available from the target start date, is the position still open). Skip portal applications.
Write all drafts to output/followup-drafts-${o.date}.md with, for each: tracker #, recipient as recorded in the notes, the subject to reply to, and the body. Do not send anything.`,
  },
};

/** Command line for a delegated task with the chosen agent, or null if it cannot run it. */
export function taskCommand(agent, taskId, { home, cli }) {
  const task = AGENT_TASKS[taskId];
  if (!task) throw new Error(`unknown agent task "${taskId}"`);
  const date = localDate();
  const prompt = task.prompt({ cli, date });
  mkdirSync(join(home, 'output'), { recursive: true });
  const promptFile = join(home, 'output', `.agent-task-${taskId}-${date}.md`);
  writeFileSync(promptFile, prompt);
  const short = `Read the task in ${promptFile} and do exactly what it says.`;
  if (agent === 'claude') {
    return { cmd: 'claude', args: ['-p', short, '--allowedTools', 'Read,Write,Edit,Glob,Grep,Bash(node:*)', '--permission-mode', 'acceptEdits'], shell: true };
  }
  if (agent === 'codex') {
    return { cmd: 'codex', args: ['exec', '--skip-git-repo-check', '--sandbox', 'workspace-write', short], shell: true };
  }
  if (agent === 'deepseek') {
    if (taskId === 'agent-evaluate') return { cmd: process.execPath, args: [cli, 'eval', 'pipeline', '--provider', 'deepseek', '--limit', '10'], shell: false };
    if (which('opencode')) return { cmd: 'opencode', args: ['run', short], shell: true };
    return null;
  }
  return null;
}

/** Open an interactive session with the agent in a new terminal window, inside the data directory. */
export function launchInteractive(agent, { home }) {
  const bin = agent === 'deepseek' ? 'opencode' : AGENTS[agent]?.bin;
  if (!bin) throw new Error(`unknown agent "${agent}"`);
  const dir = resolve(home);
  if (process.platform === 'win32') {
    spawn('cmd.exe', ['/c', 'start', `"apply-pilot · ${AGENTS[agent].label}"`, '/D', `"${dir}"`, 'cmd', '/k', `set APPLY_PILOT_HOME=${dir}&& ${bin}`], { detached: true, stdio: 'ignore', windowsVerbatimArguments: true }).unref();
  } else if (process.platform === 'darwin') {
    const script = `tell application "Terminal" to do script "cd ${dir.replace(/"/g, '\\"')} && export APPLY_PILOT_HOME=${dir.replace(/"/g, '\\"')} && ${bin}"`;
    spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('x-terminal-emulator', ['-e', `sh -c 'cd "${dir}" && APPLY_PILOT_HOME="${dir}" ${bin}; exec sh'`], { detached: true, stdio: 'ignore' }).unref();
  }
  return true;
}

export const agentReady = (home) => existsSync(agentFile(home));
