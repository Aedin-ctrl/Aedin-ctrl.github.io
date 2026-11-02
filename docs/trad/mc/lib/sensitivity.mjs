/* sensitivity.mjs -- is the result a plateau, or a spike?
 *
 * A strategy whose edge disappears when you nudge a parameter by one step was
 * never an edge; it was a coincidence that happened to land on that setting. A
 * real effect degrades GRACEFULLY, because the thing it exploits does not know
 * what number you typed.
 *
 * Three views, because they fail in different ways:
 *   profiles     vary one parameter across its whole range, hold the rest
 *   neighbourhood  every combination within +/-r steps of the chosen point
 *   surface      the full grid, for the rank of the chosen point
 *
 * The last one matters more than it looks: if your chosen set is the maximum of
 * 300 combinations, you have run 300 trials, and the Deflated Sharpe on the
 * Monte Carlo tab needs to know that.
 */
import { runStrategy, expandGrid, OBJECTIVES } from './strategylab.mjs';
import * as S from './stats.mjs';

const axisValues = (p) => {
  if (Array.isArray(p.values)) return p.values.slice();
  const out = [];
  const step = p.step || 1;
  const count = Math.floor((p.max - p.min) / step + 1e-9) + 1;
  for (let i = 0; i < count; i++) out.push(+(p.min + i * step).toFixed(10));
  return out;
};

export function sensitivity(market, fn, spec, chosen, opts = {}) {
  const { objective = 'sharpe', radius = 1, ppy = 252, bpsPerTurnover = 1, keepFraction = 0.5 } = opts;
  const obj = OBJECTIVES[objective] || OBJECTIVES.sharpe;
  const keys = Object.keys(spec).sort();

  const score = (params) => {
    const r = runStrategy(market, fn, params, { ppy, bpsPerTurnover });
    return r ? { score: obj.get(r), result: r } : { score: NaN, result: null };
  };

  const base = score(chosen);
  if (!Number.isFinite(base.score)) return { ok: false, note: 'the chosen parameter set does not produce a usable result' };

  /* --- one parameter at a time, across its whole range --- */
  const profiles = {};
  for (const k of keys) {
    const vals = axisValues(spec[k]);
    const pts = vals.map(v => {
      const p = { ...chosen, [k]: v };
      const s = score(p);
      return { value: v, score: s.score, result: s.result };
    });
    const finite = pts.filter(p => Number.isFinite(p.score));
    const idx = vals.findIndex(v => Math.abs(v - chosen[k]) < 1e-9);
    // local slope either side of the chosen value, in score per step
    const left = idx > 0 ? pts[idx - 1].score : NaN;
    const right = idx < pts.length - 1 ? pts[idx + 1].score : NaN;
    profiles[k] = {
      values: vals, points: pts,
      chosenIndex: idx, chosenScore: base.score,
      best: finite.length ? finite.reduce((a, b) => b.score > a.score ? b : a) : null,
      worst: finite.length ? finite.reduce((a, b) => b.score < a.score ? b : a) : null,
      median: finite.length ? S.quantile(finite.map(p => p.score), 0.5) : NaN,
      positiveShare: finite.length ? finite.filter(p => p.score > 0).length / finite.length : 0,
      stepLeft: Number.isFinite(left) ? left - base.score : NaN,
      stepRight: Number.isFinite(right) ? right - base.score : NaN,
      // the chosen value sitting at an EDGE of its range is its own warning:
      // the optimiser wanted to go further and was not allowed to
      atEdge: idx === 0 || idx === vals.length - 1,
    };
  }

  /* --- every combination within +/-radius steps --- */
  const neigh = [];
  const offsets = [];
  const build = (i, acc) => {
    if (i === keys.length) { offsets.push(acc.slice()); return; }
    for (let d = -radius; d <= radius; d++) { acc.push(d); build(i + 1, acc); acc.pop(); }
  };
  build(0, []);
  for (const off of offsets) {
    const p = {};
    let valid = true;
    for (let a = 0; a < keys.length; a++) {
      const vals = axisValues(spec[keys[a]]);
      const idx = vals.findIndex(v => Math.abs(v - chosen[keys[a]]) < 1e-9);
      const j = idx + off[a];
      if (idx < 0 || j < 0 || j >= vals.length) { valid = false; break; }
      p[keys[a]] = vals[j];
    }
    if (!valid) continue;
    const s = score(p);
    neigh.push({ params: p, offsets: off.slice(), score: s.score,
                 isChosen: off.every(d => d === 0) });
  }
  const nFinite = neigh.filter(x => Number.isFinite(x.score));
  const keepBar = base.score > 0 ? base.score * keepFraction : base.score;
  const held = nFinite.filter(x => x.score >= keepBar).length;

  /* --- the whole grid, for the rank of the chosen point --- */
  const grid = expandGrid(spec);
  const all = grid.map(p => score(p).score).filter(Number.isFinite);
  all.sort((a, b) => b - a);
  const rank = all.findIndex(v => v <= base.score + 1e-12) + 1;

  const worst = nFinite.length ? Math.min(...nFinite.map(x => x.score)) : NaN;
  const plateau = nFinite.length ? held / nFinite.length : 0;
  const cliff = base.score !== 0 ? (base.score - worst) / Math.abs(base.score) : NaN;

  return {
    ok: true, objective, radius,
    chosen, chosenScore: base.score, chosenResult: base.result,
    profiles, neighbours: neigh, neighbourCount: nFinite.length,
    plateauScore: plateau,
    worstNeighbour: worst,
    medianNeighbour: nFinite.length ? S.quantile(nFinite.map(x => x.score), 0.5) : NaN,
    cliffDrop: cliff,
    positiveNeighbours: nFinite.filter(x => x.score > 0).length,
    gridSize: grid.length, gridValid: all.length,
    gridRank: rank, gridMedian: all.length ? S.quantile(all, 0.5) : NaN,
    gridBest: all.length ? all[0] : NaN,
    anyAtEdge: keys.filter(k => profiles[k].atEdge),
    // the verdict, in one word, with the reason attached
    verdict: verdictOf(plateau, cliff, rank, all.length),
  };
}

function verdictOf(plateau, cliff, rank, n) {
  if (!(n > 1)) return { label: 'untested', why: 'only one valid parameter set' };
  const topDecile = rank <= Math.max(1, Math.round(n * 0.1));
  if (plateau >= 0.8 && cliff < 0.6) {
    return { label: 'plateau', why: `${(plateau * 100).toFixed(0)}% of neighbouring settings keep at least half the score, and the worst is ${(cliff * 100).toFixed(0)}% below. The result does not depend on the exact numbers.` };
  }
  if (plateau >= 0.5) {
    return { label: 'ridge', why: `${(plateau * 100).toFixed(0)}% of neighbours hold up. Some directions are safe and some are not — check the per-parameter profiles for which.` };
  }
  return {
    label: 'spike',
    why: `only ${(plateau * 100).toFixed(0)}% of neighbouring settings keep half the score${topDecile ? ', and the chosen point is in the top decile of the whole grid' : ''}. A one-step nudge destroys it, which is what a coincidence looks like.`,
  };
}

/** A 2-D slice of the grid, for the heatmap. */
export function surface(market, fn, spec, chosen, xKey, yKey, opts = {}) {
  const { objective = 'sharpe', ppy = 252, bpsPerTurnover = 1 } = opts;
  const obj = OBJECTIVES[objective] || OBJECTIVES.sharpe;
  const xs = axisValues(spec[xKey]), ys = axisValues(spec[yKey]);
  const z = ys.map(yv => xs.map(xv => {
    const p = { ...chosen, [xKey]: xv, [yKey]: yv };
    const r = runStrategy(market, fn, p, { ppy, bpsPerTurnover });
    return r ? obj.get(r) : NaN;
  }));
  return { xKey, yKey, xs, ys, z };
}
