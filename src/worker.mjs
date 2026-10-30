// Runs the paired AI as a worker: one prompt in, one answer out. The worker gets
// no tools. It starts in an empty temporary folder, Claude Code runs with its
// tools switched off and Codex in its read-only sandbox, and DeepSeek is a plain
// API call. Apply-Pilot itself does all reading, fetching and writing, so text in
// a job posting cannot make the worker change a file or send anything.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AGENTS, which } from './agents.mjs';
import { callModel, parseModelJson } from './evaluate.mjs';

const TIMEOUT = 180000;

const FAILURES = [
  ['login', /not logged in|please run \/login|\blogin\b|unauthori[sz]ed|authentication|invalid[ _-]?(api[ _-]?)?key|incorrect api key|\b401\b/i],
  ['quota', /quota|rate[ _-]?limit|usage limit|insufficient|balance|billing|\b402\b|\b429\b/i],
  ['network', /enotfound|econn|etimedout|eai_again|fetch failed|network|getaddrinfo/i],
];

/** Sort a failure message into login, quota, network or other. */
export function classifyFailure(text) {
  return FAILURES.find(([, re]) => re.test(text))?.[0] || 'other';
}

function failure(reason, detail) {
  return Object.assign(new Error(String(detail).trim().slice(0, 400)), { reason });
}

/** Fixed command lines. The prompt always goes through stdin, never through arguments. */
export function workerCommand(agent, outFile) {
  if (agent === 'claude') return ['-p', '--tools', '', '--strict-mcp-config', '--no-session-persistence', '--setting-sources', 'user', '--output-format', 'text'];
  if (agent === 'codex') return ['exec', '--skip-git-repo-check', '--sandbox', 'read-only', '--ephemeral', '-o', outFile, '-'];
  throw new Error(`${agent} does not run as a command-line worker`);
}

function kill(child) {
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  else child.kill('SIGTERM');
}

function runCli(agent, text, timeoutMs) {
  const bin = which(AGENTS[agent].bin);
  if (!bin) return Promise.reject(failure('missing', `${AGENTS[agent].label} is not installed`));
  const dir = mkdtempSync(join(tmpdir(), 'apply-pilot-worker-'));
  const outFile = join(dir, 'answer.txt');
  const args = workerCommand(agent, outFile);
  // Windows starts .cmd launchers only through a shell. The arguments are fixed strings.
  const shell = /\.(cmd|bat)$/i.test(bin);
  const quoted = (v) => (v === '' ? '""' : /\s/.test(v) ? `"${v}"` : v);
  const child = shell ? spawn(quoted(bin), args.map(quoted), { cwd: dir, shell: true, windowsHide: true }) : spawn(bin, args, { cwd: dir, windowsHide: true });
  return new Promise((resolve, reject) => {
    let out = '', err = '', late = false;
    const done = (fn, v) => { clearTimeout(timer); rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); fn(v); };
    const timer = setTimeout(() => { late = true; kill(child); }, timeoutMs);
    child.stdout.on('data', (c) => { out += c; });
    child.stderr.on('data', (c) => { err += c; });
    child.stdin.on('error', () => {});
    child.on('error', (e) => done(reject, failure('missing', e.message)));
    child.on('close', (code) => {
      if (late) return done(reject, failure('timeout', `no answer after ${Math.round(timeoutMs / 1000)} s`));
      if (code !== 0) { const detail = err.trim() || out.trim() || `exit code ${code}`; return done(reject, failure(classifyFailure(detail), detail)); }
      let answer = out;
      if (agent === 'codex') { try { answer = readFileSync(outFile, 'utf8'); } catch { /* fall back to stdout */ } }
      done(resolve, answer);
    });
    child.stdin.end(text);
  });
}

/** Send one prompt ({ system, user }) to the chosen agent and return its text answer. */
export async function askAgent(agent, prompt, { timeoutMs = TIMEOUT } = {}) {
  if (!AGENTS[agent]) throw failure('missing', `unknown agent "${agent}"`);
  if (AGENTS[agent].keyEnv) {
    try {
      return await callModel({ provider: agent, prompt });
    } catch (e) { throw failure(/^set [A-Z_]+ to use/.test(e.message) ? 'login' : classifyFailure(e.message), e.message); }
  }
  return runCli(agent, `${prompt.system}\n\n${prompt.user}`, timeoutMs);
}

/**
 * Ask for JSON and check it. A bad answer is sent back once with the reason.
 * `validate` returns the value to keep or throws. Connection problems are not retried.
 */
export async function askJson(ask, prompt, validate) {
  let extra = '', last = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const reply = await ask({ ...prompt, user: prompt.user + extra });
    try {
      return validate(parseModelJson(reply));
    } catch (e) {
      last = e;
      // A CLI can print "Not logged in" with exit code 0; that is not a bad answer to retry.
      const reason = classifyFailure(reply);
      if (reply.length < 300 && !reply.includes('{') && reason !== 'other') throw failure(reason, reply);
      extra = `\n\nYour previous answer was rejected: ${e.message}. Answer again with corrected JSON only.`;
    }
  }
  throw failure('invalid', `the answer failed its check: ${last.message}`);
}

/** One short request. Returns { ok, ms } or { ok: false, reason, detail }. */
export async function testAgent(agent, { ask = (p) => askAgent(agent, p, { timeoutMs: 120000 }) } = {}) {
  const t0 = Date.now();
  try {
    await askJson(ask, { system: 'You answer with JSON only.', user: 'Reply with exactly this JSON and nothing else: {"ok":true}' }, (v) => {
      if (v.ok !== true) throw new Error('expected {"ok":true}');
      return v;
    });
    return { ok: true, ms: Date.now() - t0 };
  } catch (e) { return { ok: false, reason: e.reason || 'other', detail: e.message }; }
}
