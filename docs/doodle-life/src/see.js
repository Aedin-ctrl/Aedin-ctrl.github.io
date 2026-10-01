// "Let them see you": an opt-in webcam face finder (MediaPipe BlazeFace, 230 KB, on the main
// thread at ~15 fps). Your face's spot on screen becomes what every googly eye looks at; leaning
// in close excites them. Frames never leave the page; a small mirrored preview shows it's on.

const V = (p) => new URL(`../vendor/mediapipe/${p}`, import.meta.url).href;

export class Seer {
  constructor(world, preview) { this.world = world; this.preview = preview; this.on = false; this.det = null; }
  async start() {
    const video = this.preview;
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false });
    video.srcObject = stream; video.muted = true; video.playsInline = true; await video.play();
    if (!this.det) {
      // loaded only when the camera is turned on, so the page itself stays light
      const { FilesetResolver, FaceDetector } = await import('../vendor/mediapipe/vision_bundle.mjs');
      const fs = await FilesetResolver.forVisionTasks(V('wasm'));
      this.det = await FaceDetector.createFromOptions(fs, { baseOptions: { modelAssetPath: V('blaze_face_short_range.tflite'), delegate: 'CPU' }, runningMode: 'VIDEO', minDetectionConfidence: 0.4 });
    }
    this.on = true; this.stream = stream; video.hidden = false;
    let last = 0;
    const step = (now) => {
      if (!this.on) return;
      if (now - last > 60 && video.readyState >= 2) {
        last = now;
        const r = this.det.detectForVideo(video, now);
        const d = r.detections?.[0];
        if (d) {
          const b = d.boundingBox, vw = video.videoWidth, vh = video.videoHeight;
          // the screen is a mirror: your left is the screen's left
          const cx = 1 - (b.originX + b.width / 2) / vw, cy = (b.originY + b.height * 0.4) / vh;
          const W = this.world;
          const prev = W.face;
          W.face = { x: cx * W.w, y: cy * W.ground, size: b.width / vw, at: now };
          if (prev && W.face.size > 0.42 && prev.size <= 0.42) W.leanIn?.();
        } else if (this.world.face && now - this.world.face.at > 800) this.world.face = null;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  stop() {
    this.on = false; this.world.face = null;
    for (const t of this.stream?.getTracks() || []) t.stop();
    this.preview.hidden = true;
  }
}
