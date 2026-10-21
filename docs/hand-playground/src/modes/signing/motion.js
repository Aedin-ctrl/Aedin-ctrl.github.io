// Motion letters J and Z (research/17 §5). Paths are fingertip positions in palm lengths, y down.
//   J: the I handshape, pinky traces down then hooks sideways.
//   Z: an index point, the fingertip draws across → down-and-back → across.

// Ramer–Douglas–Peucker simplification.
export function simplify(pts, eps) {
  if (pts.length < 3) return pts.slice();
  const [a, b] = [pts[0], pts[pts.length - 1]];
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1e-6;
  let idx = -1, max = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs(dy * pts[i].x - dx * pts[i].y + b.x * a.y - b.y * a.x) / L;
    if (d > max) { max = d; idx = i; }
  }
  if (max <= eps) return [a, b];
  return [...simplify(pts.slice(0, idx + 1), eps).slice(0, -1), ...simplify(pts.slice(idx), eps)];
}

const length = (pts) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0);

export function isJ(path) {
  if (path.length < 6) return false;
  const L = length(path);
  if (L < 1.0 || L > 6) return false;
  const start = path[0], end = path[path.length - 1];
  let low = start;
  for (const p of path) if (p.y > low.y) low = p;
  const drop = low.y - start.y;                     // went down…
  const hook = Math.abs(end.x - low.x);             // …then curved sideways
  const rise = low.y - end.y;
  return drop > 0.45 && hook > 0.3 && rise > -0.1 && Math.abs(low.x - start.x) < drop * 1.2;
}

export function isZ(path) {
  if (path.length < 8) return false;
  const L = length(path);
  if (L < 1.4 || L > 8) return false;
  const s = simplify(path, 0.18);
  if (s.length < 4 || s.length > 6) return false;
  const seg = s.slice(1).map((p, i) => ({ dx: p.x - s[i].x, dy: p.y - s[i].y }));
  const [a, b, c] = [seg[0], seg[1], seg[seg.length - 1]];
  const horiz = (v) => Math.abs(v.dx) > 0.35 && Math.abs(v.dy) < Math.abs(v.dx) * 0.6;
  return horiz(a) && horiz(c) && Math.sign(a.dx) === Math.sign(c.dx) &&
    b.dy > 0.35 && Math.sign(b.dx) === -Math.sign(a.dx);
}

// Rolling fingertip trails for the last ~1.2 s, in palm lengths.
export class Trails {
  constructor(ms = 1200) { this.ms = ms; this.pinky = []; this.index = []; this.poses = []; }
  reset() { this.pinky.length = 0; this.index.length = 0; this.poses.length = 0; }
  // Raw pixels + palm length per sample; normalised by one reference length at detect time, so
  // palm-size jitter (or leaning in) doesn't look like a sweep.
  add(hand, pose, now) {
    const w = hand.pts[0], L = Math.hypot(hand.pts[9].x - w.x, hand.pts[9].y - w.y) || 1;
    this.pinky.push({ t: now, x: hand.pts[20].x, y: hand.pts[20].y, L });
    this.index.push({ t: now, x: hand.pts[8].x, y: hand.pts[8].y, L });
    this.poses.push({ t: now, pose });
    for (const a of [this.pinky, this.index, this.poses]) while (a.length && now - a[0].t > this.ms) a.shift();
  }
  // Fraction of recent frames whose raw top letter was one of `letters`.
  share(letters) { return this.poses.length ? this.poses.filter((p) => letters.includes(p.pose)).length / this.poses.length : 0; }
  norm(trail) {
    if (!trail.length) return trail;
    const Ls = trail.map((p) => p.L).sort((a, b) => a - b), Lref = Ls[Ls.length >> 1];
    const p0 = trail[0];
    return trail.map((p) => ({ x: (p.x - p0.x) / Lref, y: (p.y - p0.y) / Lref }));
  }
  detect() {
    if (this.share(['I']) > 0.55 && isJ(this.norm(this.pinky))) return 'J';
    if (this.share(['D', 'G', 'X']) > 0.55 && isZ(this.norm(this.index))) return 'Z';
    return null;
  }
}
