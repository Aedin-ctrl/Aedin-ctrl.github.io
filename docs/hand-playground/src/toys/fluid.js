// Hand-stirred fluid: a small Jos Stam "stable fluids" grid on the CPU (no GPU contention with
// MediaPipe), upscaled with smoothing. Fingertips push the fluid and drop coloured dye; a pinch
// drops a burst of ink.
const NX = 96, NY = 54, SIZE = (NX + 2) * (NY + 2);
const IX = (i, j) => i + (NX + 2) * j;
const HUES = [340, 30, 55, 160, 210];

function hsl(h, s, l) {
  h /= 360; const a = s * Math.min(l, 1 - l);
  const f = (n) => { const k = (n + h * 12) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [f(0), f(8), f(4)];
}

export class Fluid {
  name = 'Fluid';
  hint = 'Swirl your fingers through the water · pinch to drop ink';

  constructor({ sfx, size }) {
    this.sfx = sfx; this.size = size;
    this.u = new Float32Array(SIZE); this.v = new Float32Array(SIZE);
    this.u0 = new Float32Array(SIZE); this.v0 = new Float32Array(SIZE);
    this.r = new Float32Array(SIZE); this.gr = new Float32Array(SIZE); this.b = new Float32Array(SIZE);
    this.tmp = new Float32Array(SIZE); this.curl = new Float32Array(SIZE);
    this.canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (this.canvas) { this.canvas.width = NX; this.canvas.height = NY; this.img = this.canvas.getContext('2d').createImageData(NX, NY); }
  }

  splat(gx, gy, fx, fy, rgb, radius, amount) {
    const r2 = radius * radius;
    for (let j = Math.max(1, Math.floor(gy - radius * 2)); j <= Math.min(NY, Math.ceil(gy + radius * 2)); j++) {
      for (let i = Math.max(1, Math.floor(gx - radius * 2)); i <= Math.min(NX, Math.ceil(gx + radius * 2)); i++) {
        const d2 = (i - gx) ** 2 + (j - gy) ** 2, w = Math.exp(-d2 / r2);
        if (w < 0.01) continue;
        const k = IX(i, j);
        this.u[k] += fx * w; this.v[k] += fy * w;
        if (rgb) { this.r[k] += rgb[0] * w * amount; this.gr[k] += rgb[1] * w * amount; this.b[k] += rgb[2] * w * amount; }
      }
    }
  }

  update(dt, hands) {
    const { w, h } = this.size();
    const sx = NX / w, sy = NY / h;
    dt = Math.min(dt, 0.033);
    for (const hand of hands) {
      hand.tips.forEach((t, i) => {
        const sp = Math.hypot(t.vx, t.vy);
        if (sp < 80) return;
        const rgb = hsl(hand.pts ? HUES[i] : 200, 0.9, 0.55);
        this.splat(t.x * sx, t.y * sy, t.vx * sx * 0.9, t.vy * sy * 0.9, rgb, 2.5, Math.min(1, sp / 900) * 0.5);
      });
      if (hand.justDown) {
        const rgb = hsl(Math.random() * 360, 0.95, 0.55);
        this.splat(hand.pinch.x * sx, hand.pinch.y * sy, 0, 0, rgb, 4, 2.2);
        this.sfx.pop(2);
      }
    }
    this.step(dt, dt > 0.03 ? 6 : 12);
  }

  step(dt, iters) {
    const { u, v, u0, v0 } = this;
    this.vorticity(dt, 0.3);
    u0.set(u); v0.set(v);
    this.advect(u, u0, u0, v0, dt); this.advect(v, v0, u0, v0, dt);
    this.project(iters);
    for (const f of [this.r, this.gr, this.b]) { this.tmp.set(f); this.advect(f, this.tmp, u, v, dt); for (let k = 0; k < SIZE; k++) f[k] *= 0.992; }
    for (let k = 0; k < SIZE; k++) { u[k] *= 0.999; v[k] *= 0.999; }
  }

  advect(d, d0, u, v, dt) {
    // u, v are in grid cells per second
    for (let j = 1; j <= NY; j++) for (let i = 1; i <= NX; i++) {
      const k = IX(i, j);
      let x = i - dt * u[k], y = j - dt * v[k];
      x = Math.max(0.5, Math.min(NX + 0.5, x)); y = Math.max(0.5, Math.min(NY + 0.5, y));
      const i0 = Math.floor(x), j0 = Math.floor(y), s1 = x - i0, t1 = y - j0;
      d[k] = (1 - s1) * ((1 - t1) * d0[IX(i0, j0)] + t1 * d0[IX(i0, j0 + 1)]) + s1 * ((1 - t1) * d0[IX(i0 + 1, j0)] + t1 * d0[IX(i0 + 1, j0 + 1)]);
    }
  }

  project(iters) {
    const { u, v } = this, p = this.u0, div = this.v0;
    for (let j = 1; j <= NY; j++) for (let i = 1; i <= NX; i++) {
      const k = IX(i, j);
      div[k] = -0.5 * (u[k + 1] - u[k - 1] + v[k + NX + 2] - v[k - NX - 2]);
      p[k] = 0;
    }
    for (let n = 0; n < iters; n++) for (let j = 1; j <= NY; j++) for (let i = 1; i <= NX; i++) {
      const k = IX(i, j);
      p[k] = (div[k] + p[k - 1] + p[k + 1] + p[k - NX - 2] + p[k + NX + 2]) / 4;
    }
    for (let j = 1; j <= NY; j++) for (let i = 1; i <= NX; i++) {
      const k = IX(i, j);
      u[k] -= 0.5 * (p[k + 1] - p[k - 1]); v[k] -= 0.5 * (p[k + NX + 2] - p[k - NX - 2]);
    }
  }

  // vorticity confinement: re-injects the small swirls that numerical damping kills
  vorticity(dt, eps) {
    const { u, v, curl } = this;
    for (let j = 1; j <= NY; j++) for (let i = 1; i <= NX; i++) {
      const k = IX(i, j);
      curl[k] = (v[k + 1] - v[k - 1] - u[k + NX + 2] + u[k - NX - 2]) * 0.5;
    }
    for (let j = 2; j < NY; j++) for (let i = 2; i < NX; i++) {
      const k = IX(i, j);
      let nx = (Math.abs(curl[k + 1]) - Math.abs(curl[k - 1])) * 0.5, ny = (Math.abs(curl[k + NX + 2]) - Math.abs(curl[k - NX - 2])) * 0.5;
      const len = Math.hypot(nx, ny) + 1e-5; nx /= len; ny /= len;
      u[k] += eps * ny * curl[k] * dt * 8; v[k] -= eps * nx * curl[k] * dt * 8;
    }
  }

  draw(g) {
    if (!this.canvas) return;
    const d = this.img.data;
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const k = IX(i + 1, j + 1), o = (i + j * NX) * 4;
      d[o] = Math.min(255, this.r[k] * 255); d[o + 1] = Math.min(255, this.gr[k] * 255); d[o + 2] = Math.min(255, this.b[k] * 255); d[o + 3] = 255;
    }
    this.canvas.getContext('2d').putImageData(this.img, 0, 0);
    const { w, h } = this.size();
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(this.canvas, 0, 0, w, h);
    g.restore();
  }
}
