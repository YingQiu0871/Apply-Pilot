// Dashboard and control panel over the tracker. Serves http://localhost:PORT,
// pushes a reload event (server-sent events) when the tracker file changes, and
// runs a fixed list of local tasks (scans, checks, exports) on request.
//
// The panel can only start the tasks in TASKS below and today's work. None of them
// sends email, submits a form or writes to an external site. Requests must carry
// the per-run token and come from this host, so other web pages cannot trigger them.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, watch } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homeSource, loadEnv, loadProfile, localDate, paths as pathsOf, saveEnv, saveHome } from '../config.mjs';
import { initHome, inspectHome, suggestedHome, updateProfile } from '../home.mjs';
import { channelOf, followUpStatus } from '../followups.mjs';
import { stageOf } from '../events.mjs';
import { Tracker, events, lastActivity, parseScore } from '../tracker.mjs';
import { AGENTS, detectAgents, launchInteractive, markVerified, readAgent, readAgentState, saveAgent } from '../agents.mjs';
import { profilePrompt, runToday, setupState, validateProfileDraft } from '../daily.mjs';
import { ReviewQueue, applyDecision, reviewFile } from '../review.mjs';
import { askAgent, askJson, testAgent } from '../worker.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(HERE, '..', '..', 'bin', 'apply-pilot.mjs');

// Steps of "today's work" the panel can start.
const WORK = { today: ['scan', 'evaluate', 'followups'], evaluate: ['evaluate'], drafts: ['followups'] };

const TASKS = {
  doctor: { label: 'doctor', args: () => ['doctor'] },
  all: { label: 'scan all', args: () => ['scan', 'all', '--pipeline'] },
  portals: { label: 'scan portals', args: () => ['scan', 'portals', '--pipeline'] },
  boards: { label: 'scan boards', args: () => ['scan', 'boards', '--pipeline'] },
  websearch: { label: 'scan websearch', args: () => ['scan', 'websearch', '--pipeline'] },
  linkedin: { label: 'linkedin scan', args: () => ['linkedin', 'scan', '--pipeline'] },
  followups: { label: 'followups', args: () => ['followups'] },
  export: { label: 'export xlsx', args: (p) => ['export', 'xlsx', join(p.output, `applications-${localDate()}.xlsx`)] },
};

export function openInBrowser(url) {
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  spawn(cmd[0], cmd[1], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

function openFolder(dir) {
  const cmd = process.platform === 'win32' ? 'explorer' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  spawn(cmd, [dir], { detached: true, stdio: 'ignore' }).unref();
}

export function serve({ home, port = 4321, host = '127.0.0.1', open = false }) {
  const token = randomBytes(16).toString('hex');
  // The data folder can change while the panel runs (folder picker), so these are reassigned by use().
  let profile, paths, trackerFile, setup = false, watcher = null;
  const data = () => {
    if (!existsSync(trackerFile)) return [];
    const today = localDate();
    return new Tracker(trackerFile).rows().map((r) => {
      const f = followUpStatus(r, profile.followUp, today);
      const evs = events(r, today);
      const score = parseScore(r.score);
      const channel = f?.channel || channelOf(r);
      return {
        num: r.num, date: r.date, company: r.company, role: r.role, status: r.status, notes: r.notes,
        score, url: (r.url.match(/https?:\/\/\S+/) || [])[0] || '',
        lastActivity: lastActivity(r, today), events: evs, due: Boolean(f?.due), channel,
        stage: stageOf(r, evs, { score, thresholds: profile.scoring?.thresholds, channel, today }),
      };
    });
  };

  const clients = new Set();
  const push = (event, payload) => { for (const res of clients) res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`); };
  let timer = null;
  const use = (dir) => {
    loadEnv(dir);
    profile = loadProfile(dir);
    paths = pathsOf(dir, profile);
    trackerFile = paths.tracker;
    setup = !existsSync(paths.profile) && !existsSync(trackerFile);
    watcher?.close();
    watcher = null;
    if (existsSync(dirname(trackerFile))) {
      watcher = watch(dirname(trackerFile), (_e, name) => {
        if (name && ![basename(trackerFile), 'review.json'].includes(String(name))) return;
        clearTimeout(timer);
        timer = setTimeout(() => push('changed', {}), 300);
      });
    }
  };
  use(resolve(home));
  const homeInfo = () => ({ path: paths.home, source: homeSource(), setup, suggested: inspectHome(homeSource() === 'env' ? paths.home : suggestedHome()) });
  const useHome = ({ path, create }) => {
    if (running) throw new Error(`"${running}" is still running`);
    if (!path) throw new Error('enter a folder path');
    const info = inspectHome(path);
    if (info.isFile) throw new Error(`${info.home} is a file, not a folder`);
    const created = !info.hasProfile && !info.hasTracker;
    if (created && !create) throw new Error(`no Apply-Pilot data in ${info.home}`);
    if (created) initHome(info.home);
    saveHome(info.home);
    use(info.home);
    agents = detectAgents();
    push('changed', {});
    return { ok: true, home: info.home, created, envOverride: Boolean(process.env.APPLY_PILOT_HOME) && resolve(process.env.APPLY_PILOT_HOME) !== info.home };
  };

  let running = null;
  let lastRun = null;
  let agents = detectAgents();
  const log = (text) => push('log', { text });
  const cli = (args) => new Promise((done) => {
    const child = spawn(process.execPath, [CLI, ...args], { cwd: paths.home, env: { ...process.env, APPLY_PILOT_HOME: paths.home }, windowsHide: true });
    child.on('error', (e) => log(`! ${e.message}`));
    const line = (chunk) => String(chunk).split(/\r?\n/).filter(Boolean).forEach(log);
    child.stdout.on('data', line);
    child.stderr.on('data', line);
    child.on('close', done);
  });
  const begin = (label) => { running = label; push('task', { state: 'start', task: label, at: new Date().toISOString() }); };
  const finish = (label, code) => { running = null; push('task', { state: 'end', task: label, code }); };
  const runTask = (id) => {
    if (running) return { ok: false, error: `"${running}" is still running` };
    if (WORK[id]) {
      const agent = readAgent(paths.home);
      if (!agent) return { ok: false, error: 'choose an AI agent first' };
      begin(id);
      profile = loadProfile(paths.home);
      runToday({ home: paths.home, profile, agent, steps: WORK[id], scan: () => cli(['scan', 'all', '--pipeline']), log })
        .then((res) => { lastRun = { ...res, at: new Date().toISOString() }; finish(id, res.stopped ? 1 : 0); })
        .catch((e) => { log(`! ${e.message}`); lastRun = { evaluated: 0, drafted: 0, errors: [e.message], stopped: 'other', at: new Date().toISOString() }; finish(id, 1); });
      return { ok: true };
    }
    if (!TASKS[id]) return { ok: false, error: 'unknown task' };
    const { label } = TASKS[id];
    begin(label);
    cli(TASKS[id].args(paths)).then((code) => finish(label, code));
    return { ok: true };
  };

  const queue = () => new ReviewQueue(reviewFile(paths.home));
  const decide = ({ id, action, edits }) => {
    const res = applyDecision({ queue: queue(), id, action, edits, home: paths.home, profile, trackerFile });
    push('changed', {});
    return res;
  };
  const testConnection = async ({ agent }) => {
    if (running) return { ok: false, reason: 'busy', detail: `"${running}" is still running` };
    begin('connection test');
    const res = await testAgent(agent);
    if (res.ok) markVerified(paths.home, agent);
    finish('connection test', res.ok ? 0 : 1);
    return res;
  };
  const saveKey = ({ agent, key }) => {
    const name = AGENTS[agent]?.keyEnv;
    if (!name) throw new Error('this agent has no API key');
    const value = String(key || '').trim();
    if (!/^[\x21-\x7e]{8,300}$/.test(value)) throw new Error('that does not look like an API key');
    saveEnv(paths.home, name, value);
    agents = detectAgents();
    return { ok: true };
  };
  const draftProfile = async ({ text }) => {
    const cv = String(text || '').trim();
    if (cv.length < 200) throw new Error('paste the full text of your CV');
    const agent = readAgent(paths.home);
    if (!agent) throw new Error('choose an AI agent first');
    if (running) throw new Error(`"${running}" is still running`);
    begin('read CV');
    try { return { ok: true, draft: await askJson((p) => askAgent(agent, p), profilePrompt(cv), validateProfileDraft) }; }
    finally { finish('read CV', 0); }
  };
  const saveProfile = (body) => {
    const lines = (v) => (Array.isArray(v) ? v : String(v || '').split(/\r?\n/)).map((s) => String(s).trim()).filter(Boolean);
    const facts = lines(body.facts);
    if (!String(body.summary || '').trim() || !facts.length) throw new Error('summary and facts are required');
    updateProfile(paths.home, { summary: String(body.summary).trim(), facts, languages: lines(body.languages), keywords: lines(body.keywords), cv: body.cv });
    use(paths.home);
    push('changed', {});
    return { ok: true };
  };

  const latestInbox = () => {
    if (!existsSync(paths.inbox)) return [];
    return readdirSync(paths.inbox).filter((f) => f.endsWith('.json'))
      .map((f) => ({ file: f, mtime: statSync(join(paths.inbox, f)).mtimeMs })).sort((a, b) => b.mtime - a.mtime).slice(0, 8)
      .map(({ file, mtime }) => ({ file, at: new Date(mtime).toISOString() }));
  };

  const allowed = (req) => {
    const hostHeader = String(req.headers.host || '');
    const origin = String(req.headers.origin || '');
    const local = new RegExp(`^(localhost|127\\.0\\.0\\.1):${port}$`);
    return local.test(hostHeader) && (!origin || new RegExp(`^http://(localhost|127\\.0\\.0\\.1):${port}$`).test(origin)) && req.headers['x-token'] === token;
  };

  const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };

  const server = createServer((req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname === '/api/data') {
      try { json(res, 200, { generated: new Date().toISOString(), home: homeInfo(), followUpDays: profile.followUp.afterDays, rows: data(), running, inbox: latestInbox(), tasks: Object.keys(TASKS), agents, agent: readAgent(paths.home), review: queue().pending(), lastRun, ready: setupState(profile, readAgentState(paths.home)), candidate: { summary: profile.candidate?.summary || '', facts: profile.candidate?.facts || [], languages: profile.candidate?.languages || [] } }); }
      catch (err) { res.writeHead(500).end(String(err)); }
      return;
    }
    if (pathname === '/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write('retry: 3000\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (pathname.startsWith('/api/') && req.method === 'POST') {
      if (!allowed(req)) return json(res, 403, { ok: false, error: 'forbidden' });
      const withBody = (fn, limit = 1e4) => {
        let body = '';
        req.on('data', (c) => { body += c; if (body.length > limit) req.destroy(); });
        req.on('end', async () => { try { json(res, 200, await fn(JSON.parse(body || '{}'))); } catch (e) { json(res, 400, { ok: false, error: e.message || 'bad request' }); } });
      };
      if (pathname === '/api/run') return withBody((b) => runTask(b.task));
      if (pathname === '/api/home/check') return withBody((b) => ({ ok: true, ...inspectHome(b.path || '') }));
      if (pathname === '/api/home/use') return withBody(useHome);
      if (pathname === '/api/agent/select') return withBody((b) => ({ ok: true, agent: saveAgent(paths.home, b.agent) }));
      if (pathname === '/api/agent/launch') return withBody((b) => ({ ok: launchInteractive(b.agent, { home: paths.home }) }));
      if (pathname === '/api/agent/test') return withBody(testConnection);
      if (pathname === '/api/agent/key') return withBody(saveKey);
      if (pathname === '/api/review/decide') return withBody(decide);
      if (pathname === '/api/profile/draft') return withBody(draftProfile, 2e5);
      if (pathname === '/api/profile/save') return withBody(saveProfile, 2e5);
      if (pathname === '/api/import/preview' || pathname === '/api/import/write') {
        let body = '';
        req.on('data', (c) => { body += c; if (body.length > 1e4) req.destroy(); });
        req.on('end', async () => {
          try {
            const { path } = JSON.parse(body || '{}');
            if (!path) throw new Error('enter a file or folder path');
            const { previewImport, writeImport } = await import('../importer.mjs');
            const pv = await previewImport(path, trackerFile);
            const added = pathname.endsWith('/write') ? writeImport(pv, trackerFile) : null;
            json(res, 200, { ok: true, input: pv.input, files: pv.files, sources: pv.sources, errors: pv.errors, fresh: pv.fresh.length, duplicates: pv.duplicates.length, sample: pv.fresh.slice(0, 40), added });
          } catch (e) { json(res, 200, { ok: false, error: e.message }); }
        });
        return;
      }
      if (pathname === '/api/agent/refresh') { agents = detectAgents(); return json(res, 200, { ok: true, agents }); }
      if (pathname === '/api/open-data') { mkdirSync(paths.home, { recursive: true }); openFolder(paths.home); return json(res, 200, { ok: true }); }
      if (pathname === '/api/quit') { json(res, 200, { ok: true }); setTimeout(() => process.exit(0), 200); return; }
      return json(res, 404, { ok: false });
    }
    if (pathname === '/' || pathname === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(readFileSync(join(HERE, 'index.html'), 'utf8').replace('__TOKEN__', token));
      return;
    }
    if (pathname === '/icon.svg') {
      res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'max-age=86400' });
      res.end(readFileSync(join(HERE, '..', '..', 'assets', 'icon.svg')));
      return;
    }
    res.writeHead(404).end();
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`port ${port} is already in use: Apply-Pilot is probably running, opening it`);
      if (open) openInBrowser(`http://localhost:${port}`);
      setTimeout(() => process.exit(0), 500);
    } else throw err;
  });
  server.listen(port, host, () => {
    console.log(`apply-pilot panel: http://localhost:${port}  (tracker: ${trackerFile})`);
    if (open) openInBrowser(`http://localhost:${port}`);
  });
  return server;
}
