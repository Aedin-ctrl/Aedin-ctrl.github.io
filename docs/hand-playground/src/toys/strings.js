// Glowing elastic strings between fingertips. Two hands: finger to matching finger.
// One hand: thumb to every other fingertip (cat's cradle).
const N = 18;                    // points per string
const HUES = [340, 30, 55, 160, 210];

export class Strings {
  name = 'Strings';
  hint = 'Spread your fingers · use two hands to stretch strings between them';

  constructor({ sfx }) {
    this.sfx = sfx;
    this.ropes = new Map();      // key → { pts:[{x,y,px,py}], hue }
    this.pairCount = 0;
  }

  pairs(hands) {
    const cam = hands.filter((h) => h.pts);
    if (cam.length >= 2) {
      const [a, b] = cam;
      return a.tips.map((t, i) => ({ key: `2-${i}`, a: t, b: b.tips[i], hue: HUES[i] }));
    }
    if (cam.length === 1) {
      const t = cam[0].tips;
      return [1, 2, 3, 4].map((i) => ({ key: `1-${i}`, a: t[0], b: t[i], hue: HUES[i] }));
    }
    return [];
  }

  update(dt, hands) {
    const pairs = this.pairs(hands);
    if (pairs.length && pairs.length !== this.pairCount) this.sfx.bond(pairs.length > 4 ? 3 : 2, 2);
    this.pairCount = pairs.length;
    const live = new Set();
    for (const p of pairs) {
      live.add(p.key);
      let rope = this.ropes.get(p.key);
      if (!rope) {
        rope = { hue: p.hue, pts: Array.from({ length: N }, (_, i) => {
          const x = p.a.x + ((p.b.x - p.a.x) * i) / (N - 1), y = p.a.y + ((p.b.y - p.a.y) * i) / (N - 1);
          return { x, y, px: x, py: y };
        }), alpha: 0 };
        this.ropes.set(p.key, rope);
      }
      rope.alpha = Math.min(1, rope.alpha + dt * 4);
      const pts = rope.pts;
      // verlet step with light gravity
      for (let i = 1; i < N - 1; i++) {
        const q = pts[i], vx = (q.x - q.px) * 0.985, vy = (q.y - q.py) * 0.985;
        q.px = q.x; q.py = q.y;
        q.x += vx; q.y += vy + 260 * dt * dt;
      }
      pts[0].x = p.a.x; pts[0].y = p.a.y; pts[N - 1].x = p.b.x; pts[N - 1].y = p.b.y;
      const seg = (Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y) / (N - 1)) * 1.06;
      for (let it = 0; it < 6; it++) {
        for (let i = 0; i < N - 1; i++) {
          const a = pts[i], b = pts[i + 1];
          const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1e-3, diff = (d - seg) / d / 2;
          if (i > 0) { a.x += dx * diff; a.y += dy * diff; }
          if (i + 1 < N - 1) { b.x -= dx * diff; b.y -= dy * diff; }
        }
      }
    }
    for (const [key, rope] of this.ropes) {
      if (live.has(key)) continue;
      rope.alpha -= dt * 3;
      if (rope.alpha <= 0) this.ropes.delete(key);
    }
  }

  draw(g) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.lineCap = g.lineJoin = 'round';
    for (const rope of this.ropes.values()) {
      const trace = () => {
        const p = rope.pts;
        g.beginPath(); g.moveTo(p[0].x, p[0].y);
        for (let i = 1; i < p.length - 1; i++) g.quadraticCurveTo(p[i].x, p[i].y, (p[i].x + p[i + 1].x) / 2, (p[i].y + p[i + 1].y) / 2);
        g.lineTo(p[p.length - 1].x, p[p.length - 1].y);
      };
      g.globalAlpha = rope.alpha;
      g.strokeStyle = `hsla(${rope.hue},95%,60%,0.22)`; g.lineWidth = 12; trace(); g.stroke();
      g.strokeStyle = `hsla(${rope.hue},100%,80%,0.95)`; g.lineWidth = 3; trace(); g.stroke();
    }
    g.restore();
  }
}
