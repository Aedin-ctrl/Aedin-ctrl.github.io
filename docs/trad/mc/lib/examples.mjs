/* examples.mjs -- built-in series so the page works before anything is attached.
 *
 * These are GENERATED, not market data. The page says so wherever they appear.
 * They exist because the most useful thing a Monte Carlo can show you is what a
 * strategy with NO edge looks like when it got lucky -- and for that you need a
 * series whose truth you already know.
 */
import { RNG } from './rng.mjs';

function garchPath(n, seed, { mu = 0.0004, omega = 1.5e-6, alpha = 0.09, beta = 0.90, df = 5 } = {}) {
  const r = new RNG(seed, 0), x = new Float64Array(n);
  let h = omega / (1 - alpha - beta), e = 0;
  for (let i = 0; i < 400; i++) { h = omega + alpha * e * e + beta * h; e = Math.sqrt(h) * r.tUnit(df); }
  for (let i = 0; i < n; i++) { h = omega + alpha * e * e + beta * h; e = Math.sqrt(h) * r.tUnit(df); x[i] = mu + e; }
  return x;
}

/** Search seeds for a noise series whose SAMPLE Sharpe lands near a target.
 *  This is how the "lucky backtest" example is built: it has no edge at all,
 *  and the only thing separating it from a real one is that we know that. */
function luckyNoise(n, targetSharpe, ppy = 252, maxSeed = 4000) {
  let best = null, bestErr = Infinity;
  for (let s = 1; s < maxSeed; s++) {
    const r = new RNG(s, 7), x = new Float64Array(n);
    let sum = 0, sum2 = 0;
    for (let i = 0; i < n; i++) { const v = 0.01 * r.normal(); x[i] = v; sum += v; sum2 += v * v; }
    const m = sum / n, sdv = Math.sqrt((sum2 - n * m * m) / (n - 1));
    const sr = (m / sdv) * Math.sqrt(ppy);
    const err = Math.abs(sr - targetSharpe);
    if (err < bestErr) { bestErr = err; best = { x, seed: s, sharpe: sr }; }
    if (err < 0.01) break;
  }
  return best;
}

export const EXAMPLES = {
  index: {
    label: 'Index-like daily returns',
    note: '5 years of a GARCH(1,1) process with t(5) shocks, drifting about 10% a year. Volatility clusters and the tails are fat, the way an equity index behaves.',
    build: () => garchPath(1260, 2026),
  },
  lucky: {
    label: 'A lucky backtest (no edge at all)',
    note: 'Pure noise with zero expected return, chosen from 4000 seeds because it happened to post a strong Sharpe. Nothing here is real. Every test on this page should say so -- that is the point of including it.',
    build: () => luckyNoise(504, 1.6).x,
  },
  small: {
    label: 'A small real edge',
    note: 'A genuine 0.4 Sharpe buried in noise -- built with that drift and drawn from a seed whose realised Sharpe lands on it, so the example shows what it claims. Most samples are far too short to tell it apart from the lucky series above; the power panel says when.',
    build: () => {
      const r = new RNG(308, 3), n = 1260, x = new Float64Array(n);
      const per = 0.4 / Math.sqrt(252);
      for (let i = 0; i < n; i++) x[i] = per * 0.01 + 0.01 * r.tUnit(6);
      return x;
    },
  },
  crisis: {
    label: 'Calm years, then a crisis',
    note: 'A two-state regime process: long quiet stretches at low volatility, punctuated by sticky high-volatility spells with negative drift.',
    build: () => {
      const r = new RNG(1987, 1), n = 1512, x = new Float64Array(n);
      let s = 0;
      for (let i = 0; i < n; i++) {
        x[i] = s === 0 ? 0.0007 + 0.006 * r.normal() : -0.0016 + 0.023 * r.tUnit(4);
        s = s === 0 ? (r.u() < 0.988 ? 0 : 1) : (r.u() < 0.945 ? 1 : 0);
      }
      return x;
    },
  },
  skewed: {
    label: 'Option-selling shape',
    note: 'Wins 99% of days by a little and loses rarely by a lot. Sharpe 1.5, skew below -10: a number that looks excellent next to a shape that is not. Compare its drawdown distribution against its Sharpe, then run it through the leverage ladder.',
    build: () => {
      const r = new RNG(108, 2), n = 1260, x = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        x[i] = r.u() < 0.99 ? 0.0011 + 0.002 * r.normal() : -0.045 - 0.03 * Math.abs(r.normal());
      }
      return x;
    },
  },
  trades: {
    label: 'A trade list, not a time series',
    note: '300 trades with a 55% win rate and a 1:1 payoff. Per-trade data rather than daily, so the horizon is counted in trades.',
    build: () => {
      const r = new RNG(55, 4), n = 300, x = new Float64Array(n);
      for (let i = 0; i < n; i++) x[i] = r.u() < 0.55 ? 0.02 * (0.8 + 0.4 * r.u()) : -0.02 * (0.8 + 0.4 * r.u());
      return x;
    },
    ppy: 100,
  },
};

export function buildExample(id) {
  const e = EXAMPLES[id];
  if (!e) return null;
  const returns = e.build();
  return { id, label: e.label, note: e.note, returns, ppy: e.ppy || 252 };
}
