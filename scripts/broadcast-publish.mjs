#!/usr/bin/env node
// Copies finished Broadcast episodes into the site and rebuilds the manifest the
// Broadcast page reads. The episodes themselves are generated elsewhere (see
// ~/Desktop/Broadcast); this only publishes what is already rendered.
//
//   node scripts/broadcast-publish.mjs            publish every episode found
//   node scripts/broadcast-publish.mjs --keep 20  publish, but keep only the newest 20 on the site
//   BROADCAST_DIR=/path node scripts/broadcast-publish.mjs
//
// Source layout, per episode NN:
//   out/epNN.mp4           the rendered episode
//   out/epNN/poster.jpg    its poster frame
//   episodes/epNN.json     {id, title, date, synopsis, ...}
//
// Writes docs/broadcast/episodes/ and docs/broadcast/episodes.json.
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.env.BROADCAST_DIR || join(homedir(), 'Desktop/Broadcast');
const DEST = join(ROOT, 'docs/broadcast/episodes');
const MANIFEST = join(ROOT, 'docs/broadcast/episodes.json');

const keepIdx = process.argv.indexOf('--keep');
const KEEP = keepIdx > -1 ? Number(process.argv[keepIdx + 1]) : Infinity;
if(Number.isNaN(KEEP)) { console.error('error: --keep needs a number'); process.exit(1); }

if(!existsSync(join(SRC, 'out'))) {
  console.error(`error: no episodes at ${SRC}/out  (set BROADCAST_DIR)`);
  process.exit(1);
}

// ffprobe gives the real duration; without it the page just omits the running time
// rather than printing a guess.
function duration(file){
  try {
    const out = execFileSync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file,
    ], { encoding: 'utf8' });
    const n = Number(out.trim());
    return Number.isFinite(n) ? Math.round(n) : null;
  } catch { return null; }
}

const mp4s = readdirSync(join(SRC, 'out'))
  .filter(f => /^ep\d+\.mp4$/.test(f))
  .sort();                                   // ep01, ep02, ... zero-padded, so lexical == chronological

if(!mp4s.length){ console.error(`error: no epNN.mp4 files in ${SRC}/out`); process.exit(1); }

mkdirSync(DEST, { recursive: true });

const episodes = [];
for(const file of mp4s){
  const id = basename(file, '.mp4');
  const metaPath = join(SRC, 'episodes', `${id}.json`);
  if(!existsSync(metaPath)){ console.warn(`  skipping ${id}: no episodes/${id}.json`); continue; }
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));

  copyFileSync(join(SRC, 'out', file), join(DEST, file));
  const posterSrc = join(SRC, 'out', id, 'poster.jpg');
  const hasPoster = existsSync(posterSrc);
  if(hasPoster) copyFileSync(posterSrc, join(DEST, `${id}.jpg`));

  episodes.push({
    id,
    title: meta.title || id,
    day: meta.date || null,                  // the in-fiction date, e.g. "day 1"
    synopsis: meta.synopsis || '',
    video: `episodes/${file}`,
    poster: hasPoster ? `episodes/${id}.jpg` : null,
    seconds: duration(join(DEST, file)),
    bytes: statSync(join(DEST, file)).size,
  });
}

// Newest first: that is the order the page shows them in.
episodes.reverse();

const kept = episodes.slice(0, KEEP);
if(kept.length < episodes.length){
  // Prune the files the manifest no longer points at, so the repo does not grow forever.
  const live = new Set(kept.flatMap(e => [basename(e.video), e.poster && basename(e.poster)].filter(Boolean)));
  for(const f of readdirSync(DEST)) if(!live.has(f)) rmSync(join(DEST, f));
  console.log(`pruned ${episodes.length - kept.length} older episode(s) from the site`);
}

writeFileSync(MANIFEST, JSON.stringify({ updated: new Date().toISOString(), episodes: kept }, null, 2) + '\n');

const mb = kept.reduce((n, e) => n + e.bytes, 0) / 1e6;
console.log(`published ${kept.length} episode(s), ${mb.toFixed(1)} MB total`);
for(const e of kept) console.log(`  ${e.id}  ${e.seconds ?? '?'}s  ${e.title}`);
