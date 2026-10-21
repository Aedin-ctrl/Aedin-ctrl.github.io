// The packed per-frame observation shared by the tracker, features, recorder and tests.
//
//   obs = {
//     w, h,                         image size in px (landmarks are normalised to it)
//     face:  Float32Array(478*3)    x, y, z per point (MediaPipe normalised), or null
//     bs:    Float32Array(52)       blendshape scores in BS_NAMES order, or null
//     mat:   Float32Array(16)       face transform, column-major (01 §1.5), or null
//     hands: [{ lm: Float32Array(21*3), world: Float32Array(21*3), handed, score, gest: { Closed_Fist: 0.9, … } }]
//     pose:  Float32Array(33*5)     x, y, z, visibility, presence, or null
//     poseW: Float32Array(33*3)     world metres, hip-centred, or null
//   }
//
// Landmarks are in the raw (unmirrored) camera image. Mirroring is for display only.

export const BS_NAMES = [
  '_neutral', 'browDownLeft', 'browDownRight', 'browInnerUp', 'browOuterUpLeft', 'browOuterUpRight',
  'cheekPuff', 'cheekSquintLeft', 'cheekSquintRight', 'eyeBlinkLeft', 'eyeBlinkRight',
  'eyeLookDownLeft', 'eyeLookDownRight', 'eyeLookInLeft', 'eyeLookInRight', 'eyeLookOutLeft',
  'eyeLookOutRight', 'eyeLookUpLeft', 'eyeLookUpRight', 'eyeSquintLeft', 'eyeSquintRight',
  'eyeWideLeft', 'eyeWideRight', 'jawForward', 'jawLeft', 'jawOpen', 'jawRight', 'mouthClose',
  'mouthDimpleLeft', 'mouthDimpleRight', 'mouthFrownLeft', 'mouthFrownRight', 'mouthFunnel',
  'mouthLeft', 'mouthLowerDownLeft', 'mouthLowerDownRight', 'mouthPressLeft', 'mouthPressRight',
  'mouthPucker', 'mouthRight', 'mouthRollLower', 'mouthRollUpper', 'mouthShrugLower',
  'mouthShrugUpper', 'mouthSmileLeft', 'mouthSmileRight', 'mouthStretchLeft', 'mouthStretchRight',
  'mouthUpperUpLeft', 'mouthUpperUpRight', 'noseSneerLeft', 'noseSneerRight',
];
export const BS = Object.fromEntries(BS_NAMES.map((n, i) => [n, i]));

export const N_FACE = 478, N_HAND = 21, N_POSE = 33;

function packPoints(list, n, stride, extra) {
  const a = new Float32Array(n * stride);
  for (let i = 0; i < n && i < list.length; i++) {
    const p = list[i];
    a[i * stride] = p.x; a[i * stride + 1] = p.y; a[i * stride + 2] = p.z ?? 0;
    if (extra) { a[i * stride + 3] = p.visibility ?? 0; a[i * stride + 4] = p.presence ?? 0; }
  }
  return a;
}

// MediaPipe results → obs (+ the ArrayBuffers to transfer).
export function packResult(f, h, p, w, hgt) {
  const transfer = [];
  const keep = (a) => { if (a) transfer.push(a.buffer); return a; };
  let face = null, bs = null, mat = null;
  if (f?.faceLandmarks?.[0]) {
    face = keep(packPoints(f.faceLandmarks[0], N_FACE, 3));
    const cats = f.faceBlendshapes?.[0]?.categories;
    if (cats) {
      bs = new Float32Array(BS_NAMES.length);
      for (const c of cats) { const i = BS[c.categoryName]; if (i !== undefined) bs[i] = c.score; }
      keep(bs);
    }
    const m = f.facialTransformationMatrixes?.[0]?.data;
    if (m) mat = keep(Float32Array.from(m));
  }
  const hands = (h?.landmarks || []).map((lm, i) => ({
    lm: keep(packPoints(lm, N_HAND, 3)),
    world: keep(packPoints(h.worldLandmarks?.[i] || [], N_HAND, 3)),
    handed: h.handedness?.[i]?.[0]?.categoryName ?? '',
    score: h.handedness?.[i]?.[0]?.score ?? 0,
    gest: h.gestures?.[i] ? Object.fromEntries(h.gestures[i].map((c) => [c.categoryName, Math.round(c.score * 1000) / 1000])) : null,
  }));
  let pose = null, poseW = null;
  if (p?.landmarks?.[0]) {
    pose = keep(packPoints(p.landmarks[0], N_POSE, 5, true));
    if (p.worldLandmarks?.[0]) poseW = keep(packPoints(p.worldLandmarks[0], N_POSE, 3));
  }
  return { w, h: hgt, face, bs, mat, hands, pose, poseW, transfer };
}

// Pixel-space accessors (normalised coordinates are anisotropic, 01 §2.1).
export const facePx = (obs, i) => ({ x: obs.face[i * 3] * obs.w, y: obs.face[i * 3 + 1] * obs.h, z: obs.face[i * 3 + 2] * obs.w });
export const handPx = (hand, i, obs) => ({ x: hand.lm[i * 3] * obs.w, y: hand.lm[i * 3 + 1] * obs.h, z: hand.lm[i * 3 + 2] * obs.w });
export const posePx = (obs, i) => ({ x: obs.pose[i * 5] * obs.w, y: obs.pose[i * 5 + 1] * obs.h, z: obs.pose[i * 5 + 2] * obs.w, vis: obs.pose[i * 5 + 3] });
export const handWorld = (hand, i) => ({ x: hand.world[i * 3], y: hand.world[i * 3 + 1], z: hand.world[i * 3 + 2] });
export const poseWorld = (obs, i) => ({ x: obs.poseW[i * 3], y: obs.poseW[i * 3 + 1], z: obs.poseW[i * 3 + 2] });
