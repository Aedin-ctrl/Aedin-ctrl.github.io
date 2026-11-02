/* results.mjs -- turn a finished run into the numbers the page shows.
 *
 * Every headline figure carries a Monte Carlo standard error. A simulation result
 * without one is a number with an unknown number of meaningful digits, and the
 * usual failure is quoting four of them when the second is still moving.
 */
import { sorted, quantileSorted, mean, sd, variance, histogram, normalInv, moments, linspace } from './stats.mjs';
import { PATH_METRICS } from './engine.mjs';

const n0loc = v => Math.round(v).toLocaleString();

export const PCTS = [0.01, 0.05, 0.25, 0.5, 0.75, 0.95, 0.99];

const finite = (arr) => {
  const out = new Float64Array(arr.length);
  let n = 0;
  for (let i = 0; i < arr.length; i++) if (Number.isFinite(arr[i]) && Math.abs(arr[i]) < 3e38) out[n++] = arr[i];
  return out.subarray(0, n);
};

/** Standard error of a quantile estimate (Maritz-Jarrett style normal approximation). */
export function quantileSE(sortedArr, p) {
  const n = sortedArr.length;
  if (n < 30) return NaN;
  // density estimated from the spacing around the quantile
  const h = Math.max(2, Math.round(n * 0.02));
  const i = Math.max(0, Math.min(n - 1, Math.round(p * (n - 1))));
  const lo = Math.max(0, i - h), hi = Math.min(n - 1, i + h);
  const dens = (hi - lo) / n / Math.max(1e-300, sortedArr[hi] - sortedArr[lo]);
  if (!(dens > 0)) return NaN;
  return Math.sqrt(p * (1 - p) / n) / dens;
}

/** Summarise one metric across paths. */
export function summarise(values) {
  const v = finite(values);
  const n = v.length;
  if (!n) return { n: 0 };
  const a = sorted(v);
  const m = mean(v), s = sd(v);
  const q = {};
  const qse = {};
  for (const p of PCTS) { q[p] = quantileSorted(a, p); qse[p] = quantileSE(a, p); }
  return {
    n, mean: m, se: s / Math.sqrt(n), sd: s,
    min: a[0], max: a[n - 1],
    q, qse,
    median: q[0.5], medianSE: qse[0.5],
    dropped: values.length - n,
  };
}

/** Percentile bands of log-equity through time, for the fan chart. */
export function equityBands(band, bandPaths, G, pcts = PCTS) {
  const out = pcts.map(p => ({ p, values: new Float64Array(G) }));
  const col = new Float64Array(bandPaths);
  for (let g = 0; g < G; g++) {
    for (let i = 0; i < bandPaths; i++) col[i] = band[i * G + g];
    const a = sorted(col);
    for (let k = 0; k < pcts.length; k++) out[k].values[g] = quantileSorted(a, pcts[k]);
  }
  return out;
}

/** Share of paths still below their starting point at each grid point. */
export function underwaterCurve(band, bandPaths, G) {
  const out = new Float64Array(G);
  for (let g = 0; g < G; g++) {
    let c = 0;
    for (let i = 0; i < bandPaths; i++) if (band[i * G + g] < 0) c++;
    out[g] = c / bandPaths;
  }
  return out;
}

/** Running estimate of a statistic as paths accumulate -- the convergence check.
 *  If this is still drifting at the right-hand edge, the run is too short. */
export function convergence(values, points = 60) {
  const v = finite(values), n = v.length;
  if (n < 50) return null;
  const idx = [];
  for (let i = 0; i < points; i++) idx.push(Math.max(20, Math.round(n * Math.pow((i + 1) / points, 1.5))));
  let s = 0, s2 = 0, j = 0;
  const xs = [], ys = [], lo = [], hi = [];
  for (const k of idx) {
    while (j < k && j < n) { s += v[j]; s2 += v[j] * v[j]; j++; }
    const m = s / j;
    const sdv = Math.sqrt(Math.max(0, (s2 - j * m * m) / Math.max(1, j - 1)));
    const se = sdv / Math.sqrt(j);
    xs.push(j); ys.push(m); lo.push(m - 1.96 * se); hi.push(m + 1.96 * se);
  }
  return { x: xs, y: ys, lo, hi, final: ys[ys.length - 1], finalSE: (hi[hi.length - 1] - ys[ys.length - 1]) / 1.96 };
}

/** Everything the results panel needs, from a merged batch. */
export function buildResults(merged, cfg) {
  const M = merged.metrics;
  const N = merged.count;
  const ppy = cfg.ppy || 252;
  const years = cfg.horizon / ppy;

  const stats = {};
  for (const k of PATH_METRICS) stats[k] = summarise(M[k]);

  let ruined = 0, losers = 0, doubled = 0, halved = 0;
  for (let i = 0; i < N; i++) {
    if (M.ruined[i]) ruined++;
    const t = M.terminal[i];
    if (t < 1) losers++;
    if (t >= 2) doubled++;
    if (t <= 0.5) halved++;
  }
  const prop = (k) => ({ p: k / N, se: Math.sqrt(Math.max(k / N * (1 - k / N), 1e-12) / N), k });

  const bands = equityBands(merged.band, merged.bandPaths, merged.G);
  const grid = merged.grid;

  // sample paths, decimated to the same grid
  const samples = (merged.fullPaths || []).slice(0, 12).map(p => {
    const out = new Float64Array(merged.G);
    let eq = 1, dead = false, gi = 0;
    if (grid[0] === 0) out[gi++] = 0;
    for (let t = 0; t < p.length; t++) {
      if (!dead) { eq *= 1 + p[t]; if (!(eq > 0)) { eq = 0; dead = true; } }
      while (gi < merged.G && grid[gi] === t + 1) out[gi++] = eq > 0 ? Math.log(eq) : -50;
    }
    while (gi < merged.G) out[gi++] = eq > 0 ? Math.log(eq) : -50;
    return out;
  });

  // histograms
  const logT = finite(M.logGrowth);
  const histTerminal = histogram(logT, 64,
    quantileSorted(sorted(logT), 0.002), quantileSorted(sorted(logT), 0.998));
  const ddArr = finite(M.maxDD);
  const histDD = histogram(ddArr, 50, 0, Math.min(1, quantileSorted(sorted(ddArr), 0.999)));
  const shArr = finite(M.sharpe);
  const histSharpe = histogram(shArr, 56,
    quantileSorted(sorted(shArr), 0.002), quantileSorted(sorted(shArr), 0.998));
  const cagrArr = finite(M.cagr);
  const histCagr = histogram(cagrArr, 56,
    quantileSorted(sorted(cagrArr), 0.002), quantileSorted(sorted(cagrArr), 0.998));

  // ladder
  let ladder = null;
  if (merged.ladder && cfg.ladder) {
    const K = cfg.ladder.length;
    ladder = cfg.ladder.map((lev, i) => {
      const g = merged.ladder.logGrowth[i] / merged.ladder.n;
      const g2 = merged.ladder.logGrowthSq[i] / merged.ladder.n;
      const v = Math.max(0, g2 - g * g);
      const med = quantileSorted(sorted(finite(merged.ladder.median[i])), 0.5);
      const q05 = quantileSorted(sorted(finite(merged.ladder.median[i])), 0.05);
      return {
        leverage: lev,
        meanLogGrowth: g,
        seLogGrowth: Math.sqrt(v / merged.ladder.n),
        cagr: Math.expm1(g / years),
        medianCagr: Math.expm1(med / years),
        p05Cagr: Math.expm1(q05 / years),
        maxDD: merged.ladder.maxDD[i] / merged.ladder.n,
        ruin: merged.ladder.ruin[i] / merged.ladder.n,
      };
    });
  }

  return {
    n: N, horizon: cfg.horizon, ppy, years,
    stats,
    props: {
      ruin: prop(ruined), loss: prop(losers), double: prop(doubled), half: prop(halved),
    },
    bands, grid, samples,
    underwater: underwaterCurve(merged.band, merged.bandPaths, merged.G),
    hist: { terminal: histTerminal, maxDD: histDD, sharpe: histSharpe, cagr: histCagr },
    scatter: { cagr: finite(M.cagr), maxDD: finite(M.maxDD) },
    convergence: {
      logGrowth: convergence(M.logGrowth),
      maxDD: convergence(M.maxDD),
      sharpe: convergence(M.sharpe),
    },
    ladder,
    bandPaths: merged.bandPaths,
  };
}

/** The percentile table, as rows ready to render. */
export function percentileRows(res, fmts) {
  const rows = [];
  const defs = [
    ['terminal', 'Terminal equity', v => v.toFixed(2) + 'x'],
    ['cagr', 'CAGR', v => (v * 100).toFixed(1) + '%'],
    ['maxDD', 'Max drawdown', v => (v * 100).toFixed(1) + '%'],
    ['sharpe', 'Sharpe', v => v.toFixed(2)],
    ['sortino', 'Sortino', v => v.toFixed(2)],
    ['vol', 'Volatility', v => (v * 100).toFixed(1) + '%'],
    ['calmar', 'Calmar', v => v.toFixed(2)],
    ['ulcer', 'Ulcer index', v => (v * 100).toFixed(1) + '%'],
    ['timeUnderwater', 'Time underwater', v => (v * 100).toFixed(0) + '%'],
    ['maxDDDuration', 'Longest drawdown (periods)', v => n0loc(v)],
    ['winRate', 'Win rate', v => (v * 100).toFixed(1) + '%'],
    ['worstStreak', 'Worst losing streak (periods)', v => n0loc(v)],
    ['worst', 'Worst single period', v => (v * 100).toFixed(1) + '%'],
  ];
  for (const [key, label, fmt] of defs) {
    const s = res.stats[key];
    if (!s || !s.n) continue;
    rows.push({ key, label, fmt, s });
  }
  return rows;
}

/* ---------------------------------------------------------------------------
 * The ceiling a resampling model puts on the tail.
 *
 * A bootstrap draws only values that are already in your sample, so the worst
 * single period it can ever produce is the worst one that happened. Over a long
 * horizon nearly every path contains that value, which is why the simulated
 * "worst day" collapses onto it. The event you actually need to survive is, by
 * construction, not in the simulation.
 * ------------------------------------------------------------------------- */
export function tailCeiling(source, modelId, horizon, fittedT) {
  if (!source || !source.length) return null;
  const RESAMPLERS = new Set(['iid', 'permute', 'block', 'circblock', 'movblock', 'replay']);
  if (!RESAMPLERS.has(modelId)) return null;
  let worst = Infinity, best = -Infinity;
  for (let i = 0; i < source.length; i++) {
    if (source[i] < worst) worst = source[i];
    if (source[i] > best) best = source[i];
  }
  const n = source.length;
  const pIncluded = 1 - Math.pow(1 - 1 / n, horizon);
  return { worst, best, n, horizon, pIncluded, fittedT: fittedT ?? null };
}

/** The q-th quantile of the WORST SINGLE PERIOD in a path of `horizon` draws from
 *  a fitted Student-t. Exact, no simulation: for the minimum M of n iid draws,
 *      P(M <= x) = 1 - (1 - F(x))^n,
 *  so the q-th quantile of M sits at the F = 1 - (1-q)^(1/n) quantile of F.
 *
 *  This is the honest comparison against a bootstrap's hard ceiling. The bootstrap
 *  has ONE worst day and it never gets worse however many paths you run; the
 *  parametric model has a distribution of worst days with no upper bound at all. */
export function parametricWorst(mu, sigma, df, horizon, q = 0.5) {
  if (!(df > 2) || !(horizon > 1)) return NaN;
  const F = 1 - Math.pow(1 - q, 1 / horizon);
  const scale = Math.sqrt((df - 2) / df);
  return mu + sigma * scale * tQuantile(F, df);
}
function tQuantile(p, df) {
  let lo = -200, hi = 0;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (tCdfLocal(mid, df) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
function tCdfLocal(t, df) {
  // local copy to keep this module free of a circular import
  const x = df / (df + t * t);
  const ib = betaILocal(x, df / 2, 0.5);
  return t > 0 ? 1 - 0.5 * ib : 0.5 * ib;
}
function betaILocal(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lg = n => { const g = [76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = n, tmp = n + 5.5; tmp -= (n + 0.5) * Math.log(tmp); let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) ser += g[j] / ++y; return -tmp + Math.log(2.5066282746310005 * ser / n); };
  const cf = (x, a, b) => {
    const FPMIN = 1e-300; const qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - qab * x / qap; if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d; let h = d;
    for (let m = 1; m <= 300; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; const del = d * c; h *= del;
      if (Math.abs(del - 1) < 1e-15) break;
    }
    return h;
  };
  const front = Math.exp(lg(a + b) - lg(a) - lg(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2)
    ? front * cf(x, a, b) / a
    : 1 - Math.exp(lg(a + b) - lg(a) - lg(b) + b * Math.log(1 - x) + a * Math.log(x)) * cf(1 - x, b, a) / b;
}
