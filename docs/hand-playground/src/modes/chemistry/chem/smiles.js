// Tiny SMILES reader for the molecule dictionary. Returns a graph with EXPLICIT hydrogens:
//   { atoms: [{ el }], bonds: [{ a, b, order }] }
// Supports: organic subset (B C N O P S F Cl Br I), bracket atoms ([C-], [NH4+], [H]),
// bonds - = #, branches, ring closures (1-9, %nn). No aromatic lowercase — write Kekulé
// forms (C1=CC=CC=C1); graph.js normalizes alternating 6-rings so either Kekulé form matches.
import { ELEMENTS } from './elements.js';

const ORGANIC = ['Cl', 'Br', 'B', 'C', 'N', 'O', 'P', 'S', 'F', 'I'];
const BOND = { '-': 1, '=': 2, '#': 3 };

export function parseSmiles(smiles) {
  const atoms = [], bonds = [], explicitH = [];
  const ring = new Map();                 // digit -> { atom, order }
  const stack = [];
  let prev = -1, pendingOrder = 0, i = 0;

  const addAtom = (el, hCount) => {
    if (!ELEMENTS[el]) throw new Error(`unknown element ${el} in ${smiles}`);
    const idx = atoms.push({ el }) - 1;
    explicitH.push(hCount);               // null = implicit (organic subset)
    if (prev >= 0) bonds.push({ a: prev, b: idx, order: pendingOrder || 1 });
    prev = idx; pendingOrder = 0;
  };

  while (i < smiles.length) {
    const ch = smiles[i];
    if (ch in BOND) { pendingOrder = BOND[ch]; i++; continue; }
    if (ch === '(') { stack.push(prev); i++; continue; }
    if (ch === ')') { prev = stack.pop(); i++; continue; }
    if (ch === '[') {
      const end = smiles.indexOf(']', i);
      const m = /^([A-Z][a-z]?)(H(\d*))?([+-]+\d*)?$/.exec(smiles.slice(i + 1, end));
      if (!m) throw new Error(`bad bracket atom in ${smiles}`);
      addAtom(m[1], m[2] ? Number(m[3] || 1) : 0);
      i = end + 1; continue;
    }
    if (/[0-9%]/.test(ch)) {
      const d = ch === '%' ? smiles.slice(i + 1, i + 3) : ch;
      i += ch === '%' ? 3 : 1;
      if (ring.has(d)) {
        const open = ring.get(d); ring.delete(d);
        bonds.push({ a: open.atom, b: prev, order: pendingOrder || open.order || 1 });
        pendingOrder = 0;
      } else { ring.set(d, { atom: prev, order: pendingOrder }); pendingOrder = 0; }
      continue;
    }
    const sym = ORGANIC.find((s) => smiles.startsWith(s, i));
    if (!sym) throw new Error(`unsupported SMILES char "${ch}" in ${smiles} (use Kekulé form)`);
    addAtom(sym, null); i += sym.length;
  }
  if (ring.size) throw new Error(`unclosed ring in ${smiles}`);

  // Add hydrogens as real atoms.
  const sum = atoms.map(() => 0);
  for (const { a, b, order } of bonds) { sum[a] += order; sum[b] += order; }
  const heavy = atoms.length;
  for (let k = 0; k < heavy; k++) {
    let h = explicitH[k];
    if (h === null) {
      const v = ELEMENTS[atoms[k].el].valence.find((x) => x >= sum[k]);
      h = v === undefined ? 0 : v - sum[k];
    }
    for (let n = 0; n < h; n++) {
      const idx = atoms.push({ el: 'H' }) - 1;
      bonds.push({ a: k, b: idx, order: 1 });
    }
  }
  return { atoms, bonds };
}
