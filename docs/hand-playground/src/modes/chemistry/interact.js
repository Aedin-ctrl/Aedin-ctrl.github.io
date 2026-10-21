// Turns pointers (mouse or hands — same shape) into scene edits.
//   press on a tray well   → spawn that element into your grip
//   press on an atom       → grab it (rigidly locked to the cursor; neighbours follow on springs)
//   release near a partner → bond (a dashed "ghost" bond previews it)
//   quick tap on a bond    → cycle its order 1 → 2 → 3
//   yank / two-hand pull   → bond stretches past breakStretch → it snaps
//   release over the tray  → delete the atom
import { ELEMENTS } from './chem/elements.js';
import { CONFIG } from './config.js';

export function trayLayout(width, height, elements) {
  const r = 20, gap = 14, pad = 14;
  const h = elements.length * (2 * r + gap) - gap + pad * 2;
  const x = 16, y = Math.max(16, (height - h) / 2);
  return {
    x, y, w: 2 * r + pad * 2, h,
    wells: elements.map((el, i) => ({ el, r, x: x + pad + r, y: y + pad + r + i * (2 * r + gap) })),
  };
}

export class Interaction {
  constructor(scene, emit) {
    this.scene = scene;
    this.emit = emit;             // (type, payload) → sounds, undo snapshots, UI
    this.state = new Map();       // pointer id → { grab, ghost, tap, down, hover }
    this.cooldown = new Map();    // "a-b" → until (ms)
    this.stretch = new Map();     // bond → since (ms)
    this.tension = 0;             // 0..1, for the stretch sound
    this.tray = null;
  }

  atomAt(x, y, factor, exclude) {
    let best = null, bestD = Infinity;
    for (const a of this.scene.atoms.values()) {
      if (a.id === exclude) continue;
      const d = Math.hypot(a.x - x, a.y - y);
      if (d < ELEMENTS[a.el].r * factor && d < bestD) { best = a; bestD = d; }
    }
    return best;
  }

  bondAt(x, y, radius) {
    for (const b of this.scene.bonds) {
      const A = this.scene.atoms.get(b.a), B = this.scene.atoms.get(b.b);
      if (Math.hypot((A.x + B.x) / 2 - x, (A.y + B.y) / 2 - y) < radius) return b;
    }
    return null;
  }

  inTray(x, y) {
    const t = this.tray;
    return t && x > t.x - 8 && x < t.x + t.w + 8 && y > t.y - 8 && y < t.y + t.h + 8;
  }

  grabbedBy(atomId) {
    for (const [pid, st] of this.state) if (st.grab === atomId) return pid;
    return null;
  }

  update(pointers, now) {
    const scene = this.scene;
    const live = new Set();
    for (const p of pointers) {
      live.add(p.id);
      let st = this.state.get(p.id);
      if (!st) { st = { grab: null, ghost: null, tap: null, down: false, hover: null }; this.state.set(p.id, st); }
      const factor = CONFIG.grabRadius[p.kind === 'hand' ? 'hand' : 'mouse'];

      if (p.down && !st.down) this.press(p, st, factor, now);
      if (!p.down && st.down) this.release(p, st, now);
      st.down = p.down;

      const held = st.grab && scene.atoms.get(st.grab);
      if (held) {
        held.x = p.x; held.y = p.y; held.pinned = true;
        st.ghost = this.findPartner(held, now);
      } else {
        st.grab = null; st.ghost = null;
        st.hover = this.atomAt(p.x, p.y, factor)?.id ?? null;
      }
    }
    // Pointers that vanished (hand lost past its grace period) count as releases.
    for (const [id, st] of this.state) {
      if (live.has(id)) continue;
      if (st.down) this.release(null, st, now);
      this.state.delete(id);
    }
    this.checkBreaks(now);
  }

  press(p, st, factor, now) {
    const well = this.tray?.wells.find((w) => Math.hypot(w.x - p.x, w.y - p.y) < w.r * 1.5);
    if (well) {
      this.emit('change');
      const atom = this.scene.addAtom(well.el, p.x, p.y);
      st.grab = atom.id;
      this.emit('spawn', atom);
      return;
    }
    const atom = this.atomAt(p.x, p.y, factor);
    if (atom && !this.grabbedBy(atom.id)) {
      st.grab = atom.id;
      this.emit('grab', atom);
      return;
    }
    const bond = this.bondAt(p.x, p.y, CONFIG.bondTapRadius * (p.kind === 'hand' ? 1.8 : 1));
    if (bond) st.tap = { bond, t: now, x: p.x, y: p.y };
  }

  release(p, st, now) {
    const scene = this.scene;
    const atom = st.grab && scene.atoms.get(st.grab);
    if (atom) {
      atom.pinned = false;
      if (this.inTray(atom.x, atom.y)) {
        this.emit('change');
        scene.removeAtom(atom.id);
        this.emit('trash', atom);
      } else if (st.ghost && scene.atoms.has(st.ghost) && scene.canBond(atom.id, st.ghost)) {
        this.emit('change');
        scene.addBond(atom.id, st.ghost, 1);
        this.emit('bond', { order: 1, atom });
      } else {
        this.emit('release', atom);
      }
    }
    if (st.tap && p && now - st.tap.t < CONFIG.tapMaxMs &&
        Math.hypot(p.x - st.tap.x, p.y - st.tap.y) < CONFIG.tapMaxMove && scene.bonds.includes(st.tap.bond)) {
      const before = st.tap.bond.order;
      this.emit('change');
      const order = scene.cycleOrder(st.tap.bond);
      if (order !== before) this.emit('order', { order, bond: st.tap.bond });
      else this.emit('order-blocked', st.tap.bond);
    }
    st.grab = null; st.ghost = null; st.tap = null;
  }

  findPartner(held, now) {
    const scene = this.scene;
    if (scene.free(held.id) < 1) return null;
    let best = null, bestD = Infinity;
    for (const a of scene.atoms.values()) {
      if (a.id === held.id || !scene.canBond(held.id, a.id)) continue;
      if ((this.cooldown.get(pairKey(held.id, a.id)) || 0) > now) continue;
      const reach = (ELEMENTS[held.el].r + ELEMENTS[a.el].r) * CONFIG.joinRadius;
      const d = Math.hypot(a.x - held.x, a.y - held.y);
      if (d < reach && d < bestD) { best = a.id; bestD = d; }
    }
    return best;
  }

  checkBreaks(now) {
    const scene = this.scene;
    let tension = 0;
    for (const bond of [...scene.bonds]) {
      const A = scene.atoms.get(bond.a), B = scene.atoms.get(bond.b);
      if (!A.pinned && !B.pinned) { this.stretch.delete(bond); continue; }
      const ratio = Math.hypot(A.x - B.x, A.y - B.y) / scene.restLength(bond);
      tension = Math.max(tension, (ratio - 1) / (CONFIG.breakStretch - 1));
      if (ratio < CONFIG.breakStretch) { this.stretch.delete(bond); continue; }
      if (!this.stretch.has(bond)) this.stretch.set(bond, now);
      if (now - this.stretch.get(bond) >= CONFIG.breakHoldMs) {
        this.emit('change');
        scene.removeBond(bond);
        this.stretch.delete(bond);
        this.cooldown.set(pairKey(bond.a, bond.b), now + CONFIG.rejoinCooldownMs);
        this.emit('break', bond);
      }
    }
    this.tension = Math.max(0, Math.min(1, tension));
  }
}

const pairKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
