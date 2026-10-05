#!/usr/bin/env node
// Seals everything that names the tailnet so View Source shows only ciphertext.
// These pages are public (their tabs are hidden, the files are not), so the machine
// names, addresses, ports and ssh user are encrypted under the gate's own word +
// traffic-light sequence -- the same PBKDF2-SHA256 / AES-GCM scheme as scripts/secret.mjs.
//
// Two targets, one key:
//   docs/devices/index.html   the herdr card's link       <- secret/herdr.json "payload"
//   docs/terminal/index.html  the whole Terminal page     <- secret/terminal.html
//
// THIS IS A SECOND LOCK, BEHIND THE PANEL'S (2026-10-04). Reaching these pages at all
// needs the panel's own word + dot combination. Opening what is on them needs a DIFFERENT
// word, typed into the box on the page, plus a DIFFERENT combination -- clicked on the
// SAME three window buttons in the top-left corner of the browser chrome, not on a second
// set of lights belonging to the page. That second set is what was deleted; the second
// password was not.
//
// Plaintext lives in secret/ (gitignored; the repo is public):
//   secret/herdr.json     {"word": ..., "dots": [...], "payload": {"machines": [{name,url,what,note}, ...]}}
//   secret/terminal.html  the Terminal page's inner HTML
//
//   node scripts/herdr-gate.mjs seal    encrypt both into their pages
//   node scripts/herdr-gate.mjs open    decrypt both back, to check what is in there
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = join(ROOT, 'secret/herdr.json');
const TARGETS = [
  { page: join(ROOT, 'docs/devices/index.html'),  indent: '  ',
    label: 'the herdr card',
    text: c => JSON.stringify(c.payload) },
  { page: join(ROOT, 'docs/terminal/index.html'), indent: '  ',
    label: 'the Terminal page',
    text: () => readFileSync(join(ROOT, 'secret/terminal.html'), 'utf8') },
];
const BEGIN = '<!-- herdr:begin (sealed by scripts/herdr-gate.mjs; edit the plaintext in secret/ instead) -->';
const END = '<!-- herdr:end -->';
const DOT_COLORS = ['red', 'yellow', 'green'];

const { subtle } = globalThis.crypto;
const enc = new TextEncoder();
const b64 = bytes => Buffer.from(bytes).toString('base64url');
const unb64 = s => new Uint8Array(Buffer.from(s, 'base64url'));
const rand = n => globalThis.crypto.getRandomValues(new Uint8Array(n));

function die(msg){ console.error('error: ' + msg); process.exit(1); }

function loadConfig(){
  if(!existsSync(CONFIG)) die(`missing ${CONFIG}`);
  const c = JSON.parse(readFileSync(CONFIG, 'utf8'));
  if(!c.word || !Array.isArray(c.dots) || !c.dots.length) die('config needs "word" and "dots"');
  for(const d of c.dots) if(!DOT_COLORS.includes(d)) die(`dot "${d}" must be one of ${DOT_COLORS.join(', ')}`);
  // The payload is either one machine, or a list of them under "machines". The card shows
  // every machine behind the gate, so there is no reason to have two cards.
  const machines = c.payload && (Array.isArray(c.payload.machines) ? c.payload.machines
                                                                   : [c.payload]);
  if(!machines || !machines.length) die('config needs a "payload"');
  machines.forEach((m, i) => {
    if(!m || !m.url)  die(`payload machine ${i + 1} needs a "url"`);
    if(!m.name)       die(`payload machine ${i + 1} needs a "name"`);
  });
  return { iterations: 600000, ...c };
}

// Must match normalizeWord() in docs/devices/index.html.
const secretFor = (word, dots) => word.trim().toLowerCase() + '\n' + dots.join(' ');

async function pbkdf2(secret, salt, iterations, bits){
  const base = await subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, bits));
}
async function seal(keyBytes, text){
  const key = await subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
  const iv = rand(12);
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text)));
  return { iv: b64(iv), ct: b64(ct) };
}
async function unseal(keyBytes, iv, ct){
  const key = await subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
  return new TextDecoder().decode(await subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(ct)));
}

function splitPage(page){
  const html = readFileSync(page, 'utf8');
  const a = html.indexOf(BEGIN), b = html.indexOf(END);
  if(a < 0 || b < a) die(`markers not found in ${page}`);
  return { before: html.slice(0, a + BEGIN.length), inner: html.slice(a + BEGIN.length, b), after: html.slice(b) };
}
const boxIn = inner => JSON.parse(inner.match(/>(\{.*\})</)[1]);

async function cmdSeal(){
  const c = loadConfig();
  for(const t of TARGETS){
    const text = t.text(c);
    // A fresh salt and iv per target, so the two ciphertexts give nothing away about
    // each other even though one key opens both.
    const salt = rand(16);
    const key = await pbkdf2(secretFor(c.word, c.dots), salt, c.iterations, 256);
    const box = { v: 1, n: c.dots.length, iter: c.iterations, salt: b64(salt), ...(await seal(key, text)) };
    const { before, after } = splitPage(t.page);
    writeFileSync(t.page, `${before}\n${t.indent}<script type="application/json" id="herdrCipher">${JSON.stringify(box)}</script>\n${t.indent}${after}`);
    // Round-trip check, so a bad seal never gets committed.
    const check = boxIn(splitPage(t.page).inner);
    const back = await unseal(await pbkdf2(secretFor(c.word, c.dots), unb64(check.salt), check.iter, 256), check.iv, check.ct);
    if(back !== text) die(`round-trip check failed for ${t.page}`);
    console.log(`sealed ${t.label} into ${t.page.slice(ROOT.length + 1)} (${text.length} chars)`);
  }
  console.log(`  word: ${c.word}   lights: ${c.dots.join(' ')}`);
}

async function cmdOpen(){
  const c = loadConfig();
  for(const t of TARGETS){
    const box = boxIn(splitPage(t.page).inner);
    const key = await pbkdf2(secretFor(c.word, c.dots), unb64(box.salt), box.iter, 256);
    let text;
    try { text = await unseal(key, box.iv, box.ct); } catch { die('wrong word or lights in secret/herdr.json'); }
    console.log(`--- ${t.page.slice(ROOT.length + 1)}`);
    console.log(text);
  }
}

const cmd = process.argv[2];
if(cmd === 'seal') await cmdSeal();
else if(cmd === 'open') await cmdOpen();
else die('usage: node scripts/herdr-gate.mjs seal | open');
