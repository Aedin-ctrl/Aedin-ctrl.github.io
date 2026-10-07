// Mouse / touch / pen → the same pointer shape the hands produce.
// Press and release are queued, so a click that starts and ends inside one frame is still
// seen as down-then-up (and a fast drag still presses where it started).
export class PointerInput {
  constructor(target) {
    this.map = new Map();         // pointerId → { id, queue: [{ x, y, down, fixed }] }
    const get = (e) => {
      let p = this.map.get(e.pointerId);
      if (!p) { p = { id: `p${e.pointerId}`, queue: [{ x: e.clientX, y: e.clientY, down: false, fixed: false }] }; this.map.set(e.pointerId, p); }
      return p;
    };
    const edge = (e, down) => {
      if (down && e.target.closest?.('button, a, .tutorial, .dex')) return;
      const p = get(e);
      p.queue.push({ x: e.clientX, y: e.clientY, down, fixed: true });
    };
    target.addEventListener('pointerdown', (e) => edge(e, true));
    target.addEventListener('pointerup', (e) => edge(e, false));
    target.addEventListener('pointercancel', (e) => edge(e, false));
    target.addEventListener('pointermove', (e) => {
      const p = get(e), last = p.queue[p.queue.length - 1];
      if (last.fixed) p.queue.push({ x: e.clientX, y: e.clientY, down: last.down, fixed: false });
      else { last.x = e.clientX; last.y = e.clientY; }
    });
    target.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'mouse') this.map.delete(e.pointerId); });
  }

  // One queued state per pointer per frame.
  pointers() {
    const out = [];
    for (const p of this.map.values()) {
      if (p.queue.length > 1) p.queue.shift();
      const s = p.queue[0];
      out.push({ id: p.id, kind: 'mouse', x: s.x, y: s.y, down: s.down, conf: 1 });
    }
    return out;
  }
}
