// Fill a .docx template by replacing whole paragraphs, keeping every other ZIP
// part (photo, styles, numbering, headers) byte-identical to the template.
//
// Paragraphs are counted in document order like XPath //w:p, nested ones
// included. The first <w:t> of a target paragraph receives the new text and the
// other <w:t> nodes are emptied, so the first run's formatting is kept. An array
// value clones the paragraph once per item; "\n" becomes a soft line break.
import JSZip from 'jszip';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const encode = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const T_RE = /<w:t(\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:t(\s[^>]*)?\/>/g;

function paragraphSpans(xml) {
  const re = /<w:p[\s>/]|<\/w:p>/g;
  const stack = [], spans = [];
  let m;
  while ((m = re.exec(xml))) {
    if (m[0] === '</w:p>') { stack.pop().end = m.index + 6; continue; }
    const close = xml.indexOf('>', m.index);
    const selfClosing = xml[close - 1] === '/';
    const span = { start: m.index, end: selfClosing ? close + 1 : -1 };
    spans.push(span);
    if (!selfClosing) stack.push(span);
  }
  return spans;
}

export function listParagraphs(xml) {
  return paragraphSpans(xml).map((p) => {
    let text = '';
    for (const m of xml.slice(p.start, p.end).matchAll(T_RE)) text += decode(m[2] || '');
    return text;
  });
}

function replaceParagraphs(xml, changes) {
  const spans = paragraphSpans(xml);
  const targets = Object.keys(changes).map(Number).sort((a, b) => spans[b].start - spans[a].start);
  let out = xml;
  for (const idx of targets) {
    const sp = spans[idx];
    if (!sp) throw new Error(`paragraph ${idx} does not exist`);
    const seg = out.slice(sp.start, sp.end);
    const values = Array.isArray(changes[idx]) ? changes[idx] : [changes[idx]];
    const pieces = values.map((value) => {
      let first = true, count = 0;
      const next = seg.replace(T_RE, (all, attrs, inner, attrs2) => {
        count += 1;
        if (!first) return `<w:t${attrs || attrs2 || ''}></w:t>`;
        first = false;
        return String(value).split('\n').map((part) => `<w:t xml:space="preserve">${encode(part)}</w:t>`).join('<w:br/>');
      });
      if (!count) throw new Error(`paragraph ${idx} has no text node`);
      return next;
    });
    // cloned paragraphs must not repeat w14:paraId / w14:textId
    const joined = pieces.map((p, k) => (k ? p.replace(/\sw14:(paraId|textId)="[0-9A-Fa-f]+"/g, '') : p)).join('');
    out = out.slice(0, sp.start) + joined + out.slice(sp.end);
  }
  return out;
}

export async function readParagraphs(file) {
  const zip = await JSZip.loadAsync(readFileSync(file));
  return listParagraphs(await zip.file('word/document.xml').async('string'));
}

/** Build target from template; verifies untouched parts and returns the template sha256. */
export async function buildDocx(templatePath, targetPath, changes) {
  const original = readFileSync(templatePath);
  const zin = await JSZip.loadAsync(original);
  const xml = await zin.file('word/document.xml').async('string');
  const zout = new JSZip();
  for (const name of Object.keys(zin.files)) {
    const f = zin.files[name];
    if (f.dir) { zout.folder(name); continue; }
    const data = name === 'word/document.xml' ? replaceParagraphs(xml, changes) : await f.async('uint8array');
    zout.file(name, data, { date: f.date, compression: 'DEFLATE' });
  }
  writeFileSync(targetPath, await zout.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));

  const built = await JSZip.loadAsync(readFileSync(targetPath));
  for (const name of Object.keys(zin.files)) {
    if (zin.files[name].dir || name === 'word/document.xml') continue;
    const a = Buffer.from(await zin.file(name).async('uint8array'));
    const b = Buffer.from(await built.file(name).async('uint8array'));
    if (!a.equals(b)) throw new Error(`part changed: ${name}`);
  }
  const paras = listParagraphs(await built.file('word/document.xml').async('string'));
  for (const v of Object.values(changes)) for (const item of [].concat(v)) {
    if (!paras.includes(String(item).replace(/\n/g, ''))) throw new Error(`text not applied: ${String(item).slice(0, 40)}`);
  }
  return createHash('sha256').update(original).digest('hex');
}
