// Bubbles drift up; poke them with any fingertip to pop. Pinch and hold to blow a new one.
import { Particles, rand } from './particles.js';

export class Bubbles {
  name = 'Bubbles';
  hint = 'Poke bubbles to pop them · pinch and hold to blow a new one';

  constructor({ sfx, size }) {
    this.sfx = sfx; this.size = size;
    this.bubbles = [];
    this.fx = new Particles();
    this.spawnT = 0;
    this.t = 0;
  }

  update(dt, hands) {
    const { w, h } = this.size();
    this.t += dt;
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.bubbles.length < 14) {
      this.spawnT = rand(0.4, 1.1);
      const r = rand(18, 58);
      this.bubbles.push({ x: rand(r, w - r), y: h + r, r, vy: rand(-70, -35), phase: rand(0, 6.28), hue: rand(0, 360), born: this.t });
    }

    const ids = new Set(hands.map((x) => x.id));
    for (const b of this.bubbles) if (b.held && !ids.has(b.held)) { b.held = null; b.vy = -40; b.born = this.t; }
    for (const hand of hands) {
      // blow: pinch starts a bubble that grows while held
      if (hand.justDown) this.bubbles.push({ x: hand.pinch.x, y: hand.pinch.y, r: 6, vy: 0, phase: rand(0, 6.28), hue: rand(0, 360), held: hand.id, born: this.t });
      const held = this.bubbles.find((b) => b.held === hand.id);
      if (held) {
        if (hand.down) { held.r = Math.min(95, held.r + 45 * dt); held.x = hand.pinch.x; held.y = hand.pinch.y - held.r * 0.6; }
        else { held.held = null; held.vy = -40; held.born = this.t; this.sfx.release(4); }
      }
    }

    for (const b of this.bubbles) {
      if (b.held) continue;
      b.y += b.vy * dt;
      b.x += Math.sin(this.t * 1.3 + b.phase) * 18 * dt;
    }

    // pop on fingertip contact (freshly released bubbles get a moment of immunity)
    for (const b of this.bubbles) {
      if (b.held || this.t - b.born < 0.6) continue;
      for (const hand of hands) {
        if (hand.tips.some((t) => Math.hypot(t.x - b.x, t.y - b.y) < b.r + 4)) { b.popped = true; break; }
      }
    }
    for (const b of this.bubbles) {
      if (!b.popped) continue;
      this.sfx.pop(Math.round(9 - b.r / 11));
      this.fx.burst(b.x, b.y, Math.round(10 + b.r / 3), (i) => {
        const a = (i / 12) * Math.PI * 2 + rand(-0.2, 0.2), sp = rand(60, 160) + b.r;
        return { x: b.x + Math.cos(a) * b.r, y: b.y + Math.sin(a) * b.r, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 300, decay: rand(1.4, 2.2), size: rand(1.5, 3), color: `hsl(${b.hue + i * 12},90%,80%)` };
      });
    }
    this.bubbles = this.bubbles.filter((b) => !b.popped && b.y > -b.r * 2);
    this.fx.update(dt);
  }

  draw(g) {}

  drawTop(g) {
    for (const b of this.bubbles) {
      const wob = 1 + Math.sin(this.t * 3 + b.phase) * 0.025;
      g.save();
      g.translate(b.x, b.y); g.scale(wob, 2 - wob);
      const fill = g.createRadialGradient(-b.r * 0.3, -b.r * 0.3, b.r * 0.1, 0, 0, b.r);
      fill.addColorStop(0, 'rgba(255,255,255,0.02)');
      fill.addColorStop(0.85, 'rgba(255,255,255,0.06)');
      fill.addColorStop(1, 'rgba(255,255,255,0.18)');
      g.fillStyle = fill;
      g.beginPath(); g.arc(0, 0, b.r, 0, Math.PI * 2); g.fill();
      const rim = g.createConicGradient(this.t * 0.6 + b.phase, 0, 0);
      for (let i = 0; i <= 6; i++) rim.addColorStop(i / 6, `hsla(${b.hue + i * 60},95%,75%,0.75)`);
      g.strokeStyle = rim; g.lineWidth = 1.6;
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.beginPath(); g.ellipse(-b.r * 0.42, -b.r * 0.45, b.r * 0.16, b.r * 0.08, -0.7, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    this.fx.draw(g, true);
  }
}
