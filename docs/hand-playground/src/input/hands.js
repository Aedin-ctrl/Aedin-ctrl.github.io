// Webcam + MediaPipe HandLandmarker → hand pointers { id, kind:'hand', x, y, down, progress, conf }.
// Runs on the main thread for now (research/00: move to a Worker only if the HUD shows jank).
// The video is shown mirrored with CSS; landmarks arrive in raw (unmirrored) camera space.
import { FilesetResolver, HandLandmarker } from '../../vendor/mediapipe/vision_bundle.mjs';
import { CONFIG } from '../config.js';
import { pinchRatio, PinchDetector, OneEuro2D } from './gesture.js';

const WASM = new URL('../../vendor/mediapipe/wasm', import.meta.url).href;
const MODEL = new URL('../../vendor/mediapipe/hand_landmarker.task', import.meta.url).href;

// Asks for the camera; the caller attaches the stream (so a stale start can't clobber a newer one).
export async function openCamera() {
  if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('no getUserMedia'), { name: 'NotSupportedError' });
  const { width, height, frameRate } = CONFIG.camera;
  return navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: width }, height: { ideal: height }, frameRate: { ideal: frameRate }, facingMode: 'user' },
    audio: false,
  });
}
export async function attachCamera(video, stream) {
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
}

export async function createLandmarker() {
  const fileset = await FilesetResolver.forVisionTasks(WASM);
  const make = (delegate) => HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL, delegate },
    runningMode: 'VIDEO',
    numHands: CONFIG.numHands,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  const wanted = /Android/i.test(navigator.userAgent) ? 'CPU' : CONFIG.delegate;
  try {
    return { landmarker: await make(wanted), delegate: wanted };
  } catch (e) {
    if (wanted === 'CPU') throw e;
    console.warn('[hands] GPU delegate failed, falling back to CPU', e);
    return { landmarker: await make('CPU'), delegate: 'CPU' };
  }
}

// Prefer a worker (frees ~30 ms of main thread per camera frame); fall back to the main thread.
export async function createTracker() {
  if (CONFIG.worker && typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined') {
    let worker = null;
    try {
      worker = new Worker(new URL('./track.worker.js', import.meta.url), { type: 'module' });
      const delegate = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('worker init timed out')), 12000);
        worker.onmessage = ({ data }) => {
          if (data.type === 'ready') { clearTimeout(timer); resolve(data.delegate); }
          else if (data.type === 'error') { clearTimeout(timer); reject(new Error(data.message)); }
        };
        worker.onerror = (e) => { clearTimeout(timer); reject(new Error(e.message || 'worker failed')); };
        const wanted = /Android/i.test(navigator.userAgent) ? 'CPU' : CONFIG.delegate;
        worker.postMessage({ type: 'init', numHands: CONFIG.numHands, delegate: wanted });
      });
      return { worker, delegate, where: 'worker' };
    } catch (e) {
      worker?.terminate();                         // don't leave a half-started worker loading a second model
      console.warn('[hands] worker tracking unavailable, using the main thread', e);
    }
  }
  const made = await createLandmarker();
  return { ...made, where: 'main' };
}

export class HandInput {
  constructor(video, source) {
    this.video = video;
    this.landmarker = source.landmarker || null;
    this.worker = source.worker || null;
    this.tracks = [];
    this.nextId = 1;
    this.lastTs = 0;
    this.times = [];             // detect ms, rolling
    this.running = false;
  }

  // Maps a raw normalized landmark to screen px for a mirrored, object-fit: cover video.
  mapper() {
    const vw = this.video.videoWidth || 640, vh = this.video.videoHeight || 480;
    const cw = innerWidth, ch = innerHeight;
    const s = Math.max(cw / vw, ch / vh);
    const ox = (cw - vw * s) / 2, oy = (ch - vh * s) / 2;
    return (p) => ({ x: ox + (1 - p.x) * vw * s, y: oy + p.y * vh * s, z: (p.z || 0) * vw * s });   // z: negative = nearer
  }

  start() {
    this.running = true;
    const v = this.video;
    if (this.worker) return this.startWorker();
    if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
      const step = (_, meta) => {
        if (!this.running) return;
        // time the frame was captured (steadier than "now" for velocity/prediction)
        const t = meta?.captureTime ?? meta?.expectedDisplayTime;
        try { this.detect(t); } catch (e) { console.warn('[hands] detect failed', e); }   // one bad frame must not stop tracking
        v.requestVideoFrameCallback(step);
      };
      v.requestVideoFrameCallback(step);
    } else {
      let lastTime = -1;
      const step = () => {
        if (!this.running) return;
        if (v.currentTime !== lastTime) { lastTime = v.currentTime; try { this.detect(); } catch (e) { console.warn('[hands] detect failed', e); } }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  }
  // Worker path: grab each new camera frame, transfer it, and apply results as they come back.
  startWorker() {
    const v = this.video;
    let busy = false;
    this.worker.onmessage = ({ data }) => {
      if (data.type !== 'result') return;
      busy = false;
      if (!this.running) return;
      this.times.push(data.ms);
      if (this.times.length > 120) this.times.shift();
      this.update(data, data.ts);
    };
    this.worker.onerror = (e) => { busy = false; console.warn('[hands] worker error', e); };
    let sentAt = 0;
    const send = async (now, meta) => {
      if (!this.running) return;
      if (busy && performance.now() - sentAt > 1000) busy = false;     // a lost result must not stall tracking
      if (!busy && v.readyState >= 2) {
        busy = true; sentAt = performance.now();
        const t = meta?.captureTime ?? meta?.expectedDisplayTime ?? now;
        const ts = Math.min(t, performance.now());
        let frame = null;
        try {
          frame = typeof VideoFrame !== 'undefined' ? new VideoFrame(v, { timestamp: Math.round(ts * 1000) }) : await createImageBitmap(v);
          this.worker.postMessage({ type: 'frame', frame, ts }, [frame]);
        } catch (e) { busy = false; try { frame?.close(); } catch {} console.warn('[hands] frame capture failed', e); }
      }
      if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) v.requestVideoFrameCallback(send);
      else requestAnimationFrame((t) => send(t));
    };
    if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) v.requestVideoFrameCallback(send);
    else requestAnimationFrame((t) => send(t));
  }

  // Fewer hands = faster detection (MediaPipe searches every frame for any missing hand).
  async setNumHands(n) {
    if (n === this.numHands) return;
    this.numHands = n;
    if (this.worker) this.worker.postMessage({ type: 'options', numHands: n });
    else try { await this.landmarker?.setOptions({ numHands: n }); } catch (e) { console.warn('[hands] setOptions failed', e); }
  }

  stop() { this.running = false; this.tracks = []; }

  detect(capture) {
    if (this.video.readyState < 2) return;
    const now = performance.now();
    const tCap = capture && capture <= now && now - capture < 200 ? capture : now;
    const ts = now > this.lastTs ? now : this.lastTs + 1;   // must strictly increase
    this.lastTs = ts;
    const result = this.landmarker.detectForVideo(this.video, ts);
    const took = performance.now() - now;
    this.times.push(took);
    if (this.times.length > 120) this.times.shift();
    this.update(result, tCap);
  }

  update(result, now) {
    const map = this.mapper();
    const dets = result.landmarks.map((lm, i) => {
      const pts = lm.map(map);
      const pr = pinchRatio(pts);
      const palm = { x: (pts[0].x + pts[5].x + pts[17].x) / 3, y: (pts[0].y + pts[5].y + pts[17].y) / 3 };
      // Cursor = thumb/index midpoint, so it stays put as the fingers close.
      const cursor = { x: (pts[4].x + pts[8].x) / 2, y: (pts[4].y + pts[8].y) / 2 };
      const world = result.worldLandmarks?.[i] ?? null;         // metres, hand-centred
      const handed = result.handedness?.[i]?.[0]?.categoryName ?? '';
      return { pts, world, handed, ratio: pr?.ratio ?? null, palmSize: pr?.palm ?? 80, palm, cursor };
    });

    // Match detections to existing tracks by palm distance (MediaPipe gives no track IDs).
    const free = new Set(this.tracks);
    for (const d of dets) {
      let best = null, bestD = Infinity;
      for (const t of free) {
        const dd = Math.hypot(t.palm.x - d.palm.x, t.palm.y - d.palm.y);
        if (dd < bestD && dd < d.palmSize * 3) { best = t; bestD = dd; }
      }
      if (!best) {
        best = { id: this.nextId++, seen: 0, pinch: new PinchDetector(CONFIG.pinch), filter: new OneEuro2D(CONFIG.oneEuro) };
        this.tracks.push(best);
      } else free.delete(best);
      best.palm = d.palm;
      best.pts = d.pts;
      best.world = d.world;
      best.handed = d.handed;
      best.ratio = d.ratio;
      best.seen++;
      best.lastSeen = now;                 // capture time (for filters/velocity)
      best.seenAt = performance.now();     // arrival time (for fading and expiry)
      best.pinch.update(d.ratio, now);
      const prev = best.pos, prevT = best.posT;
      best.pos = best.filter.filter(d.cursor, now / 1000);
      best.posT = now;
      best.raw = d.cursor;
      // velocity (px/ms) from a separate 5 Hz low-pass, not the filter's own derivative
      if (prev && prevT && now > prevT) {
        const dtv = now - prevT, a = 1 - Math.exp(-dtv / 32);
        const vx = (best.pos.x - prev.x) / dtv, vy = (best.pos.y - prev.y) / dtv;
        best.v = best.v ? { x: best.v.x + (vx - best.v.x) * a, y: best.v.y + (vy - best.v.y) * a } : { x: vx, y: vy };
      } else best.v = { x: 0, y: 0 };
    }
    const arrived = performance.now();
    this.tracks = this.tracks.filter((t) => arrived - t.seenAt <= CONFIG.handGraceMs);
  }

  // Called once per render frame. Instead of easing (which adds lag), the cursor is the filtered
  // position predicted forward to "now" from its velocity, and any jump when a new detection lands
  // is blended out over ~20 ms. The drawn landmarks are shifted by the same prediction.
  pointers(now) {
    const dt = Math.min(0.1, (now - (this.lastPointers || now)) / 1000);
    this.lastPointers = now;
    const blend = Math.exp(-dt / 0.02);
    return this.tracks
      .filter((t) => t.seen >= CONFIG.handAppearFrames && now - t.seenAt <= CONFIG.handGraceMs)   // expire even if the camera stalls
      .map((t) => {
        const age = now - t.seenAt;
        const v = t.v || { x: 0, y: 0 }, speed = Math.hypot(v.x, v.y) * 1000;           // px/s
        const gain = smoothstep(120, 500, speed);                                        // no prediction when nearly still
        const since = Math.max(0, now - t.posT);
        const decay = since > 50 ? Math.exp(-(since - 50) / 40) : 1;                     // stop predicting a stale sample
        const h = Math.min(since, 60) * gain * decay;
        const pred = { x: t.pos.x + v.x * h, y: t.pos.y + v.y * h };
        if (t.lastPosT !== t.posT) {                                                     // new sample: carry the visual jump as an offset
          if (t.shown) t.offset = { x: t.shown.x - pred.x, y: t.shown.y - pred.y };
          t.lastPosT = t.posT;
        }
        t.offset = t.offset ? { x: t.offset.x * blend, y: t.offset.y * blend } : { x: 0, y: 0 };
        const x = pred.x + t.offset.x, y = pred.y + t.offset.y;
        t.shown = { x, y };
        const sx = x - (t.raw?.x ?? x), sy = y - (t.raw?.y ?? y);                        // shift landmarks with the cursor
        const pts = t.pts.map((q) => ({ x: q.x + sx, y: q.y + sy, z: q.z || 0 }));
        return {
          id: `h${t.id}`, kind: 'hand', x, y,
          down: t.pinch.isPinched(), progress: t.pinch.progress, ratio: t.ratio,
          conf: age < 70 ? 1 : Math.max(0.25, 1 - age / CONFIG.handGraceMs), pts,
          world: t.world, handed: t.handed,
        };
      });
  }

  stats() {
    const s = [...this.times].sort((a, b) => a - b);
    const pick = (q) => (s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0);
    return { p50: pick(0.5), p95: pick(0.95), hands: this.tracks.length };
  }
}

const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
