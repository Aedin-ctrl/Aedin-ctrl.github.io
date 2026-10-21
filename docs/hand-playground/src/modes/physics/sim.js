// Physics simulation for the Physics tab. No DOM, so it also runs in node tests.
// The parts list (JSON) is the source of truth; the Planck world is rebuilt from it.
import { World, Vec2, Edge, Circle, MouseJoint } from '../../../vendor/planck/planck.mjs';
import { build, makeMarble } from './parts.js';

const STEP = 1 / 60;
const MAX_MARBLES = 80;

export class Sim {
  constructor(events = () => {}) {
    this.events = events;         // (type, payload) — for sounds/visuals
    this.parts = [];
    this.nextId = 1;
    this.w = 28; this.h = 14;      // world size in metres (set from the screen)
    this.acc = 0;
    this.time = 0;
    this.paused = false;
    this.timeScale = 1; this.slowTarget = 1;
    this.dtStep = STEP;
    this.hits = [];
    this.rebuild();
  }

  setSize(w, h) {
    if (Math.abs(w - this.w) < 1e-3 && Math.abs(h - this.h) < 1e-3) return;
    this.w = w; this.h = h;
    this.buildWalls();
  }

  // ── world lifecycle ────────────────────────────────────────────────
  rebuild() {
    this.world = new World({ gravity: Vec2(0, -10) });
    this.ground = this.world.createBody();
    this.built = new Map();       // part id → { bodies, joints }
    this.overlaps = new Map();    // sensor fixture → Set<body>
    this.queue = [];
    this.inCup = new Map();       // marble body → seconds inside a cup
    this.walls = null;
    this.pushers = new Map();
    this.buildWalls();
    this.listen();
    for (const p of this.parts) this.buildPart(p);
  }

  buildWalls() {
    if (this.walls) this.world.destroyBody(this.walls);
    const b = this.walls = this.world.createBody();
    b.createFixture(Edge(Vec2(-1, 0), Vec2(this.w + 1, 0)), { friction: 0.4, restitution: 0.2 });
    b.createFixture(Edge(Vec2(0, 0), Vec2(0, this.h * 3)), { friction: 0.2 });
    b.createFixture(Edge(Vec2(this.w, 0), Vec2(this.w, this.h * 3)), { friction: 0.2 });
    b.setUserData({ role: 'wall' });
  }

  buildPart(part) {
    this.unbuildPart(part);
    this.built.set(part.id, build(this.world, this.ground, part));
  }

  unbuildPart(part) {
    const b = this.built.get(part.id);
    if (!b) return;
    for (const j of b.joints) this.world.destroyJoint(j);
    for (const body of b.bodies) {
      for (let f = body.getFixtureList(); f; f = f.getNext()) this.overlaps.delete(f);
      this.world.destroyBody(body);
    }
    this.built.delete(part.id);
  }

  addPart(part) {
    part.id = this.nextId++;
    this.parts.push(part);
    this.buildPart(part);
    return part;
  }

  removePart(part) {
    const drop = this.parts.filter((p) => p === part || (part.pair && p.id === part.pair) || p.pair === part.id);
    for (const p of drop) this.unbuildPart(p);
    this.parts = this.parts.filter((p) => !drop.includes(p));
  }

  load(parts) {
    this.parts = parts.map((p) => ({ ...p }));
    this.nextId = Math.max(0, ...this.parts.map((p) => p.id)) + 1;
    this.rebuild();
  }

  // ── contacts ───────────────────────────────────────────────────────
  listen() {
    const role = (f) => f.getBody().getUserData()?.role;
    // Planck destroys a body's joints with it; mark them so we never destroy them twice
    this.world.on('remove-joint', (j) => { j.gone = true; });
    this.world.on('begin-contact', (c) => {
      const fa = c.getFixtureA(), fb = c.getFixtureB();
      for (const [s, o] of [[fa, fb], [fb, fa]]) {
        if (!s.isSensor() || o.isSensor() || !o.getBody().isDynamic()) continue;
        const kind = s.getUserData();
        if (!kind) continue;
        if (!this.overlaps.has(s)) this.overlaps.set(s, new Set());
        this.overlaps.get(s).add(o.getBody());
        this.queue.push({ kind, sensor: s, body: o.getBody() });
      }
      // trampoline: remember the hit so we can launch deterministically after the step
      for (const [t, o] of [[fa, fb], [fb, fa]]) {
        if (role(t) === 'trampoline' && o.getBody().isDynamic() && !o.isSensor()) this.queue.push({ kind: 'bounce', sensor: t, body: o.getBody() });
        if (role(t) === 'bumper' && o.getBody().isDynamic() && !o.isSensor()) this.queue.push({ kind: 'kick', sensor: t, body: o.getBody() });
      }
    });
    // impacts: impulse → Δv on the dynamic body; resting contacts stay quiet
    this.world.on('post-solve', (c, imp) => {
      const n = imp.normalImpulses;
      const j = c.getManifold().pointCount > 1 ? Math.max(n[0], n[1]) : n[0];
      if (!(j > 0)) return;
      const A = c.getFixtureA().getBody(), B = c.getFixtureB().getBody();
      const dyn = A.isDynamic() ? A : B, other = dyn === A ? B : A;
      if (!dyn.isDynamic() || other.getUserData()?.role === 'hand') return;
      if (dyn.getUserData()?.role === 'rotor' || other.getUserData()?.role === 'rotor') return;   // a jammed windmill shouldn't buzz
      const dv = j / dyn.getMass();
      if (dv < 1.2 || this.time - (dyn.lastHit ?? -1) < 0.06) return;
      dyn.lastHit = this.time;
      const wm = c.getWorldManifold(null);
      const p = wm?.points?.[0] ?? dyn.getPosition();
      this.hits.push({ x: p.x, y: p.y, nx: wm?.normal?.x ?? 0, ny: wm?.normal?.y ?? 1, dv, a: dyn.getUserData()?.role, b: other.getUserData()?.role });
    });
    this.world.on('end-contact', (c) => {
      const fa = c.getFixtureA(), fb = c.getFixtureB();
      for (const [s, o] of [[fa, fb], [fb, fa]]) if (s.isSensor()) this.overlaps.get(s)?.delete(o.getBody());
    });
    this.world.on('pre-solve', (c) => {
      const fa = c.getFixtureA(), fb = c.getFixtureB();
      if (role(fa) === 'trampoline' || role(fb) === 'trampoline') c.setRestitution(0);
      if (role(fa) === 'conveyor') c.setTangentSpeed(fa.getBody().getUserData().part.speed ?? 3);
      if (role(fb) === 'conveyor') c.setTangentSpeed(-(fb.getBody().getUserData().part.speed ?? 3));
    });
  }

  // ── stepping ───────────────────────────────────────────────────────
  update(dt) {
    if (this.paused) return;
    // slow-mo shrinks the step size (not the step rate) so motion stays smooth
    this.timeScale += (this.slowTarget - this.timeScale) * Math.min(1, dt * 6);
    this.acc = Math.min(this.acc + dt, STEP * 4);
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.dtStep = STEP * this.timeScale;
      this.preStep();
      this.world.step(this.dtStep, 8, 3);
      this.time += this.dtStep;
      this.postStep();
    }
  }

  preStep() {
    for (const [f, bodies] of this.overlaps) {
      if (f.getUserData() === 'antigrav') { for (const b of bodies) b.applyForceToCenter(Vec2(0, 16 * b.getMass()), true); continue; }
      if (f.getUserData() !== 'fan') continue;
      const fan = f.getBody();
      const dir = fan.getWorldVector(Vec2(1, 0)), origin = fan.getPosition();
      for (const b of bodies) {
        const d = Vec2.dot(Vec2.sub(b.getPosition(), origin), dir);
        const k = Math.max(0, 1 - d / 4.8);
        b.applyForceToCenter(Vec2.mul(dir, 32 * k * b.getMass()), true);
      }
    }
    // spawners
    for (const p of this.parts) {
      if (p.type !== 'spawner') continue;
      p.charge = (p.charge ?? 0) + this.dtStep / (p.interval ?? 1.6);
      if (p.charge >= 1) {
        p.charge = 0;
        const c = Math.cos(p.angle), s = Math.sin(p.angle);
        if (this.marbleCount() < MAX_MARBLES) {
          makeMarble(this.world, p.x + c * 0.5, p.y + s * 0.5, c * 3, s * 3);
          this.events('spawn', p);
        }
      }
    }
  }

  postStep() {
    const q = this.queue; this.queue = [];
    for (const e of q) {
      if (e.body.dead) continue;
      const part = e.sensor.getBody().getUserData()?.part;
      if (e.kind === 'boost') {
        if (this.time - (e.body.lastBoost ?? -1) < 0.15) continue;
        e.body.lastBoost = this.time;
        const dir = e.sensor.getBody().getWorldVector(Vec2(1, 0));
        const v = e.body.getLinearVelocity(), along = Vec2.dot(v, dir);
        const target = Math.max(along + 4, 9);
        e.body.applyLinearImpulse(Vec2.mul(dir, (target - along) * e.body.getMass()), e.body.getWorldCenter(), true);
        this.events('boost', part);
      } else if (e.kind === 'bounce') {
        const n = e.sensor.getBody().getWorldVector(Vec2(0, 1));
        const v = e.body.getLinearVelocity(), vn = Vec2.dot(v, n);
        if (vn > 0.5) continue;
        const out = Math.min(Math.max(-vn * 1.1, 8), 18);
        e.body.setLinearVelocity(Vec2.add(v, Vec2.mul(n, out - vn)));
        part.squash = 1;
        this.events('bounce', { part, speed: -vn });
      } else if (e.kind === 'kick') {
        const c = e.sensor.getBody().getPosition(), p = e.body.getPosition();
        const n = Vec2.sub(p, c); n.normalize();
        const out = Math.min(16, Math.max(9, e.body.getLinearVelocity().length() * 1.1));
        e.body.setLinearVelocity(Vec2.mul(n, out));
        part.glow = 1;
        this.events('kick', part);
      } else if (e.kind === 'portal') {
        if (this.time < (e.body.portalCooldown ?? 0)) continue;
        const exit = this.parts.find((p) => p.id === part.pair);
        const exitBody = exit && this.built.get(exit.id)?.bodies[0];
        if (!exitBody) continue;
        const rot = exit.angle - part.angle + Math.PI;
        const v = e.body.getLinearVelocity(), c = Math.cos(rot), s = Math.sin(rot);
        const vOut = Vec2(c * v.x - s * v.y, s * v.x + c * v.y);
        const speed = Math.max(vOut.length(), 2);
        vOut.normalize();
        const out = exitBody.getWorldVector(Vec2(1, 0));
        // come out along the exit's facing direction, keeping speed
        const vel = Vec2.mul(Vec2.add(Vec2.mul(out, 0.6), Vec2.mul(vOut, 0.4)), speed);
        e.body.setTransform(exitBody.getWorldPoint(Vec2(0.5, 0)), e.body.getAngle());
        e.body.setLinearVelocity(vel);
        e.body.setAwake(true);
        e.body.portalCooldown = this.time + 0.3;
        this.events('portal', exit);
      }
    }

    // cups: a marble that stays inside for 0.5 s counts
    const seen = new Set();
    for (const [f, bodies] of this.overlaps) {
      if (f.getUserData() !== 'cup') continue;
      const part = f.getBody().getUserData().part;
      for (const b of bodies) {
        if (b.getUserData()?.role !== 'marble' || b.getJointList()) continue;   // held marbles don't score
        seen.add(b);
        const t = (this.inCup.get(b) ?? 0) + this.dtStep;
        this.inCup.set(b, t);
        if (t >= 0.5) {
          bodies.delete(b); this.inCup.delete(b);
          b.dead = true; this.world.destroyBody(b);
          part.count = (part.count ?? 0) + 1;
          part.glow = 1;
          this.events('score', part);
        }
      }
    }
    for (const b of this.inCup.keys()) if (!seen.has(b)) this.inCup.delete(b);

    for (const h of this.hits) this.events('hit', h);
    this.hits.length = 0;
    // marble trails: a fixed ring buffer per marble (no allocation per step)
    for (let b = this.world.getBodyList(); b; b = b.getNext()) {
      const u = b.getUserData();
      if (u?.role !== 'marble') continue;
      const p = b.getPosition(), v = b.getLinearVelocity();
      if (v.x * v.x + v.y * v.y > 9) { u.trail[u.ti * 2] = p.x; u.trail[u.ti * 2 + 1] = p.y; u.ti = (u.ti + 1) % 12; u.tn = Math.min(12, u.tn + 1); }
      else if (u.tn) u.tn--;
      if (u.squash) u.squash *= 0.85;
      // marbles don't pile up: one resting for 4 s, or any older than 25 s, fades out and is removed
      if (b.getJointList() || this.inCup.has(b)) { u.rest = 0; u.age = 0; u.fade = null; continue; }   // held or scoring: safe
      u.age = (u.age || 0) + this.dtStep;
      u.rest = v.x * v.x + v.y * v.y < 0.04 ? (u.rest || 0) + this.dtStep : 0;
      if (u.fade == null && (u.rest > 4 || u.age > 25)) u.fade = 1;
      if (u.fade != null) u.fade -= this.dtStep / 0.6;
    }
    for (let b = this.world.getBodyList(); b;) {
      const next = b.getNext(), u = b.getUserData();
      if (u?.role === 'marble' && u.fade != null && u.fade <= 0) { b.dead = true; this.world.destroyBody(b); }
      b = next;
    }
    // decay visuals, clean up lost marbles
    for (const p of this.parts) { if (p.squash) p.squash *= 0.85; if (p.glow) p.glow *= 0.97; }
    for (let b = this.world.getBodyList(); b;) {
      const next = b.getNext();
      const pos = b.getPosition();
      if (b.isDynamic() && (pos.y < -3 || pos.x < -3 || pos.x > this.w + 3)) {
        const part = b.getUserData()?.part;
        if (!part) { b.dead = true; this.world.destroyBody(b); }
      }
      b = next;
    }
  }

  marbleCount() {
    let n = 0;
    for (let b = this.world.getBodyList(); b; b = b.getNext()) if (b.getUserData()?.role === 'marble') n++;
    return n;
  }

  marbles() {
    const out = [];
    for (let b = this.world.getBodyList(); b; b = b.getNext()) if (b.getUserData()?.role === 'marble') out.push(b);
    return out;
  }

  // Dynamic body under a world point (marbles first), for grabbing.
  bodyAt(x, y, r) {
    let best = null, bestD = Infinity;
    this.world.queryAABB({ lowerBound: Vec2(x - r, y - r), upperBound: Vec2(x + r, y + r) }, (f) => {
      const b = f.getBody();
      if (!b.isDynamic() || f.isSensor() || b.getUserData()?.role === 'rotor') return true;
      const d = Vec2.distance(b.getPosition(), Vec2(x, y)) - (b.getUserData()?.role === 'marble' ? 0.3 : 0);
      if (d < bestD) { best = b; bestD = d; }
      return true;
    });
    return best;
  }

  grab(body, x, y) {
    return this.world.createJoint(new MouseJoint({ maxForce: 900 * body.getMass(), frequencyHz: 12, dampingRatio: 0.8 }, this.ground, body, Vec2(x, y)));
  }

  release(joint) {
    if (joint.gone) return;
    const body = joint.getBodyB();
    this.world.destroyJoint(joint);
    const v = body.getLinearVelocity(), sp = v.length();
    if (sp > 30) body.setLinearVelocity(Vec2.mul(v, 30 / sp));
  }

  spawnMarble(x, y, vx = 0, vy = 0) { return makeMarble(this.world, x, y, vx, vy); }

  // Kinematic fingertip/palm pushers so hands can bat things around.
  pusher(key, x, y, r, dt) {
    let b = this.pushers.get(key);
    if (!b) {
      b = this.world.createKinematicBody({ position: Vec2(x, y) });
      b.createFixture(Circle(r), { friction: 0.4, restitution: 0.3 });
      b.setUserData({ role: 'hand' });
      this.pushers.set(key, b);
    }
    const p = b.getPosition();
    if (Math.hypot(x - p.x, y - p.y) > 2) { b.setTransform(Vec2(x, y), 0); b.setLinearVelocity(Vec2(0, 0)); }
    else {
      const sdt = Math.max(dt * this.timeScale, 1 / 480);          // world time per frame (slow-mo aware)
      b.setLinearVelocity(Vec2((x - p.x) / sdt, (y - p.y) / sdt));
    }
    b.seen = true;
  }

  sweepPushers() {
    if (!this.pushers) return;
    for (const [k, b] of this.pushers) {
      if (b.seen) { b.seen = false; continue; }
      this.world.destroyBody(b); this.pushers.delete(k);
    }
  }
}
