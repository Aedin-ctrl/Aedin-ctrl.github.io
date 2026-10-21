// Physics parts (research/14 §2). Each part is plain JSON ({ id, type, x, y, angle, len? })
// that builds Planck bodies/joints, and knows how to draw itself in world units (metres, y up).
import { Vec2, Box, Circle, Polygon, RevoluteJoint, PulleyJoint, PrismaticJoint } from '../../../vendor/planck/planck.mjs';

export const MARBLE_R = 0.2;
const DEG = Math.PI / 180;

const C = {
  ramp: '#C9CED8', tramp: '#7CE3B1', boost: '#FFB547', conveyor: '#8FA3BF', wood: '#E3C9A0',
  pivot: '#8C93A0', rope: '#C9CED8', fan: '#9AD7FF', portalA: '#FF9F5A', portalB: '#5AB4FF',
  domino: '#F4F5F7', cup: '#7CE3B1', spawner: '#F4F5F7',
};

export const TILES = [
  { type: 'marble', label: 'Marble' }, { type: 'ramp', label: 'Ramp' },
  { type: 'trampoline', label: 'Bounce' }, { type: 'boost', label: 'Boost' },
  { type: 'conveyor', label: 'Belt' }, { type: 'seesaw', label: 'Seesaw' },
  { type: 'pulley', label: 'Pulley' }, { type: 'fan', label: 'Fan' },
  { type: 'portal', label: 'Portal' }, { type: 'dominoes', label: 'Dominoes' },
  { type: 'cup', label: 'Cup' }, { type: 'spawner', label: 'Spawner' },
  { type: 'bumper', label: 'Bumper' }, { type: 'windmill', label: 'Windmill' },
  { type: 'antigrav', label: 'Float' },
];

// Parts that can be stretched with two hands.
export const STRETCHY = new Set(['ramp', 'trampoline', 'boost', 'conveyor']);
export const DEFAULT_LEN = { ramp: 3, trampoline: 1.6, boost: 1.2, conveyor: 3 };

const staticBox = (world, part, hx, hy, role, opts = {}) => {
  const b = world.createBody({ type: 'static', position: Vec2(part.x, part.y), angle: part.angle });
  b.createFixture(Box(hx, hy), { friction: 0.3, restitution: 0.1, ...opts });
  b.setUserData({ part, role });
  return b;
};

export function build(world, ground, part) {
  const out = { bodies: [], joints: [] };
  const add = (b) => (out.bodies.push(b), b);
  const { x, y } = part;
  switch (part.type) {
    case 'ramp': add(staticBox(world, part, part.len / 2, 0.07, 'ramp', { friction: 0.15 })); break;
    case 'trampoline': add(staticBox(world, part, part.len / 2, 0.08, 'trampoline')); break;
    case 'conveyor': add(staticBox(world, part, part.len / 2, 0.12, 'conveyor', { friction: 0.9 })); break;
    case 'boost': {
      // pure trigger zone (no solid base) so it can sit on top of a ramp without a bump
      const b = add(world.createBody({ type: 'static', position: Vec2(x, y), angle: part.angle }));
      b.createFixture(Box(part.len / 2, 0.32, Vec2(0, 0.2), 0), { isSensor: true, userData: 'boost' });
      b.setUserData({ part, role: 'boost' });
      break;
    }
    case 'seesaw': {
      const pivot = add(world.createBody({ type: 'static', position: Vec2(x, y) }));
      pivot.createFixture(Polygon([Vec2(-0.3, -0.45), Vec2(0.3, -0.45), Vec2(0, 0)]), { friction: 0.5 });
      pivot.setUserData({ part, role: 'pivot' });
      const plank = add(world.createDynamicBody({ position: Vec2(x, y + 0.08), angle: part.angle }));
      plank.createFixture(Box(1.6, 0.07), { density: 2, friction: 0.5 });
      plank.setUserData({ part, role: 'plank' });
      out.joints.push(world.createJoint(new RevoluteJoint({ enableLimit: true, lowerAngle: -0.45, upperAngle: 0.45 }, pivot, plank, Vec2(x, y + 0.08))));
      break;
    }
    case 'pulley': {
      const gA = Vec2(x - 1, y), gB = Vec2(x + 1, y);
      const mk = (px, drop) => {
        const b = add(world.createDynamicBody({ position: Vec2(px, y - drop), fixedRotation: true }));
        b.createFixture(Box(0.55, 0.07), { density: 1.5, friction: 0.6 });
        b.createFixture(Box(0.06, 0.2, Vec2(-0.5, 0.2), 0), { density: 0.5 });
        b.createFixture(Box(0.06, 0.2, Vec2(0.5, 0.2), 0), { density: 0.5 });
        b.setUserData({ part, role: 'platform' });
        // keep each platform on its vertical track, with travel limits so no side reaches length 0
        out.joints.push(world.createJoint(new PrismaticJoint({ enableLimit: true, lowerTranslation: -1.6, upperTranslation: 1.6 }, ground, b, b.getPosition(), Vec2(0, 1))));
        return b;
      };
      const A = mk(x - 1, 2.2), B = mk(x + 1, 2.2);
      out.joints.push(world.createJoint(new PulleyJoint({}, A, B, gA, gB, A.getPosition(), B.getPosition(), 1)));
      const wheels = add(world.createBody({ type: 'static', position: Vec2(x, y) }));
      wheels.createFixture(Circle(Vec2(-1, 0), 0.16), { isSensor: true });
      wheels.createFixture(Circle(Vec2(1, 0), 0.16), { isSensor: true });
      wheels.setUserData({ part, role: 'wheels' });
      break;
    }
    case 'fan': {
      const b = add(staticBox(world, part, 0.25, 0.3, 'fan-base'));
      b.createFixture(Box(2.2, 0.35, Vec2(2.45, 0), 0), { isSensor: true, userData: 'fan' });
      break;
    }
    case 'portal': {
      const b = add(world.createBody({ type: 'static', position: Vec2(x, y), angle: part.angle }));
      b.createFixture(Circle(0.36), { isSensor: true, userData: 'portal' });
      b.setUserData({ part, role: 'portal' });
      break;
    }
    case 'dominoes': {
      for (let i = 0; i < 6; i++) {
        const c = Math.cos(part.angle), s = Math.sin(part.angle), d = i * 0.42 - 1.05;
        const b = add(world.createDynamicBody({ position: Vec2(x + c * d - s * 0.4, y + s * d + c * 0.4), angle: part.angle }));
        b.createFixture(Box(0.05, 0.4), { density: 1, friction: 0.6, restitution: 0 });
        b.setUserData({ part, role: 'domino' });
      }
      break;
    }
    case 'cup': {
      const b = add(world.createBody({ type: 'static', position: Vec2(x, y), angle: part.angle }));
      b.createFixture(Box(0.85, 0.06, Vec2(0, 0), 0), { friction: 0.8, restitution: 0 });
      b.createFixture(Box(0.06, 0.45, Vec2(-0.88, 0.4), 10 * DEG), { friction: 0.6, restitution: 0 });
      b.createFixture(Box(0.06, 0.45, Vec2(0.88, 0.4), -10 * DEG), { friction: 0.6, restitution: 0 });
      b.createFixture(Box(0.75, 0.32, Vec2(0, 0.38), 0), { isSensor: true, userData: 'cup' });
      b.setUserData({ part, role: 'cup' });
      break;
    }
    case 'spawner': {
      const b = add(world.createBody({ type: 'static', position: Vec2(x, y), angle: part.angle }));
      b.createFixture(Circle(0.3), { isSensor: true });
      b.setUserData({ part, role: 'spawner' });
      break;
    }
    case 'bumper': {
      const b = add(world.createBody({ type: 'static', position: Vec2(x, y) }));
      b.createFixture(Circle(0.35), { restitution: 0, friction: 0 });
      b.setUserData({ part, role: 'bumper' });
      break;
    }
    case 'windmill': {
      const hub = add(world.createBody({ type: 'static', position: Vec2(x, y) }));
      hub.createFixture(Circle(0.08), { isSensor: true });
      hub.setUserData({ part, role: 'pivot' });
      const rotor = add(world.createDynamicBody({ position: Vec2(x, y), angle: part.angle }));
      for (let k = 0; k < 4; k++) rotor.createFixture(Box(0.75, 0.05, Vec2(Math.cos(k * Math.PI / 2) * 0.75, Math.sin(k * Math.PI / 2) * 0.75), k * Math.PI / 2), { density: 1, friction: 0.4 });
      rotor.setUserData({ part, role: 'rotor' });
      out.joints.push(world.createJoint(new RevoluteJoint({ enableMotor: true, motorSpeed: part.speed ?? -2.5, maxMotorTorque: 40 }, hub, rotor, Vec2(x, y))));
      break;
    }
    case 'antigrav': {
      const b = add(world.createBody({ type: 'static', position: Vec2(x, y), angle: part.angle }));
      b.createFixture(Box(0.6, 1.5, Vec2(0, 1.5), 0), { isSensor: true, userData: 'antigrav' });
      b.setUserData({ part, role: 'antigrav' });
      break;
    }
  }
  return out;
}

export function makeMarble(world, x, y, vx = 0, vy = 0) {
  const b = world.createDynamicBody({ position: Vec2(x, y), bullet: true, angularDamping: 0.05 });
  b.createFixture(Circle(MARBLE_R), { density: 2, friction: 0.1, restitution: 0.35 });
  b.setLinearVelocity(Vec2(vx, vy));
  const hue = Math.floor(Math.random() * 360);
  b.setUserData({ role: 'marble', color: `hsl(${hue},85%,68%)`, hue, born: performance.now(), trail: new Float32Array(24), ti: 0, tn: 0, squash: 0 });
  return b;
}

// ── hit testing (world units) ─────────────────────────────────────────
function segDist(px, py, x, y, angle, half) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const dx = px - x, dy = py - y;
  const t = Math.max(-half, Math.min(half, dx * c + dy * s));
  return Math.hypot(dx - t * c, dy - t * s);
}
export function hitPart(part, px, py) {
  switch (part.type) {
    case 'ramp': case 'trampoline': case 'conveyor': case 'boost': return segDist(px, py, part.x, part.y, part.angle, part.len / 2) - 0.3;
    case 'seesaw': return Math.hypot(px - part.x, py - (part.y - 0.25)) - 0.5;
    case 'pulley': return Math.hypot(px - part.x, py - part.y) - 0.6;
    case 'dominoes': return Math.hypot(px - part.x, py - (part.y + 0.4)) - 1.2;
    case 'fan': return Math.hypot(px - part.x, py - part.y) - 0.45;
    case 'windmill': return Math.hypot(px - part.x, py - part.y) - 0.9;
    case 'antigrav': return Math.hypot(px - part.x, py - (part.y + 1.5)) - 0.9;
    case 'cup': return Math.hypot(px - part.x, py - (part.y + 0.3)) - 0.9;
    default: return Math.hypot(px - part.x, py - part.y) - 0.45;
  }
}

// ── drawing (called with the canvas already in world units, y up) ─────
const rrect = (g, x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };

export function drawPart(g, part, built, t, ghost = false) {
  g.save();
  if (ghost) g.globalAlpha = 0.45;
  const at = (body, fn) => {
    g.save();
    const p = body ? body.getPosition() : { x: part.x, y: part.y };
    g.translate(p.x, p.y); g.rotate(body ? body.getAngle() : part.angle);
    fn(); g.restore();
  };
  const b0 = !ghost && built?.bodies[0];
  switch (part.type) {
    case 'ramp':
      at(b0, () => { g.fillStyle = C.ramp; rrect(g, -part.len / 2, -0.07, part.len, 0.14, 0.07); g.fill(); });
      break;
    case 'trampoline':
      at(b0, () => {
        const squash = part.squash || 0;
        g.strokeStyle = 'rgba(124,227,177,0.6)'; g.lineWidth = 0.035;
        for (const sx of [-part.len / 2 + 0.15, part.len / 2 - 0.15]) {
          g.beginPath(); g.moveTo(sx, -0.08);
          for (let k = 1; k <= 4; k++) g.lineTo(sx + (k % 2 ? 0.08 : -0.08), -0.08 - k * 0.07);
          g.stroke();
        }
        g.fillStyle = C.tramp; rrect(g, -part.len / 2, -0.08 - squash * 0.1, part.len, 0.16, 0.08); g.fill();
      });
      break;
    case 'boost':
      at(b0, () => {
        g.fillStyle = 'rgba(255,181,71,0.14)'; rrect(g, -part.len / 2, 0, part.len, 0.6, 0.12); g.fill();
        g.fillStyle = C.boost; rrect(g, -part.len / 2, -0.06, part.len, 0.12, 0.06); g.fill();
        g.strokeStyle = C.boost; g.lineWidth = 0.05; g.lineCap = g.lineJoin = 'round';
        const n = Math.max(2, Math.round(part.len / 0.35)), phase = (t * 1.5) % 1;
        for (let k = 0; k < n; k++) {
          const cx = -part.len / 2 + ((k + phase) / n) * part.len;
          g.globalAlpha = (ghost ? 0.45 : 1) * Math.sin(((k + phase) / n) * Math.PI);
          g.beginPath(); g.moveTo(cx - 0.08, 0.14); g.lineTo(cx + 0.06, 0.3); g.lineTo(cx - 0.08, 0.46); g.stroke();
        }
      });
      break;
    case 'conveyor':
      at(b0, () => {
        g.fillStyle = C.conveyor; rrect(g, -part.len / 2, -0.12, part.len, 0.24, 0.12); g.fill();
        g.strokeStyle = 'rgba(14,15,18,0.55)'; g.lineWidth = 0.04; g.setLineDash([0.12, 0.14]);
        g.lineDashOffset = -t * (part.speed ?? 3);
        g.beginPath(); g.moveTo(-part.len / 2 + 0.12, 0); g.lineTo(part.len / 2 - 0.12, 0); g.stroke();
      });
      break;
    case 'seesaw': {
      at(null, () => { g.rotate(-part.angle); g.fillStyle = C.pivot; g.beginPath(); g.moveTo(-0.3, -0.45); g.lineTo(0.3, -0.45); g.lineTo(0, 0); g.closePath(); g.fill(); });
      const plank = !ghost && built?.bodies[1];
      g.save();
      if (plank) { const p = plank.getPosition(); g.translate(p.x, p.y); g.rotate(plank.getAngle()); }
      else { g.translate(part.x, part.y + 0.08); g.rotate(part.angle); }
      g.fillStyle = C.wood; rrect(g, -1.6, -0.07, 3.2, 0.14, 0.07); g.fill();
      g.restore();
      break;
    }
    case 'pulley': {
      const A = !ghost && built?.bodies[0], B = !ghost && built?.bodies[1];
      const pa = A ? A.getPosition() : { x: part.x - 1, y: part.y - 2.2 };
      const pb = B ? B.getPosition() : { x: part.x + 1, y: part.y - 2.2 };
      g.strokeStyle = C.rope; g.lineWidth = 0.03;
      g.beginPath();
      g.moveTo(pa.x, pa.y + 0.4); g.lineTo(part.x - 1, part.y);
      g.moveTo(part.x - 1, part.y + 0.16); g.lineTo(part.x + 1, part.y + 0.16);
      g.moveTo(part.x + 1, part.y); g.lineTo(pb.x, pb.y + 0.4);
      g.stroke();
      for (const wx of [-1, 1]) {
        g.fillStyle = C.pivot; g.beginPath(); g.arc(part.x + wx, part.y, 0.16, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#16181D'; g.beginPath(); g.arc(part.x + wx, part.y, 0.05, 0, Math.PI * 2); g.fill();
      }
      g.strokeStyle = C.rope; g.lineWidth = 0.025;
      for (const p of [pa, pb]) {
        g.beginPath(); g.moveTo(p.x, p.y + 0.4); g.lineTo(p.x - 0.5, p.y + 0.4); g.moveTo(p.x, p.y + 0.4); g.lineTo(p.x + 0.5, p.y + 0.4); g.stroke();
        g.fillStyle = C.wood;
        rrect(g, p.x - 0.55, p.y - 0.07, 1.1, 0.14, 0.05); g.fill();
        rrect(g, p.x - 0.56, p.y - 0.02, 0.12, 0.42, 0.04); g.fill();
        rrect(g, p.x + 0.44, p.y - 0.02, 0.12, 0.42, 0.04); g.fill();
      }
      break;
    }
    case 'fan':
      at(null, () => {
        g.fillStyle = C.fan; rrect(g, -0.25, -0.3, 0.5, 0.6, 0.12); g.fill();
        g.strokeStyle = 'rgba(154,215,255,0.35)'; g.lineWidth = 0.03; g.lineCap = 'round';
        for (let k = 0; k < 5; k++) {
          const off = ((t * 2.5 + k * 0.37) % 1) * 4.2 + 0.4, yy = -0.24 + (k % 5) * 0.12;
          g.globalAlpha = (ghost ? 0.45 : 1) * (1 - off / 4.8);
          g.beginPath(); g.moveTo(off, yy); g.lineTo(off + 0.5, yy); g.stroke();
        }
      });
      break;
    case 'portal':
      at(null, () => {
        const col = part.side === 'B' ? C.portalB : C.portalA;
        const pulse = 1 + Math.sin(t * 4) * 0.04;
        g.strokeStyle = col; g.lineWidth = 0.07;
        g.beginPath(); g.ellipse(0, 0, 0.36 * pulse, 0.36 * pulse, 0, 0, Math.PI * 2); g.stroke();
        g.globalAlpha *= 0.25; g.fillStyle = col; g.beginPath(); g.arc(0, 0, 0.3, 0, Math.PI * 2); g.fill();
        g.globalAlpha = ghost ? 0.45 : 1;
        g.strokeStyle = col; g.lineWidth = 0.05; g.lineCap = 'round';
        g.beginPath(); g.moveTo(0.1, 0.12); g.lineTo(0.24, 0); g.lineTo(0.1, -0.12); g.stroke();
      });
      break;
    case 'dominoes':
      if (!ghost && built) {
        for (const b of built.bodies) at(b, () => { g.fillStyle = C.domino; rrect(g, -0.05, -0.4, 0.1, 0.8, 0.04); g.fill(); });
      } else {
        at(null, () => { g.fillStyle = C.domino; for (let i = 0; i < 6; i++) { rrect(g, i * 0.42 - 1.1, 0, 0.1, 0.8, 0.04); g.fill(); } });
      }
      break;
    case 'cup':
      at(null, () => {
        const glow = part.glow || 0;
        if (glow > 0.01) { g.fillStyle = `rgba(124,227,177,${0.25 * glow})`; rrect(g, -0.85, 0, 1.7, 0.8, 0.12); g.fill(); }
        g.strokeStyle = C.cup; g.lineWidth = 0.1; g.lineCap = g.lineJoin = 'round';
        g.beginPath(); g.moveTo(-0.96, 0.84); g.lineTo(-0.82, 0); g.lineTo(0.82, 0); g.lineTo(0.96, 0.84); g.stroke();
      });
      break;
    case 'bumper':
      at(null, () => {
        const glow = part.glow || 0, r = 0.35 * (1 + 0.25 * glow);
        g.fillStyle = `rgba(255,143,163,${0.25 + 0.5 * glow})`; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#FF8FA3'; g.lineWidth = 0.07; g.stroke();
        g.fillStyle = '#FFD0D9'; g.beginPath(); g.arc(0, 0, 0.12, 0, Math.PI * 2); g.fill();
      });
      break;
    case 'windmill': {
      const rotor = !ghost && built?.bodies[1];
      g.save();
      if (rotor) { const p = rotor.getPosition(); g.translate(p.x, p.y); g.rotate(rotor.getAngle()); }
      else { g.translate(part.x, part.y); g.rotate(part.angle + t); }
      g.fillStyle = '#9AD7FF';
      for (let k = 0; k < 4; k++) { g.save(); g.rotate(k * Math.PI / 2); rrect(g, 0.05, -0.05, 1.45, 0.1, 0.05); g.fill(); g.restore(); }
      g.restore();
      g.fillStyle = C.pivot; g.beginPath(); g.arc(part.x, part.y, 0.14, 0, Math.PI * 2); g.fill();
      break;
    }
    case 'antigrav':
      at(null, () => {
        g.fillStyle = 'rgba(182,156,255,0.10)'; rrect(g, -0.6, 0, 1.2, 3, 0.2); g.fill();
        g.strokeStyle = 'rgba(182,156,255,0.8)'; g.lineWidth = 0.05; g.lineCap = g.lineJoin = 'round';
        for (let k = 0; k < 4; k++) {
          const yy = ((t * 0.8 + k / 4) % 1) * 2.6 + 0.2;
          g.globalAlpha = (ghost ? 0.45 : 1) * Math.sin(((yy - 0.2) / 2.6) * Math.PI);
          g.beginPath(); g.moveTo(-0.2, yy - 0.1); g.lineTo(0, yy + 0.08); g.lineTo(0.2, yy - 0.1); g.stroke();
        }
      });
      break;
    case 'spawner':
      at(null, () => {
        g.strokeStyle = C.spawner; g.lineWidth = 0.05;
        g.beginPath(); g.arc(0, 0, 0.3, 0, Math.PI * 2); g.stroke();
        const k = part.charge ?? 0;
        g.fillStyle = 'rgba(244,245,247,0.8)'; g.beginPath(); g.arc(0, 0, 0.22 * k, 0, Math.PI * 2); g.fill();
        g.lineCap = 'round'; g.beginPath(); g.moveTo(0.38, 0); g.lineTo(0.55, 0); g.moveTo(0.48, 0.08); g.lineTo(0.56, 0); g.lineTo(0.48, -0.08); g.stroke();
      });
      break;
  }
  g.restore();
}

export function drawTrail(g, b) {
  const u = b.getUserData();
  if (!u.tn || u.tn < 2) return;
  const pts = [];
  for (let k = 0; k < u.tn; k++) { const i = (u.ti - 1 - k + 12) % 12; pts.push([u.trail[i * 2], u.trail[i * 2 + 1]]); }
  const p = b.getPosition();
  pts.unshift([p.x, p.y]);
  g.strokeStyle = `hsla(${u.hue},90%,70%,0.35)`; g.lineCap = g.lineJoin = 'round';
  for (const [from, to, w] of [[0, 4, 0.16], [4, 8, 0.1], [8, 13, 0.05]]) {
    if (pts.length <= from + 1) break;
    g.lineWidth = w; g.beginPath(); g.moveTo(...pts[from]);
    for (let k = from + 1; k < Math.min(to + 1, pts.length); k++) g.lineTo(...pts[k]);
    g.stroke();
  }
}

export function drawMarble(g, b) {
  const p = b.getPosition(), u = b.getUserData();
  g.fillStyle = u.color;
  g.save();
  if (u.fade != null) { g.globalAlpha *= Math.max(0, u.fade); }
  if (u.squash > 0.01) {
    const v = b.getLinearVelocity(), a = Math.atan2(v.y, v.x);
    g.translate(p.x, p.y); g.rotate(a); g.scale(1 + u.squash, 1 - u.squash); g.rotate(-a); g.translate(-p.x, -p.y);
  }
  g.beginPath(); g.arc(p.x, p.y, MARBLE_R, 0, Math.PI * 2); g.fill();
  g.restore();
  g.fillStyle = 'rgba(255,255,255,0.7)';
  g.beginPath(); g.ellipse(p.x - 0.06, p.y + 0.07, 0.06, 0.035, 0.6, 0, Math.PI * 2); g.fill();
}

// Tile icons for the tray (screen px, drawn centred at 0,0 inside a ~44 px box).
export function drawIcon(g, type) {
  g.save(); g.scale(14, -14); g.lineCap = g.lineJoin = 'round';
  const fake = { type, x: 0, y: 0, angle: 0, len: 2.4, side: 'A' };
  switch (type) {
    case 'marble': g.fillStyle = 'hsl(200,85%,68%)'; g.beginPath(); g.arc(0, 0, 0.55, 0, Math.PI * 2); g.fill(); break;
    case 'ramp': fake.angle = 0.45; fake.len = 2.6; drawPart(g, fake, null, 0); break;
    case 'trampoline': fake.len = 2; drawPart(g, { ...fake, y: 0.2 }, null, 0); break;
    case 'boost': fake.len = 1.8; drawPart(g, { ...fake, y: -0.3 }, null, 0.3); break;
    case 'conveyor': drawPart(g, fake, null, 0); break;
    case 'seesaw': g.scale(0.7, 0.7); drawPart(g, { ...fake, y: 0.2, angle: 0.25 }, null, 0); break;
    case 'pulley': g.scale(0.55, 0.55); drawPart(g, { ...fake, y: 1.2 }, null, 0); break;
    case 'fan': g.scale(0.5, 0.5); drawPart(g, { ...fake, x: -1.4 }, null, 0.4); break;
    case 'portal': g.scale(1.3, 1.3); drawPart(g, fake, null, 0); break;
    case 'dominoes': g.scale(0.7, 0.7); drawPart(g, { ...fake, y: -0.4 }, null, 0); break;
    case 'cup': drawPart(g, { ...fake, y: -0.4 }, null, 0); break;
    case 'spawner': g.scale(1.3, 1.3); drawPart(g, { ...fake, charge: 0.6 }, null, 0); break;
    case 'bumper': g.scale(1.4, 1.4); drawPart(g, fake, null, 0); break;
    case 'windmill': g.scale(0.55, 0.55); drawPart(g, fake, null, 0.3); break;
    case 'antigrav': g.scale(0.45, 0.45); drawPart(g, { ...fake, y: -1.5 }, null, 0.2); break;
  }
  g.restore();
}
