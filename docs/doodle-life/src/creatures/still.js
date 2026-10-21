// Things that stay put but live: plants sway from the ground and lean away from your cursor;
// floaters (clouds, ghosts, balloons) bob in the air; clouds rain; the sun's rays turn.
import { Creature, clamp } from './base.js';
import { analyse } from '../shape.js';

export class Sway extends Creature {
  constructor(strokes, opts) {
    super(strokes, opts);
    this.gust = 0; this.lastFocusX = null; this.seed = Math.random() * 10;
    this.eyes = null;                       // plants don't get eyes… unless drawn
    // (small loops on a plant are petals or leaves, not eyes)
  }
  update(dt) {
    super.update(dt);
    const W = this.world;
    this.y += ((W.ground - this.h / 2) - this.y) * Math.min(1, dt * 5);          // rooted on the ground
    const f = W.focus;
    if (f) {
      if (this.lastFocusX !== null) {
        const vx = (f.x - this.lastFocusX) / Math.max(dt, 1e-3), near = Math.max(0, 1 - Math.hypot(f.x - this.x, f.y - this.y) / 180);
        this.gust = clamp(this.gust + vx * 0.0006 * near, -0.6, 0.6);
      }
      this.lastFocusX = f.x;
    } else this.lastFocusX = null;
    this.gust *= Math.exp(-dt * 1.5);
  }
  deform(p) {
    const hh = clamp((this.h / 2 - p.y) / (this.h || 1), 0, 1);            // 0 at the ground, 1 at the top
    const bend = 0.05 * Math.sin(2 * Math.PI * 0.4 * this.t + this.seed) + this.gust;
    const g = this.grow || 1, b = this.h / 2;                                // grows up from the root
    return { x: p.x * (1 + (g - 1) * 0.5) + this.h * bend * hh * hh, y: b + (p.y - b) * g + Math.abs(bend) * hh * this.h * 0.05 };
  }
}

export class Float extends Creature {
  constructor(strokes, opts) {
    super(strokes, opts);
    this.kind = opts.kind || 'float';
    this.y0 = this.y; this.vx = (Math.random() - 0.5) * 12;
    this.rainIn = 0;
    const sh = analyse(this.strokes, this.w, this.h);
    if (this.kind === 'sun') { this.rays = new Set(sh.info.filter((t) => t !== sh.body).map((t) => t.s)); this.eyes = null; }
    else this.eyesFrom(sh, { front: 0 });
    if (this.kind === 'cloud') this.y0 = Math.min(this.y0, this.world.ground * 0.35);
  }
  update(dt) {
    super.update(dt);
    const W = this.world;
    this.y0 += (Math.min(this.y0, W.ground - this.h) - this.y0) * dt;
    this.y = this.y0 + 8 * Math.sin(1.1 * this.t);
    this.x += this.vx * dt;
    if (this.x < this.w / 2 || this.x > W.w - this.w / 2) this.vx = -this.vx;
    if (this.kind === 'cloud') {
      this.rainIn -= dt;
      while (this.rainIn < 0) {
        this.rainIn += 0.045;
        W.emit?.({ kind: 'rain', x: this.x + (Math.random() - 0.5) * this.w * 0.8, y: this.y + this.h * 0.35, vx: 0, vy: 420, life: 3 });
      }
    }
  }
  deform(p, stroke) {
    if (this.kind === 'sun' && stroke && this.rays?.has(stroke)) {         // rays turn slowly and pulse
      const a = this.t * 0.25, k = 1 + 0.05 * Math.sin(this.t * 2), c = Math.cos(a), s = Math.sin(a);
      return { x: (p.x * c - p.y * s) * k, y: (p.x * s + p.y * c) * k };
    }
    if (this.kind === 'ghost') {                                             // wavy hem
      const hh = clamp((p.y + this.h / 2) / (this.h || 1), 0, 1);
      return { x: p.x + 4 * Math.sin(p.x * 0.08 - 4 * this.t) * Math.max(0, hh - 0.6) * 2.5, y: p.y };
    }
    return { x: p.x * (1 + 0.02 * Math.sin(2 * this.t)), y: p.y * (1 - 0.02 * Math.sin(2 * this.t)) };
  }
  draw(g) {
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = this.color; g.lineWidth = 4;
    if (this.kind === 'ghost') g.globalAlpha = 0.75 + 0.1 * Math.sin(this.t * 1.7);
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

// Hop: crouch, leap in an arc, land with a squash (frog, rabbit, kangaroo).
export class Hop extends Creature {
  constructor(strokes, opts) {
    super(strokes, opts);
    const sh = analyse(this.strokes, this.w, this.h);
    this.head = sh.head || 1;
    this.eyesFrom(sh, { front: this.head });
    this.state = 'idle'; this.timer = 0.6 + Math.random(); this.vy = 0; this.vx = 0;
    this.sq = 1; this.sqv = 0; this.dir = Math.random() < 0.5 ? -1 : 1; this.faceToward(this.dir);
    this.air = false;
  }
  update(dt) {
    super.update(dt);
    const W = this.world, floor = W.ground - this.h / 2;
    this.sqv += (-300 * (this.sq - 1) - 12 * this.sqv) * dt; this.sq += this.sqv * dt;
    if (!this.air) {
      this.y += (floor - this.y) * Math.min(1, dt * 8);
      this.timer -= dt;
      if (this.state === 'idle' && this.timer < 0) { this.state = 'crouch'; this.timer = 0.14; this.sqv -= 3; }
      else if (this.state === 'crouch' && this.timer < 0) {
        if (W.focus && Math.random() < 0.6) this.dir = Math.sign(W.focus.x - this.x) || this.dir;
        if (this.x < this.w + 20) this.dir = 1;
        if (this.x > W.w - this.w - 20) this.dir = -1;
        this.faceToward(this.dir);
        this.air = true; this.vy = -Math.sqrt(2 * 1800 * this.h * (1.1 + Math.random() * 0.6)); this.vx = this.dir * (90 + this.w);
        this.sqv += 4; this.state = 'air';
      }
    } else {
      this.vy += 1800 * dt; this.x += this.vx * dt; this.y += this.vy * dt;
      this.angle = clamp(this.vy * 0.0004, -0.25, 0.25) * this.dir;
      if (this.y >= floor) { this.y = floor; this.air = false; this.angle = 0; this.sqv -= Math.min(6, this.vy * 0.006); this.state = 'idle'; this.timer = 0.5 + Math.random() * 1.2; W.sound?.('boing', this); W.emit?.({ kind: 'dust', x: this.x, y: W.ground, vx: 0, vy: 0, r: this.w * 0.3, life: 0.4 }); }
    }
  }
  deform(p) {          // squash & stretch about the feet
    const sy = this.sq, sx = 1 / Math.sqrt(Math.max(0.3, sy)), b = this.h / 2;
    return { x: p.x * sx, y: b + (p.y - b) * sy };
  }
}

// Roll: balls and donuts roll along the ground; the whole drawing spins (angle = distance / radius)
// and bounces a little off the walls.
export class Roll extends Creature {
  constructor(strokes, opts) {
    super(strokes, opts);
    this.r = Math.max(10, Math.max(this.w, this.h) / 2);
    this.vx = (Math.random() < 0.5 ? -1 : 1) * (90 + Math.random() * 60); this.vy = 0; this.spin = 0;
    this.eyes = null;
  }
  update(dt) {
    super.update(dt);
    const W = this.world, floor = W.ground - this.r;
    this.vy += 1600 * dt; this.y += this.vy * dt;
    if (this.y > floor) { this.y = floor; if (this.vy > 120) W.sound?.('boing', this); this.vy = -this.vy * 0.45; if (Math.abs(this.vy) < 40) this.vy = 0; }
    if (W.focus && Math.hypot(W.focus.x - this.x, W.focus.y - this.y) < this.r + 30) { this.vx += Math.sign(this.x - W.focus.x) * 600 * dt; }   // nudge it with the cursor
    this.vx *= Math.exp(-dt * 0.15);
    if (Math.abs(this.vx) < 30) this.vx = Math.sign(this.vx || 1) * 30;
    this.x += this.vx * dt;
    if (this.x < this.r) { this.x = this.r; this.vx = Math.abs(this.vx); W.sound?.('boing', this); }
    if (this.x > W.w - this.r) { this.x = W.w - this.r; this.vx = -Math.abs(this.vx); W.sound?.('boing', this); }
    this.spin += (this.vx * dt) / this.r;
    this.angle = this.spin;
  }
}

// Fire: rooted on the ground; the top flickers with layered noise, embers rise, a warm glow.
export class Fire extends Creature {
  constructor(strokes, opts) { super(strokes, opts); this.eyes = null; this.emberIn = 0; }
  update(dt) {
    super.update(dt);
    const W = this.world;
    this.y += ((W.ground - this.h / 2) - this.y) * Math.min(1, dt * 5);
    this.emberIn -= dt;
    if (this.emberIn < 0) { this.emberIn = 0.08 + Math.random() * 0.15; W.emit?.({ kind: 'ember', x: this.x + (Math.random() - 0.5) * this.w * 0.5, y: this.y - this.h * 0.2, vx: (Math.random() - 0.5) * 20, vy: -60 - Math.random() * 60, life: 1.2 }); }
  }
  deform(p) {
    const hh = clamp((this.h / 2 - p.y) / (this.h || 1), 0, 1), t = this.t;
    const n = Math.sin(t * 9 + p.x * 0.11) * 0.5 + Math.sin(t * 13.7 + p.y * 0.07) * 0.3 + Math.sin(t * 5.3) * 0.2;
    return { x: p.x + this.h * 0.04 * hh * n, y: p.y - this.h * 0.08 * hh * (0.5 + 0.5 * Math.sin(t * 7 + p.x * 0.05)) };
  }
  draw(g) {
    const r = Math.max(this.w, this.h) * (0.9 + 0.08 * Math.sin(this.t * 11)) * (1 + 0.6 * (this.world.nightK || 0));
    const grd = g.createRadialGradient(this.x, this.y, 0, this.x, this.y, r);
    grd.addColorStop(0, `rgba(255,170,60,${0.28 + 0.3 * (this.world.nightK || 0)})`); grd.addColorStop(1, 'rgba(255,170,60,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(this.x, this.y, r, 0, Math.PI * 2); g.fill();
    super.draw(g);
  }
}
