// Pen input: pointer events → strokes (arrays of {x, y, t}), lightly smoothed, with a "doodle
// finished" callback after a pause. Works with mouse, pen and touch.
export class Pen {
  constructor(canvas, { onStroke, onDone, isPoke, idleMs = 750 } = {}) {
    Object.assign(this, { canvas, onStroke, onDone, isPoke, idleMs });
    this.strokes = []; this.cur = null; this.timer = 0; this.enabled = true;
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) canvas.addEventListener(ev, (e) => this.up(e));
  }
  pos(e) { const r = this.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() }; }
  down(e) {
    if (!this.enabled || e.button > 0) return;
    this.canvas.setPointerCapture?.(e.pointerId);
    clearTimeout(this.timer);
    this.cur = [this.pos(e)];
    this.strokes.push(this.cur);
  }
  move(e) {
    if (!this.cur) return;
    const evs = e.getCoalescedEvents?.() || [e];
    for (const ce of evs) {
      const p = this.pos(ce), last = this.cur[this.cur.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) < 1.5) continue;
      // light exponential smoothing so mouse jitter doesn't read as wobble
      this.cur.push({ x: last.x + (p.x - last.x) * 0.6, y: last.y + (p.y - last.y) * 0.6, t: p.t });
    }
    this.onStroke?.(this.strokes);
  }
  up() {
    if (!this.cur) return;
    // a tap on a creature is a poke, not ink: drop it so it can't join the next doodle
    const c = this.cur, tap = c.every((p) => Math.hypot(p.x - c[0].x, p.y - c[0].y) < 6);
    if (tap && this.isPoke?.(c[0])) {
      this.strokes.pop(); this.cur = null; this.onStroke?.(this.strokes);
      if (this.strokes.length) { clearTimeout(this.timer); this.timer = setTimeout(() => this.finish(), this.idleMs); }
      return;
    }
    if (this.cur.length < 2) this.cur.push({ ...this.cur[0], x: this.cur[0].x + 0.5 });   // a dot
    this.cur = null;
    this.onStroke?.(this.strokes);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.finish(), this.idleMs);
  }
  finish() {
    if (this.cur || !this.strokes.length) return;
    const strokes = this.strokes;
    this.strokes = [];
    this.onDone?.(strokes);
  }
  cancel() { clearTimeout(this.timer); this.strokes = []; this.cur = null; }
}

// Bounding box of a stroke set.
export function bounds(strokes) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) for (const p of s) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

// Draws strokes as round, slightly tapered ink lines.
export function inkStrokes(g, strokes, color = '#2A2D34', width = 4) {
  g.save();
  g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = color; g.lineWidth = width;
  for (const s of strokes) {
    if (s.length < 2) continue;
    g.beginPath(); g.moveTo(s[0].x, s[0].y);
    for (let i = 1; i < s.length - 1; i++) g.quadraticCurveTo(s[i].x, s[i].y, (s[i].x + s[i + 1].x) / 2, (s[i].y + s[i + 1].y) / 2);
    g.lineTo(s[s.length - 1].x, s[s.length - 1].y);
    g.stroke();
  }
  g.restore();
}
