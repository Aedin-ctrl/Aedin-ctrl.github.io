/* stats.mjs -- distributions, moments, and the hypothesis-test plumbing.
 *
 * Everything here is pure and testable against published values. Where an
 * approximation is used, its accuracy is stated, because a p-value that is wrong
 * in the third decimal still crosses 0.05 in the wrong direction sometimes.
 */
import { logGamma } from './rng.mjs';

export { logGamma };

/* =================== moments =================== */

export function mean(x) {
  let s = 0; const n = x.length;
  for (let i = 0; i < n; i++) s += x[i];
  return n ? s / n : NaN;
}

/** Sample variance, ddof=1 by default. Two-pass for numerical stability. */
export function variance(x, ddof = 1) {
  const n = x.length; if (n - ddof <= 0) return NaN;
  const m = mean(x);
  let s = 0, c = 0;
  for (let i = 0; i < n; i++) { const d = x[i] - m; s += d * d; c += d; }
  // c should be 0; subtracting c^2/n removes the accumulated rounding in m.
  return (s - c * c / n) / (n - ddof);
}

export const sd = (x, ddof = 1) => Math.sqrt(variance(x, ddof));

/** Fisher (excess) kurtosis and skewness, population form (the "g" statistics). */
export function moments(x) {
  const n = x.length;
  const m = mean(x);
  let m2 = 0, m3 = 0, m4 = 0;
  for (let i = 0; i < n; i++) { const d = x[i] - m, d2 = d * d; m2 += d2; m3 += d2 * d; m4 += d2 * d2; }
  m2 /= n; m3 /= n; m4 /= n;
  const s = Math.sqrt(m2);
  return {
    n, mean: m,
    sd: Math.sqrt(variance(x, 1)),
    skew: m2 > 0 ? m3 / (s * s * s) : 0,
    kurtosis: m2 > 0 ? m4 / (m2 * m2) - 3 : 0,   // excess
  };
}

/** Streaming moments -- what the workers accumulate so no path has to be stored. */
export class Welford {
  constructor() { this.n = 0; this.m = 0; this.M2 = 0; this.M3 = 0; this.M4 = 0; this.min = Infinity; this.max = -Infinity; }
  push(x) {
    if (!Number.isFinite(x)) return;
    const n1 = this.n; const n = ++this.n;
    const d = x - this.m, dn = d / n, dn2 = dn * dn, t = d * dn * n1;
    this.m += dn;
    this.M4 += t * dn2 * (n * n - 3 * n + 3) + 6 * dn2 * this.M2 - 4 * dn * this.M3;
    this.M3 += t * dn * (n - 2) - 3 * dn * this.M2;
    this.M2 += t;
    if (x < this.min) this.min = x;
    if (x > this.max) this.max = x;
  }
  /** Chan's parallel merge -- lets each worker return one of these. */
  merge(o) {
    if (!o || !o.n) return this;
    if (!this.n) { Object.assign(this, o); return this; }
    const na = this.n, nb = o.n, n = na + nb;
    const d = o.m - this.m, d2 = d * d, d3 = d2 * d, d4 = d2 * d2;
    const M4 = this.M4 + o.M4 + d4 * na * nb * (na * na - na * nb + nb * nb) / (n * n * n)
      + 6 * d2 * (na * na * o.M2 + nb * nb * this.M2) / (n * n)
      + 4 * d * (na * o.M3 - nb * this.M3) / n;
    const M3 = this.M3 + o.M3 + d3 * na * nb * (na - nb) / (n * n)
      + 3 * d * (na * o.M2 - nb * this.M2) / n;
    const M2 = this.M2 + o.M2 + d2 * na * nb / n;
    this.m += d * nb / n; this.M2 = M2; this.M3 = M3; this.M4 = M4; this.n = n;
    this.min = Math.min(this.min, o.min); this.max = Math.max(this.max, o.max);
    return this;
  }
  get variance() { return this.n > 1 ? this.M2 / (this.n - 1) : NaN; }
  get sd() { return Math.sqrt(this.variance); }
  get skew() { return this.n > 2 && this.M2 > 0 ? Math.sqrt(this.n) * this.M3 / Math.pow(this.M2, 1.5) : 0; }
  get kurtosis() { return this.n > 3 && this.M2 > 0 ? this.n * this.M4 / (this.M2 * this.M2) - 3 : 0; }
  /** Standard error of the mean -- the Monte Carlo error bar on every headline number. */
  get se() { return this.n > 1 ? this.sd / Math.sqrt(this.n) : NaN; }
  toJSON() { return { n: this.n, m: this.m, M2: this.M2, M3: this.M3, M4: this.M4, min: this.min, max: this.max }; }
  static from(o) { const w = new Welford(); Object.assign(w, o); return w; }
}

/* =================== order statistics =================== */

export function sorted(x) {
  const a = (x instanceof Float64Array) ? x.slice() : Float64Array.from(x);
  a.sort();
  return a;
}

/** Quantile of an ALREADY SORTED array. Type 7 (numpy/R default): linear interpolation. */
export function quantileSorted(a, p) {
  const n = a.length;
  if (!n) return NaN;
  if (n === 1) return a[0];
  const h = (n - 1) * Math.min(1, Math.max(0, p));
  const lo = Math.floor(h), hi = Math.ceil(h);
  return a[lo] + (h - lo) * (a[hi] - a[lo]);
}

export function quantile(x, p) { return quantileSorted(sorted(x), p); }

/** Several quantiles in one sort. */
export function quantiles(x, ps) {
  const a = sorted(x);
  return ps.map(p => quantileSorted(a, p));
}

export const median = x => quantile(x, 0.5);

/** Fraction of the sample at or below v -- the empirical CDF, on a sorted array. */
export function ecdfSorted(a, v) {
  let lo = 0, hi = a.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (a[mid] <= v) lo = mid + 1; else hi = mid; }
  return lo / a.length;
}

/* =================== normal distribution =================== */

/** erfc with ~1.2e-7 relative accuracy (Numerical Recipes 6.2.2). */
export function erfc(x) {
  const z = Math.abs(x), t = 2 / (2 + z);
  const ty = 4 * t - 2;
  const cof = [-1.3026537197817094, 6.4196979235649026e-1, 1.9476473204185836e-2,
    -9.561514786808631e-3, -9.46595344482036e-4, 3.66839497852761e-4, 4.2523324806907e-5,
    -2.0278578112534e-5, -1.624290004647e-6, 1.303655835580e-6, 1.5626441722e-8,
    -8.5238095915e-8, 6.529054439e-9, 5.059343495e-9, -9.91364156e-10, -2.27365122e-10,
    9.6467911e-11, 2.394038e-12, -6.886027e-12, 8.94487e-13, 3.13092e-13,
    -1.12708e-13, 3.81e-16, 7.106e-15];
  let d = 0, dd = 0;
  for (let j = cof.length - 1; j > 0; j--) { const tmp = d; d = ty * d - dd + cof[j]; dd = tmp; }
  const ans = t * Math.exp(-z * z + 0.5 * (cof[0] + ty * d) - dd);
  return x >= 0 ? ans : 2 - ans;
}

export const erf = x => 1 - erfc(x);

/** Standard normal CDF.
 *  Verified to ~1e-15 relative error from the body out to z = -26, against an
 *  independent continued-fraction erfc. (A Taylor-series reference disagrees past
 *  x~2.5, but that is the reference losing precision to cancellation, not this.)
 *  Phi(0) returns 0.5 + 8e-16 rather than exactly 0.5 -- the Chebyshev erfc's one
 *  cosmetic wart, far below anything a p-value cares about. */
export function normalCdf(z) { return 0.5 * erfc(-z * Math.SQRT1_2); }

export function normalPdf(z) { return 0.3989422804014327 * Math.exp(-0.5 * z * z); }

/** Inverse standard normal CDF. Acklam's rational approximation refined by one
 *  Halley step against erfc, which takes it to full double precision. */
export function normalInv(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
    1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
    6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
    -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
    3.754408661907416e+00];
  const pl = 0.02425, ph = 1 - pl;
  let x;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= ph) {
    const q = p - 0.5, r = q * q;
    x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
        (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
         ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const e = 0.5 * erfc(-x * Math.SQRT1_2) - p;
  const u = e * 2.5066282746310002 * Math.exp(x * x / 2);
  return x - u / (1 + x * u / 2);
}

/* =================== gamma / beta / t / chi2 =================== */

/** Regularised incomplete gamma P(a,x), series + continued fraction. */
export function gammaP(a, x) {
  if (x < 0 || a <= 0) return NaN;
  if (x === 0) return 0;
  if (x < a + 1) {
    let ap = a, sum = 1 / a, del = sum;
    for (let n = 0; n < 500; n++) {
      ap++; del *= x / ap; sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-16) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
  }
  // continued fraction for Q, then P = 1 - Q
  const FPMIN = 1e-300;
  let b = x + 1 - a, c = 1 / FPMIN, d = 1 / b, h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2; d = an * d + b; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

export const chi2Cdf = (x, df) => gammaP(df / 2, x / 2);

/** Regularised incomplete beta I_x(a,b) by Lentz's continued fraction. */
export function betaI(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbeta = logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x);
  const front = Math.exp(lbeta);
  const cf = (x, a, b) => {
    const FPMIN = 1e-300;
    const qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
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
  // The series converges fast only for x < (a+1)/(a+b+2); otherwise use the symmetry.
  return x < (a + 1) / (a + b + 2)
    ? front * cf(x, a, b) / a
    : 1 - Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + b * Math.log(1 - x) + a * Math.log(x)) * cf(1 - x, b, a) / b;
}

/** Student t CDF. */
export function tCdf(t, df) {
  if (!(df > 0)) return NaN;
  const x = df / (df + t * t);
  const p = 0.5 * betaI(x, df / 2, 0.5);
  return t > 0 ? 1 - p : p;
}

/** Two-sided p-value for a t statistic. */
export const tTwoSided = (t, df) => 2 * (1 - tCdf(Math.abs(t), df));

/** Two-sided p-value for a z statistic. */
export const zTwoSided = z => 2 * (1 - normalCdf(Math.abs(z)));

/** Inverse Student t CDF, by bisection on tCdf. Accurate to 1e-10. */
export function tInv(p, df) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  let lo = -200, hi = 200;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (tCdf(mid, df) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Binomial test, two-sided, exact. Used for hit-rate questions. */
export function binomTest(k, n, p = 0.5) {
  if (n === 0) return 1;
  const lpmf = i => logGamma(n + 1) - logGamma(i + 1) - logGamma(n - i + 1) + i * Math.log(p) + (n - i) * Math.log(1 - p);
  const obs = lpmf(k) + 1e-12;
  let s = 0;
  for (let i = 0; i <= n; i++) { const l = lpmf(i); if (l <= obs) s += Math.exp(l); }
  return Math.min(1, s);
}

/** Wilson score interval for a proportion -- behaves at the edges where normal-approx does not. */
export function wilson(k, n, conf = 0.95) {
  if (!n) return [NaN, NaN];
  const z = normalInv(1 - (1 - conf) / 2), ph = k / n;
  const d = 1 + z * z / n;
  const c = (ph + z * z / (2 * n)) / d;
  const h = z * Math.sqrt(ph * (1 - ph) / n + z * z / (4 * n * n)) / d;
  return [c - h, c + h];
}

/* =================== serial dependence =================== */

/** Autocorrelation at lags 1..maxLag (sample ACF, divided by n). */
export function acf(x, maxLag = 20) {
  const n = x.length, m = mean(x);
  let c0 = 0;
  for (let i = 0; i < n; i++) { const d = x[i] - m; c0 += d * d; }
  c0 /= n;
  const out = new Float64Array(maxLag + 1);
  out[0] = 1;
  if (c0 === 0) return out;
  for (let k = 1; k <= maxLag && k < n; k++) {
    let c = 0;
    for (let i = k; i < n; i++) c += (x[i] - m) * (x[i - k] - m);
    out[k] = (c / n) / c0;
  }
  return out;
}

/** Ljung-Box Q and its p-value: is there any serial dependence out to lag h? */
export function ljungBox(x, h = 10) {
  const n = x.length, r = acf(x, h);
  let q = 0;
  for (let k = 1; k <= h; k++) q += r[k] * r[k] / (n - k);
  q *= n * (n + 2);
  return { q, df: h, p: 1 - chi2Cdf(q, h) };
}

/** Newey-West long-run variance of a series (Bartlett kernel).
 *  Without this, a t-stat on autocorrelated returns is overstated -- and intraday
 *  strategy returns are almost always autocorrelated. */
export function neweyWestVar(x, lag = null) {
  const n = x.length;
  if (n < 3) return variance(x, 1);
  const L = lag == null ? Math.max(1, Math.floor(4 * Math.pow(n / 100, 2 / 9))) : lag;
  const m = mean(x);
  let g0 = 0;
  for (let i = 0; i < n; i++) { const d = x[i] - m; g0 += d * d; }
  g0 /= n;
  let s = g0;
  for (let k = 1; k <= L && k < n; k++) {
    let g = 0;
    for (let i = k; i < n; i++) g += (x[i] - m) * (x[i - k] - m);
    g /= n;
    s += 2 * (1 - k / (L + 1)) * g;
  }
  return Math.max(s, 1e-300) * n / (n - 1);
}

/** OLS slope/intercept of y on x, with the usual standard errors. */
export function ols(x, y) {
  const n = Math.min(x.length, y.length);
  const mx = mean(x.slice(0, n)), my = mean(y.slice(0, n));
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { const dx = x[i] - mx; sxy += dx * (y[i] - my); sxx += dx * dx; }
  const beta = sxx > 0 ? sxy / sxx : 0;
  const alpha = my - beta * mx;
  let sse = 0;
  for (let i = 0; i < n; i++) { const e = y[i] - alpha - beta * x[i]; sse += e * e; }
  const s2 = n > 2 ? sse / (n - 2) : NaN;
  const seB = sxx > 0 ? Math.sqrt(s2 / sxx) : NaN;
  const sst = (() => { let s = 0; for (let i = 0; i < n; i++) { const d = y[i] - my; s += d * d; } return s; })();
  return { alpha, beta, seBeta: seB, tBeta: beta / seB, r2: sst > 0 ? 1 - sse / sst : 0, n };
}

/** Pearson correlation with its Fisher-z p-value. */
export function corr(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 3) return { r: NaN, p: NaN, n };
  const mx = mean(x.slice(0, n)), my = mean(y.slice(0, n));
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const a = x[i] - mx, b = y[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  const r = sxy / Math.sqrt(sxx * syy);
  const rc = Math.max(-0.999999999, Math.min(0.999999999, r));
  const z = 0.5 * Math.log((1 + rc) / (1 - rc)) * Math.sqrt(n - 3);
  return { r, p: zTwoSided(z), n };
}

/** Spearman rank correlation -- the rank version, robust to the fat tails in returns. */
export function spearman(x, y) {
  const n = Math.min(x.length, y.length);
  const rank = v => {
    const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => v[a] - v[b]);
    const r = new Float64Array(n);
    let i = 0;
    while (i < n) {
      let j = i; while (j + 1 < n && v[idx[j + 1]] === v[idx[i]]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[idx[k]] = avg;
      i = j + 1;
    }
    return r;
  };
  return corr(rank(x), rank(y));
}

/** One-sample Kolmogorov-Smirnov against a CDF. Used to prove the samplers are right. */
export function ksTest(x, cdf) {
  const a = sorted(x), n = a.length;
  let d = 0;
  for (let i = 0; i < n; i++) {
    const F = cdf(a[i]);
    d = Math.max(d, Math.max((i + 1) / n - F, F - i / n));
  }
  // Kolmogorov asymptotic tail
  const en = Math.sqrt(n), lam = (en + 0.12 + 0.11 / en) * d;
  let s = 0, sign = 1;
  for (let j = 1; j <= 100; j++) { s += sign * Math.exp(-2 * j * j * lam * lam); sign = -sign; }
  return { d, p: Math.max(0, Math.min(1, 2 * s)) };
}

/** Chi-square goodness-of-fit for equal-probability bins. */
export function chi2Uniform(counts, expected) {
  let q = 0;
  for (let i = 0; i < counts.length; i++) { const d = counts[i] - expected; q += d * d / expected; }
  return { q, df: counts.length - 1, p: 1 - chi2Cdf(q, counts.length - 1) };
}

/** Jarque-Bera normality test. */
export function jarqueBera(x) {
  const { n, skew, kurtosis } = moments(x);
  const jb = n / 6 * (skew * skew + kurtosis * kurtosis / 4);
  return { jb, p: 1 - chi2Cdf(jb, 2) };
}

/* =================== misc =================== */

export function linspace(a, b, n) {
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = n === 1 ? a : a + (b - a) * i / (n - 1);
  return out;
}

export const clamp = (x, a, b) => x < a ? a : (x > b ? b : x);

/** Histogram with fixed bins; returns edges and counts. */
export function histogram(x, bins = 50, lo = null, hi = null) {
  let mn = lo, mx = hi;
  if (mn == null || mx == null) {
    mn = Infinity; mx = -Infinity;
    for (let i = 0; i < x.length; i++) { if (x[i] < mn) mn = x[i]; if (x[i] > mx) mx = x[i]; }
  }
  if (!(mx > mn)) { mx = mn + 1; }
  const counts = new Float64Array(bins), w = (mx - mn) / bins;
  for (let i = 0; i < x.length; i++) {
    let b = Math.floor((x[i] - mn) / w);
    if (b < 0) b = 0; if (b >= bins) b = bins - 1;
    counts[b]++;
  }
  const edges = new Float64Array(bins + 1);
  for (let i = 0; i <= bins; i++) edges[i] = mn + i * w;
  return { counts, edges, lo: mn, hi: mx, width: w, n: x.length };
}
