// Renders assets/icon.svg to PNGs with a headless browser (optional playwright
// dependency; uses the installed Edge, or ICON_BROWSER=chrome) and packs them
// into assets/apply-pilot.ico. Sizes of 32 px and below drop the flight path,
// which only adds noise that small.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets', 'png');
const SIZES = [16, 24, 32, 48, 64, 128, 256, 512];
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

const { chromium } = await import('playwright');
const svg = readFileSync(join(ROOT, 'assets', 'icon.svg'), 'utf8');
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: process.env.ICON_BROWSER || 'msedge' }).catch(() => chromium.launch());
const page = await browser.newPage();
const pngs = {};
for (const size of SIZES) {
  let s = svg.replace(/width="1024" height="1024"/, `width="${size}" height="${size}"`);
  if (size <= 32) s = s.replace(/<!-- flight path -->\s*<path[^>]*\/>/, '');
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${s}</body></html>`);
  pngs[size] = await page.locator('svg').screenshot({ path: join(OUT, `icon-${size}.png`), omitBackground: true });
}
await browser.close();

// ICO with PNG-compressed entries (supported since Windows Vista).
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(ICO_SIZES.length, 4);
const dir = Buffer.alloc(16 * ICO_SIZES.length);
let offset = 6 + dir.length;
ICO_SIZES.forEach((size, i) => {
  const e = i * 16;
  dir.writeUInt8(size >= 256 ? 0 : size, e);
  dir.writeUInt8(size >= 256 ? 0 : size, e + 1);
  dir.writeUInt16LE(1, e + 4);
  dir.writeUInt16LE(32, e + 6);
  dir.writeUInt32LE(pngs[size].length, e + 8);
  dir.writeUInt32LE(offset, e + 12);
  offset += pngs[size].length;
});
writeFileSync(join(ROOT, 'assets', 'apply-pilot.ico'), Buffer.concat([header, dir, ...ICO_SIZES.map((s) => pngs[s])]));
console.log(`wrote ${SIZES.length} PNGs and assets/apply-pilot.ico`);
