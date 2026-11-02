/* generators.mjs -- the market models.
 *
 * Each generator fills a Float64Array of per-period SIMPLE returns from one RNG.
 * Each one also knows how to FIT itself to an attached series, so "what would this
 * strategy have looked like under a world that resembles my data" is one click.
 *
 * The honest framing the UI leans on: a bootstrap asks "what if the same returns
 * had arrived in a different order", a parametric model asks "what if the world
 * were really like this". They answer different questions and disagree on purpose.
 */
import { mean, variance, sd, moments, acf, sorted, quantileSorted } from './stats.mjs';
import { minimize, golden, squash, unsquash, softplus, invSoftplus } from './optim.mjs';

/* ============================ resampling models ============================ */

/** IID bootstrap: draw returns with replacement. Destroys every bit of serial
 *  structure -- volatility clustering included -- which is exactly why its drawdowns
 *  come out too mild on real data. */
function iidBootstrap(src) {
  const m = src.length;
  return (out, rng) => { for (let i = 0; i < out.length; i++) out[i] = src[rng.int(m)]; };
}

/** Permutation: the same returns, reordered, WITHOUT replacement. The terminal
 *  wealth of a full permutation is identical every time (multiplication commutes),
 *  so this only ever moves path shape, drawdown and ruin -- never the end point.
 *  That property is the point, and it is tested. */
function permutation(src) {
  const m = src.length;
  return (out, rng) => {
    const n = out.length;
    const idx = new Int32Array(m);
    for (let i = 0; i < m; i++) idx[i] = i;
    for (let i = m - 1; i > 0; i--) { const j = rng.int(i + 1); const t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
    for (let i = 0; i < n; i++) out[i] = src[idx[i % m]];
  };
}

/** Moving block bootstrap: glue together random contiguous blocks of length L.
 *  Keeps dependence inside a block, breaks it at the seams. */
function movingBlock(src, L) {
  const m = src.length, len = Math.max(1, Math.min(L | 0, m));
  const nStarts = m - len + 1;
  return (out, rng) => {
    const n = out.length;
    let i = 0;
    while (i < n) {
      const s = rng.int(nStarts);
      for (let j = 0; j < len && i < n; j++, i++) out[i] = src[s + j];
    }
  };
}

/** Circular block bootstrap: as above but the series wraps, so every observation
 *  gets equal weight (the moving-block version under-samples the two ends). */
function circularBlock(src, L) {
  const m = src.length, len = Math.max(1, Math.min(L | 0, m));
  return (out, rng) => {
    const n = out.length;
    let i = 0;
    while (i < n) {
      const s = rng.int(m);
      for (let j = 0; j < len && i < n; j++, i++) out[i] = src[(s + j) % m];
    }
  };
}

/** Stationary bootstrap (Politis & Romano 1994): geometric block lengths with mean L.
 *  The resampled series is strictly stationary, which the fixed-block versions are
 *  not. This is the default for anything with volatility clustering. */
function stationaryBootstrap(src, L) {
  const m = src.length;
  const p = 1 / Math.max(1, L);
  return (out, rng) => {
    const n = out.length;
    let idx = rng.int(m);
    for (let i = 0; i < n; i++) {
      if (i > 0) { if (rng.u() < p) idx = rng.int(m); else idx = (idx + 1) % m; }
      out[i] = src[idx];
    }
  };
}

/** Politis & White (2004) automatic block length for the stationary bootstrap.
 *  Without this the block length is a knob nobody knows how to set, and the honest
 *  answer -- "it depends on how much dependence is in your data" -- is computable. */
export function optimalBlockLength(x) {
  const n = x.length;
  if (n < 20) return { L: 1, mHat: 0, note: 'series too short to estimate' };
  const Kn = Math.max(5, Math.ceil(Math.sqrt(Math.log10(n))));
  const mMax = Math.max(5, Math.ceil(Math.sqrt(n)));
  const r = acf(x, Math.min(n - 2, mMax + Kn + 1));
  const crit = 2 * Math.sqrt(Math.log10(n) / n);

  // smallest m beyond which Kn consecutive autocorrelations are all insignificant
  let mHat = 0;
  for (let m = 1; m + Kn < r.length; m++) {
    let allSmall = true;
    for (let k = 1; k <= Kn; k++) if (Math.abs(r[m + k]) >= crit) { allSmall = false; break; }
    if (allSmall) { mHat = m; break; }
  }
  if (!mHat) mHat = Math.min(mMax, r.length - 1);
  const M = Math.min(2 * mHat, r.length - 1, Math.floor(n / 2));

  // flat-top lag window
  const lam = t => { const a = Math.abs(t); return a <= 0.5 ? 1 : (a <= 1 ? 2 * (1 - a) : 0); };
  const v = variance(x, 0);
  let G = 0, g0 = v;                           // k = 0 term
  for (let k = 1; k <= M; k++) {
    const w = lam(k / M), R = r[k] * v;
    G += 2 * w * k * R;
    g0 += 2 * w * R;
  }
  const D = 2 * g0 * g0;
  let L = D > 0 && G !== 0 ? Math.pow(2 * G * G / D, 1 / 3) * Math.pow(n, 1 / 3) : 1;
  const cap = Math.ceil(Math.min(3 * Math.sqrt(n), n / 3));
  L = Math.max(1, Math.min(cap, L));
  return { L: Math.round(L * 100) / 100, mHat, M, note: mHat <= 1 ? 'little serial dependence detected' : '' };
}

/* ============================ parametric models ============================ */

/** Geometric Brownian motion in discrete time: log-returns are iid normal.
 *  Parameters are stated in LOG space and converted, so that the arithmetic mean
 *  of the simple returns comes out where the caller asked. */
function gaussian(mu, sigma) {
  return (out, rng) => { for (let i = 0; i < out.length; i++) out[i] = mu + sigma * rng.normal(); };
}

/** Normal returns but compounded through logs -- the lognormal/GBM convention.
 *  Separated from the above because the distinction moves the median by a lot
 *  over long horizons, and conflating them is a classic overstatement. */
function gbm(muLog, sigma) {
  return (out, rng) => { for (let i = 0; i < out.length; i++) out[i] = Math.expm1(muLog + sigma * rng.normal()); };
}

/** Student-t innovations, rescaled to unit variance so df changes the SHAPE only. */
function studentT(mu, sigma, df) {
  return (out, rng) => { for (let i = 0; i < out.length; i++) out[i] = mu + sigma * rng.tUnit(df); };
}

/** log[ Gamma((df+1)/2) / Gamma(df/2) ] -- the ratio the t density and its absolute
 *  moment both need, computed in log space so large df do not overflow. */
function lgammaHalf(df) {
  const lg = n => {
    const g = [76.18009172947146, -86.50532032941677, 24.01409824083091,
      -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = n, tmp = n + 5.5; tmp -= (n + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) ser += g[j] / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / n);
  };
  return lg((df + 1) / 2) - lg(df / 2);
}

/** Mean absolute deviation of the UNIT-VARIANCE Student t.
 *  E|Y| = 2*sqrt(df-2)*Gamma((df+1)/2) / (sqrt(pi)*(df-1)*Gamma(df/2)).
 *  Tends to sqrt(2/pi) = 0.7979 as df -> infinity, which is the test that catches
 *  a dropped factor here. */
export function absMomentT(df) {
  if (!(df > 2)) df = 2.05;
  return 2 * Math.sqrt(df - 2) * Math.exp(lgammaHalf(df)) / (Math.sqrt(Math.PI) * (df - 1));
}

/** Centring and scaling constants for the Fernandez-Steel skew-t.
 *  For the FS construction E[Z^r] = M_r * (xi^(r+1) + (-1)^r xi^-(r+1)) / (xi + 1/xi),
 *  which collapses to E[Z] = E|Y|*(xi - 1/xi) and E[Z^2] = xi^2 + xi^-2 - 1.
 *  One helper, used by BOTH the sampler and the likelihood, so the two cannot drift
 *  apart -- they did, and the sd came out 16% high at xi = 0.6.  */
export function skewTStd(df, xi) {
  const x = Math.max(0.05, Math.min(20, xi));
  const M1 = absMomentT(df) * (x - 1 / x);
  const M2 = x * x + 1 / (x * x) - 1;
  const V = Math.max(1e-12, M2 - M1 * M1);
  return { xi: x, M1, V, scale: Math.sqrt(V) };
}

/** Fernandez-Steel skew-t: one extra parameter that stretches one side and squashes
 *  the other, re-centred and re-scaled so mu and sigma stay what the caller asked for.
 *  xi<1 is left-skewed (crash-like). */
function skewT(mu, sigma, df, xi) {
  const { xi: x, M1, scale } = skewTStd(df, xi);
  const pLeft = 1 / (1 + x * x);
  const inv = sigma / scale;
  return (out, rng) => {
    for (let i = 0; i < out.length; i++) {
      const t = Math.abs(rng.tUnit(df));
      const z = rng.u() < pLeft ? -t / x : t * x;
      out[i] = mu + inv * (z - M1);
    }
  };
}

/** Merton jump diffusion: a quiet diffusion plus rare Poisson jumps. The model that
 *  makes "it has never had a 20% day" stop being reassuring. */
function jumpDiffusion(mu, sigma, lambda, jMu, jSd) {
  return (out, rng) => {
    for (let i = 0; i < out.length; i++) {
      let r = mu + sigma * rng.normal();
      const k = rng.poisson(lambda);
      for (let j = 0; j < k; j++) r += jMu + jSd * rng.normal();
      out[i] = r;
    }
  };
}

/** GARCH(1,1): variance clusters. h_t = omega + alpha*e_{t-1}^2 + beta*h_{t-1}.
 *  This is the model that produces drawdowns of the size real ones have, because
 *  bad days arrive next to other bad days. */
function garch11(mu, omega, alpha, beta, df = 0, burn = 500) {
  const persist = alpha + beta;
  const uncond = persist < 1 ? omega / (1 - persist) : omega * 100;
  return (out, rng) => {
    let h = uncond, e = 0;
    const draw = df > 2 ? () => rng.tUnit(df) : () => rng.normal();
    for (let i = 0; i < burn; i++) { h = omega + alpha * e * e + beta * h; e = Math.sqrt(h) * draw(); }
    for (let i = 0; i < out.length; i++) {
      h = omega + alpha * e * e + beta * h;
      e = Math.sqrt(h) * draw();
      out[i] = mu + e;
    }
  };
}

/** AR(1) in returns: momentum (phi>0) or mean reversion (phi<0).
 *  sigma is the UNCONDITIONAL standard deviation, so moving phi does not secretly
 *  change the volatility of the series you asked for. */
function ar1(mu, sigma, phi, burn = 200) {
  const p = Math.max(-0.99, Math.min(0.99, phi));
  const se = sigma * Math.sqrt(1 - p * p);
  return (out, rng) => {
    let x = se * rng.normal() / Math.sqrt(1 - p * p);
    for (let i = 0; i < burn; i++) x = p * x + se * rng.normal();
    for (let i = 0; i < out.length; i++) { x = p * x + se * rng.normal(); out[i] = mu + x; }
  };
}

/** Two-state Markov regime switch. Calm and crisis have their own mean and vol and
 *  their own expected duration. Drawdowns come from spending a while in state 2. */
function regimeSwitch(mu1, sd1, mu2, sd2, p11, p22, df = 0) {
  return (out, rng) => {
    // start in the stationary distribution rather than always in the calm state
    const pi1 = (1 - p22) / Math.max(1e-9, (2 - p11 - p22));
    let s = rng.u() < pi1 ? 0 : 1;
    const draw = df > 2 ? () => rng.tUnit(df) : () => rng.normal();
    for (let i = 0; i < out.length; i++) {
      out[i] = s === 0 ? mu1 + sd1 * draw() : mu2 + sd2 * draw();
      s = s === 0 ? (rng.u() < p11 ? 0 : 1) : (rng.u() < p22 ? 1 : 0);
    }
  };
}

/** Deterministic replay of the attached series, tiled if the horizon is longer.
 *  The "no randomness at all" control -- the backtest itself, as one path. */
function replay(src) {
  return (out) => { for (let i = 0; i < out.length; i++) out[i] = src[i % src.length]; };
}

/* ============================ fitting ============================ */

/** Student-t df by profile maximum likelihood on standardised returns. */
export function fitT(x) {
  const m = mean(x), s = sd(x);
  const z = Float64Array.from(x, v => (v - m) / s);
  const nll = df => {
    if (!(df > 2.05)) return 1e12;
    const c = lgammaHalf(df) - 0.5 * Math.log(Math.PI * (df - 2));
    let L = 0;
    for (let i = 0; i < z.length; i++) L += c - (df + 1) / 2 * Math.log1p(z[i] * z[i] / (df - 2));
    return -L;
  };
  const { x: df } = golden(nll, 2.1, 60, 1e-6);
  return { mu: m, sigma: s, df: Math.round(df * 100) / 100 };
}

/** Fernandez-Steel skew-t by joint maximum likelihood over (xi, df).
 *  Fitting xi with df held fixed biases both: skewness makes a symmetric fit want
 *  heavier tails, which in turn flattens the apparent skew. The likelihood is written
 *  in the standardised parameterisation the sampler uses, so a fit of generated data
 *  returns the parameters that generated it. */
export function fitSkewT(x) {
  const m = mean(x), s = sd(x);
  const z = Float64Array.from(x, v => (v - m) / s);
  const n = z.length;
  const nll = p => {
    const xi = Math.exp(p[0]);
    const df = 2.05 + softplus(p[1]);
    if (!(xi > 0.05 && xi < 20) || !(df > 2.05) || df > 200) return 1e12;
    const { M1, scale } = skewTStd(df, xi);
    const c = Math.log(2 / (xi + 1 / xi)) + lgammaHalf(df) - 0.5 * Math.log(Math.PI * (df - 2)) + Math.log(scale);
    let L = 0;
    for (let i = 0; i < n; i++) {
      const Z = M1 + z[i] * scale;              // undo the standardisation
      const t = Z >= 0 ? Z / xi : Z * xi;
      L += c - (df + 1) / 2 * Math.log1p(t * t / (df - 2));
    }
    return Number.isFinite(L) ? -L : 1e12;
  };
  const res = minimize(nll, [0, invSoftplus(4)], { maxIter: 3000, restarts: 3 });
  const xi = Math.exp(res.x[0]);
  const df = 2.05 + softplus(res.x[1]);
  return { mu: m, sigma: s, df: Math.round(df * 100) / 100, xi: Math.round(xi * 1000) / 1000, logLik: -res.fx };
}

/** GARCH(1,1) by quasi-maximum likelihood. Parameters are optimised unconstrained
 *  and mapped through softplus/logistic so the search can never leave the region
 *  where the model is stationary (alpha + beta < 1) or the variance positive. */
export function fitGarch(x, { withT = false } = {}) {
  const n = x.length;
  const m = mean(x);
  const e = Float64Array.from(x, v => v - m);
  const v0 = variance(e, 0);
  if (n < 50 || !(v0 > 0)) return { mu: m, omega: v0 * 0.05, alpha: 0.08, beta: 0.88, df: 0, persistence: 0.96, ok: false, note: 'series too short to fit' };

  const nll = p => {
    // p = [logit(persistence), logit(alpha share), invSoftplus(omega scale)]
    const persist = squash(p[0], 0.05, 0.9995);
    const share = squash(p[1], 0.01, 0.6);
    const alpha = persist * share, beta = persist - alpha;
    const omega = softplus(p[2]) * v0 * (1 - persist);
    if (!(omega > 0) || !Number.isFinite(omega)) return 1e12;
    let h = v0, L = 0;
    for (let i = 0; i < n; i++) {
      if (i > 0) h = omega + alpha * e[i - 1] * e[i - 1] + beta * h;
      if (!(h > 1e-300) || !Number.isFinite(h)) return 1e12;
      L += -0.5 * (Math.log(h) + e[i] * e[i] / h);
    }
    return Number.isFinite(L) ? -L : 1e12;
  };
  const start = [unsquash(0.95, 0.05, 0.9995), unsquash(0.1, 0.01, 0.6), invSoftplus(1)];
  const res = minimize(nll, start, { maxIter: 4000, restarts: 4 });
  const persist = squash(res.x[0], 0.05, 0.9995);
  const share = squash(res.x[1], 0.01, 0.6);
  const alpha = persist * share, beta = persist - alpha;
  const omega = softplus(res.x[2]) * v0 * (1 - persist);

  let df = 0;
  if (withT) {
    // standardise by the fitted conditional vol, then fit df to what is left
    let h = v0; const z = new Float64Array(n);
    for (let i = 0; i < n; i++) { if (i > 0) h = omega + alpha * e[i - 1] * e[i - 1] + beta * h; z[i] = e[i] / Math.sqrt(h); }
    df = fitT(z).df;
  }
  return {
    mu: m, omega, alpha, beta, df,
    persistence: alpha + beta,
    uncondVol: Math.sqrt(omega / Math.max(1e-12, 1 - alpha - beta)),
    logLik: -res.fx, ok: res.converged,
  };
}

/** Two-state Gaussian hidden Markov model by Baum-Welch (EM).
 *  State 1 is forced to be the lower-volatility one so the labels never flip
 *  between runs -- a detail that otherwise makes the fitted table unreadable. */
export function fitRegime(x, { iters = 200, tol = 1e-8 } = {}) {
  const n = x.length;
  if (n < 100) return { ok: false, note: 'series too short for a regime fit' };
  const m = mean(x), s = sd(x);
  // start spread apart: calm = low vol, crisis = high vol and a lower mean
  let mu = [m + 0.1 * s, m - 0.3 * s];
  let sg = [s * 0.7, s * 1.8];
  let A = [[0.97, 0.03], [0.06, 0.94]];
  let pi = [0.8, 0.2];
  const K = 2;
  const pdf = (v, k) => Math.exp(-0.5 * ((v - mu[k]) / sg[k]) ** 2) / (sg[k] * 2.5066282746310002) + 1e-300;

  let prevLL = -Infinity, LL = -Infinity;
  const a = Array.from({ length: n }, () => new Float64Array(K));
  const b = Array.from({ length: n }, () => new Float64Array(K));
  const c = new Float64Array(n);
  const g = Array.from({ length: n }, () => new Float64Array(K));

  for (let it = 0; it < iters; it++) {
    // forward, scaled
    let sum = 0;
    for (let k = 0; k < K; k++) { a[0][k] = pi[k] * pdf(x[0], k); sum += a[0][k]; }
    c[0] = 1 / sum; for (let k = 0; k < K; k++) a[0][k] *= c[0];
    for (let t = 1; t < n; t++) {
      sum = 0;
      for (let k = 0; k < K; k++) {
        let acc = 0;
        for (let j = 0; j < K; j++) acc += a[t - 1][j] * A[j][k];
        a[t][k] = acc * pdf(x[t], k); sum += a[t][k];
      }
      c[t] = 1 / Math.max(sum, 1e-300);
      for (let k = 0; k < K; k++) a[t][k] *= c[t];
    }
    LL = 0; for (let t = 0; t < n; t++) LL -= Math.log(c[t]);

    // backward, same scaling
    for (let k = 0; k < K; k++) b[n - 1][k] = c[n - 1];
    for (let t = n - 2; t >= 0; t--) {
      for (let k = 0; k < K; k++) {
        let acc = 0;
        for (let j = 0; j < K; j++) acc += A[k][j] * pdf(x[t + 1], j) * b[t + 1][j];
        b[t][k] = acc * c[t];
      }
    }
    // posteriors
    for (let t = 0; t < n; t++) {
      let z = 0;
      for (let k = 0; k < K; k++) { g[t][k] = a[t][k] * b[t][k]; z += g[t][k]; }
      for (let k = 0; k < K; k++) g[t][k] /= Math.max(z, 1e-300);
    }
    // transitions
    const xi = [[0, 0], [0, 0]];
    for (let t = 0; t < n - 1; t++) {
      let z = 0; const w = [[0, 0], [0, 0]];
      for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) { w[i][j] = a[t][i] * A[i][j] * pdf(x[t + 1], j) * b[t + 1][j]; z += w[i][j]; }
      for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) xi[i][j] += w[i][j] / Math.max(z, 1e-300);
    }
    // M step
    for (let k = 0; k < K; k++) {
      let gs = 0, ms = 0;
      for (let t = 0; t < n; t++) { gs += g[t][k]; ms += g[t][k] * x[t]; }
      gs = Math.max(gs, 1e-300);
      mu[k] = ms / gs;
      let vs = 0;
      for (let t = 0; t < n; t++) vs += g[t][k] * (x[t] - mu[k]) ** 2;
      sg[k] = Math.max(Math.sqrt(vs / gs), s * 1e-4);
      let rs = xi[k][0] + xi[k][1];
      A[k][0] = xi[k][0] / Math.max(rs, 1e-300);
      A[k][1] = xi[k][1] / Math.max(rs, 1e-300);
      pi[k] = g[0][k];
    }
    if (Math.abs(LL - prevLL) < tol * Math.abs(LL)) break;
    prevLL = LL;
  }
  // canonical ordering: state 1 is the calm one
  if (sg[0] > sg[1]) { mu = [mu[1], mu[0]]; sg = [sg[1], sg[0]]; A = [[A[1][1], A[1][0]], [A[0][1], A[0][0]]]; }
  const pStat1 = (1 - A[1][1]) / Math.max(1e-9, 2 - A[0][0] - A[1][1]);
  return {
    ok: true, logLik: LL,
    mu1: mu[0], sd1: sg[0], mu2: mu[1], sd2: sg[1],
    p11: A[0][0], p22: A[1][1],
    meanDuration1: 1 / Math.max(1e-9, 1 - A[0][0]),
    meanDuration2: 1 / Math.max(1e-9, 1 - A[1][1]),
    timeInCalm: pStat1,
  };
}

/** Jump parameters by thresholding on a robust scale estimate. Anything past
 *  `k` robust sigmas is called a jump; the rest defines the diffusion. */
export function fitJumps(x, k = 3.5) {
  const n = x.length, m = mean(x);
  const a = sorted(x);
  const mad = quantileSorted(Float64Array.from(x, v => Math.abs(v - quantileSorted(a, 0.5))).sort(), 0.5);
  const rs = Math.max(1.4826 * mad, 1e-12);
  const body = [], jumps = [];
  for (let i = 0; i < n; i++) (Math.abs(x[i] - m) > k * rs ? jumps : body).push(x[i]);
  const jm = jumps.length ? mean(jumps) : 0;
  return {
    mu: body.length ? mean(body) : m,
    sigma: body.length > 1 ? sd(body) : rs,
    lambda: jumps.length / n,
    jMu: jumps.length ? jm - (body.length ? mean(body) : m) : 0,
    jSd: jumps.length > 1 ? sd(jumps) : rs * k,
    nJumps: jumps.length,
    threshold: k * rs,
  };
}

export function fitAR1(x) {
  const r = acf(x, 1);
  return { mu: mean(x), sigma: sd(x), phi: Math.max(-0.95, Math.min(0.95, r[1])) };
}

/* ============================ registry ============================ */

export const MODELS = {
  replay: {
    label: 'Replay (no randomness)', family: 'control', needsSource: true,
    params: [],
    build: (p, src) => replay(src),
    blurb: 'The attached series, repeated. One path, zero uncertainty -- the backtest itself, for reference.',
  },
  iid: {
    label: 'IID bootstrap', family: 'resample', needsSource: true,
    params: [],
    build: (p, src) => iidBootstrap(src),
    blurb: 'Draws your own returns with replacement. Keeps the distribution exactly; destroys all order and clustering.',
  },
  permute: {
    label: 'Permutation (reorder)', family: 'resample', needsSource: true,
    params: [],
    build: (p, src) => permutation(src),
    blurb: 'The same returns in a different order. Terminal wealth is fixed by construction -- only the ride changes.',
  },
  block: {
    label: 'Stationary bootstrap', family: 'resample', needsSource: true,
    params: [{ k: 'L', label: 'mean block', min: 1, max: 250, step: 1, def: 10, auto: 'blockLength' }],
    build: (p, src) => stationaryBootstrap(src, p.L),
    blurb: 'Geometric blocks of mean length L. Preserves dependence up to about L periods -- the right default for clustered volatility.',
  },
  circblock: {
    label: 'Circular block bootstrap', family: 'resample', needsSource: true,
    params: [{ k: 'L', label: 'block', min: 1, max: 250, step: 1, def: 20, auto: 'blockLength' }],
    build: (p, src) => circularBlock(src, p.L),
    blurb: 'Fixed-length blocks from a wrapped series, so every observation is equally likely to be used.',
  },
  movblock: {
    label: 'Moving block bootstrap', family: 'resample', needsSource: true,
    params: [{ k: 'L', label: 'block', min: 1, max: 250, step: 1, def: 20, auto: 'blockLength' }],
    build: (p, src) => movingBlock(src, p.L),
    blurb: 'Fixed-length blocks without wrapping. Under-weights the ends of the sample.',
  },
  normal: {
    label: 'Normal', family: 'parametric',
    params: [
      { k: 'mu', label: 'mean / period', min: -0.01, max: 0.01, step: 0.00001, def: 0.0004 },
      { k: 'sigma', label: 'sd / period', min: 0.0001, max: 0.2, step: 0.0001, def: 0.01 }],
    build: p => gaussian(p.mu, p.sigma),
    fit: x => ({ mu: mean(x), sigma: sd(x) }),
    blurb: 'Independent normal returns. The textbook world: no fat tails, no clustering, drawdowns far milder than real ones.',
  },
  gbm: {
    label: 'GBM (lognormal)', family: 'parametric',
    params: [
      { k: 'mu', label: 'log drift / period', min: -0.01, max: 0.01, step: 0.00001, def: 0.0003 },
      { k: 'sigma', label: 'log sd / period', min: 0.0001, max: 0.2, step: 0.0001, def: 0.01 }],
    build: p => gbm(p.mu, p.sigma),
    fit: x => { const l = Float64Array.from(x, v => Math.log1p(Math.max(-0.999999, v))); return { mu: mean(l), sigma: sd(l) }; },
    blurb: 'Normal LOG returns. Prices stay positive and the median path falls below the mean path -- the volatility drag made explicit.',
  },
  t: {
    label: 'Student-t', family: 'parametric',
    params: [
      { k: 'mu', label: 'mean / period', min: -0.01, max: 0.01, step: 0.00001, def: 0.0004 },
      { k: 'sigma', label: 'sd / period', min: 0.0001, max: 0.2, step: 0.0001, def: 0.01 },
      { k: 'df', label: 'tail (df)', min: 2.1, max: 50, step: 0.1, def: 4 }],
    build: p => studentT(p.mu, p.sigma, p.df),
    fit: fitT,
    blurb: 'Fat tails at the same volatility. Low df means the worst day is much worse than a normal model admits.',
  },
  skewt: {
    label: 'Skewed Student-t', family: 'parametric',
    params: [
      { k: 'mu', label: 'mean / period', min: -0.01, max: 0.01, step: 0.00001, def: 0.0004 },
      { k: 'sigma', label: 'sd / period', min: 0.0001, max: 0.2, step: 0.0001, def: 0.01 },
      { k: 'df', label: 'tail (df)', min: 2.1, max: 50, step: 0.1, def: 5 },
      { k: 'xi', label: 'skew', min: 0.3, max: 3, step: 0.01, def: 0.9 }],
    build: p => skewT(p.mu, p.sigma, p.df, p.xi),
    fit: fitSkewT,
    blurb: 'Fat tails that are fatter on one side. Below 1 the left tail dominates -- crashes bigger than rallies.',
  },
  jump: {
    label: 'Jump diffusion', family: 'parametric',
    params: [
      { k: 'mu', label: 'mean / period', min: -0.01, max: 0.01, step: 0.00001, def: 0.0005 },
      { k: 'sigma', label: 'diffusion sd', min: 0.0001, max: 0.2, step: 0.0001, def: 0.008 },
      { k: 'lambda', label: 'jumps / period', min: 0, max: 0.2, step: 0.0005, def: 0.01 },
      { k: 'jMu', label: 'jump mean', min: -0.3, max: 0.3, step: 0.001, def: -0.03 },
      { k: 'jSd', label: 'jump sd', min: 0.001, max: 0.3, step: 0.001, def: 0.04 }],
    build: p => jumpDiffusion(p.mu, p.sigma, p.lambda, p.jMu, p.jSd),
    fit: fitJumps,
    blurb: 'A calm diffusion plus rare Poisson jumps. Generates the event that is not in your sample yet.',
  },
  garch: {
    label: 'GARCH(1,1)', family: 'parametric',
    params: [
      { k: 'mu', label: 'mean / period', min: -0.01, max: 0.01, step: 0.00001, def: 0.0004 },
      { k: 'omega', label: 'omega', min: 1e-9, max: 1e-4, step: 1e-9, def: 2e-6 },
      { k: 'alpha', label: 'alpha (shock)', min: 0, max: 0.6, step: 0.001, def: 0.09 },
      { k: 'beta', label: 'beta (memory)', min: 0, max: 0.999, step: 0.001, def: 0.89 },
      { k: 'df', label: 'tail (0 = normal)', min: 0, max: 50, step: 0.1, def: 0 }],
    build: p => garch11(p.mu, p.omega, p.alpha, p.beta, p.df),
    fit: x => fitGarch(x, { withT: true }),
    blurb: 'Volatility clusters: bad days arrive next to bad days. This is what makes simulated drawdowns look like real ones.',
  },
  ar1: {
    label: 'AR(1) momentum / reversion', family: 'parametric',
    params: [
      { k: 'mu', label: 'mean / period', min: -0.01, max: 0.01, step: 0.00001, def: 0.0004 },
      { k: 'sigma', label: 'sd / period', min: 0.0001, max: 0.2, step: 0.0001, def: 0.01 },
      { k: 'phi', label: 'phi', min: -0.95, max: 0.95, step: 0.01, def: 0 }],
    build: p => ar1(p.mu, p.sigma, p.phi),
    fit: fitAR1,
    blurb: 'Returns that remember the last one. Positive phi trends, negative phi mean-reverts; sigma stays the unconditional volatility either way.',
  },
  regime: {
    label: 'Two-state regime switch', family: 'parametric',
    params: [
      { k: 'mu1', label: 'calm mean', min: -0.01, max: 0.01, step: 0.00001, def: 0.0008 },
      { k: 'sd1', label: 'calm sd', min: 0.0001, max: 0.1, step: 0.0001, def: 0.006 },
      { k: 'mu2', label: 'crisis mean', min: -0.02, max: 0.01, step: 0.00001, def: -0.0015 },
      { k: 'sd2', label: 'crisis sd', min: 0.0001, max: 0.3, step: 0.0001, def: 0.022 },
      { k: 'p11', label: 'stay calm', min: 0.5, max: 0.999, step: 0.001, def: 0.985 },
      { k: 'p22', label: 'stay in crisis', min: 0.5, max: 0.999, step: 0.001, def: 0.94 }],
    build: p => regimeSwitch(p.mu1, p.sd1, p.mu2, p.sd2, p.p11, p.p22),
    fit: fitRegime,
    blurb: 'A calm world and a crisis world, each sticky. Long drawdowns come from spending a stretch in the second one.',
  },
};

/** Build the fill function for a model id + params, against an optional source. */
export function makeGenerator(id, params, source) {
  const M = MODELS[id];
  if (!M) throw new Error(`unknown model: ${id}`);
  if (M.needsSource && (!source || !source.length)) throw new Error(`${M.label} needs an attached series`);
  return M.build(params, source);
}

/** Fit every fittable model to a series; used by the "fit to my data" button. */
export function fitAll(x) {
  const out = {};
  for (const [id, M] of Object.entries(MODELS)) {
    if (!M.fit) continue;
    try { out[id] = M.fit(x); } catch (e) { out[id] = { error: String(e.message || e) }; }
  }
  out._block = optimalBlockLength(x);
  return out;
}
