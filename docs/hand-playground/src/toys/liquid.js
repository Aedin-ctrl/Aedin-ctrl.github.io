// Liquid: glowing liquid-light beads cling to your fingertips and merge when your hands meet;
// flick to throw droplets. (Low-res metaball field, thresholded, smoothly upscaled.)
const K = 6, ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export class Liquid {
  name = 'Liquid';
  hint = 'Liquid light sticks to your fingers · bring your hands together · flick to throw drops';
  constructor({ size }) { this.size = size; this.drops = []; this.W = 0; this.balls = []; }
  update(dt, hands) {
    const B = [];
    hands.forEach((hd, n) => {
      B.push({ x: hd.palm.x, y: hd.palm.y, r: hd.size * 0.5, s: n });
      for (const t of hd.tips) {
        B.push({ x: t.x, y: t.y, r: hd.size * 0.22, s: n });
        if (Math.hypot(t.vx, t.vy) > 900 && this.drops.length < 12) this.drops.push({ x: t.x, y: t.y, vx: t.vx * 0.4, vy: t.vy * 0.4, r: hd.size * 0.15, s: n, life: 1 });
      }
    });
    for (const d of this.drops) { d.vy += 600 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.life -= dt; }
    this.drops = this.drops.filter((d) => d.life > 0);
    this.balls = B.concat(this.drops.map((d) => ({ ...d, r: d.r * d.life })));
  }
  draw() {}
  drawTop(g) {
    if (typeof document === 'undefined' || !this.balls.length) return;
    const { w, h } = this.size(), W = Math.ceil(w / K), H = Math.ceil(h / K);
    if (!this.c || W !== this.W || H !== this.H) {
      this.c = document.createElement('canvas'); this.W = this.c.width = W; this.H = this.c.height = H;
      this.o = this.c.getContext('2d'); this.img = this.o.createImageData(W, H);
    }
    const d = this.img.data, bs = this.balls;
    // only shade cells near some ball (bounding box), the rest stays clear
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const b of bs) { x0 = Math.min(x0, b.x - b.r * 3); y0 = Math.min(y0, b.y - b.r * 3); x1 = Math.max(x1, b.x + b.r * 3); y1 = Math.max(y1, b.y + b.r * 3); }
    d.fill(0);
    const i0 = Math.max(0, (x0 / K) | 0), i1 = Math.min(W - 1, (x1 / K) | 0), j0 = Math.max(0, (y0 / K) | 0), j1 = Math.min(H - 1, (y1 / K) | 0);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = i * K, y = j * K; let f = 0, f1 = 0;
      for (const b of bs) { const dx = x - b.x, dy = y - b.y, v = (b.r * b.r) / (dx * dx + dy * dy + 1); f += v; if (b.s) f1 += v; }
      const o = (i + j * W) * 4, a = ss(0.75, 1, f), rim = Math.max(0, 1 - Math.abs(f - 1) * 4), mix = f1 / (f || 1);
      d[o] = 255 * (1 - mix) + 60 * mix + rim * 120; d[o + 1] = 120 + rim * 135; d[o + 2] = 90 * (1 - mix) + 255 * mix;
      d[o + 3] = Math.min(255, (a * 0.55 + rim * 0.6) * 255);
    }
    this.o.putImageData(this.img, 0, 0);
    g.save(); g.globalCompositeOperation = 'lighter'; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(this.c, 0, 0, w, h); g.restore();
  }
}
