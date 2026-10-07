// Hand-pose features for fingerspelling (research/13).
// Everything is expressed in a palm frame built from the 3D world landmarks:
//   origin = wrist, +Y = wrist → middle knuckle, +X = index knuckle → pinky knuckle, Z = X × Y.
// Because +X always runs index → pinky, left and right hands give the same numbers for the
// same handshape, and the frame doesn't care how the hand is rotated. Orientation (pointing
// up / sideways / down) is kept separately, since G/H and P/Q differ only in orientation.

const sub = (a, b) => [a.x - b.x, a.y - b.y, a.z - b.z];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map((v) => v / l); };

export const FINGERS = { thumb: [1, 2, 3, 4], index: [5, 6, 7, 8], middle: [9, 10, 11, 12], ring: [13, 14, 15, 16], pinky: [17, 18, 19, 20] };

export function palmFrame(w) {
  const o = w[0];
  const Y = norm(sub(w[9], o));
  const xr = sub(w[17], w[5]);
  const X = norm(xr.map((v, i) => v - Y[i] * dot(xr, Y)));
  const Z = cross(X, Y);
  const L = Math.hypot(...sub(w[9], o)) || 1;
  // palm-frame coordinates, in palm lengths
  const P = w.map((p) => { const d = sub(p, o); return { x: dot(d, X) / L, y: dot(d, Y) / L, z: dot(d, Z) / L }; });
  return { P, L };
}

// Bend of a finger in degrees: 0 = straight, ~180+ = fully curled (sum of the joint angles).
function bend(P, [a, b, c, d]) {
  const ang = (p, q, r) => {
    const u = norm(sub(q, p)), v = norm(sub(r, q));
    return (Math.acos(Math.max(-1, Math.min(1, dot(u, v)))) * 180) / Math.PI;
  };
  return ang(P[a], P[b], P[c]) + ang(P[b], P[c], P[d]);
}

export function describe(hand) {
  if (!hand?.world || !hand.pts) return null;
  const { P } = palmFrame(hand.world);
  const f = {};
  for (const name of ['index', 'middle', 'ring', 'pinky']) {
    const ch = FINGERS[name];
    const b = bend(P, [0, ch[0], ch[1], ch[2]]) * 0.35 + bend(P, ch);   // MCP counts a little
    f[name] = { bend: b, ext: b < 55, curled: b > 115, tip: P[ch[3]], base: P[ch[0]] };
  }
  const tt = P[4];
  // screen-space pointing direction of the hand (wrist → middle knuckle), y down on screen
  const s0 = hand.pts[0], s9 = hand.pts[9];
  const dx = s9.x - s0.x, dy = s9.y - s0.y, dl = Math.hypot(dx, dy) || 1;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  return {
    P, f,
    thumb: {
      tip: tt,
      bend: bend(P, FINGERS.thumb),
      out: tt.x < -0.45,                        // sticking out past the index side
      touch: (i) => dist(tt, P[i]),
    },
    up: -dy / dl, side: Math.abs(dx) / dl,      // up ≈ 1 pointing up, ≈ -1 pointing down
    spreadIM: angleBetween(P[5], P[8], P[9], P[12]),
    crossedIM: P[8].x > P[12].x + 0.04,         // index tip on the pinky side of the middle tip
  };
}

function angleBetween(a0, a1, b0, b1) {
  const u = norm(sub(a1, a0)), v = norm(sub(b1, b0));
  return (Math.acos(Math.max(-1, Math.min(1, dot(u, v)))) * 180) / Math.PI;
}

// Fixed-length vector for the "teach me" nearest-neighbour classifier.
export function vector(d) {
  const v = [];
  for (let i = 1; i < 21; i++) v.push(d.P[i].x, d.P[i].y, d.P[i].z * 0.6);
  v.push(d.up * 1.5, d.side * 1.5);
  return v;
}

// 42-number "keypoint" vector used by the trained model: 21 screen points relative to the wrist,
// divided by the mean wrist→knuckle length (index, middle, pinky) — same as scripts/train-signs.mjs.
export function keypoints(pts) {
  const out = new Float32Array(42);
  for (let i = 0; i < 21; i++) { out[2 * i] = pts[i].x - pts[0].x; out[2 * i + 1] = pts[i].y - pts[0].y; }
  const len = (k) => Math.hypot(out[2 * k], out[2 * k + 1]);
  const s = (len(5) + len(9) + len(17)) / 3 || 1;
  for (let i = 0; i < 42; i++) out[i] /= s;
  return out;
}
