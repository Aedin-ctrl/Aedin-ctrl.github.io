// Lightning: electric arcs between your hands' matching fingertips; pinch to throw a bolt to the floor.
const rnd = (a, b) => a + Math.random() * (b - a);

function bolt(a, b, rough, depth, out) {
  if (depth === 0) { out.push(b); return; }
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, L = Math.hypot(b.x - a.x, b.y - a.y);
  const nx = -(b.y - a.y) / (L || 1), ny = (b.x - a.x) / (L || 1), off = (Math.random() - 0.5) * L * rough;
  const m = { x: mx + nx * off, y: my + ny * off };
  bolt(a, m, rough, depth - 1, out); bolt(m, b, rough, depth - 1, out);
}
function makeBolt(a, b, rough = 0.32, branches = true) {
  const pts = [a]; bolt(a, b, rough, 6, pts);
  const out = [{ pts, w: 1 }];
  if (branches) for (let i = 4; i < pts.length - 4; i += 6) {
    if (Math.random() > 0.28) continue;
    const p = pts[i], dir = Math.atan2(b.y - a.y, b.x - a.x) + rnd(-0.9, 0.9), len = Math.hypot(b.x - a.x, b.y - a.y) * rnd(0.12, 0.3);
    const bp = [p]; bolt(p, { x: p.x + Math.cos(dir) * len, y: p.y + Math.sin(dir) * len }, 0.4, 4, bp);
    out.push({ pts: bp, w: 0.5 });
  }
  return out;
}

export class Lightning {
  name = 'Lightning';
  hint = 'Hold both hands up — arcs jump between matching fingertips · pinch to strike the floor';

  constructor({ sfx, size }) {
    this.sfx = sfx; this.size = size;
    this.bolts = []; this.strikes = []; this.t = 0; this.regen = 0;
  }

  update(dt, hands) {
    this.t += dt; this.regen -= dt;
    const { h } = this.size();
    const cam = hands.filter((x) => x.pts);
    if (this.regen <= 0) {                                   // re-roll the shapes ~20× a second → flicker
      this.regen = 0.05;
      this.bolts = [];
      if (cam.length >= 2) {
        const [A, B] = cam;
        A.tips.forEach((t, i) => {
          const u = B.tips[i], d = Math.hypot(t.x - u.x, t.y - u.y);
          if (d < 900 && Math.random() < 0.85) this.bolts.push(...makeBolt(t, u, 0.3 + d / 4000));
        });
      } else if (cam.length === 1) {                         // one hand: little arcs hopping between its own fingertips
        const t = cam[0].tips;
        for (let i = 0; i < 4; i++) if (Math.random() < 0.5) this.bolts.push(...makeBolt(t[i], t[i + 1], 0.45, false));
      }
      if (this.bolts.length && Math.random() < 0.25) this.sfx.impact?.(0.15, 'wood');
    }
    for (const hand of hands) if (hand.justDown) {
      const from = hand.pinch;
      this.strikes.push({ parts: makeBolt(from, { x: from.x + rnd(-120, 120), y: h }, 0.25), life: 0.35 });
      this.sfx.impact?.(1, 'wood'); this.sfx.snap?.();
    }
    for (const s of this.strikes) s.life -= dt;
    this.strikes = this.strikes.filter((s) => s.life > 0);
    this.flash = Math.max(0, (this.flash || 0) - dt * 4);
    if (this.strikes.some((s) => s.life > 0.3)) this.flash = 0.25;
  }

  draw(g) {
    const { w, h } = this.size();
    if (this.flash > 0.01) { g.fillStyle = `rgba(170,200,255,${this.flash * 0.4})`; g.fillRect(0, 0, w, h); }
  }

  drawTop(g) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.lineCap = g.lineJoin = 'round';
    const paint = (parts, a) => {
      for (const [width, color] of [[12, `rgba(120,160,255,${0.08 * a})`], [5, `rgba(150,190,255,${0.3 * a})`], [1.6, `rgba(240,248,255,${0.95 * a})`]]) {
        g.strokeStyle = color;
        for (const p of parts) {
          g.lineWidth = width * p.w;
          g.beginPath(); p.pts.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); g.stroke();
        }
      }
    };
    paint(this.bolts, 1);
    for (const s of this.strikes) paint(s.parts, Math.min(1, s.life / 0.2));
    g.restore();
  }
}
