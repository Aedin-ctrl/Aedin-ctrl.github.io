/* strategy.mjs -- attaching your own code, and proving it does not cheat.
 *
 * The contract is deliberately tiny:
 *
 *     function strategy(market, pos, ctx) { ... }
 *
 *   market : Float64Array of this path's per-period returns
 *   pos    : Float64Array you fill -- pos[t] is the exposure HELD THROUGH bar t
 *   ctx    : { n, ppy, params, random() }
 *
 * The one rule: pos[t] may depend on market[0 .. t-1] and nothing later.
 *
 * That rule is not a suggestion here. detectLookahead below runs the strategy on
 * two markets that are identical up to bar k and different afterwards, and checks
 * that every position up to and including k is bit-identical. A strategy that peeks
 * one bar into the future cannot survive that, which is the single most valuable
 * thing this module does -- look-ahead is the bug that makes a backtest beautiful
 * and a live account empty.
 */
import { RNG } from './rng.mjs';

export const STRATEGY_HEADER =
`// market : Float64Array of this path's per-period returns
// pos    : fill this -- pos[t] is the exposure held THROUGH bar t
// ctx    : { n, ppy, params, random() }
// RULE   : pos[t] may use market[0..t-1] only. The look-ahead check enforces it.
`;

/** Compile user source into a callable. Accepts either a bare body or a function
 *  declaration/expression. Throws with a useful message on a syntax error. */
export function compileStrategy(src) {
  const text = String(src || '').trim();
  if (!text) throw new Error('strategy is empty');
  let fn;
  const wrapped = /^\s*(function\b|\(|async\b|[A-Za-z_$][\w$]*\s*=>)/.test(text)
    ? `return (${text});`
    : `${text}\n; return typeof strategy === 'function' ? strategy : null;`;
  try {
    // eslint-disable-next-line no-new-func
    fn = new Function(wrapped)();
  } catch (e) {
    throw new Error(`could not compile: ${e.message}`);
  }
  if (typeof fn !== 'function') {
    throw new Error('no function found -- define `function strategy(market, pos, ctx) { ... }`');
  }
  return fn;
}

/** Run a strategy once, defensively. Returns {pos, error, elapsed}. */
export function trialRun(fn, n = 200, seed = 1) {
  const rng = new RNG(seed, 0);
  const market = new Float64Array(n);
  for (let i = 0; i < n; i++) market[i] = 0.0004 + 0.01 * rng.normal();
  const pos = new Float64Array(n);
  const ctx = { n, ppy: 252, params: {}, random: () => rng.u() };
  const t0 = (globalThis.performance || Date).now();
  try {
    fn(market, pos, ctx);
  } catch (e) {
    return { error: `threw on bar data: ${e.message}`, pos, elapsed: 0 };
  }
  const elapsed = (globalThis.performance || Date).now() - t0;
  let bad = 0;
  for (let i = 0; i < n; i++) if (!Number.isFinite(pos[i])) bad++;
  return {
    pos, elapsed,
    error: bad === n ? 'every position is NaN or undefined -- did you write to `pos`?' : null,
    warning: bad > 0 && bad < n ? `${bad} of ${n} positions were not finite and will be treated as flat` : null,
    maxAbs: Math.max(...Array.from(pos, v => (Number.isFinite(v) ? Math.abs(v) : 0))),
    changes: (() => { let c = 0; for (let i = 1; i < n; i++) if (pos[i] !== pos[i - 1]) c++; return c; })(),
  };
}

/** Prove -- or disprove -- that a strategy only uses the past.
 *
 *  For each probe k: build two markets identical on [0, k) and different on [k, n).
 *  Every position up to and including k must be unchanged, because pos[k] is only
 *  allowed to see market[0..k-1]. Any difference at or before k is a look-ahead.
 */
export function detectLookahead(fn, { n = 240, probes = 12, seed = 1 } = {}) {
  const rngBase = new RNG(seed, 0);
  const base = new Float64Array(n);
  for (let i = 0; i < n; i++) base[i] = 0.0004 + 0.012 * rngBase.normal();

  const posA = new Float64Array(n), posB = new Float64Array(n);
  const ctx = k => ({ n, ppy: 252, params: {}, random: () => 0.5 });

  const run = (mkt, out) => {
    out.fill(0);
    fn(mkt, out, ctx());
    for (let i = 0; i < n; i++) if (!Number.isFinite(out[i])) out[i] = 0;
  };

  run(base, posA);
  const violations = [];
  for (let p = 0; p < probes; p++) {
    const k = Math.floor(n * (p + 1) / (probes + 1));
    const alt = Float64Array.from(base);
    const r = new RNG(seed + 1000 + p, 0);
    // change everything from bar k onward, substantially
    for (let i = k; i < n; i++) alt[i] = -base[i] + 0.03 * r.normal();
    run(alt, posB);
    for (let t = 0; t <= k; t++) {
      if (posA[t] !== posB[t]) {
        violations.push({ probe: k, bar: t, before: posA[t], after: posB[t], lead: k - t });
        break;
      }
    }
  }
  const worst = violations.length ? Math.max(...violations.map(v => v.lead)) : -1;
  return {
    clean: violations.length === 0,
    violations,
    probes,
    // how far ahead it peeked: a violation at bar t from a change at k means the
    // strategy saw at least (k - t + 1) bars into the future.
    barsAhead: worst < 0 ? 0 : worst + 1,
    message: violations.length === 0
      ? 'No look-ahead detected: positions depend only on earlier bars.'
      : `LOOK-AHEAD: changing the market at bar ${violations[0].probe} changed the position at bar ${violations[0].bar}, which was already decided. The strategy sees at least ${worst + 1} bar(s) into the future.`,
  };
}

/** Check a strategy is deterministic given the same market (unless it uses random). */
export function checkDeterminism(fn, { n = 200, seed = 3 } = {}) {
  const r = new RNG(seed, 0);
  const market = new Float64Array(n);
  for (let i = 0; i < n; i++) market[i] = 0.0005 + 0.011 * r.normal();
  const a = new Float64Array(n), b = new Float64Array(n);
  const mk = () => ({ n, ppy: 252, params: {}, random: () => 0.5 });
  fn(market, a, mk()); fn(market, b, mk());
  for (let i = 0; i < n; i++) if (a[i] !== b[i] && !(Number.isNaN(a[i]) && Number.isNaN(b[i]))) {
    return { deterministic: false, bar: i };
  }
  return { deterministic: true };
}

/** Full pre-flight before a strategy is allowed into a run. */
export function validateStrategy(src, opts = {}) {
  let fn;
  try { fn = compileStrategy(src); }
  catch (e) { return { ok: false, stage: 'compile', message: e.message }; }

  const t = trialRun(fn, opts.n || 240);
  if (t.error) return { ok: false, stage: 'run', message: t.error, fn };

  const la = detectLookahead(fn, { n: opts.n || 240 });
  const det = checkDeterminism(fn);

  return {
    ok: true, fn,
    lookahead: la,
    deterministic: det.deterministic,
    elapsed: t.elapsed,
    maxExposure: t.maxAbs,
    changes: t.changes,
    warning: t.warning,
    notes: [
      t.warning,
      !det.deterministic ? 'Not deterministic on identical input -- if that is not from ctx.random(), results will not reproduce.' : null,
      t.maxAbs > 20 ? `Maximum exposure is ${t.maxAbs.toFixed(1)}x; that is a lot of leverage.` : null,
      t.changes === 0 ? 'The position never changes -- this is a buy-and-hold.' : null,
    ].filter(Boolean),
  };
}

/* ---------------- example strategies ---------------- */

export const EXAMPLES = {
  buyhold: {
    label: 'Buy and hold',
    note: 'The control. Everything else has to beat this after costs.',
    code: `function strategy(market, pos, ctx) {
  pos.fill(1);
}`,
  },
  sma: {
    label: 'Moving-average crossover',
    note: 'Long when the fast average of past returns is above the slow one. The classic, and usually a coin flip after costs.',
    code: `function strategy(market, pos, ctx) {
  const fast = 20, slow = 100;
  let sf = 0, ss = 0;
  for (let t = 0; t < ctx.n; t++) {
    // decide from bars strictly before t
    pos[t] = (t > slow && sf / fast > ss / slow) ? 1 : 0;
    sf += market[t]; if (t >= fast) sf -= market[t - fast];
    ss += market[t]; if (t >= slow) ss -= market[t - slow];
  }
}`,
  },
  momentum: {
    label: 'Time-series momentum',
    note: 'Long if the last 12 months were positive. The one effect with the most published support -- and the most crowded.',
    code: `function strategy(market, pos, ctx) {
  const look = 252;
  let sum = 0;
  for (let t = 0; t < ctx.n; t++) {
    pos[t] = (t >= look && sum > 0) ? 1 : 0;
    sum += market[t]; if (t >= look) sum -= market[t - look];
  }
}`,
  },
  reversion: {
    label: 'Short-term mean reversion',
    note: 'Buy after a fall, sell after a rise. Works on paper, dies on turnover costs.',
    code: `function strategy(market, pos, ctx) {
  const look = 5;
  let sum = 0;
  for (let t = 0; t < ctx.n; t++) {
    pos[t] = t >= look ? (sum < 0 ? 1 : -1) : 0;
    sum += market[t]; if (t >= look) sum -= market[t - look];
  }
}`,
  },
  voltarget: {
    label: 'Volatility breakout',
    note: 'Only hold when recent volatility is low. A risk filter rather than a signal.',
    code: `function strategy(market, pos, ctx) {
  const win = 40;
  let s2 = 0;
  for (let t = 0; t < ctx.n; t++) {
    const v = t >= win ? Math.sqrt(s2 / win) : 0;
    pos[t] = (t >= win && v < 0.012) ? 1 : 0;
    s2 += market[t] * market[t];
    if (t >= win) s2 -= market[t - win] * market[t - win];
  }
}`,
  },
  martingale: {
    label: 'Martingale (doubling down)',
    note: 'Double after every loss. Wins almost always, and the rare loss is total. Run it and look at the ruin column, not the median.',
    code: `function strategy(market, pos, ctx) {
  let size = 1;
  for (let t = 0; t < ctx.n; t++) {
    pos[t] = size;
    size = market[t] < 0 ? Math.min(size * 2, 256) : 1;
  }
}`,
  },
  coinflip: {
    label: 'Random positions',
    note: 'The honest null. Anything your real strategy does should be compared against this.',
    code: `function strategy(market, pos, ctx) {
  for (let t = 0; t < ctx.n; t++) pos[t] = ctx.random() < 0.5 ? 1 : -1;
}`,
  },
  cheat: {
    label: 'Look-ahead (deliberately broken)',
    note: 'Peeks at the current bar. Included so you can watch the look-ahead check catch it -- its Sharpe is absurd and completely fake.',
    code: `function strategy(market, pos, ctx) {
  // WRONG ON PURPOSE: market[t] is not known when pos[t] is set.
  for (let t = 0; t < ctx.n; t++) pos[t] = market[t] > 0 ? 1 : -1;
}`,
  },
};
