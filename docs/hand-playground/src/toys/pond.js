// Pond: the screen becomes water — fingertips leave wakes, a pinch drops a pebble, caustics shimmer.
const K = 6;
export class Pond {
  name = 'Pond';
  hint = 'Drag your fingers through the water · pinch to drop a pebble';
  constructor({ size, sfx }) { this.size = size; this.sfx = sfx; this.W = 0; }
  init(w, h) {
    this.W = Math.ceil(w / K) + 2; this.H = Math.ceil(h / K) + 2;
    this.a = new Float32Array(this.W * this.H); this.b = new Float32Array(this.W * this.H); this.w = w; this.h = h;
  }
  poke(x, y, s, r = 1) {
    const i = (x / K + 1) | 0, j = (y / K + 1) | 0;
    for (let v = -r; v <= r; v++) for (let u = -r; u <= r; u++) { const k = i + u + (j + v) * this.W; if (k > 0 && k < this.a.length) this.a[k] -= s; }
  }
  update(dt, hands) {
    const { w, h } = this.size(); if (w !== this.w || h !== this.h) this.init(w, h);
    for (const hd of hands) {
      for (const t of hd.tips) { const s = Math.hypot(t.vx, t.vy); if (s > 150) this.poke(t.x, t.y, Math.min(1.2, s / 1400)); }
      if (hd.justDown) { this.poke(hd.pinch.x, hd.pinch.y, 14, 2); this.sfx?.pop?.(1); }
    }
    const { a, b, W, H } = this;
    for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
      const k = i + j * W; b[k] = ((a[k - 1] + a[k + 1] + a[k - W] + a[k + W]) * 0.5 - b[k]) * 0.975;
    }
    this.a = b; this.b = a;
  }
  draw(g) {
    if (!this.W || typeof document === 'undefined') return;
    if (!this.c || this.c.width !== this.W || this.c.height !== this.H) {
      this.c = document.createElement('canvas'); this.c.width = this.W; this.c.height = this.H;
      this.o = this.c.getContext('2d'); this.img = this.o.createImageData(this.W, this.H);
    }
    const { a, W, H } = this, d = this.img.data;
    // slope over 2 cells (smooths the wave's grid pattern) → light; bright crests, faint troughs
    for (let j = 2; j < H - 2; j++) for (let i = 2; i < W - 2; i++) {
      const k = i + j * W, l = (a[k - 2] - a[k + 2] + a[k - 2 * W] - a[k + 2 * W]) * 0.22, o = k * 4, v = Math.min(1, Math.abs(l));
      d[o] = 90 + 150 * v; d[o + 1] = 190 + 60 * v; d[o + 2] = 255; d[o + 3] = (l > 0 ? v : v * 0.25) * 220;
    }
    this.o.putImageData(this.img, 0, 0);
    g.save(); g.globalCompositeOperation = 'lighter'; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(this.c, 1, 1, W - 2, H - 2, 0, 0, this.w, this.h); g.restore();
  }
}
