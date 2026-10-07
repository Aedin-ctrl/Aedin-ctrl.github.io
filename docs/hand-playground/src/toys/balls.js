// Bouncy balls with gravity. Your hands are solid: bat them around, pinch to grab, let go to throw.
// Pinch empty space to make a new ball.
import { rand } from './particles.js';

const COLORS = ['#FF8FA3', '#FFD166', '#7BDFF2', '#B8F2A0', '#CDB4DB', '#FFB38A'];
const GRAVITY = 1500, BOUNCE = 0.72, MAX = 10;

export class Balls {
  name = 'Balls';
  hint = 'Bat the balls around · pinch to grab and throw · pinch empty space for a new ball';

  constructor({ sfx, size }) {
    this.sfx = sfx; this.size = size;
    this.balls = [];
    this.prev = new Map();     // hand id → previous collider positions (for hand velocity)
    const { w } = size();
    for (let i = 0; i < 4; i++) this.add(w * (0.3 + i * 0.13), 120 + i * 30);
  }

  add(x, y) {
    if (this.balls.length >= MAX) {                       // evict the oldest ball nobody is holding
      const i = this.balls.findIndex((b) => !b.held);
      if (i >= 0) this.balls.splice(i, 1);
    }
    const b = { x, y, vx: rand(-80, 80), vy: 0, r: rand(26, 40), color: COLORS[this.balls.length % COLORS.length], held: null, squash: 0 };
    this.balls.push(b);
    return b;
  }

  colliders(hand) {
    if (!hand.pts) return hand.tips.map((t) => ({ x: t.x, y: t.y, r: 22 }));
    const s = hand.size;
    const out = hand.pts.map((q) => ({ x: q.x, y: q.y, r: s * 0.17 }));
    out.push({ x: hand.palm.x, y: hand.palm.y, r: s * 0.42 });
    return out;
  }

  update(dt, hands) {
    const { w, h } = this.size();
    const ids = new Set(hands.map((x) => x.id));
    for (const b of this.balls) if (b.held && !ids.has(b.held)) b.held = null;   // hand vanished mid-grab

    for (const hand of hands) {
      const held = this.balls.find((b) => b.held === hand.id);
      if (hand.justDown && !held) {
        let best = null, bd = Infinity;
        for (const b of this.balls) {
          const d = Math.hypot(b.x - hand.pinch.x, b.y - hand.pinch.y);
          if (!b.held && d < b.r * 1.8 && d < bd) { best = b; bd = d; }
        }
        (best || this.add(hand.pinch.x, hand.pinch.y)).held = hand.id;
        this.sfx.pop(3);
      }
      if (held) {
        const nx = hand.pinch.x, ny = hand.pinch.y + held.r * 0.4;
        held.vx = (nx - held.x) / dt; held.vy = (ny - held.y) / dt;
        held.x = nx; held.y = ny;
        if (!hand.down) {
          held.held = null;
          const sp = Math.hypot(held.vx, held.vy), cap = 2600;
          if (sp > cap) { held.vx *= cap / sp; held.vy *= cap / sp; }
          this.sfx.release(3);
        }
      }
    }

    // hand colliders with velocity
    const cols = [];
    for (const hand of hands) {
      const c = this.colliders(hand);
      const prev = this.prev.get(hand.id);
      c.forEach((q, i) => { const o = prev?.[i]; q.vx = o ? (q.x - o.x) / dt : 0; q.vy = o ? (q.y - o.y) / dt : 0; });
      this.prev.set(hand.id, c);
      cols.push(...c);
    }
    for (const id of this.prev.keys()) if (!hands.some((x) => x.id === id)) this.prev.delete(id);

    for (const b of this.balls) {
      b.squash *= 0.85;
      if (b.held) continue;
      b.vy += GRAVITY * dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.y > h - b.r) { if (b.vy > 300) this.bump(b, b.vy); b.y = h - b.r; b.vy *= -BOUNCE; b.vx *= 0.96; }
      if (b.y < b.r) { b.y = b.r; b.vy *= -BOUNCE; }
      if (b.x < b.r) { b.x = b.r; b.vx *= -BOUNCE; this.bump(b, b.vx); }
      if (b.x > w - b.r) { b.x = w - b.r; b.vx *= -BOUNCE; this.bump(b, b.vx); }

      for (const c of cols) {
        const dx = b.x - c.x, dy = b.y - c.y, d = Math.hypot(dx, dy), min = b.r + c.r;
        if (d >= min || d < 1e-3) continue;
        const nx = dx / d, ny = dy / d;
        b.x = c.x + nx * min; b.y = c.y + ny * min;
        const rel = (b.vx - c.vx) * nx + (b.vy - c.vy) * ny;
        if (rel < 0) {
          b.vx -= (1 + BOUNCE) * rel * nx; b.vy -= (1 + BOUNCE) * rel * ny;
          if (-rel > 250) this.bump(b, rel);
        }
      }
    }
    // ball–ball
    for (let i = 0; i < this.balls.length; i++) for (let j = i + 1; j < this.balls.length; j++) {
      const a = this.balls[i], b = this.balls[j];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = a.r + b.r;
      if (d >= min || d < 1e-3) continue;
      const nx = dx / d, ny = dy / d, push = (min - d) / 2;
      if (!a.held) { a.x -= nx * push; a.y -= ny * push; }
      if (!b.held) { b.x += nx * push; b.y += ny * push; }
      const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rel < 0) {
        const imp = -(1 + BOUNCE) * rel / 2;
        if (!a.held) { a.vx -= imp * nx; a.vy -= imp * ny; }
        if (!b.held) { b.vx += imp * nx; b.vy += imp * ny; }
        if (imp > 250) this.bump(a, imp);
      }
    }
  }

  bump(b, speed) {
    b.squash = Math.min(0.25, Math.abs(speed) / 6000);
    this.sfx.pop(Math.round(8 - b.r / 8));
  }

  draw(g) {}

  drawTop(g) {
    for (const b of this.balls) {
      const sp = Math.hypot(b.vx, b.vy) || 1, ang = Math.atan2(b.vy, b.vx);
      const s = b.squash;
      g.save();
      g.translate(b.x, b.y); g.rotate(ang); g.scale(1 + s, 1 - s); g.rotate(-ang);
      g.shadowColor = 'rgba(0,0,0,0.3)'; g.shadowBlur = 14; g.shadowOffsetY = 6;
      g.fillStyle = '#16181D';
      g.beginPath(); g.arc(0, 0, b.r + 3, 0, Math.PI * 2); g.fill();
      g.shadowColor = 'transparent';
      g.fillStyle = b.color;
      g.beginPath(); g.arc(0, 0, b.r, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.75)';
      g.beginPath(); g.ellipse(-b.r * 0.35, -b.r * 0.4, b.r * 0.22, b.r * 0.13, -0.6, 0, Math.PI * 2); g.fill();
      g.restore();
      void sp;
    }
  }
}
