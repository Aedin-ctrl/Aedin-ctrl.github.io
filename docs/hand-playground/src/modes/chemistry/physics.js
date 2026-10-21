// 2D spring layout (research/12 §1.4): bond springs + angle springs + short-range repulsion.
// Pinned (grabbed) atoms stay under the cursor; everything else relaxes around them.
import { CONFIG } from './config.js';

const DEG = Math.PI / 180;

function idealAngle(el, bonds) {
  const k = bonds.length;
  if (k === 2) {
    const doubles = bonds.filter((b) => b.order === 2).length;
    const linear = (el === 'C' || el === 'N') && (bonds.some((b) => b.order === 3) || doubles === 2);
    if (linear) return Math.PI;
    return el === 'O' || el === 'S' ? 104.5 * DEG : 120 * DEG;
  }
  return (2 * Math.PI) / Math.max(k, 3);
}

export function relax(scene, width, height) {
  const atoms = [...scene.atoms.values()];
  const n = atoms.length;
  if (!n) return;
  const index = new Map(atoms.map((a, i) => [a.id, i]));
  const bonds = scene.bonds.map((b) => ({ i: index.get(b.a), j: index.get(b.b), L: scene.restLength(b), bond: b }));
  const nb = atoms.map(() => []);
  for (const b of bonds) { nb[b.i].push(b); nb[b.j].push(b); }
  const bonded = new Set(bonds.map((b) => b.i * 100000 + b.j).concat(bonds.map((b) => b.j * 100000 + b.i)));
  const { kBond, kAngle, kRepel, damp, iters, maxNeighbourSpeed } = CONFIG;
  const vmax = maxNeighbourSpeed / iters;
  const fx = new Float32Array(n), fy = new Float32Array(n);

  for (let it = 0; it < iters; it++) {
    fx.fill(0); fy.fill(0);

    for (const { i, j, L } of bonds) {
      const A = atoms[i], B = atoms[j];
      const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1e-3;
      const f = (kBond * (d - L)) / d;
      fx[i] += f * dx; fy[i] += f * dy; fx[j] -= f * dx; fy[j] -= f * dy;
    }

    for (let c = 0; c < n; c++) {
      const list = nb[c];
      if (list.length < 2) continue;
      const C = atoms[c];
      const theta = idealAngle(C.el, list.map((b) => b.bond));
      const other = (b) => (b.i === c ? b.j : b.i);
      const s = [...list].sort((p, q) => {
        const P = atoms[other(p)], Q = atoms[other(q)];
        return Math.atan2(P.y - C.y, P.x - C.x) - Math.atan2(Q.y - C.y, Q.x - C.x);
      });
      const pairs = s.length === 2 ? [[s[0], s[1]]] : s.map((b, k) => [b, s[(k + 1) % s.length]]);
      for (const [p, q] of pairs) {
        const i = other(p), j = other(q);
        const target = Math.sqrt(p.L * p.L + q.L * q.L - 2 * p.L * q.L * Math.cos(theta));
        const I = atoms[i], J = atoms[j];
        const dx = J.x - I.x, dy = J.y - I.y, d = Math.hypot(dx, dy) || 1e-3;
        const f = (kAngle * (d - target)) / d;
        fx[i] += f * dx; fy[i] += f * dy; fx[j] -= f * dx; fy[j] -= f * dy;
      }
    }

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (bonded.has(i * 100000 + j)) continue;
        const dx = atoms[j].x - atoms[i].x, dy = atoms[j].y - atoms[i].y;
        const d2 = dx * dx + dy * dy;
        if (d2 > 140 * 140) continue;
        const d = Math.sqrt(d2) || 1e-3, f = kRepel / Math.max(d2, 100) / d;
        fx[i] -= f * dx; fy[i] -= f * dy; fx[j] += f * dx; fy[j] += f * dy;
      }
    }

    for (let i = 0; i < n; i++) {
      const A = atoms[i];
      if (A.pinned) { A.vx = A.vy = 0; continue; }
      A.vx = (A.vx + fx[i]) * damp; A.vy = (A.vy + fy[i]) * damp;
      const sp = Math.hypot(A.vx, A.vy);
      if (sp > vmax) { A.vx *= vmax / sp; A.vy *= vmax / sp; }
      A.x += A.vx; A.y += A.vy;
      // keep atoms on screen
      const m = 24;
      if (A.x < m) A.vx += (m - A.x) * 0.1; else if (A.x > width - m) A.vx -= (A.x - (width - m)) * 0.1;
      if (A.y < m) A.vy += (m - A.y) * 0.1; else if (A.y > height - m) A.vy -= (A.y - (height - m)) * 0.1;
    }
  }
}
