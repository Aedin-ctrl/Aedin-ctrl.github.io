/* engine.mjs -- turn generated gross returns into the money you would actually keep.
 *
 * The order of operations matters and is fixed here deliberately:
 *
 *     gross return  ->  position sizing  ->  trading cost  ->  financing  ->
 *     absorbing ruin check  ->  compounding  ->  tax at the year boundary
 *
 * Two rules are load-bearing:
 *   - Sizing may only use information from BEFORE the bar it sizes. The volatility
 *     estimator updates after the return is applied, never before. A one-bar slip
 *     here is a look-ahead that manufactures Sharpe out of nothing.
 *   - Ruin is absorbing (see metrics.mjs). A levered path that crosses zero stays
 *     dead; it does not trade its way back.
 */
import { PathWalker } from './metrics.mjs';
import { RNG } from './rng.mjs';
import { makeGenerator } from './generators.mjs';

export const SIZING = {
  fixed: { label: 'Fixed leverage', blurb: 'The same multiple of the signal every bar. Simple, and the only one with no estimation error of its own.' },
  voltarget: { label: 'Volatility target', blurb: 'Scale position to hold annualised volatility near a target, using a trailing estimate. Cuts size into turbulence, which flatters drawdowns and costs turnover.' },
  kelly: { label: 'Kelly fraction', blurb: 'Size at a fraction of mu/sigma^2. Full Kelly maximises long-run growth and is far too violent to hold; the fraction is the real decision.' },
};

export const DEFAULT_COSTS = {
  bpsPerPeriod: 0,       // flat drag per period, in basis points
  bpsPerTurnover: 0,     // bps charged on |change in position| (strategy mode)
  financingAnnual: 0,    // cost of borrowed exposure above 1x, annualised
  shortBorrowAnnual: 0,  // extra cost of negative exposure, annualised
  taxRate: 0,
  taxMode: 'net',        // 'net' = annual net gains, 'gross' = every winning year's gross
};

/** Kelly leverage for a return stream: f* = mu / sigma^2 (per period).
 *  Reported per period because that is the only form that composes with the
 *  simulation; the annualised version is the same number. */
export function kellyLeverage(mu, variance) {
  if (!(variance > 0)) return 0;
  return mu / variance;
}

/** Apply sizing + costs to one path of gross returns, writing net returns into `net`.
 *
 *  `stratPos` is the attached strategy's position per bar, if any. Costs are charged
 *  ONCE, on the EFFECTIVE exposure (sizing x strategy position) -- that is the thing
 *  actually held, and therefore the thing actually paid for. Charging turnover
 *  separately inside the strategy loop and again here double-billed every entry.
 *  Returns the number of periods simulated (always gross.length). */
export function applySizing(gross, net, cfg, stratPos = null) {
  const n = gross.length;
  const sz = cfg.sizing || {};
  const mode = sz.mode || 'fixed';
  const maxLev = sz.maxLeverage ?? 10;
  const c = { ...DEFAULT_COSTS, ...(cfg.costs || {}) };
  const ppy = cfg.ppy || 252;

  const drag = c.bpsPerPeriod / 1e4;
  const turnCost = c.bpsPerTurnover / 1e4;
  const finPer = c.financingAnnual / 100 / ppy;
  const borrowPer = c.shortBorrowAnnual / 100 / ppy;

  let lev = mode === 'kelly'
    ? Math.max(-maxLev, Math.min(maxLev, (sz.kellyFraction ?? 0.5) * (sz.kellyFull ?? 0)))
    : (sz.leverage ?? 1);

  // EWMA variance for the vol target. lambda from the half-life, in periods.
  const hl = Math.max(2, sz.volWindow ?? 60);
  const lambda = Math.pow(0.5, 1 / hl);
  const targetVar = Math.pow((sz.targetVol ?? 0.15) / Math.sqrt(ppy), 2);
  let ewma = sz.seedVar ?? targetVar;     // seeded at target so bar 1 sizes at 1x
  let warm = 0;

  let prevExp = 0;
  for (let i = 0; i < n; i++) {
    let pos;
    if (mode === 'voltarget') {
      // ewma holds information from bars < i only. This is the look-ahead guard.
      const v = warm >= 2 ? ewma : targetVar;
      pos = Math.sqrt(targetVar / Math.max(v, 1e-18));
      pos = Math.max(-maxLev, Math.min(maxLev, pos * (sz.leverage ?? 1)));
    } else {
      pos = lev;
    }

    const g = gross[i];
    let r = pos * g;

    // `gross` already contains stratPos[i] * market[i], so the exposure actually
    // held this bar is the product of the two.
    const exp = stratPos ? pos * stratPos[i] : pos;

    if (turnCost > 0) r -= Math.abs(exp - prevExp) * turnCost;
    if (drag > 0) r -= Math.abs(exp) * drag;
    if (finPer > 0 && exp > 1) r -= (exp - 1) * finPer;
    if (borrowPer > 0 && exp < 0) r -= (-exp) * borrowPer;

    net[i] = r;
    prevExp = exp;

    // update the estimator AFTER the bar -- never before
    ewma = lambda * ewma + (1 - lambda) * g * g;
    warm++;
  }
  return n;
}

/** Walk net returns into equity, charging tax at each year boundary. */
export function walkWithTax(net, cfg, walker) {
  const ppy = cfg.ppy || 252;
  const c = { ...DEFAULT_COSTS, ...(cfg.costs || {}) };
  const rate = c.taxRate / 100;
  const n = net.length;
  if (!(rate > 0)) {
    for (let i = 0; i < n; i++) walker.step(net[i]);
    return;
  }
  let yearStart = walker.eq;
  let grossWin = 0;
  for (let i = 0; i < n; i++) {
    walker.step(net[i]);
    if (net[i] > 0) grossWin += net[i];
    if ((i + 1) % ppy === 0 || i === n - 1) {
      // 'net': tax the year's net gain. 'gross': tax every winning period, even if
      // the year as a whole lost money -- which is how some jurisdictions treat
      // gambling-style winnings, and it changes the answer a lot.
      const base = c.taxMode === 'gross' ? grossWin * yearStart : Math.max(0, walker.eq - yearStart);
      const bill = rate * base;
      if (bill > 0 && walker.eq > 0) {
        const frac = Math.min(1, bill / walker.eq);
        walker.step(-frac);
      }
      yearStart = walker.eq;
      grossWin = 0;
    }
  }
}

/** Metrics kept per path. Order matters: the worker returns parallel Float32Arrays. */
export const PATH_METRICS = [
  'terminal', 'logGrowth', 'cagr', 'maxDD', 'sharpe', 'sortino', 'vol',
  'calmar', 'ulcer', 'timeUnderwater', 'maxDDDuration', 'winRate',
  'profitFactor', 'worstStreak', 'ruinStep', 'worst',
];

const F32 = (n) => new Float32Array(n);

/** Run a contiguous block of paths. Pure: given the same config and the same
 *  [lo, hi) it returns the same numbers on any machine, any worker count. */
export function runBatch(cfg, lo, hi, onProgress) {
  const n = cfg.horizon;
  const count = hi - lo;
  const ppy = cfg.ppy || 252;
  const source = cfg.source ? Float64Array.from(cfg.source) : null;
  const fill = makeGenerator(cfg.model.id, cfg.model.params, source);
  const strat = cfg.strategyFn || null;

  const gross = new Float64Array(n);
  const net = new Float64Array(n);
  const posBuf = strat ? new Float64Array(n) : null;

  const out = {};
  for (const k of PATH_METRICS) out[k] = F32(count);
  out.ruined = new Uint8Array(count);

  // equity band grid: a downsampled log-equity curve per path, for the fan chart
  const G = Math.max(2, Math.min(cfg.gridPoints ?? 120, n + 1));
  const gridIdx = new Int32Array(G);
  for (let i = 0; i < G; i++) gridIdx[i] = Math.round(i * n / (G - 1));
  const keepBands = Math.min(count, cfg.bandPaths ?? count);
  const band = F32(keepBands * G);

  // a handful of complete paths, kept for the "sample paths" overlay
  const keepFull = Math.min(count, cfg.keepPaths ?? 0);
  const fullPaths = keepFull ? [] : null;

  // leverage ladder: evaluate the SAME gross path at many leverages. Almost free,
  // and it is what makes the growth/ruin-vs-leverage curve trustworthy -- every
  // point on it sees identical markets.
  const ladder = cfg.ladder && cfg.ladder.length ? Float64Array.from(cfg.ladder) : null;
  const ladderOut = ladder ? {
    logGrowth: new Float64Array(ladder.length),
    logGrowthSq: new Float64Array(ladder.length),
    maxDD: new Float64Array(ladder.length),
    ruin: new Float64Array(ladder.length),
    median: Array.from(ladder, () => F32(count)),   // NOT ladder.map: that returns a Float64Array
    n: count,
  } : null;

  for (let p = lo; p < hi; p++) {
    const i = p - lo;
    const rng = new RNG(cfg.seed, p);          // path p <-> stream p, always
    fill(gross, rng);

    let useGross = gross;
    if (strat) {
      // the strategy sees the market path and returns a position per bar
      useGross = strategyReturns(gross, posBuf, net, strat, cfg, rng);
    }

    applySizing(useGross, net, cfg, strat ? posBuf : null);
    const w = new PathWalker({ start: 1, ruinAt: cfg.ruinAt ?? 0 });
    walkWithTax(net, cfg, w);
    const m = w.finish(ppy);

    for (const k of PATH_METRICS) {
      const v = m[k];
      out[k][i] = Number.isFinite(v) ? v : (v === Infinity ? 3.4e38 : (v === -Infinity ? -3.4e38 : NaN));
    }
    out.ruined[i] = m.ruined ? 1 : 0;

    if (i < keepBands) {
      // recompute the equity curve on the grid without storing the whole path
      let eq = 1, dead = false, gi = 0;
      if (gridIdx[0] === 0) band[i * G + gi++] = 0;
      for (let t = 0; t < n; t++) {
        if (!dead) { eq *= 1 + net[t]; if (!(eq > 0)) { eq = 0; dead = true; } }
        while (gi < G && gridIdx[gi] === t + 1) band[i * G + gi++] = eq > 0 ? Math.log(eq) : -50;
      }
      while (gi < G) band[i * G + gi++] = eq > 0 ? Math.log(eq) : -50;
    }
    if (fullPaths && i < keepFull) fullPaths.push(Float32Array.from(net));

    if (ladder) {
      for (let L = 0; L < ladder.length; L++) {
        const lw = new PathWalker({ start: 1, ruinAt: cfg.ruinAt ?? 0 });
        const lv = ladder[L];
        const c = { ...DEFAULT_COSTS, ...(cfg.costs || {}) };
        const finPer = c.financingAnnual / 100 / ppy;
        const drag = c.bpsPerPeriod / 1e4;
        let prevE = 0;
        const turn = (cfg.costs?.bpsPerTurnover ?? 0) / 1e4;
        for (let t = 0; t < n; t++) {
          let r = lv * useGross[t];
          const e = strat ? lv * posBuf[t] : lv;
          if (turn > 0) r -= Math.abs(e - prevE) * turn;
          if (drag > 0) r -= Math.abs(e) * drag;
          if (finPer > 0 && e > 1) r -= (e - 1) * finPer;
          lw.step(r);
          prevE = e;
        }
        const lm = lw.finish(ppy);
        const lg = Number.isFinite(lm.logGrowth) ? lm.logGrowth : -50;
        ladderOut.logGrowth[L] += lg;
        ladderOut.logGrowthSq[L] += lg * lg;
        ladderOut.maxDD[L] += lm.maxDD;
        ladderOut.ruin[L] += lm.ruined ? 1 : 0;
        ladderOut.median[L][i] = lg;
      }
    }

    if (onProgress && (i & 255) === 255) onProgress(i + 1, count);
  }

  return { lo, hi, count, metrics: out, band, bandPaths: keepBands, grid: Array.from(gridIdx), G, fullPaths, ladder: ladderOut };
}

/** Run an attached strategy over one simulated market path and return its GROSS
 *  returns. Costs are deliberately not charged here -- applySizing does that once,
 *  on the effective exposure, so an entry is never billed twice. */
function strategyReturns(market, pos, scratch, strat, cfg, rng) {
  const n = market.length;
  const ctx = {
    n, ppy: cfg.ppy || 252,
    random: () => rng.u(),
    params: cfg.strategyParams || {},
  };
  pos.fill(0);
  strat(market, pos, ctx);
  for (let t = 0; t < n; t++) {
    // a strategy's position at bar t multiplies the return OF bar t; the strategy
    // contract says pos[t] must be decided from market[0..t-1] only.
    const p = Number.isFinite(pos[t]) ? pos[t] : 0;
    pos[t] = p;
    scratch[t] = p * market[t];
  }
  return scratch;
}

/** Merge batch results from several workers into one. Order-independent. */
export function mergeBatches(batches, cfg) {
  batches = batches.slice().sort((a, b) => a.lo - b.lo);
  const total = batches.reduce((a, b) => a + b.count, 0);
  const metrics = {};
  for (const k of PATH_METRICS) metrics[k] = new Float32Array(total);
  metrics.ruined = new Uint8Array(total);
  let off = 0;
  for (const b of batches) {
    for (const k of PATH_METRICS) metrics[k].set(b.metrics[k], off);
    metrics.ruined.set(b.metrics.ruined, off);
    off += b.count;
  }
  const G = batches[0].G;
  const bandTotal = batches.reduce((a, b) => a + b.bandPaths, 0);
  const band = new Float32Array(bandTotal * G);
  let bo = 0;
  for (const b of batches) { band.set(b.band.subarray(0, b.bandPaths * G), bo * G); bo += b.bandPaths; }
  const fullPaths = batches.flatMap(b => b.fullPaths || []);

  let ladder = null;
  if (batches[0].ladder) {
    const K = batches[0].ladder.logGrowth.length;
    ladder = {
      logGrowth: new Float64Array(K), logGrowthSq: new Float64Array(K),
      maxDD: new Float64Array(K), ruin: new Float64Array(K),
      median: Array.from({ length: K }, () => new Float32Array(total)), n: total,
    };
    let lo2 = 0;
    for (const b of batches) {
      for (let L = 0; L < K; L++) {
        ladder.logGrowth[L] += b.ladder.logGrowth[L];
        ladder.logGrowthSq[L] += b.ladder.logGrowthSq[L];
        ladder.maxDD[L] += b.ladder.maxDD[L];
        ladder.ruin[L] += b.ladder.ruin[L];
        ladder.median[L].set(b.ladder.median[L], lo2);
      }
      lo2 += b.count;
    }
  }
  return { count: total, metrics, band, bandPaths: bandTotal, G, grid: batches[0].grid, fullPaths, ladder };
}
