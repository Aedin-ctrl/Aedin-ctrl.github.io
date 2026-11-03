/* boards.mjs -- read a published /trad board and hand its results to the tester.
 *
 * Each board stores its results differently, because each was built separately:
 *
 *   gold, mes      cumulative BASIS POINTS on a fixed notional, on irregular
 *                  trade dates (~28 a year over 25 years)
 *   goldman        equity MULTIPLES starting at 1, weekly (~50 a year)
 *   bell (imom)    cumulative basis points as [date, value] pairs, daily
 *
 * Two things have to be right or every number downstream is wrong.
 *
 * UNITS. A cumulative-bps curve is ADDITIVE: the board's 29,032bp total is a sum,
 * not a compounded return. Treating the differences as compounding returns turns
 * gold's +290% into +1,414%. The per-period return is still (diff / 10,000) --
 * that is genuinely what the strategy earned that period as a fraction of
 * notional -- but whether you compound it is a SIZING choice, and the board chose
 * fixed notional while the lab's default is fixed fraction. The page says so.
 *
 * FREQUENCY. Annualising a trade-level series at 252 would multiply its Sharpe by
 * three. Periods per year is derived from the dates, never assumed.
 *
 * Every adapter carries the figure the board itself publishes, and `verify`
 * checks the conversion reproduces it.
 */

export const BOARDS = {
  gs: {
    id: 'gs', label: 'Goldman', file: 'gs.json',
    note: 'Three Goldman Sachs strategies rebuilt from their published rule books, weekly.',
    unit: 'multiple',
    extract: (d) => ({
      dates: d.equity.dates,
      series: Object.entries(d.equity.series).map(([key, v]) => ({
        key, label: (d.table || []).find(t => t.key === key)?.label || key,
        values: v.v,
        stated: { final: v.v[v.v.length - 1], cagr: (d.table || []).find(t => t.key === key)?.cagr },
      })),
      benchmarkKey: 'SPY',
    }),
  },
  mes: {
    id: 'mes', label: 'Parabolic SAR · MES', file: 'mes.json',
    note: 'The gold rig pointed at the Micro E-mini S&P 500 — the control that says whether any of it was about the indicator.',
    unit: 'cumbps',
    extract: (d) => ({
      dates: d.equity.dates,
      series: [
        { key: 'strategy', label: 'Parabolic SAR', values: d.equity.strategy, stated: { totalBps: d.headline?.total_net_bps } },
        { key: 'matched', label: 'Volatility-matched', values: d.equity.matched, stated: {} },
      ],
      benchmark: { key: 'buyhold', label: 'Buy and hold', values: d.equity.buyhold },
    }),
  },
  gold: {
    id: 'gold', label: 'Parabolic SAR · Gold', file: 'gold.json',
    note: "Wilder's Parabolic SAR on gold, 25 years, trade level.",
    unit: 'cumbps',
    extract: (d) => ({
      dates: d.equity.dates,
      series: [
        { key: 'strategy', label: 'Parabolic SAR', values: d.equity.strategy, stated: { totalBps: d.headline?.total_net_bps } },
        { key: 'matched', label: 'Volatility-matched', values: d.equity.matched, stated: {} },
      ],
      benchmark: { key: 'buyhold', label: 'Buy and hold', values: d.equity.buyhold },
    }),
  },
  bell: {
    id: 'bell', label: 'Opening bell', file: 'index.json',
    note: 'Market intraday momentum, daily. (The opening-range breakout log is too short to resample.)',
    unit: 'cumbps',
    extract: (d) => {
      const out = [];
      let dates = null;
      for (const sym of Object.keys(d.imom?.equity || {})) {
        const s = d.imom.equity[sym].strategy;
        if (!Array.isArray(s) || s.length < 60) continue;
        if (!dates) dates = s.map(r => r[0]);
        out.push({ key: sym, label: `${sym} intraday momentum`, values: s.map(r => r[1]),
                   stated: { totalBps: s[s.length - 1][1] } });
      }
      const bh = d.imom?.equity?.SPY?.buyhold;
      return {
        dates: dates || [],
        series: out,
        benchmark: Array.isArray(bh) && bh.length ? { key: 'buyhold', label: 'SPY buy and hold', values: bh.map(r => r[1]) } : null,
      };
    },
  },
};

/** Cumulative series -> per-period returns, honouring the unit.
 *
 *  A cumulative series either starts at a BASELINE of zero (gold, mes: the first
 *  point is "before anything happened") or starts at its FIRST PERIOD'S VALUE
 *  (the intraday-momentum log: its first point is 7.08bp, which is that day's
 *  result). Treating the second kind as a baseline drops the first period and
 *  the total comes out 7.08bp short of what the board publishes -- which is how
 *  this was caught. */
export function toReturns(values, unit) {
  const n = values.length;
  if (n < 2) return new Float64Array(0);
  if (unit === 'multiple') {
    const out = new Float64Array(n - 1);
    for (let i = 1; i < n; i++) out[i - 1] = values[i - 1] !== 0 ? values[i] / values[i - 1] - 1 : 0;
    return out;
  }
  const baseline = Math.abs(values[0]) < 1e-9;
  const out = new Float64Array(baseline ? n - 1 : n);
  if (!baseline) out[0] = values[0] / 1e4;
  const off = baseline ? 1 : 0;
  for (let i = 1; i < n; i++) out[i - off] = (values[i] - values[i - 1]) / 1e4;
  return out;
}

/** True when the first point of a cumulative series is a zero baseline. */
export const hasBaseline = (values, unit) =>
  unit === 'multiple' ? true : Math.abs(values[0]) < 1e-9;

/** Periods per year, derived from the dates rather than assumed. */
export function periodsPerYear(dates) {
  if (!dates || dates.length < 3) return 252;
  const d0 = Date.parse(dates[0]), d1 = Date.parse(dates[dates.length - 1]);
  if (!Number.isFinite(d0) || !Number.isFinite(d1) || d1 <= d0) return 252;
  const years = (d1 - d0) / (365.25 * 864e5);
  return Math.max(1, Math.round((dates.length / years) * 10) / 10);
}

/** Convert a whole board, and check the conversion against what it publishes. */
export function convertBoard(id, json) {
  const spec = BOARDS[id];
  if (!spec) throw new Error(`unknown board: ${id}`);
  const ex = spec.extract(json);
  if (!ex.series.length) throw new Error(`${id}: no usable series found`);
  const ppy = periodsPerYear(ex.dates);

  const conv = (s) => {
    const r = toReturns(s.values, spec.unit);
    const checks = [];
    if (spec.unit === 'cumbps' && Number.isFinite(s.stated?.totalBps)) {
      // additive: the differences must sum back to the published total
      let sum = 0;
      for (let i = 0; i < r.length; i++) sum += r[i];
      checks.push({ what: 'total basis points', got: sum * 1e4, want: s.stated.totalBps,
                    ok: Math.abs(sum * 1e4 - s.stated.totalBps) < Math.max(1, Math.abs(s.stated.totalBps) * 1e-6) });
    }
    if (spec.unit === 'multiple' && Number.isFinite(s.stated?.final)) {
      let g = s.values[0];
      for (let i = 0; i < r.length; i++) g *= 1 + r[i];
      checks.push({ what: 'final multiple', got: g, want: s.stated.final,
                    ok: Math.abs(g - s.stated.final) < Math.abs(s.stated.final) * 1e-9 });
    }
    let addTotal = 0, compound = 1;
    for (let i = 0; i < r.length; i++) { addTotal += r[i]; compound *= 1 + r[i]; }
    return {
      key: s.key, label: s.label, returns: r, n: r.length, checks,
      additiveTotal: addTotal,          // what the board reports (fixed notional)
      compoundedTotal: compound - 1,    // what the lab will show (fixed fraction)
    };
  };

  const series = ex.series.map(conv);
  let benchmark = null;
  if (ex.benchmark) benchmark = conv(ex.benchmark);
  else if (ex.benchmarkKey) {
    const b = series.find(s => s.key === ex.benchmarkKey);
    if (b) benchmark = b;
  }

  return {
    id, label: spec.label, note: spec.note, unit: spec.unit,
    // one date per RETURN. A baseline series has one fewer return than levels;
    // a series whose first point is already a return has exactly as many.
    dates: hasBaseline(ex.series[0].values, spec.unit) ? ex.dates.slice(1) : ex.dates.slice(),
    ppy, series, benchmark,
    // every conversion check in one place, so a mismatch is visible rather than silent
    verified: series.concat(benchmark && !series.includes(benchmark) ? [benchmark] : [])
      .flatMap(s => s.checks).every(c => c.ok),
    checks: series.concat(benchmark && !series.includes(benchmark) ? [benchmark] : [])
      .flatMap(s => s.checks.map(c => ({ series: s.label, ...c }))),
  };
}

/** Fetch and convert, for the browser.
 *
 *  Resolved against the PAGE, not against this module. This file sits in
 *  `mc/lib/`, so `../gold.json` relative to import.meta.url is `mc/gold.json`,
 *  which does not exist — the boards live one level further up, beside the page
 *  that links here. Using document.baseURI makes the path mean what it reads. */
export async function loadBoard(id, base = '../') {
  const spec = BOARDS[id];
  if (!spec) throw new Error(`unknown board: ${id}`);
  const root = (typeof document !== 'undefined' && document.baseURI) || import.meta.url;
  const url = new URL(base + spec.file, root);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${spec.file}: HTTP ${res.status} (${url.pathname})`);
  return convertBoard(id, await res.json());
}
