// Dictionary lookup: Hill-formula bucket, then exact isomorphism (bond orders included).
import { parseSmiles } from './smiles.js';
import { hill, subscript, normalizeAromatic, isomorphic, isSaturated } from './graph.js';
import { MOLECULES } from './molecules.js';

export const ENTRIES = MOLECULES.map((m) => {
  const graph = normalizeAromatic(parseSmiles(m.smiles));
  const h = hill(graph.atoms);
  return { ...m, graph, hill: h, formula: m.formula || subscript(h), atomCount: graph.atoms.length };
});

const index = new Map();
for (const e of ENTRIES) {
  if (!index.has(e.hill)) index.set(e.hill, []);
  index.get(e.hill).push(e);
}

export const MAX_ATOMS = Math.max(...ENTRIES.map((e) => e.atomCount)) + 10;

// comp: { atoms: [{ el }], bonds: [{ a, b, order }] } — one connected component.
// → { kind: 'known', entry } | { kind: 'valid', formula } | null
export function recognize(comp) {
  if (comp.atoms.length < 2 || comp.atoms.length > MAX_ATOMS) return null;
  const g = normalizeAromatic(comp);
  const h = hill(g.atoms);
  const entry = (index.get(h) || []).find((e) => isomorphic(g, e.graph));
  if (entry) return { kind: 'known', entry };
  if (isSaturated(g)) return { kind: 'valid', formula: subscript(h) };
  return null;
}
