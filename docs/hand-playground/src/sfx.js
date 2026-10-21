// sfx.js — minimal, pentatonic-tuned Web Audio SFX for MoleculeHands
// Usage:
//   import * as sfx from './sfx.js';
//   addEventListener('pointerdown', sfx.unlock, { once: true });   // audio needs one click/key
//   sfx.pop(sfx.stepForMass(16)); sfx.bond(2); sfx.snap(); sfx.discover(3);
//   every frame: sfx.tension(maxBondStretch01);

const ROOT = 261.63;              // C4 — change key here (e.g. 293.66 = D4)
const SCALE = [0, 2, 4, 7, 9];    // major pentatonic semitone offsets
const MAX_VOICES = 12;

let ctx = null, bus, comp, master, noiseBuf;
let voices = 0;
let muted = false;
try { muted = localStorage.getItem('sfx-muted') === '1'; } catch {}
const last = new Map();
let tens = null;

// ---------- helpers ----------
export function note(step, octave = 0) {
  const n = SCALE.length;
  const o = Math.floor(step / n) + octave;
  const deg = SCALE[((step % n) + n) % n];
  return ROOT * 2 ** (o + deg / 12);
}

// Heavier atoms = lower pitch. H(1)->~G5, C(12)->~G4, O(16)->~E4, Cl(35.5)->~C4
export function stepForMass(mass) {
  return Math.max(-3, Math.min(9, Math.round(8 - Math.log2(mass) * 1.5)));
}

const rnd = (a) => (Math.random() * 2 - 1) * a;          // +/- a
const ready = () => ctx && ctx.state === 'running' && !muted;
function throttle(key, ms) {
  const now = performance.now();
  if (now - (last.get(key) || 0) < ms) return false;
  last.set(key, now); return true;
}
const T = () => ctx.currentTime + 0.005;                  // tiny schedule-ahead

function tone({ freq, type = 'sine', t = T(), attack = 0.005, decay = 0.2,
                gain = 0.2, glide = 1, cents = rnd(6) }) {
  if (voices >= MAX_VOICES) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  const end = t + attack + decay;
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (glide !== 1) o.frequency.exponentialRampToValueAtTime(freq * glide, end);
  o.detune.value = cents;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain * (1 + rnd(0.1)), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  o.connect(g).connect(bus);
  o.start(t); o.stop(end + 0.05);
  voices++;
  o.onended = () => { voices--; o.disconnect(); g.disconnect(); };
}

// 2-operator FM "glass bell"
function bell(freq, t = T(), gain = 0.14, decay = 1.2, ratio = 3.5) {
  if (voices >= MAX_VOICES) return;
  const car = ctx.createOscillator(), mod = ctx.createOscillator();
  const mg = ctx.createGain(), g = ctx.createGain();
  car.frequency.value = freq; car.detune.value = rnd(4);
  mod.frequency.value = freq * ratio;
  mg.gain.setValueAtTime(freq * 1.2, t);                   // mod index -> brightness
  mg.gain.exponentialRampToValueAtTime(0.5, t + decay * 0.5);
  mod.connect(mg).connect(car.frequency);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  car.connect(g).connect(bus);
  car.start(t); mod.start(t);
  car.stop(t + decay + 0.05); mod.stop(t + decay + 0.05);
  voices++;
  car.onended = () => { voices--; [car, mod, mg, g].forEach((n) => n.disconnect()); };
}

function noise({ t = T(), freq = 1800, q = 1.5, decay = 0.06, gain = 0.25 }) {
  if (voices >= MAX_VOICES) return;
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf;
  f.type = 'bandpass'; f.frequency.value = freq * (1 + rnd(0.15)); f.Q.value = q;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  s.connect(f).connect(g).connect(bus);
  s.start(t, Math.random() * 0.5); s.stop(t + decay + 0.02);
  voices++;
  s.onended = () => { voices--; [s, f, g].forEach((n) => n.disconnect()); };
}

// ---------- lifecycle ----------
// Call synchronously inside a user-gesture handler (first click or key press).
export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
    bus = ctx.createGain(); bus.gain.value = 1;
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 4;
    comp.attack.value = 0.003; comp.release.value = 0.25;
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.6;
    const air = ctx.createBiquadFilter(); air.type = 'lowpass'; air.frequency.value = 9000;   // soften harsh highs
    // final brick-wall limiter so nothing ever clips
    const limit = ctx.createDynamicsCompressor();
    limit.threshold.value = -1.5; limit.knee.value = 0; limit.ratio.value = 20; limit.attack.value = 0.002; limit.release.value = 0.08;
    bus.connect(comp).connect(air).connect(master).connect(limit).connect(ctx.destination);
    // a small generated room: 1.3 s decaying noise impulse, high-passed so it never gets muddy
    const len = Math.floor(ctx.sampleRate * 1.3), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3; }
    const verb = ctx.createConvolver(); verb.buffer = ir;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 350;
    const wet = ctx.createGain(); wet.gain.value = 0.14;
    bus.connect(hp).connect(verb).connect(wet).connect(comp);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) ctx.suspend();                          // no droning theremin in a background tab
      else if (ctx.state !== 'running') ctx.resume();
    });
  }
  if (ctx.state !== 'running') return ctx.resume();
  return Promise.resolve();
}

export function setMuted(m) {
  muted = !!m;
  try { localStorage.setItem('sfx-muted', muted ? '1' : '0'); } catch {}
  if (master) master.gain.setTargetAtTime(muted ? 0 : 0.6, ctx.currentTime, 0.02);
}
export const isMuted = () => muted;
// Raw audio access for instruments (Music tab). Null until audio is unlocked.
export const audio = () => (ctx && ctx.state === 'running' ? { ctx, bus, noiseBuf } : null);
export const toggleMute = () => setMuted(!muted);

// ---------- events ----------
export function pop(step = 2) {                       // grab / pinch
  if (!ready() || !throttle('pop', 40)) return;
  const f = note(step, 1);
  tone({ freq: f, attack: 0.004, decay: 0.12, gain: 0.22, glide: 1.12 });
  tone({ freq: f * 2, attack: 0.002, decay: 0.05, gain: 0.04 });   // soft "click" overtone
}

export function release(step = 2) {
  if (!ready() || !throttle('release', 40)) return;
  tone({ freq: note(step, 1), attack: 0.006, decay: 0.1, gain: 0.12, glide: 0.9 });
}

export function hover(step = 4) {
  if (!ready() || !throttle('hover', 80)) return;
  tone({ freq: note(step, 2), attack: 0.002, decay: 0.03, gain: 0.04 });
}

export function bond(order = 1, step = 0) {           // 1 single, 2 double, 3 triple
  if (!ready() || !throttle('bond', 60)) return;
  const t = T();
  const steps = [step, step + 2, step + 4].slice(0, Math.max(1, Math.min(3, order)));
  steps.forEach((s, i) => {
    tone({ freq: note(s, 1), type: 'triangle', t: t + i * 0.045,
           attack: 0.004, decay: 0.28 + order * 0.04, gain: 0.16 - i * 0.02 });
    tone({ freq: note(s, 2), t: t + i * 0.045, attack: 0.003,             // sparkle, brighter per order
           decay: 0.12, gain: 0.02 * order });
  });
}

// Collision sound. v = 0..1 impact strength; kind picks the material.
export function impact(v = 0.5, kind = 'glass') {
  if (!ready() || !throttle('impact', 25)) return;
  const t = T(), g = 0.03 + 0.19 * Math.min(1, v);
  if (kind === 'wood') noise({ t, freq: 900 + 400 * v, q: 3, decay: 0.05, gain: g * 1.2 });
  else if (kind === 'bell') bell(note(7, 2), t, g * 0.8, 0.5, 2.5);
  else tone({ freq: 2000 + 1200 * v, t, attack: 0.001, decay: 0.04 + 0.03 * v, gain: g * 0.6 });
}

// Plucked string (Karplus–Strong), precomputed once per pitch into an AudioBuffer.
const plucks = new Map();
function pluckBuffer(freq) {
  const key = Math.round(freq * 10);
  if (plucks.has(key)) return plucks.get(key);
  const sr = ctx.sampleRate, len = Math.floor(sr * 1.6), N = Math.max(2, Math.round(sr / freq));
  const buf = ctx.createBuffer(1, len, sr), y = buf.getChannelData(0);
  for (let i = 0; i < N; i++) y[i] = Math.random() * 2 - 1;
  for (let i = N; i < len; i++) y[i] = 0.4985 * (y[i - N] + y[i - N + 1 < i ? i - N + 1 : i - N]);
  plucks.set(key, buf);
  return buf;
}
export function pluck(step = 0, v = 0.6) {
  if (!ready()) return;
  const s = ctx.createBufferSource(), g = ctx.createGain();
  s.buffer = pluckBuffer(note(step, 0));
  g.gain.value = 0.08 + 0.22 * Math.min(1, v);
  s.connect(g).connect(bus);
  s.start(T());
  s.onended = () => { s.disconnect(); g.disconnect(); };
}

export function snap() {
  if (!ready() || !throttle('snap', 50)) return;
  const t = T();
  if (tens) tens.g.gain.setTargetAtTime(0, t, 0.01);    // kill stretch tone instantly
  noise({ t, freq: 2200, q: 1.2, decay: 0.05, gain: 0.22 });
  tone({ freq: note(4, 1), t, attack: 0.002, decay: 0.14, gain: 0.14, glide: 0.5 });
}

// Discovery chime: bigger molecule -> more notes, lower root, longer tail.
export function discover(atomCount = 3) {
  if (!ready()) return;
  const t = T();
  const n = Math.max(2, Math.min(7, atomCount));
  const oct = atomCount >= 6 ? -1 : 0;
  const arp = [0, 2, 3, 5, 7, 8, 10];                   // C E G C E G C (major triad in pentatonic)
  for (let i = 0; i < n; i++) bell(note(arp[i], oct + 1), t + i * 0.07, 0.12, 1.4);
  // soft sustained chord underneath
  [0, 2, 3].slice(0, Math.min(3, n)).forEach((s) =>
    tone({ freq: note(s, oct), t: t + 0.02, attack: 0.08, decay: 1.6 + n * 0.1, gain: 0.05, cents: rnd(3) }));
}

export function collect() {
  if (!ready()) return;
  const t = T() + 0.25;
  bell(note(5, 1), t, 0.08, 0.6, 2);
  bell(note(7, 1), t + 0.09, 0.08, 0.8, 2);
}

export function handFound() {
  if (!ready() || !throttle('hand', 300)) return;
  const t = T();
  tone({ freq: note(3), t, attack: 0.02, decay: 0.18, gain: 0.06 });
  tone({ freq: note(5), t: t + 0.08, attack: 0.02, decay: 0.22, gain: 0.06 });
}
export function handLost() {
  if (!ready() || !throttle('hand', 300)) return;
  const t = T();
  tone({ freq: note(5), t, attack: 0.02, decay: 0.18, gain: 0.05 });
  tone({ freq: note(3), t: t + 0.08, attack: 0.02, decay: 0.22, gain: 0.05 });
}

export function click() {
  if (!ready() || !throttle('click', 30)) return;
  tone({ freq: note(0, 3), type: 'triangle', attack: 0.001, decay: 0.012, gain: 0.08, cents: 0 });
}

// Continuous stretch tone. Call once per frame with max bond tension 0..1 (0 = silent).
export function tension(amount = 0) {
  if (!ctx || ctx.state !== 'running') return;
  if (!tens) {
    const a = ctx.createOscillator(), b = ctx.createOscillator();
    const f = ctx.createBiquadFilter(), g = ctx.createGain();
    a.type = 'sine'; b.type = 'triangle';
    f.type = 'lowpass'; f.Q.value = 2; f.frequency.value = 300;
    g.gain.value = 0;
    a.connect(f); b.connect(f); f.connect(g).connect(bus);
    a.frequency.value = b.frequency.value = note(0, -1);
    a.start(); b.start();
    tens = { a, b, f, g };
  }
  const x = Math.max(0, Math.min(1, (amount - 0.2) / 0.8));   // dead zone below 20% stretch
  const now = ctx.currentTime, tc = 0.04;
  const base = note(0, -1) * (1 + 0.5 * x);                     // glide up to a fifth
  tens.a.frequency.setTargetAtTime(base, now, tc);
  tens.b.frequency.setTargetAtTime(base + 12 * x, now, tc);     // beating wobble grows
  tens.f.frequency.setTargetAtTime(300 + 2200 * x, now, tc);
  tens.g.gain.setTargetAtTime(muted ? 0 : 0.12 * x * x, now, tc);
}

export function tensionStop() {
  if (!tens) return;
  const t = ctx.currentTime;
  tens.g.gain.setTargetAtTime(0, t, 0.02);
  tens.a.stop(t + 0.2); tens.b.stop(t + 0.2);
  tens = null;
}
