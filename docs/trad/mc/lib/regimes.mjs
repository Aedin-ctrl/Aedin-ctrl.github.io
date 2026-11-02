/* regimes.mjs -- which markets does this actually work in?
 *
 * A single Sharpe ratio hides the answer. A rule that makes everything in
 * turbulent bear markets and bleeds the rest of the time is a very different
 * proposition from one that grinds steadily, even when they post the same
 * number -- and you cannot size them the same way.
 *
 * Every regime is classified from information available BEFORE the day it
 * labels. A trailing 200-day return ending yesterday, a volatility percentile
 * built from yesterday's history. Classifying today with today's data would be
 * look-ahead in the attribution: it would tell you the strategy does well on
 * days that turned out to be calm, which is not a fact you can trade on.
 *
 * The one exception is the up/down split, which is explicitly same-day, because
 * "what does it do when the market falls" is a descriptive question and that is
 * what up/down capture means everywhere else.
 */
import * as S from './stats.mjs';

const EMPTY = () => ({ n: 0, stratSum: 0, benchSum: 0, stratGrowth: 1, benchGrowth: 1, wins: 0 });

/** Trailing window return over `win` days, ending at t-1. NaN before it exists. */
function trailingReturn(r, win) {
  const n = r.length, out = new Float64Array(n).fill(NaN);
  let g = 1;
  for (let i = 0; i < n; i++) {
    if (i >= 1) { g *= 1 + r[i - 1]; if (i - 1 - win >= 0) g /= 1 + r[i - 1 - win]; }
    if (i >= win) out[i] = g - 1;
  }
  return out;
}

/** Trailing realised volatility over `win` days, ending at t-1. */
function trailingVol(r, win, ppy = 252) {
  const n = r.length, out = new Float64Array(n).fill(NaN);
  let s = 0, s2 = 0;
  for (let i = 0; i < n; i++) {
    if (i >= 1) {
      const v = r[i - 1]; s += v; s2 += v * v;
      if (i - 1 - win >= 0) { const o = r[i - 1 - win]; s -= o; s2 -= o * o; }
    }
    if (i >= win) { const m = s / win; out[i] = Math.sqrt(Math.max(0, (s2 - win * m * m) / (win - 1))) * Math.sqrt(ppy); }
  }
  return out;
}

/** Drawdown of the benchmark as of the close of t-1. */
function trailingDrawdown(r) {
  const n = r.length, out = new Float64Array(n).fill(NaN);
  let eq = 1, peak = 1;
  for (let i = 0; i < n; i++) {
    out[i] = peak > 0 ? (eq - peak) / peak : 0;
    eq *= 1 + r[i];
    if (eq > peak) peak = eq;
  }
  return out;
}

/** Classify every day, then attribute the strategy's result to each bucket. */
export function regimeAnalysis(stratRet, benchRet, dates, opts = {}) {
  const {
    trendWindow = 200, trendBand = 0.05,
    volWindow = 60, volLookback = 504,
    ddThreshold = 0.10, ppy = 252,
  } = opts;
  const n = Math.min(stratRet.length, benchRet.length);

  const tr = trailingReturn(benchRet, trendWindow);
  const vol = trailingVol(benchRet, volWindow, ppy);
  const dd = trailingDrawdown(benchRet);

  // volatility percentile against the PAST distribution of volatility only
  const volPct = new Float64Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(vol[i])) continue;
    const lo = Math.max(volWindow, i - volLookback);
    if (i - lo < 60) continue;
    let below = 0, count = 0;
    for (let j = lo; j < i; j++) if (Number.isFinite(vol[j])) { count++; if (vol[j] <= vol[i]) below++; }
    if (count >= 60) volPct[i] = below / count;
  }

  const dims = {
    trend: { label: 'Market direction', note: `trailing ${trendWindow}-day return of the benchmark, as of yesterday`,
      buckets: ['bull', 'sideways', 'bear'],
      labels: { bull: `Bull (trailing ${trendWindow}d above +${(trendBand * 100).toFixed(0)}%)`,
                sideways: 'Sideways (in between)', bear: `Bear (trailing ${trendWindow}d below -${(trendBand * 100).toFixed(0)}%)` },
      classify: i => !Number.isFinite(tr[i]) ? null : tr[i] > trendBand ? 'bull' : tr[i] < -trendBand ? 'bear' : 'sideways' },
    vol: { label: 'Volatility', note: `trailing ${volWindow}-day realised volatility, ranked against its own past two years`,
      buckets: ['calm', 'normal', 'turbulent'],
      labels: { calm: 'Calm (bottom third)', normal: 'Normal (middle third)', turbulent: 'Turbulent (top third)' },
      classify: i => !Number.isFinite(volPct[i]) ? null : volPct[i] < 1 / 3 ? 'calm' : volPct[i] > 2 / 3 ? 'turbulent' : 'normal' },
    drawdown: { label: 'Benchmark drawdown', note: `whether the benchmark was more than ${(ddThreshold * 100).toFixed(0)}% below its high at yesterday's close`,
      buckets: ['near_highs', 'in_drawdown'],
      labels: { near_highs: `Near highs (within ${(ddThreshold * 100).toFixed(0)}%)`, in_drawdown: `In drawdown (more than ${(ddThreshold * 100).toFixed(0)}% down)` },
      classify: i => !Number.isFinite(dd[i]) ? null : dd[i] < -ddThreshold ? 'in_drawdown' : 'near_highs' },
    direction: { label: 'Same-day direction', note: 'whether the benchmark rose or fell that day — descriptive, not predictive',
      buckets: ['up', 'flat', 'down'],
      labels: { up: 'Benchmark up', flat: 'Benchmark flat', down: 'Benchmark down' },
      classify: i => benchRet[i] > 0 ? 'up' : benchRet[i] < 0 ? 'down' : 'flat' },
  };

  const out = {};
  let totalGrowth = 1;
  for (let i = 0; i < n; i++) totalGrowth *= 1 + stratRet[i];
  const totalLog = Math.log(Math.max(totalGrowth, 1e-12));

  for (const [key, dim] of Object.entries(dims)) {
    const acc = {};
    for (const b of dim.buckets) acc[b] = EMPTY();
    let classified = 0;
    for (let i = 0; i < n; i++) {
      const b = dim.classify(i);
      if (!b || !acc[b]) continue;
      classified++;
      const a = acc[b];
      a.n++;
      a.stratSum += stratRet[i]; a.benchSum += benchRet[i];
      a.stratGrowth *= 1 + stratRet[i]; a.benchGrowth *= 1 + benchRet[i];
      if (stratRet[i] > 0) a.wins++;
    }
    // the classifier itself must not travel: a function cannot be cloned across
    // a worker boundary, and the consumer only needs the labels and the rows
    const { classify, ...describable } = dim;
    out[key] = {
      ...describable,
      classified,
      rows: dim.buckets.map(b => {
        const a = acc[b];
        if (!a.n) return { bucket: b, label: dim.labels[b], n: 0 };
        // log growth is additive, so the share of the total is well defined even
        // when some buckets lost money
        const lg = Math.log(Math.max(a.stratGrowth, 1e-12));
        return {
          bucket: b, label: dim.labels[b], n: a.n,
          share: a.n / classified,
          stratTotal: a.stratGrowth - 1,
          benchTotal: a.benchGrowth - 1,
          stratPerDayBps: (a.stratSum / a.n) * 1e4,
          benchPerDayBps: (a.benchSum / a.n) * 1e4,
          stratAnnual: Math.pow(a.stratGrowth, ppy / a.n) - 1,
          benchAnnual: Math.pow(a.benchGrowth, ppy / a.n) - 1,
          winRate: a.wins / a.n,
          logGrowth: lg,
          pnlShare: totalLog !== 0 ? lg / totalLog : NaN,
        };
      }).filter(r => r.n > 0),
    };
  }

  // the headline: where the money actually came from
  const all = [];
  for (const [key, d] of Object.entries(out)) {
    if (key === 'direction') continue;          // descriptive, not a market state
    for (const r of d.rows) all.push({ dim: d.label, ...r });
  }
  const bestDim = all.filter(r => r.n >= 40).sort((a, b) => b.stratAnnual - a.stratAnnual);

  return {
    dims: out, n,
    best: bestDim[0] || null,
    worst: bestDim[bestDim.length - 1] || null,
    concentration: concentrationReport(stratRet, ppy),
  };
}

/** How much of the result came from how few days. A strategy whose entire
 *  return is five days is a lottery ticket with a backtest. */
export function concentrationReport(stratRet, ppy = 252) {
  const n = stratRet.length;
  const sorted = Array.from(stratRet).map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
  const totalLog = Array.from(stratRet).reduce((a, v) => a + Math.log(Math.max(1 + v, 1e-12)), 0);
  const topShare = (k) => {
    let s = 0;
    for (let j = 0; j < Math.min(k, n); j++) s += Math.log(Math.max(1 + sorted[j].v, 1e-12));
    return totalLog !== 0 ? s / totalLog : NaN;
  };
  const withoutTop = (k) => {
    let s = totalLog;
    for (let j = 0; j < Math.min(k, n); j++) s -= Math.log(Math.max(1 + sorted[j].v, 1e-12));
    return Math.expm1(s * ppy / Math.max(1, n - k));
  };
  return {
    n,
    top1Pct: topShare(Math.max(1, Math.round(n * 0.01))),
    top5Pct: topShare(Math.max(1, Math.round(n * 0.05))),
    top10Days: topShare(10),
    annualWithoutTop10: withoutTop(10),
    annualWithoutTop1Pct: withoutTop(Math.max(1, Math.round(n * 0.01))),
  };
}
