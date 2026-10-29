// Builds the Windows installer: dist/Apply-Pilot-VERSION-x64-CULTURE.msi.
//
//   node scripts/build-msi.mjs [--wix DIR] [--cultures en-US,zh-CN] [--node PATH] [--stage-only]
//
// Needs WiX Toolset 3.14 (candle.exe, light.exe): --wix DIR, the WIX
// environment variable that the WiX installer sets, or PATH. The MSI bundles
// the Node.js runtime this script runs on (or --node), the package files and
// the production dependencies (jszip, exceljs). Playwright is left out: it
// needs a separate browser download.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WIN = join(ROOT, 'installer', 'windows');
const DIST = join(ROOT, 'dist');
const STAGE = join(DIST, 'msi', 'stage');
const OBJ = join(DIST, 'msi', 'obj');
const NS = 'b8e5486f-9aaa-45f7-845e-75bc8477d7fa';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const cultures = opt('cultures', 'en-US,zh-CN').split(',');
const nodeExe = opt('node', process.execPath);

function findWix() {
  const dirs = [opt('wix'), process.env.WIX && join(process.env.WIX, 'bin'), process.env.WIX, ...String(process.env.PATH).split(';')].filter(Boolean);
  const dir = dirs.find((d) => existsSync(join(d, 'candle.exe')) && existsSync(join(d, 'light.exe')));
  if (!dir) throw new Error('WiX Toolset 3.14 not found: pass --wix DIR (the folder with candle.exe and light.exe) or set WIX');
  return dir;
}

function uuid5(name) {
  const ns = Buffer.from(NS.replace(/-/g, ''), 'hex');
  const h = createHash('sha1').update(Buffer.concat([ns, Buffer.from(name, 'utf8')])).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
const id = (prefix, rel) => prefix + createHash('sha1').update(rel).digest('hex').slice(0, 24);
const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const crlf = (src, dest) => writeFileSync(dest, readFileSync(src, 'utf8').replace(/\r?\n/g, '\r\n'));

// RTF for the licence page; non-ASCII characters become \uN? escapes.
function rtf(text) {
  const body = [...text].map((c) => {
    const n = c.codePointAt(0);
    if (c === '\\' || c === '{' || c === '}') return `\\${c}`;
    if (c === '\n') return '\\par\n';
    if (n < 128) return c;
    if (n > 0xffff) return '?';
    return `\\u${n > 32767 ? n - 65536 : n}?`;
  }).join('');
  return `{\\rtf1\\ansi\\ansicpg1252\\deff0{\\fonttbl{\\f0\\fswiss Segoe UI;}{\\f1\\fnil\\fcharset134 Microsoft YaHei;}}\\viewkind4\\uc1\\pard\\f0\\fs18 ${body}\\par}`;
}

// Drop what Node never loads at run time: browser bundles, type declarations,
// source maps and readmes. Folders are kept: some packages keep code in
// folders called doc/ or test/. Licence files stay.
function prune(dir) {
  rmSync(join(dir, 'exceljs', 'dist'), { recursive: true, force: true });
  rmSync(join(dir, '@types'), { recursive: true, force: true });
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) {
        if (/^(__tests__|\.github)$/i.test(name)) rmSync(full, { recursive: true, force: true });
        else walk(full);
      } else if (/\.(map|d\.ts|d\.mts|d\.cts|ts|tsbuildinfo)$|^(readme|changelog|history)(\.\w+)?$/i.test(name)) {
        rmSync(full, { force: true });
      }
    }
  };
  walk(dir);
}

function stage() {
  rmSync(join(DIST, 'msi'), { recursive: true, force: true });
  const app = join(STAGE, 'app');
  mkdirSync(app, { recursive: true });
  for (const entry of [...pkg.files, 'package.json', 'README.md', 'LICENSE']) {
    const src = join(ROOT, entry);
    if (existsSync(src)) cpSync(src, join(app, entry), { recursive: true });
  }
  // Production dependencies, without playwright.
  const out = execFileSync('npm', ['ls', '--omit=dev', '--all', '--parseable'], { cwd: ROOT, encoding: 'utf8', shell: true });
  const mods = out.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && resolve(l) !== ROOT)
    .filter((l) => !/node_modules[\\/]playwright(-core)?($|[\\/])/.test(l));
  for (const m of mods) cpSync(m, join(app, relative(ROOT, m)), { recursive: true });
  prune(join(app, 'node_modules'));

  copyFileSync(nodeExe, join(STAGE, 'node.exe'));
  crlf(join(WIN, 'launcher.vbs'), join(STAGE, 'launcher.vbs'));
  crlf(join(WIN, 'apply-pilot.cmd'), join(STAGE, 'apply-pilot.cmd'));
  copyFileSync(join(ROOT, 'assets', 'apply-pilot.ico'), join(STAGE, 'apply-pilot.ico'));
  writeFileSync(join(STAGE, 'NODE-LICENSE.txt'), [
    `This installer includes Node.js ${process.version} (https://nodejs.org).`,
    '',
    'Node.js is licensed under the MIT License: Copyright Node.js contributors. All rights reserved.',
    'The full license, including the licenses of the components bundled in Node.js, is at',
    'https://github.com/nodejs/node/blob/main/LICENSE',
    '',
  ].join('\r\n'));

  const privacy = [
    'PRIVACY / 隐私',
    'Apply-Pilot runs on your computer. It has no server, no account and no telemetry. Your data stays in your data folder (Documents\\Apply-Pilot by default). It is only sent to the job sites, search services and AI model providers you choose to use, when you run a scan or an evaluation. Uninstalling keeps your data folder. Full policy: PRIVACY.md in the install folder, or https://github.com/YingQiu0871/Apply-Pilot/blob/main/PRIVACY.md',
    'Apply-Pilot 在你的电脑上运行，没有服务器、没有账号，也没有任何遥测。数据保存在你的数据目录（默认是 文档\\Apply-Pilot），只有在你运行扫描或评估时，才会发送给你选择使用的招聘网站、搜索服务和 AI 模型服务商。卸载时保留数据目录。完整策略见安装目录中的 PRIVACY.md。',
    '',
    'BUNDLED SOFTWARE / 附带软件',
    `Node.js ${process.version}, MIT License (NODE-LICENSE.txt). JSZip (MIT), ExcelJS (MIT) and their dependencies: licenses in app\\node_modules.`,
    '',
  ].join('\n');
  writeFileSync(join(STAGE, 'license.rtf'), rtf(`${readFileSync(join(ROOT, 'LICENSE'), 'utf8').trim()}\n\n${privacy}`));
}

// One component per file, GUIDs derived from the path so upgrades keep them.
function filesWxs() {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<Wix xmlns="http://schemas.microsoft.com/wix/2006/wi">', '  <Fragment>'];
  const comps = [];
  const walk = (dir, dirId, depth) => {
    const pad = '  '.repeat(depth);
    const entries = readdirSync(dir).filter((n) => n !== 'license.rtf').sort();
    let first = true;
    for (const name of entries) {
      const full = join(dir, name);
      const rel = relative(STAGE, full).split(sep).join('/');
      if (statSync(full).isDirectory()) continue;
      const cid = id('c', rel);
      comps.push(cid);
      lines.push(`${pad}<Component Id="${cid}" Guid="${uuid5(rel)}" Win64="yes">`);
      lines.push(`${pad}  <File Id="${id('f', rel)}" Source="${xml(full)}" KeyPath="yes" />`);
      if (first && dirId !== 'INSTALLDIR') lines.push(`${pad}  <RemoveFolder Id="${id('r', rel)}" On="uninstall" />`);
      lines.push(`${pad}</Component>`);
      first = false;
    }
    for (const name of entries) {
      const full = join(dir, name);
      if (!statSync(full).isDirectory()) continue;
      const rel = relative(STAGE, full).split(sep).join('/');
      const did = id('d', rel);
      lines.push(`${pad}<Directory Id="${did}" Name="${xml(name)}">`);
      walk(full, did, depth + 1);
      lines.push(`${pad}</Directory>`);
    }
  };
  lines.push('    <DirectoryRef Id="INSTALLDIR">');
  walk(STAGE, 'INSTALLDIR', 3);
  lines.push('    </DirectoryRef>', '    <ComponentGroup Id="AppFiles">');
  for (const c of comps) lines.push(`      <ComponentRef Id="${c}" />`);
  lines.push('    </ComponentGroup>', '  </Fragment>', '</Wix>', '');
  writeFileSync(join(OBJ, 'Files.wxs'), lines.join('\n'));
  return comps.length;
}

const stageOnly = args.includes('--stage-only');
const wix = stageOnly ? null : findWix();
stage();
mkdirSync(OBJ, { recursive: true });
const count = filesWxs();
if (stageOnly) { console.log(`staged ${count} files in ${relative(ROOT, STAGE)}`); process.exit(0); }
const version = pkg.version;
const defs = [`-dVersion=${version}`, `-dAssets=${join(ROOT, 'assets')}`, `-dStage=${STAGE}`, `-dInstaller=${WIN}`];
execFileSync(join(wix, 'candle.exe'), ['-nologo', '-arch', 'x64', '-ext', 'WixUIExtension', ...defs, '-out', OBJ + sep, join(WIN, 'Product.wxs'), join(OBJ, 'Files.wxs')], { stdio: 'inherit' });
for (const culture of cultures) {
  const out = join(DIST, `Apply-Pilot-${version}-x64-${culture}.msi`);
  execFileSync(join(wix, 'light.exe'), [
    '-nologo', '-ext', 'WixUIExtension', `-cultures:${culture}`, '-loc', join(WIN, `${culture}.wxl`),
    // Per-user files use file key paths; these ICEs expect HKCU key paths instead.
    '-sice:ICE38', '-sice:ICE64', '-sice:ICE91',
    '-spdb', '-out', out, join(OBJ, 'Product.wixobj'), join(OBJ, 'Files.wixobj'),
  ], { stdio: 'inherit' });
  console.log(`built ${relative(ROOT, out)} (${(statSync(out).size / 1048576).toFixed(1)} MB, ${count} files)`);
}
