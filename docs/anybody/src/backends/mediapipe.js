// MediaPipe Holistic backend.
//
// One task gives body (33) + face (478) + both hands (21 each) = 553 landmarks,
// from one vendor under one licence, in a 13 MB model. Composing the separate
// Pose/Hand/Face landmarkers gives the same points for more bytes and more
// moving parts.
//
// Running mode defaults to IMAGE, not VIDEO, and that is deliberate. VIDEO mode
// runs a tracker that carries the previous frame's region of interest forward
// and only re-runs the detector on track loss. That is faster, but it means a
// frame that the detector would fail on alone gets rescued by its predecessor —
// which is precisely the failure this library exists to measure. It also cannot
// be combined with rotation search: detectForVideo requires monotonically
// increasing timestamps and would have its tracker state corrupted by being fed
// four rotated variants of one frame. IMAGE mode makes every frame independent,
// which is both honest and correct here. Set runningMode: 'VIDEO' if you want
// the fast path and accept that caveat.

import { BODY_NAMES, HAND_NAMES, makePoint } from '../schema.js';
import { unrotateWorld } from '../orient.js';

const DEFAULT_ASSET_PATH = './vendor/mediapipe';

/** Draw `source` into `canvas`, rotated `deg` clockwise. Canvas is resized to fit. */
export function drawRotated(canvas, source, deg, srcW, srcH) {
  const d = ((deg % 360) + 360) % 360;
  const swap = d === 90 || d === 270;
  canvas.width = swap ? srcH : srcW;
  canvas.height = swap ? srcW : srcH;

  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  switch (d) {
    case 0: break;
    case 90: ctx.translate(srcH, 0); ctx.rotate(Math.PI / 2); break;
    case 180: ctx.translate(srcW, srcH); ctx.rotate(Math.PI); break;
    case 270: ctx.translate(0, srcW); ctx.rotate(-Math.PI / 2); break;
    default: throw new Error(`rotation must be a multiple of 90, got ${deg}`);
  }
  ctx.drawImage(source, 0, 0, srcW, srcH);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return canvas;
}

/** Natural pixel dimensions of anything MediaPipe will accept as an image source. */
export function sourceSize(source) {
  const w = source.videoWidth ?? source.naturalWidth ?? source.width;
  const h = source.videoHeight ?? source.naturalHeight ?? source.height;
  if (!w || !h) throw new Error('source has no dimensions yet (is the video ready?)');
  return { w, h };
}

/**
 * MediaPipe reports a landmark's `visibility` (roughly: is it inside the frame)
 * and sometimes `presence`. Hands and face carry neither, so they fall back to
 * 1 — they are only reported at all when the model found them.
 *
 * Note the `>= 0` rather than `> 0`: a landmark the model declares *invisible*
 * reports visibility 0, and treating that as "no value, fall through" handed it
 * maximum confidence — the exact inversion of what it means.
 *
 * This number is NOT a measure of whether the pose is correct. See README.
 */
export function confidenceOf(lm) {
  if (Number.isFinite(lm.visibility) && lm.visibility >= 0) return lm.visibility;
  if (Number.isFinite(lm.presence) && lm.presence >= 0) return lm.presence;
  return 1;
}

function pushPart(out, part, landmarks, names) {
  if (!landmarks?.length) return false;
  landmarks.forEach((lm, i) => {
    out.push(makePoint({
      part,
      index: i,
      name: names ? names[i] : `${part}_${i}`,
      x: lm.x,
      y: lm.y,
      z: lm.z,
      score: confidenceOf(lm),
      present: true,
    }));
  });
  return true;
}

export async function createMediaPipeBackend({
  assetPath = DEFAULT_ASSET_PATH,
  modelPath = `${DEFAULT_ASSET_PATH}/holistic_landmarker.task`,
  runningMode = 'IMAGE',
  parts = ['body', 'leftHand', 'rightHand', 'face'],
  minPoseDetectionConfidence = 0.5,
  minPosePresenceConfidence = 0.5,
} = {}) {
  // Resolve against the document, not this module. A bare `./vendor/...` in a
  // dynamic import is relative to src/backends/, which is not where the assets
  // live — and the resulting 404 only shows up at runtime.
  const base = new URL(`${assetPath}/`, document.baseURI).href;
  const model = new URL(modelPath, document.baseURI).href;

  // Imported at call time so the module graph stays loadable under Node (tests).
  const { HolisticLandmarker, FilesetResolver } = await import(
    /* @vite-ignore */ `${base}vision_bundle.mjs`
  );

  const fileset = await FilesetResolver.forVisionTasks(`${base}wasm`);
  const landmarker = await HolisticLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: model, delegate: 'GPU' },
    runningMode,
    minPoseDetectionConfidence,
    minPosePresenceConfidence,
    outputFaceBlendshapes: false,
    outputPoseSegmentationMasks: false,
  });

  const scratch = document.createElement('canvas');
  const want = new Set(parts);

  return {
    id: 'mediapipe-holistic',
    revision: '1.1.1',
    runningMode,
    declaredParts: [...want],

    /** Connection sets MediaPipe owns, for the harness to draw the face mesh. */
    connections: {
      face: HolisticLandmarker.FACE_LANDMARKS_CONTOURS ?? [],
      faceOval: HolisticLandmarker.FACE_LANDMARKS_FACE_OVAL ?? [],
    },

    /**
     * Run one detection with the source rotated `deg` clockwise. Returns points
     * in the ROTATED frame; the caller maps them back.
     */
    run(source, deg, timestampMs) {
      const { w, h } = sourceSize(source);
      const image = deg === 0 ? source : drawRotated(scratch, source, deg, w, h);

      const res = runningMode === 'VIDEO'
        ? landmarker.detectForVideo(image, timestampMs)
        : landmarker.detect(image);

      // Parts are derived downstream from the points themselves, so there is no
      // separate "found" map to fall out of sync with them.
      const points = [];
      if (want.has('body')) pushPart(points, 'body', res.poseLandmarks?.[0], BODY_NAMES);
      if (want.has('leftHand')) pushPart(points, 'leftHand', res.leftHandLandmarks?.[0], HAND_NAMES);
      if (want.has('rightHand')) pushPart(points, 'rightHand', res.rightHandLandmarks?.[0], HAND_NAMES);
      if (want.has('face')) pushPart(points, 'face', res.faceLandmarks?.[0], null);

      // World landmarks are metres from the hip midpoint, and are the only output
      // worth computing an angle from — the normalised z has no consistent scale
      // and is not orthogonal to the image plane.
      //
      // They are camera-aligned, so feeding the model a rotated image returns a
      // skeleton rotated about the optical axis by the same amount. Bone-to-bone
      // angles survive that; anything measured against an external axis (trunk
      // to vertical, knee valgus) would jump 90 degrees the instant the rotation
      // lock changed. So un-rotate them back into the source camera frame here.
      const world = res.poseWorldLandmarks?.[0]
        ? res.poseWorldLandmarks[0].map((lm, i) => {
            const { x, y } = unrotateWorld(lm.x, lm.y, deg);
            return { index: i, name: BODY_NAMES[i], x, y, z: lm.z };
          })
        : null;

      return { points, world };
    },

    close() { landmarker.close?.(); },
  };
}
