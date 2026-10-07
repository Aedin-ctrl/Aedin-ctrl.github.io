// Turns per-frame scores into a calm "current match" (research/01 §5.1–5.2):
//   - each meme's score is smoothed with an EMA (tau ms),
//   - a meme must reach ENTER and stay the leader for DWELL ms before it is shown,
//   - a shown meme is kept at least HOLD ms, and replaced only by one that leads it by MARGIN
//     (and has itself dwelled), or dropped when it falls below EXIT,
//   - a new meme is only shown if it also leads the runner-up by ENTER_MARGIN (a near tie shows nothing),
//   - frames with no person (ranked = null) keep the current match for GRACE ms.

export const WINNER_DEFAULTS = { enter: 0.55, exit: 0.45, margin: 0.06, enterMargin: 0.05, dwell: 300, hold: 700, tau: 250, grace: 450 };

export class WinnerPicker {
  constructor(opts = {}) {
    this.o = { ...WINNER_DEFAULTS, ...opts };
    this.reset();
  }
  reset() { this.s = new Map(); this.cur = null; this.since = 0; this.cand = null; this.candSince = 0; this.lastT = null; this.lastSeen = 0; }

  // ranked: [{ id, score }] for this frame (any order), or null when nobody is tracked.
  update(ranked, now) {
    const o = this.o;
    if (!ranked) {
      if (this.cur && now - this.lastSeen > o.grace) { this.cur = null; this.cand = null; }
      return this.result();
    }
    this.lastSeen = now;
    const dt = this.lastT === null ? Infinity : Math.max(0, now - this.lastT);
    this.lastT = now;
    const a = Number.isFinite(dt) ? 1 - Math.exp(-dt / o.tau) : 1;
    for (const r of ranked) {
      const prev = this.s.get(r.id);
      this.s.set(r.id, prev === undefined ? r.score : prev + a * (r.score - prev));
    }
    let top = null, topS = -1, second = -1;
    for (const [id, v] of this.s) { if (v > topS) { second = topS; top = id; topS = v; } else if (v > second) second = v; }
    const clear = topS - Math.max(0, second) >= o.enterMargin;
    const curS = this.cur ? this.s.get(this.cur) ?? 0 : 0;

    if (!this.cur) {
      if (topS >= o.enter && clear && this.dwell(top, now)) this.lock(top, now);
      else if (topS < o.enter || !clear) this.cand = null;
    } else {
      const held = now - this.since >= o.hold;
      if (curS < o.exit && held) { this.cur = null; this.cand = null; if (topS >= o.enter && this.dwell(top, now)) this.lock(top, now); }
      else if (top !== this.cur && topS >= o.enter && topS >= curS + o.margin) {
        if (this.dwell(top, now) && held) this.lock(top, now);
      } else this.cand = null;
    }
    return this.result();
  }
  dwell(id, now) {
    if (this.cand !== id) { this.cand = id; this.candSince = now; }
    return now - this.candSince >= this.o.dwell;
  }
  lock(id, now) { this.cur = id; this.since = now; this.cand = null; }
  result() {
    const smooth = [...this.s].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score);
    return { winner: this.cur, smooth };
  }
}
