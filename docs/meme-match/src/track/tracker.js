// Main-thread side of the tracking worker: starts it, sends frames, hands back observations.
// One frame in flight at a time (HP research/03), so a slow frame never queues up lag.

export class Tracker {
  constructor(worker, delegates) {
    this.worker = worker;
    this.delegates = delegates;
    this.pending = new Map();
    this.nextId = 1;
    this.times = [];
    worker.onmessage = ({ data }) => {
      if (data.type !== 'result') return;
      const cb = this.pending.get(data.id);
      this.pending.delete(data.id);
      if (data.obs?.ms) { this.times.push(data.obs.ms); if (this.times.length > 90) this.times.shift(); }
      cb?.(data.error ? null : data.obs, data.error);
    };
  }

  // opts: { runningMode: 'VIDEO'|'IMAGE', delegates: {face,hand,pose}, thresholds: {detection,presence,tracking}, numHands }
  static async create(opts = {}) {
    const worker = new Worker(new URL('./track.worker.js', import.meta.url), { type: 'module' });
    const delegates = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('tracker start timed out')), 30000);
      worker.onmessage = ({ data }) => {
        if (data.type === 'ready') { clearTimeout(timer); resolve(data.delegates); }
        else if (data.type === 'error') { clearTimeout(timer); reject(new Error(data.message)); }
      };
      worker.onerror = (e) => { clearTimeout(timer); reject(new Error(e.message || 'tracking worker failed to load')); };
      worker.postMessage({ type: 'init', ...opts });
    });
    return new Tracker(worker, delegates);
  }

  // One frame from a video, image or canvas. Resolves with the observation (or null on error).
  // keep: also return a copy of the exact frame that was analysed (obs.image), so the caller can
  // draw picture and mask together and the mask never trails the video.
  async detect(source, ts = performance.now(), keep = false) {
    const w = source.videoWidth || source.naturalWidth || source.width;
    const h = source.videoHeight || source.naturalHeight || source.height;
    const isVideo = typeof VideoFrame !== 'undefined' && source instanceof HTMLVideoElement;
    const frame = isVideo ? new VideoFrame(source, { timestamp: Math.round(ts * 1000) }) : await createImageBitmap(source);
    const image = keep ? (isVideo ? frame.clone() : await createImageBitmap(source)) : null;
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, (obs) => { if (obs) obs.image = image; else image?.close(); resolve(obs); });
      this.worker.postMessage({ type: 'frame', frame, ts, id, width: w, height: h }, [frame]);
    });
  }

  // Tracks a playing <video> until stop(). onObs(obs) runs for every processed frame; with
  // { keep: true } each obs carries .image (VideoFrame or ImageBitmap) that the callee must close().
  pump(video, onObs, { keep = false } = {}) {
    this.running = true;
    let busy = false, sentAt = 0;
    const rvfc = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
    const next = () => (rvfc ? video.requestVideoFrameCallback(step) : requestAnimationFrame((t) => step(t)));
    const step = async (now, meta) => {
      if (!this.running) return;
      if (busy && performance.now() - sentAt > 1500) busy = false;      // a lost result must not stall tracking
      if (!busy && video.readyState >= 2 && video.videoWidth) {
        busy = true; sentAt = performance.now();
        const t = Math.min(meta?.captureTime ?? meta?.expectedDisplayTime ?? now ?? performance.now(), performance.now());
        this.detect(video, t, keep).then((obs) => { busy = false; if (obs && this.running) onObs(obs); else obs?.image?.close(); },
          (e) => { busy = false; console.warn('[track] frame failed', e); });
      }
      next();
    };
    next();
  }

  stop() { this.running = false; }

  stats() {
    if (!this.times.length) return null;
    const med = (k) => { const s = this.times.map((t) => t[k]).sort((a, b) => a - b); return s[s.length >> 1]; };
    return { face: med('face'), hand: med('hand'), pose: med('pose'), total: med('total') };
  }
}
