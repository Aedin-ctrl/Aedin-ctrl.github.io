// The mask: one renderer for the user's body and for the meme overlays, so they read as the same
// thing (research/README decision 5). Input is a "body" in screen px:
//   body = { face: [{x,y}]×478 | null, hands: [[{x,y}]×21], pose: [{x,y,v}]×33 | null }
// Each part (face / hands / arms) gets its own colour, so a score can tint it later.
import { FACE, FACE_TRIS } from './topology.js';

export const PART_COLORS = { face: '#F4F5F7', hands: '#F4F5F7', arms: '#F4F5F7' };

const FINGERS = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [0, 17, 18, 19, 20]];
const PALM = [0, 1, 5, 9, 13, 17];
const VIS = 0.5;

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Size of the face in px (cheek to cheek), used to scale every stroke.
export function faceScale(face) { return face ? Math.max(20, dist(face[234], face[454])) : 0; }

function path(g, pts, idx, close) {
  g.beginPath();
  g.moveTo(pts[idx[0]].x, pts[idx[0]].y);
  // smooth through midpoints (quadratic) so contours read as curves, not polylines
  for (let i = 1; i < idx.length - 1; i++) {
    const a = pts[idx[i]], b = pts[idx[i + 1]];
    g.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
  }
  const last = pts[idx[idx.length - 1]];
  g.lineTo(last.x, last.y);
  if (close) g.closePath();
}

export function drawFace(g, pts, color = PART_COLORS.face, opts = {}) {
  const s = faceScale(pts);
  const a = opts.alpha ?? 1;
  g.save();
  g.lineJoin = 'round'; g.lineCap = 'round';
  // soft fill inside the face oval
  path(g, pts, FACE.oval[0], true);
  g.globalAlpha = 0.10 * a; g.fillStyle = color; g.fill();
  // faint mesh
  if (opts.mesh !== false) {
    g.globalAlpha = 0.10 * a; g.strokeStyle = color; g.lineWidth = Math.max(0.5, s * 0.0025);
    g.beginPath();
    for (let i = 0; i < FACE_TRIS.length; i += 3) {
      const p0 = pts[FACE_TRIS[i]], p1 = pts[FACE_TRIS[i + 1]], p2 = pts[FACE_TRIS[i + 2]];
      g.moveTo(p0.x, p0.y); g.lineTo(p1.x, p1.y); g.lineTo(p2.x, p2.y); g.closePath();
    }
    g.stroke();
  }
  // contours
  g.strokeStyle = color; g.globalAlpha = 0.9 * a;
  g.lineWidth = Math.max(1, s * 0.012);
  path(g, pts, FACE.oval[0], true); g.stroke();
  for (const k of ['rightBrow', 'leftBrow']) { path(g, pts, FACE[k][0]); g.stroke(); }
  g.lineWidth = Math.max(1, s * 0.010);
  for (const k of ['rightEye', 'leftEye']) { path(g, pts, FACE[k][0], true); g.stroke(); }
  for (const c of FACE.lips) { path(g, pts, c, true); g.stroke(); }
  // irises
  g.fillStyle = color;
  for (const k of ['rightIris', 'leftIris']) {
    const ring = FACE[k][0];
    if (!pts[ring[0]]) continue;
    let cx = 0, cy = 0;
    for (const i of ring.slice(0, -1)) { cx += pts[i].x; cy += pts[i].y; }
    const n = ring.length - 1;
    cx /= n; cy /= n;
    g.beginPath(); g.arc(cx, cy, Math.max(1.5, s * 0.022), 0, Math.PI * 2); g.fill();
  }
  // nose bridge to tip
  g.lineWidth = Math.max(1, s * 0.008); g.globalAlpha = 0.6 * a;
  path(g, pts, [168, 6, 197, 195, 5, 4, 1]); g.stroke();
  g.restore();
}

export function handSize(pts) { return (dist(pts[0], pts[9]) + dist(pts[5], pts[17])) / 2; }

export function drawHand(g, pts, color = PART_COLORS.hands, opts = {}) {
  const s = handSize(pts);
  const a = opts.alpha ?? 1;
  g.save();
  g.lineJoin = 'round'; g.lineCap = 'round';
  // palm plate
  g.beginPath();
  PALM.forEach((i, k) => (k ? g.lineTo(pts[i].x, pts[i].y) : g.moveTo(pts[i].x, pts[i].y)));
  g.closePath();
  g.globalAlpha = 0.16 * a; g.fillStyle = color; g.fill();
  g.globalAlpha = 0.9 * a; g.strokeStyle = color; g.lineWidth = Math.max(1, s * 0.05); g.stroke();
  // fingers: thick translucent bone under a thin bright line
  for (const f of FINGERS) {
    path(g, pts, f);
    g.globalAlpha = 0.22 * a; g.lineWidth = Math.max(3, s * 0.2); g.stroke();
    g.globalAlpha = 0.95 * a; g.lineWidth = Math.max(1, s * 0.05); g.stroke();
  }
  // joints and tips
  g.fillStyle = color; g.globalAlpha = a;
  for (let i = 1; i < 21; i++) {
    const tip = i % 4 === 0;
    g.beginPath(); g.arc(pts[i].x, pts[i].y, Math.max(1.5, s * (tip ? 0.07 : 0.04)), 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

// Arms and shoulders from pose: shoulder line, upper arms, forearms, and a short neck.
// Hips are drawn only when visible, as a faint torso.
export function drawArms(g, pose, color = PART_COLORS.arms, opts = {}) {
  const ok = (i) => pose[i] && pose[i].v >= VIS;
  const sw = ok(11) && ok(12) ? dist(pose[11], pose[12]) : 120;
  const a = opts.alpha ?? 1;
  g.save();
  g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = color;
  const seg = (i, j, wide) => {
    if (!ok(i) || !ok(j)) return;
    g.beginPath(); g.moveTo(pose[i].x, pose[i].y); g.lineTo(pose[j].x, pose[j].y);
    g.globalAlpha = 0.18 * a; g.lineWidth = Math.max(6, sw * (wide ? 0.16 : 0.12)); g.stroke();
    g.globalAlpha = 0.9 * a; g.lineWidth = Math.max(1.5, sw * 0.022); g.stroke();
  };
  if (ok(23) && ok(24) && ok(11) && ok(12)) {
    g.beginPath(); for (const [k, i] of [11, 12, 24, 23].entries()) (k ? g.lineTo(pose[i].x, pose[i].y) : g.moveTo(pose[i].x, pose[i].y));
    g.closePath(); g.globalAlpha = 0.06 * a; g.fillStyle = color; g.fill();
    g.globalAlpha = 0.35 * a; g.lineWidth = Math.max(1, sw * 0.012); g.stroke();
  }
  seg(11, 12, true);
  seg(11, 13, true); seg(13, 15);
  seg(12, 14, true); seg(14, 16);
  if (opts.hands) for (const [w, hh] of opts.hands) {     // join the pose wrist to the tracked hand's wrist
    if (!ok(w) || !hh) continue;
    g.beginPath(); g.moveTo(pose[w].x, pose[w].y); g.lineTo(hh[0].x, hh[0].y);
    g.globalAlpha = 0.5 * a; g.lineWidth = Math.max(1, sw * 0.016); g.stroke();
  }
  if (ok(11) && ok(12) && ok(0)) {
    const m = { x: (pose[11].x + pose[12].x) / 2, y: (pose[11].y + pose[12].y) / 2 };
    const n = { x: m.x + (pose[0].x - m.x) * 0.45, y: m.y + (pose[0].y - m.y) * 0.45 };
    g.beginPath(); g.moveTo(m.x, m.y); g.lineTo(n.x, n.y);
    g.globalAlpha = 0.5 * a; g.lineWidth = Math.max(1.5, sw * 0.02); g.stroke();
  }
  g.fillStyle = color; g.globalAlpha = a;
  for (const i of [11, 12, 13, 14, 15, 16]) if (ok(i)) { g.beginPath(); g.arc(pose[i].x, pose[i].y, Math.max(2, sw * 0.03), 0, Math.PI * 2); g.fill(); }
  g.restore();
}

// Pairs each tracked hand with the nearer pose wrist (15 = subject's left, 16 = right).
export function wristLinks(pose, hands) {
  if (!pose) return [];
  return hands.map((h) => {
    const d15 = pose[15] ? dist(pose[15], h[0]) : Infinity, d16 = pose[16] ? dist(pose[16], h[0]) : Infinity;
    return [d15 < d16 ? 15 : 16, h];
  });
}

// opts.outline: a soft dark halo under the strokes, so a light mask still reads on light pictures.
export function drawBody(g, body, colors = PART_COLORS, opts = {}) {
  g.save();
  if (opts.outline) { g.shadowColor = 'rgba(8,9,11,0.75)'; g.shadowBlur = opts.outline; }
  if (body.pose) drawArms(g, body.pose, colors.arms, { ...opts, hands: wristLinks(body.pose, body.hands) });
  if (body.face) drawFace(g, body.face, colors.face, opts);
  for (const h of body.hands) drawHand(g, h, colors.hands, opts);
  g.restore();
}

// obs (raw normalised camera landmarks) → body in screen px, for a video shown with
// object-fit: cover inside rect {x, y, w, h}, optionally mirrored.
export function obsToBody(obs, rect, mirror = true) {
  const s = Math.max(rect.w / obs.w, rect.h / obs.h);
  const ox = rect.x + (rect.w - obs.w * s) / 2, oy = rect.y + (rect.h - obs.h * s) / 2;
  const X = (nx) => ox + (mirror ? 1 - nx : nx) * obs.w * s, Y = (ny) => oy + ny * obs.h * s;
  const face = obs.face ? Array.from({ length: obs.face.length / 3 }, (_, i) => ({ x: X(obs.face[i * 3]), y: Y(obs.face[i * 3 + 1]) })) : null;
  const hands = obs.hands.map((h) => Array.from({ length: 21 }, (_, i) => ({ x: X(h.lm[i * 3]), y: Y(h.lm[i * 3 + 1]) })));
  const pose = obs.pose ? Array.from({ length: 33 }, (_, i) => ({ x: X(obs.pose[i * 5]), y: Y(obs.pose[i * 5 + 1]), v: obs.pose[i * 5 + 3] })) : null;
  return { face, hands, pose };
}
