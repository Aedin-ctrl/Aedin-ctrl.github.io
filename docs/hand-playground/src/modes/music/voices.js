// Synth voices for the Music tab (research/21). All route into a shared music bus.
const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);

export function musicBus(a) {
  if (a.ctx._music) return a.ctx._music;
  const { ctx } = a;
  const input = ctx.createGain(); input.gain.value = 0.5;                  // −6 dB headroom
  // echo send: 330 ms, feedback 0.3, darkened
  const delay = ctx.createDelay(1); delay.delayTime.value = 0.33;
  const fb = ctx.createGain(); fb.gain.value = 0.3;
  const dark = ctx.createBiquadFilter(); dark.type = 'lowpass'; dark.frequency.value = 2500;
  const echo = ctx.createGain(); echo.gain.value = 0.18;
  input.connect(a.bus);
  input.connect(delay); delay.connect(dark).connect(fb).connect(delay); dark.connect(echo).connect(a.bus);
  return (a.ctx._music = { input, echo });
}

// ── theremin: two detuned saws + sine + sub, through a resonant lowpass ──
export class ThereminVoice {
  constructor(a) {
    const { ctx } = a, out = musicBus(a).input;
    this.ctx = ctx;
    this.pitch = ctx.createConstantSource(); this.pitch.offset.value = 0;        // cents offset from A2
    this.vib = ctx.createOscillator(); this.vib.frequency.value = 5.5;
    this.vibDepth = ctx.createGain(); this.vibDepth.gain.value = 0;
    this.vib.connect(this.vibDepth);
    this.filter = ctx.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 1200; this.filter.Q.value = 3;
    this.amp = ctx.createGain(); this.amp.gain.value = 0;
    this.filter.connect(this.amp).connect(out);
    this.gains = [];
    this.oscs = [['sawtooth', -7, 0.22], ['sawtooth', 7, 0.22], ['sine', 0, 0.35], ['sine', -1200, 0.25]].map(([type, det, g]) => {
      const o = ctx.createOscillator(), gain = ctx.createGain();
      this.gains.push(gain);
      o.type = type; o.frequency.value = midiHz(45); o.detune.value = det; gain.gain.value = g;
      this.pitch.connect(o.detune); this.vibDepth.connect(o.detune);
      o.connect(gain).connect(this.filter); o.start();
      return o;
    });
    this.pitch.start(); this.vib.start();
  }
  set(midi, vol, cutoff, vibCents, glide) {
    const t = this.ctx.currentTime;
    this.pitch.offset.setTargetAtTime((midi - 45) * 100, t, glide);
    this.amp.gain.setTargetAtTime(vol * 0.35, t, vol > 0 ? 0.02 : 0.05);
    this.filter.frequency.setTargetAtTime(cutoff, t, 0.04);
    this.vibDepth.gain.setTargetAtTime(vibCents, t, 0.1);
  }
  stop() {
    const t = this.ctx.currentTime;
    this.amp.gain.setTargetAtTime(0, t, 0.05);
    setTimeout(() => {
      for (const o of [...this.oscs, this.pitch, this.vib]) { try { o.stop(); } catch {} }
      for (const n of [...this.oscs, ...this.gains, this.pitch, this.vib, this.vibDepth, this.filter, this.amp]) { try { n.disconnect(); } catch {} }
    }, 400);
  }
}

// ── drums ────────────────────────────────────────────────────────────
function env(ctx, g, t, peak, decay) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + decay); }
function noiseSrc(a, t, dur) { const s = a.ctx.createBufferSource(); s.buffer = a.noiseBuf; s.start(t, Math.random() * 0.5); s.stop(t + dur); return s; }

export function drum(a, kind, v = 0.8) {
  const { ctx } = a, out = musicBus(a).input, t = ctx.currentTime + 0.003;
  const peak = 0.9 * 10 ** ((-24 * (1 - v ** 0.7)) / 20);
  if (kind === 'kick') {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(120 + 60 * v, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    env(ctx, g, t, peak, 0.45); o.connect(g).connect(out); o.start(t); o.stop(t + 0.5);
    const c = noiseSrc(a, t, 0.02), hp = ctx.createBiquadFilter(), cg = ctx.createGain();
    hp.type = 'highpass'; hp.frequency.value = 3000; env(ctx, cg, t, peak * 0.3, 0.015); c.connect(hp).connect(cg).connect(out);
  } else if (kind === 'snare') {
    const n = noiseSrc(a, t, 0.2), hp = ctx.createBiquadFilter(), g = ctx.createGain();
    hp.type = 'highpass'; hp.frequency.value = 1000 + 1500 * v; env(ctx, g, t, peak * 0.7, 0.18); n.connect(hp).connect(g).connect(out);
    const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'triangle';
    o.frequency.setValueAtTime(185, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.1);
    env(ctx, og, t, peak * 0.5, 0.1); o.connect(og).connect(out); o.start(t); o.stop(t + 0.15);
  } else if (kind === 'hat') {
    const bp = ctx.createBiquadFilter(), hp = ctx.createBiquadFilter(), g = ctx.createGain();
    bp.type = 'bandpass'; bp.frequency.value = 10000; hp.type = 'highpass'; hp.frequency.value = 7000;
    env(ctx, g, t, peak * 0.35, 0.04 + 0.04 * v); bp.connect(hp).connect(g).connect(out);
    for (const r of [2, 3, 4.16, 5.43, 6.79, 8.21]) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 40 * r; o.connect(bp); o.start(t); o.stop(t + 0.1); }
  } else if (kind === 'clap') {
    const bp = ctx.createBiquadFilter(), g = ctx.createGain(); bp.type = 'bandpass'; bp.frequency.value = 1200; bp.Q.value = 1.2;
    bp.connect(g).connect(out);
    g.gain.setValueAtTime(0.0001, t);
    for (let k = 0; k < 3; k++) { g.gain.setValueAtTime(peak * 0.6, t + k * 0.011); g.gain.exponentialRampToValueAtTime(peak * 0.15, t + k * 0.011 + 0.009); }
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.23);
    noiseSrc(a, t, 0.25).connect(bp);
  } else if (kind === 'tom') {
    const o = ctx.createOscillator(), g = ctx.createGain(), f0 = 160;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 / 2, t + 0.2);
    env(ctx, g, t, peak * 0.8, 0.3); o.connect(g).connect(out); o.start(t); o.stop(t + 0.35);
  }
}

// ── plucked string by frequency (Karplus–Strong), with pan ─────────────
const cache = new Map();
export function pluckHz(a, hz, v = 0.6, pan = 0) {
  const { ctx } = a, out = musicBus(a).input, key = Math.round(hz);
  let buf = cache.get(key);
  if (!buf) {
    const sr = ctx.sampleRate, len = Math.floor(sr * 1.8), N = Math.max(2, Math.round(sr / hz));
    buf = ctx.createBuffer(1, len, sr); const y = buf.getChannelData(0);
    for (let i = 0; i < N; i++) y[i] = Math.random() * 2 - 1;
    for (let i = N; i < len; i++) y[i] = 0.4975 * (y[i - N] + y[i - N + 1]);
    cache.set(key, buf);
    if (cache.size > 64) cache.delete(cache.keys().next().value);
  }
  const s = ctx.createBufferSource(), g = ctx.createGain(), p = ctx.createStereoPanner();
  s.buffer = buf; g.gain.value = 0.12 + 0.3 * v; p.pan.value = pan;
  s.connect(g).connect(p).connect(out); s.start();
  s.onended = () => { s.disconnect(); g.disconnect(); p.disconnect(); };
}

export { midiHz };
