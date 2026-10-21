// Pinch detector with hysteresis + One Euro filter (research/02 §1.3, §2.2).
// OneEuroFilter is condensed from Géry Casiez's OneEuroFilter.js (BSD-3-Clause, Inria 2019).

const WRIST = 0, THUMB_TIP = 4, INDEX_MCP = 5, INDEX_TIP = 8, MIDDLE_MCP = 9, PINKY_MCP = 17;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Points must already be in an isotropic space (screen px), not normalized x/y.
export function pinchRatio(p) {
  const palm = (dist(p[WRIST], p[MIDDLE_MCP]) + dist(p[INDEX_MCP], p[PINKY_MCP])) / 2;
  if (palm < 1e-6) return null;
  return { ratio: dist(p[THUMB_TIP], p[INDEX_TIP]) / palm, palm };
}

export class PinchDetector {
  constructor({ enter, exit, armOpen, enterMs, exitMs }) {
    Object.assign(this, { enter, exit, armOpen, enterMs, exitMs });
    this.reset();
  }
  reset() { this.state = 'OPEN'; this.armed = false; this.since = 0; this.minRatio = Infinity; this.progress = 0; }
  isPinched() { return this.state === 'PINCHED' || this.state === 'RELEASE_CANDIDATE'; }

  update(ratio, now) {
    if (ratio == null) return;
    const rel = this.exit - this.enter;
    switch (this.state) {
      case 'OPEN':
        if (ratio >= this.armOpen) this.armed = true;
        this.fast = this.armed && ratio <= this.enter * 0.7 ? (this.fast || 0) + 1 : 0;
        if (this.fast >= 2) {                                           // decisive on 2 frames in a row: no need to wait
          this.state = 'PINCHED'; this.armed = false; this.minRatio = ratio; this.fast = 0;
        } else if (this.armed && ratio <= this.enter) { this.state = 'PINCH_CANDIDATE'; this.since = now; }
        break;
      case 'PINCH_CANDIDATE':
        if (ratio > this.enter) this.state = 'OPEN';
        else if (now - this.since >= this.enterMs) { this.state = 'PINCHED'; this.armed = false; this.minRatio = ratio; }
        break;
      case 'PINCHED':
        this.minRatio = Math.min(this.minRatio, ratio);
        if (ratio >= this.exit || ratio >= this.minRatio + rel) { this.state = 'RELEASE_CANDIDATE'; this.since = now; }
        break;
      case 'RELEASE_CANDIDATE':
        if (ratio < this.exit && ratio < this.minRatio + rel) this.state = 'PINCHED';
        else if (now - this.since >= this.exitMs) this.state = 'OPEN';
        break;
    }
    this.progress = Math.min(1, Math.max(0, (this.armOpen - ratio) / (this.armOpen - this.enter)));
  }
}

class LowPass {
  constructor() { this.s = undefined; }
  filter(x, a) { this.s = this.s === undefined ? x : a * x + (1 - a) * this.s; return this.s; }
  reset() { this.s = undefined; }
}

export class OneEuroFilter {
  constructor({ minCutoff = 1, beta = 0, dCutoff = 1 } = {}) {
    Object.assign(this, { minCutoff, beta, dCutoff });
    this.x = new LowPass(); this.dx = new LowPass(); this.tPrev = undefined;
  }
  static alpha(cutoff, dt) { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); }
  filter(value, t) {                        // t in seconds
    if (this.tPrev === undefined) { this.tPrev = t; this.dx.filter(0, 1); return this.x.filter(value, 1); }
    const dt = Math.max(t - this.tPrev, 1e-3); this.tPrev = t;
    const edValue = this.dx.filter((value - this.x.s) / dt, OneEuroFilter.alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edValue);
    return this.x.filter(value, OneEuroFilter.alpha(cutoff, dt));
  }
  reset() { this.x.reset(); this.dx.reset(); this.tPrev = undefined; }
}

export class OneEuro2D {
  constructor(opts) { this.fx = new OneEuroFilter(opts); this.fy = new OneEuroFilter(opts); }
  filter(p, t) { return { x: this.fx.filter(p.x, t), y: this.fy.filter(p.y, t) }; }
  reset() { this.fx.reset(); this.fy.reset(); }
}
