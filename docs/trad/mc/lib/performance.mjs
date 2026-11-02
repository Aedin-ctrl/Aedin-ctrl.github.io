/* performance.mjs -- what the strategy did, in money.
 *
 * Sharpe ratios do not pay for anything. This module turns a return stream into
 * the numbers a person actually acts on: how much it made, how much it lost on
 * the worst day, how long the bad stretch lasted, and how it compares to simply
 * having bought the thing.
 *
 * Everything here takes a starting capital and returns dollars.
 */
import * as S from './stats.mjs';
import * as M from './metrics.mjs';

/** Compound a return stream into a dollar equity curve, with the absorbing floor. */
export function equity(returns, capital = 10000) {
  const n = returns.length;
  const eq = new Float64Array(n + 1);
  eq[0] = capital;
  let e = capital, dead = false;
  for (let i = 0; i < n; i++) {
    if (!dead) { e *= 1 + returns[i]; if (!(e > 0)) { e = 0; dead = true; } }
    eq[i + 1] = e;
  }
  return eq;
}

/** Group a daily stream into calendar buckets using the actual dates.
 *  Buckets are built from the dates, not from a fixed period count, so a short
 *  first month or a holiday-shortened year is handled correctly rather than
 *  silently smeared across a boundary. */
export function bucket(returns, dates, by = 'month') {
  const key = d => by === 'year' ? d.slice(0, 4) : by === 'quarter'
    ? `${d.slice(0, 4)}-Q${Math.floor((+d.slice(5, 7) - 1) / 3) + 1}` : d.slice(0, 7);
  const out = [];
  let cur = null;
  for (let i = 0; i < returns.length; i++) {
    const k = key(dates[i]);
    if (!cur || cur.key !== k) { cur = { key: k, growth: 1, n: 0, from: dates[i], to: dates[i] }; out.push(cur); }
    cur.growth *= 1 + returns[i];
    cur.to = dates[i];
    cur.n++;
  }
  return out.map(b => ({ ...b, ret: b.growth - 1 }));
}

/** The full money report for one return stream. */
export function report(returns, dates, { capital = 10000, ppy = 252, label = '' } = {}) {
  const n = returns.length;
  if (!n) return null;
  const eq = equity(returns, capital);
  const a = M.analyze(returns, { ppy });
  const dd = M.drawdowns(eq);
  const mdd = M.maxDrawdown(eq);

  // dollar terms
  const final = eq[n];
  const profit = final - capital;
  const peak = Math.max(...eq);
  const ddDollars = new Float64Array(eq.length);
  let run = eq[0];
  for (let i = 0; i < eq.length; i++) { if (eq[i] > run) run = eq[i]; ddDollars[i] = eq[i] - run; }
  const worstDollarDD = Math.min(...ddDollars);

  const daily = Float64Array.from(returns);
  const dollarDaily = new Float64Array(n);
  for (let i = 0; i < n; i++) dollarDaily[i] = eq[i] * returns[i];

  const months = bucket(returns, dates, 'month');
  const years = bucket(returns, dates, 'year');
  // dollar P&L per bucket, compounding through the curve rather than on the start
  let idx = 0;
  const withDollars = (buckets) => buckets.map(b => {
    const start = eq[idx]; idx += b.n;
    return { ...b, startEquity: start, endEquity: eq[idx], pnl: eq[idx] - start };
  });
  idx = 0; const monthsD = withDollars(months);
  idx = 0; const yearsD = withDollars(years);

  const best = (arr) => arr.reduce((x, y) => y.ret > x.ret ? y : x, arr[0]);
  const worst = (arr) => arr.reduce((x, y) => y.ret < x.ret ? y : x, arr[0]);

  let bestDay = 0, worstDay = 0, bestDayI = 0, worstDayI = 0;
  for (let i = 0; i < n; i++) {
    if (returns[i] > bestDay) { bestDay = returns[i]; bestDayI = i; }
    if (returns[i] < worstDay) { worstDay = returns[i]; worstDayI = i; }
  }

  return {
    label, capital, n, from: dates[0], to: dates[n - 1],
    years: n / ppy,
    equity: eq, drawdownDollars: ddDollars, dollarDaily,
    final, profit, profitPct: profit / capital,
    cagr: a.cagr, vol: a.vol, sharpe: a.sharpe, sortino: a.sortino, calmar: a.calmar,
    maxDD: a.maxDD, maxDDDollars: worstDollarDD,
    maxDDFrom: dates[Math.max(0, mdd.peakIdx - 1)], maxDDTo: dates[Math.max(0, mdd.troughIdx - 1)],
    maxDDRecovered: mdd.recoveryIdx >= 0 ? dates[Math.max(0, mdd.recoveryIdx - 1)] : null,
    maxDDLengthDays: mdd.drawdownLen, maxDDRecoveryDays: mdd.recoveryLen,
    peakEquity: peak,
    winRate: a.winRate, profitFactor: a.profitFactor,
    bestDay: { ret: bestDay, date: dates[bestDayI], pnl: dollarDaily[bestDayI] },
    worstDay: { ret: worstDay, date: dates[worstDayI], pnl: dollarDaily[worstDayI] },
    months: monthsD, years_: yearsD,
    bestMonth: monthsD.length ? best(monthsD) : null,
    worstMonth: monthsD.length ? worst(monthsD) : null,
    positiveMonths: monthsD.filter(b => b.ret > 0).length,
    positiveYears: yearsD.filter(b => b.ret > 0).length,
    skew: a.skew, kurtosis: a.kurtosis,
    var95Dollars: -S.quantile(Array.from(dollarDaily), 0.05),
  };
}

/** Compare a strategy with a benchmark, on the same days.
 *  Up/down capture answers "what kind of market does this work in" directly:
 *  how much of the benchmark's gain it captures when the benchmark rises, and
 *  how much of its loss it takes when the benchmark falls. */
export function compare(stratRet, benchRet, dates, { capital = 10000, ppy = 252 } = {}) {
  const n = Math.min(stratRet.length, benchRet.length);
  const s = report(stratRet.slice(0, n), dates.slice(0, n), { capital, ppy, label: 'strategy' });
  const b = report(benchRet.slice(0, n), dates.slice(0, n), { capital, ppy, label: 'benchmark' });

  let upS = 0, upB = 0, upN = 0, dnS = 0, dnB = 0, dnN = 0;
  for (let i = 0; i < n; i++) {
    if (benchRet[i] > 0) { upS += stratRet[i]; upB += benchRet[i]; upN++; }
    else if (benchRet[i] < 0) { dnS += stratRet[i]; dnB += benchRet[i]; dnN++; }
  }
  const excess = Float64Array.from({ length: n }, (_, i) => stratRet[i] - benchRet[i]);
  const te = S.sd(excess) * Math.sqrt(ppy);
  const corr = S.corr(Array.from(stratRet.slice(0, n)), Array.from(benchRet.slice(0, n)));
  const reg = S.ols(Array.from(benchRet.slice(0, n)), Array.from(stratRet.slice(0, n)));

  return {
    strategy: s, benchmark: b, n,
    excessReturn: s.cagr - b.cagr,
    excessProfit: s.profit - b.profit,
    trackingError: te,
    informationRatio: te > 0 ? (s.cagr - b.cagr) / te : 0,
    // capture ratios, the direct answer to "which market does it like"
    upCapture: upB !== 0 ? (upS / upN) / (upB / upN) : NaN,
    downCapture: dnB !== 0 ? (dnS / dnN) / (dnB / dnN) : NaN,
    upDays: upN, downDays: dnN,
    beta: reg.beta, alphaAnnual: reg.alpha * ppy, r2: reg.r2,
    correlation: corr.r,
    betterMonths: s.months.filter((m, i) => b.months[i] && m.ret > b.months[i].ret).length,
    totalMonths: s.months.length,
  };
}

/** Rolling N-period return, for the "is it consistent" chart. */
export function rolling(returns, win) {
  const n = returns.length;
  if (n < win) return { x: [], y: [] };
  const x = [], y = [];
  let g = 1;
  for (let i = 0; i < win; i++) g *= 1 + returns[i];
  x.push(win - 1); y.push(g - 1);
  for (let i = win; i < n; i++) {
    g *= (1 + returns[i]) / (1 + returns[i - win]);
    x.push(i); y.push(g - 1);
  }
  return { x, y };
}
