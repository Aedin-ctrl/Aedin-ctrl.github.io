/* sources.mjs -- turn whatever the user pastes into a canonical return series.
 *
 * People arrive with prices, equity curves, percent returns, decimal returns, basis
 * points, R-multiples and dollar P&L, in files whose columns are named anything at
 * all. Guessing wrong silently is the worst outcome -- a price series read as
 * returns produces a beautiful, meaningless fan chart -- so every guess here is
 * reported with its reason and can be overridden.
 */
import { mean, sd, median, quantile, moments } from './stats.mjs';

export const KINDS = {
  return:   { label: 'Returns (decimal)', hint: '0.0123 = +1.23%' },
  percent:  { label: 'Returns (percent)', hint: '1.23 = +1.23%' },
  bps:      { label: 'Returns (basis points)', hint: '123 = +1.23%' },
  price:    { label: 'Prices / equity curve', hint: 'converted to period returns' },
  logreturn:{ label: 'Log returns', hint: 'converted with exp(r)-1' },
  pnl:      { label: 'P&L per trade (currency)', hint: 'divided by the account size' },
};

/** Split a text blob into rows of fields.
 *
 *  Delimiters are scored by CONSISTENCY, not by how many fields they produce. A
 *  column of money written "$1,234.50" splits on the comma into a ragged table,
 *  and the raggedness is the signal that the comma is not the delimiter here --
 *  without that check the thousands separator silently truncates every value. */
export function parseDelimited(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n').filter(l => l.trim().length);
  if (!lines.length) return { rows: [], delim: ',' };
  const sample = lines.slice(0, 50);
  const candidates = [',', '\t', ';', '|', /\s+/];

  let bestDelim = null, bestScore = 0, bestWidth = 1;
  for (const d of candidates) {
    const counts = sample.map(l => splitRow(l, d).length);
    const tally = new Map();
    for (const c of counts) tally.set(c, (tally.get(c) || 0) + 1);
    let modal = 1, modalN = 0;
    for (const [c, k] of tally) if (k > modalN || (k === modalN && c > modal)) { modal = c; modalN = k; }
    if (modal < 2) continue;                       // produced no columns at all
    const consistency = modalN / counts.length;
    if (consistency < 0.9) continue;               // ragged: not the real delimiter
    const score = consistency + modal * 1e-3;
    if (score > bestScore) { bestScore = score; bestDelim = d; bestWidth = modal; }
  }
  // nothing split the text cleanly: treat every line as one field
  if (!bestDelim) return { rows: lines.map(l => [l.trim()]), delim: null, width: 1 };
  return { rows: lines.map(l => splitRow(l, bestDelim)), delim: bestDelim, width: bestWidth };
}

function splitRow(line, delim) {
  if (delim == null) return [line.trim()];
  if (delim instanceof RegExp) return line.trim().split(delim);
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === delim) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

const num = s => {
  if (typeof s === 'number') return s;
  if (s == null) return NaN;
  let t = String(s).trim().replace(/[$£€\s,]/g, '');
  let pct = false;
  if (t.endsWith('%')) { pct = true; t = t.slice(0, -1); }
  if (/^\((.*)\)$/.test(t)) t = '-' + t.slice(1, -1);   // (1.23) = negative
  const v = Number(t);
  if (!Number.isFinite(v)) return NaN;
  return pct ? v / 100 : v;
};

const looksLikeDate = s => typeof s === 'string' &&
  (/^\d{4}[-/]\d{1,2}([-/]\d{1,2})?/.test(s) || /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/.test(s) ||
   /^\d{9,13}$/.test(s));

/** Pick the column most likely to hold the numbers we want. */
function pickColumn(rows, header) {
  const nCols = Math.max(...rows.map(r => r.length));
  const PREF = [/^(net|total)?\s*(ret(urn)?s?|r)$/i, /ret/i, /pnl|p&l|profit/i, /equity|balance|nav|cum/i,
                /close|adj.?close|price|last/i, /value/i];
  if (header) {
    for (const re of PREF) {
      for (let c = 0; c < header.length; c++) if (re.test(header[c])) {
        const vals = rows.map(r => num(r[c]));
        if (vals.filter(Number.isFinite).length > rows.length * 0.6) return { col: c, why: `column "${header[c]}"` };
      }
    }
  }
  // otherwise: the last column that is overwhelmingly numeric
  let bestCol = -1, bestScore = 0;
  for (let c = 0; c < nCols; c++) {
    const vals = rows.map(r => num(r[c]));
    const finite = vals.filter(Number.isFinite).length;
    const score = finite / rows.length + (c / nCols) * 0.01;
    const dateish = rows.slice(0, 10).filter(r => looksLikeDate(r[c])).length;
    if (dateish > 5) continue;
    if (score > bestScore && finite > rows.length * 0.6) { bestScore = score; bestCol = c; }
  }
  return bestCol >= 0 ? { col: bestCol, why: header ? `column "${header[bestCol] || bestCol + 1}"` : `column ${bestCol + 1}` } : null;
}

/** Decide what the numbers MEAN. Returns a kind plus the evidence for it. */
export function classify(values) {
  const v = values.filter(Number.isFinite);
  if (v.length < 2) return { kind: 'return', confidence: 0, why: 'not enough data' };
  const neg = v.filter(x => x < 0).length / v.length;
  const absMed = median(v.map(Math.abs));
  const allPos = neg === 0;
  const mn = Math.min(...v), mx = Math.max(...v);

  // A monotone-ish, strictly positive series with a big level is a price or equity curve.
  if (allPos && absMed > 1.5) {
    let steps = 0;
    for (let i = 1; i < v.length; i++) if (Math.abs(v[i] / v[i - 1] - 1) < 0.25) steps++;
    if (steps > v.length * 0.8) return { kind: 'price', confidence: 0.95, why: `all positive, median ${absMed.toPrecision(4)}, consecutive values within 25% of each other` };
  }
  if (allPos && mn > 0 && mx / mn > 1.2 && absMed > 0.5) {
    return { kind: 'price', confidence: 0.6, why: 'all positive and spanning a wide range -- probably a level, not a return' };
  }
  if (absMed > 20) return { kind: 'bps', confidence: 0.6, why: `typical magnitude ${absMed.toPrecision(3)} is too large for a percent` };
  if (absMed > 0.25) return { kind: 'percent', confidence: 0.75, why: `typical magnitude ${absMed.toPrecision(3)} with both signs -- reads as percent` };
  if (absMed < 0.25) return { kind: 'return', confidence: 0.85, why: `typical magnitude ${absMed.toPrecision(3)} with both signs -- reads as a decimal return` };
  return { kind: 'return', confidence: 0.3, why: 'ambiguous; assuming decimal returns' };
}

/** Convert a classified column into simple per-period returns. */
export function toReturns(values, kind, opts = {}) {
  const v = values.filter(Number.isFinite);
  switch (kind) {
    case 'percent': return Float64Array.from(v, x => x / 100);
    case 'bps':     return Float64Array.from(v, x => x / 1e4);
    case 'logreturn': return Float64Array.from(v, x => Math.expm1(x));
    case 'pnl': {
      const acct = opts.accountSize || Math.max(1, Math.abs(mean(v)) * 100);
      return Float64Array.from(v, x => x / acct);
    }
    case 'price': {
      const out = new Float64Array(Math.max(0, v.length - 1));
      for (let i = 1; i < v.length; i++) out[i - 1] = v[i - 1] !== 0 ? v[i] / v[i - 1] - 1 : 0;
      return out;
    }
    default: return Float64Array.from(v);
  }
}

/** The full pipeline: text in, canonical series plus an explanation out. */
export function parseSource(text, opts = {}) {
  const trimmed = String(text).trim();
  if (!trimmed) return { error: 'nothing to parse' };

  // JSON array, or an object with a numeric array inside
  if (/^[[{]/.test(trimmed)) {
    try {
      const j = JSON.parse(trimmed);
      let arr = Array.isArray(j) ? j : null;
      if (!arr && j && typeof j === 'object') {
        for (const k of ['returns', 'data', 'values', 'series', 'r', 'pnl', 'equity']) {
          if (Array.isArray(j[k])) { arr = j[k]; break; }
        }
        if (!arr) { const f = Object.values(j).find(Array.isArray); if (f) arr = f; }
      }
      if (arr) {
        const vals = arr.map(x => typeof x === 'object' && x
          ? num(x.r ?? x.ret ?? x.return ?? x.value ?? x.close ?? x.pnl ?? Object.values(x).find(y => Number.isFinite(num(y))))
          : num(x)).filter(Number.isFinite);
        return finish(vals, opts, 'JSON array');
      }
    } catch (e) { /* fall through to delimited */ }
  }

  const { rows } = parseDelimited(trimmed);
  if (!rows.length) return { error: 'no rows found' };

  // header row = first row with no parseable number in it
  const firstNumeric = rows[0].some(c => Number.isFinite(num(c)));
  const header = firstNumeric ? null : rows[0];
  const body = header ? rows.slice(1) : rows;
  if (!body.length) return { error: 'no data rows below the header' };

  // single column of bare numbers is the common case
  const pick = pickColumn(body, header);
  if (!pick) return { error: 'could not find a numeric column' };
  const vals = body.map(r => num(r[pick.col])).filter(Number.isFinite);
  if (vals.length < 2) return { error: 'fewer than two numbers found' };
  return finish(vals, opts, pick.why);
}

function finish(vals, opts, colWhy) {
  const cls = opts.kind ? { kind: opts.kind, confidence: 1, why: 'set by hand' } : classify(vals);
  const rets = toReturns(vals, cls.kind, opts);
  const bad = Array.from(rets).filter(r => r <= -1).length;
  const mo = moments(rets);
  return {
    returns: rets,
    raw: Float64Array.from(vals),
    kind: cls.kind, confidence: cls.confidence,
    why: `${colWhy}; ${cls.why}`,
    n: rets.length,
    warnings: [
      bad ? `${bad} value${bad > 1 ? 's' : ''} at or below -100%: these wipe the account out completely` : null,
      rets.length < 30 ? 'fewer than 30 observations -- almost nothing here will be significant' : null,
      Math.abs(mo.mean) > 0.2 ? 'the average period return is above 20%; the units may be wrong' : null,
      mo.sd > 0.5 ? 'period volatility above 50%; the units may be wrong' : null,
      mo.sd === 0 ? 'every value is identical' : null,
    ].filter(Boolean),
    stats: {
      n: rets.length, mean: mo.mean, sd: mo.sd, skew: mo.skew, kurtosis: mo.kurtosis,
      min: Math.min(...rets), max: Math.max(...rets),
    },
  };
}

/** JSON-safe serialisation. json/JSON.parse chokes on bare NaN and Infinity, and a
 *  single one in an exported result file makes the whole thing unloadable. Every
 *  export path goes through this. */
export function jsonSafe(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (ArrayBuffer.isView(v)) return Array.from(v, x => (Number.isFinite(x) ? x : null));
  if (Array.isArray(v)) return v.map(jsonSafe);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) o[k] = jsonSafe(v[k]);
    return o;
  }
  return v;
}
