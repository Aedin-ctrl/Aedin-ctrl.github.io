// Per-user calibration (research/01 §2.5): resting faces differ a lot (one person's neutral
// browDown is another's frown), so blendshapes are measured against your own neutral face.
//   calib = { neutralBs: Float32Array(52) | null, neutralEye: number, earRatio: number }
import { dist2, dist3 } from './geom.js';

const fp = (obs, i) => ({ x: obs.face[i * 3] * obs.w, y: obs.face[i * 3 + 1] * obs.h, z: obs.face[i * 3 + 2] * obs.w });
const pp = (obs, i) => ({ x: obs.pose[i * 5] * obs.w, y: obs.pose[i * 5 + 1] * obs.h, vis: obs.pose[i * 5 + 3] });

export const DEFAULT_CALIB = { neutralBs: null, neutralEye: 0.3, earRatio: 1.2, neutralMouthW: 0.42, neutralCheekW: 0.79, neutralCurve: 0.1 };

// Mouth corner-to-corner and lower-cheek widths, in face widths (3D, so head turns barely matter).
export function faceWidths(obs) {
  const s = dist3(fp(obs, 234), fp(obs, 454)) || 1;
  return { mouth: dist3(fp(obs, 61), fp(obs, 291)) / s, cheek: (dist3(fp(obs, 192), fp(obs, 416)) + dist3(fp(obs, 187), fp(obs, 411))) / 2 / s };
}

// How far the mouth corners sit above (+) or below (−) the middle of the lips, along the face's own
// vertical, ×8. MediaPipe's frown blendshape is weak; this geometric smile/frown curve isn't.
export function mouthCurveRaw(obs) {
  const eR = fp(obs, 33), eL = fp(obs, 263), ul = Math.hypot(eL.x - eR.x, eL.y - eR.y) || 1;
  const v = { x: -(eL.y - eR.y) / ul, y: (eL.x - eR.x) / ul };
  const s = dist3(fp(obs, 234), fp(obs, 454)) || 1;
  const a = fp(obs, 13), b = fp(obs, 14), c1 = fp(obs, 61), c2 = fp(obs, 291);
  const lips = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, cs = { x: (c1.x + c2.x) / 2, y: (c1.y + c2.y) / 2 };
  return (((lips.x - cs.x) * v.x + (lips.y - cs.y) * v.y) / s) * 8;
}

export function eyeOpenRaw(obs) {
  const r = dist2(fp(obs, 159), fp(obs, 145)) / (dist2(fp(obs, 33), fp(obs, 133)) || 1);
  const l = dist2(fp(obs, 386), fp(obs, 374)) / (dist2(fp(obs, 263), fp(obs, 362)) || 1);
  return (r + l) / 2;
}

// Face width ÷ ear-to-ear distance, so the pose fallback frame has the same scale as the mesh one.
export function earRatioOf(obs) {
  if (!obs.face || !obs.pose) return null;
  const a = pp(obs, 7), b = pp(obs, 8);
  if (a.vis < 0.5 || b.vis < 0.5) return null;
  const ears = dist2(a, b);
  return ears > 4 ? dist3(fp(obs, 234), fp(obs, 454)) / ears : null;
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : NaN; };

// Collects frames while the user holds a neutral face; finish() returns the calibration.
export class NeutralCapture {
  constructor() { this.bs = []; this.eye = []; this.ear = []; this.mouth = []; this.cheek = []; this.curve = []; }
  add(obs) {
    if (!obs.face || !obs.bs) return false;
    this.bs.push(Float32Array.from(obs.bs));
    this.eye.push(eyeOpenRaw(obs));
    const w = faceWidths(obs); this.mouth.push(w.mouth); this.cheek.push(w.cheek); this.curve.push(mouthCurveRaw(obs));
    const r = earRatioOf(obs);
    if (r) this.ear.push(r);
    return true;
  }
  get count() { return this.bs.length; }
  finish() {
    if (this.bs.length < 5) return null;
    const n = this.bs[0].length, neutralBs = new Float32Array(n);
    for (let i = 0; i < n; i++) neutralBs[i] = median(this.bs.map((b) => b[i]));
    return {
      neutralBs,
      neutralEye: Math.max(0.12, median(this.eye)),
      earRatio: this.ear.length ? median(this.ear) : DEFAULT_CALIB.earRatio,
      neutralMouthW: median(this.mouth),
      neutralCheekW: median(this.cheek),
      neutralCurve: median(this.curve),
    };
  }
}

const KEY = 'memematch.calib.v1';
export function saveCalib(c) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...c, neutralBs: c.neutralBs ? Array.from(c.neutralBs) : null, at: Date.now() })); } catch {}
}
export function loadCalib() {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!j) return null;
    return { ...DEFAULT_CALIB, ...j, neutralBs: j.neutralBs ? Float32Array.from(j.neutralBs) : null };
  } catch { return null; }
}

// Calibration that learns your resting face while you use the app, for when you haven't trained
// or calibrated. Over the last ~30 s with a face in view: blendshapes → their 30th percentile
// (expressions push channels up, so the low end is your resting face); eye openness and the
// mouth/cheek widths → their median (they move both ways).
export class AutoCalib {
  constructor({ keep = 900, every = 15, min = 60 } = {}) {
    Object.assign(this, { keep, every, min });
    this.bs = []; this.eye = []; this.mouth = []; this.cheek = []; this.curve = []; this.n = 0; this.calib = null;
  }
  add(obs) {
    if (!obs.face || !obs.bs) return this.calib;
    this.bs.push(Float32Array.from(obs.bs)); this.eye.push(eyeOpenRaw(obs));
    const w = faceWidths(obs); this.mouth.push(w.mouth); this.cheek.push(w.cheek); this.curve.push(mouthCurveRaw(obs));
    for (const a of [this.bs, this.eye, this.mouth, this.cheek, this.curve]) if (a.length > this.keep) a.shift();
    if (++this.n % this.every === 0 && this.bs.length >= this.min) {
      const q = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
      const neutralBs = new Float32Array(this.bs[0].length);
      for (let i = 0; i < neutralBs.length; i++) neutralBs[i] = q(this.bs.map((b) => b[i]), 0.3);
      this.calib = { neutralBs, neutralEye: Math.max(0.12, q(this.eye, 0.5)), earRatio: DEFAULT_CALIB.earRatio, neutralMouthW: q(this.mouth, 0.5), neutralCheekW: q(this.cheek, 0.5), neutralCurve: q(this.curve, 0.5), auto: true };
    }
    return this.calib;
  }
}
