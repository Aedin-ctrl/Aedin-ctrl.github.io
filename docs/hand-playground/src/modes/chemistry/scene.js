// Atoms and bonds on screen. Pure model: no DOM, no drawing.
import { ELEMENTS, defaultValence, maxBonds } from './chem/elements.js';
import { CONFIG } from './config.js';

export class Scene {
  constructor() {
    this.atoms = new Map();       // id -> { id, el, x, y, vx, vy, pinned }
    this.bonds = [];              // { a, b, order } (atom ids)
    this.nextId = 1;
    this.version = 0;             // bumps on every topology change
  }

  addAtom(el, x, y) {
    const atom = { id: this.nextId++, el, x, y, vx: 0, vy: 0, pinned: false };
    this.atoms.set(atom.id, atom);
    this.version++;
    return atom;
  }

  removeAtom(id) {
    this.atoms.delete(id);
    this.bonds = this.bonds.filter((b) => b.a !== id && b.b !== id);
    this.version++;
  }

  bondBetween(a, b) {
    return this.bonds.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
  }
  bondsOf(id) { return this.bonds.filter((b) => b.a === id || b.b === id); }
  neighbours(id) { return this.bondsOf(id).map((b) => (b.a === id ? b.b : b.a)); }
  used(id) { return this.bondsOf(id).reduce((s, b) => s + b.order, 0); }
  free(id) { return maxBonds(this.atoms.get(id).el) - this.used(id); }
  openValence(id) { return Math.max(0, defaultValence(this.atoms.get(id).el) - this.used(id)); }

  canBond(a, b) {
    return a !== b && !this.bondBetween(a, b) && this.free(a) >= 1 && this.free(b) >= 1;
  }
  addBond(a, b, order = 1) {
    const bond = { a, b, order };
    this.bonds.push(bond);
    this.version++;
    return bond;
  }
  removeBond(bond) {
    this.bonds = this.bonds.filter((x) => x !== bond);
    this.version++;
  }

  // 1 → 2 → 3 → 1, skipping orders either atom can't hold. Returns the new order.
  cycleOrder(bond) {
    for (const next of [bond.order + 1, bond.order + 2, bond.order + 3]) {
      const order = ((next - 1) % 3) + 1;
      const extra = order - bond.order;
      if (order === bond.order) return order;
      if (extra <= 0 || (this.free(bond.a) >= extra && this.free(bond.b) >= extra)) {
        bond.order = order;
        this.version++;
        return order;
      }
    }
    return bond.order;
  }

  restLength(bond) {
    const ra = ELEMENTS[this.atoms.get(bond.a).el].r, rb = ELEMENTS[this.atoms.get(bond.b).el].r;
    return ra + rb + CONFIG.bondGap + (bond.order - 1) * -2;
  }

  // Connected components as arrays of atom ids.
  components() {
    const parent = new Map([...this.atoms.keys()].map((id) => [id, id]));
    const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
    for (const { a, b } of this.bonds) parent.set(find(a), find(b));
    const groups = new Map();
    for (const id of this.atoms.keys()) {
      const r = find(id);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r).push(id);
    }
    return [...groups.values()];
  }

  // Index-based graph for recognition.
  graphOf(ids) {
    const idx = new Map(ids.map((id, i) => [id, i]));
    return {
      atoms: ids.map((id) => ({ el: this.atoms.get(id).el })),
      bonds: this.bonds.filter((b) => idx.has(b.a)).map((b) => ({ a: idx.get(b.a), b: idx.get(b.b), order: b.order })),
    };
  }

  // Cap every open valence with hydrogen, placed in the widest free gaps.
  fillHydrogens() {
    let added = 0;
    for (const atom of [...this.atoms.values()]) {
      if (atom.el === 'H') continue;
      for (let n = this.openValence(atom.id); n > 0; n--) {
        const ang = freeAngle(this, atom);
        const L = ELEMENTS[atom.el].r + ELEMENTS.H.r + CONFIG.bondGap;
        const h = this.addAtom('H', atom.x + Math.cos(ang) * L, atom.y + Math.sin(ang) * L);
        this.addBond(atom.id, h.id);
        added++;
      }
    }
    return added;
  }

  snapshot() {
    return JSON.stringify({ atoms: [...this.atoms.values()], bonds: this.bonds, nextId: this.nextId });
  }
  restore(json) {
    const s = JSON.parse(json);
    this.atoms = new Map(s.atoms.map((a) => [a.id, { ...a, pinned: false, vx: 0, vy: 0 }]));
    this.bonds = s.bonds;
    this.nextId = s.nextId;
    this.version++;
  }
}

// Direction (radians) around an atom furthest from its existing bonds.
export function freeAngle(scene, atom) {
  const taken = scene.neighbours(atom.id).map((id) => {
    const n = scene.atoms.get(id);
    return Math.atan2(n.y - atom.y, n.x - atom.x);
  });
  if (!taken.length) return -Math.PI / 2;
  let best = 0, bestGap = -1;
  for (let k = 0; k < 72; k++) {
    const a = (k / 72) * Math.PI * 2;
    const gap = Math.min(...taken.map((t) => Math.abs(Math.atan2(Math.sin(a - t), Math.cos(a - t)))));
    if (gap > bestGap + 1e-6) { bestGap = gap; best = a; }
  }
  return best;
}
