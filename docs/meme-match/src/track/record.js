// Landmark recordings (research/01 §4.3): observations only, never video, so any change to the
// features or the scorer can be re-checked against old sessions.
//   { v: 1, kind: 'take' | 'neutral' | 'session', meme, at, calib, frames: [obs…], labels? }
// Typed arrays become plain arrays rounded to 4 decimals; files are gzipped JSON.

const R = (a, k = 1e4) => (a ? Array.from(a, (v) => Math.round(v * k) / k) : null);

export function obsToJSON(o) {
  return {
    t: Math.round(o.t ?? 0), w: o.w, h: o.h, face: R(o.face), bs: R(o.bs), mat: R(o.mat, 1e5), pose: R(o.pose), poseW: R(o.poseW),
    hands: o.hands.map((h) => ({ lm: R(h.lm), world: R(h.world, 1e5), handed: h.handed, score: Math.round(h.score * 100) / 100, gest: h.gest ?? null })),
  };
}

export function obsFromJSON(j) {
  const F = (a) => (a ? Float32Array.from(a) : null);
  return { ...j, face: F(j.face), bs: F(j.bs), mat: F(j.mat), pose: F(j.pose), poseW: F(j.poseW),
    hands: j.hands.map((h) => ({ ...h, lm: F(h.lm), world: F(h.world) })) };
}

export function calibToJSON(c) { return c ? { ...c, neutralBs: c.neutralBs ? R(c.neutralBs) : null } : null; }
export function calibFromJSON(c) { return c ? { ...c, neutralBs: c.neutralBs ? Float32Array.from(c.neutralBs) : null } : null; }

// Browser: gzip a recording for upload.
export async function gzipJSON(obj) {
  const stream = new Blob([JSON.stringify(obj)]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).blob();
}

// Node: read a recording file.
export async function readRecording(path) {
  const { readFile } = await import('node:fs/promises');
  const { gunzipSync } = await import('node:zlib');
  const j = JSON.parse(gunzipSync(await readFile(path)).toString('utf8'));
  return { ...j, calib: calibFromJSON(j.calib), frames: j.frames.map(obsFromJSON) };
}
