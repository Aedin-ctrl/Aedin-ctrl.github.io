// Air harp: glowing strings across the screen, tuned to a pentatonic scale.
// Sweep a fingertip through a string to pluck it — faster sweeps pluck louder.
const COUNT = 9;
const HUES = [340, 20, 45, 90, 160, 190, 215, 260, 300];

export class Harp {
  name = 'Harp';
  hint = 'Sweep a fingertip through the strings to play · faster = louder';

  constructor({ sfx, size }) {
    this.sfx = sfx; this.size = size;
    this.strings = Array.from({ length: COUNT }, (_, i) => ({ amp: 0, phase: 0, hue: HUES[i], step: i }));
    this.prev = new Map();        // hand id → last tip x positions
    this.t = 0;
  }

  x(i) { const { w } = this.size(); const m = w * 0.14; return m + ((w - 2 * m) * i) / (COUNT - 1); }

  update(dt, hands) {
    this.t += dt;
    const { h } = this.size(), top = h * 0.12, bottom = h * 0.9;
    const live = new Set();
    for (const hand of hands) {
      live.add(hand.id);
      const prevEntry = this.prev.get(hand.id);
      const before = prevEntry && this.t - prevEntry.t < 0.1 ? prevEntry.tips : null;   // stale after a tab switch
      // look a frame ahead so the note lands when your finger visually crosses the string
      const now = hand.tips.map((t) => ({ x: t.x + t.vx * 0.03, y: t.y, vx: t.vx }));
      if (before) now.forEach((t, k) => {
        const b = before[k];
        if (!b || t.y < top || t.y > bottom) return;
        for (let i = 0; i < COUNT; i++) {
          const sx = this.x(i);
          if ((b.x - sx) * (t.x - sx) < 0) {
            const s = this.strings[i];
            const v = Math.min(1, Math.abs(t.vx) / 1800);
            if (this.t - (s.last ?? -1) < 0.06) continue;
            s.last = this.t; s.amp = Math.min(1, s.amp + 0.4 + v * 0.6); s.hitY = t.y;
            this.sfx.pluck(s.step, v);
          }
        }
      });
      this.prev.set(hand.id, { t: this.t, tips: now });
    }
    for (const id of this.prev.keys()) if (!live.has(id)) this.prev.delete(id);
    for (const s of this.strings) { s.amp *= Math.exp(-dt * 2.2); s.phase += dt * 38; }
  }

  draw(g) {
    const { h } = this.size(), top = h * 0.12, bottom = h * 0.9;
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    this.strings.forEach((s, i) => {
      const x = this.x(i), a = s.amp;
      const trace = () => {
        g.beginPath(); g.moveTo(x, top);
        for (let k = 1; k <= 24; k++) {
          const y = top + ((bottom - top) * k) / 24;
          const env = Math.sin((Math.PI * k) / 24);                  // fixed ends, widest in the middle
          g.lineTo(x + Math.sin(s.phase + k * 0.9) * a * 14 * env, y);
        }
        g.stroke();
      };
      g.strokeStyle = `hsla(${s.hue},95%,62%,${0.12 + 0.3 * a})`; g.lineWidth = 8 + 10 * a; trace();
      g.strokeStyle = `hsla(${s.hue},100%,85%,${0.55 + 0.45 * a})`; g.lineWidth = 1.6 + a; trace();
      g.fillStyle = `hsla(${s.hue},100%,85%,0.7)`;
      for (const y of [top, bottom]) { g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill(); }
    });
    g.restore();
  }
}
