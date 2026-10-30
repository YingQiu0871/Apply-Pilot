// Runs the paired AI as a worker: one prompt in, one answer out. The worker gets
// no tools. It starts in an empty temporary folder, Claude Code runs with its
// tools switched off, Codex in its read-only sandbox, DeepSeek Harness with every
// tool plugin disabled, and DeepSeek is a plain API call. Apply-Pilot itself does all reading, fetching and writing, so text in
// a job posting cannot make the worker change a file or send anything.
import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AGENTS, which } from './agents.mjs';
import { callModel, parseModelJson } from './evaluate.mjs';

const TIMEOUT = 180000;
// Windows limits one command line to 32767 characters.
const DSH_MAX_PROMPT = 28000;

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

/** Fixed command lines. The prompt goes through stdin; only dsh, which cannot read it there, is different (see dshArgs). */
export function workerCommand(agent, outFile) {
  if (agent === 'claude') return ['-p', '--tools', '', '--strict-mcp-config', '--no-session-persistence', '--setting-sources', 'user', '--output-format', 'text'];
  if (agent === 'codex') return ['exec', '--skip-git-repo-check', '--sandbox', 'read-only', '--ephemeral', '-o', outFile, '-'];
  throw new Error(`${agent} does not run as a command-line worker`);
}

/**
 * Patch for one dsh run: every tool plugin in its composed profile is disabled,
 * also ones added by a later dsh version. Sessions go to the temporary folder.
 */
export function dshPatch(config, sessions) {
  const tools = [...new Set([...config.matchAll(/^- id: (tool-[\w-]+)\s*$/gm)].map((m) => m[1]))];
  if (!tools.length) throw failure('other', 'could not read the tool list of dsh');
  const lines = tools.map((id) => `- id: ${id}\n  disabled: true`);
  return `${lines.join('\n')}\n- id: session-title-llm\n  disabled: true\n- id: session-projection-cache\n  disabled: true\n- id: session-persistence-jsonl\n  config:\n    root: '${sessions.replace(/'/g, "''")}'\n`;
}

/** dsh 0.1.5 takes the task only as an argument, so it is one argument and no shell is involved. */
export function dshArgs(patchFile, text) {
  if (text.length > DSH_MAX_PROMPT) throw failure('other', `the request is too long for dsh (${text.length} characters)`);
  return ['--profile', 'headless', '--patch', patchFile, text];
}

/** How to start dsh without cmd.exe: the Windows launcher names its node and script. */
export function dshStart(bin) {
  if (!/\.cmd$/i.test(bin)) return { file: bin, pre: [], env: {} };
  const shim = readFileSync(bin, 'utf8');
  const get = (name) => shim.match(new RegExp(`set "${name}=([^"]+)"`))?.[1];
  const [bundled, script, home] = [get('NODE_BIN'), get('DSH_BIN'), get('DSH_HOME')];
  // The launcher falls back to the Node on PATH, and the bundled one may not exist.
  const node = bundled && existsSync(bundled) ? bundled : which('node');
  if (!node || !script || !existsSync(script)) throw failure('missing', 'cannot start dsh directly; open DeepSeek Harness once, then try again');
  return { file: node, pre: [script], env: home ? { DSH_HOME: home } : {} };
}

const dshConfigs = new Map();
function dshConfig({ file, pre }, cwd, env) {
  const key = [file, ...pre].join(' ');
  if (!dshConfigs.has(key)) {
    dshConfigs.set(key, new Promise((resolve, reject) => {
      execFile(file, [...pre, '--profile', 'headless', '--dump-config'], { cwd, env, windowsHide: true, timeout: 60000, maxBuffer: 1 << 24 }, (e, out, err) => {
        if (e) { dshConfigs.delete(key); reject(failure(classifyFailure(err || e.message), err || e.message)); } else resolve(out);
      });
    }));
  }
  return dshConfigs.get(key);
}

function kill(child) {
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  else child.kill('SIGTERM');
}

async function prepareDsh(bin, dir, text) {
  const start = dshStart(bin);
  const env = { ...process.env, ...start.env, DSH_PERMISSION_MODE: 'read-only', DSH_TELEMETRY_DISABLED: '1' };
  const patchFile = join(dir, 'no-tools.yml');
  writeFileSync(patchFile, dshPatch(await dshConfig(start, dir, env), join(dir, 'sessions')));
  return { file: start.file, args: [...start.pre, ...dshArgs(patchFile, text)], env, input: '' };
}

async function runCli(agent, text, timeoutMs) {
  const bin = which(AGENTS[agent].bin);
  if (!bin) throw failure('missing', `${AGENTS[agent].label} is not installed`);
  const dir = mkdtempSync(join(tmpdir(), 'apply-pilot-worker-'));
  const outFile = join(dir, 'answer.txt');
  let run;
  try {
    run = agent === 'dsh' ? await prepareDsh(bin, dir, text) : { file: bin, args: workerCommand(agent, outFile), env: process.env, input: text };
  } catch (e) { rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); throw e; }
  const { file, args, env, input } = run;
  // Windows starts .cmd launchers only through a shell. The arguments are fixed strings.
  const shell = /\.(cmd|bat)$/i.test(file);
  const quoted = (v) => (v === '' ? '""' : /\s/.test(v) ? `"${v}"` : v);
  const child = shell ? spawn(quoted(file), args.map(quoted), { cwd: dir, env, shell: true, windowsHide: true }) : spawn(file, args, { cwd: dir, env, windowsHide: true });
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
      // dsh streams its reasoning to stderr, so the error is at the end. A Node
      // module error names the module near the start and a stack after it.
      if (code !== 0) {
        const raw = err.trim() || out.trim() || `exit code ${code}`;
        const cause = raw.match(/^.*Cannot find .*$/m)?.[0].trim();
        const detail = `${cause ? `${cause}\n` : ''}${raw.slice(cause ? -200 : -400)}`;
        return done(reject, failure(classifyFailure(detail), detail));
      }
      let answer = out;
      if (agent === 'codex') { try { answer = readFileSync(outFile, 'utf8'); } catch { /* fall back to stdout */ } }
      done(resolve, answer);
    });
    child.stdin.end(input);
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
