// Loads the meme library: memes/index.json lists the ids per mode, memes/<id>/meme.json holds each one.
//   index = { modes: { emoji: [ids], hamster: [ids], memes: [ids] }, shown: ['emoji', 'hamster'], titles }
import { prepareMeme } from './score.js';

const BASE = new URL('../../memes/', import.meta.url);

export async function loadIndex(base = BASE, read = defaultRead) {
  const idx = JSON.parse(await read(new URL('index.json', base)));
  return Array.isArray(idx) ? { modes: { memes: idx }, shown: ['memes'], titles: { memes: 'Memes' } } : idx;
}

// mode: a mode name, or 'all' for every meme in every mode (tools and tests)
export async function loadLibrary(mode = 'emoji', base = BASE, read = defaultRead) {
  const idx = await loadIndex(base, read);
  const ids = mode === 'all' ? [...new Set(Object.values(idx.modes).flat())] : idx.modes[mode];
  if (!ids) throw new Error(`no mode "${mode}"`);
  return Promise.all(ids.map(async (id) => {
    const m = JSON.parse(await read(new URL(`${id}/meme.json`, base)));
    return prepareMeme({ ...m, dir: new URL(`${id}/`, base).href });
  }));
}

async function defaultRead(url) {
  if (url.protocol === 'file:') { const { readFile } = await import('node:fs/promises'); return readFile(url, 'utf8'); }
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.text();
}
