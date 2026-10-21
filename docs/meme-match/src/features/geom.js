// Small 2D/3D geometry helpers for feature extraction. Points are plain {x, y[, z]}.

export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: (a.z ?? 0) - (b.z ?? 0) });
export const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z ?? 0) + (b.z ?? 0)) / 2 });
export const len2 = (a) => Math.hypot(a.x, a.y);
export const len3 = (a) => Math.hypot(a.x, a.y, a.z ?? 0);
export const dist2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
export const cross3 = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const mean = (...v) => v.reduce((s, x) => s + x, 0) / v.length;

export function unit(a) { const l = len2(a) || 1; return { x: a.x / l, y: a.y / l }; }

// Angle at b (degrees) between b→a and b→c, in 3D.
export function angle3(a, b, c) {
  const u = sub(a, b), v = sub(c, b);
  const d = (u.x * v.x + u.y * v.y + u.z * v.z) / ((len3(u) * len3(v)) || 1);
  return (Math.acos(clamp(d, -1, 1)) * 180) / Math.PI;
}

// A 2D frame: origin o, unit axis u (frame x), v = u rotated +90° (frame y, image-down when upright).
export function frame(o, u, s) {
  const v = { x: -u.y, y: u.x };
  return {
    o, u, v, s,
    to: (p) => ({ x: ((p.x - o.x) * u.x + (p.y - o.y) * u.y) / s, y: ((p.x - o.x) * v.x + (p.y - o.y) * v.y) / s }),
    dir: (d) => ({ x: d.x * u.x + d.y * u.y, y: d.x * v.x + d.y * v.y }),     // rotate a direction into the frame
    from: (q) => ({ x: o.x + (q.x * u.x + q.y * v.x) * s, y: o.y + (q.x * u.y + q.y * v.y) * s }),
  };
}

// Convex hull (monotone chain), counter-clockwise in a y-down image (i.e. as cross > 0 sees it).
export function hull(pts) {
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop();
  return lo.concat(up);
}

// Point inside a convex polygon from hull() (optionally grown by `pad` px around its centroid).
export function inHull(h, p, pad = 0) {
  if (h.length < 3) return false;
  let cx = 0, cy = 0;
  for (const q of h) { cx += q.x; cy += q.y; }
  cx /= h.length; cy /= h.length;
  for (let i = 0; i < h.length; i++) {
    const a = h[i], b = h[(i + 1) % h.length];
    const ex = b.x - a.x, ey = b.y - a.y, el = Math.hypot(ex, ey) || 1;
    // signed distance of p from edge a→b, positive on the inside (same side as the centroid)
    const side = (ex * (cy - a.y) - ey * (cx - a.x)) >= 0 ? 1 : -1;
    const d = side * (ex * (p.y - a.y) - ey * (p.x - a.x)) / el;
    if (d < -pad) return false;
  }
  return true;
}
