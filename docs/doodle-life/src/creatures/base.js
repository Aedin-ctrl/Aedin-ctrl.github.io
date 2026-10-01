// What every creature shares: its own strokes kept in local coordinates (centred on the body),
// a position/heading in the world, googly eyes, and drawing the strokes through a per-frame
// deformation. Archetypes (swim, fly, walk, …) override update() and deform().
import { bounds } from '../draw.js';

export class Creature {
  constructor(strokes, { color, label = null, world }) {
    const b = bounds(strokes);
    this.size = Math.max(b.w, b.h, 20);
    this.w = b.w; this.h = b.h;
    // local coordinates: origin at the drawing's centre, as drawn (no flipping)
    this.strokes = strokes.map((s) => s.map((p) => ({ x: p.x - b.cx, y: p.y - b.cy })));
    this.x = b.cx; this.y = b.cy; this.vx = 0; this.vy = 0;
    this.color = color; this.label = label; this.world = world;
    this.t = Math.random() * 100; this.age = 0;
    this.facing = 1;              // +1 = as drawn, −1 = mirrored; passes through 0 while turning
    this.facingTo = 1;
    this.angle = 0;
    this.eyes = null;             // set by placeEyes()
    this.blink = 0; this.nextBlink = 1 + Math.random() * 3;
    this.spawn = 0;               // 0 → 1 pop-in
  }

  update(dt) {
    this.t += dt; this.age += dt;
    this.spawn = Math.min(1, this.spawn + dt * 3);
    this.nextBlink -= dt;
    if (this.nextBlink < 0) { this.blink = 1; this.nextBlink = 2 + Math.random() * 4; }
    this.blink = Math.max(0, this.blink - dt * 7);
    if (this.pop) this.pop = Math.max(0, this.pop - dt * 3);
    // turning around: squash through flat instead of snapping
    if (this.facing !== this.facingTo) {
      const d = this.facingTo - this.facing, step = dt * 8;
      this.facing = Math.abs(d) <= step ? this.facingTo : this.facing + Math.sign(d) * step;
    }
  }
  // which way the head points on screen right now (+1 right, −1 left)
  get screenDir() { return (this.head || 1) * Math.sign(this.facingTo || 1); }
  // turn so the head points along dir (±1)
  faceToward(dir) { if (dir) this.facingTo = Math.sign(dir) * (this.head || 1); }

  // swap which end is the head: eyes move to the other end, and it walks/swims the other way
  flipFront() {
    if (!this.head) return;
    this.head = -this.head;
    if (this.eyes) for (const e of this.eyes) e.x = -e.x;
    this.dir = -(this.dir || 1); this.faceToward?.(this.dir);
  }
  // poked: a quick surprised pop (scale kick) that every creature shows
  poke() { this.pop = 1; }

  // local point (as drawn) → deformed local point; archetypes bend their body here
  deform(p) { return p; }

  // local → world, with facing, rotation and the spawn pop
  toWorld(p) {
    const s = (0.6 + 0.4 * easeOutBack(this.spawn)) * (1 + 0.18 * Math.sin((this.pop || 0) * Math.PI));
    const x = p.x * this.facing * s, y = p.y * s;
    const c = Math.cos(this.angle), n = Math.sin(this.angle);
    return { x: this.x + x * c - y * n, y: this.y + x * n + y * c };
  }

  draw(g) {
    g.save();
    g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = this.color;
    g.lineWidth = this.lineWidth ?? 4;
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

  // Googly eyes: whites with a pupil that looks at the world's focus point (cursor or your face).
  drawEyes(g) {
    const look = this.world.focus;
    for (const e of this.eyes) {
      const c = this.toWorld(this.deform(e));
      const r = e.r * (0.6 + 0.4 * easeOutBack(this.spawn));
      g.save();
      g.fillStyle = '#FFFFFF'; g.strokeStyle = this.color; g.lineWidth = Math.max(1.5, r * 0.18);
      g.beginPath(); g.ellipse(c.x, c.y, r, r * (1 - 0.92 * this.blink), 0, 0, Math.PI * 2); g.fill(); g.stroke();
      if (this.blink < 0.5) {
        let dx = look ? look.x - c.x : this.facing, dy = look ? look.y - c.y : 0;
        const d = Math.hypot(dx, dy) || 1, m = Math.min(1, d / 120) * r * 0.42;
        g.fillStyle = '#1E2026';
        g.beginPath(); g.arc(c.x + (dx / d) * m, c.y + (dy / d) * m, r * 0.48, 0, Math.PI * 2); g.fill();
      }
      g.restore();
    }
  }

  // Where to put the eyes when the drawing doesn't have obvious ones: near the front-top of the body.
  placeEyes({ front = 1, n = 2 } = {}) {
    const r = Math.max(5, Math.min(14, this.size * 0.09));
    const fx = front * this.w * 0.28, fy = -this.h * 0.12;
    this.eyes = n === 1 ? [{ x: fx, y: fy, r }] : [{ x: fx - r * 1.05, y: fy, r }, { x: fx + r * 1.05, y: fy, r }];
  }

  // Googly eyes: on the eyes you drew if there are any, else placed near the front-top.
  eyesFrom(shape, { front = this.head || 0, n = 2 } = {}) {
    if (shape?.eyes?.length) {
      this.eyes = shape.eyes.slice(0, 2).map((e) => ({ x: e.b.cx, y: e.b.cy, r: Math.max(6, Math.min(14, e.ext * 0.8)) }));
    } else if (shape?.headBox && front) {
      // on the head itself: a little in from its front edge, in its upper half
      const hb = shape.headBox, r = Math.max(4.5, Math.min(12, Math.min(hb.w, hb.h) * 0.2, this.size * 0.08));
      const ex = hb.cx + front * hb.w * 0.12, ey = hb.y0 + hb.h * 0.38;
      this.eyes = n === 1 ? [{ x: ex, y: ey, r }] : [{ x: ex - r * 1.05, y: ey, r }, { x: ex + r * 1.05, y: ey, r }];
    } else this.placeEyes({ front, n });
  }

  // world-space bounding radius, for collisions and picking
  get radius() { return this.size * 0.5; }
}

export const easeOutBack = (t) => { const c = 1.70158, u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; };
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
