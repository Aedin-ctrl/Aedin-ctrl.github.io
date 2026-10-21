// Placing masks on pictures from a few known points (shared by tools/annotate and the library
// builder): the canonical face through 5 anchors, and a hand shape through wrist + one fingertip.
import { CANON_FACE } from './canon.js';
import { SHAPES, SHAPE_KEY, handShape } from './hand-shapes.js';

// their right eye (outer corner), their left eye (outer corner), nose tip, mouth corner on their right, on their left
export const FACE_ANCHORS = [33, 263, 1, 61, 291];

// Least-squares affine map from src points to dst points (needs ≥ 3 that aren't collinear).
export function fitAffine(src, dst) {
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], bu = [0, 0, 0], bv = [0, 0, 0];
  src.forEach(([x, y], k) => {
    const r = [x, y, 1];
    for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) M[i][j] += r[i] * r[j]; bu[i] += r[i] * dst[k][0]; bv[i] += r[i] * dst[k][1]; }
  });
  const solve = (A, b) => {
    const m = A.map((row, i) => [...row, b[i]]);
    for (let c = 0; c < 3; c++) {
      let p = c; for (let r = c + 1; r < 3; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
      [m[c], m[p]] = [m[p], m[c]];
      for (let r = 0; r < 3; r++) if (r !== c) { const f = m[r][c] / m[c][c]; for (let k = c; k < 4; k++) m[r][k] -= f * m[c][k]; }
    }
    return m.map((row, i) => row[3] / row[i]);
  };
  const a = solve(M, bu), b = solve(M, bv);
  return ([x, y]) => [a[0] * x + a[1] * y + a[2], b[0] * x + b[1] * y + b[2]];
}

const r1 = (v) => Math.round(v * 10) / 10;

// A face (478 [x,y]) whose 5 anchor points land on `anchors`. `mesh` defaults to the neutral canonical
// face; pass a recorded mesh (face-frame units) to show that expression instead.
export function placeFace(anchors, mesh = CANON_FACE) {
  const f = fitAffine(FACE_ANCHORS.map((i) => mesh[i]), anchors);
  return mesh.map((p) => f(p).map(r1));
}

// A hand of the named shape with its wrist at `wrist` and its key fingertip (SHAPE_KEY) at `tip`.
export function placeHand(name, wrist, tip, mirror = false) {
  let shape = handShape(SHAPES[name]);
  if (mirror) shape = shape.map(([x, y]) => [-x, y]);
  const a = shape[0], b = shape[SHAPE_KEY[name][0]];
  const sx = tip[0] - wrist[0], sy = tip[1] - wrist[1], dx = b[0] - a[0], dy = b[1] - a[1];
  const s = Math.hypot(sx, sy) / Math.hypot(dx, dy), th = Math.atan2(sy, sx) - Math.atan2(dy, dx);
  const c = Math.cos(th) * s, n = Math.sin(th) * s;
  return shape.map(([x, y]) => [r1(wrist[0] + (x - a[0]) * c - (y - a[1]) * n), r1(wrist[1] + (x - a[0]) * n + (y - a[1]) * c)]);
}
