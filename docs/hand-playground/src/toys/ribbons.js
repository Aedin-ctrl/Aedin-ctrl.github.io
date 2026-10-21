// Ribbons: silky rainbow ribbons stream from every fingertip, tapering and fading as they trail.
const LEN = 44;
export class Ribbons {
  name = 'Ribbons';
  hint = 'Wave your hands — every fingertip trails a silk ribbon';
  constructor({ size }) { this.size = size; this.trails = new Map(); this.t = 0; }
  update(dt, hands) {
    this.t += dt;
    const live = new Set();
    for (const hd of hands) hd.tips.forEach((t, i) => {
      const key = `${hd.id}:${i}`; live.add(key);
      let tr = this.trails.get(key);
      if (!tr) { tr = { pts: [], hue: (i * 52 + (this.trails.size >= 5 ? 180 : 0)) % 360 }; this.trails.set(key, tr); }   // 2nd hand gets the opposite colours
      tr.pts.unshift({ x: t.x, y: t.y });
      if (tr.pts.length > LEN) tr.pts.pop();
    });
    for (const [k, tr] of this.trails) if (!live.has(k)) { tr.pts.pop(); if (!tr.pts.length) this.trails.delete(k); }
  }
  draw() {}
  // over the gloves, so the ribbons stream out of the fingertips
  drawTop(g) {
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const tr of this.trails.values()) {
      const p = tr.pts;
      if (p.length < 3) continue;
      // build a ribbon polygon: offset each point along the local normal, width tapering to 0
      const L = [], R = [];
      for (let i = 0; i < p.length; i++) {
        const a = p[Math.max(0, i - 1)], b = p[Math.min(p.length - 1, i + 1)];
        let nx = -(b.y - a.y), ny = b.x - a.x; const n = Math.hypot(nx, ny) || 1; nx /= n; ny /= n;
        const w = 13 * (1 - i / p.length) * (0.7 + 0.3 * Math.sin(this.t * 6 + i * 0.4));
        L.push([p[i].x + nx * w, p[i].y + ny * w]); R.push([p[i].x - nx * w, p[i].y - ny * w]);
      }
      const grad = g.createLinearGradient(p[0].x, p[0].y, p[p.length - 1].x, p[p.length - 1].y);
      const hue = (tr.hue + this.t * 30) % 360;
      grad.addColorStop(0, `hsla(${hue},100%,70%,0.85)`); grad.addColorStop(0.5, `hsla(${hue + 50},100%,62%,0.45)`); grad.addColorStop(1, `hsla(${hue + 100},100%,55%,0)`);
      g.fillStyle = grad;
      g.beginPath(); g.moveTo(...L[0]); for (const q of L) g.lineTo(...q); for (let i = R.length - 1; i >= 0; i--) g.lineTo(...R[i]); g.closePath(); g.fill();
    }
    g.restore();
  }
}
