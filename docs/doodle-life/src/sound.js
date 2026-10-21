// Tiny procedural sounds (Web Audio), unlocked by the first pointer press.
export class Sound {
  constructor() {
    this.on = true; this.ctx = null;
    addEventListener('pointerdown', () => { if (!this.ctx) { try { this.ctx = new AudioContext(); } catch {} } this.ctx?.resume?.(); }, { capture: true });
  }
  // a short pitched blip; pitch follows the creature's size (small = high)
  play(name, c) {
    const ctx = this.ctx;
    if (!this.on || !ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime, base = 900 / Math.sqrt(Math.max(20, c?.size ?? 80) / 20);
    const o = ctx.createOscillator(), gn = ctx.createGain();
    o.connect(gn).connect(ctx.destination);
    const shapes = {
      spawn: () => { o.type = 'sine'; o.frequency.setValueAtTime(base * 0.6, t); o.frequency.exponentialRampToValueAtTime(base * 1.6, t + 0.12); gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(0.18, t + 0.02); gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.25); },
      boing: () => { o.type = 'triangle'; o.frequency.setValueAtTime(base * 0.5, t); o.frequency.exponentialRampToValueAtTime(base * 1.1, t + 0.18); gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(0.08, t + 0.02); gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.22); },
      chirp: () => { o.type = 'sine'; o.frequency.setValueAtTime(base * 1.8, t); o.frequency.exponentialRampToValueAtTime(base * 2.6, t + 0.06); gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(0.06, t + 0.01); gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.09); },
      beep: () => { o.type = 'square'; o.frequency.setValueAtTime(base * 0.7, t); gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(0.04, t + 0.01); gn.gain.setValueAtTime(0.04, t + 0.08); gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.12); },
      blub: () => { o.type = 'sine'; o.frequency.setValueAtTime(base * 0.9, t); o.frequency.exponentialRampToValueAtTime(base * 0.5, t + 0.1); gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(0.07, t + 0.01); gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.14); },
    };
    (shapes[name] || shapes.spawn)();
    o.start(t); o.stop(t + 0.3);
  }
}
