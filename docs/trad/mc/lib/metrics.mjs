/* metrics.mjs -- turn a return stream into the numbers people argue about.
 *
 * One rule dominates this file: RUIN IS ABSORBING. If equity reaches zero it stays
 * at zero. A levered path can produce 1 + L*r <= 0, and the naive thing -- letting
 * equity go negative and then multiply back up through another negative -- resurrects
 * dead accounts and quietly turns a strategy that blows up into one that "recovers".
 * Every function here clamps at the floor and sets a ruin flag that the caller can
 * see. It is tested in t_metrics.mjs with a deliberately ruinous path.
 */
import { mean, variance, sorted, quantileSorted, moments, neweyWestVar } from './stats.mjs';

export const PPY = { daily: 252, weekly: 52, monthly: 12, quarterly: 4, annual: 1, hourly: 252 * 6.5, minute: 252 * 390, trade: 252 };

/** Streaming path accumulator: equity, drawdown and the moments, without storing the path. */
export class PathWalker {
  /**
   * @param {object} o
   * @param {number} o.start        starting equity
   * @param {number} o.ruinAt       equity fraction counted as ruin (0.3 => down 70%)
   * @param {number} o.floor        equity level treated as dead (default 0)
   */
  constructor({ start = 1, ruinAt = 0, floor = 0 } = {}) {
    this.start = start;
    this.eq = start;
    this.peak = start;
    this.ruinLevel = start * ruinAt;
    this.floor = floor;
    this.maxDD = 0;
    this.ddSumSq = 0;          // for the ulcer index
    this.n = 0;
    this.under = 0;            // periods spent below the running peak
    this.ddStart = -1;
    this.maxDDDur = 0;         // longest stretch underwater, in periods
    this.curDDDur = 0;
    this.ruined = false;
    this.ruinStep = -1;
    this.sum = 0; this.sumSq = 0;
    this.sumDown = 0; this.nDown = 0;
    this.wins = 0; this.grossWin = 0; this.grossLoss = 0;
    this.best = -Infinity; this.worst = Infinity;
    this.streak = 0; this.worstStreak = 0;
  }

  /** Apply one period's net return. Returns the new equity. */
  step(r) {
    this.n++;
    if (this.ruined) { this.curDDDur++; if (this.curDDDur > this.maxDDDur) this.maxDDDur = this.curDDDur; this.under++; return this.eq; }

    this.sum += r; this.sumSq += r * r;
    if (r < 0) { this.sumDown += r * r; this.nDown++; this.grossLoss -= r; this.streak++; if (this.streak > this.worstStreak) this.worstStreak = this.streak; }
    else { this.wins++; this.grossWin += r; this.streak = 0; }
    if (r > this.best) this.best = r;
    if (r < this.worst) this.worst = r;

    let eq = this.eq * (1 + r);
    // The absorbing floor. Without this a levered path can cross zero and come back.
    if (!(eq > this.floor)) {
      eq = this.floor;
      this.ruined = true;
      this.ruinStep = this.n;
    }
    this.eq = eq;

    if (eq > this.peak) { this.peak = eq; this.curDDDur = 0; }
    else { this.curDDDur++; if (this.curDDDur > this.maxDDDur) this.maxDDDur = this.curDDDur; this.under++; }

    const dd = this.peak > 0 ? (this.peak - eq) / this.peak : 1;
    if (dd > this.maxDD) this.maxDD = dd;
    this.ddSumSq += dd * dd;

    // A separate, softer definition of ruin: "I would have stopped trading here."
    if (!this.ruined && this.ruinLevel > 0 && eq <= this.ruinLevel) { this.ruined = true; this.ruinStep = this.n; }
    return eq;
  }

  /** Collapse into the summary record every chart reads from. */
  finish(ppy = 252) {
    const n = this.n;
    const eq = this.eq;
    const totalRet = eq / this.start - 1;
    const years = n / ppy;
    // CAGR of a dead account is -100%, not NaN or a complex root.
    const cagr = eq <= 0 ? -1 : (years > 0 ? Math.pow(eq / this.start, 1 / years) - 1 : 0);
    const m = n ? this.sum / n : 0;
    const v = n > 1 ? (this.sumSq - n * m * m) / (n - 1) : 0;
    const s = Math.sqrt(Math.max(v, 0));
    const dsd = this.n ? Math.sqrt(this.sumDown / n) : 0;   // downside deviation vs 0
    const logEq = eq > 0 ? Math.log(eq / this.start) : -Infinity;
    return {
      terminal: eq,
      totalReturn: totalRet,
      logGrowth: logEq,
      cagr,
      vol: s * Math.sqrt(ppy),
      sharpe: s > 0 ? (m / s) * Math.sqrt(ppy) : 0,
      sortino: dsd > 0 ? (m / dsd) * Math.sqrt(ppy) : (m > 0 ? Infinity : 0),
      maxDD: this.maxDD,
      maxDDDuration: this.maxDDDur,
      timeUnderwater: n ? this.under / n : 0,
      ulcer: n ? Math.sqrt(this.ddSumSq / n) : 0,
      calmar: this.maxDD > 1e-12 ? cagr / this.maxDD : (cagr > 0 ? Infinity : 0),
      martin: this.ddSumSq > 0 ? cagr / Math.sqrt(this.ddSumSq / n) : 0,
      winRate: n ? this.wins / n : 0,
      profitFactor: this.grossLoss > 0 ? this.grossWin / this.grossLoss : (this.grossWin > 0 ? Infinity : 0),
      best: this.best === -Infinity ? 0 : this.best,
      worst: this.worst === Infinity ? 0 : this.worst,
      worstStreak: this.worstStreak,
      ruined: this.ruined,
      ruinStep: this.ruinStep,
      n,
    };
  }
}

/** Build an equity curve from net returns, with the same absorbing floor. */
export function equityCurve(rets, start = 1, floor = 0) {
  const n = rets.length, eq = new Float64Array(n + 1);
  eq[0] = start;
  let e = start, dead = false;
  for (let i = 0; i < n; i++) {
    if (!dead) {
      e = e * (1 + rets[i]);
      if (!(e > floor)) { e = floor; dead = true; }
    }
    eq[i + 1] = e;
  }
  return eq;
}

/** Drawdown series from an equity curve, as positive fractions. */
export function drawdowns(eq) {
  const n = eq.length, dd = new Float64Array(n);
  let peak = eq[0];
  for (let i = 0; i < n; i++) {
    if (eq[i] > peak) peak = eq[i];
    dd[i] = peak > 0 ? (peak - eq[i]) / peak : 1;
  }
  return dd;
}

/** Full metric set for an arbitrary return array -- the single-path reference path.
 *  Deliberately re-derives everything PathWalker streams, so the two can be compared. */
export function analyze(rets, { ppy = 252, rf = 0, start = 1, ruinAt = 0, floor = 0 } = {}) {
  const n = rets.length;
  if (!n) return null;
  const w = new PathWalker({ start, ruinAt, floor });
  for (let i = 0; i < n; i++) w.step(rets[i]);
  const base = w.finish(ppy);

  const arr = (rets instanceof Float64Array) ? rets : Float64Array.from(rets);
  const srt = sorted(arr);
  const mo = moments(arr);
  const m = mo.mean, s = mo.sd;
  const rfp = rf / ppy;

  // Autocorrelation-robust Sharpe t-stat. On overlapping or trending returns the
  // naive t is inflated; this is the number that should decide anything.
  const lrv = neweyWestVar(arr);
  const tNaive = s > 0 ? (m - rfp) / (s / Math.sqrt(n)) : 0;
  const tNW = lrv > 0 ? (m - rfp) / Math.sqrt(lrv / n) : 0;

  const q = p => quantileSorted(srt, p);
  const var95 = -q(0.05), var99 = -q(0.01);
  let cvSum = 0, cvN = 0;
  const cut = q(0.05);
  for (let i = 0; i < n; i++) if (arr[i] <= cut) { cvSum += arr[i]; cvN++; }
  const cvar95 = cvN ? -cvSum / cvN : 0;

  const eq = equityCurve(arr, start, floor);
  const dd = drawdowns(eq);

  return {
    ...base,
    sharpe: s > 0 ? ((m - rfp) / s) * Math.sqrt(ppy) : 0,
    meanRet: m, sdRet: s,
    skew: mo.skew, kurtosis: mo.kurtosis,
    tNaive, tNeweyWest: tNW,
    var95, var99, cvar95,
    tailRatio: Math.abs(q(0.05)) > 1e-15 ? Math.abs(q(0.95)) / Math.abs(q(0.05)) : Infinity,
    omega: omegaRatio(arr, rfp),
    gainToPain: (() => { let g = 0, l = 0; for (let i = 0; i < n; i++) (arr[i] > 0 ? g += arr[i] : l -= arr[i]); return l > 0 ? g / l : Infinity; })(),
    equity: eq, dd,
    returns: arr,
  };
}

/** Omega: the probability-weighted gain/loss ratio above a threshold. */
export function omegaRatio(rets, threshold = 0) {
  let up = 0, dn = 0;
  for (let i = 0; i < rets.length; i++) {
    const d = rets[i] - threshold;
    if (d > 0) up += d; else dn -= d;
  }
  return dn > 0 ? up / dn : (up > 0 ? Infinity : 1);
}

/** Maximum drawdown of an equity curve (fraction), plus where it happened. */
export function maxDrawdown(eq) {
  let peak = eq[0], mdd = 0, pi = 0, ti = 0, bestPi = 0, bestTi = 0;
  for (let i = 0; i < eq.length; i++) {
    if (eq[i] > peak) { peak = eq[i]; pi = i; }
    const d = peak > 0 ? (peak - eq[i]) / peak : 1;
    if (d > mdd) { mdd = d; ti = i; bestPi = pi; bestTi = i; }
  }
  // find recovery
  let rec = -1;
  for (let i = bestTi; i < eq.length; i++) if (eq[i] >= eq[bestPi]) { rec = i; break; }
  return { maxDD: mdd, peakIdx: bestPi, troughIdx: bestTi, recoveryIdx: rec,
           drawdownLen: bestTi - bestPi, recoveryLen: rec < 0 ? -1 : rec - bestTi };
}

/** Convert an arbitrary return stream to the period a chart wants to show. */
export function aggregate(rets, k) {
  if (k <= 1) return rets;
  const out = new Float64Array(Math.floor(rets.length / k));
  for (let i = 0; i < out.length; i++) {
    let g = 1;
    for (let j = 0; j < k; j++) g *= 1 + rets[i * k + j];
    out[i] = g - 1;
  }
  return out;
}

/** Rolling-window Sharpe, annualised. Shows how unstable the headline number is. */
export function rollingSharpe(rets, win, ppy = 252) {
  const n = rets.length;
  if (n < win) return new Float64Array(0);
  const out = new Float64Array(n - win + 1);
  let s = 0, s2 = 0;
  for (let i = 0; i < win; i++) { s += rets[i]; s2 += rets[i] * rets[i]; }
  for (let i = 0; ; i++) {
    const m = s / win, v = (s2 - win * m * m) / (win - 1);
    out[i] = v > 0 ? (m / Math.sqrt(v)) * Math.sqrt(ppy) : 0;
    if (i + win >= n) break;
    const drop = rets[i], add = rets[i + win];
    s += add - drop; s2 += add * add - drop * drop;
  }
  return out;
}

/** The underwater curve averaged across paths is built from per-path dd arrays. */
export function timeToRecover(eq) {
  const { troughIdx, recoveryIdx } = maxDrawdown(eq);
  return recoveryIdx < 0 ? Infinity : recoveryIdx - troughIdx;
}
