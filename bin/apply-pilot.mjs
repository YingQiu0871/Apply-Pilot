#!/usr/bin/env node
// apply-pilot command line. Run `apply-pilot help` for the command list.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homeDir, loadProfile, paths } from '../src/config.mjs';
import { Tracker, findDuplicates, lastActivity } from '../src/tracker.mjs';
import { buildPrompt, evaluateText, finishEvaluation, parseModelJson } from '../src/evaluate.mjs';
import { dueFollowUps } from '../src/followups.mjs';
import { lintText } from '../src/lint.mjs';
import { buildDocx, readParagraphs } from '../src/docx.mjs';
import { triage } from '../src/triage.mjs';
import { findCareerOps, runCareerOps } from '../src/careerops.mjs';

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const pos = [], opt = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      opt[k] = v !== undefined ? v : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true);
    } else pos.push(a);
  }
  return { pos, opt };
}

const HELP = `apply-pilot — local job/internship application pipeline

Data lives in APPLY_PILOT_HOME (default ./apply-data): profile.json, data/applications.md, inbox/, output/.

  init [--example NAME]                 create the data directory (examples: ${['generic', 'pharma-m2-europe'].join(', ')})
  doctor                                check setup (node, profile, tracker, optional tools, API keys)
  ui [--port 4321] [--open]             dashboard + control panel (scans, checks, export) in your browser
  shortcut [--dir DIR]                  put a double-click launcher for the panel on your desktop
  list [--status S] [--q TEXT]          print tracker rows
  add --company C --role R [--url U] [--score N] [--status S] [--notes N] [--force]
  status NUM STATUS [--note TEXT]       change status and append a dated note
  note NUM TEXT                         append a dated note without changing status
  followups [--json]                    applications due a follow-up (rules: profile.followUp)
  eval prompt JD.txt                    print the scoring prompt for your agent to answer
  eval score ANSWER.json [--jd JD.txt]  weighted score from the agent's JSON answer
  eval run JD.txt [--provider deepseek|openai|openrouter|ollama|anthropic] [--model M] [--add]
  jd URL [--out FILE] [--browser] [--json]   fetch a job description (ATS APIs, page text, optional browser)
  keywords REPORT.md [--cv cv.md] [--json]   which "## Keywords extracted" items your CV covers
  lint FILE...                          plain-writing check for letters and emails
  docx list FILE.docx                   show paragraph indices of a template
  docx build TEMPLATE OUT CHANGES.json  fill paragraphs, keep everything else identical
  scan portals [--only NAME] [--pipeline [FILE]]  company career sites: Workday, SuccessFactors, Phenom, Eightfold, SmartRecruiters, Personio
  linkedin login | linkedin scan [--jobs|--posts] [--pipeline]
  triage SCAN.json [--json OUT] [--pipeline [FILE]]   new candidates, minus tracked and filtered; optionally append to data/pipeline.md
  merge-additions [DIR] [--dry-run]     merge batch TSV tracker additions (default DIR: batch/tracker-additions)
  export xlsx OUT.xlsx                  tracker to a fresh spreadsheet
  careerops SCRIPT [ARGS]               run a career-ops script on the same data (optional)

Nothing here sends email or submits forms. Agents must get your approval first (see AGENTS.md).`;

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { pos, opt } = parseArgs(rest);
  const home = homeDir();
  const profile = loadProfile(home);
  const p = paths(home, profile);
  const tracker = () => new Tracker(p.tracker);

  switch (cmd) {
    case 'init': {
      const name = opt.example || 'generic';
      const src = name === 'generic' ? join(PKG, 'config', 'profile.example.json') : join(PKG, 'examples', name, 'profile.json');
      if (!existsSync(src)) throw new Error(`no example "${name}"`);
      mkdirSync(join(home, 'data'), { recursive: true });
      if (existsSync(p.profile)) console.log(`kept existing ${p.profile}`);
      else { copyFileSync(src, p.profile); console.log(`wrote ${p.profile}`); }
      if (!existsSync(p.tracker)) { tracker().save(); console.log(`wrote ${p.tracker}`); }
      writeFileSync(join(home, '.gitignore'), 'browser/\ninbox/\noutput/\n*.xlsx\n.env\n', { flag: 'a' });
      console.log('Next: edit profile.json, then `apply-pilot ui`.');
      break;
    }
    case 'doctor': {
      const ok = (b, msg) => console.log(`${b ? '✓' : '✗'} ${msg}`);
      ok(Number(process.versions.node.split('.')[0]) >= 20, `node ${process.versions.node} (need >= 20)`);
      ok(existsSync(p.profile), `profile ${p.profile}`);
      ok(existsSync(p.tracker), `tracker ${p.tracker} (${existsSync(p.tracker) ? tracker().rows().length + ' rows' : 'missing'})`);
      ok(profile.scoring.dimensions.length > 0, `${profile.scoring.dimensions.length} scoring dimensions`);
      for (const mod of ['playwright', 'exceljs']) {
        let has = true; try { await import(mod); } catch { has = false; }
        ok(has, `${mod} ${has ? 'installed' : 'not installed (optional)'}`);
      }
      if (findCareerOps()) ok(true, `career-ops ${findCareerOps()} (optional companion)`);
      for (const k of ['DEEPSEEK_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY']) if (process.env[k]) ok(true, `${k} set`);
      break;
    }
    case 'ui': {
      const { serve } = await import('../src/ui/server.mjs');
      serve({ trackerFile: p.tracker, profile, paths: p, port: Number(opt.port || process.env.PORT || 4321), open: Boolean(opt.open) });
      break;
    }
    case 'shortcut': {
      const { createShortcut } = await import('../src/shortcut.mjs');
      console.log(`created ${createShortcut({ home, cli: join(PKG, 'bin', 'apply-pilot.mjs'), port: Number(opt.port || 4321), dir: opt.dir })}`);
      console.log('Double-click it to start the panel and open it in your browser. Use the panel\'s Quit button to stop it.');
      break;
    }
    case 'list': {
      const q = String(opt.q || '').toLowerCase();
      for (const r of tracker().rows()) {
        if (opt.status && r.status.toLowerCase() !== String(opt.status).toLowerCase()) continue;
        if (q && !`${r.company} ${r.role} ${r.notes}`.toLowerCase().includes(q)) continue;
        console.log(`#${r.num}\t${r.status}\t${lastActivity(r)}\t${r.company} | ${r.role}`.slice(0, 160));
      }
      break;
    }
    case 'add': {
      if (!opt.company || !opt.role) throw new Error('add needs --company and --role');
      const t = tracker();
      const dupes = findDuplicates(t.rows(), { company: opt.company, role: opt.role, url: opt.url });
      if (dupes.length && !opt.force) {
        console.log(`possible duplicate of ${dupes.map((d) => `#${d.num} (${d.status})`).join(', ')}; re-run with --force to add anyway`);
        process.exitCode = 2; break;
      }
      const row = t.add({ company: opt.company, role: opt.role, url: opt.url, score: opt.score, status: opt.status, notes: opt.notes || '' });
      t.save();
      console.log(`added #${row.num} ${row.status} ${row.company} | ${row.role}`);
      break;
    }
    case 'status':
    case 'note': {
      const t = tracker();
      const num = Number(pos[0]);
      const status = cmd === 'note' ? t.get(num)?.status : pos[1];
      const text = cmd === 'note' ? pos.slice(1).join(' ') : opt.note;
      const { before, after, row } = t.setStatus(num, status, text);
      t.save();
      console.log(`#${row.num} ${row.company}: ${before} → ${after}${text ? ` (+ note)` : ''}`);
      break;
    }
    case 'followups': {
      const due = dueFollowUps(tracker().rows(), profile.followUp);
      if (opt.json) { console.log(JSON.stringify(due.map(({ row, f }) => ({ ...f, company: row.company, role: row.role })), null, 2)); break; }
      if (!due.length) { console.log('nothing due'); break; }
      for (const { row, f } of due) console.log(`#${row.num}\t${f.silentDays}d quiet\t${f.channel}\t${row.company} | ${row.role}`.slice(0, 160));
      break;
    }
    case 'eval': {
      const [sub, file] = pos;
      if (sub === 'prompt') { const pr = buildPrompt(profile, readFileSync(file, 'utf8')); console.log(`${pr.system}\n\n${pr.user}`); break; }
      if (sub === 'score') {
        const answer = parseModelJson(readFileSync(file, 'utf8'));
        console.log(JSON.stringify(finishEvaluation(profile, answer, opt.jd ? readFileSync(opt.jd, 'utf8') : ''), null, 2));
        break;
      }
      if (sub === 'run') {
        const jd = readFileSync(file, 'utf8');
        const res = await evaluateText(profile, jd, { provider: opt.provider || 'deepseek', model: opt.model, baseUrl: opt['base-url'] });
        console.log(JSON.stringify(res, null, 2));
        if (opt.add) {
          const t = tracker();
          const status = res.decision === 'Skip' ? 'SKIP' : 'Evaluated';
          const row = t.add({ company: res.company || '?', role: res.role || '?', score: `${res.score100}/100`, status, url: opt.url, notes: `${res.decision}; ${res.summary || ''}` });
          t.save();
          console.log(`added #${row.num}`);
        }
        break;
      }
      throw new Error('eval prompt|score|run');
    }
    case 'lint': {
      let bad = 0;
      for (const f of pos) {
        const { issues, stats } = lintText(readFileSync(f, 'utf8'), profile);
        console.log(`${f}: ${issues.length} issue(s), ${stats.words} words, ${stats.sentences} sentences, mean ${stats.meanWords}`);
        for (const i of issues) console.log(`  - ${i.rule}: ${i.detail}`);
        bad += issues.length;
      }
      process.exitCode = bad ? 1 : 0;
      break;
    }
    case 'docx': {
      const [sub, a, b, c] = pos;
      if (sub === 'list') { (await readParagraphs(a)).forEach((t, i) => console.log(i, t.slice(0, 110))); break; }
      if (sub === 'build') { console.log('template sha256', await buildDocx(a, b, JSON.parse(readFileSync(c, 'utf8')))); break; }
      throw new Error('docx list|build');
    }
    case 'linkedin': {
      const li = await import('../src/scan/linkedin.mjs');
      if (pos[0] === 'login') { await li.login(profile, home); break; }
      if (pos[0] === 'scan') {
        const res = await li.scan(profile, home, { only: opt.jobs ? 'jobs' : opt.posts ? 'posts' : undefined });
        if (res.requiresLogin) { console.log('LOGIN_REQUIRED: run `apply-pilot linkedin login` and sign in yourself'); process.exitCode = 2; break; }
        console.log(`saved ${li.saveScan(res, p.inbox)}`);
        if (opt.pipeline) {
          const { appendPipeline } = await import('../src/additions.mjs');
          const t = triage(res, tracker().rows(), profile);
          console.log(`triage: ${t.fresh.length} new, ${t.tracked.length} already tracked; ${appendPipeline(join(home, 'data', 'pipeline.md'), t.fresh)} appended to data/pipeline.md`);
        }
        break;
      }
      throw new Error('linkedin login|scan');
    }
    case 'scan': {
      if (pos[0] !== 'portals') throw new Error('scan portals [--only NAME]');
      const { scanPortals, savePortalScan } = await import('../src/scan/portals.mjs');
      const res = await scanPortals(profile, { only: opt.only });
      const file = savePortalScan(res, p.inbox);
      console.log(`\n${res.jobs.length} kept, ${Object.entries(res.skipped).map(([k, v]) => `${v} ${k}`).join(', ') || 'none filtered'}, ${res.errors.length} errors`);
      if (res.websearch.length) console.log(`${res.websearch.length} sources need a web search by your agent (listed under "websearch" in the file)`);
      console.log(`saved ${file}`);
      if (opt.pipeline) {
        const { appendPipeline } = await import('../src/additions.mjs');
        const t = triage(res, tracker().rows(), profile);
        const target = opt.pipeline === true ? join(home, 'data', 'pipeline.md') : resolve(opt.pipeline);
        console.log(`triage: ${t.fresh.length} new, ${t.tracked.length} already tracked, ${t.filtered.length} filtered; ${appendPipeline(target, t.fresh)} appended to ${target}`);
      } else console.log(`next: apply-pilot triage ${file}`);
      break;
    }
    case 'jd': {
      const { fetchJd } = await import('../src/jd.mjs');
      const r = await fetchJd(pos[0], { browser: Boolean(opt.browser) });
      if (opt.out) { writeFileSync(opt.out, `${r.url}\n\n${r.text}\n`); console.log(`${r.source}: ${r.text.length} chars → ${opt.out}`); }
      else console.log(opt.json ? JSON.stringify(r, null, 2) : r.text);
      break;
    }
    case 'keywords': {
      const { extractKeywords, coverage, coverageMarkdown, htmlToText } = await import('../src/keywords.mjs');
      const cvFile = opt.cv || join(home, 'cv.md');
      const cv = readFileSync(cvFile, 'utf8');
      const cov = coverage(extractKeywords(readFileSync(pos[0], 'utf8')), /\.html?$/i.test(cvFile) ? htmlToText(cv) : cv);
      console.log(opt.json ? JSON.stringify(cov, null, 2) : coverageMarkdown(cov, opt.cv ? cvFile : 'cv.md (base CV, before per-role tailoring)'));
      break;
    }
    case 'merge-additions': {
      // Tab-separated tracker additions (header row: # Date Company Role Score Status PDF Report Notes ... url),
      // the batch format career-ops evaluations produce. Existing postings get a re-evaluation note instead.
      const { mergeAdditions } = await import('../src/additions.mjs');
      const res = mergeAdditions(tracker(), pos[0] || join(home, 'batch', 'tracker-additions'), { dryRun: Boolean(opt['dry-run']) });
      console.log(`${res.added.length} added, ${res.updated.length} updated, ${res.files} file(s)${opt['dry-run'] ? ' (dry run)' : ''}`);
      break;
    }
    case 'triage': {
      const res = triage(JSON.parse(readFileSync(pos[0], 'utf8')), tracker().rows(), profile);
      console.log(`${res.fresh.length} new, ${res.tracked.length} already tracked, ${res.filtered.length} filtered out`);
      for (const c of res.fresh) console.log(`- [${c.kind}] ${c.role} | ${c.company} ${c.url || c.people?.[0] || ''}`.slice(0, 200));
      if (opt.json) writeFileSync(opt.json, JSON.stringify(res, null, 2));
      if (opt.pipeline) {
        const { appendPipeline } = await import('../src/additions.mjs');
        const file = opt.pipeline === true ? join(home, 'data', 'pipeline.md') : resolve(opt.pipeline);
        console.log(`${appendPipeline(file, res.fresh)} appended to ${file}`);
      }
      break;
    }
    case 'export': {
      const { exportXlsx } = await import('../src/excel.mjs');
      console.log(`wrote ${await exportXlsx(tracker().rows(), resolve(pos[1] || 'applications.xlsx'))}`);
      break;
    }
    case 'careerops':
      process.exitCode = runCareerOps(pos[0], process.argv.slice(4), home);
      break;
    case undefined:
    case 'help':
    case '--help':
      console.log(HELP);
      break;
    default:
      throw new Error(`unknown command "${cmd}" (try: apply-pilot help)`);
  }
}

main().catch((e) => { console.error(`error: ${e.message}`); process.exitCode = 1; });
