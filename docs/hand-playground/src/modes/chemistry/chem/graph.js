// Graph helpers: Hill formula, aromatic normalization, isomorphism (research/08 §5). Pure.
// Graph shape: { atoms: [{ el }], bonds: [{ a, b, order }] } with indices into atoms.
import { ELEMENTS } from './elements.js';

const SUB = '₀₁₂₃₄₅₆₇₈₉';
export const subscript = (s) => s.replace(/\d/g, (d) => SUB[d]);

// Hill order: C, then H, then alphabetical. Without C, everything alphabetical.
export function hill(atoms) {
  const c = {};
  for (const a of atoms) c[a.el] = (c[a.el] || 0) + 1;
  const ks = Object.keys(c).sort();
  const ord = c.C ? ['C', ...(c.H ? ['H'] : []), ...ks.filter((k) => k !== 'C' && k !== 'H')] : ks;
  return ord.map((k) => k + (c[k] > 1 ? c[k] : '')).join('');
}

function adj(g) {
  const m = g.atoms.map(() => new Map());
  for (const { a, b, order } of g.bonds) { m[a].set(b, order); m[b].set(a, order); }
  return m;
}

// Mark bonds of 6-rings whose orders alternate 1/2 as aromatic (1.5), so both Kekulé
// forms of benzene (and pyridine, toluene, meth …) compare equal. Returns a new graph.
// Limitation: fused aromatics (naphthalene) can differ between Kekulé forms.
export function normalizeAromatic(g) {
  const A = adj(g);
  const heavy = g.atoms.map((a, i) => (a.el !== 'H' ? i : -1)).filter((i) => i >= 0);
  const key = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
  const aromatic = new Set();
  const path = [];
  const onPath = new Set();
  const dfs = (start, cur, depth) => {
    for (const nxt of A[cur].keys()) {
      if (g.atoms[nxt].el === 'H') continue;
      if (nxt === start && depth === 6) {
        const cyc = [...path];
        const orders = cyc.map((v, i) => A[v].get(cyc[(i + 1) % 6]));
        const alt = orders.every((o, i) => o === (i % 2 ? orders[1] : orders[0]));
        if (alt && orders[0] + orders[1] === 3) cyc.forEach((v, i) => aromatic.add(key(v, cyc[(i + 1) % 6])));
        continue;
      }
      if (depth >= 6 || onPath.has(nxt) || nxt < start) continue;   // start = smallest index in cycle
      path.push(nxt); onPath.add(nxt);
      dfs(start, nxt, depth + 1);
      path.pop(); onPath.delete(nxt);
    }
  };
  for (const s of heavy) { path.length = 0; onPath.clear(); path.push(s); onPath.add(s); dfs(s, s, 1); }
  if (!aromatic.size) return g;
  return {
    atoms: g.atoms,
    bonds: g.bonds.map((b) => (aromatic.has(key(b.a, b.b)) ? { ...b, order: 1.5 } : b)),
  };
}

const sig = (g, A, i) => {
  let s = 0;
  for (const o of A[i].values()) s += o;
  return `${g.atoms[i].el}${A[i].size}:${s}`;          // element + degree + bond-order sum
};

// Exact isomorphism including bond orders. Both graphs must be single connected components.
export function isomorphic(g, h) {
  const n = g.atoms.length;
  if (n !== h.atoms.length || g.bonds.length !== h.bonds.length) return false;
  const A = adj(g), B = adj(h);
  const sg = g.atoms.map((_, i) => sig(g, A, i)), sh = h.atoms.map((_, i) => sig(h, B, i));
  if ([...sg].sort().join() !== [...sh].sort().join()) return false;
  const ord = [], seen = new Set([0]);                   // BFS order: each atom after the first has a mapped neighbour
  for (const q = [0]; q.length;) {
    const i = q.shift(); ord.push(i);
    for (const j of A[i].keys()) if (!seen.has(j)) { seen.add(j); q.push(j); }
  }
  if (ord.length !== n) return false;
  const map = new Array(n).fill(-1), used = new Array(n).fill(false);
  let budget = 200000;                                   // guard against pathological symmetric graphs
  const ok = (i, k) => {
    if (sg[i] !== sh[k]) return false;
    for (const [j, o] of A[i]) if (map[j] >= 0 && B[k].get(map[j]) !== o) return false;
    return true;
  };
  const go = (d) => {
    if (d === n) return true;
    if (--budget < 0) return false;
    const i = ord[d];
    for (let k = 0; k < n; k++) {
      if (used[k] || !ok(i, k)) continue;
      map[i] = k; used[k] = true;
      if (go(d + 1)) return true;
      map[i] = -1; used[k] = false;
    }
    return false;
  };
  return go(0);
}

// Every atom sits at one of its normal valences (e.g. C = 4, O = 2) → a closed-shell molecule.
export function isSaturated(g) {
  const sum = g.atoms.map(() => 0);
  for (const { a, b, order } of g.bonds) { sum[a] += order; sum[b] += order; }
  return g.atoms.every((at, i) => ELEMENTS[at.el].valence.some((v) => Math.abs(v - sum[i]) < 0.01));
}
