// Smoothed hands + cartoon glove drawing.
// Tracking arrives at ~30 Hz; landmarks are eased at render rate so motion stays smooth at 60 fps.
// Every toy gets the same hand objects:
//   { id, pts[21] | null, tips[{x,y,vx,vy}], pinch{x,y}, down, justDown, justUp, palm{x,y}, size, alpha }
// The mouse becomes a one-fingertip "hand" so everything also works without a camera.

const TIPS = [4, 8, 12, 16, 20];
export const FINGER_NAMES = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];
// Fingertip pairs we report as "touching": thumb to each finger, and neighbouring fingers.
// Thresholds are fingertip distance ÷ palm length (3D world landmarks), with hysteresis.
const PAIRS = [[0, 1, 0.3, 0.4], [0, 2, 0.3, 0.4], [0, 3, 0.3, 0.4], [0, 4, 0.3, 0.4], [1, 2, 0.2, 0.28], [2, 3, 0.2, 0.28], [3, 4, 0.2, 0.28]];
const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const FINGERS = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];
const PALM = [0, 1, 5, 9, 13, 17];
const TAU = 0.012;                                   // s — light easing; prediction happens in input/hands.js

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

// Sleek matte glove: light top, slightly cooler toward the wrist; mint tint while pinching.
export const GLOVE = { top: '#F7F8FA', bottom: '#C9CED8', pinchTop: '#E9FBF2', pinchBottom: '#A9DCC5', ring: '#F7F8FA' };

export const STYLES = ['Glove', 'X-ray', 'Shadow'];

export class Hands {
  constructor() {
    this.style = 'Glove';
    this.map = new Map();
    this.last = performance.now();
    this.list = [];
  }

  update(pointers, now) {
    const dt = Math.min(0.1, Math.max(1e-3, (now - this.last) / 1000));
    this.last = now;
    const k = 1 - Math.exp(-dt / TAU);
    const live = new Set();

    for (const p of pointers) {
      live.add(p.id);
      let h = this.map.get(p.id);
      const fresh = !h;
      if (fresh) {
        h = { id: p.id, kind: p.kind, alpha: 0, pinchAmt: 0, down: false, tips: [], pts: p.pts ? p.pts.map((q) => ({ ...q })) : null };
        this.map.set(p.id, h);
      }
      if (p.pts) h.pts.forEach((q, i) => { q.x += (p.pts[i].x - q.x) * k; q.y += (p.pts[i].y - q.y) * k; q.z = (q.z || 0) + ((p.pts[i].z || 0) - (q.z || 0)) * k; });

      const prevTips = h.tips;
      const raw = h.pts ? TIPS.map((i) => h.pts[i]) : [{ x: p.x, y: p.y }];
      h.tips = raw.map((t, i) => {
        const o = prevTips[i];
        const vx = o && !fresh ? (t.x - o.x) / dt : 0, vy = o && !fresh ? (t.y - o.y) / dt : 0;
        return { x: t.x, y: t.y, vx: o ? o.vx + (vx - o.vx) * 0.5 : 0, vy: o ? o.vy + (vy - o.vy) * 0.5 : 0 };
      });
      h.pinch = { x: p.x, y: p.y };
      h.palm = h.pts ? { x: (h.pts[0].x + h.pts[5].x + h.pts[17].x) / 3, y: (h.pts[0].y + h.pts[5].y + h.pts[17].y) / 3 } : h.pinch;
      h.size = h.pts ? (dist(h.pts[0], h.pts[9]) + dist(h.pts[5], h.pts[17])) / 2 : 60;
      h.justDown = p.down && !h.down;
      h.justUp = !p.down && h.down;
      h.down = p.down;
      h.progress = p.progress || 0;
      h.world = p.world || null;          // raw 3D landmarks (metres) for pose classifiers
      h.handed = p.handed || '';
      // which fingertips are touching (e.g. thumb + middle)
      h.touch ??= new Set();
      if (h.world) {
        const L = dist3(h.world[0], h.world[9]) || 1;
        for (const [a, b, enter, exit] of PAIRS) {
          const key = `${a}-${b}`, r = dist3(h.world[TIPS[a]], h.world[TIPS[b]]) / L;
          if (r < enter) h.touch.add(key); else if (r > exit) h.touch.delete(key);
        }
      } else h.touch.clear();
      h.pinchAmt += ((p.down ? 1 : 0) - h.pinchAmt) * Math.min(1, k * 2);
      h.alpha += ((p.conf ?? 1) - h.alpha) * Math.min(1, k * 1.5);
      h.lost = false;
    }
    for (const [id, h] of this.map) {
      if (live.has(id)) continue;
      if (!h.lost) { h.lost = true; h.justUp = h.down; h.down = false; } else h.justUp = false;
      h.alpha -= dt * 4;
      if (h.alpha <= 0) this.map.delete(id);
    }
    this.list = [...this.map.values()].filter((h) => !h.lost);
    return this.list;
  }

  // ── cartoon gloves ──────────────────────────────────────────────────
  draw(g) {
    const hands = [...this.map.values()].filter((h) => h.pts && h.alpha > 0.01);
    if (!hands.length) return;
    if (this.style === 'X-ray' || this.style === 'Shadow') {
      // silhouettes are drawn solid on a layer and blended once, so overlapping strokes don't show seams
      const L = (this.layer ??= document.createElement('canvas'));
      if (L.width !== g.canvas.width || L.height !== g.canvas.height) { L.width = g.canvas.width; L.height = g.canvas.height; }
      const lg = L.getContext('2d');
      for (const h of hands) {
        lg.setTransform(1, 0, 0, 1, 0, 0); lg.clearRect(0, 0, L.width, L.height); lg.setTransform(g.getTransform());
        if (this.style === 'X-ray') drawXray(g, h, lg, L); else drawShadowPuppet(g, h, lg, L);
      }
      return;
    }
    // One soft shadow for all hands: silhouettes drawn into a small (1/6 res) canvas, blurred there,
    // then scaled up — far cheaper than shadowBlur on every stroke, and no dark bands between fingers.
    const cw = g.canvas.width, ch = g.canvas.height;
    const sc0 = (this.shadow ??= document.createElement('canvas'));
    const k = 'filter' in sc0.getContext('2d') ? 6 : 12;   // no canvas filter → smaller canvas = softer upscale
    const sc = sc0;
    const sw = Math.ceil(cw / k), sh = Math.ceil(ch / k);
    if (sc.width !== sw || sc.height !== sh) { sc.width = sw; sc.height = sh; }
    const sg = sc.getContext('2d');
    const m = g.getTransform();                      // CSS px → device px
    sg.setTransform(m.a / k, 0, 0, m.d / k, 0, 0);
    sg.clearRect(0, 0, cw, ch);
    sg.filter = 'blur(1.5px)';
    sg.fillStyle = sg.strokeStyle = '#000';
    for (const h of hands) { sg.globalAlpha = Math.min(1, h.alpha); drawGlove(sg, h, true); }
    sg.filter = 'none';
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 0.26;
    g.drawImage(sc, 0, 0, sw, sh, cw * 0.004, ch * 0.014, cw, ch);
    g.restore();
    for (const h of hands) {
      g.save();
      g.globalAlpha = Math.min(1, h.alpha);
      drawGlove(g, h);
      g.restore();
    }
  }

  // Finger names at the fingertips, and a callout for fingertips that are touching.
  drawLabels(g) {
    g.save();
    g.font = '600 10px -apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const pill = (text, x, y, strong) => {
      const w = g.measureText(text).width + 12, hgt = 17;
      g.fillStyle = strong ? 'rgba(124,227,177,0.95)' : 'rgba(14,15,18,0.72)';
      g.beginPath(); g.roundRect(x - w / 2, y - hgt / 2, w, hgt, hgt / 2); g.fill();
      g.fillStyle = strong ? '#0E0F12' : '#F2F3F5';
      g.fillText(text, x, y + 0.5);
    };
    for (const h of this.map.values()) {
      if (!h.pts || h.alpha <= 0.05) continue;
      g.globalAlpha = Math.min(1, h.alpha);
      const touching = new Set([...h.touch].flatMap((k) => k.split('-').map(Number)));
      TIPS.forEach((tip, f) => {
        const a = h.pts[tip - 1], b = h.pts[tip], L = dist(a, b) || 1;
        const off = h.size * 0.2 + 8;
        pill(FINGER_NAMES[f], b.x + ((b.x - a.x) / L) * off, b.y + ((b.y - a.y) / L) * off, touching.has(f));
      });
      // touch callouts: a glow where the tips meet + "Thumb + Middle"
      let row = 0;
      for (const key of h.touch) {
        const [a, b] = key.split('-').map(Number);
        const pa = h.pts[TIPS[a]], pb = h.pts[TIPS[b]], m = mid(pa, pb);
        const glow = g.createRadialGradient(m.x, m.y, 0, m.x, m.y, 18);
        glow.addColorStop(0, 'rgba(124,227,177,0.9)'); glow.addColorStop(1, 'rgba(124,227,177,0)');
        g.fillStyle = glow; g.beginPath(); g.arc(m.x, m.y, 18, 0, Math.PI * 2); g.fill();
        const wrist = h.pts[0];
        g.font = '600 12px -apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif';
        pill(`${FINGER_NAMES[a]} + ${FINGER_NAMES[b]}`, wrist.x, wrist.y + h.size * 0.55 + 12 + row * 22, true);
        g.font = '600 10px -apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif';
        row++;
      }
    }
    g.restore();
  }

  drawCursors(g) {
    for (const h of this.map.values()) {
      if (h.alpha <= 0.01 || h.kind !== 'hand') continue;
      const r = 9 - 5 * Math.max(h.progress, h.pinchAmt);
      g.save();
      g.globalAlpha = 0.85 * h.alpha;
      g.lineWidth = 2;
      g.strokeStyle = GLOVE.ring;
      g.fillStyle = `rgba(247,248,250,${h.pinchAmt})`;
      g.beginPath(); g.arc(h.pinch.x, h.pinch.y, r, 0, Math.PI * 2); g.fill(); g.stroke();
      g.restore();
    }
  }
}

// Smooth curve through a finger's joints (midpoint quadratic spline) — no visible elbows.
function fingerPath(g, pts) {
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const m = mid(pts[i], pts[i + 1]);
    g.quadraticCurveTo(pts[i].x, pts[i].y, m.x, m.y);
  }
  const last = pts[pts.length - 1];
  g.lineTo(last.x, last.y);
}

// One solid silhouette (fingers + palm + a wrist that fades out), shaded with a single
// gradient, a soft contact shadow and a gentle highlight down each finger. No outlines.
function drawGlove(g, h, shadowOnly = false) {
  const p = h.pts, s = h.size;
  const fingerW = s * 0.25, thumbW = s * 0.28, palmW = s * 0.36;

  // depth: fingers pointing toward the camera read slightly wider and brighter
  const fingers = FINGERS.map((chain, f) => {
    const pts = chain.map((i) => p[i]);
    const base = f === 0 ? mid(p[0], p[1]) : mid(p[chain[0]], p[9]);
    const near = Math.max(-0.12, Math.min(0.2, -((p[chain[3]].z || 0) - (p[0].z || 0)) / s * 0.3));
    return { pts: [base, ...pts], near, z: p[chain[3]].z || 0, w: (f === 0 ? thumbW : fingerW * (f === 4 ? 0.85 : f === 2 ? 1.04 : 1)) * (1 + near) };
  }).sort((a, b) => b.z - a.z);                     // farthest first, nearest drawn last
  for (const f of fingers) {                       // round the tips just past the landmark
    const a = f.pts[f.pts.length - 2], b = f.pts[f.pts.length - 1], L = dist(a, b) || 1;
    f.pts[f.pts.length - 1] = { x: b.x + ((b.x - a.x) / L) * f.w * 0.1, y: b.y + ((b.y - a.y) / L) * f.w * 0.1 };
  }

  // wrist: a short stub back along the forearm that fades to nothing
  const ux = (p[0].x - p[9].x) / (dist(p[0], p[9]) || 1), uy = (p[0].y - p[9].y) / (dist(p[0], p[9]) || 1);
  const wristEnd = { x: p[0].x + ux * s * 0.42, y: p[0].y + uy * s * 0.42 };

  // light comes from the fingertips' side of the hand
  const tipC = mid(p[12], p[8]);
  const grad = g.createLinearGradient(tipC.x, tipC.y, p[0].x, p[0].y);
  const t = h.pinchAmt;
  grad.addColorStop(0, t > 0.01 ? blend(GLOVE.top, GLOVE.pinchTop, t) : GLOVE.top);
  grad.addColorStop(1, t > 0.01 ? blend(GLOVE.bottom, GLOVE.pinchBottom, t) : GLOVE.bottom);

  const silhouette = () => {
    g.beginPath();
    PALM.forEach((i, n) => (n ? g.lineTo(p[i].x, p[i].y) : g.moveTo(p[i].x, p[i].y)));
    g.closePath();
    g.lineWidth = palmW;
    g.fill(); g.stroke();
    for (const f of fingers) { g.beginPath(); fingerPath(g, f.pts); g.lineWidth = f.w; g.stroke(); }
  };

  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (shadowOnly) { silhouette(); return; }

  // soft wrist fade
  const wg = g.createLinearGradient(p[0].x, p[0].y, wristEnd.x, wristEnd.y);
  wg.addColorStop(0, t > 0.01 ? blend(GLOVE.bottom, GLOVE.pinchBottom, t) : GLOVE.bottom);
  wg.addColorStop(1, 'rgba(201,206,216,0)');
  g.strokeStyle = wg;
  g.lineWidth = s * 0.5;
  g.beginPath(); g.moveTo(p[0].x, p[0].y); g.lineTo(wristEnd.x, wristEnd.y); g.stroke();

  // body (its shadow is drawn once for all hands in Hands.draw)
  g.fillStyle = g.strokeStyle = grad;
  silhouette();

  // highlight: a thin brighter core down each finger, nudged toward the light
  g.save();
  const baseAlpha = g.globalAlpha;
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  for (const f of fingers) {
    g.globalAlpha = baseAlpha * (0.45 + Math.max(0, f.near) * 1.6);
    const a = f.pts[1], b = f.pts[f.pts.length - 1], L = dist(a, b) || 1;
    const nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L;
    const off = f.w * 0.16;
    g.lineWidth = f.w * 0.22;
    g.beginPath();
    fingerPath(g, f.pts.slice(1).map((q) => ({ x: q.x - nx * off, y: q.y - ny * off })));
    g.stroke();
  }
  g.restore();
}

// Paint one merged hand silhouette (palm + fingers + forearm stub) with the current fill/stroke.
function silhouetteShape(g, h, k = 1, forearm = 1.6) {
  const p = h.pts, s = h.size;
  g.lineCap = g.lineJoin = 'round';
  g.beginPath(); PALM.forEach((i, n) => (n ? g.lineTo(p[i].x, p[i].y) : g.moveTo(p[i].x, p[i].y))); g.closePath();
  g.lineWidth = s * 0.4 * k; g.fill(); g.stroke();
  FINGERS.forEach((chain, f) => {
    g.beginPath(); fingerPath(g, [f === 0 ? mid(p[0], p[1]) : mid(p[chain[0]], p[9]), ...chain.map((i) => p[i])]);
    g.lineWidth = s * (f === 0 ? 0.3 : f === 4 ? 0.24 : 0.27) * k; g.stroke();
  });
  const ux = (p[0].x - p[9].x) / (dist(p[0], p[9]) || 1), uy = (p[0].y - p[9].y) / (dist(p[0], p[9]) || 1);
  g.lineWidth = s * 0.62 * k; g.beginPath(); g.moveTo(p[0].x, p[0].y); g.lineTo(p[0].x + ux * s * forearm, p[0].y + uy * s * forearm); g.stroke();
}
function composite(g, L, alpha, filter) {
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = alpha; if (filter) g.filter = filter;
  g.drawImage(L, 0, 0); g.restore();
}

// X-ray: reads like a radiograph — a blue soft-tissue haze, thick bones with bright cortical edges
// and darker marrow, joint gaps, knobbly joint ends, carpals, radius + ulna, and a scan line.
function drawXray(g, h, lg, L, t = performance.now() / 1000) {
  const p = h.pts, s = h.size, a0 = Math.min(1, h.alpha);
  const lerp = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
  const ux = (p[0].x - p[9].x) / (dist(p[0], p[9]) || 1), uy = (p[0].y - p[9].y) / (dist(p[0], p[9]) || 1);   // toward the elbow
  const nx = -uy, ny = ux;
  // film glow
  const c = lerp(p[0], p[9], 0.4), R = s * 2.8;
  const film = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, R);
  film.addColorStop(0, `rgba(8,20,42,${0.9 * a0})`); film.addColorStop(1, 'rgba(8,20,42,0)');
  g.fillStyle = film; g.beginPath(); g.arc(c.x, c.y, R, 0, Math.PI * 2); g.fill();
  // soft tissue: one merged silhouette, faint
  lg.fillStyle = lg.strokeStyle = '#3d78c0';
  silhouetteShape(lg, h, 1.05);
  composite(g, L, 0.42 * a0, 'blur(3px)');

  g.save();
  g.globalAlpha = a0;
  g.lineCap = g.lineJoin = 'round';
  const bone = (a, b, w, gap = 0.08) => {
    const A = lerp(a, b, gap), B = lerp(a, b, 1 - gap), ang = Math.atan2(B.y - A.y, B.x - A.x);
    g.strokeStyle = 'rgba(214,232,250,0.95)'; g.lineWidth = w;
    g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); g.stroke();
    g.strokeStyle = 'rgba(132,170,210,0.75)'; g.lineWidth = w * 0.38;           // marrow
    const A2 = lerp(A, B, 0.22), B2 = lerp(A, B, 0.78);
    g.beginPath(); g.moveTo(A2.x, A2.y); g.lineTo(B2.x, B2.y); g.stroke();
    g.fillStyle = 'rgba(236,246,255,0.97)';
    for (const [P, k] of [[A, 0.68], [B, 0.72]]) { g.beginPath(); g.ellipse(P.x, P.y, w * 0.42, w * k, ang, 0, Math.PI * 2); g.fill(); }
  };
  // radius (thumb side, thicker) + ulna
  const wb = lerp(p[0], { x: p[0].x + ux, y: p[0].y + uy }, s * 0.14);
  [[-1, 0.15], [1, 0.12]].forEach(([side, wd]) => {
    const top = { x: wb.x + nx * side * s * 0.1, y: wb.y + ny * side * s * 0.1 };
    bone(top, { x: top.x + ux * s * 1.6, y: top.y + uy * s * 1.6 }, s * wd, 0.01);
  });
  // carpals: 8 small irregular bones in two rows
  const cc = lerp(p[0], p[9], 0.14);
  const sizes = [0.07, 0.06, 0.065, 0.055, 0.06, 0.07, 0.058, 0.066];
  for (let i = 0; i < 8; i++) {
    const row = i < 4 ? 0 : 1, k = i % 4, across = (k - 1.5) * s * 0.12 + (row ? s * 0.02 : 0), along = row * s * 0.12;
    const x = cc.x + nx * across + ux * along, y = cc.y + ny * across + uy * along;
    g.fillStyle = 'rgba(205,226,248,0.9)';
    g.beginPath(); g.ellipse(x, y, s * sizes[i], s * sizes[i] * 0.8, Math.atan2(ny, nx) + i, 0, Math.PI * 2); g.fill();
  }
  // metacarpals + phalanges
  FINGERS.forEach((chain, f) => {
    const w0 = s * (f === 0 ? 0.13 : f === 4 ? 0.095 : 0.11);
    if (f === 0) { bone(lerp(p[0], p[1], 0.5), p[2], w0, 0.04); bone(p[2], p[3], w0 * 0.88); bone(p[3], p[4], w0 * 0.75, 0.1); }
    else {
      bone(lerp(p[0], p[chain[0]], 0.32), p[chain[0]], w0, 0.03);
      bone(p[chain[0]], p[chain[1]], w0 * 0.9); bone(p[chain[1]], p[chain[2]], w0 * 0.78); bone(p[chain[2]], p[chain[3]], w0 * 0.66, 0.12);
    }
  });
  // scan line
  const k = (t * 0.45) % 1, len = s * 1.6;
  const from = { x: p[0].x + ux * s * 1.4, y: p[0].y + uy * s * 1.4 }, S = lerp(from, p[12], k);
  const grad = g.createLinearGradient(S.x - ux * 14, S.y - uy * 14, S.x + ux * 14, S.y + uy * 14);
  grad.addColorStop(0, 'rgba(120,220,255,0)'); grad.addColorStop(0.5, 'rgba(170,240,255,0.55)'); grad.addColorStop(1, 'rgba(120,220,255,0)');
  g.globalCompositeOperation = 'lighter';
  g.strokeStyle = grad; g.lineWidth = 28;
  g.beginPath(); g.moveTo(S.x - nx * len, S.y - ny * len); g.lineTo(S.x + nx * len, S.y + ny * len); g.stroke();
  g.restore();
}

// Shadow puppet: one soft solid silhouette (no seams), like a hand in front of a lamp.
function drawShadowPuppet(g, h, lg, L) {
  lg.fillStyle = lg.strokeStyle = '#140f09';
  silhouetteShape(lg, h, 1, 2.2);
  composite(g, L, 0.9 * Math.min(1, h.alpha), 'blur(2.5px)');
}

function blend(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const x = p(a), y = p(b);
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`;
}
