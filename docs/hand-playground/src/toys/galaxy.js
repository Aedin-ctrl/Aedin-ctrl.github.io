// Galaxy: thousands of stars orbit your palms like gravity wells. Pinch = stronger pull, open hand = gentle orbit.
import { Trail } from './trail.js';
const N = 3000;

export class Galaxy {
  name = 'Galaxy';
  hint = 'Stars orbit your palms · pinch to pull them in · fling your hand to scatter them';

  constructor({ size }) {
    this.size = size;
    this.trail = new Trail(size);
    const { w, h } = size();
    this.x = new Float32Array(N); this.y = new Float32Array(N); this.vx = new Float32Array(N); this.vy = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2, r = 60 + Math.random() * Math.min(w, h) * 0.45;
      this.x[i] = w / 2 + Math.cos(a) * r; this.y[i] = h / 2 + Math.sin(a) * r;
      this.vx[i] = -Math.sin(a) * 60; this.vy[i] = Math.cos(a) * 60;
    }
  }

  update(dt, hands) {
    const { w, h } = this.size();
    dt = Math.min(dt, 0.033);
    // wells: each palm (or the mouse); without hands, one gentle well in the centre
    const wells = hands.length ? hands.map((hd) => ({ x: hd.palm.x, y: hd.palm.y, m: hd.down ? 5.5e6 : 1.8e6, vx: hd.tips[0].vx, vy: hd.tips[0].vy }))
      : [{ x: w / 2, y: h / 2, m: 1.2e6, vx: 0, vy: 0 }];
    const { x, y, vx, vy } = this;
    for (let i = 0; i < N; i++) {
      let ax = 0, ay = 0;
      for (const W of wells) {
        const dx = W.x - x[i], dy = W.y - y[i], d2 = dx * dx + dy * dy + 900, inv = W.m / (d2 * Math.sqrt(d2));
        ax += (dx + dy * 0.9) * inv; ay += (dy - dx * 0.9) * inv;      // pull + swirl → spiral arms
        // a fast-moving hand drags nearby stars along (and flings them)
        if (d2 < 22000) { ax += W.vx * 0.9; ay += W.vy * 0.9; }
      }
      vx[i] = (vx[i] + ax * dt) * 0.997; vy[i] = (vy[i] + ay * dt) * 0.997;
      x[i] += vx[i] * dt; y[i] += vy[i] * dt;
      if (x[i] < -50 || x[i] > w + 50 || y[i] < -50 || y[i] > h + 50) {   // wrap back in from a random edge
        const a = Math.random() * Math.PI * 2; x[i] = w / 2 + Math.cos(a) * w * 0.55; y[i] = h / 2 + Math.sin(a) * h * 0.55; vx[i] *= 0.2; vy[i] *= 0.2;
      }
    }
  }

  draw(g) {
    this.out = g;
    const { x, y, vx, vy } = this;
    if (typeof document === 'undefined') return;
    const o = this.trail.begin(0.14);                                   // comet tails
    g = o;
    g.save();
    g.globalCompositeOperation = 'lighter';
    // 4 colour bands by speed (one fillStyle each, so it stays cheap)
    const bands = [['rgba(110,150,255,0.8)', 0, 150], ['rgba(170,120,255,0.85)', 150, 380], ['rgba(255,140,210,0.9)', 380, 800], ['rgba(255,245,215,1)', 800, 1e9]];
    for (const [color, lo, hi] of bands) {
      g.fillStyle = color;
      for (let i = 0; i < N; i++) {
        const sp = Math.abs(vx[i]) + Math.abs(vy[i]);
        if (sp < lo || sp >= hi) continue;
        const s = sp > 800 ? 3 : 2.2;
        g.fillRect(x[i], y[i], s, s);
      }
    }
    g.restore();
    this.trail.blit(this.out);
  }
  drawTop() {}
}
