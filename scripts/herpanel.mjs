#!/usr/bin/env node
// Builds the private photo panel at docs/us/ from plaintext in secret/us/.
//
//   secret/us/thumb/NNN.jpg   collage thumbnails (500px)
//   secret/us/full/NNN.jpg    full photos (1600px), loaded only when tapped
//   secret/us/manifest.json   chapter titles + each photo's date, in display order
//   secret/us/message.txt     the note; first line is the heading
//   secret/us/ps.txt          optional closing note, sealed in an envelope at the end
//   secret/us/code.txt        the passphrase she types
//
//   node scripts/herpanel.mjs build
//   node scripts/herpanel.mjs cull 007,112,143   drop those photos for good
//
// Everything is AES-GCM under one PBKDF2-SHA256 key derived from the
// passphrase. docs/us/ holds only ciphertext; secret/ is gitignored.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'secret/us');
const OUT = join(ROOT, 'docs/us');
const ITERATIONS = 600000;         // ~1s on a phone; his main panel uses 5M which is too slow here
const PACK_BYTES = 900 * 1024;     // thumbs per pack, so the first screen paints fast

const { subtle } = globalThis.crypto;
const rand = n => globalThis.crypto.getRandomValues(new Uint8Array(n));
const b64 = b => Buffer.from(b).toString('base64url');

function die(m){ console.error('error: ' + m); process.exit(1); }

// Width/height straight from the JPEG SOF marker.
function jpegSize(buf){
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xFF) { i++; continue; }
    const marker = buf[i + 1];
    if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC)
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  die('could not read JPEG dimensions');
}

async function deriveKey(code, salt){
  const base = await subtle.importKey('raw', new TextEncoder().encode(code.trim().toLowerCase()),
    'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, base, 256);
  return subtle.importKey('raw', bits, 'AES-GCM', false, ['encrypt']);
}

// iv || ciphertext, so the page needs no framing of its own
async function enc(key, bytes){
  const iv = rand(12);
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv); out.set(ct, iv.length);
  return Buffer.from(out);
}

// --- cull: drop photos permanently, then build ---
if (process.argv[2] === 'cull'){
  const ids = (process.argv[3] || '').split(',').map(x => x.trim()).filter(Boolean);
  if (!ids.length) die('usage: cull 007,112,143');
  const mPath = join(SRC, 'manifest.json');
  if (!existsSync(mPath)) die(`missing ${mPath}`);
  const m = JSON.parse(readFileSync(mPath, 'utf8'));
  const drop = new Set(ids);
  const unknown = ids.filter(id => !m.items.some(i => i.n === id));
  if (unknown.length) die(`not in the manifest: ${unknown.join(', ')}`);
  for (const id of drop)
    for (const dir of ['full', 'thumb']){
      const f = join(SRC, dir, id + '.jpg');
      if (existsSync(f)) rmSync(f);
    }
  const before = m.items.length;
  m.items = m.items.filter(i => !drop.has(i.n));
  // a chapter can empty out entirely; renumber what is left so c still indexes
  const live = [...new Set(m.items.map(i => i.c))].sort((a, b) => a - b);
  const remap = new Map(live.map((c, i) => [c, i]));
  m.chapters = live.map(c => m.chapters[c]);
  m.items = m.items.map(i => ({ ...i, c: remap.get(i.c) }));
  writeFileSync(mPath, JSON.stringify(m, null, 1));
  console.log(`culled ${before - m.items.length}: ${before} -> ${m.items.length} photos, `
    + `${m.chapters.length} chapters. Now run: node scripts/herpanel.mjs build`);
  process.exit(0);
}

const need = p => existsSync(p) || die(`missing ${p}`);
need(join(SRC, 'thumb')); need(join(SRC, 'full'));
need(join(SRC, 'message.txt')); need(join(SRC, 'code.txt'));

const code = readFileSync(join(SRC, 'code.txt'), 'utf8').trim();
if (!code) die('secret/us/code.txt is empty');
const message = readFileSync(join(SRC, 'message.txt'), 'utf8').trim();
const psPath = join(SRC, 'ps.txt');
const ps = existsSync(psPath) ? readFileSync(psPath, 'utf8').trim() : '';

need(join(SRC, 'manifest.json'));
const manifest = JSON.parse(readFileSync(join(SRC, 'manifest.json'), 'utf8'));
const names = manifest.items.map(i => i.n + '.jpg');
if (!names.length) die('no thumbnails');

const salt = rand(16);
const key = await deriveKey(code, salt);

// Clear only the ciphertext; docs/us/index.html is source, not build output.
rmSync(join(OUT, 'f'), { recursive: true, force: true });
mkdirSync(join(OUT, 'f'), { recursive: true });
for (const f of (existsSync(OUT) ? readdirSync(OUT) : []))
  if (/\.bin$/.test(f)) rmSync(join(OUT, f));

// --- thumbnails, bundled into packs: [uint32 length][jpeg] repeated ---
const items = [], packs = [];
let buf = [], bytes = 0;
const flush = async () => {
  if (!buf.length) return;
  const name = `t${String(packs.length).padStart(2, '0')}.bin`;
  writeFileSync(join(OUT, name), await enc(key, Buffer.concat(buf)));
  packs.push(name); buf = []; bytes = 0;
};
for (const n of names) {
  const jpg = readFileSync(join(SRC, 'thumb', n));
  const { w, h } = jpegSize(jpg);
  const len = Buffer.alloc(4); len.writeUInt32LE(jpg.length);
  buf.push(len, jpg); bytes += jpg.length + 4;
  const m = manifest.items[items.length];
  items.push({ n: m.n, w, h, p: packs.length, d: m.date, c: m.c });
  if (bytes >= PACK_BYTES) await flush();
}
await flush();

// --- full photos, one file each, fetched only on tap ---
let full = 0;
for (const it of items) {
  const p = join(SRC, 'full', it.n + '.jpg');
  if (!existsSync(p)) continue;
  writeFileSync(join(OUT, 'f', it.n + '.bin'), await enc(key, readFileSync(p)));
  full++;
}

// --- the note and the layout index ---
writeFileSync(join(OUT, 'meta.bin'),
  await enc(key, Buffer.from(JSON.stringify(
    { v: 1, message, ps, chapters: manifest.chapters, items, packs }), 'utf8')));

// --- site 404: forwards aedinlai.com/<code> to the panel, 404s on anything else ---
// Only the code's SHA-256 ships, never the code.
const codeHash = Buffer.from(
  await subtle.digest('SHA-256', new TextEncoder().encode(code.trim().toLowerCase()))
).toString('hex');
writeFileSync(join(ROOT, 'docs/404.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Not found</title><link rel="icon" href="data:,">
<style>
 @font-face{font-family:'Space Grotesk';src:url('/fonts/SpaceGrotesk-latin.woff2') format('woff2');font-weight:300 700;font-display:swap}
 @font-face{font-family:'Inter';src:url('/fonts/Inter-latin.woff2') format('woff2');font-weight:100 900;font-display:swap}
 :root{--paper:#fff;--ink:#101114;--muted:#6b7280}
 @media(prefers-color-scheme:dark){:root{--paper:#0d0e11;--ink:#f2f3f5;--muted:#9aa0aa}}
 body{margin:0;min-height:100svh;display:grid;place-items:center;background:var(--paper);
      color:var(--ink);font-family:'Inter',system-ui,sans-serif;text-align:center;padding:24px}
 h1{font-family:'Space Grotesk',sans-serif;font-weight:500;font-size:clamp(24px,6vw,34px);margin:0 0 .5em}
 p{color:var(--muted);margin:0 0 1.6em}
 a{color:var(--ink)}
</style></head>
<body><main hidden id="m">
 <h1>Nothing here</h1><p>That page doesn't exist.</p><p><a href="/">Back to aedinlai.com</a></p>
</main>
<script>
(async () => {
  const parts = decodeURIComponent(location.pathname).split('/').filter(Boolean);
  const seg = parts.length === 1 ? parts[0].trim().toLowerCase() : '';
  if (seg) {
    const h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seg)))]
      .map(b => b.toString(16).padStart(2,'0')).join('');
    if (h === ${JSON.stringify(codeHash)}) { location.replace('/us/#' + encodeURIComponent(seg)); return; }
  }
  document.getElementById('m').hidden = false;
})();
</script>
</body></html>
`);

// A new id each build: the page appends it to every asset URL, so a rebuilt
// panel can never be decrypted against a cached copy of the previous one.
writeFileSync(join(OUT, 'params.json'),
  JSON.stringify({ salt: b64(salt), iterations: ITERATIONS, packs: packs.length, build: b64(rand(6)) }));

// This repo lives under ~/Desktop, which iCloud syncs. Rewriting a file it is
// mid-upload makes iCloud keep BOTH as "name 2.bin", and those stale copies
// would otherwise be committed and served. They pile up in the plaintext
// folders too, where a copy of a culled photo can outlive the cull. Sweep
// both sides after every build.
let stale = 0;
for (const dir of [OUT, join(OUT, 'f'), join(SRC, 'thumb'), join(SRC, 'full')])
  for (const f of readdirSync(dir))
    if (f.includes(' ')) { rmSync(join(dir, f)); stale++; }
if (stale) console.log(`removed ${stale} iCloud conflict copies`);

console.log(`docs/us/  ${items.length} photos in ${manifest.chapters.length} chapters, `
  + `${packs.length} thumb packs, ${full} full`);
console.log(`passphrase: "${code}"  (case and surrounding space ignored)`);
