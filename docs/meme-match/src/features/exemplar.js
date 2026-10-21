// A target's typical look, for drawing its mask on the emoji: the median face mesh and hands from
// a recording, in face-frame units (origin between the outer eye corners, unit = face width), so it
// can be fitted onto any picture by its anchor points (src/render/fit.js).
import { faceGeometry } from './extract.js';

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
const r3 = (v) => Math.round(v * 1000) / 1000;

export function exemplarFrom(obsList, calib = {}) {
  const faces = [], hands = [[], []];
  for (const obs of obsList) {
    if (!obs.face) continue;
    const G = faceGeometry(obs, calib);
    if (!G) continue;
    faces.push(Array.from({ length: 478 }, (_, i) => G.F.to({ x: obs.face[i * 3] * obs.w, y: obs.face[i * 3 + 1] * obs.h })));
    const hs = obs.hands.map((h) => Array.from({ length: 21 }, (_, i) => G.F.to({ x: h.lm[i * 3] * obs.w, y: h.lm[i * 3 + 1] * obs.h })))
      .sort((a, b) => a[0].x - b[0].x);
    hs.slice(0, 2).forEach((h, k) => hands[k].push(h));
  }
  if (faces.length < 3) return null;
  const med = (list, n) => Array.from({ length: n }, (_, i) => [r3(median(list.map((f) => f[i].x))), r3(median(list.map((f) => f[i].y)))]);
  const keep = hands.filter((h) => h.length >= faces.length * 0.5);
  return { face: med(faces, 478), hands: keep.map((h) => med(h, 21)) };
}
