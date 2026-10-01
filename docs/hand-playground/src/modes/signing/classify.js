// ASL fingerspelling classifier: an ensemble of small MLPs (built in, trained by
// scripts/train-signs.mjs) + a nearest-neighbour model on the user's own "Teach" samples.
import { vector, keypoints } from './features.js';
import MODEL from './model.js';

export const STATIC_LETTERS = MODEL.letters;             // 24 static letters (J and Z need motion)
const N = MODEL.letters.length;

function mlp(net, x) {
  let a = new Float32Array(42);
  for (let k = 0; k < 42; k++) a[k] = (x[k] - net.mean[k]) / net.std[k];
  net.layers.forEach((L, li) => {
    const nin = net.sizes[li], nout = net.sizes[li + 1], z = new Float32Array(nout);
    for (let o = 0; o < nout; o++) {
      let s = L.b[o];
      for (let i = 0; i < nin; i++) s += L.W[o * nin + i] * a[i];
      z[o] = li < net.layers.length - 1 ? Math.max(0, s) : s;
    }
    a = z;
  });
  let mx = -Infinity; for (const v of a) mx = Math.max(mx, v);
  let sum = 0; const p = new Float32Array(N);
  for (let i = 0; i < N; i++) { p[i] = Math.exp(a[i] - mx); sum += p[i]; }
  for (let i = 0; i < N; i++) p[i] /= sum;
  return p;
}

// Test-time augmentation: the frame, its mirror, and ±8° rotations, averaged over every model.
export function probs(x) {
  const out = new Float32Array(N);
  let n = 0;
  for (const [a, flip] of MODEL.tta) {
    const c = Math.cos(a), s = Math.sin(a), v = new Float32Array(42);
    for (let i = 0; i < 21; i++) { const x0 = x[2 * i] * flip, y0 = x[2 * i + 1]; v[2 * i] = c * x0 - s * y0; v[2 * i + 1] = s * x0 + c * y0; }
    for (const net of MODEL.nets) { const p = mlp(net, v); for (let k = 0; k < N; k++) out[k] += p[k]; n++; }
  }
  for (let k = 0; k < N; k++) out[k] /= n;
  return out;
}

export const ranked = (p) => Array.from(p, (v, i) => ({ letter: MODEL.letters[i], p: v })).sort((a, b) => b.p - a.p);
export const predict = (x) => ranked(probs(x));

// Nearest-neighbour model on taught samples (capped per letter, top-k without a full sort).
export class Taught {
  constructor(storeKey = 'hp-sign-samples') {
    this.key = storeKey;
    this.samples = [];
    try { this.samples = JSON.parse(localStorage.getItem(this.key) || '[]'); } catch {}
  }
  get letters() { return new Set(this.samples.map((s) => s.l)); }
  count(letter) { return this.samples.reduce((n, s) => n + (s.l === letter), 0); }
  add(letter, v) {
    if (this.count(letter) >= 24) return;
    this.samples.push({ l: letter, v: v.map((x) => Math.round(x * 1000) / 1000) });
  }
  forget(letter) { this.samples = this.samples.filter((s) => s.l !== letter); }
  clear() { this.samples = []; this.save(); }
  save() { try { localStorage.setItem(this.key, JSON.stringify(this.samples)); } catch {} }

  predict(v, k = 5) {
    if (this.samples.length < 5) return null;
    const best = [];                                   // k nearest, kept sorted
    for (const s of this.samples) {
      let d = 0;
      for (let i = 0; i < v.length; i++) { const e = s.v[i] - v[i]; d += e * e; }
      if (best.length < k || d < best[best.length - 1].d) {
        best.push({ l: s.l, d }); best.sort((a, b) => a.d - b.d); if (best.length > k) best.pop();
      }
    }
    const votes = new Map();
    for (const n of best) votes.set(n.l, (votes.get(n.l) || 0) + 1 / (Math.sqrt(n.d) + 0.05));
    const total = [...votes.values()].reduce((a, b) => a + b, 0);
    const [letter, w] = [...votes].sort((a, b) => b[1] - a[1])[0];
    return { letter, conf: w / total, dist: Math.sqrt(best[0].d) };
  }
}

// One frame → a probability vector over the letters. Taught samples are blended in (60/40)
// when they're a close match, so your own handshapes win without throwing the model away.
export function classify(d, taught, pts) {
  const p = probs(keypoints(pts));
  const knn = d && taught?.predict(vector(d));
  if (knn && knn.dist < 0.9 && knn.conf > 0.55) {
    const i = MODEL.letters.indexOf(knn.letter);
    for (let k = 0; k < N; k++) p[k] *= 0.4;
    if (i >= 0) p[i] += 0.6 * knn.conf;
    return { p, taught: knn.letter };
  }
  return { p, taught: null };
}

// Smooths per-frame probabilities over time and decides when a letter is "on".
//   EMA (τ = 120 ms) → a letter starts at p > 0.70 with a 0.20 lead, and ends below 0.45
//   or when another letter beats it by 0.15.
export class Smoother {
  constructor() { this.ema = null; this.letter = null; }
  reset() { this.ema = null; this.letter = null; }
  update(p, dt) {
    const a = 1 - Math.exp(-dt / 0.12);
    if (!this.ema) this.ema = Float32Array.from(p);
    else for (let k = 0; k < N; k++) this.ema[k] += (p[k] - this.ema[k]) * a;
    const top = ranked(this.ema);
    const cur = this.letter ? this.ema[MODEL.letters.indexOf(this.letter)] : 0;
    if (this.letter) {
      if (cur < 0.45 || (top[0].letter !== this.letter && top[0].p > cur + 0.15)) this.letter = null;
    }
    if (!this.letter && top[0].p > 0.7 && top[0].p - top[1].p > 0.2) this.letter = top[0].letter;
    return { letter: this.letter, conf: this.letter ? this.ema[MODEL.letters.indexOf(this.letter)] : top[0].p, top };
  }
}
