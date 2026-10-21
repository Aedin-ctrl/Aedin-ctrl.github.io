// Pinch and move to paint glowing light trails that slowly fade.
const FADE = 7;                  // s until a trail is gone

export class Paint {
  name = 'Paint';
  hint = 'Pinch and move to paint with light · trails fade away';

  constructor({ sfx }) {
    this.sfx = sfx;
    this.strokes = [];
    this.active = new Map();     // hand id → stroke
    this.t = 0;
    this.hueBase = Math.random() * 360;
  }

  update(dt, hands) {
    this.t += dt;
    for (const hand of hands) {
      let s = this.active.get(hand.id);
      if (hand.down) {
        if (!s) {
          s = { pts: [], hue: (this.hueBase += 47) % 360 };
          this.strokes.push(s); this.active.set(hand.id, s);
          this.sfx.bond(1, 4);
        }
        const last = s.pts[s.pts.length - 1];
        const p = hand.pinch;
        if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 3) {
          const speed = last ? Math.hypot(p.x - last.x, p.y - last.y) / dt : 0;
          s.pts.push({ x: p.x, y: p.y, t: this.t, w: Math.max(3, 12 - speed / 180) });
        }
      } else if (s) this.active.delete(hand.id);
    }
    for (const id of this.active.keys()) if (!hands.some((h) => h.id === id)) this.active.delete(id);
    for (const s of this.strokes) s.pts = s.pts.filter((p) => this.t - p.t < FADE);
    this.strokes = this.strokes.filter((s) => s.pts.length || [...this.active.values()].includes(s));
  }

  draw(g) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.lineCap = g.lineJoin = 'round';
    for (const s of this.strokes) {
      for (let i = 1; i < s.pts.length; i++) {
        const a = s.pts[i - 1], b = s.pts[i];
        const life = 1 - (this.t - b.t) / FADE;
        const hue = s.hue + i * 0.8;
        g.strokeStyle = `hsla(${hue},95%,60%,${0.18 * life})`;
        g.lineWidth = b.w * 3.2;
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
        g.strokeStyle = `hsla(${hue},100%,82%,${0.95 * life})`;
        g.lineWidth = b.w;
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      }
    }
    g.restore();
  }
}
