#!/usr/bin/env node
// Seals the Secret Projects panel into docs/index.html so View Source shows
// only ciphertext, and manages temp keys in docs/fonts/glyphs.txt.
//
// Plaintext lives in secret/ (gitignored; the repo is public):
//   secret/panel.html   the panel's inner HTML (heading + one <details class="sp-item"> per project)
//   secret/config.json  {"word": ..., "dots": ["red", ...], "tempSalt": ..., "iterations": ...}
//
//   node scripts/secret.mjs seal                  encrypt secret/panel.html into docs/index.html
//   node scripts/secret.mjs open                  decrypt docs/index.html back into secret/panel.html
//   node scripts/secret.mjs temp add KEY PROJECT  one-project temp key (valid 24 h after its commit)
//   node scripts/secret.mjs temp clear            remove every temp key
//
// The key is PBKDF2-SHA256 over the address-bar word plus the dot colours;
// the page (lookUpTempKey / tryUnlock in docs/index.html) derives it the same way.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = join(ROOT, 'docs/index.html');
const GLYPHS = join(ROOT, 'docs/fonts/glyphs.txt');
const PANEL = join(ROOT, 'secret/panel.html');
const CONFIG = join(ROOT, 'secret/config.json');
const BEGIN = '<!-- secret:begin (sealed by scripts/secret.mjs; edit secret/panel.html instead) -->';
const END = '<!-- secret:end -->';
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
  if(!c.tempSalt) die('config needs "tempSalt"');
  return { iterations: 600000, ...c };
}

// Must match normalizeSecretWord() in docs/index.html.
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

function splitIndex(){
  const html = readFileSync(INDEX, 'utf8');
  const a = html.indexOf(BEGIN), b = html.indexOf(END);
  if(a < 0 || b < a) die(`markers not found in ${INDEX}`);
  return { before: html.slice(0, a + BEGIN.length), inner: html.slice(a + BEGIN.length, b), after: html.slice(b) };
}

async function cmdSeal(){
  const c = loadConfig();
  const panel = readFileSync(PANEL, 'utf8');
  const salt = rand(16);
  const key = await pbkdf2(secretFor(c.word, c.dots), salt, c.iterations, 256);
  const box = { v: 1, n: c.dots.length, iter: c.iterations, salt: b64(salt), tempSalt: c.tempSalt, ...(await seal(key, panel)) };
  const { before, after } = splitIndex();
  const indent = '          ';
  writeFileSync(INDEX, `${before}\n${indent}<script type="application/json" id="secretCipher">${JSON.stringify(box)}</script>\n${indent}${after}`);
  // Round-trip check, so a bad seal never gets committed.
  const check = JSON.parse(splitIndex().inner.match(/>(\{.*\})</)[1]);
  const back = await unseal(await pbkdf2(secretFor(c.word, c.dots), unb64(check.salt), check.iter, 256), check.iv, check.ct);
  if(back !== panel) die('round-trip check failed');
  const titles = [...panel.matchAll(/class="proj-title">([^<]+)</g)].map(m => m[1].trim());
  console.log(`sealed ${titles.length} project(s) into docs/index.html: ${titles.join(', ')}`);
}

async function cmdOpen(){
  const c = loadConfig();
  const box = JSON.parse(splitIndex().inner.match(/>(\{.*\})</)[1]);
  const key = await pbkdf2(secretFor(c.word, c.dots), unb64(box.salt), box.iter, 256);
  let text;
  try { text = await unseal(key, box.iv, box.ct); } catch { die('wrong word or dots in secret/config.json'); }
  writeFileSync(PANEL, text);
  console.log(`wrote ${PANEL}`);
}

// One PBKDF2 run gives both the lookup id (so glyphs.txt never holds the key)
// and the AES key for that project. Must match deriveTempKey() in docs/index.html.
async function deriveTemp(key, tempSalt, iterations){
  const bits = await pbkdf2(key.trim().toLowerCase(), unb64(tempSalt), iterations, 384);
  return { aes: bits.slice(0, 32), id: Buffer.from(bits.slice(32, 48)).toString('hex') };
}

function projectHtml(panel, name){
  const items = panel.split(/(?=<details class="sp-item">)/).filter(s => s.startsWith('<details class="sp-item">'));
  for(const raw of items){
    // Each chunk runs to the next item; keep up to this item's own closing tag.
    let depth = 0, i = 0;
    const re = /<details\b|<\/details>/g;
    let m;
    while((m = re.exec(raw))){
      depth += m[0] === '</details>' ? -1 : 1;
      if(depth === 0){ i = m.index + m[0].length; break; }
    }
    const item = raw.slice(0, i);
    const title = (item.match(/class="proj-title">([^<]+)</) || [])[1];
    if(title && title.trim().toLowerCase() === name.trim().toLowerCase()) return item;
  }
  return null;
}

function readGlyphs(){
  const text = readFileSync(GLYPHS, 'utf8');
  const lines = text.split(/\r?\n/);
  const t = lines.findIndex(l => l.trim().toLowerCase() === 'temp');
  if(t < 0) die(`no "temp" line in ${GLYPHS}`);
  return { head: lines.slice(0, t + 1), entries: lines.slice(t + 1).filter(l => l.trim()) };
}
function writeGlyphs(head, entries){ writeFileSync(GLYPHS, [...head, ...entries].join('\n') + '\n'); }

async function cmdTemp(sub, key, ...nameParts){
  const c = loadConfig();
  const { head, entries } = readGlyphs();
  if(sub === 'clear'){ writeGlyphs(head, []); console.log(`removed ${entries.length} temp key(s)`); return; }
  if(sub !== 'add' || !key || !nameParts.length) die('usage: temp add KEY PROJECT | temp clear');
  if(/[\s\/.]/.test(key)) die('a temp key cannot contain spaces, slashes or dots');
  const name = nameParts.join(' ');
  const item = projectHtml(readFileSync(PANEL, 'utf8'), name);
  if(!item) die(`no project titled "${name}" in secret/panel.html`);
  const { aes, id } = await deriveTemp(key, c.tempSalt, c.iterations);
  const { iv, ct } = await seal(aes, item);
  writeGlyphs(head, [...entries.filter(l => !l.startsWith(id + ':')), `${id}:${iv}:${ct}`]);
  console.log(`added temp key for "${name}". It works for 24 hours after you commit and push docs/fonts/glyphs.txt.`);
}

const [cmd, ...rest] = process.argv.slice(2);
if(cmd === 'seal') await cmdSeal();
else if(cmd === 'open') await cmdOpen();
else if(cmd === 'temp') await cmdTemp(...rest);
else die('usage: node scripts/secret.mjs seal | open | temp add KEY PROJECT | temp clear');
