// Optional bridge to career-ops (https://github.com/career-ops-hq/career-ops, MIT).
// apply-pilot reads and writes the same data/applications.md table, so the two
// can share one data directory. If career-ops is installed, `apply-pilot careerops
// <script> [args]` runs one of its scripts against your APPLY_PILOT_HOME.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

export function findCareerOps() {
  const candidates = [process.env.CAREER_OPS_HOME, '../career-ops', './career-ops'].filter(Boolean).map((p) => resolve(p));
  return candidates.find((p) => existsSync(join(p, 'package.json')) && existsSync(join(p, 'tracker.mjs'))) || null;
}

export function runCareerOps(script, args, home) {
  const root = findCareerOps();
  if (!root) throw new Error('career-ops not found: set CAREER_OPS_HOME or clone it next to apply-pilot');
  const file = join(root, script.endsWith('.mjs') ? script : `${script}.mjs`);
  if (!existsSync(file)) throw new Error(`no such career-ops script: ${file}`);
  const res = spawnSync(process.execPath, [file, ...args], { cwd: root, stdio: 'inherit', env: { ...process.env, CAREER_OPS_DATA: home } });
  return res.status ?? 1;
}
