// Strokes → a small grayscale image for the classifier. Pure JS (no canvas), so training (Node)
// and recognition (browser) prepare drawings with exactly the same code.
//   strokes: [[{x, y}, …], …] in any units → Float32Array(size*size) with ink = 1
// The drawing is scaled to fit inside the frame keeping its aspect ratio, centred, and drawn as an
// anti-aliased line of `width` px (at the output size).

export function rasterize(strokes, { size = 28, margin = 2, width = 1.4 } = {}) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) for (const p of s) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
  const img = new Float32Array(size * size);
  if (!Number.isFinite(x0)) return img;
  const span = Math.max(x1 - x0, y1 - y0, 1e-6);
  const k = (size - 2 * margin) / span;
  const ox = (size - (x1 - x0) * k) / 2 - x0 * k, oy = (size - (y1 - y0) * k) / 2 - y0 * k;
  const r = width / 2;
  for (const s of strokes) {
    for (let i = 0; i < s.length; i++) {
      const a = s[i], b = s[Math.min(i + 1, s.length - 1)];
      segment(img, size, a.x * k + ox, a.y * k + oy, b.x * k + ox, b.y * k + oy, r);
    }
  }
  return img;
}

// Distance-to-segment coverage, max-blended (so overlapping strokes don't over-darken).
function segment(img, size, ax, ay, bx, by, r) {
  const minX = Math.max(0, Math.floor(Math.min(ax, bx) - r - 1)), maxX = Math.min(size - 1, Math.ceil(Math.max(ax, bx) + r + 1));
  const minY = Math.max(0, Math.floor(Math.min(ay, by) - r - 1)), maxY = Math.min(size - 1, Math.ceil(Math.max(ay, by) + r + 1));
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const px = x + 0.5, py = y + 0.5;
    let t = L2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    const v = Math.max(0, Math.min(1, r + 0.5 - d));
    const i = y * size + x;
    if (v > img[i]) img[i] = v;
  }
}

// Quick, Draw! simplified format → our stroke format: [[xs], [ys]] per stroke.
export function fromQuickDraw(drawing) {
  return drawing.map(([xs, ys]) => xs.map((x, i) => ({ x, y: ys[i] })));
}
