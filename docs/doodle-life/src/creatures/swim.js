// Swim: a travelling wave down the spine, small at the head and big at the tail (research/02
// §2b-i, §3.1), with a wandering heading that pitches gently and turns around at the edges.
import { Creature, clamp } from './base.js';
import { analyse } from '../shape.js';

export class Swim extends Creature {
  constructor(strokes, opts) {
    super(strokes, opts);
    this.shape = analyse(this.strokes, this.w, this.h, { fish: true });
    this.head = this.shape.head || -1;               // default: drawn facing left
    this.L = this.w;
    this.A = 0.12; this.lambda = 1.1; this.freq = 2 + Math.random() * 0.6;
    this.speed = 40 + this.L * 0.35; this.heading = 0;
    this.faceToward(Math.random() < 0.5 ? -1 : 1);
    this.dir = this.screenDir;
    this.pitch = 0; this.bubbleIn = 1 + Math.random() * 2;
    this.eyesFrom(this.shape, { front: this.head, n: 1 });
  }
  // spine position s ∈ [0, 1] from head to tail
  s(p) { return clamp(this.head > 0 ? (this.w / 2 - p.x) / (this.w || 1) : (p.x + this.w / 2) / (this.w || 1), 0, 1); }
  deform(p) {
    const s = this.s(p), A = this.A * (0.1 + 0.9 * s * s);
    const y = this.L * A * Math.sin((2 * Math.PI * s) / this.lambda - 2 * Math.PI * this.freq * this.t);
    return { x: p.x, y: p.y + y };
  }
  update(dt) {
    super.update(dt);
    const W = this.world, top = 40 + this.h / 2, bot = W.ground - this.h / 2 - 10;
    this.pitch += ((Math.random() - 0.5) * 1.2 - this.pitch * 0.4) * dt;
    if (this.y < top + 30) this.pitch = Math.abs(this.pitch) * 0.6 + 0.05;
    if (this.y > bot - 30) this.pitch = -Math.abs(this.pitch) * 0.6 - 0.05;
    this.pitch = clamp(this.pitch, -0.35, 0.35);
    const v = this.speed * (1 + 0.25 * Math.sin(4 * Math.PI * this.freq * this.t));
    // flee or chase the cursor a little: fish dart away from a fast pointer
    if (W.focus && Math.hypot(W.focus.x - this.x, W.focus.y - this.y) < 90) { this.dir = Math.sign(this.x - W.focus.x) || this.dir; this.freq = 4; } else this.freq += (2.2 - this.freq) * dt;
    { const st = W.steer?.(this); if (st && st.dir) { this.dir = st.dir; this.hurry = st.flee ? 1.8 : st.chase ? 1.4 : 1; if (st.food) this.y += Math.sign(st.food.y - this.y) * Math.min(Math.abs(st.food.y - this.y), 80 * dt); } else this.hurry = 1; }
    if (this.x < this.w / 2 + 10) this.dir = 1;
    if (this.x > W.w - this.w / 2 - 10) this.dir = -1;
    if (Math.sign(this.screenDir) !== this.dir) this.faceToward(this.dir);
    this.x += this.dir * v * (this.hurry || 1) * dt * Math.abs(this.facing);
    this.y = clamp(this.y + Math.sin(this.pitch) * v * dt * 0.8, top, bot);
    this.angle = this.pitch * this.dir;
    this.bubbleIn -= dt;
    if (this.bubbleIn < 0) {
      this.bubbleIn = 1.2 + Math.random() * 2.5;
      const m = this.toWorld({ x: this.head * this.w * 0.48, y: 0 });
      W.emit?.({ kind: 'bubble', x: m.x, y: m.y, vx: 0, vy: -30, r: 3 + Math.random() * 3, life: 2.5 });
      W.sound?.('blub', this);
    }
  }
}

// Slither: same spine wave travelling down the body, moving along the ground (a side-on snake).
export class Slither extends Swim {
  constructor(strokes, opts) {
    super(strokes, opts);
    this.A = 0.08; this.lambda = 0.6; this.freq = 1.1; this.speed = 25 + this.L * 0.25;
    this.eyesFrom(this.shape, { front: this.head, n: 2 });
    this.tongueIn = 2 + Math.random() * 3; this.tongue = 0;
  }
  update(dt) {
    Creature.prototype.update.call(this, dt);
    const W = this.world;
    this.y += ((W.ground - this.h / 2 - 2) - this.y) * Math.min(1, dt * 4);
    if (this.x < this.w / 2 + 10) this.dir = 1;
    if (this.x > W.w - this.w / 2 - 10) this.dir = -1;
    if (W.focus && Math.abs(W.focus.x - this.x) > 120 && Math.random() < dt * 0.3) this.dir = Math.sign(W.focus.x - this.x);
    if (Math.sign(this.screenDir) !== this.dir) this.faceToward(this.dir);
    this.x += this.dir * this.speed * dt * (0.6 + 0.4 * Math.abs(Math.sin(Math.PI * this.freq * this.t))) * Math.abs(this.facing);
    this.angle = 0;
    this.tongueIn -= dt;
    if (this.tongueIn < 0) { this.tongue = 0.18; this.tongueIn = 3 + Math.random() * 4; }
    this.tongue = Math.max(0, this.tongue - dt);
  }
  draw(g) {
    super.draw(g);
    if (this.tongue > 0) {             // a quick forked tongue flick from the head
      const a = this.toWorld(this.deform({ x: this.head * this.w * 0.5, y: 0 }));
      const d = this.screenDir, L = Math.max(10, this.h * 0.4);
      g.save(); g.strokeStyle = '#D9534F'; g.lineWidth = 2; g.lineCap = 'round';
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(a.x + d * L, a.y); g.lineTo(a.x + d * L * 1.3, a.y - 4); g.moveTo(a.x + d * L, a.y); g.lineTo(a.x + d * L * 1.3, a.y + 4); g.stroke(); g.restore();
    }
  }
}
