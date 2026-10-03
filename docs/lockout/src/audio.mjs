// The same four-voice APU as the other two.
//
// The sound that matters here is the box. A real scoring box is one buzzer and two lamps — when
// both fencers land, you do not hear two buzzers, you hear one, and you look up to see two lights.
// Getting that wrong would make the double, which is the entire identity of the game, sound like
// a mistake.

const A4 = 440;
const note = (n) => A4 * Math.pow(2, (n - 69) / 12);
const CPU = 1789773;
const nesPitch = (hz) => {
  const p = Math.max(8, Math.min(0x7ff, Math.round(CPU / (16 * hz) - 1)));
  return CPU / (16 * (p + 1));
};

let ctx = null, master = null, started = false, muted = false, noiseBuf = null, shortBuf = null;
const waves = new Map();
try { muted = localStorage.getItem('lockout.mute') === '1'; } catch { muted = false; }

function pulseWave(duty) {
  if (waves.has(duty)) return waves.get(duty);
  const n = 32, real = new Float32Array(n), imag = new Float32Array(n);
  for (let i = 1; i < n; i++) imag[i] = (2 / (i * Math.PI)) * Math.sin(Math.PI * i * duty);
  const w = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  waves.set(duty, w);
  return w;
}

function makeNoise(short) {
  const len = short ? 1024 : ctx.sampleRate;
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  let reg = 1;
  for (let i = 0; i < len; i++) {
    const bit = (reg ^ (reg >> (short ? 6 : 1))) & 1;
    reg = (reg >> 1) | (bit << 14);
    d[i] = (reg & 1) ? 0.6 : -0.6;
  }
  return b;
}

export function start() {
  // re-arm on every gesture: WebKit's 'interrupted' state can only be left from one
  if (started) { if (ctx && ctx.state !== 'running') ctx.resume(); return; }
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.25;
  master.connect(ctx.destination);
  noiseBuf = makeNoise(false);
  shortBuf = makeNoise(true);
  started = true;
  if (ctx.state === 'suspended') ctx.resume();
  room();
}

export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem('lockout.mute', muted ? '1' : '0'); } catch {}
  if (master) master.gain.setTargetAtTime(muted ? 0 : 0.25, ctx.currentTime, 0.008);
  return muted;
}
export const isMuted = () => muted;

function tone({ hz, duty = 0.5, at = 0, dur = 0.1, vol = 0.2, type = 'pulse', slideTo = null, steps = 1 }) {
  if (!started || muted) return;
  const t0 = ctx.currentTime + at;
  const o = ctx.createOscillator();
  if (type === 'tri') o.type = 'triangle'; else o.setPeriodicWave(pulseWave(duty));
  if (slideTo && steps > 1) {
    for (let i = 0; i < steps; i++) {
      o.frequency.setValueAtTime(nesPitch(hz + (slideTo - hz) * (i / (steps - 1))), t0 + (dur * i) / steps);
    }
  } else o.frequency.setValueAtTime(nesPitch(hz), t0);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.004);
  g.gain.setValueAtTime(vol, t0 + Math.max(0.006, dur * 0.5));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + dur + 0.02);
  o.onended = () => { try { o.disconnect(); g.disconnect(); } catch {} };
}

function noise({ at = 0, dur = 0.08, vol = 0.25, short = false, filter = 0 }) {
  if (!started || muted) return;
  const t0 = ctx.currentTime + at;
  const s = ctx.createBufferSource();
  s.buffer = short ? shortBuf : noiseBuf;
  s.loop = true;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let tail = g;
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = filter; f.Q.value = 1.3;
    g.connect(f); tail = f;
  }
  s.connect(g); tail.connect(master);
  s.start(t0); s.stop(t0 + dur + 0.02);
  s.onended = () => { try { s.disconnect(); g.disconnect(); if (tail !== g) tail.disconnect(); } catch {} };
}

/** The room: a big empty hall with a floor and a ceiling and almost nobody in it. */
let roomGain = null;
function room() {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf; s.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 300;
  const g = ctx.createGain();
  g.gain.value = 0.01;
  s.connect(f); f.connect(g); g.connect(master);
  s.start();
  roomGain = g;
}

export const sfx = {
  /** The buzzer. ONE buzzer, whoever lit — the lamps say who, the box only says that. */
  box(bothSides) {
    if (!started) return;
    tone({ hz: note(45), duty: 0.5, dur: 0.46, vol: 0.3 });
    tone({ hz: note(45.5), duty: 0.5, dur: 0.46, vol: 0.26 });   // beating against itself, as a real one does
    tone({ hz: note(33), type: 'tri', dur: 0.5, vol: 0.4 });
    noise({ dur: 0.1, vol: 0.1, filter: 1200 });
    // a double gets no second buzzer — just the second lamp, forty milliseconds later
    if (bothSides) noise({ at: 0.26, dur: 0.05, vol: 0.14, short: true, filter: 2600 });
  },

  /** Steel. The sound a parry actually makes, and the best sound in the game. */
  parry() {
    noise({ dur: 0.07, vol: 0.34, short: true, filter: 5200 });
    tone({ hz: 1650, duty: 0.125, dur: 0.16, vol: 0.2, slideTo: 760, steps: 7 });
    tone({ hz: note(76), type: 'tri', dur: 0.3, vol: 0.18 });
  },

  lunge() {
    noise({ dur: 0.1, vol: 0.14, filter: 900 });
    tone({ hz: note(50), duty: 0.25, dur: 0.1, vol: 0.14, slideTo: note(60), steps: 5 });
  },
  stepOn() { noise({ dur: 0.05, vol: 0.12, filter: 500 }); },
  short() { tone({ hz: note(46), duty: 0.125, dur: 0.14, vol: 0.12, slideTo: note(39), steps: 4 }); },
  nothing() { noise({ dur: 0.04, vol: 0.07, filter: 700 }); },

  select() { tone({ hz: note(74), duty: 0.25, dur: 0.045, vol: 0.13 }); },
  move() { tone({ hz: note(67), duty: 0.125, dur: 0.035, vol: 0.09 }); },

  /** The opponent shifting their weight. Nearly nothing, and you learn to hear it. */
  tell() { noise({ dur: 0.05, vol: 0.05, filter: 340 }); },

  win() {
    [60, 64, 67, 72, 76].forEach((n, i) => {
      tone({ hz: note(n), duty: 0.5, dur: 0.26, vol: 0.18, at: i * 0.2 });
      tone({ hz: note(n - 24), type: 'tri', dur: 0.28, vol: 0.32, at: i * 0.2 });
    });
  },
  lose() {
    [55, 52, 48, 43].forEach((n, i) => {
      tone({ hz: note(n), duty: 0.25, dur: 0.44, vol: 0.17, at: i * 0.36 });
      tone({ hz: note(n - 12), type: 'tri', dur: 0.46, vol: 0.36, at: i * 0.36 });
    });
  },
  /** Both to five on the same action. It should sound like neither of you won, because neither did. */
  doubleOut() {
    tone({ hz: note(52), type: 'tri', dur: 1.1, vol: 0.4 });
    tone({ hz: note(51), type: 'tri', dur: 1.1, vol: 0.34 });
    noise({ dur: 0.7, vol: 0.1, filter: 300 });
  },
};

export function suspend() { if (started && ctx.state === 'running') ctx.suspend(); }
export function resume() { if (started && ctx.state !== 'running') ctx.resume(); }
