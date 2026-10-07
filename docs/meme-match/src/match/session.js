// Builds every template of a mode at once from one guided session (the "Train on your face" flow).
//
// Unlike single-meme teach, each target is built knowing the others, which is what fixes
// look-alikes: start from the features that stand out from your neutral face, then repeatedly find
// pairs of targets that still get mixed up and give both the feature that best separates them.
//
//   buildSession({ targets: [{ id, rounds: [[{x, valid}], …] }], neutral: [{x, valid}], base: memes })
//   → { templates: { id: template }, report: { self, cross, confusions } }
import { FEAT, FEATS, N_FEATS } from '../features/schema.js';
import { compile, rankMemes } from './score.js';
import { canonicalize, gatesFor, partsFor, restValue, specFor, tolMin } from './teach.js';

export const LOOSEN = 1.5;      // best held-out accuracy on real training takes (2026-10-01: emoji 86% at ×1 → 93% at ×1.5)
let loosenNow = 1;      // set per build: one take's spread underestimates how much you vary between takes
const median = (a) => { const s = Float64Array.from(a).sort(); const n = s.length; return n ? (n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
const r3 = (v) => Math.round(v * 1000) / 1000;

function stats(frames) {
  const mu = new Float32Array(N_FEATS), tol = new Float32Array(N_FEATS), rate = new Float32Array(N_FEATS);
  for (let i = 0; i < N_FEATS; i++) {
    const vals = [];
    for (const f of frames) if (f.valid[i]) vals.push(f.x[i]);
    rate[i] = frames.length ? vals.length / frames.length : 0;
    if (!vals.length) { mu[i] = NaN; tol[i] = 1; continue; }
    mu[i] = median(vals);
    const mad = median(vals.map((v) => Math.abs(v - mu[i])));
    tol[i] = Math.max(1.5 * 1.4826 * mad, tolMin(FEATS[i].name)) * loosenNow;
  }
  return { mu, tol, rate };
}

// Features that can't be learned from a session: identities and gates are set separately.
const SKIP = (name) => name === 'hands_n' || name === 'hands_face' || /_present$/.test(name);
const capKey = (name) => {
  const slot = name.match(/^(h[01]|arm[LR])_/)?.[1] || '';
  const b = name.slice(slot ? slot.length + 1 : 0);
  if (/^(palm|tip)_[xy]$/.test(b)) return [`${slot}pos`, 2];
  if (b.startsWith('touch_')) return [`${slot}touch`, 3];
  if (/^(point|orient)_/.test(b)) return [`${slot}dir`, 2];
  if (b.startsWith('curl_')) return [`${slot}curl`, 5];
  if (b.startsWith('cover_')) return ['cover', 3];
  if (b.startsWith('head_')) return ['head', 3];
  return ['face', 8];
};


function build(targets, neutral, { initial = 6, maxFeats = 14, rounds = 8, loosen = 1 } = {}) {
  loosenNow = 1;
  const N = neutral.length ? stats(neutral) : null;
  loosenNow = loosen;
  const T = targets.map((t) => {
    const all = t.frames;
    const ref = stats(all.slice(0, Math.max(1, Math.floor(all.length / 2)))).mu;
    const frames = canonicalize(all, ref);
    return { id: t.id, frames, st: stats(frames), feats: gatesFor(frames), used: new Map() };
  });
  const rest = (i) => (N && N.rate[i] >= 0.6 ? N.mu[i] : restValue(FEATS[i].name));
  const add = (t, i, z) => {
    const name = FEATS[i].name;
    if (t.feats[name] || SKIP(name) || t.st.rate[i] < 0.6 || Object.keys(t.feats).length > maxFeats) return false;
    if (/_touch_/.test(name) && t.st.mu[i] > 0.3) return false;                    // only real contact
    const [key, cap] = capKey(name);
    if ((t.used.get(key) || 0) >= cap) return false;
    t.used.set(key, (t.used.get(key) || 0) + 1);
    // one-sided ("at least this much") only when the target itself is far from rest; the weight
    // comes from how much the feature separates (z), so e.g. neutral gets a two-sided "brows level"
    const zRest = Math.abs(t.st.mu[i] - rest(i)) / t.st.tol[i];
    const spec = specFor({ name, mu: t.st.mu[i], tol: t.st.tol[i], rest: rest(i), z: zRest });
    spec.w = r3(Math.min(3, Math.max(0.5, z / 2)));
    t.feats[name] = spec;
    return true;
  };
  // every target's strongest cue is decisive: high weight, and a tolerance that keeps your relaxed
  // face at least two tolerances away (on the relaxed side only, since cues are one-sided there)
  const decisive = () => {
    for (const t of T) {
      let top = null, tz = 0;
      for (const [name, f] of Object.entries(t.feats)) {
        if (f.gate) continue;
        const z = Math.abs(f.mu - rest(FEAT[name])) / f.tol;
        if (z > tz) { tz = z; top = name; }
      }
      if (!top || tz < 1) continue;
      const f = t.feats[top], r = rest(FEAT[top]), gap = Math.abs(f.mu - r);
      f.w = Math.max(f.w, 2.5); f.key = true;
      f.tol = Math.max(0.05, Math.min(f.tol, gap / 2));
      if (!f.side) f.side = f.mu > r ? 'ge' : 'le';
    }
  };
  // 1. what stands out from neutral
  for (const t of T) {
    const cand = [];
    for (let i = 0; i < N_FEATS; i++) if (t.st.rate[i] >= 0.6 && !Number.isNaN(t.st.mu[i])) cand.push([i, Math.abs(t.st.mu[i] - rest(i)) / t.st.tol[i]]);
    cand.sort((a, b) => b[1] - a[1]);
    let n = 0;
    for (const [i, z] of cand) { if (n >= initial || z < 1.5) break; if (add(t, i, z)) n++; }
  }
  decisive();
  // 2. separate the pairs that still collide
  const compiled = () => T.map((t) => ({ id: t.id, chiral: false, compiled: [compile({ feats: t.feats, parts: partsFor(t.feats) })] }));
  let confusions = [];
  for (let it = 0; it < rounds; it++) {
    const memes = compiled();
    confusions = [];
    for (const t of T) {
      const tally = new Map(); let self = 0;
      for (const f of t.frames) {
        const r = rankMemes(f.x, f.valid, memes);
        const mine = r.find((e) => e.id === t.id).score;
        self += mine;
        for (const e of r) if (e.id !== t.id && e.score > mine - 0.1) tally.set(e.id, (tally.get(e.id) || 0) + 1);
      }
      for (const [o, c] of tally) if (c / t.frames.length >= 0.15) confusions.push({ t: t.id, o, share: c / t.frames.length });
    }
    if (!confusions.length) break;
    let changed = false;
    for (const { t: tid, o: oid } of confusions) {
      const t = T.find((x) => x.id === tid), o = T.find((x) => x.id === oid);
      let best = null, bs = 0;
      for (let i = 0; i < N_FEATS; i++) {
        if (t.st.rate[i] < 0.6 || o.st.rate[i] < 0.6 || SKIP(FEATS[i].name)) continue;
        const sep = Math.abs(t.st.mu[i] - o.st.mu[i]) / Math.hypot(t.st.tol[i], o.st.tol[i]);
        if (sep > bs && (!t.feats[FEATS[i].name] || !o.feats[FEATS[i].name])) { bs = sep; best = i; }
      }
      if (best === null || bs < 0.8) continue;
      changed = add(t, best, bs * 2) | changed;
      changed = add(o, best, bs * 2) | changed;
    }
    if (!changed) break;
  }
  decisive();
  return { T, confusions };
}

// Share of each target's frames where it ranks first (frames of `test`, templates from `train`).
function accuracy(templates, test) {
  const memes = Object.entries(templates).map(([id, t]) => ({ id, chiral: false, compiled: [compile(t)] }));
  const per = {};
  let hit = 0, n = 0;
  for (const t of test) {
    let h = 0;
    for (const f of t.frames) { const r = rankMemes(f.x, f.valid, memes); if (r[0].id === t.id) h++; }
    per[t.id] = t.frames.length ? h / t.frames.length : 0;
    hit += h; n += t.frames.length;
  }
  return { overall: n ? hit / n : 0, per };
}

const toTemplates = (T, source) => Object.fromEntries(T.map((t) => {
  const feats = Object.fromEntries(Object.entries(t.feats).map(([k, v]) => [k, { ...v, mu: r3(v.mu), tol: r3(v.tol), w: r3(v.w) }]));   // keeps .key
  return [t.id, { source, n: t.frames.length, feats, parts: partsFor(feats) }];
}));

export function buildSession({ targets, neutral = [], source = 'session', loosen = LOOSEN }) {
  const flat = targets.map((t) => ({ id: t.id, frames: t.rounds.flat() }));
  const { T, confusions } = build(flat, neutral, { loosen });
  const templates = toTemplates(T, source);
  const self = accuracy(templates, flat);
  // honest check: build from one round, test on the other (when there are two)
  let cross = null;
  // leave-one-round-out: build from every other round, test on the one left out
  const R = Math.min(...targets.map((t) => t.rounds.length));
  if (R >= 2) {
    const runs = [];
    for (let k = 0; k < R; k++) {
      const train = targets.map((t) => ({ id: t.id, frames: t.rounds.filter((_, j) => j !== k).flat() }));
      const test = targets.map((t) => ({ id: t.id, frames: t.rounds[k] }));
      runs.push(accuracy(toTemplates(build(train, neutral, { loosen }).T, 'cv'), test));
    }
    cross = { overall: runs.reduce((a, r) => a + r.overall, 0) / R, per: Object.fromEntries(targets.map((t) => [t.id, runs.reduce((a, r) => a + r.per[t.id], 0) / R])) };
  }
  return { templates, report: { self, cross, confusions } };
}
