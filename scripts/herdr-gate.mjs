#!/usr/bin/env node
// Seals the herdr link on the Devices page so View Source shows only ciphertext.
// docs/devices/index.html is public (the tab is hidden, the file is not), so the
// tailnet URL is encrypted under the gate's own word + traffic-light sequence --
// the same PBKDF2-SHA256 / AES-GCM scheme as scripts/secret.mjs.
//
// Plaintext lives in secret/herdr.json (gitignored; the repo is public):
//   {"word": ..., "dots": ["yellow", ...], "iterations": ..., "payload": {...}}
//
//   node scripts/herdr-gate.mjs seal    encrypt secret/herdr.json into docs/devices/index.html
//   node scripts/herdr-gate.mjs open    decrypt it back, to check what is in there
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = join(ROOT, 'docs/devices/index.html');
const CONFIG = join(ROOT, 'secret/herdr.json');
const BEGIN = '<!-- herdr:begin (sealed by scripts/herdr-gate.mjs; edit secret/herdr.json instead) -->';
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
  if(!c.payload || !c.payload.url) die('config needs a "payload" with a "url"');
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

function splitPage(){
  const html = readFileSync(PAGE, 'utf8');
  const a = html.indexOf(BEGIN), b = html.indexOf(END);
  if(a < 0 || b < a) die(`markers not found in ${PAGE}`);
  return { before: html.slice(0, a + BEGIN.length), inner: html.slice(a + BEGIN.length, b), after: html.slice(b) };
}
const boxIn = inner => JSON.parse(inner.match(/>(\{.*\})</)[1]);

async function cmdSeal(){
  const c = loadConfig();
  const text = JSON.stringify(c.payload);
  const salt = rand(16);
  const key = await pbkdf2(secretFor(c.word, c.dots), salt, c.iterations, 256);
  const box = { v: 1, n: c.dots.length, iter: c.iterations, salt: b64(salt), ...(await seal(key, text)) };
  const { before, after } = splitPage();
  const indent = '  ';
  writeFileSync(PAGE, `${before}\n${indent}<script type="application/json" id="herdrCipher">${JSON.stringify(box)}</script>\n${indent}${after}`);
  // Round-trip check, so a bad seal never gets committed.
  const check = boxIn(splitPage().inner);
  const back = await unseal(await pbkdf2(secretFor(c.word, c.dots), unb64(check.salt), check.iter, 256), check.iv, check.ct);
  if(back !== text) die('round-trip check failed');
  console.log(`sealed ${c.payload.name} (${c.payload.url}) into docs/devices/index.html`);
  console.log(`  word: ${c.word}   lights: ${c.dots.join(' ')}`);
}

async function cmdOpen(){
  const c = loadConfig();
  const box = boxIn(splitPage().inner);
  const key = await pbkdf2(secretFor(c.word, c.dots), unb64(box.salt), box.iter, 256);
  let text;
  try { text = await unseal(key, box.iv, box.ct); } catch { die('wrong word or lights in secret/herdr.json'); }
  console.log(text);
}

const cmd = process.argv[2];
if(cmd === 'seal') await cmdSeal();
else if(cmd === 'open') await cmdOpen();
else die('usage: node scripts/herdr-gate.mjs seal | open');
