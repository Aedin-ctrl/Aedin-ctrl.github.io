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
import { search, runStrategy, expandGrid, defaultParams, OBJECTIVES, COST_PRESETS } from './strategylab.mjs';
import { RNG } from './rng.mjs';
import { walkForward, walkForwardRandomControl } from './walkforward.mjs';
import { sensitivity } from './sensitivity.mjs';
import { detectLookahead } from './strategy.mjs';
import * as T from './tests.mjs';
import * as S from './stats.mjs';
import * as M from './metrics.mjs';
import { report, compare, rolling } from './performance.mjs';
import { regimeAnalysis } from './regimes.mjs';

export function testIdea(market, fn, spec, opts = {}) {
  const {
    objective = 'sharpe', folds = 5, isFraction = 0.5, anchored = false,
    radius = 1, ppy = 252, bpsPerTurnover = 1, seed = 1,
    financingAnnual = 0, shortBorrowAnnual = 0, maxExposure = Infinity,
    benchmark = null, randomTrials = 12, onProgress = null,
    oosPeriods = null,          // test exactly this many periods (e.g. the last 5 years)
    dates = null,               // calendar dates, for the money report
    capital = 10000,            // starting capital, so results are in dollars
    alternatives = null,        // { label: returnsArray } to compare against
  } = opts;
  const costs = { bpsPerTurnover, financingAnnual, shortBorrowAnnual, maxExposure, ppy };
  const step = (p, label) => onProgress && onProgress(p, label);

  const gridSize = expandGrid(spec).length;
  const out = { objective, gridSize, ppy, bpsPerTurnover, financingAnnual, shortBorrowAnnual, folds, isFraction, anchored };

  /* --- 0. does it cheat? nothing else means anything until this passes --- */
  step(0.02, 'checking for look-ahead');
  out.lookahead = detectLookaheadParam(fn, spec, ppy);
  if (out.lookahead.error) {
    return { ...out, ok: false,
             note: `the strategy threw while running: ${out.lookahead.error}`,
             gates: { gates: [], passed: 0, total: 0, allPassed: false, blocking: null } };
  }

  /* --- 1. the full-sample fit: the number you would have quoted --- */
  step(0.08, 'searching the parameter grid');
  const full = search(market, fn, spec, { objective, ...costs });
  out.fullSample = full.best
    ? { params: full.best.params, score: full.best.score, result: stripSeries(full.best.result),
        medianScore: S.quantile(full.scores, 0.5), positiveShare: full.scores.filter(v => v > 0).length / full.scores.length }
    : null;
  if (!out.fullSample) {
    /* Say WHY. The usual cause is a rule that never changes position, which the
     * search refuses on purpose -- but "no usable result" tells the person
     * nothing about what to change. */
    const probe = runStrategy(market, fn, defaultParams(spec), { ...costs, minTrades: 0 });
    const note = !probe
      ? 'the strategy threw, or produced no finite positions, on every parameter set'
      : probe.trades === 0
        ? 'the strategy never changes position, so there is nothing to optimise or test. Write to `pos` and make it vary.'
        : 'no parameter set produced a usable result — every combination was rejected';
    return { ...out, ok: false, note,
             gates: { gates: [], passed: 0, total: 0, allPassed: false, blocking: null } };
  }

  /* --- 2. walk-forward --- */
  step(0.2, 'walking forward');
  const wf = walkForward(market, fn, spec, { folds, isFraction, anchored, objective, oosPeriods, ...costs });
  out.walkForward = wf.ok ? {
    ...wf,
    stitched: undefined,
    stitchedStats: wf.stitchedStats ? stripSeries(wf.stitchedStats) : null,
    results: wf.results.map(r => ({ ...r, oosResult: r.oosResult ? stripSeries(r.oosResult) : null })),
  } : wf;

  step(0.5, 'testing a random parameter choice');
  out.randomControl = wf.ok
    ? walkForwardRandomControl(market, fn, spec, { folds, isFraction, anchored, objective, oosPeriods, ...costs, trials: randomTrials, seed })
    : { ok: false };

  /* --- 3. sensitivity around the full-sample choice --- */
  step(0.65, 'nudging every parameter');
  out.sensitivity = sensitivity(market, fn, spec, out.fullSample.params, { objective, radius, ...costs });

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

  /* --- 6. execution stress: what happens when reality is worse than assumed --- *
   * The single most load-bearing assumption in any backtest is the cost, and it
   * is always a guess. So rather than defend one number, re-run the out-of-sample
   * folds across a range of them and show where the result dies. A rule that only
   * works at the cost you assumed is not a rule, it is a cost estimate. */
  step(0.9, 'stressing the execution assumptions');
  if (wf.ok) out.stress = executionStress(market, fn, wf, { objective, ppy, bpsPerTurnover, seed });

  const fsr = out.fullSample.result;
  out.profile = {
    usesShorts: !!fsr.usesShorts, usesLeverage: !!fsr.usesLeverage,
    maxExposure: fsr.maxExposure, turnoverPerPeriod: fsr.turnoverPerPeriod,
    tradesPerYear: fsr.turnoverPerPeriod * ppy,
    financingCharged: financingAnnual > 0, borrowCharged: shortBorrowAnnual > 0,
  };

  /* --- 7. the money, the regimes, and the comparisons --- *
   * Everything from here answers "what would this have done to an account",
   * which is a different question from "is the edge real" and needs the
   * out-of-sample slice of the calendar, not the whole history. */
  if (wf.ok && dates && wf.stitched && wf.stitched.length) {
    const folds2 = wf.results.filter(r => r.ok);
    const lo = folds2[0].oosRange[0], hi = folds2[folds2.length - 1].oosRange[1];
    const oosDates = dates.slice(lo, hi);
    out.window = { from: oosDates[0], to: oosDates[oosDates.length - 1], n: oosDates.length,
                   trainFrom: dates[0], trainTo: dates[Math.max(0, lo - 1)], trainPeriods: wf.trainPeriods };

    step(0.92, 'working out the money');
    out.money = stripBig(report(wf.stitched, oosDates, { capital, ppy, label: 'strategy' }));
    out.equityCurve = Array.from(report(wf.stitched, oosDates, { capital, ppy }).equity);
    out.oosDates = oosDates;

    if (benchmark) {
      const bOOS = Float64Array.from(benchmark.slice(lo, hi));
      const cmp = compare(wf.stitched, bOOS, oosDates, { capital, ppy });
      out.comparison = { ...cmp, strategy: stripBig(cmp.strategy), benchmark: stripBig(cmp.benchmark) };
      out.benchmarkCurve = Array.from(report(bOOS, oosDates, { capital, ppy }).equity);

      step(0.94, 'splitting by market regime');
      out.regimes = regimeAnalysis(wf.stitched, bOOS, oosDates, { ppy });
      out.rolling = {
        strategy: rolling(wf.stitched, Math.min(252, Math.floor(wf.stitched.length / 3))),
        benchmark: rolling(bOOS, Math.min(252, Math.floor(bOOS.length / 3))),
        window: Math.min(252, Math.floor(wf.stitched.length / 3)),
      };
    }

    if (alternatives) {
      step(0.95, 'comparing against the alternatives');
      out.alternatives = Object.entries(alternatives).map(([label, series]) => {
        const alt = Float64Array.from(series.slice(lo, hi));
        const rep = report(alt, oosDates, { capital, ppy, label });
        return { label, ...stripBig(rep), curve: downsample(Array.from(rep.equity), 400) };
      });
    }
  }

  step(0.97, 'scoring the gates');
  out.gates = scoreGates(out);
  out.ok = true;
  /* One structural guarantee at the boundary: no non-finite number leaves here.
   * Individual fields are legitimately undefined -- a Calmar ratio with no
   * drawdown, a step to a neighbour that does not exist -- and each becomes
   * null, which survives JSON, crosses a worker boundary intact, and routes
   * through Number.isFinite() the way the consumers already expect. The gates
   * are scored above, on the live values, so nothing is lost. */
  return finiteOnly(out);
}

/** Deep-convert every non-finite number to null. Returns a new object. */
export function finiteOnly(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v == null || typeof v !== 'object') return v;
  if (ArrayBuffer.isView(v)) return Array.from(v, x => (Number.isFinite(x) ? x : null));
  if (Array.isArray(v)) return v.map(finiteOnly);
  const o = {};
  for (const k of Object.keys(v)) o[k] = finiteOnly(v[k]);
  return o;
}

/** Re-run every out-of-sample fold under harsher execution assumptions.
 *  Each row keeps the SAME parameters the walk-forward chose -- only the
 *  frictions change -- so the degradation is attributable to cost alone. */
export function executionStress(market, fn, wf, opts = {}) {
  const { objective = 'sharpe', ppy = 252, bpsPerTurnover = 1, seed = 1 } = opts;
  const obj = OBJECTIVES[objective] || OBJECTIVES.sharpe;
  const folds = wf.results.filter(r => r.ok);
  if (!folds.length) return null;

  const scenarios = [
    { id: 'assumed', label: `As assumed (${bpsPerTurnover}bp)`, mult: 1, skip: 0, slipSd: 0 },
    { id: 'double', label: 'Twice the cost', mult: 2, skip: 0, slipSd: 0 },
    { id: 'triple', label: 'Three times the cost', mult: 3, skip: 0, slipSd: 0 },
    { id: 'five', label: 'Five times the cost', mult: 5, skip: 0, slipSd: 0 },
    { id: 'miss5', label: 'Miss 5% of trades', mult: 1, skip: 0.05, slipSd: 0 },
    { id: 'miss15', label: 'Miss 15% of trades', mult: 1, skip: 0.15, slipSd: 0 },
    { id: 'slip', label: 'Variable slippage (+/-2bp)', mult: 1, skip: 0, slipSd: 2 },
    { id: 'all', label: 'Twice the cost, 10% missed, variable slippage', mult: 2, skip: 0.10, slipSd: 2 },
  ];

  const rows = scenarios.map(sc => {
    const scores = [];
    for (const f of folds) {
      const slice = market.subarray(f.oosRange[0], f.oosRange[1]);
      // a fixed stream per (scenario, fold) so the table is reproducible
      const rng = new RNG((seed ^ hash(sc.id)) >>> 0, f.fold);
      const r = runStressed(slice, fn, f.params, {
        ppy, bpsPerTurnover: bpsPerTurnover * sc.mult,
        skipProb: sc.skip, slipSdBps: sc.slipSd, rng,
      });
      if (r) scores.push(obj.get(r));
    }
    return { ...sc, score: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : NaN,
             folds: scores.length };
  });

  const assumed = rows[0].score;
  // the cost at which the edge reaches zero, by interpolating the cost ladder
  const ladder = rows.filter(r => r.skip === 0 && r.slipSd === 0);
  let breakEvenMult = null;
  for (let i = 1; i < ladder.length; i++) {
    if (ladder[i - 1].score > 0 && ladder[i].score <= 0) {
      const t = ladder[i - 1].score / (ladder[i - 1].score - ladder[i].score);
      breakEvenMult = ladder[i - 1].mult + t * (ladder[i].mult - ladder[i - 1].mult);
      break;
    }
  }
  /* `null` means "no break-even inside the tested range", not Infinity. Infinity
   * does not survive JSON, and relying on Number.isFinite(null) being false to
   * route the right branch afterwards works only by coincidence. With null the
   * invariant "no non-finite number ever leaves the engine" is simply true, and
   * can be asserted. */
  if (breakEvenMult === null && ladder[0].score <= 0) breakEvenMult = 0;
  const beyondRange = breakEvenMult === null;

  /* Does SKIPPING trades help? If randomly missing a share of the trades improves
   * the result, the trades are on net harmful and the signal is not adding value.
   * It is a blunt diagnostic and a very hard one to argue with. */
  /* Only the PURE skip scenarios count here. The combined row also doubles the
   * cost and adds slippage, so including it confounds the diagnostic and hides
   * exactly the case it exists to catch. */
  const miss = rows.filter(r => r.skip > 0 && r.mult === 1 && r.slipSd === 0);
  const skipHelps = miss.length > 0 && miss.every(r => r.score > assumed);
  const bestMiss = miss.length ? miss.reduce((a, b) => (b.score > a.score ? b : a)) : null;

  // "survives 2x" means it keeps a meaningful share of its score, not merely a
  // positive sign: 0.02 at five times the cost is not survival.
  /* Purely relative: does doubling the cost keep most of the score? Whether the
   * score is worth having at all is what the significance and benchmark gates are
   * for -- an absolute threshold here would also be wrong for Calmar or CAGR. */
  const at2 = ladder.find(r => r.mult === 2);
  const holdsAt2 = !!(at2 && assumed > 0 && at2.score > 0 && at2.score >= assumed * 0.5);

  return { rows, assumed, breakEvenMult, beyondRange,
           assumedBps: bpsPerTurnover,
           breakEvenBps: beyondRange ? null : breakEvenMult * bpsPerTurnover,
           maxTestedMult: ladder[ladder.length - 1].mult,
           skipHelps, bestMiss, holdsAt2 };
}

function hash(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/** runStrategy with stochastic execution layered on: missed trades and slippage
 *  dispersion, both floored so execution is never a gift. */
function runStressed(market, fn, params, opts) {
  const { ppy, bpsPerTurnover, skipProb, slipSdBps, rng } = opts;
  const n = market.length;
  const pos = new Float64Array(n);
  try { fn(market, pos, { n, ppy, params: { ...params }, random: () => 0.5 }); } catch { return null; }
  const c = bpsPerTurnover / 1e4;
  const net = new Float64Array(n);
  let prev = 0;
  for (let t = 0; t < n; t++) {
    let p = Number.isFinite(pos[t]) ? pos[t] : 0;
    if (skipProb > 0 && rng.u() < skipProb) p = prev;      // the trade never happened
    const d = Math.abs(p - prev);
    let r = p * market[t] - d * c;
    if (slipSdBps > 0 && d > 0) r -= d * Math.max(0, slipSdBps * rng.normal()) / 1e4;
    net[t] = r;
    prev = p;
  }
  return M.analyze(net, { ppy });
}

/** Look-ahead detection for a parameterised strategy: run it at its default
 *  parameters, since the rule's shape is what cheats, not the numbers. */
function detectLookaheadParam(fn, spec, ppy) {
  const d = defaultParams(spec);
  const wrapped = (market, pos, ctx) => fn(market, pos, { ...ctx, params: { ...d, ...ctx.params } });
  return detectLookahead(wrapped, { n: 260 });
}

/** Strip the heavy arrays before the payload crosses a worker boundary. */
function stripBig(r) {
  if (!r) return r;
  /* `years` on a report is the DURATION in years, a number. The per-calendar-year
   * buckets are `yearly`. Collapsing the two names turned mo.years into an array
   * and broke mo.years.toFixed(), which is the sort of thing that only shows up
   * when something tries to format it. */
  const { equity, drawdownDollars, dollarDaily, months, years_, ...rest } = r;
  return { ...rest,
    months: (months || []).map(m => ({ key: m.key, ret: m.ret, pnl: m.pnl, n: m.n })),
    yearly: (years_ || []).map(y => ({ key: y.key, ret: y.ret, pnl: y.pnl, n: y.n,
                                       startEquity: y.startEquity, endEquity: y.endEquity })),
    drawdownDollars: downsample(Array.from(drawdownDollars || []), 600),
  };
}
function downsample(arr, max) {
  if (arr.length <= max) return arr;
  const step = arr.length / max, out = [];
  for (let i = 0; i < max; i++) out.push(arr[Math.floor(i * step)]);
  out.push(arr[arr.length - 1]);
  return out;
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

  if (o.profile) {
    const p = o.profile;
    const needsFin = p.usesLeverage && !p.financingCharged;
    const needsBorrow = p.usesShorts && !p.borrowCharged;
    add('priced_properly', 'Its leverage and shorts are paid for',
        !needsFin && !needsBorrow,
        needsFin || needsBorrow
          ? `holds up to ${p.maxExposure.toFixed(1)}x${p.usesShorts ? ' and goes short' : ''}, ` +
            `but ${[needsFin ? 'financing' : null, needsBorrow ? 'borrow' : null].filter(Boolean).join(' and ')} ` +
            `${needsFin && needsBorrow ? 'are' : 'is'} set to zero`
          : (p.usesLeverage || p.usesShorts
              ? `${p.maxExposure.toFixed(1)}x max exposure, financed and borrowed at the stated rates`
              : 'long-only and unlevered, so neither applies'),
        'Borrowed exposure costs money and borrowing shares costs money. A rule that levers or shorts for free is being handed a subsidy no broker offers.');
  }

  const st = o.stress;
  if (st) {
    add('cost_headroom', 'Survives costs being worse than assumed',
        st.holdsAt2,
        `at twice the ${st.assumedBps}bp assumed it scores ` +
        `${Number.isFinite(st.rows[1].score) ? st.rows[1].score.toFixed(3) : '--'} against ${st.assumed.toFixed(3)}` +
        (st.beyondRange ? `; still positive at ${st.maxTestedMult}x the assumption` : `; zero at ${st.breakEvenBps.toFixed(1)}bp`),
        'The cost is always a guess, and it is the most load-bearing number in any backtest. A rule that only works at exactly the cost you assumed is not a rule, it is a cost estimate. Keeping a positive sign is not enough — it has to keep most of its score.');

    add('trades_help', 'Its trades actually add value',
        !st.skipHelps,
        st.skipHelps
          ? `randomly skipping trades IMPROVES it (${st.bestMiss.label.toLowerCase()} scores ${st.bestMiss.score.toFixed(3)} against ${st.assumed.toFixed(3)})`
          : 'skipping trades makes it worse, as it should',
        'If missing a random share of the trades improves the result, the trades are on net harmful and the signal is subtracting value rather than adding it. Hard to argue with, and easy to miss.');
  }

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
