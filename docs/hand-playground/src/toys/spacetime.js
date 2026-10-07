// Spacetime: a neon grid bends toward your hands like mass warping space, and wobbles when you move fast.
const GAP = 34;
export class Spacetime {
  name = 'Spacetime';
  hint = 'Your hands bend space · pinch to push it away · move fast to make it ripple';
  constructor({ size }) { this.size = size; this.cols = 0; }
  init(w, h) {
    this.cols = Math.ceil(w / GAP) + 1; this.rows = Math.ceil(h / GAP) + 1; const n = this.cols * this.rows;
    this.px = new Float32Array(n); this.py = new Float32Array(n); this.vx = new Float32Array(n); this.vy = new Float32Array(n);
    this.w = w; this.h = h;
    for (let j = 0; j < this.rows; j++) for (let i = 0; i < this.cols; i++) { const k = i + j * this.cols; this.px[k] = i * GAP; this.py[k] = j * GAP; }
  }
  update(dt, hands) {
    const { w, h } = this.size(); if (w !== this.w || h !== this.h) this.init(w, h);
    dt = Math.min(dt, 0.033);
    this.hands = hands;
    const { px, py, vx, vy, cols } = this;
    for (let k = 0; k < px.length; k++) {
      const hx = (k % cols) * GAP, hy = ((k / cols) | 0) * GAP; let tx = hx, ty = hy;
      for (const hd of hands) {
        const dx = hd.palm.x - hx, dy = hd.palm.y - hy, s2 = (hd.size * 1.6) ** 2, f = s2 / (dx * dx + dy * dy + s2);
        const pull = (hd.down ? -0.5 : 0.85) * f; tx += dx * pull; ty += dy * pull;
        for (const t of hd.tips) {
          const ex = t.x - px[k], ey = t.y - py[k];
          if (ex * ex + ey * ey < 1600) { vx[k] += t.vx * dt * 2; vy[k] += t.vy * dt * 2; }
        }
      }
      vx[k] = (vx[k] + (tx - px[k]) * 90 * dt) * 0.9; vy[k] = (vy[k] + (ty - py[k]) * 90 * dt) * 0.9;
      px[k] += vx[k] * dt; py[k] += vy[k] * dt;
    }
  }
  draw(g) {
    if (!this.cols) return;
    const { px, py, vx, vy, cols, rows } = this, p = new Path2D(), sparks = new Path2D();
    for (let j = 0; j < rows; j++) { p.moveTo(px[j * cols], py[j * cols]); for (let i = 1; i < cols; i++) p.lineTo(px[i + j * cols], py[i + j * cols]); }
    for (let i = 0; i < cols; i++) { p.moveTo(px[i], py[i]); for (let j = 1; j < rows; j++) p.lineTo(px[i + j * cols], py[i + j * cols]); }
    for (let k = 0; k < px.length; k++) if (Math.abs(vx[k]) + Math.abs(vy[k]) > 220) { sparks.moveTo(px[k] + 2, py[k]); sparks.arc(px[k], py[k], 2, 0, 7); }
    const c = this.hands?.[0]?.palm ?? { x: this.w / 2, y: this.h / 2 };
    const grad = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, Math.max(this.w, this.h) * 0.6);
    grad.addColorStop(0, '#ff4fd8'); grad.addColorStop(0.35, '#7a6bff'); grad.addColorStop(1, '#19e3ff');
    g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = grad;
    g.globalAlpha = 0.12; g.lineWidth = 5; g.stroke(p);
    g.globalAlpha = 0.7; g.lineWidth = 1; g.stroke(p);
    g.globalAlpha = 0.9; g.fillStyle = '#eaffff'; g.fill(sparks);
    g.restore();
  }
}
