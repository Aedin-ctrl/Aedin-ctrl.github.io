// Template scoring (research/01 §2.8–2.9).
//
// A meme has one or more templates. A template lists only the features that matter for that meme:
//   feats: { touch_lips: { mu: 0.05, tol: 0.12, w: 3, side: 'le' }, smile: { mu: 0.6, tol: 0.2, w: 1 } }
//     mu   target value (what a person doing this meme measures)
//     tol  how far off still counts as "close" (one tol off ≈ 61% for that feature)
//     w    importance
//     side 'le' = only penalise values above mu (e.g. contact distances: closer is fine),
//          'ge' = only penalise values below mu (e.g. "mouth at least this open"), default both
//     key  the template's main cue (default: its heaviest feature, if weight ≥ 2). Missing it by more
//          than one tolerance also multiplies the whole score down, so a pose that matches every
//          small detail but not the one thing that defines the target can't win.
//     gate true = a condition, not a resemblance: it can only lower the score (multiplies it by
//          exp(-½·w·d²)) and never adds to a part's average. Used for "no hands" / "one hand", so
//          a face-only meme doesn't get a free 100% on hands just because yours are down.
//   parts: { face: { w: 1, need: 'required' }, hands: { w: 1.5, need: 'required' }, arms: { w: 0.5, need: 'optional' } }
//     need 'required' = missing data costs score, 'optional' = skipped when missing, 'ignore' = never scored
//
// Per part: s = exp(-½ · M), M = (Σ w·d^(2P) / Σ w)^(1/P) over its valid features, d = (x − mu) / tol.
// P = 1 is the plain weighted mean of d²; P > 1 lets one decisive miss (straight arms for a
// hands-on-hips meme) count for more than several near-misses, so look-alikes separate.
// Everything one tolerance off still scores exp(-½) ≈ 61% for any P.
// Parts combine with a weighted geometric mean, so a meme needs all its important parts:
// a perfect face with the wrong hands can't score 75%.
import { FEAT, FEATS, PARTS, mirror, mirrorValid, swapHands } from '../features/schema.js';

export const PART_FLOOR = 0.15;
export const P = 2;

// Compiles a template's feature table into flat arrays once.
export function compile(t) {
  const names = Object.keys(t.feats).filter((n) => FEAT[n] !== undefined);
  const unknown = Object.keys(t.feats).filter((n) => FEAT[n] === undefined);
  if (unknown.length) console.warn('[match] unknown features ignored:', unknown.join(', '));
  return {
    ...t,
    idx: Int16Array.from(names.map((n) => FEAT[n])),
    mu: Float32Array.from(names.map((n) => t.feats[n].mu)),
    tol: Float32Array.from(names.map((n) => Math.max(1e-3, t.feats[n].tol))),
    w: Float32Array.from(names.map((n) => t.feats[n].w ?? 1)),
    side: Int8Array.from(names.map((n) => (t.feats[n].side === 'le' ? -1 : t.feats[n].side === 'ge' ? 1 : 0))),
    gate: Uint8Array.from(names.map((n) => (t.feats[n].gate ? 1 : 0))),
    key: (() => {
      const k = new Uint8Array(names.length);
      const explicit = names.map((n, i) => (t.feats[n].key ? i : -1)).filter((i) => i >= 0);
      if (explicit.length) { for (const i of explicit) k[i] = 1; return k; }
      let best = -1, bw = 2 - 1e-9;
      names.forEach((n, i) => { const f = t.feats[n]; if (!f.gate && (f.w ?? 1) >= bw) { bw = f.w ?? 1; best = i; } });
      if (best >= 0) k[best] = 1;
      return k;
    })(),
    part: names.map((n) => FEATS[FEAT[n]].part),
    names,
  };
}

// The four ways to read one frame: as is, hands swapped, mirrored, mirrored + swapped.
export function variants(x, valid) {
  const [sx, sv] = swapHands(x, valid);
  const mx = mirror(x), mv = mirrorValid(valid);
  const [msx, msv] = swapHands(mx, mv);
  return [{ x, v: valid, mirrored: false }, { x: sx, v: sv, mirrored: false }, { x: mx, v: mv, mirrored: true }, { x: msx, v: msv, mirrored: true }];
}

export function scoreTemplate(x, valid, t) {
  const acc = { face: [0, 0, 0], hands: [0, 0, 0], arms: [0, 0, 0] };   // Σ w·d^2P (valid), Σ w (valid), Σ w (all)
  let worst = null, worstCost = -1, gateCost = 0;
  for (let k = 0; k < t.idx.length; k++) {
    const i = t.idx[k];
    if (t.gate[k]) {
      if (!valid[i]) continue;
      let d = (x[i] - t.mu[k]) / t.tol[k];
      if ((t.side[k] < 0 && d < 0) || (t.side[k] > 0 && d > 0)) d = 0;
      const cost = t.w[k] * d * d;
      gateCost += cost;
      if (cost > worstCost) { worstCost = cost; worst = { name: t.names[k], value: x[i], mu: t.mu[k], d }; }
      continue;
    }
    const p = acc[t.part[k]];
    p[2] += t.w[k];
    if (!valid[i]) continue;
    let d = (x[i] - t.mu[k]) / t.tol[k];
    if ((t.side[k] < 0 && d < 0) || (t.side[k] > 0 && d > 0)) d = 0;
    const d2 = d * d, cost = t.w[k] * d2;
    p[0] += t.w[k] * d2 ** P; p[1] += t.w[k];
    if (t.key[k] && Math.abs(d) > 1) gateCost += 0.5 * t.w[k] * (Math.abs(d) - 1) ** 2;
    if (cost > worstCost) { worstCost = cost; worst = { name: t.names[k], value: x[i], mu: t.mu[k], d }; }
  }
  let logS = 0, W = 0;
  const parts = {};
  for (const name of PARTS) {
    const cfg = t.parts?.[name] ?? { w: 1, need: 'optional' };
    const [cost, wv, wall] = acc[name];
    if (cfg.need === 'ignore' || wall === 0) continue;
    let s;
    if (wv === 0) {
      if (cfg.need !== 'required') continue;
      s = PART_FLOOR;
    } else {
      s = Math.exp(-0.5 * (cost / wv) ** (1 / P));
      if (cfg.need === 'required' && wv < wall) s *= PART_FLOOR + (1 - PART_FLOOR) * (wv / wall);   // partly missing
    }
    parts[name] = s;
    logS += (cfg.w ?? 1) * Math.log(Math.max(s, 1e-4));
    W += cfg.w ?? 1;
  }
  return { score: W ? Math.exp(logS / W - 0.5 * gateCost) : 0, parts, worst };
}

// Best score over the meme's templates and the frame's variants (mirror / hand order).
export function scoreMeme(vars, meme) {
  let best = { score: -1, parts: {}, worst: null };
  for (const t of meme.compiled) {
    for (const vr of vars) {
      if (meme.chiral && vr.mirrored) continue;
      const r = scoreTemplate(vr.x, vr.v, t);
      if (r.score > best.score) best = { ...r, mirrored: vr.mirrored, template: t };
    }
  }
  return best;
}

// Scores every meme for one frame. Returns [{ id, score, parts, worst, mirrored }] best first.
export function rankMemes(x, valid, memes) {
  const vars = variants(x, valid);
  return memes.map((m) => ({ id: m.id, ...scoreMeme(vars, m) })).sort((a, b) => b.score - a.score);
}

// Templates inherit the meme's part settings unless they set their own.
export function prepareMeme(m) { return { ...m, compiled: m.templates.map((t) => compile({ parts: m.parts, ...t })) }; }
