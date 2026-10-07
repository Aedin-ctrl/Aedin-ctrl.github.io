// Hand detection off the main thread. Receives camera frames (VideoFrame/ImageBitmap, transferred),
// runs MediaPipe HandLandmarker, posts landmarks back. One frame in flight at a time.
import { FilesetResolver, HandLandmarker } from '../../vendor/mediapipe/vision_bundle.mjs';

const WASM = new URL('../../vendor/mediapipe/wasm', import.meta.url).href;
const MODEL = new URL('../../vendor/mediapipe/hand_landmarker.task', import.meta.url).href;
let lm = null, lastTs = 0;

self.onmessage = async ({ data: m }) => {
  if (m.type === 'init') {
    try {
      const fs = await FilesetResolver.forVisionTasks(WASM, true);      // module loader variant (sets ModuleFactory)
      const make = (delegate) => HandLandmarker.createFromOptions(fs, {
        baseOptions: { modelAssetPath: MODEL, delegate },
        runningMode: 'VIDEO', numHands: m.numHands,
        minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
        canvas: new OffscreenCanvas(1, 1),
      });
      let delegate = m.delegate;
      try { lm = await make(delegate); } catch { delegate = 'CPU'; lm = await make('CPU'); }
      postMessage({ type: 'ready', delegate });
    } catch (e) {
      postMessage({ type: 'error', message: String(e?.message || e) });
    }
  } else if (m.type === 'options') {
    try { await lm?.setOptions({ numHands: m.numHands }); } catch (e) { postMessage({ type: 'error', message: String(e?.message || e) }); }
  } else if (m.type === 'frame') {
    const ts = m.ts > lastTs ? m.ts : lastTs + 1;
    lastTs = ts;
    const t0 = performance.now();
    let r = null;
    try { r = lm.detectForVideo(m.frame, ts); }
    catch (e) { postMessage({ type: 'frame-error', message: String(e?.message || e) }); }
    finally { m.frame.close?.(); }
    postMessage({ type: 'result', ts: m.ts, ms: performance.now() - t0,
      landmarks: r?.landmarks ?? [], worldLandmarks: r?.worldLandmarks ?? [], handedness: r?.handedness ?? [] });
  }
};
