// Warp: pull your hands apart to jump to light speed; the point between your palms steers.
const N = 700;
export class Warp {
  name = 'Warp';
  hint = 'Pull your hands apart to jump to light speed · move them to steer';
  constructor({ size }) { this.size = size; this.s = Array.from({ length: N }, () => this.spawn({})); this.v = 0.2; this.c = null; }
  spawn(p, far = false) { p.x = (Math.random() - 0.5) * 2; p.y = (Math.random() - 0.5) * 2; p.z = far ? 1 : Math.random(); return p; }
  update(dt, hands) {
    const { w, h } = this.size(), hs = hands.filter((x) => x.pts);
    let tgt = 0.15, c = { x: w / 2, y: h / 2 };
    if (hs.length >= 2) {
      const a = hs[0].palm, b = hs[1].palm, d = Math.hypot(a.x - b.x, a.y - b.y) / w;
      tgt = 0.1 + 3 * Math.max(0, Math.min(1, (d - 0.15) / 0.65)) ** 2; c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    } else if (hs.length === 1) { tgt = Math.min(3, (hs[0].size / h) * 8); c = hs[0].palm; }
    this.v += (tgt - this.v) * Math.min(1, dt * 3);
    this.c = this.c ? { x: this.c.x + (c.x - this.c.x) * 0.1, y: this.c.y + (c.y - this.c.y) * 0.1 } : c;
    for (const p of this.s) { p.z -= this.v * dt; if (p.z < 0.02) this.spawn(p, true); }
  }
  draw(g) {
    if (!this.c) return;
    const { w } = this.size(), F = w * 0.5, P = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
    for (const p of this.s) {
      const x1 = this.c.x + (p.x / p.z) * F, y1 = this.c.y + (p.y / p.z) * F;
      const z0 = Math.min(1, p.z + this.v * 0.05), x0 = this.c.x + (p.x / z0) * F, y0 = this.c.y + (p.y / z0) * F;
      const b = Math.min(3, ((1 - p.z) * 4) | 0); P[b].moveTo(x0, y0); P[b].lineTo(x1, y1);
    }
    const sat = Math.min(100, this.v * 40);
    g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
    P.forEach((p, b) => { g.strokeStyle = `hsl(220,${sat}%,${70 + b * 8}%)`; g.globalAlpha = 0.25 + b * 0.25; g.lineWidth = 0.6 + b * 0.7; g.stroke(p); });
    g.restore();
  }
}
