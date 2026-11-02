/* walkforward.mjs -- does the PARAMETER CHOICE survive being re-picked?
 *
 * A full-sample optimisation tells you which settings fitted the past. It cannot
 * tell you whether you would have chosen them at the time. Walk-forward does:
 * optimise on a window, trade the NEXT window with whatever that optimisation
 * picked, roll forward, and keep only the out-of-sample pieces.
 *
 * The concatenated out-of-sample curve is the only equity curve in this whole
 * project that was never fitted to. It is also, almost always, much worse than
 * the in-sample one -- and the size of that gap is the finding.
 *
 * Two shapes:
 *   rolling  -- fixed-width in-sample window that slides (adapts, forgets)
 *   anchored -- in-sample grows from the start (never forgets, adapts slowly)
 *
 * The in-sample window is strictly before the out-of-sample window. Always.
 * t_walkforward.mjs asserts it by checking that changing the future cannot move
 * a past fold's chosen parameters.
 */
import { search, runStrategy, OBJECTIVES, expandGrid } from './strategylab.mjs';
import * as S from './stats.mjs';
import * as M from './metrics.mjs';

export function walkForward(market, fn, spec, opts = {}) {
  const {
    folds = 5, isFraction = 0.6, anchored = false,
    objective = 'sharpe', ppy = 252, bpsPerTurnover = 1, minOOS = 40,
  } = opts;
  const n = market.length;
  const obj = OBJECTIVES[objective] || OBJECTIVES.sharpe;

  // Lay out the folds: the history after the first in-sample block is split into
  // `folds` equal out-of-sample periods, each preceded by its own in-sample window.
  const oosTotal = Math.floor(n * (1 - isFraction));
  const oosLen = Math.floor(oosTotal / folds);
  if (oosLen < minOOS) {
    return { ok: false, note: `each out-of-sample fold would be ${oosLen} periods; need at least ${minOOS}. Use fewer folds or more data.` };
  }
  const firstOOS = n - oosLen * folds;
  const isLen = anchored ? null : firstOOS;

  const results = [];
  const oosParts = [];
  for (let k = 0; k < folds; k++) {
    const oosStart = firstOOS + k * oosLen;
    const oosEnd = oosStart + oosLen;
    const isStart = anchored ? 0 : Math.max(0, oosStart - isLen);
    const isEnd = oosStart;                        // strictly before: no overlap
    if (isEnd - isStart < 50) continue;

    const isSlice = market.subarray(isStart, isEnd);
    const oosSlice = market.subarray(oosStart, oosEnd);

    const se = search(isSlice, fn, spec, { objective, ppy, bpsPerTurnover });
    if (!se.best) { results.push({ fold: k, ok: false, note: 'no valid parameter set in sample' }); continue; }

    const oos = runStrategy(oosSlice, fn, se.best.params, { ppy, bpsPerTurnover });
    const isScore = se.best.score;
    const oosScore = oos ? obj.get(oos) : NaN;

    // What the BEST-IN-HINDSIGHT choice would have scored on this same window --
    // the ceiling, and the gap to it is the cost of not knowing the future.
    const hindsight = search(oosSlice, fn, spec, { objective, ppy, bpsPerTurnover });

    results.push({
      fold: k, ok: true,
      isRange: [isStart, isEnd], oosRange: [oosStart, oosEnd],
      isLen: isEnd - isStart, oosLen,
      params: se.best.params,
      isScore, oosScore,
      hindsightScore: hindsight.best ? hindsight.best.score : NaN,
      hindsightParams: hindsight.best ? hindsight.best.params : null,
      oosResult: oos,
      isRankOfChosenOOS: oos && hindsight.ranked.length
        ? hindsight.ranked.findIndex(r => keyOf(r.params) === keyOf(se.best.params)) + 1
        : NaN,
      gridSize: se.tested,
    });
    if (oos) oosParts.push(oos.net);
  }

  const good = results.filter(r => r.ok && Number.isFinite(r.oosScore));
  if (!good.length) return { ok: false, note: 'no fold produced a usable out-of-sample result' };

  // the concatenated out-of-sample curve: the only unfitted equity curve here
  let total = 0;
  for (const p of oosParts) total += p.length;
  const stitched = new Float64Array(total);
  let off = 0;
  for (const p of oosParts) { stitched.set(p, off); off += p.length; }
  const stitchedStats = M.analyze(stitched, { ppy });

  const meanIS = S.mean(good.map(r => r.isScore));
  const meanOOS = S.mean(good.map(r => r.oosScore));
  const meanHind = S.mean(good.filter(r => Number.isFinite(r.hindsightScore)).map(r => r.hindsightScore));

  // Parameter stability: how far the chosen set moves between folds, as a
  // fraction of each parameter's own range. Jumping around is itself a finding.
  const keys = Object.keys(spec).sort();
  const drift = {};
  for (const k of keys) {
    const vals = good.map(r => r.params[k]).filter(Number.isFinite);
    const p = spec[k];
    const range = Array.isArray(p.values) ? (Math.max(...p.values) - Math.min(...p.values)) : (p.max - p.min);
    drift[k] = {
      values: vals,
      distinct: new Set(vals).size,
      sd: vals.length > 1 ? S.sd(vals) : 0,
      relSd: range > 0 && vals.length > 1 ? S.sd(vals) / range : 0,
    };
  }

  return {
    ok: true, folds: good.length, anchored, objective, isFraction,
    results, stitched, stitchedStats,
    meanIS, meanOOS, meanHindsight: meanHind,
    // Walk-forward efficiency: how much of the in-sample score survived. The
    // conventional bar is 50%, which is a convention, not a law.
    efficiency: meanIS !== 0 ? meanOOS / meanIS : NaN,
    oosPositive: good.filter(r => r.oosScore > 0).length,
    drift,
    gridSize: good[0] ? good[0].gridSize : 0,
  };
}

const keyOf = p => JSON.stringify(p, Object.keys(p).sort());

/** The control that matters: walk-forward a RANDOM parameter choice. If picking
 *  at random does as well as optimising, the optimisation found nothing. */
export function walkForwardRandomControl(market, fn, spec, opts = {}) {
  const { trials = 20, seed = 1, ppy = 252, bpsPerTurnover = 1, objective = 'sharpe' } = opts;
  const obj = OBJECTIVES[objective] || OBJECTIVES.sharpe;
  const grid = expandGrid(spec);
  const base = walkForward(market, fn, spec, opts);
  if (!base.ok) return { ok: false, note: base.note };

  const scores = [];
  for (let t = 0; t < trials; t++) {
    // deterministic pseudo-random pick, no RNG dependency in the signature
    let h = (seed + t * 2654435761) >>> 0;
    const pick = grid[h % grid.length];
    let acc = [];
    for (const r of base.results) {
      if (!r.ok) continue;
      const slice = market.subarray(r.oosRange[0], r.oosRange[1]);
      const res = runStrategy(slice, fn, pick, { ppy, bpsPerTurnover });
      if (res) acc.push(obj.get(res));
    }
    if (acc.length) scores.push(S.mean(acc));
  }
  return {
    ok: true, trials: scores.length, scores,
    mean: S.mean(scores), sd: S.sd(scores),
    max: Math.max(...scores), min: Math.min(...scores),
    optimisedOOS: base.meanOOS,
    beatsRandom: base.meanOOS > Math.max(...scores),
  };
}
