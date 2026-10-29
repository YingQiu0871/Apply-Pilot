// Read-only dashboard over the tracker. Serves http://localhost:PORT and pushes
// a reload event (server-sent events) whenever the tracker file changes.
import { createServer } from 'node:http';
import { readFileSync, watch } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localDate } from '../config.mjs';
import { followUpStatus } from '../followups.mjs';
import { Tracker, events, lastActivity, parseScore } from '../tracker.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

export function serve({ trackerFile, profile, port = 4321, host = '127.0.0.1' }) {
  const data = () => {
    const today = localDate();
    return new Tracker(trackerFile).rows().map((r) => {
      const f = followUpStatus(r, profile.followUp, today);
      return {
        num: r.num, date: r.date, company: r.company, role: r.role, status: r.status, notes: r.notes,
        score: parseScore(r.score), url: (r.url.match(/https?:\/\/\S+/) || [])[0] || '',
        lastActivity: lastActivity(r, today), events: events(r, today), due: Boolean(f?.due), channel: f?.channel || null,
      };
    });
  };

  const clients = new Set();
  let timer = null;
  watch(dirname(trackerFile), (_e, name) => {
    if (name && String(name) !== basename(trackerFile)) return;
    clearTimeout(timer);
    timer = setTimeout(() => { for (const res of clients) res.write('data: changed\n\n'); }, 300);
  });

  const server = createServer((req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname === '/api/data') {
      try {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ generated: new Date().toISOString(), followUpDays: profile.followUp.afterDays, rows: data() }));
      } catch (err) { res.writeHead(500).end(String(err)); }
      return;
    }
    if (pathname === '/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write('retry: 3000\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (pathname === '/' || pathname === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(readFileSync(join(HERE, 'index.html')));
      return;
    }
    res.writeHead(404).end();
  });
  server.listen(port, host, () => console.log(`apply-pilot dashboard: http://localhost:${port}  (tracker: ${trackerFile})`));
  return server;
}
