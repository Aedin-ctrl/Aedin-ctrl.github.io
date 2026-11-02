/* strategylab.mjs -- run a PARAMETERISED strategy over a real return series.
 *
 * This is the shared evaluation core for all three robustness tests. Monte Carlo
 * asks whether the path was luck; walk-forward asks whether the parameter choice
 * survives being re-picked out of sample; sensitivity asks whether the result sits
 * on a plateau or a spike. All three need exactly one thing in common: a way to
 * score (strategy, parameters, slice of history) that cannot cheat.
 *
 * The contract, extending the one in strategy.mjs:
 *
 *     const PARAMS = { fast: {min:5, max:60, step:5, def:20}, ... };
 *     function strategy(market, pos, ctx) { const {fast} = ctx.params; ... }
 *
 * pos[t] may use market[0..t-1] and nothing later. Enforced, not requested.
 */
import * as S from './stats.mjs';
import * as M from './metrics.mjs';

/** Realistic frictions for a daily ETF strategy. Stated rather than assumed,
 *  because the default is doing a lot of work in every result below.
 *
 *  `bpsPerTurnover` is the one-way cost of trading 100% of capital: roughly the
 *  half-spread plus slippage. At a 1-cent spread, SPY (~$690) is about 0.7bp and
 *  IWM (~$250) about 2bp, so a single default cannot be right for both.
 *
 *  Financing and borrow are charged on the exposure actually held, not on the
 *  notional: a rule that sits flat half the time pays nothing while it is flat. */
export const COST_PRESETS = {
  SPY: { bpsPerTurnover: 1.0, note: '1-cent spread on a ~$690 share' },
  QQQ: { bpsPerTurnover: 1.2, note: '1-cent spread on a ~$600 share' },
  IWM: { bpsPerTurnover: 2.5, note: '1-cent spread on a ~$250 share, wider in stress' },
};

/** Score a parameter set over one contiguous slice. Returns null on a degenerate
 *  result rather than a misleading number. */
export function runStrategy(market, fn, params, opts = {}) {
  const {
    bpsPerTurnover = 1, ppy = 252, minTrades = 1, rng = null,
    financingAnnual = 0,     // cost of exposure above 1x
    shortBorrowAnnual = 0,   // extra cost of negative exposure
    bpsPerPeriod = 0,        // flat holding drag, scaled by exposure
    maxExposure = Infinity,  // what the account can actually hold
  } = opts;
  const n = market.length;
  if (n < 10) return null;
  const pos = new Float64Array(n);
  const ctx = { n, ppy, params: { ...params }, random: rng ? () => rng.u() : () => 0.5 };
  try { fn(market, pos, ctx); } catch { return null; }

  const c = bpsPerTurnover / 1e4;
  const drag = bpsPerPeriod / 1e4;
  const finPer = financingAnnual / 100 / ppy;
  const borrowPer = shortBorrowAnnual / 100 / ppy;
  const net = new Float64Array(n);
  const gross = new Float64Array(n);
  let prev = 0, trades = 0, turnover = 0, maxAbs = 0;
  for (let t = 0; t < n; t++) {
    let p = Number.isFinite(pos[t]) ? pos[t] : 0;
    // an account cannot hold more than it can hold; clamping here rather than
    // letting a rule quietly assume unlimited leverage
    if (p > maxExposure) p = maxExposure;
    if (p < -maxExposure) p = -maxExposure;
    pos[t] = p;
    const d = Math.abs(p - prev);
    if (d > 1e-12) trades++;
    turnover += d;
    if (Math.abs(p) > maxAbs) maxAbs = Math.abs(p);
    gross[t] = p * market[t];
    let r = gross[t] - d * c;
    if (drag > 0) r -= Math.abs(p) * drag;
    if (finPer > 0 && p > 1) r -= (p - 1) * finPer;
    if (borrowPer > 0 && p < 0) r -= (-p) * borrowPer;
    net[t] = r;
    prev = p;
  }
  if (trades < minTrades) return null;
  const a = M.analyze(net, { ppy });
  const g = M.analyze(gross, { ppy });
  if (!a || !Number.isFinite(a.sharpe)) return null;
  return {
    sharpe: a.sharpe, grossSharpe: g.sharpe, cagr: a.cagr, maxDD: a.maxDD,
    calmar: a.calmar, vol: a.vol, meanBps: S.mean(net) * 1e4,
    trades, turnoverPerPeriod: turnover / n, n,
    maxExposure: maxAbs,
    usesShorts: (() => { for (let t = 0; t < n; t++) if (pos[t] < -1e-12) return true; return false; })(),
    usesLeverage: maxAbs > 1 + 1e-9,
    net, gross,
  };
}

/** Expand a parameter spec into every combination, in a deterministic order. */
export function expandGrid(spec) {
  const keys = Object.keys(spec).sort();
  if (!keys.length) return [{}];
  const axes = keys.map(k => {
    const p = spec[k];
    if (Array.isArray(p.values)) return p.values.slice();
    const out = [];
    const step = p.step || 1;
    // integer-count loop, so floating-point steps cannot drop or duplicate a value
    const count = Math.floor((p.max - p.min) / step + 1e-9) + 1;
    for (let i = 0; i < count; i++) out.push(+(p.min + i * step).toFixed(10));
    return out;
  });
  const total = axes.reduce((a, b) => a * b.length, 1);
  const grid = new Array(total);
  for (let i = 0; i < total; i++) {
    const combo = {};
    let rest = i;
    for (let a = 0; a < keys.length; a++) {
      combo[keys[a]] = axes[a][rest % axes[a].length];
      rest = Math.floor(rest / axes[a].length);
    }
    grid[i] = combo;
  }
  return grid;
}

export const gridSize = spec => expandGrid(spec).length;

/** Score every combination over one slice, ranked. The objective is named so the
 *  same search can be reused for a different definition of "best". */
export const OBJECTIVES = {
  sharpe: { label: 'Sharpe ratio', get: r => r.sharpe },
  calmar: { label: 'Calmar (CAGR / max drawdown)', get: r => r.calmar },
  cagr: { label: 'CAGR', get: r => r.cagr },
  sortino: { label: 'Sortino', get: r => (r.net ? M.analyze(r.net, { ppy: 252 }).sortino : NaN) },
};

export function search(market, fn, spec, opts = {}) {
  const { objective = 'sharpe' } = opts;
  const obj = OBJECTIVES[objective] || OBJECTIVES.sharpe;
  const grid = expandGrid(spec);
  const rows = [];
  for (const params of grid) {
    const r = runStrategy(market, fn, params, opts);
    if (!r) { rows.push({ params, score: NaN, result: null }); continue; }
    rows.push({ params, score: obj.get(r), result: r });
  }
  const valid = rows.filter(r => Number.isFinite(r.score));
  valid.sort((a, b) => b.score - a.score);
  return {
    rows, ranked: valid, best: valid[0] || null,
    tested: grid.length, valid: valid.length, objective,
    scores: valid.map(r => r.score),
  };
}

/** Parse `const PARAMS = {...}` out of user source, so the ranges live next to
 *  the code they belong to rather than in a separate form. */
export function extractParamSpec(src) {
  const text = String(src || '');
  const m = text.match(/(?:const|let|var)\s+PARAMS\s*=\s*(\{[\s\S]*?\})\s*;/);
  if (!m) return null;
  try {
    // eslint-disable-next-line no-new-func
    const spec = new Function(`return (${m[1]});`)();
    if (!spec || typeof spec !== 'object') return null;
    const clean = {};
    for (const [k, v] of Object.entries(spec)) {
      if (Array.isArray(v?.values) && v.values.length) { clean[k] = { values: v.values.slice(0, 64), def: v.def ?? v.values[0] }; continue; }
      if (!Number.isFinite(v?.min) || !Number.isFinite(v?.max)) continue;
      const step = Number.isFinite(v.step) && v.step > 0 ? v.step : 1;
      if (v.max < v.min) continue;
      clean[k] = { min: v.min, max: v.max, step, def: Number.isFinite(v.def) ? v.def : v.min };
    }
    return Object.keys(clean).length ? clean : null;
  } catch { return null; }
}

/** The default parameter set: what the author said, or the midpoint. */
export function defaultParams(spec) {
  const out = {};
  for (const [k, v] of Object.entries(spec)) {
    out[k] = v.def ?? (Array.isArray(v.values) ? v.values[0] : v.min);
  }
  return out;
}
