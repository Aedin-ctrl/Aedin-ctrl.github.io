// The feature vector: every number the matcher can use, by stable name (research/01 §2).
// Templates refer to features by these names, so renaming one breaks saved memes.
//
// Conventions (all in the raw, unmirrored camera image):
//   - Face frame: origin between the outer eye corners, x along the eye line (image right),
//     y perpendicular (down), unit = face width (3D cheek to cheek), so it ignores distance,
//     position in frame and head tilt.
//   - "x" features are signed in image-x. mirror() negates them.
//   - Arm features use "out" = away from the body's midline on that arm's side, so mirroring
//     an arm is a pure L↔R swap.
//   - Hands sit in slots h0/h1 (sorted by image x); the scorer tries both assignments.
//   - Most values land in about [0, 1] or [-1, 1], so a tolerance of ~0.2 means a similar
//     amount everywhere.

const F = [];
const add = (name, part, mirror = null, group = null) => F.push({ name, part, mirror, group });

// ── face ────────────────────────────────────────────────────────────────────────────────
// group: 'mouth' / 'eyes' / 'brows' are dropped when a hand covers that region,
// 'expr' features need the face mesh (not the pose fallback).
add('brow_up', 'face', null, 'brows');          // mean(browInnerUp, browOuterUp L/R)
add('brow_inner', 'face', null, 'brows');       // browInnerUp alone: worried / sad
add('brow_down', 'face', null, 'brows');        // frown / angry / skeptical
add('brow_asym', 'face', 'neg', 'brows');       // one brow up (The Rock). + = image-right brow higher
add('eye_open', 'face', null, 'eyes');          // lid gap ÷ eye width vs your neutral: 0 neutral, + wide, − squint/closed
add('blink', 'face', null, 'eyes');             // both eyes closed
add('blink_asym', 'face', 'neg', 'eyes');       // wink
add('squint', 'face', null, 'eyes');
add('gaze_x', 'face', 'neg', 'eyes');           // iris position across the eye, + = image right
add('gaze_y', 'face', null, 'eyes');            // + = looking up
add('jaw_open', 'face', null, 'mouth');
add('mouth_open', 'face', null, 'mouth');       // inner lip gap ÷ face width (geometry)
add('smile', 'face', null, 'mouth');
add('smile_asym', 'face', 'neg', 'mouth');      // smirk
add('frown', 'face', null, 'mouth');
add('pucker', 'face', null, 'mouth');
add('funnel', 'face', null, 'mouth');
add('press', 'face', null, 'mouth');
add('lip_roll', 'face', null, 'mouth');
add('stretch', 'face', null, 'mouth');
add('upper_up', 'face', null, 'mouth');         // upper lip raised: disgust, teeth
add('chin_raise', 'face', null, 'mouth');       // mouthShrugLower: pout / chin quiver
add('mouth_side', 'face', 'neg', 'mouth');      // mouth pulled sideways
add('mouth_width', 'face', null, 'mouth');      // corner-to-corner width vs your neutral: + grin, − pucker/kiss
add('cheek_width', 'face', null, 'mouth');      // lower-cheek width vs your neutral: + puffed cheeks
add('mouth_curve', 'face', null, 'mouth');      // corners up (+, smile) or down (−, frown) vs your neutral, from geometry
add('sneer', 'face', null, 'expr');
add('cheek_puff', 'face', null, 'expr');
add('head_yaw', 'face', 'neg', 'expr');         // ÷ 30°, + = nose toward image right
add('head_pitch', 'face', null, 'expr');        // ÷ 30°, + = chin up
add('head_roll', 'face', 'neg', 'expr');        // ÷ 30°
add('face_size', 'face', null, null);           // face width ÷ image height: how close you are

// ── hands ───────────────────────────────────────────────────────────────────────────────
export const HAND_FEATS = [
  ['present', null], ['palm_x', 'neg'], ['palm_y', null], ['tip_x', 'neg'], ['tip_y', null],
  ['touch_lips', null], ['touch_corner', null], ['touch_chin', null], ['touch_nose', null],
  ['touch_eye', null], ['touch_temple', null], ['touch_cheek', null], ['touch_forehead', null],
  ['curl_thumb', null], ['curl_index', null], ['curl_middle', null], ['curl_ring', null], ['curl_pinky', null],
  ['point_x', 'neg'], ['point_y', null], ['point_fore', null],
  ['orient_x', 'neg'], ['orient_y', null], ['palm_facing', null],
  // MediaPipe GestureRecognizer scores 0–1 (only with the gesture model)
  ['gest_fist', null], ['gest_open', null], ['gest_point', null], ['gest_thumb_up', null], ['gest_thumb_down', null], ['gest_victory', null], ['gest_ily', null],
];
for (const slot of ['h0', 'h1']) for (const [n, m] of HAND_FEATS) add(`${slot}_${n}`, 'hands', m, slot);
add('hands_n', 'hands');                        // 0, 0.5 or 1
add('hands_face', 'hands');                     // nearest hand point to any face spot ÷ face width (2 = none near)
add('hands_dist', 'hands');                     // palm to palm ÷ face width
add('hands_level', 'hands');                    // |dy| between palms ÷ face width
add('cover_mouth', 'hands');                    // share of the lips inside a hand's outline
add('cover_eye_max', 'hands');                  // the more covered eye
add('cover_eye_min', 'hands');                  // the less covered eye (both eyes = facepalm)
add('cover_forehead', 'hands');

// ── arms ────────────────────────────────────────────────────────────────────────────────
// hand_*: Pose's hand point in the face frame (works when the hand tracker loses a hand on the face)
export const ARM_FEATS = ['elbow', 'up_out', 'up_y', 'fore_out', 'fore_y', 'wrist_out', 'wrist_y', 'hand_out', 'hand_y', 'hand_mouth'];
for (const side of ['L', 'R']) for (const n of ARM_FEATS) add(`arm${side}_${n}`, 'arms', `swap:arm${side === 'L' ? 'R' : 'L'}_${n}`);
add('shoulder_tilt', 'arms', 'neg');

export const FEATS = F;
export const N_FEATS = F.length;
export const FEAT = Object.fromEntries(F.map((f, i) => [f.name, i]));
export const PARTS = ['face', 'hands', 'arms'];

// Index tables for mirror() and hand-slot swaps.
export const NEG_IDX = Int16Array.from(F.flatMap((f, i) => (f.mirror === 'neg' ? [i] : [])));
export const SWAP_PAIRS = F.flatMap((f, i) => {
  if (!f.mirror?.startsWith('swap:')) return [];
  const j = FEAT[f.mirror.slice(5)];
  return i < j ? [[i, j]] : [];
});
export const SLOT_PAIRS = HAND_FEATS.map(([n]) => [FEAT[`h0_${n}`], FEAT[`h1_${n}`]]);

// x' = the same pose seen in a mirror.
export function mirror(x, out = new Float32Array(x.length)) {
  out.set(x);
  for (const i of NEG_IDX) out[i] = -x[i];
  for (const [i, j] of SWAP_PAIRS) { out[i] = x[j]; out[j] = x[i]; }
  return out;
}
export function mirrorValid(v, out = new Uint8Array(v.length)) {
  out.set(v);
  for (const [i, j] of SWAP_PAIRS) { out[i] = v[j]; out[j] = v[i]; }
  return out;
}
// Swaps hand slots h0 ↔ h1 (values and validity together).
export function swapHands(x, v, ox = new Float32Array(x.length), ov = new Uint8Array(v.length)) {
  ox.set(x); ov.set(v);
  for (const [i, j] of SLOT_PAIRS) { ox[i] = x[j]; ox[j] = x[i]; ov[i] = v[j]; ov[j] = v[i]; }
  return [ox, ov];
}
