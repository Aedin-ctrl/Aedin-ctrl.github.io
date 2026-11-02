/* tests.mjs -- the "is this real" layer.
 *
 * A Monte Carlo that only draws fan charts is a flattery machine: feed it a lucky
 * backtest and it will draw you a thousand lucky futures. Everything in this file
 * exists to push the other way, by asking what the same numbers would look like if
 * there were no edge at all.
 *
 * References, so the formulas can be checked rather than trusted:
 *   Lo (2002)                  -- the standard error of a Sharpe ratio
 *   Bailey & Lopez de Prado    -- Probabilistic / Deflated Sharpe, minimum track record
 *   Bailey, Borwein, LdP, Zhu  -- PBO by combinatorially symmetric cross-validation
 *   White (2000), Hansen (2005)-- reality check / superior predictive ability
 *   Harvey & Liu (2015)        -- multiple-testing haircuts
 */
import {
  mean, sd, variance, moments, normalCdf, normalInv, sorted, quantileSorted,
  neweyWestVar, tCdf,
} from './stats.mjs';
import { RNG } from './rng.mjs';

const EULER = 0.5772156649015329;

/* ======================= Sharpe inference ======================= */

/** Standard error of an estimated Sharpe ratio, allowing for skew and fat tails.
 *  se = sqrt( (1 - g3*SR + (g4-1)/4*SR^2) / (n-1) ), with g4 the RAW kurtosis.
 *  For normal returns this collapses to Lo's sqrt((1+SR^2/2)/n). */
export function sharpeSE(SR, n, skew = 0, exKurt = 0) {
  const g4 = exKurt + 3;
  const v = 1 - skew * SR + (g4 - 1) / 4 * SR * SR;
  return Math.sqrt(Math.max(v, 1e-12) / Math.max(1, n - 1));
}

/** Probabilistic Sharpe Ratio: P(true SR > benchmark), given the sample's own
 *  skew and kurtosis. All arguments are PER PERIOD. */
export function psr(SR, n, skew = 0, exKurt = 0, benchmark = 0) {
  if (!(n > 1)) return NaN;
  const se = sharpeSE(SR, n, skew, exKurt);
  return normalCdf((SR - benchmark) / se);
}

/** The Sharpe you should EXPECT to see as the best of N independent noise trials.
 *  This is the number that makes "my best parameter set had Sharpe 1.4" unimpressive
 *  once you admit you tried two hundred of them. */
export function expectedMaxSharpe(N, varSR) {
  if (!(N > 1)) return 0;
  const s = Math.sqrt(Math.max(varSR, 0));
  const a = normalInv(1 - 1 / N);
  const b = normalInv(1 - 1 / (N * Math.E));
  return s * ((1 - EULER) * a + EULER * b);
}

/** Deflated Sharpe Ratio: the PSR against the expected best-of-N benchmark.
 *  @param SR      observed per-period Sharpe of the SELECTED strategy
 *  @param n       number of periods
 *  @param trials  how many variants were tried before picking this one
 *  @param varSR   variance of the Sharpes ACROSS those trials
 */
export function deflatedSharpe(SR, n, skew, exKurt, trials, varSR) {
  const SR0 = expectedMaxSharpe(trials, varSR);
  return { dsr: psr(SR, n, skew, exKurt, SR0), sr0: SR0, trials, varSR };
}

/** Minimum track record length: how many periods you would need before a Sharpe of
 *  SR could be called significant at confidence `conf` against `benchmark`. */
export function minTrackRecord(SR, skew = 0, exKurt = 0, benchmark = 0, conf = 0.95) {
  const d = SR - benchmark;
  if (!(d > 0)) return Infinity;
  const g4 = exKurt + 3;
  const v = 1 - skew * SR + (g4 - 1) / 4 * SR * SR;
  return 1 + Math.max(v, 1e-12) * Math.pow(normalInv(conf) / d, 2);
}

/* ======================= power ======================= */

/** Minimum detectable effect: the smallest true per-period mean return this sample
 *  could distinguish from zero, at significance `alpha` and power `power`.
 *
 *  This is the question most backtests never ask. If the MDE is larger than any
 *  edge you could plausibly have, a null result tells you nothing -- the test was
 *  never able to see it. */
export function mde(sdPerPeriod, n, alpha = 0.05, power = 0.8) {
  if (!(n > 1) || !(sdPerPeriod > 0)) return NaN;
  const za = normalInv(1 - alpha / 2), zb = normalInv(power);
  return (za + zb) * sdPerPeriod / Math.sqrt(n);
}

/** The same thing expressed as a Sharpe ratio, which is usually easier to judge. */
export function mdeSharpe(n, alpha = 0.05, power = 0.8, ppy = 252) {
  const za = normalInv(1 - alpha / 2), zb = normalInv(power);
  return (za + zb) / Math.sqrt(n) * Math.sqrt(ppy);
}

/** Power of a two-sided test to detect a given per-period mean. */
export function power(trueMean, sdPerPeriod, n, alpha = 0.05) {
  if (!(n > 1) || !(sdPerPeriod > 0)) return NaN;
  const za = normalInv(1 - alpha / 2);
  const ncp = trueMean / (sdPerPeriod / Math.sqrt(n));
  return normalCdf(ncp - za) + normalCdf(-ncp - za);
}

/** How many periods until a given true Sharpe becomes detectable. */
export function periodsNeeded(trueSharpe, alpha = 0.05, pwr = 0.8) {
  if (!(trueSharpe > 0)) return Infinity;
  const za = normalInv(1 - alpha / 2), zb = normalInv(pwr);
  return Math.ceil(Math.pow((za + zb) / trueSharpe, 2));
}

/* ======================= permutation / randomisation ======================= */

/** Sign-flip permutation test of H0: the mean is zero and the distribution is
 *  symmetric about it. Distribution-free: it does not care about fat tails.
 *  Returns the observed statistic, the null distribution and a two-sided p. */
export function signFlipTest(x, { iters = 10000, seed = 1 } = {}) {
  const n = x.length;
  const obs = mean(x);
  const rng = new RNG(seed, 0);
  const nullDist = new Float64Array(iters);
  let ge = 0;
  for (let it = 0; it < iters; it++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += rng.u() < 0.5 ? -x[i] : x[i];
    const m = s / n;
    nullDist[it] = m;
    if (Math.abs(m) >= Math.abs(obs) - 1e-18) ge++;
  }
  return { obs, p: (ge + 1) / (iters + 1), nullDist };
}

/** Permutation test on the Sharpe ratio itself, by reordering returns.
 *  NOTE: reordering cannot change the mean or the sd, so a plain shuffle leaves
 *  the Sharpe EXACTLY fixed and tests nothing. This shuffles the SIGNS instead,
 *  which is the test people usually mean. Kept as its own function so the
 *  distinction is visible rather than silently wrong. */
export function sharpeNull(x, { iters = 10000, seed = 1, ppy = 252 } = {}) {
  const n = x.length;
  const rng = new RNG(seed, 0);
  const obs = sd(x) > 0 ? mean(x) / sd(x) * Math.sqrt(ppy) : 0;
  const dist = new Float64Array(iters);
  const buf = new Float64Array(n);
  let ge = 0;
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < n; i++) buf[i] = rng.u() < 0.5 ? -x[i] : x[i];
    const m = mean(buf), s = sd(buf);
    const v = s > 0 ? m / s * Math.sqrt(ppy) : 0;
    dist[it] = v;
    if (v >= obs) ge++;
  }
  return { obs, p: (ge + 1) / (iters + 1), dist };
}

/** Stationary-bootstrap confidence interval for an arbitrary statistic of a series.
 *  Block resampling, so the interval is honest about serial dependence. */
export function bootstrapCI(x, stat, { iters = 2000, seed = 1, L = 10, conf = 0.95 } = {}) {
  const n = x.length, rng = new RNG(seed, 0), p = 1 / Math.max(1, L);
  const buf = new Float64Array(n);
  const vals = new Float64Array(iters);
  for (let it = 0; it < iters; it++) {
    let idx = rng.int(n);
    for (let i = 0; i < n; i++) {
      if (i > 0) idx = rng.u() < p ? rng.int(n) : (idx + 1) % n;
      buf[i] = x[idx];
    }
    vals[it] = stat(buf);
  }
  const s = sorted(vals);
  const a = (1 - conf) / 2;
  return { lo: quantileSorted(s, a), hi: quantileSorted(s, 1 - a), mid: quantileSorted(s, 0.5), dist: vals };
}

/* ======================= multiple testing ======================= */

/** White's Reality Check and Hansen's SPA.
 *
 *  @param matrix  array of N return series (each an array of length T), one per
 *                 candidate strategy, already in excess-of-benchmark terms.
 *  Tests H0: the BEST of them has no positive expected return -- which is the
 *  hypothesis you are actually testing when you report your best parameter set.
 */
export function realityCheck(matrix, { iters = 2000, seed = 1, L = 10 } = {}) {
  const N = matrix.length;
  if (!N) return null;
  const T = matrix[0].length;
  const means = matrix.map(mean);
  const sqrtT = Math.sqrt(T);
  const obsStat = Math.max(...means.map(m => sqrtT * m));

  // Hansen's studentisation and his recentring, which stops a crowd of terrible
  // strategies from making a mediocre one look good.
  const omega = matrix.map(r => Math.sqrt(Math.max(neweyWestVar(r), 1e-300)));
  const obsSpa = Math.max(0, ...means.map((m, k) => sqrtT * m / omega[k]));
  const thresh = means.map((m, k) => {
    const cut = -omega[k] * Math.sqrt(2 * Math.log(Math.log(Math.max(T, 3)))) / sqrtT;
    return m >= cut ? m : 0;              // only "good enough" models contribute
  });

  const rng = new RNG(seed, 0), p = 1 / Math.max(1, L);
  const idx = new Int32Array(T);
  let geRC = 0, geSPA = 0;
  const distRC = new Float64Array(iters), distSPA = new Float64Array(iters);
  for (let it = 0; it < iters; it++) {
    let j = rng.int(T);
    for (let t = 0; t < T; t++) { if (t > 0) j = rng.u() < p ? rng.int(T) : (j + 1) % T; idx[t] = j; }
    let bestRC = -Infinity, bestSPA = 0;
    for (let k = 0; k < N; k++) {
      const r = matrix[k];
      let s = 0;
      for (let t = 0; t < T; t++) s += r[idx[t]];
      const bm = s / T;
      const rc = sqrtT * (bm - means[k]);                 // centred at the observed mean
      if (rc > bestRC) bestRC = rc;
      const sp = sqrtT * (bm - thresh[k]) / omega[k];
      if (sp > bestSPA) bestSPA = sp;
    }
    distRC[it] = bestRC; distSPA[it] = bestSPA;
    if (bestRC >= obsStat) geRC++;
    if (bestSPA >= obsSpa) geSPA++;
  }
  return {
    n: N, T,
    bestIndex: means.indexOf(Math.max(...means)),
    bestMean: Math.max(...means),
    statRC: obsStat, pRC: (geRC + 1) / (iters + 1),
    statSPA: obsSpa, pSPA: (geSPA + 1) / (iters + 1),
    distRC, distSPA,
  };
}

/** Probability of Backtest Overfitting by combinatorially symmetric cross-validation.
 *
 *  Split the sample into S time blocks; for every way of choosing half of them as
 *  "in sample", pick the variant that looked best there and see where it ranks out
 *  of sample. If selection carries no information the rank is uniform and PBO = 0.5.
 *
 *  @param matrix  N variants x T observations
 */
export function pbo(matrix, { S = 10, scorer = null } = {}) {
  const N = matrix.length;
  if (N < 2) return { pbo: NaN, note: 'needs at least two variants' };
  const T = matrix[0].length;
  if (S % 2) S -= 1;
  if (S < 4) return { pbo: NaN, note: 'needs at least four blocks' };
  const blockLen = Math.floor(T / S);
  if (blockLen < 5) return { pbo: NaN, note: 'series too short for this many blocks' };

  const score = scorer || (arr => { const s = sd(arr); return s > 0 ? mean(arr) / s : 0; });

  // precompute each variant's score on each block pair-wise combination lazily
  const blocks = [];
  for (let s = 0; s < S; s++) blocks.push([s * blockLen, (s + 1) * blockLen]);

  const combos = [];
  const half = S / 2;
  (function choose(start, acc) {
    if (acc.length === half) { combos.push(acc.slice()); return; }
    for (let i = start; i < S; i++) { acc.push(i); choose(i + 1, acc); acc.pop(); }
  })(0, []);

  const lambdas = [];
  let nWorse = 0;
  const scratchIS = [], scratchOOS = [];
  for (const cIS of combos) {
    const isSet = new Set(cIS);
    const oosIdx = [];
    for (let s = 0; s < S; s++) if (!isSet.has(s)) oosIdx.push(s);

    const scoresIS = new Float64Array(N), scoresOOS = new Float64Array(N);
    for (let k = 0; k < N; k++) {
      const r = matrix[k];
      scratchIS.length = 0; scratchOOS.length = 0;
      for (const s of cIS) for (let t = blocks[s][0]; t < blocks[s][1]; t++) scratchIS.push(r[t]);
      for (const s of oosIdx) for (let t = blocks[s][0]; t < blocks[s][1]; t++) scratchOOS.push(r[t]);
      scoresIS[k] = score(scratchIS);
      scoresOOS[k] = score(scratchOOS);
    }
    // the variant that won in sample
    let best = 0;
    for (let k = 1; k < N; k++) if (scoresIS[k] > scoresIS[best]) best = k;
    // its rank out of sample (1 = worst, N = best)
    let rank = 1;
    for (let k = 0; k < N; k++) if (k !== best && scoresOOS[k] < scoresOOS[best]) rank++;
    const w = rank / (N + 1);
    const lam = Math.log(w / (1 - w));
    lambdas.push(lam);
    if (lam <= 0) nWorse++;
  }
  return {
    pbo: nWorse / combos.length,
    combos: combos.length, S, N, T,
    lambdas,
    medianLambda: lambdas.length ? quantileSorted(sorted(lambdas), 0.5) : NaN,
  };
}

/** Harvey & Liu style multiple-testing haircuts on a t-statistic. */
export function haircut(tStat, nTrials, alpha = 0.05) {
  const p = 2 * (1 - normalCdf(Math.abs(tStat)));
  const bonf = Math.min(1, p * nTrials);
  // Benjamini-Hochberg-Yekutieli threshold for the single best of nTrials
  let c = 0; for (let i = 1; i <= nTrials; i++) c += 1 / i;
  const bhy = Math.min(1, p * nTrials * c);
  const tAdj = q => (q >= 1 ? 0 : normalInv(1 - q / 2));
  return {
    p, pBonferroni: bonf, pBHY: bhy,
    tBonferroni: tAdj(bonf), tBHY: tAdj(bhy),
    survivesBonferroni: bonf < alpha, survivesBHY: bhy < alpha,
    haircutPct: Math.abs(tStat) > 0 ? Math.max(0, 1 - tAdj(bhy) / Math.abs(tStat)) * 100 : 0,
  };
}

/* ======================= one-stop verdict ======================= */

/** Everything the headline scorecard needs, from one return series. */
export function verdict(x, { ppy = 252, trials = 1, varSR = null, alpha = 0.05, powerTarget = 0.8, seed = 1, L = null } = {}) {
  const n = x.length;
  const mo = moments(x);
  const m = mo.mean, s = mo.sd;
  const srPeriod = s > 0 ? m / s : 0;
  const srAnn = srPeriod * Math.sqrt(ppy);

  const se = sharpeSE(srPeriod, n, mo.skew, mo.kurtosis);
  const tNaive = s > 0 ? m / (s / Math.sqrt(n)) : 0;
  const lrv = neweyWestVar(x);
  const tNW = lrv > 0 ? m / Math.sqrt(lrv / n) : 0;

  const theMDE = mde(s, n, alpha, powerTarget);
  const vSR = varSR == null ? se * se : varSR;
  const dsr = trials > 1 ? deflatedSharpe(srPeriod, n, mo.skew, mo.kurtosis, trials, vSR) : null;

  return {
    n, ppy,
    meanPeriod: m, sdPeriod: s, skew: mo.skew, kurtosis: mo.kurtosis,
    sharpePeriod: srPeriod, sharpeAnnual: srAnn,
    sharpeSE: se, sharpeSEAnnual: se * Math.sqrt(ppy),
    sharpeCI: [(srPeriod - 1.959963984540054 * se) * Math.sqrt(ppy),
               (srPeriod + 1.959963984540054 * se) * Math.sqrt(ppy)],
    tNaive, tNeweyWest: tNW,
    pNaive: 2 * (1 - tCdf(Math.abs(tNaive), Math.max(1, n - 1))),
    pNeweyWest: 2 * (1 - normalCdf(Math.abs(tNW))),
    psr: psr(srPeriod, n, mo.skew, mo.kurtosis, 0),
    minTRL: minTrackRecord(srPeriod, mo.skew, mo.kurtosis, 0, 1 - alpha),
    mde: theMDE,
    mdeAnnualSharpe: mdeSharpe(n, alpha, powerTarget, ppy),
    mdeRatio: theMDE > 0 ? m / theMDE : 0,
    powerAtObserved: power(m, s, n, alpha),
    deflated: dsr,
    haircut: trials > 1 ? haircut(tNaive, trials, alpha) : null,
  };
}
