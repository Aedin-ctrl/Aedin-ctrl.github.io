/* rng.mjs -- seeded random numbers for the Monte Carlo lab.
 *
 * The whole point of this file is REPRODUCIBILITY. A result you cannot regenerate is
 * an anecdote. Two rules make that work here:
 *
 *   1. Path i draws from substream i, derived from (seed, i) alone. Nothing depends on
 *      how many workers ran, or in what order they finished. Eight cores and one core
 *      produce bit-identical output.
 *   2. Every distribution is built from one uniform generator, so the seed fully
 *      determines the run.
 *
 * sfc32 is the core: four 32-bit words, Math.imul-friendly, passes PractRand to 32TB.
 * It is seeded through splitmix32 so that nearby seeds (1, 2, 3...) decorrelate at once.
 */

/* ---- splitmix32: seed expander. Avalanches a counter into a well-mixed word. ---- */
export function splitmix32(a) {
  return function () {
    a |= 0; a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15);
    t = Math.imul(t, 0x735a2d97);
    return ((t = t ^ (t >>> 15)) >>> 0);
  };
}

/* ---- sfc32: the workhorse ---- */
export class RNG {
  /** @param {number} seed  @param {number} stream  substream index (the path number) */
  constructor(seed = 1, stream = 0) {
    this.seed = seed >>> 0;
    this.stream = stream >>> 0;
    // Mix seed and stream together before expanding, so that stream 0 of seed 2 shares
    // nothing with stream 1 of seed 1. Without this, a lattice shows up across runs.
    const mix = splitmix32((Math.imul(this.seed, 0x85ebca6b) ^ Math.imul(this.stream + 1, 0xc2b2ae35)) | 0);
    this.a = mix(); this.b = mix(); this.c = mix(); this.d = mix();
    // Discard the transient; sfc32 needs a warm-up before the state is well mixed.
    for (let i = 0; i < 20; i++) this.u32();
    this._spare = NaN;           // cached second normal from the polar method
  }

  u32() {
    let { a, b, c, d } = this;
    const t = (a + b | 0) + d | 0;
    d = d + 1 | 0;
    a = b ^ (b >>> 9);
    b = c + (c << 3) | 0;
    c = (c << 21) | (c >>> 11);
    c = c + t | 0;
    this.a = a; this.b = b; this.c = c; this.d = d;
    return t >>> 0;
  }

  /** uniform in [0,1). 32-bit resolution, which is plenty for path generation. */
  u() { return this.u32() * 2.3283064365386963e-10; }

  /** uniform in (0,1): never exactly 0, so log(u) is always finite. */
  uOpen() { return (this.u32() + 0.5) * 2.3283064365386963e-10; }

  /** uniform with 53 bits of resolution -- for tail work where 2^-32 granularity shows. */
  u53() {
    const hi = this.u32() >>> 5, lo = this.u32() >>> 6;
    return (hi * 67108864 + lo) * 1.1102230246251565e-16;
  }

  /** integer in [0,n). Debiased by rejection, so small n stay exactly uniform. */
  int(n) {
    if (n <= 0) return 0;
    const lim = 4294967296 - (4294967296 % n);
    let r = this.u32();
    while (r >= lim) r = this.u32();
    return r % n;
  }

  /** standard normal, Marsaglia polar. Reference quality; ziggurat below is the fast path. */
  normalPolar() {
    if (this._spare === this._spare) { const s = this._spare; this._spare = NaN; return s; }
    let u, v, s;
    do { u = this.u() * 2 - 1; v = this.u() * 2 - 1; s = u * u + v * v; } while (s >= 1 || s === 0);
    const m = Math.sqrt(-2 * Math.log(s) / s);
    this._spare = v * m;
    return u * m;
  }

  /** standard normal, ziggurat (Marsaglia-Tsang 2000). ~4x the polar method. */
  normal() {
    for (;;) {
      const j = this.u32();
      const i = j & 127;
      // Signed 32-bit value scaled into the layer. Using the same draw for sign and
      // magnitude is standard and keeps this to one u32 in the common case.
      const x = (j | 0) * ZIG_W[i];
      if (Math.abs(j | 0) < ZIG_K[i]) return x;
      if (i === 0) {
        // Tail: sample from the exponential tail beyond R by the Marsaglia method.
        let xx, yy;
        do { xx = -Math.log(this.uOpen()) * ZIG_RINV; yy = -Math.log(this.uOpen()); }
        while (yy + yy < xx * xx);
        return (j | 0) > 0 ? ZIG_R + xx : -ZIG_R - xx;
      }
      if (ZIG_F[i] + this.u() * (ZIG_F[i - 1] - ZIG_F[i]) < Math.exp(-0.5 * x * x)) return x;
    }
  }

  /** exponential, mean 1. */
  exponential() { return -Math.log(this.uOpen()); }

  /** Gamma(shape, 1), Marsaglia-Tsang. Valid for any shape > 0. */
  gamma(shape) {
    if (shape < 1) {
      // Boost: Gamma(a) = Gamma(a+1) * U^(1/a)
      return this.gamma(shape + 1) * Math.pow(this.uOpen(), 1 / shape);
    }
    const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x, v;
      do { x = this.normal(); v = 1 + c * x; } while (v <= 0);
      v = v * v * v;
      const u = this.uOpen();
      const x2 = x * x;
      if (u < 1 - 0.0331 * x2 * x2) return d * v;
      if (Math.log(u) < 0.5 * x2 + d * (1 - v + Math.log(v))) return d * v;
    }
  }

  /** chi-square with df degrees of freedom. */
  chi2(df) { return 2 * this.gamma(df / 2); }

  /** Student t with df degrees of freedom, UNIT VARIANCE (rescaled by sqrt((df-2)/df)).
   *  Rescaling matters: a raw t(3) has variance 3, so an unscaled t would silently
   *  triple the volatility of a model you asked to match a 16% annual series. */
  tUnit(df) {
    if (!(df > 2)) df = 2.05;                     // variance is undefined at df <= 2
    const z = this.normal(), w = this.chi2(df);
    return z * Math.sqrt(df / w) * Math.sqrt((df - 2) / df);
  }

  /** raw Student t (variance df/(df-2)). */
  tRaw(df) { return this.normal() * Math.sqrt(df / this.chi2(df)); }

  /** Poisson count, Knuth for small lambda, normal-ish rejection above 30. */
  poisson(lambda) {
    if (lambda <= 0) return 0;
    if (lambda < 30) {
      const L = Math.exp(-lambda);
      let k = 0, p = 1;
      do { k++; p *= this.u(); } while (p > L);
      return k - 1;
    }
    // Atkinson's method for large lambda.
    const c = 0.767 - 3.36 / lambda, beta = Math.PI / Math.sqrt(3 * lambda);
    const alpha = beta * lambda, k = Math.log(c) - lambda - Math.log(beta);
    for (;;) {
      const u = this.uOpen(), x = (alpha - Math.log((1 - u) / u)) / beta;
      const n = Math.floor(x + 0.5);
      if (n < 0) continue;
      const v = this.uOpen(), y = alpha - beta * x, t = 1 + Math.exp(y);
      const lhs = y + Math.log(v / (t * t));
      const rhs = k + n * Math.log(lambda) - logGamma(n + 1);
      if (lhs <= rhs) return n;
    }
  }

  /** Bernoulli. */
  bool(p) { return this.u() < p; }

  /** Fisher-Yates shuffle, in place. */
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
}

/** Log-gamma (Lanczos). Shared by the Poisson sampler and the stats module. */
export function logGamma(x) {
  const g = [76.18009172947146, -86.50532032941677, 24.01409824083091,
             -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += g[j] / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

/* ---- ziggurat tables, built once at module load ---- */
const ZIG_R = 3.442619855899;                 // rightmost layer boundary
const ZIG_RINV = 1 / ZIG_R;
const ZIG_K = new Int32Array(128);
const ZIG_W = new Float64Array(128);
const ZIG_F = new Float64Array(128);
(function buildZiggurat() {
  const m1 = 2147483648.0;                    // 2^31: the Int32 scale
  const vn = 9.91256303526217e-3;             // area of each layer
  let dn = ZIG_R, tn = ZIG_R;
  let q = vn / Math.exp(-0.5 * dn * dn);
  ZIG_K[0] = Math.floor((dn / q) * m1);
  ZIG_K[1] = 0;
  ZIG_W[0] = q / m1;
  ZIG_W[127] = dn / m1;
  ZIG_F[0] = 1.0;
  ZIG_F[127] = Math.exp(-0.5 * dn * dn);
  for (let i = 126; i >= 1; i--) {
    dn = Math.sqrt(-2 * Math.log(vn / dn + Math.exp(-0.5 * dn * dn)));
    ZIG_K[i + 1] = Math.floor((dn / tn) * m1);
    tn = dn;
    ZIG_F[i] = Math.exp(-0.5 * dn * dn);
    ZIG_W[i] = dn / m1;
  }
})();

/** Convenience: the generator for one path of one run. */
export const pathRNG = (seed, pathIndex) => new RNG(seed, pathIndex);

/** Stable 32-bit hash of a config object -- the run fingerprint shown in the UI. */
export function hashConfig(obj) {
  const s = JSON.stringify(obj, Object.keys(obj).sort());
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36).padStart(7, '0');
}
