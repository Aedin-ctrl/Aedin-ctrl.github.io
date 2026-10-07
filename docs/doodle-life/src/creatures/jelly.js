// Jelly: the fallback for anything not recognised. The drawing becomes a soft body by shape
// matching (Müller et al. 2005): every stroke point is a particle that falls and collides, then is
// pulled back toward the best rigid fit of the original shape (plus a little linear stretch, so it
// squashes). It hops now and then, toward whatever it's looking at.
import { Creature, clamp } from './base.js';

export class Jelly extends Creature {
  constructor(strokes, opts) {
    super(strokes, opts);
    // resample: particles every ~6 px so long strokes stay smooth but cheap
    this.parts = [];
    this.strokeIdx = this.strokes.map((s) => {
      const idx = [];
      let acc = Infinity, last = null;
      s.forEach((p, i) => {
        if (last) acc += Math.hypot(p.x - last.x, p.y - last.y);
        if (acc >= 6 || i === s.length - 1) { idx.push(this.parts.length); this.parts.push({ q: { ...p }, x: 0, y: 0, px: 0, py: 0 }); acc = 0; }
        last = p;
      });
      return idx;
    });
    for (const p of this.parts) { p.x = p.px = this.x + p.q.x; p.y = p.py = this.y + p.q.y; }
    this.stiff = 0.6; this.hopIn = 0.8 + Math.random(); this.grounded = false;
    this.placeEyes({ front: 0 });
  }

  update(dt) {
    super.update(dt);
    const W = this.world, g = 1400;
    const steps = 2, h = dt / steps;
    for (let s = 0; s < steps; s++) {
      for (const p of this.parts) {                 // Verlet with a little damping
        const vx = (p.x - p.px) * 0.995, vy = (p.y - p.py) * 0.995;
        p.px = p.x; p.py = p.y;
        p.x += vx; p.y += vy + g * h * h;
      }
      this.match();
      this.grounded = false;
      for (const p of this.parts) {                 // floor and walls, with friction on contact
        if (p.y > W.ground) { p.y = W.ground; p.px = p.x - (p.x - p.px) * 0.6; this.grounded = true; }
        if (p.x < 4) { p.x = 4; } if (p.x > W.w - 4) { p.x = W.w - 4; }
        if (p.y < 4) { p.y = 4; }
      }
    }
    // centre of mass for eyes, picking, etc.
    let cx = 0, cy = 0;
    for (const p of this.parts) { cx += p.x; cy += p.y; }
    this.x = cx / this.parts.length; this.y = cy / this.parts.length;
    // hop toward the focus (cursor), now and then
    this.hopIn -= dt;
    if (this.grounded && this.hopIn < 0) {
      const f = W.focus, dir = f ? clamp((f.x - this.x) / 300, -1, 1) : (Math.random() - 0.5) * 2;
      const vy = -(260 + Math.random() * 160), vx = dir * 140;
      for (const p of this.parts) { p.px = p.x - vx * dt; p.py = p.y - vy * dt; }
      this.hopIn = 1.2 + Math.random() * 1.8;
      W.sound?.('boing', this);
    }
  }

  poke(x, y) { super.poke(); for (const p of this.parts) { const d = Math.hypot(p.x - x, p.y - y) || 1; p.px = p.x - ((p.x - x) / d) * 6; p.py = p.y - ((p.y - y) / d) * 6 + 4; } }

  // Shape matching: least-squares rotation (2D polar decomposition) + a bit of the linear fit.
  match() {
    const P = this.parts, n = P.length;
    let cx = 0, cy = 0;
    for (const p of P) { cx += p.x; cy += p.y; }
    cx /= n; cy /= n;
    let a = 0, b = 0, c = 0, d = 0, qq0 = 0, qq1 = 0, qq3 = 0;        // A = Σ (x−c) qᵀ, Q = Σ q qᵀ
    for (const p of P) {
      const rx = p.x - cx, ry = p.y - cy;
      a += rx * p.q.x; b += rx * p.q.y; c += ry * p.q.x; d += ry * p.q.y;
      qq0 += p.q.x * p.q.x; qq1 += p.q.x * p.q.y; qq3 += p.q.y * p.q.y;
    }
    const th = Math.atan2(c - b, a + d), co = Math.cos(th), si = Math.sin(th);
    // linear part L = A Q⁻¹, normalised to unit area, blended in for squash & stretch
    const det = qq0 * qq3 - qq1 * qq1 || 1;
    let l0 = (a * qq3 - b * qq1) / det, l1 = (b * qq0 - a * qq1) / det, l2 = (c * qq3 - d * qq1) / det, l3 = (d * qq0 - c * qq1) / det;
    const ld = Math.sqrt(Math.abs(l0 * l3 - l1 * l2)) || 1;
    l0 /= ld; l1 /= ld; l2 /= ld; l3 /= ld;
    const beta = 0.35;
    const m0 = beta * l0 + (1 - beta) * co, m1 = beta * l1 - (1 - beta) * si, m2 = beta * l2 + (1 - beta) * si, m3 = beta * l3 + (1 - beta) * co;
    for (const p of P) {
      const gx = cx + m0 * p.q.x + m1 * p.q.y, gy = cy + m2 * p.q.x + m3 * p.q.y;
      p.x += (gx - p.x) * this.stiff; p.y += (gy - p.y) * this.stiff;
    }
    this.angle = th;
  }

  draw(g) {
    g.save();
    g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = this.color; g.lineWidth = 4;
    for (const idx of this.strokeIdx) {
      if (idx.length < 2) continue;
      const pts = idx.map((i) => this.parts[i]);
      g.beginPath(); g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) g.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
      g.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      g.stroke();
    }
    g.restore();
    if (this.eyes) this.drawEyes(g);
  }
  // eyes ride on the soft body: local eye point → current fit
  toWorld(p) {
    const c = Math.cos(this.angle), n = Math.sin(this.angle);
    return { x: this.x + p.x * c - p.y * n, y: this.y + p.x * n + p.y * c };
  }
}
