// Constellation: drifting stars link into a glowing web near your fingertips (a "plexus").
const N = 140, LINK = 110, HAND = 170;
export class Constellation {
  name = 'Constellation';
  hint = 'Move your fingers through the stars — they link up around you · pinch to gather them';
  constructor({ size }) {
    this.size = size;
    const { w, h } = size();
    this.s = Array.from({ length: N }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30 }));
  }
  update(dt, hands) {
    const { w, h } = this.size();
    this.tips = hands.flatMap((hd) => hd.tips.map((t) => ({ x: t.x, y: t.y, pull: hd.down })));
    for (const p of this.s) {
      for (const t of this.tips) {                                   // pinch pulls nearby stars in
        if (!t.pull) continue;
        const dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy);
        if (d < 260 && d > 1) { p.vx += (dx / d) * 260 * dt; p.vy += (dy / d) * 260 * dt; }
      }
      p.vx *= 0.99; p.vy *= 0.99;
      const sp = Math.hypot(p.vx, p.vy); if (sp < 12) { p.vx += (Math.random() - 0.5) * 6; p.vy += (Math.random() - 0.5) * 6; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.x < 0 || p.x > w) p.vx *= -1; if (p.y < 0 || p.y > h) p.vy *= -1;
      p.x = Math.max(0, Math.min(w, p.x)); p.y = Math.max(0, Math.min(h, p.y));
    }
  }
  draw(g) {
    const tips = this.tips || [];
    const near = (p) => tips.reduce((m, t) => Math.min(m, Math.hypot(t.x - p.x, t.y - p.y)), 1e9);
    const glow = this.s.map((p) => Math.max(0, 1 - near(p) / HAND));
    g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const a = this.s[i], b = this.s[j], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > LINK) continue;
      const k = (1 - d / LINK) * (0.12 + 0.88 * Math.max(glow[i], glow[j]));
      if (k < 0.04) continue;
      g.strokeStyle = `rgba(150,200,255,${k})`; g.lineWidth = 0.6 + k * 1.4;
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    }
    // fingertips join the web too
    for (const t of tips) for (let i = 0; i < N; i++) {
      const p = this.s[i], d = Math.hypot(t.x - p.x, t.y - p.y);
      if (d > HAND) continue;
      g.strokeStyle = `rgba(200,235,255,${(1 - d / HAND) * 0.8})`; g.lineWidth = 1;
      g.beginPath(); g.moveTo(t.x, t.y); g.lineTo(p.x, p.y); g.stroke();
    }
    this.s.forEach((p, i) => { g.fillStyle = `rgba(230,245,255,${0.45 + 0.55 * glow[i]})`; g.beginPath(); g.arc(p.x, p.y, 1.6 + glow[i] * 2.4, 0, Math.PI * 2); g.fill(); });
    g.restore();
  }
}
