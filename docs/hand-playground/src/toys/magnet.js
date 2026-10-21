// Magnet: field lines arc from one palm (+) to the other (−), with current flowing along them.
// Pinch a hand to flip its pole. One hand: a dipole between thumb and index tips.
const SEEDS = 28, STEP = 7, MAX = 160;
export class Magnet {
  name = 'Magnet';
  hint = 'Your palms are magnets · pinch to flip a pole · one hand makes a thumb–index dipole';
  constructor({ size }) { this.size = size; this.t = 0; this.lines = null; }
  update(dt, hands) {
    this.t += dt;
    const hs = hands.filter((h) => h.pts), { w, h } = this.size();
    let P;
    if (hs.length >= 2) P = hs.slice(0, 2).sort((a, b) => a.palm.x - b.palm.x).map((hd, i) => ({ x: hd.palm.x, y: hd.palm.y, q: (i ? -1 : 1) * (hd.down ? -1 : 1) * hd.size }));
    else if (hs.length === 1) { const t = hs[0].tips; P = [{ x: t[0].x, y: t[0].y, q: 1 }, { x: t[1].x, y: t[1].y, q: -1 }]; }
    else { this.lines = null; return; }
    this.poles = P;
    const lines = [], r0 = 14;
    for (const s of P) {
      if (s.q <= 0 && P.some((p) => p.q > 0)) continue;
      const dir = Math.sign(s.q) || 1;
      for (let k = 0; k < SEEDS; k++) {
        const a = (k / SEEDS) * Math.PI * 2, line = [];
        let x = s.x + Math.cos(a) * r0, y = s.y + Math.sin(a) * r0; line.push(x, y);
        for (let n = 0; n < MAX; n++) {
          let ex = 0, ey = 0;
          for (const p of P) { const dx = x - p.x, dy = y - p.y, d2 = dx * dx + dy * dy + 1, inv = p.q / (d2 * Math.sqrt(d2)); ex += dx * inv; ey += dy * inv; }
          const L = Math.hypot(ex, ey) || 1; x += (ex / L) * STEP * dir; y += (ey / L) * STEP * dir; line.push(x, y);
          if (x < -50 || y < -50 || x > w + 50 || y > h + 50) break;
          if (P.some((p) => p !== s && Math.hypot(x - p.x, y - p.y) < r0)) break;
        }
        lines.push(line);
      }
    }
    this.lines = lines;
  }
  draw(g) {
    if (!this.lines) return;
    const path = new Path2D();
    for (const l of this.lines) { path.moveTo(l[0], l[1]); for (let i = 2; i < l.length; i += 2) path.lineTo(l[i], l[i + 1]); }
    g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
    g.strokeStyle = 'hsl(190,100%,60%)'; g.globalAlpha = 0.22; g.lineWidth = 1.2; g.stroke(path);
    g.setLineDash([3, 22]); g.lineDashOffset = -this.t * 90;
    g.strokeStyle = '#eaffff'; g.globalAlpha = 0.85; g.lineWidth = 2.4; g.stroke(path);
    g.setLineDash([]);
    for (const p of this.poles) {
      const grad = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, 36);
      grad.addColorStop(0, p.q > 0 ? 'rgba(255,90,110,0.8)' : 'rgba(80,140,255,0.8)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = 1; g.fillStyle = grad; g.beginPath(); g.arc(p.x, p.y, 36, 0, 7); g.fill();
    }
    g.restore();
  }
}
