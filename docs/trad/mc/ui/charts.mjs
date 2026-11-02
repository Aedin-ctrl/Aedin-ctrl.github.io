/* charts.mjs -- hand-rolled SVG charts, matching the /trad house style.
 *
 * Palette rules this file obeys (validated with the dataviz palette checker):
 *   - at most THREE categorical series at once: blue, orange, green. The trio
 *     passes CVD separation on every pair; a fourth hue does not, so anything
 *     with more categories is faceted into small multiples instead.
 *   - percentile bands are SEQUENTIAL: one hue, light to dark. Never a rainbow.
 *   - green (#1baf7a) sits below 3:1 against the paper, so every chart that uses
 *     it also carries direct labels and a table underneath.
 *   - no dual-axis charts anywhere. Two measures means two charts.
 *   - text is always ink-coloured; colour lives in the marks, never the numbers.
 */

const NS = 'http://www.w3.org/2000/svg';
export const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)'];
export const SERIES_HEX = ['#2a78d6', '#eb6834', '#1baf7a'];
/** Sequential ramp for percentile bands: light (outer/rare) to dark (inner/likely). */
export const BAND = ['#e3eefb', '#c6ddf6', '#9cc3ee', '#6ba6e4', '#2a78d6'];

export const el = (p, n, a = {}) => {
  const e = document.createElementNS(NS, n);
  for (const k in a) if (a[k] != null) e.setAttribute(k, a[k]);
  p.appendChild(e);
  return e;
};
export const txt = (p, x, y, s, cls = 'ax', anchor = 'middle') => {
  const t = el(p, 'text', { x, y, 'text-anchor': anchor, class: cls });
  t.textContent = s;
  return t;
};

function svg(host, w, h) {
  host.textContent = '';
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', `0 0 ${w} ${h}`);
  s.setAttribute('role', 'img');
  s.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  host.appendChild(s);
  return s;
}

/* ---------------- scales ---------------- */
export function linScale(d0, d1, r0, r1) {
  if (d1 === d0) d1 = d0 + 1;
  const f = x => r0 + (x - d0) / (d1 - d0) * (r1 - r0);
  f.invert = y => d0 + (y - r0) / (r1 - r0) * (d1 - d0);
  f.domain = [d0, d1]; f.range = [r0, r1];
  return f;
}

/** "Nice" tick values -- 1/2/5 x 10^k, so axes read in round numbers. */
export function ticks(lo, hi, want = 6) {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / want;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out;
}

/** Ticks for a log-equity axis, chosen to be readable NUMBERS (1x, 1.5x, 2x, 5x)
 *  rather than round values in log space, which produce labels like 2.72 and 7.39.
 *
 *  Works by trying multiplier tiers from fine to coarse and taking the first that
 *  fits in the tick budget, so a narrow fan (0.95x-1.3x) and a wild one (0.01x-900x)
 *  both come out legible instead of one falling back to log-space rounding. */
const TICK_TIERS = [
  [1, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2, 2.25, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9],
  [1, 1.1, 1.2, 1.3, 1.5, 1.7, 2, 2.5, 3, 4, 5, 7],
  [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 7],
  [1, 1.5, 2, 3, 5, 7],
  [1, 2, 3, 5],
  [1, 2, 5],
  [1, 3],
  [1],
];
export function logEquityTicks(loLog, hiLog, want = 6) {
  const lo = Math.exp(loLog), hi = Math.exp(hiLog);
  if (!(hi > lo)) return [loLog];
  for (const tier of TICK_TIERS) {
    const out = [];
    for (let d = -9; d <= 12; d++) {
      const p10 = Math.pow(10, d);
      for (const m of tier) {
        const v = m * p10;
        if (v >= lo && v <= hi) out.push(v);
      }
    }
    if (out.length >= 2 && out.length <= want) return out.sort((a, b) => a - b).map(Math.log);
  }
  // nothing fits: fall back to decade anchors, thinned
  const dec = [];
  for (let d = -9; d <= 12; d++) { const v = Math.pow(10, d); if (v >= lo && v <= hi) dec.push(v); }
  if (dec.length >= 2) {
    const stride = Math.ceil(dec.length / want);
    return dec.filter((_, i) => i % stride === 0).map(Math.log);
  }
  return ticks(loLog, hiLog, want);
}

/* ---------------- shared tooltip ---------------- */
let TIP;
function tipEl() {
  if (!TIP) { TIP = document.createElement('div'); TIP.className = 'tip'; document.body.appendChild(TIP); }
  return TIP;
}
export function showTip(e, html) {
  const t = tipEl();
  t.innerHTML = html;
  t.style.opacity = '1';
  const r = t.getBoundingClientRect();
  t.style.left = Math.max(6, Math.min(e.clientX + 14, innerWidth - r.width - 8)) + 'px';
  t.style.top = Math.max(6, e.clientY - r.height - 12) + 'px';
}
export function hideTip() { if (TIP) TIP.style.opacity = '0'; }

/** Attach a crosshair + tooltip that tracks the nearest x index. */
function crosshair(s, plot, xs, onIndex) {
  const { x0, x1, y0, y1 } = plot;
  const line = el(s, 'line', { x1: x0, x2: x0, y1: y0, y2: y1, class: 'cross', opacity: 0 });
  const hit = el(s, 'rect', { x: x0, y: y0, width: x1 - x0, height: y1 - y0, fill: 'transparent', style: 'cursor:crosshair' });
  const move = ev => {
    const box = s.getBoundingClientRect();
    const vb = s.viewBox.baseVal;
    const px = (ev.clientX - box.left) / box.width * vb.width;
    let best = 0, bd = Infinity;
    for (let i = 0; i < xs.length; i++) { const d = Math.abs(xs[i] - px); if (d < bd) { bd = d; best = i; } }
    line.setAttribute('x1', xs[best]); line.setAttribute('x2', xs[best]); line.setAttribute('opacity', 1);
    const html = onIndex(best);
    if (html) showTip(ev, html); else hideTip();
  };
  hit.addEventListener('mousemove', move);
  hit.addEventListener('mouseleave', () => { line.setAttribute('opacity', 0); hideTip(); });
}

/* ---------------- axis furniture ---------------- */
function frame(s, plot, { xTicks, yTicks, xFmt, yFmt, xLabel, yLabel, zeroAt }) {
  const { x0, x1, y0, y1, sx, sy } = plot;
  for (const t of yTicks) {
    const y = sy(t);
    if (y < y0 - 0.5 || y > y1 + 0.5) continue;
    el(s, 'line', { x1: x0, x2: x1, y1: y, y2: y, class: 'gl' });
    txt(s, x0 - 7, y + 3.5, yFmt(t), 'ax', 'end');
  }
  for (const t of xTicks) {
    const x = sx(t);
    if (x < x0 - 0.5 || x > x1 + 0.5) continue;
    txt(s, x, y1 + 15, xFmt(t), 'ax', 'middle');
  }
  if (zeroAt != null) {
    const y = sy(zeroAt);
    if (y >= y0 && y <= y1) el(s, 'line', { x1: x0, x2: x1, y1: y, y2: y, class: 'zl' });
  }
  if (yLabel) {
    const t = txt(s, 0, 0, yLabel, 'axlab', 'middle');
    t.setAttribute('transform', `translate(11,${(y0 + y1) / 2}) rotate(-90)`);
  }
  if (xLabel) txt(s, (x0 + x1) / 2, y1 + 32, xLabel, 'axlab', 'middle');
}

function makePlot(s, w, h, m) {
  return { x0: m.l, x1: w - m.r, y0: m.t, y1: h - m.b, w, h };
}

/* ======================= fan chart ======================= */
/**
 * Percentile ribbons of log-equity over time, with a median line and a few
 * sample paths. Sequential single-hue bands: darker = more likely.
 */
export function fanChart(host, {
  grid, bands, samples = [], actual = null, height = 320,
  xLabel = 'periods', yLabel = 'equity (x start)', ruinLevel = null, fmtY = null,
}) {
  const w = 760, h = height, m = { l: 58, r: 16, t: 12, b: 44 };
  const s = svg(host, w, h);
  const plot = makePlot(s, w, h, m);

  let lo = Infinity, hi = -Infinity;
  for (const b of bands) for (const v of b.values) { if (v < lo) lo = v; if (v > hi) hi = v; }
  for (const p of samples) for (const v of p) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (!(hi > lo)) { hi = lo + 1; }
  const pad = (hi - lo) * 0.06;
  lo -= pad; hi += pad;

  const sx = linScale(grid[0], grid[grid.length - 1], plot.x0, plot.x1);
  const sy = linScale(lo, hi, plot.y1, plot.y0);
  plot.sx = sx; plot.sy = sy;

  const yT = logEquityTicks(lo, hi, 6);
  // Pick the decimals from the SPAN, not the magnitude: a fan running 0.98x to 1.02x
  // needs three decimals or consecutive ticks print the same label.
  const span = Math.exp(hi) - Math.exp(lo);
  const dp = span > 20 ? 0 : span > 2 ? 1 : span > 0.2 ? 2 : span > 0.02 ? 3 : 4;
  const fy = fmtY || (v => {
    const e = Math.exp(v);
    return (e >= 1000 ? e.toExponential(1) : e.toFixed(Math.max(dp, e >= 100 ? 0 : e >= 10 ? 1 : 2))) + 'x';
  });
  frame(s, plot, { xTicks: ticks(grid[0], grid[grid.length - 1], 7), yTicks: yT,
    xFmt: v => String(Math.round(v)), yFmt: fy, xLabel, yLabel, zeroAt: 0 });

  // ribbons from outside in, so the darkest (most likely) sits on top
  const pairs = [];
  for (let i = 0; i < Math.floor(bands.length / 2); i++) pairs.push([bands[i], bands[bands.length - 1 - i]]);
  pairs.forEach((pair, i) => {
    const [a, b] = pair;
    let d = '';
    for (let j = 0; j < grid.length; j++) d += `${j ? 'L' : 'M'}${sx(grid[j]).toFixed(1)},${sy(a.values[j]).toFixed(1)}`;
    for (let j = grid.length - 1; j >= 0; j--) d += `L${sx(grid[j]).toFixed(1)},${sy(b.values[j]).toFixed(1)}`;
    d += 'Z';
    el(s, 'path', { d, fill: BAND[Math.min(i, BAND.length - 1)], opacity: 0.92, stroke: 'none' });
  });

  // sample paths, thin and recessive
  for (const p of samples) {
    let d = '';
    for (let j = 0; j < grid.length; j++) d += `${j ? 'L' : 'M'}${sx(grid[j]).toFixed(1)},${sy(p[j]).toFixed(1)}`;
    el(s, 'path', { d, fill: 'none', stroke: 'var(--ink)', 'stroke-width': 0.7, opacity: 0.26 });
  }

  // median
  const med = bands.find(b => b.p === 0.5);
  if (med) {
    let d = '';
    for (let j = 0; j < grid.length; j++) d += `${j ? 'L' : 'M'}${sx(grid[j]).toFixed(1)},${sy(med.values[j]).toFixed(1)}`;
    el(s, 'path', { d, fill: 'none', stroke: '#17407a', 'stroke-width': 2, 'stroke-linejoin': 'round' });
  }
  if (actual) {
    let d = '';
    for (let j = 0; j < Math.min(grid.length, actual.length); j++) d += `${j ? 'L' : 'M'}${sx(grid[j]).toFixed(1)},${sy(actual[j]).toFixed(1)}`;
    el(s, 'path', { d, fill: 'none', stroke: 'var(--s2)', 'stroke-width': 2, 'stroke-dasharray': '5 3' });
  }
  if (ruinLevel != null && ruinLevel > lo && ruinLevel < hi) {
    el(s, 'line', { x1: plot.x0, x2: plot.x1, y1: sy(ruinLevel), y2: sy(ruinLevel), stroke: 'var(--bad)', 'stroke-width': 1.5, 'stroke-dasharray': '4 3' });
    txt(s, plot.x1 - 3, sy(ruinLevel) - 5, 'ruin', 'dlab', 'end').setAttribute('fill', 'var(--bad)');
  }

  const xs = grid.map(g => sx(g));
  crosshair(s, plot, xs, i => {
    const rows = bands.map(b => `${(b.p * 100).toFixed(b.p * 100 % 1 ? 1 : 0)}%  ${fy(b.values[i]).padStart(7)}`).join('\n');
    return `<b>period ${Math.round(grid[i])}</b>\n${rows}`;
  });
  return s;
}

/* ======================= histogram ======================= */
export function histogram(host, {
  counts, edges, height = 250, color = 'var(--s1)', markers = [], xFmt = v => v.toFixed(2),
  xLabel = '', yLabel = 'paths', logX = false, total = null,
}) {
  const w = 760, h = height, m = { l: 54, r: 16, t: 12, b: 44 };
  const s = svg(host, w, h);
  const plot = makePlot(s, w, h, m);
  const n = counts.length;
  const maxC = Math.max(...counts, 1);
  const sx = linScale(edges[0], edges[n], plot.x0, plot.x1);
  const sy = linScale(0, maxC, plot.y1, plot.y0);
  plot.sx = sx; plot.sy = sy;
  const tot = total || counts.reduce((a, b) => a + b, 0);

  frame(s, plot, {
    xTicks: ticks(edges[0], edges[n], 7), yTicks: ticks(0, maxC, 5),
    xFmt, yFmt: v => v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'k' : String(Math.round(v)),
    xLabel, yLabel,
  });

  const bw = (plot.x1 - plot.x0) / n;
  for (let i = 0; i < n; i++) {
    if (!counts[i]) continue;
    const x = plot.x0 + i * bw, y = sy(counts[i]);
    const hgt = plot.y1 - y;
    // 2px gap between bars, 2px rounded top -- the mark spec
    const r = el(s, 'rect', {
      x: x + 0.75, y, width: Math.max(0.5, bw - 1.5), height: hgt,
      fill: color, rx: Math.min(2, bw / 3), opacity: 0.88,
    });
    const pct = (counts[i] / tot * 100);
    r.addEventListener('mousemove', e => showTip(e,
      `<b>${xFmt(edges[i])} to ${xFmt(edges[i + 1])}</b>\n${counts[i].toLocaleString()} paths · ${pct.toFixed(pct < 1 ? 2 : 1)}%`));
    r.addEventListener('mouseleave', hideTip);
  }

  for (const mk of markers) {
    if (mk.at < edges[0] || mk.at > edges[n]) continue;
    const x = sx(mk.at);
    el(s, 'line', { x1: x, x2: x, y1: plot.y0, y2: plot.y1, stroke: mk.color || 'var(--ink)', 'stroke-width': 1.5, 'stroke-dasharray': mk.dash || '4 3' });
    const t = txt(s, x, plot.y0 + (mk.row || 0) * 13 + 9, mk.label, 'dlab', mk.anchor || 'middle');
    t.setAttribute('fill', mk.color || 'var(--ink)');
  }
  return s;
}

/* ======================= null vs observed ======================= */
/** The significance chart: where the real number sits inside its own null. */
export function nullVsObserved(host, { dist, obs, height = 230, xLabel = 'Sharpe under the null', pval = null, bins = 56 }) {
  const lo = Math.min(Math.min(...dist), obs), hi = Math.max(Math.max(...dist), obs);
  const pad = (hi - lo) * 0.05 || 1;
  const e0 = lo - pad, e1 = hi + pad;
  const counts = new Float64Array(bins), edges = new Float64Array(bins + 1);
  for (let i = 0; i <= bins; i++) edges[i] = e0 + (e1 - e0) * i / bins;
  for (const v of dist) {
    let b = Math.floor((v - e0) / (e1 - e0) * bins);
    if (b < 0) b = 0; if (b >= bins) b = bins - 1;
    counts[b]++;
  }
  const s = histogram(host, {
    counts, edges, height, color: '#b8cfe9', xLabel, yLabel: 'shuffles',
    xFmt: v => v.toFixed(2), total: dist.length,
    markers: [{ at: obs, label: `observed ${obs.toFixed(2)}`, color: 'var(--s2)', dash: '0', anchor: obs > (e0 + e1) / 2 ? 'end' : 'start' }],
  });
  if (pval != null) {
    txt(s, 760 - 18, 26, `p = ${pval < 0.001 ? '<0.001' : pval.toFixed(3)}`, 'dlab', 'end');
  }
  return s;
}

/* ======================= multi-series line ======================= */
/** At most three series. Legend always present; each line also directly labelled. */
export function lineChart(host, {
  series, height = 280, xLabel = '', yLabel = '', xFmt = v => String(Math.round(v)),
  yFmt = v => v.toFixed(2), zeroLine = true, logY = false, bandsFor = null,
}) {
  const w = 760, h = height, m = { l: 60, r: 76, t: 12, b: 44 };
  const s = svg(host, w, h);
  const plot = makePlot(s, w, h, m);
  let xlo = Infinity, xhi = -Infinity, ylo = Infinity, yhi = -Infinity;
  for (const se of series) for (let i = 0; i < se.x.length; i++) {
    if (se.x[i] < xlo) xlo = se.x[i]; if (se.x[i] > xhi) xhi = se.x[i];
    const v = se.y[i];
    if (Number.isFinite(v)) { if (v < ylo) ylo = v; if (v > yhi) yhi = v; }
  }
  if (bandsFor) for (const b of bandsFor) for (const v of [...b.lo, ...b.hi]) { if (v < ylo) ylo = v; if (v > yhi) yhi = v; }
  const pad = (yhi - ylo) * 0.08 || 0.1;
  ylo -= pad; yhi += pad;
  if (zeroLine && ylo > 0) ylo = 0;

  const sx = linScale(xlo, xhi, plot.x0, plot.x1);
  const sy = linScale(ylo, yhi, plot.y1, plot.y0);
  plot.sx = sx; plot.sy = sy;
  frame(s, plot, { xTicks: ticks(xlo, xhi, 7), yTicks: ticks(ylo, yhi, 6), xFmt, yFmt, xLabel, yLabel, zeroAt: zeroLine ? 0 : null });

  if (bandsFor) bandsFor.forEach((b, i) => {
    let d = '';
    for (let j = 0; j < b.x.length; j++) d += `${j ? 'L' : 'M'}${sx(b.x[j]).toFixed(1)},${sy(b.hi[j]).toFixed(1)}`;
    for (let j = b.x.length - 1; j >= 0; j--) d += `L${sx(b.x[j]).toFixed(1)},${sy(b.lo[j]).toFixed(1)}`;
    el(s, 'path', { d: d + 'Z', fill: SERIES[i % 3], opacity: 0.13, stroke: 'none' });
  });

  series.forEach((se, i) => {
    const c = se.color || SERIES[i % 3];
    let d = '';
    let started = false;
    for (let j = 0; j < se.x.length; j++) {
      if (!Number.isFinite(se.y[j])) { started = false; continue; }
      d += `${started ? 'L' : 'M'}${sx(se.x[j]).toFixed(1)},${sy(se.y[j]).toFixed(1)}`;
      started = true;
    }
    el(s, 'path', { d, fill: 'none', stroke: c, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
      'stroke-dasharray': se.dash || null });
    // direct label at the right end -- identity is never colour alone
    let last = se.x.length - 1;
    while (last > 0 && !Number.isFinite(se.y[last])) last--;
    if (Number.isFinite(se.y[last])) {
      const t = txt(s, plot.x1 + 5, sy(se.y[last]) + 3.5, se.name, 'dlab', 'start');
      t.setAttribute('fill', c);
    }
    if (se.points) for (let j = 0; j < se.x.length; j++) {
      if (!Number.isFinite(se.y[j])) continue;
      const cc = el(s, 'circle', { cx: sx(se.x[j]), cy: sy(se.y[j]), r: 4, fill: c, stroke: 'var(--card)', 'stroke-width': 2 });
      cc.addEventListener('mousemove', e => showTip(e, `<b>${se.name}</b>\n${xFmt(se.x[j])} → ${yFmt(se.y[j])}`));
      cc.addEventListener('mouseleave', hideTip);
    }
  });

  if (series.length > 1) {
    const xs = series[0].x.map(v => sx(v));
    crosshair(s, plot, xs, i => `<b>${xFmt(series[0].x[i])}</b>\n` +
      series.map(se => `${se.name}: ${Number.isFinite(se.y[i]) ? yFmt(se.y[i]) : '--'}`).join('\n'));
  }
  return s;
}

/* ======================= scatter ======================= */
export function scatter(host, { x, y, height = 300, xLabel = '', yLabel = '', xFmt = v => v.toFixed(2), yFmt = v => v.toFixed(2), color = 'var(--s1)', maxPoints = 4000, markers = [] }) {
  const w = 760, h = height, m = { l: 60, r: 16, t: 12, b: 44 };
  const s = svg(host, w, h);
  const plot = makePlot(s, w, h, m);
  const step = Math.max(1, Math.ceil(x.length / maxPoints));
  let xlo = Infinity, xhi = -Infinity, ylo = Infinity, yhi = -Infinity;
  for (let i = 0; i < x.length; i += step) {
    if (!Number.isFinite(x[i]) || !Number.isFinite(y[i])) continue;
    if (x[i] < xlo) xlo = x[i]; if (x[i] > xhi) xhi = x[i];
    if (y[i] < ylo) ylo = y[i]; if (y[i] > yhi) yhi = y[i];
  }
  const px = (xhi - xlo) * 0.05 || 0.1, py = (yhi - ylo) * 0.05 || 0.1;
  const sx = linScale(xlo - px, xhi + px, plot.x0, plot.x1);
  const sy = linScale(ylo - py, yhi + py, plot.y1, plot.y0);
  plot.sx = sx; plot.sy = sy;
  frame(s, plot, { xTicks: ticks(xlo, xhi, 7), yTicks: ticks(ylo, yhi, 6), xFmt, yFmt, xLabel, yLabel, zeroAt: 0 });
  const g = el(s, 'g', {});
  for (let i = 0; i < x.length; i += step) {
    if (!Number.isFinite(x[i]) || !Number.isFinite(y[i])) continue;
    el(g, 'circle', { cx: sx(x[i]).toFixed(1), cy: sy(y[i]).toFixed(1), r: 1.6, fill: color, opacity: 0.28 });
  }
  for (const mk of markers) {
    if (mk.x != null) {
      el(s, 'line', { x1: sx(mk.x), x2: sx(mk.x), y1: plot.y0, y2: plot.y1, stroke: mk.color || 'var(--ink2)', 'stroke-width': 1.2, 'stroke-dasharray': '4 3' });
    }
    if (mk.y != null) {
      el(s, 'line', { x1: plot.x0, x2: plot.x1, y1: sy(mk.y), y2: sy(mk.y), stroke: mk.color || 'var(--ink2)', 'stroke-width': 1.2, 'stroke-dasharray': '4 3' });
      const t = txt(s, plot.x0 + 5, sy(mk.y) - 5, mk.label, 'dlab', 'start');
      t.setAttribute('fill', mk.color || 'var(--ink2)');
    }
  }
  return s;
}

/* ======================= QQ plot ======================= */
export function qqPlot(host, { sample, theoretical, height = 300, xLabel = 'normal quantile', yLabel = 'observed quantile' }) {
  const w = 380, h = height, m = { l: 58, r: 14, t: 12, b: 44 };
  const s = svg(host, w, h);
  const plot = makePlot(s, w, h, m);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < sample.length; i++) {
    lo = Math.min(lo, sample[i], theoretical[i]);
    hi = Math.max(hi, sample[i], theoretical[i]);
  }
  const pad = (hi - lo) * 0.05;
  const sx = linScale(lo - pad, hi + pad, plot.x0, plot.x1);
  const sy = linScale(lo - pad, hi + pad, plot.y1, plot.y0);
  plot.sx = sx; plot.sy = sy;
  const f = v => (Math.abs(v) < 0.01 ? (v * 100).toFixed(1) + '%' : (v * 100).toFixed(0) + '%');
  frame(s, plot, { xTicks: ticks(lo, hi, 5), yTicks: ticks(lo, hi, 5), xFmt: f, yFmt: f, xLabel, yLabel, zeroAt: 0 });
  el(s, 'line', { x1: sx(lo - pad), y1: sy(lo - pad), x2: sx(hi + pad), y2: sy(hi + pad), stroke: 'var(--rule)', 'stroke-width': 1.5, 'stroke-dasharray': '4 3' });
  for (let i = 0; i < sample.length; i++) {
    el(s, 'circle', { cx: sx(theoretical[i]).toFixed(1), cy: sy(sample[i]).toFixed(1), r: 2, fill: 'var(--s1)', opacity: 0.55 });
  }
  return s;
}

/* ======================= small multiples ======================= */
/** Facet a set of single-series charts. Used instead of a 4+ colour palette. */
export function smallMultiples(host, panels, { cols = 3, height = 150, yFmt = v => v.toFixed(2), xFmt = v => String(v), yLabel = '', sharedY = true } = {}) {
  host.textContent = '';
  const wrap = document.createElement('div');
  wrap.className = 'facets';
  wrap.style.gridTemplateColumns = `repeat(${cols}, minmax(0,1fr))`;
  host.appendChild(wrap);
  let ylo = Infinity, yhi = -Infinity;
  if (sharedY) for (const p of panels) for (const v of p.y) if (Number.isFinite(v)) { ylo = Math.min(ylo, v); yhi = Math.max(yhi, v); }
  for (const p of panels) {
    const cell = document.createElement('div');
    cell.className = 'facet';
    const head = document.createElement('div');
    head.className = 'facet-h';
    head.innerHTML = `<b>${p.title}</b>${p.sub ? `<span>${p.sub}</span>` : ''}`;
    cell.appendChild(head);
    const body = document.createElement('div');
    cell.appendChild(body);
    wrap.appendChild(cell);

    const fmtY = p.yFmt || yFmt;
    // A panel whose values are all identical has no axis worth drawing. Say so
    // instead of inventing a +/-0.1 scale around a flat line at zero.
    const finiteYs = p.y.filter(Number.isFinite);
    if (finiteYs.length && Math.max(...finiteYs) - Math.min(...finiteYs) < 1e-12) {
      const note = document.createElement('div');
      note.className = 'flatpanel';
      note.textContent = p.flatNote ? p.flatNote(finiteYs[0]) : `${fmtY(finiteYs[0])} at every point`;
      body.appendChild(note);
      continue;
    }
    const w = 300, h = height, m = { l: 46, r: 10, t: 6, b: 26 };
    const s = svg(body, w, h);
    const plot = makePlot(s, w, h, m);
    const lo = sharedY ? ylo : Math.min(...finiteYs);
    const hi = sharedY ? yhi : Math.max(...finiteYs);
    const pad = (hi - lo) * 0.08 || 0.1;
    const sx = linScale(Math.min(...p.x), Math.max(...p.x), plot.x0, plot.x1);
    const sy = linScale(lo - pad, hi + pad, plot.y1, plot.y0);
    plot.sx = sx; plot.sy = sy;
    frame(s, plot, { xTicks: ticks(Math.min(...p.x), Math.max(...p.x), 4), yTicks: ticks(lo - pad, hi + pad, 4), xFmt, yFmt: fmtY, xLabel: '', yLabel: '', zeroAt: 0 });
    let d = '';
    for (let j = 0; j < p.x.length; j++) {
      if (!Number.isFinite(p.y[j])) continue;
      d += `${d ? 'L' : 'M'}${sx(p.x[j]).toFixed(1)},${sy(p.y[j]).toFixed(1)}`;
    }
    el(s, 'path', { d, fill: 'none', stroke: p.color || 'var(--s1)', 'stroke-width': 2, 'stroke-linejoin': 'round' });
    if (p.points) for (let j = 0; j < p.x.length; j++) {
      if (!Number.isFinite(p.y[j])) continue;
      const c = el(s, 'circle', { cx: sx(p.x[j]), cy: sy(p.y[j]), r: 3.5, fill: p.color || 'var(--s1)', stroke: 'var(--card)', 'stroke-width': 1.5 });
      c.addEventListener('mousemove', e => showTip(e, `<b>${p.title}</b>\n${xFmt(p.x[j])} → ${fmtY(p.y[j])}`));
      c.addEventListener('mouseleave', hideTip);
    }
    if (p.mark != null) {
      el(s, 'line', { x1: sx(p.mark), x2: sx(p.mark), y1: plot.y0, y2: plot.y1, stroke: 'var(--s2)', 'stroke-width': 1.3, 'stroke-dasharray': '3 3' });
    }
  }
  return wrap;
}

/* ======================= heatmap ======================= */
export function heatmap(host, { matrix, rows, cols, height = 300, fmt = v => (v * 100).toFixed(0) + '%', rowLabel = '', colLabel = '', title = '' }) {
  const w = 760, m = { l: 74, r: 18, t: 12, b: 48 };
  const h = height;
  const s = svg(host, w, h);
  const plot = makePlot(s, w, h, m);
  const cw = (plot.x1 - plot.x0) / cols.length;
  const ch = (plot.y1 - plot.y0) / rows.length;
  let lo = Infinity, hi = -Infinity;
  for (const r of matrix) for (const v of r) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (hi === lo) hi = lo + 1;
  // single-hue sequential ramp -- never a rainbow
  const ramp = t => {
    const stops = [[243, 248, 253], [201, 223, 245], [148, 192, 235], [83, 148, 216], [23, 64, 122]];
    const x = Math.max(0, Math.min(0.999, t)) * (stops.length - 1);
    const i = Math.floor(x), f = x - i;
    const a = stops[i], b = stops[Math.min(i + 1, stops.length - 1)];
    return `rgb(${Math.round(a[0] + (b[0] - a[0]) * f)},${Math.round(a[1] + (b[1] - a[1]) * f)},${Math.round(a[2] + (b[2] - a[2]) * f)})`;
  };
  for (let i = 0; i < rows.length; i++) {
    for (let j = 0; j < cols.length; j++) {
      const v = matrix[i][j];
      const t = (v - lo) / (hi - lo);
      const r = el(s, 'rect', {
        x: plot.x0 + j * cw + 1, y: plot.y0 + i * ch + 1,
        width: Math.max(1, cw - 2), height: Math.max(1, ch - 2),
        fill: ramp(t), rx: 2,
      });
      r.addEventListener('mousemove', e => showTip(e, `<b>${rowLabel} ${rows[i]} · ${colLabel} ${cols[j]}</b>\n${fmt(v)}`));
      r.addEventListener('mouseleave', hideTip);
      if (cw > 42 && ch > 20) {
        const t2 = txt(s, plot.x0 + j * cw + cw / 2, plot.y0 + i * ch + ch / 2 + 3.5, fmt(v), 'cell');
        t2.setAttribute('fill', t > 0.55 ? '#fff' : 'var(--ink)');
      }
    }
  }
  for (let i = 0; i < rows.length; i++) txt(s, plot.x0 - 7, plot.y0 + i * ch + ch / 2 + 3.5, String(rows[i]), 'ax', 'end');
  for (let j = 0; j < cols.length; j++) txt(s, plot.x0 + j * cw + cw / 2, plot.y1 + 15, String(cols[j]), 'ax');
  if (rowLabel) { const t = txt(s, 0, 0, rowLabel, 'axlab'); t.setAttribute('transform', `translate(12,${(plot.y0 + plot.y1) / 2}) rotate(-90)`); }
  if (colLabel) txt(s, (plot.x0 + plot.x1) / 2, h - 8, colLabel, 'axlab');
  return s;
}

/* ======================= horizontal bars with CI ======================= */
export function barsCI(host, { items, height = null, fmt = v => v.toFixed(2), xLabel = '', zero = 0 }) {
  const rowH = 26, w = 760, m = { l: 150, r: 60, t: 10, b: 40 };
  const h = height || (items.length * rowH + m.t + m.b);
  const s = svg(host, w, h);
  const plot = makePlot(s, w, h, m);
  let lo = Infinity, hi = -Infinity;
  for (const it of items) { lo = Math.min(lo, it.lo ?? it.value, it.value); hi = Math.max(hi, it.hi ?? it.value, it.value); }
  lo = Math.min(lo, zero); hi = Math.max(hi, zero);
  const pad = (hi - lo) * 0.08 || 0.1;
  const sx = linScale(lo - pad, hi + pad, plot.x0, plot.x1);
  for (const t of ticks(lo - pad, hi + pad, 6)) {
    el(s, 'line', { x1: sx(t), x2: sx(t), y1: plot.y0, y2: plot.y1, class: 'gl' });
    txt(s, sx(t), plot.y1 + 15, fmt(t), 'ax');
  }
  el(s, 'line', { x1: sx(zero), x2: sx(zero), y1: plot.y0, y2: plot.y1, class: 'zl' });
  items.forEach((it, i) => {
    const y = plot.y0 + i * rowH + rowH / 2;
    txt(s, plot.x0 - 9, y + 3.5, it.label, 'rowlab', 'end');
    const c = it.color || (it.value >= zero ? 'var(--s1)' : 'var(--s2)');
    if (it.lo != null && it.hi != null) {
      el(s, 'line', { x1: sx(it.lo), x2: sx(it.hi), y1: y, y2: y, stroke: c, 'stroke-width': 2, opacity: 0.35, 'stroke-linecap': 'round' });
      el(s, 'line', { x1: sx(it.lo), x2: sx(it.lo), y1: y - 4, y2: y + 4, stroke: c, 'stroke-width': 1.5 });
      el(s, 'line', { x1: sx(it.hi), x2: sx(it.hi), y1: y - 4, y2: y + 4, stroke: c, 'stroke-width': 1.5 });
    }
    const dot = el(s, 'circle', { cx: sx(it.value), cy: y, r: 5, fill: c, stroke: 'var(--card)', 'stroke-width': 2 });
    dot.addEventListener('mousemove', e => showTip(e, `<b>${it.label}</b>\n${fmt(it.value)}${it.lo != null ? `\n95%: ${fmt(it.lo)} to ${fmt(it.hi)}` : ''}${it.note ? '\n' + it.note : ''}`));
    dot.addEventListener('mouseleave', hideTip);
    txt(s, plot.x1 + 6, y + 3.5, fmt(it.value), 'dlab', 'start');
  });
  if (xLabel) txt(s, (plot.x0 + plot.x1) / 2, h - 6, xLabel, 'axlab');
  return s;
}

/* ======================= legend ======================= */
export function legend(host, entries) {
  host.textContent = '';
  for (const e of entries) {
    const d = document.createElement('span');
    d.className = 'lg';
    d.innerHTML = `<i class="sw${e.dot ? ' d' : ''}" style="background:${e.color}${e.dash ? ';opacity:.65' : ''}"></i>${e.label}`;
    host.appendChild(d);
  }
  return host;
}

/* ======================= signed bar chart ======================= */
/** Monthly or yearly P&L: positive up in green, negative down in red.
 *  Status colours, used for their reserved meaning (good / bad), never as
 *  categorical series slots. */
export function signedBars(host, {
  values, labels, height = 240, fmt = v => v.toFixed(0), xLabel = '', yLabel = '',
  maxLabels = 14,
}) {
  const w = 760, m = { l: 62, r: 14, t: 12, b: 42 };
  const h = height;
  const s = svg(host, w, h);
  const plot = makePlot(s, w, h, m);
  const n = values.length;
  if (!n) return s;
  let lo = Math.min(0, ...values), hi = Math.max(0, ...values);
  const pad = (hi - lo) * 0.08 || 1;
  lo -= pad; hi += pad;
  const sx = linScale(0, n, plot.x0, plot.x1);
  const sy = linScale(lo, hi, plot.y1, plot.y0);
  plot.sx = sx; plot.sy = sy;

  for (const t of ticks(lo, hi, 6)) {
    const y = sy(t);
    if (y < plot.y0 - 0.5 || y > plot.y1 + 0.5) continue;
    el(s, 'line', { x1: plot.x0, x2: plot.x1, y1: y, y2: y, class: 'gl' });
    txt(s, plot.x0 - 7, y + 3.5, fmt(t), 'ax', 'end');
  }
  const zy = sy(0);
  el(s, 'line', { x1: plot.x0, x2: plot.x1, y1: zy, y2: zy, class: 'zl' });

  const bw = (plot.x1 - plot.x0) / n;
  const every = Math.max(1, Math.ceil(n / maxLabels));
  for (let i = 0; i < n; i++) {
    const v = values[i];
    const y = sy(Math.max(v, 0));
    const hgt = Math.abs(sy(v) - zy);
    const r = el(s, 'rect', {
      x: plot.x0 + i * bw + 0.8, y, width: Math.max(0.6, bw - 1.6),
      height: Math.max(0.6, hgt), rx: Math.min(2, bw / 3),
      fill: v >= 0 ? 'var(--good)' : 'var(--bad)', opacity: 0.85,
    });
    r.addEventListener('mousemove', e => showTip(e, `<b>${labels[i]}</b>\n${fmt(v)}`));
    r.addEventListener('mouseleave', hideTip);
    if (i % every === 0) {
      const t = txt(s, plot.x0 + i * bw + bw / 2, plot.y1 + 15, labels[i], 'ax');
      if (n > 24) t.setAttribute('transform', `rotate(-45 ${plot.x0 + i * bw + bw / 2} ${plot.y1 + 15})`);
    }
  }
  if (yLabel) { const t = txt(s, 0, 0, yLabel, 'axlab'); t.setAttribute('transform', `translate(11,${(plot.y0 + plot.y1) / 2}) rotate(-90)`); }
  if (xLabel) txt(s, (plot.x0 + plot.x1) / 2, h - 5, xLabel, 'axlab');
  return s;
}

/* ======================= grouped horizontal bars ======================= */
/** Two measures per row, for "strategy against benchmark" in each regime.
 *  Exactly two series, so the validated categorical pair is enough and both
 *  are directly labelled. */
export function groupedBars(host, {
  rows, height = null, fmt = v => v.toFixed(1), xLabel = '',
  nameA = 'strategy', nameB = 'benchmark',
}) {
  const rowH = 38, w = 760, m = { l: 210, r: 70, t: 24, b: 40 };
  const h = height || (rows.length * rowH + m.t + m.b);
  const s = svg(host, w, h);
  const plot = makePlot(s, w, h, m);
  const vals = rows.flatMap(r => [r.a, r.b]).filter(Number.isFinite);
  let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  const pad = (hi - lo) * 0.1 || 1;
  lo -= pad; hi += pad;
  const sx = linScale(lo, hi, plot.x0, plot.x1);
  for (const t of ticks(lo, hi, 6)) {
    el(s, 'line', { x1: sx(t), x2: sx(t), y1: plot.y0, y2: plot.y1, class: 'gl' });
    txt(s, sx(t), plot.y1 + 15, fmt(t), 'ax');
  }
  el(s, 'line', { x1: sx(0), x2: sx(0), y1: plot.y0, y2: plot.y1, class: 'zl' });
  txt(s, plot.x0, plot.y0 - 9, nameA, 'dlab', 'start').setAttribute('fill', SERIES[0]);
  txt(s, plot.x0 + 86, plot.y0 - 9, nameB, 'dlab', 'start').setAttribute('fill', SERIES[1]);

  rows.forEach((r, i) => {
    const y = plot.y0 + i * rowH;
    txt(s, plot.x0 - 9, y + rowH / 2 + 1, r.label, 'rowlab', 'end');
    if (r.sub) txt(s, plot.x0 - 9, y + rowH / 2 + 13, r.sub, 'ax', 'end');
    [[r.a, SERIES[0], 0], [r.b, SERIES[1], 1]].forEach(([v, c, k]) => {
      if (!Number.isFinite(v)) return;
      const x0 = sx(Math.min(0, v)), x1 = sx(Math.max(0, v));
      const bar = el(s, 'rect', {
        x: x0, y: y + 6 + k * 11, width: Math.max(1, x1 - x0), height: 9,
        fill: c, rx: 2, opacity: 0.88,
      });
      bar.addEventListener('mousemove', e => showTip(e, `<b>${r.label}</b>\n${k ? nameB : nameA}: ${fmt(v)}${r.sub ? '\n' + r.sub : ''}`));
      bar.addEventListener('mouseleave', hideTip);
    });
    txt(s, plot.x1 + 6, y + rowH / 2 + 3, fmt(r.a), 'dlab', 'start').setAttribute('fill', SERIES[0]);
  });
  if (xLabel) txt(s, (plot.x0 + plot.x1) / 2, h - 4, xLabel, 'axlab');
  return s;
}

/* ======================= filled area (underwater) ======================= */
export function areaChart(host, {
  x, y, height = 220, color = 'var(--bad)', fmt = v => v.toFixed(0),
  xLabel = '', yLabel = '', xFmt = v => String(Math.round(v)),
}) {
  const w = 760, m = { l: 66, r: 14, t: 12, b: 40 };
  const h = height;
  const s = svg(host, w, h);
  const plot = makePlot(s, w, h, m);
  let lo = Math.min(0, ...y), hi = Math.max(0, ...y);
  const pad = (hi - lo) * 0.06 || 1;
  lo -= pad;
  const sx = linScale(x[0], x[x.length - 1], plot.x0, plot.x1);
  const sy = linScale(lo, hi, plot.y1, plot.y0);
  plot.sx = sx; plot.sy = sy;
  frame(s, plot, { xTicks: ticks(x[0], x[x.length - 1], 7), yTicks: ticks(lo, hi, 5),
    xFmt, yFmt: fmt, xLabel, yLabel, zeroAt: 0 });
  let d = `M${sx(x[0])},${sy(0)}`;
  for (let i = 0; i < x.length; i++) d += `L${sx(x[i]).toFixed(1)},${sy(y[i]).toFixed(1)}`;
  d += `L${sx(x[x.length - 1])},${sy(0)}Z`;
  el(s, 'path', { d, fill: color, opacity: 0.22, stroke: 'none' });
  let line = '';
  for (let i = 0; i < x.length; i++) line += `${i ? 'L' : 'M'}${sx(x[i]).toFixed(1)},${sy(y[i]).toFixed(1)}`;
  el(s, 'path', { d: line, fill: 'none', stroke: color, 'stroke-width': 1.5 });
  const worst = Math.min(...y), wi = y.indexOf(worst);
  el(s, 'circle', { cx: sx(x[wi]), cy: sy(worst), r: 4, fill: color, stroke: 'var(--card)', 'stroke-width': 2 });
  txt(s, sx(x[wi]), sy(worst) + 16, fmt(worst), 'dlab').setAttribute('fill', color);
  crosshair(s, plot, x.map(v => sx(v)), i => `<b>${xFmt(x[i])}</b>\n${fmt(y[i])}`);
  return s;
}
