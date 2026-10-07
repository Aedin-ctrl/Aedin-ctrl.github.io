// Face + hands + pose tracking off the main thread (research/01 §1.6). Receives camera frames
// (VideoFrame or ImageBitmap, transferred), runs three MediaPipe tasks one after the other and posts
// the landmarks back as packed typed arrays (see src/track/frame.js for the layout).
//
// Delegates default to face on CPU, hands and pose on GPU: the fastest mix measured on the M2
// (≈35 ms for all three). Each task falls back to CPU on its own if GPU creation fails.
import { FilesetResolver, FaceLandmarker, GestureRecognizer, HandLandmarker, PoseLandmarker } from '../../vendor/mediapipe/vision_bundle.mjs';
import { packResult } from './frame.js';

const V = (p) => new URL(`../../vendor/mediapipe/${p}`, import.meta.url).href;
let tasks = null, lastTs = 0;

// The bundle clears self.ModuleFactory after every create, and the module loader is a cached
// import(), so without re-arming it the second create throws "ModuleFactory not set." (01 §1.6).
let factory = null;
const arm = () => { self.ModuleFactory = factory; };

async function make(Cls, fileset, file, pref, extra) {
  const errors = [];
  for (const delegate of pref === 'GPU' ? ['GPU', 'CPU'] : ['CPU']) {
    try {
      arm();
      const task = await Cls.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: V(file), delegate },
        canvas: new OffscreenCanvas(1, 1),            // GPU context for the worker (Safari needs it explicit)
        ...extra,
      });
      return { task, delegate };
    } catch (e) { errors.push(`${delegate}: ${e?.message || e}`); }
  }
  throw new Error(`${file}: ${errors.join(' / ')}`);
}

async function init(m) {
  const fileset = await FilesetResolver.forVisionTasks(V('wasm'), true);
  factory = (await import(V('wasm/vision_wasm_module_internal.js'))).default;
  const mode = m.runningMode || 'VIDEO';
  const t = m.thresholds || {};
  const d = m.delegates || {};
  const det = t.detection ?? 0.5, pres = t.presence ?? 0.5, trk = t.tracking ?? 0.5;
  const face = await make(FaceLandmarker, fileset, 'face_landmarker.task', d.face || 'CPU', {
    runningMode: mode, numFaces: 1,
    minFaceDetectionConfidence: det, minFacePresenceConfidence: pres, minTrackingConfidence: trk,
    outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true,
  });
  // Hands come from the GestureRecognizer by default: the same landmark model as HandLandmarker plus
  // a trained finger-shape classifier, all 8 scores per hand (m.gestures === false → plain landmarks).
  const hand = m.gestures === false
    ? await make(HandLandmarker, fileset, 'hand_landmarker.task', d.hand || 'GPU', {
      runningMode: mode, numHands: m.numHands ?? 2,
      minHandDetectionConfidence: det, minHandPresenceConfidence: pres, minTrackingConfidence: trk,
    })
    : await make(GestureRecognizer, fileset, 'gesture_recognizer.task', d.hand || 'GPU', {
      runningMode: mode, numHands: m.numHands ?? 2,
      minHandDetectionConfidence: det, minHandPresenceConfidence: pres, minTrackingConfidence: trk,
      cannedGesturesClassifierOptions: { maxResults: -1, scoreThreshold: 0 },
    });
  // Pose is optional: the emoji and hamster modes only need face + hands (≈10 ms a frame saved).
  const pose = m.pose === false ? null : await make(PoseLandmarker, fileset, 'pose_landmarker_lite.task', d.pose || 'GPU', {
    runningMode: mode, numPoses: 1,
    minPoseDetectionConfidence: det, minPosePresenceConfidence: pres, minTrackingConfidence: trk,
  });
  tasks = { face: face.task, hand: hand.task, pose: pose?.task ?? null, mode };
  return { face: face.delegate, hand: hand.delegate, pose: pose?.delegate ?? 'off' };
}

function detect(frame, ts) {
  const v = tasks.mode === 'VIDEO';
  const t0 = performance.now();
  const f = v ? tasks.face.detectForVideo(frame, ts) : tasks.face.detect(frame);
  const t1 = performance.now();
  const h = v ? (tasks.hand.recognizeForVideo ? tasks.hand.recognizeForVideo(frame, ts) : tasks.hand.detectForVideo(frame, ts))
    : (tasks.hand.recognize ? tasks.hand.recognize(frame) : tasks.hand.detect(frame));
  const t2 = performance.now();
  const p = !tasks.pose ? null : v ? tasks.pose.detectForVideo(frame, ts) : tasks.pose.detect(frame);
  const t3 = performance.now();
  return { f, h, p, ms: { face: t1 - t0, hand: t2 - t1, pose: t3 - t2, total: t3 - t0 } };
}

self.onmessage = async ({ data: m }) => {
  if (m.type === 'init') {
    try {
      const delegates = await init(m);
      postMessage({ type: 'ready', delegates });
    } catch (e) {
      postMessage({ type: 'error', message: String(e?.message || e) });
    }
  } else if (m.type === 'frame') {
    const ts = m.ts > lastTs ? m.ts : lastTs + 1;     // VIDEO mode needs strictly increasing timestamps
    lastTs = ts;
    let out = null, err = null;
    try {
      const r = detect(m.frame, ts);
      out = packResult(r.f, r.h, r.p, m.width ?? m.frame.displayWidth ?? m.frame.width, m.height ?? m.frame.displayHeight ?? m.frame.height);
      out.ms = r.ms;
      out.t = m.ts;
    } catch (e) { err = String(e?.message || e); }
    finally { m.frame.close?.(); }
    if (out) {
      const { transfer, ...obs } = out;
      postMessage({ type: 'result', ts: m.ts, id: m.id, obs }, transfer);
    } else postMessage({ type: 'result', ts: m.ts, id: m.id, error: err });
  }
};
