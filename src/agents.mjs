// Which AI agent the user pairs with apply-pilot: Claude Code, Codex CLI,
// DeepSeek or DeepSeek Harness. The choice is stored in APPLY_PILOT_HOME/agent.json. Background work
// goes through src/worker.mjs; this file only knows what is installed and chosen.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const AGENTS = {
  claude: { label: 'Claude Code', bin: 'claude', site: 'https://claude.com/claude-code' },
  codex: { label: 'Codex CLI', bin: 'codex', site: 'https://github.com/openai/codex' },
  // Background work calls the API; opencode is only the optional terminal session.
  deepseek: { label: 'DeepSeek', bin: 'opencode', keyEnv: 'DEEPSEEK_API_KEY', site: 'https://platform.deepseek.com' },
  dsh: { label: 'DeepSeek Harness', bin: 'dsh', open: 'dsh web', site: 'https://deepseek-harness.github.io/deepseek-harness/' },
};

export function which(bin) {
  try {
    const out = execFileSync(process.platform === 'win32' ? 'where.exe' : 'which', [bin], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const hits = out.split(/\r?\n/).filter(Boolean);
    // where.exe also lists npm's extensionless shell script, which Windows cannot start.
    return hits.find((p) => /\.exe$/i.test(p)) || hits.find((p) => /\.cmd$/i.test(p)) || hits[0] || null;
  } catch { return null; }
}

export function detectAgents() {
  return Object.fromEntries(Object.entries(AGENTS).map(([id, a]) => {
    const path = which(a.bin);
    const key = a.keyEnv ? Boolean(process.env[a.keyEnv]) : null;
    return [id, { id, label: a.label, site: a.site, cli: path, apiKey: key, ready: a.keyEnv ? key : Boolean(path) }];
  }));
}

const agentFile = (home) => join(home, 'agent.json');
export function readAgentState(home) {
  try { return JSON.parse(readFileSync(agentFile(home), 'utf8')); } catch { return {}; }
}
export const readAgent = (home) => readAgentState(home).agent || null;
export function saveAgent(home, agent) {
  if (!AGENTS[agent]) throw new Error(`unknown agent "${agent}"`);
  mkdirSync(home, { recursive: true });
  // A passed connection test belongs to one agent; switching needs a new one.
  const old = readAgentState(home);
  const verified = old.agent === agent ? old.verified : undefined;
  writeFileSync(agentFile(home), `${JSON.stringify({ agent, verified, updated: new Date().toISOString() }, null, 2)}\n`);
  return agent;
}
export function markVerified(home, agent) {
  saveAgent(home, agent);
  const state = { ...readAgentState(home), verified: new Date().toISOString() };
  writeFileSync(agentFile(home), `${JSON.stringify(state, null, 2)}\n`);
}

/** Open an interactive session with the agent in a new terminal window, inside the data directory. */
export function launchInteractive(agent, { home }) {
  const bin = AGENTS[agent]?.open || AGENTS[agent]?.bin;
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
