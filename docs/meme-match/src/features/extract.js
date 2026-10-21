// Observation (src/track/frame.js) → feature vector {x, valid} (research/01 §2).
// Pure apart from `calib`, which holds the user's neutral face and a face/pose scale ratio
// (src/features/calib.js). Everything is measured in pixels of the raw camera image.
import { BS } from '../track/frame.js';
import { FEAT, N_FEATS, FEATS, HAND_FEATS } from './schema.js';
import { FACE } from '../render/topology.js';
import { angle3, clamp, cross3, dist2, dist3, frame, hull, inHull, len3, mean, mid, sub, unit } from './geom.js';
import { DEFAULT_CALIB, faceWidths, mouthCurveRaw } from './calib.js';

const VIS = 0.5;
const LIPS_OUTER = FACE.lips[0].slice(0, -1);
const EYE_R = FACE.rightEye[0].slice(0, -1), EYE_L = FACE.leftEye[0].slice(0, -1);
const FOREHEAD = [151, 9, 108, 337, 69, 299, 107, 336, 66, 296, 105, 334, 67, 297];
const TIPS = [4, 8, 12];                    // the fingers that do the touching in memes
const DMAX = 1.2;                           // contact distances saturate here (face widths)

// Where the face spots sit in the face frame on an average frontal face (measured on the
// portrait test image). Used when the hand hides the face and only Pose is left.
export const CANON = {
  lips: { x: 0, y: 0.5 }, cornerL: { x: 0.26, y: 0.44 }, cornerR: { x: -0.26, y: 0.44 }, chin: { x: 0, y: 0.9 },
  nose: { x: 0, y: 0.29 }, eyeL: { x: 0.22, y: 0 }, eyeR: { x: -0.22, y: 0 },
  templeL: { x: 0.48, y: -0.16 }, templeR: { x: -0.48, y: -0.16 }, cheekL: { x: 0.37, y: 0.21 }, cheekR: { x: -0.37, y: 0.21 },
  forehead: { x: 0, y: -0.28 },
};

const fp = (obs, i) => ({ x: obs.face[i * 3] * obs.w, y: obs.face[i * 3 + 1] * obs.h, z: obs.face[i * 3 + 2] * obs.w });
const pp = (obs, i) => ({ x: obs.pose[i * 5] * obs.w, y: obs.pose[i * 5 + 1] * obs.h, vis: obs.pose[i * 5 + 3] });
const pw = (obs, i) => ({ x: obs.poseW[i * 3], y: obs.poseW[i * 3 + 1], z: obs.poseW[i * 3 + 2] });
const hp = (obs, h, i) => ({ x: h.lm[i * 3] * obs.w, y: h.lm[i * 3 + 1] * obs.h });
const hw = (h, i) => ({ x: h.world[i * 3], y: h.world[i * 3 + 1], z: h.world[i * 3 + 2] });

// Head yaw/pitch/roll in degrees from the column-major face transform (01 §1.5).
// Signs here follow the matrix; extract() flips them to the feature conventions.
export function headAngles(m) {
  const R = (r, c) => m[c * 4 + r];
  const k = 180 / Math.PI;
  return {
    pitch: Math.atan2(R(2, 1), R(2, 2)) * k,
    yaw: Math.asin(-clamp(R(2, 0), -1, 1)) * k,
    roll: Math.atan2(R(1, 0), R(0, 0)) * k,
  };
}

// The face frame and named spots, from the mesh if there is one, else from Pose's head points.
export function faceGeometry(obs, calib = {}) {
  if (obs.face) {
    const eR = fp(obs, 33), eL = fp(obs, 263);
    const s = dist3(fp(obs, 234), fp(obs, 454));
    const F = frame(mid(eR, eL), unit(sub(eL, eR)), s);
    const P = (i) => F.to(fp(obs, i));
    const avg = (ids) => { let x = 0, y = 0; for (const i of ids) { const q = P(i); x += q.x; y += q.y; } return { x: x / ids.length, y: y / ids.length }; };
    const spots = {
      lips: avg([13, 14]), cornerL: P(291), cornerR: P(61), chin: P(152), nose: P(1),
      eyeL: avg([263, 362]), eyeR: avg([33, 133]), templeL: P(251), templeR: P(21),
      cheekL: P(280), cheekR: P(50), forehead: P(151),
    };
    const regions = {
      mouth: LIPS_OUTER.map((i) => fp(obs, i)), eyeL: EYE_L.map((i) => fp(obs, i)), eyeR: EYE_R.map((i) => fp(obs, i)),
      forehead: FOREHEAD.map((i) => fp(obs, i)),
    };
    return { F, s, spots, regions, mesh: true };
  }
  if (obs.pose) {
    const eL = pp(obs, 3), eR = pp(obs, 6), earL = pp(obs, 7), earR = pp(obs, 8);
    if (Math.min(eL.vis, eR.vis) < VIS) return null;
    const ears = earL.vis >= VIS && earR.vis >= VIS ? dist2(earL, earR) : dist2(eL, eR) * 2.6;
    const s = ears * (calib.earRatio ?? 1.2);
    const F = frame(mid(eR, eL), unit(sub(eL, eR)), s);
    const spots = { ...CANON };
    const nose = pp(obs, 0), mL = pp(obs, 9), mR = pp(obs, 10);
    if (nose.vis >= VIS) spots.nose = F.to(nose);
    if (mL.vis >= VIS && mR.vis >= VIS) { spots.cornerL = F.to(mL); spots.cornerR = F.to(mR); spots.lips = F.to(mid(mL, mR)); }
    // regions: small rings of canonical points around each spot
    const ring = (c, rx, ry) => Array.from({ length: 10 }, (_, k) => F.from({ x: c.x + rx * Math.cos(k * 0.628), y: c.y + ry * Math.sin(k * 0.628) }));
    const regions = { mouth: ring(spots.lips, 0.2, 0.08), eyeL: ring(spots.eyeL, 0.1, 0.04), eyeR: ring(spots.eyeR, 0.1, 0.04), forehead: ring(spots.forehead, 0.3, 0.12) };
    return { F, s, spots, regions, mesh: false };
  }
  return null;
}

// Finger curl from the bend at its three knuckles (3D world landmarks): 0 = straight, 1 ≈ a fist.
// On 17 real gesture photos straight fingers summed 30–95° and curled ones 130–270° (research:
// the old length-ratio measure read clearly curled fingers as low as 0.2).
function curl(h, base) {
  const w = hw(h, 0), m = hw(h, base), p = hw(h, base + 1), d = hw(h, base + 2), t = hw(h, base + 3);
  const deg = angleBetween(sub(m, w), sub(p, m)) + angleBetween(sub(p, m), sub(d, p)) + angleBetween(sub(d, p), sub(t, d));
  return clamp((deg - 60) / 120, 0, 1.2);
}
// The thumb tucks sideways rather than bending, so use how far its tip is from the pinky knuckle,
// in palm lengths: extended thumbs measured 0.88–1.42, tucked ones 0.36–0.67.
function thumbCurl(h) {
  const palm = dist3(hw(h, 0), hw(h, 9));
  return palm > 1e-6 ? clamp((1.2 - dist3(hw(h, 4), hw(h, 17)) / palm) / 0.65, 0, 1.2) : 0;
}
function angleBetween(u, v) {
  const d = (u.x * v.x + u.y * v.y + u.z * v.z) / ((len3(u) * len3(v)) || 1);
  return (Math.acos(clamp(d, -1, 1)) * 180) / Math.PI;
}
// MediaPipe's gesture classifier scores (GestureRecognizer), when the tracker provides them
const GEST = { gest_fist: 'Closed_Fist', gest_open: 'Open_Palm', gest_point: 'Pointing_Up', gest_thumb_up: 'Thumb_Up', gest_thumb_down: 'Thumb_Down', gest_victory: 'Victory', gest_ily: 'ILoveYou' };

// Features for one hand in the face frame G (null when there is no face frame).
function handFeatures(obs, h, G) {
  const out = {};
  const pts = Array.from({ length: 21 }, (_, i) => hp(obs, h, i));
  const palm = { x: mean(...[0, 5, 9, 13, 17].map((i) => pts[i].x)), y: mean(...[0, 5, 9, 13, 17].map((i) => pts[i].y)) };
  out.present = 1;
  out.curl_thumb = thumbCurl(h);
  out.curl_index = curl(h, 5);
  out.curl_middle = curl(h, 9);
  out.curl_ring = curl(h, 13);
  out.curl_pinky = curl(h, 17);
  if (h.gest) for (const [k, name] of Object.entries(GEST)) out[k] = h.gest[name] ?? 0;
  // index foreshortening: 2D length vs 3D length, scaled by the palm (≈1 side-on, small = pointing at the camera)
  const palmPx = dist2(pts[0], pts[9]), palmM = dist3(hw(h, 0), hw(h, 9));
  const idxPx = dist2(pts[5], pts[8]), idxM = dist3(hw(h, 5), hw(h, 8));
  out.point_fore = palmM > 1e-6 && idxM > 1e-6 && palmPx > 1 ? clamp((idxPx / idxM) / (palmPx / palmM), 0, 1.5) : null;
  // palm normal: + = palm toward the camera. The cross product's sign depends on which hand it is;
  // MediaPipe's label assumes a mirrored image, and ours is raw, but it only has to be consistent.
  const n = cross3(sub(hw(h, 5), hw(h, 0)), sub(hw(h, 17), hw(h, 0)));
  const nl = len3(n);
  out.palm_facing = nl > 1e-9 ? clamp((-n.z / nl) * (h.handed === 'Left' ? -1 : 1), -1, 1) : null;
  if (G) {
    const P = (p) => G.F.to(p);
    const qp = P(palm), qt = P(pts[8]);
    out.palm_x = clamp(qp.x, -3, 3); out.palm_y = clamp(qp.y, -3, 3); out.tip_x = clamp(qt.x, -3, 3); out.tip_y = clamp(qt.y, -3, 3);
    const near = (spot) => Math.min(DMAX, ...TIPS.map((i) => { const q = P(pts[i]); return Math.hypot(q.x - spot.x, q.y - spot.y); }));
    const S = G.spots;
    out.touch_lips = near(S.lips);
    out.touch_corner = Math.min(near(S.cornerL), near(S.cornerR));
    out.touch_chin = near(S.chin);
    out.touch_nose = near(S.nose);
    out.touch_eye = Math.min(near(S.eyeL), near(S.eyeR));
    out.touch_temple = Math.min(near(S.templeL), near(S.templeR));
    out.touch_cheek = Math.min(near(S.cheekL), near(S.cheekR));
    out.touch_forehead = near(S.forehead);
    const d = G.F.dir(unit(sub(pts[8], pts[5])));
    out.point_x = d.x; out.point_y = d.y;
    const o = G.F.dir(unit(sub(pts[9], pts[0])));
    out.orient_x = o.x; out.orient_y = o.y;
  }
  return { f: out, pts, palm };
}

function lostHandOnFace(obs, G, hands) {
  if (!obs.pose) return false;
  for (const ids of [[15, 17, 19], [16, 18, 20]]) {
    const pts = ids.map((i) => pp(obs, i));
    if (Math.min(...pts.map((p) => p.vis)) < VIS) continue;
    const c = { x: mean(...pts.map((p) => p.x)), y: mean(...pts.map((p) => p.y)) };
    const q = G.F.to(c);
    const onFace = Math.abs(q.x) < 0.8 && q.y > -0.6 && q.y < 1.3;
    if (onFace && !hands.some((hf) => dist2(hf.palm, c) < G.s * 0.7)) return true;
  }
  return false;
}

function cover(region, hulls, pad) {
  if (!region?.length || !hulls.length) return 0;
  let n = 0;
  for (const p of region) if (hulls.some((hh) => inHull(hh, p, pad))) n++;
  return n / region.length;
}

// Arms in a body frame: origin mid-shoulders, x toward the subject's left shoulder, unit = shoulder width.
function armFeatures(obs, set) {
  const sL = pp(obs, 11), sR = pp(obs, 12);
  if (sL.vis < VIS || sR.vis < VIS) return;
  const sw = dist2(sL, sR);
  if (sw < 4) return;
  const B = frame(mid(sL, sR), unit(sub(sL, sR)), sw);
  const k = 180 / Math.PI;
  set('shoulder_tilt', Math.atan2(sL.y - sR.y, sL.x - sR.x) * k / 30);
  for (const [side, s, e, w, sign] of [['L', 11, 13, 15, 1], ['R', 12, 14, 16, -1]]) {
    const S = pp(obs, s), E = pp(obs, e), W = pp(obs, w);
    if (E.vis < VIS) continue;
    const up = B.dir(unit(sub(E, S)));
    set(`arm${side}_up_out`, up.x * sign); set(`arm${side}_up_y`, up.y);
    if (W.vis < VIS) continue;
    const fo = B.dir(unit(sub(W, E)));
    set(`arm${side}_fore_out`, fo.x * sign); set(`arm${side}_fore_y`, fo.y);
    const qw = B.to(W);
    set(`arm${side}_wrist_out`, qw.x * sign); set(`arm${side}_wrist_y`, qw.y);
    if (obs.poseW) set(`arm${side}_elbow`, angle3(pw(obs, s), pw(obs, e), pw(obs, w)) / 180);
  }
}

// calib: { neutralBs: Float32Array(52) | null, neutralEye: number, earRatio: number }
export function extract(obs, calib = {}) {
  const x = new Float32Array(N_FEATS), valid = new Uint8Array(N_FEATS);
  const set = (name, v) => { if (v === null || v === undefined || Number.isNaN(v)) return; const i = FEAT[name]; x[i] = v; valid[i] = 1; };
  const G = faceGeometry(obs, calib);
  const dbg = { G };

  // ── hands (first, because covering the face changes which face features count) ──
  const hands = obs.hands.map((h) => handFeatures(obs, h, G)).sort((a, b) => a.palm.x - b.palm.x);
  hands.slice(0, 2).forEach((hf, k) => { for (const [n] of HAND_FEATS) set(`h${k}_${n}`, hf.f[n]); });
  for (let k = hands.length; k < 2; k++) set(`h${k}_present`, 0);
  set('hands_n', Math.min(2, hands.length) / 2);
  if (G) {
    // distance from any hand point to the nearest named spot on the face (temple, chin, lips…)
    let near = 2;
    const spots = Object.values(G.spots);
    for (const hf of hands) for (const i of [0, 4, 8, 12, 16, 20, 9]) {
      const q = G.F.to(hf.pts[i]);
      for (const sp of spots) near = Math.min(near, Math.hypot(q.x - sp.x, q.y - sp.y));
    }
    set('hands_face', near);
  }
  if (hands.length >= 2 && G) {
    const a = G.F.to(hands[0].palm), b = G.F.to(hands[1].palm);
    set('hands_dist', Math.min(3, Math.hypot(a.x - b.x, a.y - b.y)));
    set('hands_level', Math.min(3, Math.abs(a.y - b.y)));
  }
  let cov = { mouth: 0, eyeL: 0, eyeR: 0, forehead: 0 };
  if (G) {
    const hulls = hands.map((hf) => hull(hf.pts));
    const pad = G.s * 0.03;
    cov = { mouth: cover(G.regions.mouth, hulls, pad), eyeL: cover(G.regions.eyeL, hulls, pad), eyeR: cover(G.regions.eyeR, hulls, pad), forehead: cover(G.regions.forehead, hulls, pad) };
    // The hand tracker often loses a hand pressed flat on the face. If Pose puts a hand on the
    // face and no tracked hand is there, "nothing covered" is unknown rather than 0.
    if (!lostHandOnFace(obs, G, hands)) {
      set('cover_mouth', cov.mouth);
      set('cover_eye_max', Math.max(cov.eyeL, cov.eyeR));
      set('cover_eye_min', Math.min(cov.eyeL, cov.eyeR));
      set('cover_forehead', cov.forehead);
    } else dbg.lostHand = true;
    set('face_size', G.s / obs.h);
  }
  dbg.cover = cov;

  // ── face expression (needs the mesh) ──
  if (G?.mesh && obs.bs) {
    const nb = calib.neutralBs;
    const b = (name) => { const i = BS[name], v = obs.bs[i]; const n = nb ? Math.min(nb[i], 0.9) : 0; return clamp((v - n) / (1 - n), 0, 1); };
    const hidden = { mouth: cov.mouth > 0.3, eyes: Math.max(cov.eyeL, cov.eyeR) > 0.3, brows: cov.forehead > 0.4 };
    const fset = (name, v, group) => { if (!hidden[group]) set(name, v); };
    fset('brow_up', mean(b('browInnerUp'), b('browOuterUpLeft'), b('browOuterUpRight')), 'brows');
    fset('brow_inner', b('browInnerUp'), 'brows');
    fset('brow_down', mean(b('browDownLeft'), b('browDownRight')), 'brows');
    // Asymmetry from geometry, not blendshapes: MediaPipe's left/right channels disagree by up to
    // 40% on a symmetric face (#5329) and failed the mirrored-image check. + = image-right side.
    const yOf = (ids) => mean(...ids.map((i) => G.F.to(fp(obs, i)).y));
    fset('brow_asym', clamp((yOf([300, 293, 334, 296, 336]) - yOf([70, 63, 105, 66, 107])) * -6, -1.5, 1.5), 'brows');
    const openR = dist2(fp(obs, 159), fp(obs, 145)) / (dist2(fp(obs, 33), fp(obs, 133)) || 1);
    const openL = dist2(fp(obs, 386), fp(obs, 374)) / (dist2(fp(obs, 263), fp(obs, 362)) || 1);
    const ne = calib.neutralEye ?? 0.3;
    fset('eye_open', clamp((openL + openR) / 2 / ne - 1, -1, 1.5), 'eyes');
    fset('blink', mean(b('eyeBlinkLeft'), b('eyeBlinkRight')), 'eyes');
    fset('blink_asym', clamp((openR - openL) / ne, -1.5, 1.5), 'eyes');        // + = image-right eye more closed
    fset('squint', mean(b('eyeSquintLeft'), b('eyeSquintRight')), 'eyes');
    // gaze across: iris centre relative to its eye corners, along the eye line (image x)
    const gz = (iris, a, c) => { const ip = fp(obs, iris), pa = fp(obs, a), pc = fp(obs, c); const m = mid(pa, pc); const w = dist2(pa, pc) || 1; return ((ip.x - m.x) * G.F.u.x + (ip.y - m.y) * G.F.u.y) / w; };
    fset('gaze_x', clamp(4 * mean(gz(468, 33, 133), gz(473, 263, 362)), -1.5, 1.5), 'eyes');
    fset('gaze_y', mean(b('eyeLookUpLeft'), b('eyeLookUpRight')) - mean(b('eyeLookDownLeft'), b('eyeLookDownRight')), 'eyes');
    fset('jaw_open', b('jawOpen'), 'mouth');
    fset('mouth_open', clamp(dist2(fp(obs, 13), fp(obs, 14)) / G.s * 3, 0, 1.5), 'mouth');
    fset('smile', mean(b('mouthSmileLeft'), b('mouthSmileRight')), 'mouth');
    fset('smile_asym', clamp((G.spots.cornerR.y - G.spots.cornerL.y) * 6, -1.5, 1.5), 'mouth');   // + = image-right corner higher
    fset('frown', mean(b('mouthFrownLeft'), b('mouthFrownRight')), 'mouth');
    fset('pucker', b('mouthPucker'), 'mouth');
    fset('funnel', b('mouthFunnel'), 'mouth');
    fset('press', mean(b('mouthPressLeft'), b('mouthPressRight')), 'mouth');
    fset('lip_roll', mean(b('mouthRollUpper'), b('mouthRollLower')), 'mouth');
    fset('stretch', mean(b('mouthStretchLeft'), b('mouthStretchRight')), 'mouth');
    fset('upper_up', mean(b('mouthUpperUpLeft'), b('mouthUpperUpRight')), 'mouth');
    fset('chin_raise', b('mouthShrugLower'), 'mouth');
    fset('mouth_side', b('mouthLeft') - b('mouthRight'), 'mouth');
    const wd = faceWidths(obs);
    fset('mouth_width', clamp((wd.mouth / (calib.neutralMouthW ?? DEFAULT_CALIB.neutralMouthW) - 1) * 4, -1.5, 1.5), 'mouth');
    fset('cheek_width', clamp((wd.cheek / (calib.neutralCheekW ?? DEFAULT_CALIB.neutralCheekW) - 1) * 10, -1.5, 1.5), 'mouth');
    fset('mouth_curve', clamp(mouthCurveRaw(obs) - (calib.neutralCurve ?? DEFAULT_CALIB.neutralCurve), -1.5, 1.5), 'mouth');
    set('sneer', mean(b('noseSneerLeft'), b('noseSneerRight')));
    set('cheek_puff', b('cheekPuff'));
  }
  if (G?.mesh && obs.mat) {
    const a = headAngles(obs.mat);
    // yaw + = nose toward image right (Roll Safe: matrix yaw +34°, nose offset +0.21 face widths);
    // pitch + = chin up (Speed Scared: matrix pitch −17°, nose tip close to the eye line).
    set('head_yaw', clamp(a.yaw / 30, -3, 3));
    set('head_pitch', clamp(-a.pitch / 30, -3, 3));
  }
  // roll from the eye line itself, so it shares the image frame with every other x feature
  if (G) set('head_roll', clamp(Math.atan2(G.F.u.y, G.F.u.x) * 180 / Math.PI / 30, -3, 3));

  // ── arms ──
  if (obs.pose) armFeatures(obs, set);
  // Pose's own hand points (wrist, pinky, index knuckles) in the face frame. The hand tracker
  // loses hands pressed against the face (Speed Scared), but Pose still knows where they are.
  if (obs.pose && G) {
    for (const [side, ids, sign] of [['L', [15, 17, 19], 1], ['R', [16, 18, 20], -1]]) {
      const pts = ids.map((i) => pp(obs, i));
      if (Math.min(...pts.map((p) => p.vis)) < VIS) continue;
      const q = G.F.to({ x: mean(...pts.map((p) => p.x)), y: mean(...pts.map((p) => p.y)) });
      set(`arm${side}_hand_out`, clamp(q.x * sign, -3, 3));
      set(`arm${side}_hand_y`, clamp(q.y, -3, 3));
      set(`arm${side}_hand_mouth`, Math.min(2, Math.hypot(q.x - G.spots.lips.x, q.y - G.spots.lips.y)));
    }
  }

  dbg.hands = hands;
  return { x, valid, dbg };
}

// Readable dump of a feature vector, for the HUD and tests.
export function describe(x, valid, filter = () => true) {
  return FEATS.map((f, i) => ({ ...f, v: valid[i] ? x[i] : null })).filter(filter);
}
