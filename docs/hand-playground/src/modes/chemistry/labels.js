// Recognizes each molecule once it has settled (nothing held, unchanged for settleMs)
// and keeps a floating pill above it. Discoveries persist per browser.
import { recognize, ENTRIES } from './chem/recognize.js';
import { ELEMENTS, defaultValence } from './chem/elements.js';

// If capping every open bond with hydrogen would make a known molecule, say so ("+2 H · Ethanol").
function hydrogenHint(graph) {
  const sum = graph.atoms.map(() => 0);
  for (const { a, b, order } of graph.bonds) { sum[a] += order; sum[b] += order; }
  const atoms = [...graph.atoms], bonds = [...graph.bonds];
  let n = 0;
  graph.atoms.forEach((at, i) => {
    if (at.el === 'H') return;
    for (let k = defaultValence(at.el) - sum[i]; k > 0; k--) { bonds.push({ a: i, b: atoms.push({ el: 'H' }) - 1, order: 1 }); n++; }
  });
  if (!n || n > 12) return null;
  const res = recognize({ atoms, bonds });
  return res?.kind === 'known' ? { kind: 'hint', n, entry: res.entry } : null;
}
import { CONFIG } from './config.js';

const STORE = 'mh-discovered';

export class Labels {
  constructor(onResult) {
    this.onResult = onResult;     // (result, isNew, atomIds) — fires once per settled component
    this.first = new Map();       // component key → first seen (ms)
    this.cache = new Map();       // component key → recognize() result
    this.pills = new Map();       // component key → { x, y, alpha, text, sub, kind }
    this.known = new Set();       // atom ids that belong to a recognized molecule
    this.discovered = new Set();
    try { JSON.parse(localStorage.getItem(STORE) || '[]').forEach((id) => this.discovered.add(id)); } catch {}
  }

  get total() { return ENTRIES.length; }

  update(scene, now) {
    const seen = new Set();
    this.known.clear();
    // components + their keys only change when the topology does (scene.version)
    if (this.version !== scene.version) {
      this.version = scene.version;
      const byAtom = new Map();
      const comps = scene.components().filter((ids) => ids.length >= 2).map((ids) => ids.sort((a, b) => a - b));
      comps.forEach((ids, ci) => ids.forEach((id) => byAtom.set(id, ci)));
      const bondKeys = comps.map(() => []);
      for (const b of scene.bonds) bondKeys[byAtom.get(b.a)]?.push(`${Math.min(b.a, b.b)}-${Math.max(b.a, b.b)}:${b.order}`);
      this.comps = comps.map((ids, ci) => ({ ids, key: ids.join(',') + '|' + bondKeys[ci].sort().join(',') }));
    }
    for (const { ids, key } of this.comps) {
      seen.add(key);
      if (!this.first.has(key)) this.first.set(key, now);
      const atoms = ids.map((id) => scene.atoms.get(id));
      const held = atoms.some((a) => a.pinned);

      if (!this.cache.has(key) && !held && now - this.first.get(key) >= CONFIG.settleMs) {
        const graph = scene.graphOf(ids);
        const res = recognize(graph) || hydrogenHint(graph);
        this.cache.set(key, res);
        if (res && res.kind !== 'hint') {
          const isNew = res.kind === 'known' && !this.discovered.has(res.entry.id);
          if (isNew) this.remember(res.entry.id);
          this.onResult(res, isNew, ids);
        }
      }
      const res = this.cache.get(key);
      if (res?.kind === 'known') ids.forEach((id) => this.known.add(id));

      // Pill target: centred above the molecule.
      let minY = Infinity, sx = 0;
      for (const a of atoms) { minY = Math.min(minY, a.y - ELEMENTS[a.el].r); sx += a.x; }
      const tx = sx / atoms.length, ty = minY - 26;
      let pill = this.pills.get(key);
      if (!pill) { pill = { x: tx, y: ty, alpha: 0, born: now }; this.pills.set(key, pill); }
      pill.visible = !!res && !held;
      if (res) {
        pill.kind = res.kind;
        if (res.kind === 'hint') {
          pill.text = `+${res.n} H`;
          pill.sub = this.discovered.has(res.entry.id) ? res.entry.name : '???';
        } else {
          pill.text = res.kind === 'known' ? res.entry.formula : res.formula;
          pill.sub = res.kind === 'known' ? res.entry.name : 'unknown molecule';
        }
      }
      pill.x += (tx - pill.x) * 0.25;
      pill.y += (ty - pill.y) * 0.25;
    }
    for (const [key, pill] of this.pills) {
      if (!seen.has(key)) pill.visible = false;
      pill.alpha += ((pill.visible ? 1 : 0) - pill.alpha) * 0.18;
      if (!seen.has(key) && pill.alpha < 0.02) this.pills.delete(key);
    }
    for (const key of this.first.keys()) if (!seen.has(key)) { this.first.delete(key); this.cache.delete(key); }
  }

  remember(id) {
    this.discovered.add(id);
    try { localStorage.setItem(STORE, JSON.stringify([...this.discovered])); } catch {}
  }
}
