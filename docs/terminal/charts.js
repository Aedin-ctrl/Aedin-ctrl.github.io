/* Canvas charts for the terminal: candles, line, area, bars and the yield curve.
 *
 * Deliberate choices:
 * - Volume sits in its own band under the price plot with its own baseline. It
 *   is never a second y-axis on the price plot -- two scales on one frame is
 *   the single most misread thing in financial charting.
 * - Series colours come from the validated --s1..--s4 tokens; red and green are
 *   reserved for direction and never used to tell two series apart.
 * - Every line/area chart ships a crosshair and a tooltip; reading a value off
 *   a pixel is not a thing anyone should have to do.
 */
(function (global) {
  "use strict";

  const css = (n, fb) =>
    (getComputedStyle(document.documentElement).getPropertyValue(n) || fb).trim();

  const COLORS = {
    get ink()    { return css("--ink", "#e9e4d8"); },
    get dim()    { return css("--muted", "#6f6a60"); },
    get amber()  { return css("--amber", "#ff9e18"); },
    get up()     { return css("--up", "#2ecc71"); },
    get down()   { return css("--down", "#ff4d4d"); },
    get rule()   { return css("--rule", "#262220"); },
    get panel()  { return css("--panel", "#0c0c0c"); },
    series: ["--s1", "--s2", "--s3", "--s4"].map((v) => () => css(v, "#c57300")),
  };
  const SERIES_BY_NAME = {
    amber: () => css("--s1", "#c57300"),
    cyan:  () => css("--s2", "#00a4af"),
    blue:  () => css("--s3", "#6480e9"),
    violet:() => css("--s3", "#6480e9"),
    magenta:() => css("--s4", "#c25faf"),
    white: () => css("--s4", "#c25faf"),
    dim:   () => css("--muted", "#6f6a60"),
  };

  const PAD = { l: 8, r: 66, t: 10, b: 22 };
  const nice = (v, dp) =>
    v == null || !isFinite(v) ? "--" :
      Math.abs(v) >= 1e4 ? v.toLocaleString("en-US", { maximumFractionDigits: 0 })
        : v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

  function fmtVol(v) {
    if (v == null || !isFinite(v)) return "--";
    const a = Math.abs(v);
    if (a >= 1e12) return (v / 1e12).toFixed(2) + "T";
    if (a >= 1e9) return (v / 1e9).toFixed(2) + "B";
    if (a >= 1e6) return (v / 1e6).toFixed(2) + "M";
    if (a >= 1e3) return (v / 1e3).toFixed(1) + "K";
    return String(Math.round(v));
  }

  /* Choose ~5 round gridline values spanning [lo, hi]. */
  function ticks(lo, hi, count) {
    if (!(isFinite(lo) && isFinite(hi)) || hi === lo) return [lo];
    const raw = (hi - lo) / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(v);
    return out;
  }

  function setupCanvas(cv, w, h) {
    const dpr = Math.min(global.devicePixelRatio || 1, 2);
    cv.width = Math.max(1, Math.round(w * dpr));
    cv.height = Math.max(1, Math.round(h * dpr));
    cv.style.height = h + "px";
    const g = cv.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    return g;
  }

  /* ------------------------------------------------------------- the chart */
  function draw(host, spec) {
    const kind = spec.kind || "line";
    const data = spec.data || {};
    const t = data.t || [];
    const c = (data.c || []).map((v) => (v == null || !isFinite(v) ? null : v));
    if (!t.length || !c.some((v) => v != null)) {
      host.innerHTML = '<p class="proseblock dim">No data to plot.</p>';
      return;
    }

    const hasOHLC = kind === "candle" && data.o && data.h && data.l;
    const hasVol = (kind === "candle" || kind === "area") && data.v &&
                   data.v.some((v) => v);
    const overlays = (spec.overlays || []).filter(
      (o) => o.values && o.values.some((v) => v != null));

    // Legend first: identity must never be colour-alone.
    host.innerHTML = "";
    if (overlays.length || spec.legend) {
      const leg = document.createElement("div");
      leg.className = "chart-legend";
      const entries = [{ label: spec.seriesLabel || "PRICE", color: COLORS.amber }]
        .concat(overlays.map((o) => ({
          label: o.label, color: (SERIES_BY_NAME[o.color] || SERIES_BY_NAME.amber)(), dash: o.dash,
        })));
      entries.forEach((e) => {
        const s = document.createElement("span");
        const i = document.createElement("i");
        i.style.background = e.color;
        if (e.dash) i.style.cssText += `background:repeating-linear-gradient(90deg,${e.color} 0 4px,transparent 4px 7px)`;
        s.append(i, document.createTextNode(e.label));
        leg.append(s);
      });
      host.append(leg);
    }

    const wrap = document.createElement("div");
    wrap.className = "chart-host";
    const cv = document.createElement("canvas");
    wrap.append(cv);
    const tip = document.createElement("div");
    tip.className = "chart-tip";
    tip.hidden = true;
    wrap.append(tip);
    host.append(wrap);

    let geom = null;

    function render() {
      const w = wrap.clientWidth || host.clientWidth || 600;
      const h = spec.height || (spec.tall ? 540 : 232);
      const g = setupCanvas(cv, w, h);

      const volH = hasVol ? Math.round(h * 0.17) : 0;
      const plotT = PAD.t;
      // x labels live below everything, so the volume band gets its own strip.
      const axisY = h - PAD.b;
      const plotB = axisY - (volH ? volH + 10 : 0);
      const plotH = Math.max(10, plotB - plotT);
      const plotL = PAD.l, plotR = w - PAD.r, plotW = Math.max(10, plotR - plotL);

      // y-range over everything drawn, so nothing clips.
      let lo = Infinity, hi = -Infinity;
      const consider = (v) => { if (v != null && isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } };
      if (hasOHLC) { data.h.forEach(consider); data.l.forEach(consider); } else c.forEach(consider);
      overlays.forEach((o) => o.values.forEach(consider));
      if (spec.yrange) { lo = spec.yrange[0]; hi = spec.yrange[1]; }
      if (!isFinite(lo) || !isFinite(hi)) return;
      if (lo === hi) { lo -= 1; hi += 1; }
      const padY = (hi - lo) * 0.06;
      if (!spec.yrange) { lo -= padY; hi += padY; }

      const n = t.length;
      const X = (i) => plotL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
      const Y = (v) => plotB - ((v - lo) / (hi - lo)) * plotH;
      geom = { X, Y, plotL, plotR, plotT, plotB, n, w, h, lo, hi };

      const dp = hi - lo < 2 ? 4 : hi - lo < 50 ? 2 : hi < 1000 ? 2 : 0;

      // Recessive grid + right-hand price scale.
      g.font = '10px ' + css("--mono", "monospace");
      g.textBaseline = "middle";
      ticks(lo, hi, 5).forEach((v) => {
        const y = Math.round(Y(v)) + 0.5;
        if (y < plotT - 1 || y > plotB + 1) return;
        g.strokeStyle = COLORS.rule; g.lineWidth = 1;
        g.beginPath(); g.moveTo(plotL, y); g.lineTo(plotR, y); g.stroke();
        g.fillStyle = COLORS.dim; g.textAlign = "left";
        g.fillText(nice(v, dp), plotR + 6, y);
      });

      // Reference bands (RSI 70/30).
      (spec.bands || []).forEach((b) => {
        const y = Math.round(Y(b.at)) + 0.5;
        g.save(); g.setLineDash([3, 3]); g.strokeStyle = COLORS.dim; g.lineWidth = 1;
        g.beginPath(); g.moveTo(plotL, y); g.lineTo(plotR, y); g.stroke(); g.restore();
      });

      // Previous close reference on an intraday chart.
      if (data.prev_close != null && data.intraday) {
        const y = Math.round(Y(data.prev_close)) + 0.5;
        if (y > plotT && y < plotB) {
          g.save(); g.setLineDash([2, 4]); g.strokeStyle = COLORS.dim; g.lineWidth = 1;
          g.beginPath(); g.moveTo(plotL, y); g.lineTo(plotR, y); g.stroke(); g.restore();
        }
      }

      // x labels: a handful, never a dense ribbon.
      g.fillStyle = COLORS.dim; g.textAlign = "center"; g.textBaseline = "top";
      const want = Math.max(2, Math.min(9, Math.floor(plotW / 92)));
      for (let k = 0; k < want; k++) {
        const i = Math.round((k / (want - 1)) * (n - 1));
        const lab = String(t[i] || "");
        g.fillText(data.intraday ? lab.slice(11, 16) : lab.slice(0, 7),
                   Math.min(plotR - 16, Math.max(plotL + 16, X(i))), axisY + 4);
      }

      const rise = COLORS.up, fall = COLORS.down;

      if (kind === "candle" && hasOHLC) {
        const bw = Math.max(1, Math.min(9, plotW / n - 1));
        for (let i = 0; i < n; i++) {
          const o = data.o[i], hh = data.h[i], ll = data.l[i], cc = c[i];
          if (cc == null || hh == null || ll == null) continue;
          const col = cc >= (o ?? cc) ? rise : fall;
          const x = Math.round(X(i)) + 0.5;
          g.strokeStyle = col; g.lineWidth = 1;
          g.beginPath(); g.moveTo(x, Y(hh)); g.lineTo(x, Y(ll)); g.stroke();
          if (bw >= 2 && o != null) {
            const yo = Y(o), yc = Y(cc);
            g.fillStyle = col;
            g.fillRect(x - bw / 2, Math.min(yo, yc), bw, Math.max(1, Math.abs(yc - yo)));
          }
        }
      } else if (kind === "bar") {
        const bw = Math.max(1, Math.min(34, plotW / n - 3));
        const zeroY = Y(Math.max(lo, Math.min(hi, 0)));
        for (let i = 0; i < n; i++) {
          const v = c[i]; if (v == null) continue;
          const x = X(i), y = Y(v);
          g.fillStyle = v >= 0 ? COLORS.series[0]() : fall;
          const top = Math.min(y, zeroY), hgt = Math.max(1, Math.abs(y - zeroY));
          // 4px rounded data-end, square against the baseline.
          const r = Math.min(4, bw / 2, hgt);
          g.beginPath();
          if (v >= 0) {
            g.moveTo(x - bw / 2, top + hgt); g.lineTo(x - bw / 2, top + r);
            g.quadraticCurveTo(x - bw / 2, top, x - bw / 2 + r, top);
            g.lineTo(x + bw / 2 - r, top); g.quadraticCurveTo(x + bw / 2, top, x + bw / 2, top + r);
            g.lineTo(x + bw / 2, top + hgt);
          } else {
            g.rect(x - bw / 2, top, bw, hgt);
          }
          g.closePath(); g.fill();
        }
      } else {
        // line / area
        const last = c[c.length - 1], first = c.find((v) => v != null);
        const base = data.intraday && data.prev_close != null ? data.prev_close : first;
        const col = kind === "area" ? (last >= base ? rise : fall) : COLORS.amber;
        if (kind === "area") {
          const grad = g.createLinearGradient(0, plotT, 0, plotB);
          grad.addColorStop(0, col + "44"); grad.addColorStop(1, col + "00");
          g.beginPath();
          let started = false;
          for (let i = 0; i < n; i++) {
            if (c[i] == null) continue;
            started ? g.lineTo(X(i), Y(c[i])) : (g.moveTo(X(i), Y(c[i])), started = true);
          }
          g.lineTo(X(n - 1), plotB); g.lineTo(X(0), plotB); g.closePath();
          g.fillStyle = grad; g.fill();
        }
        g.strokeStyle = col; g.lineWidth = 2; g.lineJoin = "round";
        g.beginPath();
        let started = false;
        for (let i = 0; i < n; i++) {
          if (c[i] == null) { started = false; continue; }
          started ? g.lineTo(X(i), Y(c[i])) : (g.moveTo(X(i), Y(c[i])), started = true);
        }
        g.stroke();
      }

      // Overlays on top, thin.
      overlays.forEach((o) => {
        g.strokeStyle = (SERIES_BY_NAME[o.color] || SERIES_BY_NAME.amber)();
        g.lineWidth = o.dash ? 1 : 1.5;
        g.save(); if (o.dash) g.setLineDash([4, 3]);
        g.beginPath();
        let started = false;
        for (let i = 0; i < Math.min(n, o.values.length); i++) {
          const v = o.values[i];
          if (v == null) { started = false; continue; }
          started ? g.lineTo(X(i), Y(v)) : (g.moveTo(X(i), Y(v)), started = true);
        }
        g.stroke(); g.restore();
      });

      // Volume band: own baseline, own scale, visually separated.
      if (hasVol) {
        const vTop = plotB + 10, vBot = axisY - 2;
        // Scale to the 95th percentile, not the max: a single 6x session
        // otherwise squashes every normal bar to one invisible pixel. The
        // outlier is allowed to clip at the top of its band.
        const vals = data.v.filter((v) => v != null && isFinite(v) && v > 0).sort((a, b) => a - b);
        const vMax = vals.length
          ? Math.max(vals[Math.floor(vals.length * 0.95)], 1) : 1;
        const bw = Math.max(1, Math.min(9, plotW / n - 1));
        for (let i = 0; i < n; i++) {
          const v = data.v[i]; if (!v) continue;
          const bh = Math.max(1, Math.min(1, v / vMax) * (vBot - vTop));
          const o = hasOHLC ? data.o[i] : c[i - 1];
          g.fillStyle = (c[i] >= (o ?? c[i]) ? rise : fall) + "66";
          g.fillRect(X(i) - bw / 2, vBot - bh, bw, bh);
        }
        g.strokeStyle = COLORS.rule; g.lineWidth = 1;
        g.beginPath(); g.moveTo(plotL, vBot + 0.5); g.lineTo(plotR, vBot + 0.5); g.stroke();
        g.fillStyle = COLORS.dim; g.textAlign = "left"; g.textBaseline = "top";
        g.fillText("VOL", plotR + 6, vTop);
        g.fillText(fmtVol(vMax), plotR + 6, vTop + 11);
      }

      // Last-price flag on the right scale.
      const lastV = [...c].reverse().find((v) => v != null);
      if (lastV != null && !spec.yrange) {
        const y = Y(lastV);
        if (y > plotT && y < plotB) {
          const label = nice(lastV, dp);
          g.font = '10px ' + css("--mono", "monospace");
          const tw = g.measureText(label).width + 10;
          g.fillStyle = COLORS.amber;
          g.fillRect(plotR + 2, y - 7, Math.max(tw, PAD.r - 6), 14);
          g.fillStyle = "#000"; g.textAlign = "left"; g.textBaseline = "middle";
          g.fillText(label, plotR + 7, y);
        }
      }
    }

    /* ------------------------------------------------- crosshair + tooltip */
    function onMove(ev) {
      if (!geom) return;
      const r = cv.getBoundingClientRect();
      const x = ev.clientX - r.left, y = ev.clientY - r.top;
      if (x < geom.plotL || x > geom.plotR) { onLeave(); return; }
      const i = Math.max(0, Math.min(geom.n - 1,
        Math.round(((x - geom.plotL) / (geom.plotR - geom.plotL)) * (geom.n - 1))));
      render();
      const g = cv.getContext("2d");
      const px = geom.X(i);
      g.save();
      g.strokeStyle = COLORS.amber; g.lineWidth = 1; g.setLineDash([2, 3]);
      g.beginPath(); g.moveTo(px + 0.5, geom.plotT); g.lineTo(px + 0.5, geom.plotB); g.stroke();
      if (y > geom.plotT && y < geom.plotB) {
        g.beginPath(); g.moveTo(geom.plotL, y + 0.5); g.lineTo(geom.plotR, y + 0.5); g.stroke();
      }
      g.restore();
      if (c[i] != null) {
        g.fillStyle = COLORS.amber;
        g.beginPath(); g.arc(px, geom.Y(c[i]), 3.5, 0, Math.PI * 2); g.fill();
      }

      const dp = geom.hi - geom.lo < 2 ? 4 : geom.hi - geom.lo < 50 ? 2 : 2;
      const rows = [];
      if (hasOHLC) {
        rows.push(["O", nice(data.o[i], dp)], ["H", nice(data.h[i], dp)],
                  ["L", nice(data.l[i], dp)], ["C", nice(c[i], dp)]);
      } else {
        rows.push(["VALUE", nice(c[i], dp)]);
      }
      if (hasVol && data.v[i]) rows.push(["VOL", fmtVol(data.v[i])]);
      overlays.forEach((o) => {
        if (o.values[i] != null) rows.push([o.label, nice(o.values[i], dp)]);
      });
      tip.innerHTML = "<b>" + String(t[i]).replace(/</g, "&lt;") + "</b><dl>" +
        rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("") + "</dl>";
      tip.hidden = false;
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      tip.style.left = Math.min(geom.w - tw - 4, Math.max(2, px + 14)) + "px";
      tip.style.top = Math.min(geom.h - th - 4, Math.max(2, y - th - 10)) + "px";
    }
    function onLeave() { tip.hidden = true; render(); }

    cv.addEventListener("pointermove", onMove);
    cv.addEventListener("pointerleave", onLeave);

    render();
    const ro = new ResizeObserver(() => render());
    ro.observe(wrap);
    host._ro && host._ro.disconnect();
    host._ro = ro;
  }

  /* ---------------------------------------------------------- yield curve */
  function drawCurve(host, series) {
    host.innerHTML = "";
    const leg = document.createElement("div");
    leg.className = "chart-legend";
    series.forEach((s, i) => {
      const span = document.createElement("span");
      const sw = document.createElement("i");
      sw.style.background = COLORS.series[i % 4]();
      span.append(sw, document.createTextNode(s.label));
      leg.append(span);
    });
    host.append(leg);

    const wrap = document.createElement("div");
    wrap.className = "chart-host";
    const cv = document.createElement("canvas");
    wrap.append(cv);
    const tip = document.createElement("div");
    tip.className = "chart-tip"; tip.hidden = true; wrap.append(tip);
    host.append(wrap);

    const tenors = (series[0].points || []).map((p) => p.tenor);
    let geom = null;

    function render() {
      const w = wrap.clientWidth || 600, h = 360;
      const g = setupCanvas(cv, w, h);
      const L = 10, R = w - 54, T = 12, B = h - 26;
      let lo = Infinity, hi = -Infinity;
      series.forEach((s) => s.points.forEach((p) => {
        if (p.value != null && isFinite(p.value)) {
          lo = Math.min(lo, p.value); hi = Math.max(hi, p.value);
        }
      }));
      if (!isFinite(lo)) { host.innerHTML = '<p class="proseblock dim">No curve data.</p>'; return; }
      const pad = (hi - lo) * 0.14 || 0.2; lo -= pad; hi += pad;
      const n = tenors.length;
      const X = (i) => L + (i / Math.max(1, n - 1)) * (R - L);
      const Y = (v) => B - ((v - lo) / (hi - lo)) * (B - T);
      geom = { X, Y, L, R, T, B, n, w, h };

      g.font = '10px ' + css("--mono", "monospace");
      g.textBaseline = "middle";
      ticks(lo, hi, 5).forEach((v) => {
        const y = Math.round(Y(v)) + 0.5;
        g.strokeStyle = COLORS.rule; g.lineWidth = 1;
        g.beginPath(); g.moveTo(L, y); g.lineTo(R, y); g.stroke();
        g.fillStyle = COLORS.dim; g.textAlign = "left";
        g.fillText(v.toFixed(2) + "%", R + 6, y);
      });
      g.textAlign = "center"; g.textBaseline = "top"; g.fillStyle = COLORS.dim;
      tenors.forEach((tn, i) => g.fillText(tn, X(i), B + 6));

      series.forEach((s, si) => {
        const col = COLORS.series[si % 4]();
        g.strokeStyle = col; g.lineWidth = si === 0 ? 2 : 1.5;
        g.save(); if (si > 0) g.setLineDash([4, 3]);
        g.beginPath();
        let started = false;
        s.points.forEach((p, i) => {
          if (p.value == null) { started = false; return; }
          started ? g.lineTo(X(i), Y(p.value)) : (g.moveTo(X(i), Y(p.value)), started = true);
        });
        g.stroke(); g.restore();
        if (si === 0) {
          g.fillStyle = col;
          s.points.forEach((p, i) => {
            if (p.value == null) return;
            g.beginPath(); g.arc(X(i), Y(p.value), 4, 0, Math.PI * 2); g.fill();
          });
        }
      });
    }

    cv.addEventListener("pointermove", (ev) => {
      if (!geom) return;
      const r = cv.getBoundingClientRect();
      const x = ev.clientX - r.left;
      const i = Math.max(0, Math.min(geom.n - 1,
        Math.round(((x - geom.L) / (geom.R - geom.L)) * (geom.n - 1))));
      render();
      const g = cv.getContext("2d");
      g.save(); g.strokeStyle = COLORS.amber; g.setLineDash([2, 3]);
      g.beginPath(); g.moveTo(geom.X(i) + 0.5, geom.T); g.lineTo(geom.X(i) + 0.5, geom.B); g.stroke();
      g.restore();
      tip.innerHTML = "<b>" + tenors[i] + "</b><dl>" + series.map((s) =>
        `<dt>${s.label}</dt><dd>${s.points[i] && s.points[i].value != null
          ? s.points[i].value.toFixed(2) + "%" : "--"}</dd>`).join("") + "</dl>";
      tip.hidden = false;
      tip.style.left = Math.min(geom.w - tip.offsetWidth - 4, geom.X(i) + 14) + "px";
      tip.style.top = "14px";
    });
    cv.addEventListener("pointerleave", () => { tip.hidden = true; render(); });

    render();
    const ro = new ResizeObserver(() => render());
    ro.observe(wrap);
  }

  global.Charts = { draw, drawCurve, fmtVol };
})(window);
