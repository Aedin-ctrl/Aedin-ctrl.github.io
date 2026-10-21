// Lasers: a beam shoots out of each index finger in the direction it points and bounces off the
// screen edges, sparking at each bounce. Pinch to change colour.
const HUES = [350, 130, 200, 50, 280];
export class Lasers {
  name = 'Lasers';
  hint = 'Point your index finger · beams bounce off the edges · pinch to change colour';
  constructor({ size, sfx }) { this.size = size; this.sfx = sfx; this.hue = new Map(); this.beams = []; this.t = 0; }
  trace(x, y, dx, dy, w, h) {
    const pts = [{ x, y }];
    for (let b = 0; b < 7; b++) {
      const tx = dx > 0 ? (w - x) / dx : dx < 0 ? -x / dx : Infinity, ty = dy > 0 ? (h - y) / dy : dy < 0 ? -y / dy : Infinity;
      const t = Math.min(tx, ty);
      if (!Number.isFinite(t)) break;
      x += dx * t; y += dy * t; pts.push({ x, y });
      if (tx < ty) dx = -dx; else dy = -dy;
    }
    return pts;
  }
  update(dt, hands) {
    this.t += dt;
    const { w, h } = this.size();
    this.beams = [];
    hands.filter((hd) => hd.pts).forEach((hd) => {
      if (hd.justDown) { this.hue.set(hd.id, ((this.hue.get(hd.id) ?? 0) + 1) % HUES.length); this.sfx?.bond?.(1, 6); }
      const a = hd.pts[6], b = hd.pts[8], L = Math.hypot(b.x - a.x, b.y - a.y);
      if (L < hd.size * 0.4) return;                                  // finger curled → no beam
      const dx = (b.x - a.x) / L, dy = (b.y - a.y) / L;
      this.beams.push({ pts: this.trace(b.x, b.y, dx, dy, w, h), hue: HUES[this.hue.get(hd.id) ?? ((this.beams.length * 2) % HUES.length)] });
    });
    for (const id of this.hue.keys()) if (!hands.some((x) => x.id === id)) this.hue.delete(id);
  }
  draw() {}
  drawTop(g) {
    g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = g.lineJoin = 'round';
    for (const bm of this.beams) {
      const path = new Path2D();
      bm.pts.forEach((p, i) => (i ? path.lineTo(p.x, p.y) : path.moveTo(p.x, p.y)));
      for (const [lw, a, l] of [[16, 0.08, 55], [6, 0.35, 60], [2, 1, 88]]) { g.strokeStyle = `hsla(${bm.hue},100%,${l}%,${a})`; g.lineWidth = lw; g.stroke(path); }
      for (const p of bm.pts.slice(1)) {                              // flare + flicker at each bounce
        const r = 14 + Math.sin(this.t * 40 + p.x) * 4;
        const grad = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        grad.addColorStop(0, `hsla(${bm.hue},100%,90%,0.9)`); grad.addColorStop(1, `hsla(${bm.hue},100%,60%,0)`);
        g.fillStyle = grad; g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2); g.fill();
      }
    }
    g.restore();
  }
}
