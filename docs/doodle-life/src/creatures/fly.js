// Fly: wander through the upper sky, bobbing against the wingbeat, banking into turns, gliding now
// and then. Wings you drew rotate about their shoulders; otherwise everything above the body
// folds with a mirrored scale (research/02 §2e, §3.2).
import { Creature, clamp } from './base.js';
import { analyse } from '../shape.js';

export class Fly extends Creature {
  constructor(strokes, opts) {
    super(strokes, opts);
    this.shape = analyse(this.strokes, this.w, this.h);
    this.head = this.shape.head || 1;
    this.wingStrokes = new Map(this.shape.wings.map((w) => [w.s, w]));
    this.freq = 3 + Math.random() * 1.5; this.speed = 60 + this.w * 0.4;
    if (['bee', 'mosquito'].includes(this.label)) this.freq = 9; if (this.label === 'butterfly') { this.freq = 2.2; this.speed *= 0.6; }
    this.dir = Math.random() < 0.5 ? -1 : 1; this.faceToward(this.dir);
    this.alt = 0; this.glide = 0; this.vy = 0;
    this.bodyTop = this.shape.bodyBox.y0;
    this.eyesFrom(this.shape, { front: this.head });
    this.chirpIn = 2 + Math.random() * 4;
  }
  update(dt) {
    super.update(dt);
    const W = this.world;
    if (this.glide > 0) this.glide -= dt; else if (Math.random() < dt * 0.15) this.glide = 1 + Math.random();
    this.flap = this.glide > 0 ? 0.35 : Math.sin(2 * Math.PI * this.freq * this.t);
    const targetY = 60 + this.h + (W.ground * 0.45) * (0.5 + 0.5 * Math.sin(0.25 * this.t + this.x * 0.001));
    this.vy += ((targetY - this.y) * 0.8 - this.vy) * dt * 1.5 + (this.glide > 0 ? 18 * dt : 0);
    this.y += (this.vy - (this.glide > 0 ? 0 : 6 * this.flap) + (this.label === 'butterfly' ? 40 * Math.sin(this.t * 3.1) : 0)) * dt;
    { const st = W.steer?.(this); if (st && st.dir) { this.dir = st.dir; this.hurry = st.flee ? 1.8 : st.chase ? 1.4 : 1; if (st.food) this.y += Math.sign(st.food.y - this.y) * Math.min(Math.abs(st.food.y - this.y), 80 * dt); } else this.hurry = 1; }
    if (this.x < this.w / 2 + 10) this.dir = 1;
    if (this.x > W.w - this.w / 2 - 10) this.dir = -1;
    if (W.focus && Math.hypot(W.focus.x - this.x, W.focus.y - this.y) < 110) { this.dir = Math.sign(this.x - W.focus.x) || this.dir; this.vy -= 60 * dt; }
    if (Math.sign(this.screenDir) !== this.dir) this.faceToward(this.dir);
    this.x += this.dir * this.speed * (this.hurry || 1) * dt * Math.abs(this.facing);
    this.angle = clamp(this.vy * 0.003, -0.3, 0.3) * this.dir;
    this.chirpIn -= dt;
    if (this.chirpIn < 0) { this.chirpIn = 3 + Math.random() * 5; W.sound?.('chirp', this); }
  }
  draw(g) {
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = this.color; g.lineWidth = 4;
    for (const s of this.strokes) {
      if (s.length < 2) continue;
      const wing = this.wingStrokes.get(s);
      const pts = s.map((p) => this.toWorld(wing && !this.topDown ? this.flapWing(p, wing) : this.foldAbove(p)));
      g.beginPath(); g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) g.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
      g.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      g.stroke();
    }
    g.restore();
    if (this.eyes) this.drawEyes(g);
  }
  // a drawn wing: rotate about its shoulder, down on the downstroke (second harmonic = snappy)
  flapWing(p, wing) {
    const a = wing.attach, th = 0.7 * (this.flap + 0.3 * Math.sin(4 * Math.PI * this.freq * this.t)) * (this.glide > 0 ? 0.2 : 1);
    const dx = p.x - a.x, dy = p.y - a.y, c = Math.cos(th), sn = Math.sin(th);
    const r = this.head > 0 ? -1 : 1;           // wings sweep down toward the back
    return { x: a.x + dx * c - dy * sn * r, y: a.y + dx * sn * r + dy * c };
  }
  // butterflies, bees and the like are drawn from above: both wings fold about the body axis
  // (a fake 3D flap: the sideways offset shrinks and grows; research/02 §2e)
  get topDown() { return ['butterfly', 'bee', 'mosquito', 'bat', 'dragon', 'angel'].includes(this.label); }
  foldAcross(p) {
    const half = this.shape.bodyBox.w * 0.25, d = Math.abs(p.x);
    if (d <= half) return p;
    const c = this.glide > 0 ? 0.8 : 0.25 + 0.75 * Math.abs(Math.cos(Math.PI * this.freq * this.t));
    const k = Math.min(1, (d - half) / (half + 1));
    return { x: Math.sign(p.x) * (half + (d - half) * (1 - k * (1 - c))), y: p.y - (1 - c) * k * 6 };
  }
  // no wing found: whatever sticks up above the body folds up and down
  foldAbove(p) {
    if (this.topDown) return this.foldAcross(p);
    if (this.shape.wings.length || p.y >= this.bodyTop) return p;
    const k = 0.35 + 0.65 * Math.abs(Math.cos(Math.PI * this.freq * this.t));
    return { x: p.x, y: this.bodyTop + (p.y - this.bodyTop) * (this.glide > 0 ? 0.8 : k) };
  }
}
