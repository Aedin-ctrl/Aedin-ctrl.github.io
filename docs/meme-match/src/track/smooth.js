// One Euro smoothing for whole landmark sets (research/01 §5.1). The filter maths is condensed from
// Géry Casiez's OneEuroFilter (BSD-3-Clause, Inria 2019); here it runs over a Float32Array so the
// 478 face points cost one loop, not 1,434 filter objects.
//
// Smoothing is for display only. Matching uses its own filter on the feature vector.

const alpha = (cutoff, dt) => { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); };

export class OneEuroVec {
  // scale: multiplies values into the units minCutoff/beta are tuned in (e.g. image px)
  constructor(n, { minCutoff = 1, beta = 0.01, dCutoff = 1 } = {}) {
    Object.assign(this, { n, minCutoff, beta, dCutoff });
    this.x = new Float32Array(n); this.dx = new Float32Array(n); this.t = undefined;
  }
  filter(v, t, scale = 1) {
    const out = new Float32Array(this.n);
    if (this.t === undefined || t - this.t > 0.5) {         // first sample, or a long gap: snap
      this.x.set(v); this.dx.fill(0); this.t = t; out.set(v); return out;
    }
    const dt = Math.max(1e-3, t - this.t); this.t = t;
    const ad = alpha(this.dCutoff, dt);
    for (let i = 0; i < this.n; i++) {
      const d = ((v[i] - this.x[i]) / dt) * scale;
      this.dx[i] += ad * (d - this.dx[i]);
      const a = alpha(this.minCutoff + this.beta * Math.abs(this.dx[i]), dt);
      this.x[i] += a * (v[i] - this.x[i]);
      out[i] = this.x[i];
    }
    return out;
  }
  reset() { this.t = undefined; }
}

// Smooths an observation in place of the raw one. Hands are re-identified by wrist position,
// because MediaPipe's hand order can swap between frames.
export class BodySmoother {
  constructor(opts = {}) {
    this.opts = { face: { minCutoff: 0.8, beta: 0.01 }, hand: { minCutoff: 1.2, beta: 0.02 }, pose: { minCutoff: 1, beta: 0.01 }, ...opts };
    this.face = null; this.pose = null; this.hands = [];
  }
  update(obs, tSec) {
    const px = obs.w;                                        // tune in image px (x scale; close enough for y)
    const out = { ...obs };
    if (obs.face) { this.face ??= new OneEuroVec(obs.face.length, this.opts.face); out.face = this.face.filter(obs.face, tSec, px); }
    else this.face?.reset();
    if (obs.pose) {
      this.pose ??= new OneEuroVec(obs.pose.length, this.opts.pose);
      out.pose = this.pose.filter(obs.pose, tSec, px);
    } else this.pose?.reset();
    // re-identify hands
    const prev = this.hands, next = [];
    out.hands = obs.hands.map((h) => {
      let best = null, bd = Infinity;
      for (const p of prev) {
        if (next.includes(p)) continue;
        const d = Math.hypot(p.wx - h.lm[0], p.wy - h.lm[1]);
        if (d < bd && d < 0.2) { bd = d; best = p; }
      }
      if (!best) best = { f: new OneEuroVec(h.lm.length, this.opts.hand) };
      next.push(best);
      const lm = best.f.filter(h.lm, tSec, px);
      best.wx = h.lm[0]; best.wy = h.lm[1];
      return { ...h, lm };
    });
    this.hands = next;
    return out;
  }
}
