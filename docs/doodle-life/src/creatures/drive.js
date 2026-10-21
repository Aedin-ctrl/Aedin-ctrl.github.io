// Drive: wheels you drew spin as it rolls along the ground; the body rides a little suspension
// spring over bumps; at the edges it beeps and turns around (research/02 §3.6).
import { Creature } from './base.js';
import { analyse } from '../shape.js';

export class Drive extends Creature {
  constructor(strokes, opts) {
    super(strokes, opts);
    this.shape = analyse(this.strokes, this.w, this.h);
    this.head = this.shape.head || 1;
    this.wheels = new Map(this.shape.wheels.map((w) => [w.s, { cx: w.b.cx, cy: w.b.cy, r: Math.max(4, w.ext / 2) }]));
    // strokes sitting inside a wheel (hubcaps, spokes) spin with it
    for (const t of this.shape.info) {
      if (this.wheels.has(t.s)) continue;
      for (const [ws, w] of this.wheels) if (Math.hypot(t.b.cx - w.cx, t.b.cy - w.cy) < w.r * 0.9 && t.ext < w.r * 2) { this.wheels.set(t.s, w); break; }
    }
    this.speed = 80 + this.w * 0.5; this.dir = Math.random() < 0.5 ? -1 : 1; this.faceToward(this.dir);
    this.roll = 0; this.sy = 0; this.svy = 0; this.bumpIn = 0.4;
    this.eyesFrom(this.shape, { front: this.head });
  }
  update(dt) {
    super.update(dt);
    const W = this.world;
    this.y += ((W.ground - this.h / 2 - 1) - this.y) * Math.min(1, dt * 6);
    const atEdge = (this.x < this.w / 2 + 10 && this.dir < 0) || (this.x > W.w - this.w / 2 - 10 && this.dir > 0);
    if (atEdge) { this.dir = -this.dir; W.sound?.('beep', this); }
    if (Math.sign(this.screenDir) !== this.dir) this.faceToward(this.dir);
    const v = this.speed * Math.abs(this.facing);
    this.x += this.dir * v * dt;
    this.roll += v * dt;
    this.bumpIn -= dt;
    if (this.bumpIn < 0) { this.svy -= 40 + Math.random() * 60; this.bumpIn = 0.3 + Math.random() * 0.8; }
    this.svy += (-300 * this.sy - 10 * this.svy) * dt; this.sy += this.svy * dt;
    if (Math.random() < dt * 2) W.emit?.({ kind: 'puff', ...this.toWorld({ x: -this.head * this.w * 0.5, y: this.h * 0.3 }), vx: -this.dir * 20, vy: -15, r: 4, life: 0.9 });
  }
  deform(p, stroke) {
    const w = stroke && this.wheels.get(stroke);
    if (w) {            // rolling without slipping: angle = distance / radius (sign: the way it drives)
      const a = (this.roll / w.r) * (this.head > 0 ? 1 : -1);
      const dx = p.x - w.cx, dy = p.y - w.cy, c = Math.cos(a), s = Math.sin(a);
      return { x: w.cx + dx * c - dy * s, y: w.cy + dx * s + dy * c };
    }
    return { x: p.x, y: p.y + this.sy };
  }
  draw(g) {
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = this.color; g.lineWidth = 4;
    for (const s of this.strokes) {
      if (s.length < 2) continue;
      const pts = s.map((p) => this.toWorld(this.deform(p, s)));
      g.beginPath(); g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) g.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
      g.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      g.stroke();
    }
    g.restore();
    if (this.eyes) this.drawEyes(g);
  }
}
