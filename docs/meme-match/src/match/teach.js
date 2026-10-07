// Builds a meme template from recorded takes (research/01 §4.1).
//
//   frames: [{ x: Float32Array, valid: Uint8Array }] from extract(), all takes together
//   neutral: same, recorded with a relaxed face and hands down (optional)
//   →  { feats, parts, stats } where feats = { name: { mu, tol, w, side?, gate? } }
//
// 1. Frames are put into one orientation: each one is replaced by whichever of its four
//    variants (as is / hands swapped / mirrored / both) is closest to the first take.
// 2. Per feature: mu = median, tol = max(1.5 × robust σ, a per-kind minimum).
// 3. A feature is proposed when it sits far from rest (your neutral frames, else a typical
//    resting value) in tolerance units: z = |mu − rest| / tol. The top ones get w ∝ z.
import { FEATS, FEAT, N_FEATS } from '../features/schema.js';
import { variants } from './score.js';

// Minimum tolerance per kind of feature, so a too-perfect recording can't be impossible to match.
export function tolMin(name) {
  const b = name.replace(/^h[01]_/, '').replace(/^arm[LR]_/, '');
  if (b.startsWith('touch_')) return 0.1;
  if (b.startsWith('curl_')) return 0.2;
  if (b.startsWith('cover_')) return 0.2;
  if (/^(palm|tip)_[xy]$/.test(b) || b.startsWith('hand_')) return 0.18;
  if (/^(point|orient)_/.test(b) || /^(up|fore)_/.test(b)) return 0.22;
  if (b === 'elbow') return 0.12;
  if (b.startsWith('wrist_')) return 0.2;
  if (b.startsWith('head_')) return 0.2;
  if (b === 'face_size') return 0.06;
  if (b === 'gaze_x' || b === 'gaze_y') return 0.2;
  if (b === 'hands_dist' || b === 'hands_level') return 0.25;
  return 0.15;                                            // blendshape-style intensities
}

// Typical values at rest (relaxed face, arms down), for features your neutral recording can't give
// (e.g. hand features when your hands were out of view).
export function restValue(name) {
  const b = name.replace(/^h[01]_/, '').replace(/^arm[LR]_/, '');
  if (b.startsWith('touch_')) return 1.2;
  if (b.startsWith('curl_')) return 0.35;
  if (b.startsWith('cover_')) return 0;
  if (b === 'palm_y' || b === 'tip_y') return 3;
  if (b === 'present') return 0;
  if (b === 'elbow') return 0.95;
  if (b === 'up_out') return 0.1;
  if (b === 'up_y') return 1;
  if (b === 'fore_out') return 0;
  if (b === 'fore_y') return 1;
  if (b === 'wrist_y') return 2.2;
  if (b === 'hand_y') return 3;
  if (b === 'hand_mouth') return 2;
  if (b === 'face_size') return 0.3;
  if (b === 'point_fore') return 1;
  if (b === 'hands_face') return 2;
  return 0;
}

// Features where "more of it" (or "less of it") still counts as doing the meme.
const INTENSITY = /^(brow_|eye_open|blink$|squint|jaw_open|mouth_open|smile$|frown|pucker|funnel|press|lip_roll|stretch|upper_up|chin_raise|sneer|cheek_puff|face_size|cover_)/;

const r3 = (v) => Math.round(v * 1000) / 1000;

// A candidate {name, mu, tol, rest, z} → the template entry {mu, tol, w, side?}.
export function specFor(c) {
  const f = { mu: r3(c.mu), tol: r3(c.tol), w: r3(Math.min(3, Math.max(0.5, c.z / 2))) };
  if (/_touch_/.test(c.name)) f.side = 'le';
  else if (INTENSITY.test(c.name) && c.z >= 2) f.side = c.mu > c.rest ? 'ge' : 'le';
  return f;
}

// Part settings from the chosen features: a part that carries real weight is required.
export function partsFor(feats) {
  const sum = { face: 0, hands: 0, arms: 0 };
  for (const [name, f] of Object.entries(feats)) if (!f.gate && FEAT[name] !== undefined) sum[FEATS[FEAT[name]].part] += f.w;
  const parts = {};
  for (const [p, s] of Object.entries(sum)) parts[p] = { w: r3(Math.min(2, Math.max(0.5, s / 4))), need: s >= 1.5 ? 'required' : s > 0 ? 'optional' : 'ignore' };
  return parts;
}

// Gates (conditions, never resemblance). A face-only target only needs your hands away from your
// face (resting at your chest is fine); a hand target needs that many hands up.
export function gatesFor(frames) {
  const med = (i, d) => median(frames.map((f) => (f.valid[i] ? f.x[i] : d)));
  if (med(FEAT.hands_face, 2) > 0.6) return { hands_face: { mu: 0.9, tol: 0.3, w: 1.5, side: 'ge', gate: true } };
  const hn = med(FEAT.hands_n, 0);
  return { hands_n: { mu: hn >= 0.75 ? 1 : 0.5, tol: 0.25, w: 1.5, side: 'ge', gate: true } };
}

// Features that say nearly the same thing share a cap, so one fact can't take every slot.
function group(name) {
  const slot = name.match(/^(h[01]|arm[LR])_/)?.[1] || '';
  const b = name.slice(slot ? slot.length + 1 : 0);
  if (/^(palm|tip)_[xy]$/.test(b)) return { key: `${slot}pos`, cap: 2 };
  if (b.startsWith('touch_')) return { key: `${slot}touch`, cap: 2 };
  if (/^(point|orient)_/.test(b)) return { key: `${slot}dir`, cap: 2 };
  if (b.startsWith('curl_')) return { key: `${slot}curl`, cap: 4 };
  if (slot.startsWith('arm')) return { key: slot + (b.startsWith('hand_') ? 'hand' : ''), cap: 3 };
  if (b.startsWith('cover_')) return { key: 'cover', cap: 2 };
  if (b.startsWith('head_')) return { key: 'head', cap: 2 };
  return { key: 'face', cap: 6 };
}

const median = (a) => { const s = Float64Array.from(a).sort(); const n = s.length; return n ? (n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };

function featureMedians(frames) {
  const mu = new Float32Array(N_FEATS), rate = new Float32Array(N_FEATS);
  for (let i = 0; i < N_FEATS; i++) {
    const vals = [];
    for (const f of frames) if (f.valid[i]) vals.push(f.x[i]);
    rate[i] = frames.length ? vals.length / frames.length : 0;
    mu[i] = vals.length ? median(vals) : NaN;
  }
  return { mu, rate };
}

// Picks, for every frame, the variant closest to the reference (median of the first take).
export function canonicalize(frames, ref) {
  return frames.map((f) => {
    let best = null, bestD = Infinity;
    for (const v of variants(f.x, f.valid)) {
      let d = 0, n = 0;
      for (let i = 0; i < N_FEATS; i++) if (v.v[i] && !Number.isNaN(ref[i])) { d += Math.min(2, Math.abs(v.x[i] - ref[i])); n++; }
      // a variant that loses most of the overlap shouldn't win just by having less to compare
      const score = n ? d / n + (N_FEATS - n) * 1e-4 : Infinity;
      if (score < bestD) { bestD = score; best = v; }
    }
    return { x: best.x, valid: best.v };
  });
}

export function buildTemplate(takes, { neutral = [], maxFeats = 12, zMin = 1.5, source = 'teach' } = {}) {
  const all = takes.flat();
  if (!all.length) throw new Error('no frames');
  const ref = featureMedians(takes[0].length ? takes[0] : all).mu;
  const frames = canonicalize(all, ref);
  const { mu, rate } = featureMedians(frames);
  const restN = neutral.length ? featureMedians(neutral) : null;

  const cand = [];
  for (let i = 0; i < N_FEATS; i++) {
    const { name } = FEATS[i];
    if (rate[i] < 0.6 || name === 'hands_n' || name === 'hands_face' || /_present$/.test(name)) continue;
    const vals = [];
    for (const f of frames) if (f.valid[i]) vals.push(f.x[i]);
    const mad = median(vals.map((v) => Math.abs(v - mu[i])));
    const tol = Math.max(1.5 * 1.4826 * mad, tolMin(name));
    const rest = restN && restN.rate[i] >= 0.6 ? restN.mu[i] : restValue(name);
    const z = Math.abs(mu[i] - rest) / tol;
    cand.push({ name, i, mu: mu[i], tol, rest, z });
  }
  cand.sort((a, b) => b.z - a.z);
  // When the hand tracker saw the hands, Pose's rough hand points add nothing but noise.
  const handsSeen = Math.max(rate[FEAT.h0_palm_x], rate[FEAT.h1_palm_x]) >= 0.6;
  const picked = [], used = new Map();
  for (const c of cand) {
    if (c.z < zMin || picked.length >= maxFeats) break;
    if (/_touch_/.test(c.name) && c.mu > 0.25) continue;          // only real contact is a feature
    if (handsSeen && /^arm[LR]_hand_/.test(c.name)) continue;
    const g = group(c.name);
    const n = used.get(g.key) || 0;
    if (n >= g.cap) continue;
    used.set(g.key, n + 1);
    picked.push(c);
  }

  const feats = {};
  for (const c of picked) feats[c.name] = specFor(c);
  // how many hands: a gate, never part of the resemblance
  Object.assign(feats, gatesFor(frames));

  return {
    template: { source, n: all.length, feats, parts: partsFor(feats) },
    stats: { frames: all.length, candidates: cand.slice(0, 30).map((c) => ({ name: c.name, mu: r3(c.mu), tol: r3(c.tol), rest: r3(c.rest), z: r3(c.z), picked: !!feats[c.name] })) },
  };
}
