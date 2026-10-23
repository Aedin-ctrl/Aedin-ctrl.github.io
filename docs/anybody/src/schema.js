// The keypoint schema.
//
// Deliberately NOT "one schema every model can satisfy". Two models that both
// report a wrist do not agree on where a wrist is: BlazePose's joints are centres
// of a fitted GHUM body mesh, COCO's are surface points an annotator clicked. The
// difference shows up in joint angles at roughly the size of the thing a
// physiotherapist is trying to measure, so a schema that hides which model ran is
// actively harmful.
//
// Instead: a result declares which PARTS it contains, every point says whether it
// is `present`, and every frame is stamped with the model that produced it. Swap
// backends and downstream code can tell.

export const SCHEMA_VERSION = 1;

/** Parts a backend may declare. A part is present in full or absent entirely. */
export const PARTS = ['body', 'leftHand', 'rightHand', 'face'];

// BlazePose's 33 body landmarks, in model order.
export const BODY_NAMES = [
  'nose',
  'left_eye_inner', 'left_eye', 'left_eye_outer',
  'right_eye_inner', 'right_eye', 'right_eye_outer',
  'left_ear', 'right_ear',
  'mouth_left', 'mouth_right',
  'left_shoulder', 'right_shoulder',
  'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist',
  'left_pinky', 'right_pinky',
  'left_index', 'right_index',
  'left_thumb', 'right_thumb',
  'left_hip', 'right_hip',
  'left_knee', 'right_knee',
  'left_ankle', 'right_ankle',
  'left_heel', 'right_heel',
  'left_foot_index', 'right_foot_index',
];

// The 21 hand landmarks, in model order. Same names for either hand; the part
// name (leftHand / rightHand) carries the side.
export const HAND_NAMES = [
  'wrist',
  'thumb_cmc', 'thumb_mcp', 'thumb_ip', 'thumb_tip',
  'index_mcp', 'index_pip', 'index_dip', 'index_tip',
  'middle_mcp', 'middle_pip', 'middle_dip', 'middle_tip',
  'ring_mcp', 'ring_pip', 'ring_dip', 'ring_tip',
  'pinky_mcp', 'pinky_pip', 'pinky_dip', 'pinky_tip',
];

/** Skeleton edges as [from, to] index pairs, within a part. */
export const BODY_EDGES = [
  [11, 12], [11, 23], [12, 24], [23, 24],              // torso
  [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19], // left arm + hand stub
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20], // right arm + hand stub
  [23, 25], [25, 27], [27, 29], [27, 31], [29, 31],    // left leg
  [24, 26], [26, 28], [28, 30], [28, 32], [30, 32],    // right leg
  [0, 2], [2, 7], [0, 5], [5, 8], [9, 10],             // head
];

export const HAND_EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

/** Which side of the body a named landmark belongs to. */
export function sideOf(name) {
  if (name.startsWith('left_')) return 'left';
  if (name.startsWith('right_')) return 'right';
  return 'centre';
}

/**
 * Describe a part without having to hold a result. Used by the harness to build
 * its table before the first frame arrives.
 */
export function partInfo(part) {
  switch (part) {
    case 'body': return { names: BODY_NAMES, edges: BODY_EDGES, count: BODY_NAMES.length };
    case 'leftHand':
    case 'rightHand': return { names: HAND_NAMES, edges: HAND_EDGES, count: HAND_NAMES.length };
    // The face mesh has no meaningful per-point names; MediaPipe ships contour
    // index sets instead, which the backend supplies at runtime.
    case 'face': return { names: null, edges: null, count: 478 };
    default: throw new Error(`unknown part: ${part}`);
  }
}

/**
 * Build one point record.
 *
 * `score` is whatever confidence the backend reports and is NOT comparable
 * across backends — a 0.6 from one model does not mean what a 0.6 from another
 * does. Threshold per model, not globally.
 */
export function makePoint({ part, index, name, x, y, z, score, present }) {
  return { part, index, name, x, y, z, score, present };
}

/**
 * An empty, well-formed result. A backend fills in the parts it actually found;
 * anything it does not find is simply absent from `parts`, never zero-filled.
 */
export function emptyResult({ modelId, modelRevision }) {
  return {
    schemaVersion: SCHEMA_VERSION,
    modelId,
    modelRevision,
    parts: {},
    points: [],
    world: null,
    box: null,
    orientation: { applied: 0, score: 0, searched: false, scores: null },
    timings: { totalMs: 0, inferenceMs: 0, passes: 0 },
  };
}
