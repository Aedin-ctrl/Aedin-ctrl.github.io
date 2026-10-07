// Walk: on the ground. Legs you drew swing about their hips in a gait chosen by how many there
// are (research/02 §3.3); with no legs found the whole doodle waddles like a penguin.
import { Creature, clamp } from './base.js';
import { analyse } from '../shape.js';

export class Walk extends Creature {
  constructor(strokes, opts) {
    super(strokes, opts);
    this.shape = analyse(this.strokes, this.w, this.h);
    this.head = this.shape.head || 1;
    // bugs (spider, ant, scorpion): every stroke coming off the body is a leg, swung gently
    this.bug = ['spider', 'ant', 'scorpion'].includes(this.label);
    const limbs = this.bug ? [...this.shape.legs, ...this.shape.tails, ...this.shape.wings] : this.shape.legs;
    this.legs = limbs.sort((a, b) => this.head * (b.attach.x - a.attach.x));     // front to back
    this.amp = this.bug ? 0.16 : 0.45;
    this.legSet = new Map(this.legs.map((l, k) => [l.s, { leg: l, phase: this.phaseFor(k, this.legs.length) }]));
    this.tails = this.shape.tails;
    this.speed = 30 + this.w * 0.35; this.freq = 1.6 + Math.random() * 0.4;
    if (this.bug) { this.freq = 3.2; this.speed *= 1.3; }
    this.dir = Math.random() < 0.5 ? -1 : 1; this.faceToward(this.dir);
    this.pause = 0;
    // radial bugs (spiders): eyes on the body, not at an end
    if (this.label === 'spider' || this.legs.length >= 6) { const bb = this.shape.bodyBox; this.eyesFrom({ eyes: this.shape.eyes, headBox: { ...bb, cx: bb.cx, x0: bb.x0, w: bb.w, y0: bb.y0, h: bb.h } }, { front: 0.001 }); }
    else this.eyesFrom(this.shape, { front: this.head });
  }
  phaseFor(k, n) {
    if (this.bug) return (k % 2) * Math.PI;              // alternating sets, like a real spider
    if (n === 2) return k * Math.PI;
    if (n === 4) return [0, Math.PI, Math.PI / 2, Math.PI * 1.5][k];
    return (k % 2) * Math.PI + k * 0.3;
  }
  get walking() { return this.pause <= 0; }
  update(dt) {
    super.update(dt);
    const W = this.world;
    this.y += ((W.ground - this.h / 2 - 1) - this.y) * Math.min(1, dt * 6);
    if (this.pause > 0) this.pause -= dt; else if (Math.random() < dt * 0.12 && (this.hurry || 1) === 1) this.pause = 0.8 + Math.random() * 1.8;
    if ((this.hurry || 1) > 1) this.pause = 0;
    if (W.focus && Math.abs(W.focus.x - this.x) > 100 && Math.random() < dt * 0.4) this.dir = Math.sign(W.focus.x - this.x);
    { const st = W.steer?.(this); if (st && st.dir) { this.dir = st.dir; this.hurry = st.flee ? 1.8 : st.chase ? 1.4 : 1; } else this.hurry = 1; }
    if (this.x < this.w / 2 + 10) this.dir = 1;
    if (this.x > W.w - this.w / 2 - 10) this.dir = -1;
    if (Math.sign(this.screenDir) !== this.dir) this.faceToward(this.dir);
    if (this.walking) { this.phase = (this.phase || 0) + dt * 2 * Math.PI * this.freq; this.x += this.dir * this.speed * (this.hurry || 1) * dt * Math.abs(this.facing); }
    const bob = this.walking ? Math.abs(Math.sin(this.phase)) : 0;
    this.bob = -this.h * (this.legs.length ? 0.025 : 0.05) * bob;
    // no legs: waddle — rock about the bottom centre
    this.angle = this.legs.length ? 0.02 * Math.sin(this.phase || 0) : (this.walking ? 0.12 * Math.sin(this.phase || 0) : 0);
  }
  deform(p) {
    let q = { x: p.x, y: p.y + this.bob };
    if (!this.walking) return q;
    // leg strokes rotate about their hip; points are matched to their stroke by reference
    const L = this.legOf?.(p);
    if (L) {
      const { leg, phase } = L, a = leg.attach;
      const th = this.amp * Math.sin(this.phase + phase);
      const dx = p.x - a.x, dy = p.y - a.y, c = Math.cos(th), s = Math.sin(th);
      q = { x: a.x + dx * c - dy * s, y: a.y + dx * s + dy * c + this.bob };
    }
    return q;
  }
  // draw: route each stroke's points through the leg it belongs to
  draw(g) {
    this.legOf = null;
    const strokes = this.strokes;
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = this.color; g.lineWidth = 4;
    for (const s of strokes) {
      if (s.length < 2) continue;
      const L = this.legSet.get(s);
      this.legOf = () => L;
      const pts = s.map((p) => this.toWorld(this.deform(p)));
      g.beginPath(); g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) g.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
      g.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      g.stroke();
    }
    g.restore();
    this.legOf = null;
    if (this.eyes) this.drawEyes(g);
  }
  // rotation (waddle) pivots about the feet, not the centre — for the eyes too
  toWorld(p) {
    const s = 0.6 + 0.4 * Math.min(1, this.spawn * 1.2), half = this.h / 2;
    const x = p.x * this.facing * s, y = (p.y - half) * s;
    const c = Math.cos(this.angle), n = Math.sin(this.angle);
    return { x: this.x + x * c - y * n, y: this.y + half * s + x * n + y * c };
  }
}
