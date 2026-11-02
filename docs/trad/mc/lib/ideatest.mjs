/* ideatest.mjs -- one idea in, three robustness tests out, one verdict.
 *
 * The three answer genuinely different questions, and an idea has to survive all
 * of them:
 *
 *   1. WALK-FORWARD      does the PARAMETER CHOICE survive being re-picked out of
 *                        sample? (optimise on a window, trade the next one)
 *   2. SENSITIVITY       is the result a PLATEAU or a SPIKE? (nudge every
 *                        parameter and see whether the edge degrades or vanishes)
 *   3. MONTE CARLO       was the PATH luck? (resample the out-of-sample returns)
 *
 * Order matters. The Monte Carlo runs on the STITCHED WALK-FORWARD RETURNS, not
 * on the fitted in-sample curve -- that concatenated series is the only equity
 * curve in the project that was never fitted to, so it is the only one worth
 * resampling. Running the Monte Carlo on an in-sample curve just launders a
 * fitted result through a thousand pretty paths.
 *
 * The grid size becomes the trial count for the Deflated Sharpe automatically.
 * If you searched 240 combinations, you ran 240 trials, and the bar moves.
 */
import { search, runStrategy, expandGrid, defaultParams, OBJECTIVES } from './strategylab.mjs';
import { walkForward, walkForwardRandomControl } from './walkforward.mjs';
import { sensitivity } from './sensitivity.mjs';
import { detectLookahead } from './strategy.mjs';
import * as T from './tests.mjs';
import * as S from './stats.mjs';
import * as M from './metrics.mjs';

export function testIdea(market, fn, spec, opts = {}) {
  const {
    objective = 'sharpe', folds = 5, isFraction = 0.5, anchored = false,
    radius = 1, ppy = 252, bpsPerTurnover = 1, seed = 1,
    benchmark = null, randomTrials = 12, onProgress = null,
  } = opts;
  const step = (p, label) => onProgress && onProgress(p, label);

  const gridSize = expandGrid(spec).length;
  const out = { objective, gridSize, ppy, bpsPerTurnover, folds, isFraction, anchored };

  /* --- 0. does it cheat? nothing else means anything until this passes --- */
  step(0.02, 'checking for look-ahead');
  out.lookahead = detectLookaheadParam(fn, spec, ppy);

  /* --- 1. the full-sample fit: the number you would have quoted --- */
  step(0.08, 'searching the parameter grid');
  const full = search(market, fn, spec, { objective, ppy, bpsPerTurnover });
  out.fullSample = full.best
    ? { params: full.best.params, score: full.best.score, result: stripSeries(full.best.result),
        medianScore: S.quantile(full.scores, 0.5), positiveShare: full.scores.filter(v => v > 0).length / full.scores.length }
    : null;
  if (!out.fullSample) return { ...out, ok: false, note: 'no parameter set produced a usable result' };

  /* --- 2. walk-forward --- */
  step(0.2, 'walking forward');
  const wf = walkForward(market, fn, spec, { folds, isFraction, anchored, objective, ppy, bpsPerTurnover });
  out.walkForward = wf.ok ? {
    ...wf,
    stitched: undefined,
    stitchedStats: wf.stitchedStats ? stripSeries(wf.stitchedStats) : null,
    results: wf.results.map(r => ({ ...r, oosResult: r.oosResult ? stripSeries(r.oosResult) : null })),
  } : wf;

  step(0.5, 'testing a random parameter choice');
  out.randomControl = wf.ok
    ? walkForwardRandomControl(market, fn, spec, { folds, isFraction, anchored, objective, ppy, bpsPerTurnover, trials: randomTrials, seed })
    : { ok: false };

  /* --- 3. sensitivity around the full-sample choice --- */
  step(0.65, 'nudging every parameter');
  out.sensitivity = sensitivity(market, fn, spec, out.fullSample.params, { objective, radius, ppy, bpsPerTurnover });

  /* --- 4. the statistics, on the UNFITTED out-of-sample series --- */
  step(0.85, 'testing the out-of-sample series');
  if (wf.ok && wf.stitched && wf.stitched.length > 30) {
    out.oosReturns = Array.from(wf.stitched);
    out.verdictStats = T.verdict(wf.stitched, { ppy, trials: gridSize });
    out.oosMetrics = stripSeries(M.analyze(wf.stitched, { ppy }));
    out.nullTest = T.sharpeNull(wf.stitched, { iters: 3000, seed, ppy });
    out.nullTest.dist = undefined;              // keep the payload small
  }

  /* --- 5. against the benchmark, if one was supplied --- */
  if (benchmark && benchmark.length === market.length && wf.ok) {
    const parts = [];
    for (const r of wf.results) if (r.ok) parts.push(benchmark.subarray(r.oosRange[0], r.oosRange[1]));
    let len = 0; for (const p of parts) len += p.length;
    const bh = new Float64Array(len);
    let off = 0; for (const p of parts) { bh.set(p, off); off += p.length; }
    const bhStats = M.analyze(bh, { ppy });
    const excess = Float64Array.from(wf.stitched, (v, i) => v - bh[i]);
    const ex = M.analyze(excess, { ppy });
    out.benchmark = {
      stats: stripSeries(bhStats),
      oosSharpe: wf.stitchedStats.sharpe,
      excessSharpe: ex.sharpe, excessMeanBps: S.mean(excess) * 1e4,
      excessT: ex.tNeweyWest,
      excessP: 2 * (1 - S.normalCdf(Math.abs(ex.tNeweyWest))),
      beats: wf.stitchedStats.sharpe > bhStats.sharpe,
    };
  }

  step(0.97, 'scoring the gates');
  out.gates = scoreGates(out);
  out.ok = true;
  return out;
}

/** Look-ahead detection for a parameterised strategy: run it at its default
 *  parameters, since the rule's shape is what cheats, not the numbers. */
function detectLookaheadParam(fn, spec, ppy) {
  const d = defaultParams(spec);
  const wrapped = (market, pos, ctx) => fn(market, pos, { ...ctx, params: { ...d, ...ctx.params } });
  return detectLookahead(wrapped, { n: 260 });
}

const stripSeries = (r) => {
  if (!r) return r;
  const { net, gross, equity, dd, returns, ...rest } = r;
  return rest;
};

/* ---------------- the gates ---------------- */

function scoreGates(o) {
  const g = [];
  const add = (id, label, pass, detail, why) => g.push({ id, label, pass, detail, why });

  add('lookahead', 'Uses only past information',
      !!(o.lookahead && o.lookahead.clean),
      o.lookahead && o.lookahead.clean ? 'clean across 12 probes'
        : `sees ${o.lookahead ? o.lookahead.barsAhead : '?'} bar(s) ahead`,
      'A rule that reads the current bar will pass every other test here and lose money live. Nothing below means anything until this is clean.');

  const wf = o.walkForward;
  const wfOK = wf && wf.ok;
  add('wf_positive', 'Positive out of sample',
      !!(wfOK && wf.meanOOS > 0),
      wfOK ? `mean out-of-sample ${wf.meanOOS.toFixed(3)} across ${wf.folds} folds` : (wf?.note || 'did not run'),
      'The parameters were chosen on earlier data only. This is the score you would actually have earned.');

  add('wf_efficiency', 'Keeps at least half its in-sample score',
      !!(wfOK && Number.isFinite(wf.efficiency) && wf.efficiency >= 0.5),
      wfOK && Number.isFinite(wf.efficiency) ? `efficiency ${(wf.efficiency * 100).toFixed(0)}% (IS ${wf.meanIS.toFixed(2)} → OOS ${wf.meanOOS.toFixed(2)})` : 'n/a',
      'The gap between in-sample and out-of-sample is the part of the backtest that was fitting rather than finding. 50% is a convention, not a law.');

  add('wf_consistency', 'Works in most folds, not one',
      !!(wfOK && wf.oosPositive >= Math.ceil(wf.folds * 0.6)),
      wfOK ? `${wf.oosPositive} of ${wf.folds} folds positive` : 'n/a',
      'One good fold carrying four bad ones is an episode, not an edge.');

  const rc = o.randomControl;
  add('beats_random', 'Beats a random parameter choice',
      !!(rc && rc.ok && rc.optimisedOOS > rc.max),
      rc && rc.ok ? `optimised ${rc.optimisedOOS.toFixed(3)} vs best of ${rc.trials} random ${rc.max.toFixed(3)}` : 'n/a',
      'If picking parameters at random does as well, the optimisation found nothing. This is the control that closed the opening-range study.');

  const se = o.sensitivity;
  add('plateau', 'Sits on a plateau, not a spike',
      !!(se && se.ok && se.verdict.label !== 'spike'),
      se && se.ok ? `${se.verdict.label}: ${(se.plateauScore * 100).toFixed(0)}% of neighbours hold half the score` : 'n/a',
      'A real effect does not know what number you typed. If one step destroys it, it was a coincidence that landed on that setting.');

  add('no_edge_param', 'No parameter pinned at the edge of its range',
      !!(se && se.ok && se.anyAtEdge.length === 0),
      se && se.ok ? (se.anyAtEdge.length ? `at the edge: ${se.anyAtEdge.join(', ')}` : 'all parameters interior') : 'n/a',
      'A parameter resting on its boundary means the optimiser wanted to keep going and was stopped by your range, not by the data.');

  const v = o.verdictStats;
  add('deflated', 'Survives the number of combinations searched',
      !!(v && v.deflated && v.deflated.dsr > 0.95),
      v && v.deflated ? `Deflated Sharpe ${(v.deflated.dsr * 100).toFixed(0)}% after ${o.gridSize} combinations` : 'n/a',
      `Searching a grid IS multiple testing. The best of ${o.gridSize} combinations has a high bar to clear before it counts as evidence.`);

  add('resolvable', 'The sample could see an edge this size',
      !!(v && v.mdeRatio >= 1),
      v ? `observed edge is ${v.mdeRatio.toFixed(2)}× the minimum detectable effect` : 'n/a',
      'Below 1 the test was never able to resolve an effect this small, so neither a positive nor a null result means anything.');

  if (o.benchmark) {
    /* State the comparison the gate is actually making. Sharpe and excess return
     * can disagree -- a long-only rule that sits out half the time often has the
     * higher Sharpe and the lower return -- and reporting one while testing the
     * other is exactly the kind of quiet mismatch this whole project exists to
     * stop. Both are shown, and the gate requires BOTH. */
    const b = o.benchmark;
    const sharpeBeats = b.beats;
    const returnBeats = b.excessMeanBps > 0;
    add('beats_benchmark', 'Beats buying and holding',
        sharpeBeats && returnBeats,
        `Sharpe ${b.oosSharpe.toFixed(2)} vs ${b.stats.sharpe.toFixed(2)} (${sharpeBeats ? 'ahead' : 'behind'}), ` +
        `excess ${b.excessMeanBps >= 0 ? '+' : ''}${b.excessMeanBps.toFixed(2)} bps/period ` +
        `(t ${b.excessT.toFixed(2)}, p ${b.excessP < 0.001 ? '<0.001' : b.excessP.toFixed(3)})`,
        'The null that matters: beating zero only tests whether the market went up. Both the risk-adjusted and the absolute comparison have to go your way — a rule that is out of the market half the time can win on Sharpe while losing on money.');
  }

  const passed = g.filter(x => x.pass).length;
  return { gates: g, passed, total: g.length, allPassed: passed === g.length,
           blocking: g.find(x => !x.pass && x.id === 'lookahead') ? 'lookahead' : null };
}

/** A worked example that passes, and one that does not. */
export const IDEA_EXAMPLES = {
  momentum: {
    label: 'Time-series momentum',
    code: `// Declare the ranges the tester is allowed to search.
const PARAMS = {
  look: { min: 20, max: 250, step: 10, def: 120 },
};

function strategy(market, pos, ctx) {
  const w = ctx.params.look | 0;
  let sum = 0;
  for (let t = 0; t < ctx.n; t++) {
    // decided from bars strictly before t
    pos[t] = (t >= w && sum > 0) ? 1 : 0;
    sum += market[t];
    if (t >= w) sum -= market[t - w];
  }
}`,
  },
  crossover: {
    label: 'Moving-average crossover (two parameters)',
    code: `const PARAMS = {
  fast: { min: 5,  max: 60,  step: 5,  def: 20 },
  slow: { min: 50, max: 250, step: 25, def: 100 },
};

function strategy(market, pos, ctx) {
  const { fast, slow } = ctx.params;
  if (fast >= slow) { pos.fill(0); return; }   // invalid combination
  let sf = 0, ss = 0;
  for (let t = 0; t < ctx.n; t++) {
    pos[t] = (t > slow && sf / fast > ss / slow) ? 1 : 0;
    sf += market[t]; if (t >= fast) sf -= market[t - fast];
    ss += market[t]; if (t >= slow) ss -= market[t - slow];
  }
}`,
  },
  reversal: {
    label: 'Short-term reversal',
    code: `const PARAMS = {
  look:  { min: 1, max: 15, step: 1, def: 5 },
  scale: { values: [0.5, 1, 1.5] },
};

function strategy(market, pos, ctx) {
  const w = ctx.params.look | 0, k = ctx.params.scale;
  let sum = 0;
  for (let t = 0; t < ctx.n; t++) {
    pos[t] = t >= w ? (sum < 0 ? k : -k) : 0;
    sum += market[t]; if (t >= w) sum -= market[t - w];
  }
}`,
  },
  cheat: {
    label: 'Look-ahead (deliberately broken)',
    code: `const PARAMS = { look: { min: 5, max: 50, step: 5, def: 20 } };

// WRONG ON PURPOSE: market[t] is not known when pos[t] is set.
// Watch it pass walk-forward and sensitivity, and fail gate 1.
function strategy(market, pos, ctx) {
  for (let t = 0; t < ctx.n; t++) pos[t] = market[t] > 0 ? 1 : 0;
}`,
  },
};
