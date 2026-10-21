// Kaleidoscope: every fingertip paints in mirrored 6/8/12-fold symmetry — a living mandala.
import { Trail } from './trail.js';
const FOLDS = [6, 8, 12];
export class Kaleidoscope {
  name = 'Kaleidoscope';
  hint = 'Paint with every finger · pinch to change the symmetry · two hands move the centre';
  constructor({ size, sfx }) { this.size = size; this.sfx = sfx; this.trail = new Trail(size); this.prev = new Map(); this.t = 0; this.fi = 1; this.segs = []; }
  update(dt, hands) {
    this.t += dt; this.segs.length = 0;
    const { w, h } = this.size(), hs = hands.filter((x) => x.pts);
    this.c = hs.length >= 2 ? { x: (hs[0].palm.x + hs[1].palm.x) / 2, y: (hs[0].palm.y + hs[1].palm.y) / 2 } : { x: w / 2, y: h / 2 };
    const live = new Set();
    for (const hd of hands) {
      if (hd.justDown) { this.fi = (this.fi + 1) % FOLDS.length; this.sfx?.bond?.(1, 4 + this.fi); }
      hd.tips.forEach((t, i) => {
        const key = `${hd.id}:${i}`, p = this.prev.get(key);
        live.add(key);
        if (p && Math.hypot(t.x - p.x, t.y - p.y) < 200) this.segs.push([p.x - this.c.x, p.y - this.c.y, t.x - this.c.x, t.y - this.c.y,
          (this.t * 40 + i * 30) % 360, 1 + Math.min(6, Math.hypot(t.vx, t.vy) / 250)]);
        this.prev.set(key, { x: t.x, y: t.y });
      });
    }
    for (const k of this.prev.keys()) if (!live.has(k)) this.prev.delete(k);
  }
  draw(g) {
    if (typeof document === 'undefined') return;
    const o = this.trail.begin(0.11), n = FOLDS[this.fi];   // ≥0.1 so faint trails fully clear (no grey ghosts)
    o.lineCap = 'round'; o.translate(this.c.x, this.c.y);
    for (let k = 0; k < n; k++) {
      o.save(); o.rotate((k * Math.PI * 2) / n); if (k & 1) o.scale(1, -1);
      for (const [ax, ay, bx, by, hue, wd] of this.segs) {
        o.strokeStyle = `hsl(${hue},100%,62%)`; o.lineWidth = wd; o.globalAlpha = 0.8;
        o.beginPath(); o.moveTo(ax, ay); o.lineTo(bx, by); o.stroke();
      }
      o.restore();
    }
    this.trail.blit(g);
  }
}
