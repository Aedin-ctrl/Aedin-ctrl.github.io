// The same four voices as Filament's APU, with sounds for one verb.
//
// The wind-up is the sound that matters here: it has to tell you how much power you have without
// a meter on screen, so it is a tone that rises in discrete steps as the charge builds. You learn
// to jump by ear long before you learn to jump by eye.

const A4 = 440;
const note = (n) => A4 * Math.pow(2, (n - 69) / 12);
const CPU = 1789773;
const nesPitch = (hz) => {
  const period = Math.max(8, Math.min(0x7ff, Math.round(CPU / (16 * hz) - 1)));
  return CPU / (16 * (period + 1));
};

let ctx = null, master = null, started = false, muted = false, noiseBuf = null, shortBuf = null;
const waves = new Map();
try { muted = localStorage.getItem('farlight.mute') === '1'; } catch { muted = false; }

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
  // Re-arm on EVERY gesture, before the started guard.
  //
  // WebKit has a third context state beyond running and suspended: 'interrupted', entered on a
  // phone call, a Siri invocation, an AirPods disconnect. It can only be left from a user gesture,
  // and visibilitychange is not one — so without this, audio on a phone stops for good the first
  // time anything interrupts it and no amount of playing brings it back.
  if (started) { if (ctx && ctx.state !== 'running') ctx.resume(); return; }
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.24;
  master.connect(ctx.destination);
  noiseBuf = makeNoise(false);
  shortBuf = makeNoise(true);
  started = true;
  if (ctx.state === 'suspended') ctx.resume();
  wind();
  music.start();
}

export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem('farlight.mute', muted ? '1' : '0'); } catch {}
  if (master) master.gain.setTargetAtTime(muted ? 0 : 0.24, ctx.currentTime, 0.008);
  return muted;
}

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
  // the filter was left connected to master for the lifetime of the page; almost every effect in
  // the game is filtered, so that is thousands of orphaned nodes over a long session
  s.onended = () => { try { s.disconnect(); g.disconnect(); if (tail !== g) tail.disconnect(); } catch {} };
}

let windGain = null, toneFilter = null;
function wind() {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf; s.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 380;
  const g = ctx.createGain();
  g.gain.value = 0.012;
  s.connect(f); f.connect(g); g.connect(master);
  s.start();
  windGain = g;
  toneFilter = f;          // this was never assigned, so the wind never brightened as you climbed
}
/** The wind gets louder as you climb. It is the only thing telling you how high you are. */
let lastHeight = 0;
export function setHeight(h) {
  lastHeight = h;
  if (windGain && started) {
    windGain.gain.setTargetAtTime(0.012 + h * 0.05, ctx.currentTime, 1.2);
    if (toneFilter) toneFilter.frequency.setTargetAtTime(380 + h * 900, ctx.currentTime, 1.2);
  }
}

let lastStep = -1;
export const sfx = {
  /**
   * The wind-up, as a staircase. Eight steps from the bottom of the charge to the top, each a
   * tone higher — so the power in your legs is something you hear, and a full charge has a
   * distinct top note you learn to wait for.
   */
  winding(c) {
    const step = Math.min(7, Math.floor(c * 8));
    if (step === lastStep) return;
    lastStep = step;
    // A whole-tone staircase has no leading tone and no tonic, so nothing in it ever sounds like
    // ARRIVAL — which is precisely what the top of a wind-up has to sound like. These are scale
    // degrees instead, and the last step leaps a fourth onto the octave and changes duty, so full
    // charge announces itself and you learn to wait for it.
    const DEGREES = [0, 2, 4, 5, 7, 9, 11, 16];
    tone({ hz: note(52 + DEGREES[step]), duty: step === 7 ? 0.5 : 0.125,
           dur: step === 7 ? 0.11 : 0.05, vol: step === 7 ? 0.13 : 0.09 });
  },
  jump(power) {
    lastStep = -1;
    tone({ hz: note(58 + power * 10), duty: 0.25, dur: 0.1, vol: 0.18,
           slideTo: note(70 + power * 12), steps: 5 });
    noise({ dur: 0.05, vol: 0.1, short: true, filter: 1800 });
  },
  land() { noise({ dur: 0.05, vol: 0.14, filter: 500 });
           tone({ hz: note(40), type: 'tri', dur: 0.08, vol: 0.3 }); },
  skid() { noise({ dur: 0.12, vol: 0.18, filter: 900 });
           tone({ hz: note(38), type: 'tri', dur: 0.12, vol: 0.34 }); },
  bounce(speed) {
    tone({ hz: note(62), duty: 0.5, dur: 0.07, vol: 0.16, slideTo: note(54), steps: 4 });
    noise({ dur: 0.04, vol: 0.1 + Math.min(0.1, speed / 900), short: true, filter: 2400 });
  },
  bonk() { noise({ dur: 0.07, vol: 0.2, filter: 400 });
           tone({ hz: note(34), type: 'tri', dur: 0.12, vol: 0.4 }); },
  up(screen) {
    for (let i = 0; i < 2; i++)
      tone({ hz: note(64 + Math.min(screen, 10) + i * 5), duty: 0.5, dur: 0.1, vol: 0.13, at: i * 0.08 });
  },
  /** Losing ground: a descending phrase whose length is how many screens you just gave back. */
  down(lost) {
    for (let i = 0; i < Math.min(lost, 5); i++)
      tone({ hz: note(56 - i * 3), type: 'tri', dur: 0.18, vol: 0.34, at: i * 0.11 });
    noise({ dur: 0.25, vol: 0.14, filter: 300 });
    // the wind drops away under a fall, so the descent lands in a hole rather than on a bed
    if (windGain && started) {
      const now = ctx.currentTime;
      windGain.gain.cancelScheduledValues(now);
      windGain.gain.setTargetAtTime(0.002, now, 0.08);
      windGain.gain.setTargetAtTime(0.012 + lastHeight * 0.05, now + 0.9, 0.7);
    }
  },
  win() {
    const tune = [60, 67, 72, 76, 79, 84];
    tune.forEach((n, i) => {
      tone({ hz: note(n), duty: 0.5, dur: 0.3, vol: 0.18, at: i * 0.22 });
      tone({ hz: note(n - 24), type: 'tri', dur: 0.32, vol: 0.34, at: i * 0.22 });
    });
  },
  select() { tone({ hz: note(74), duty: 0.25, dur: 0.05, vol: 0.14 }); },
};

// ---------------------------------------------------------------------------------------------
// Music: slow, sparse, and it climbs with you.
//
// A precision platformer cannot have a busy soundtrack — you are listening for the wind-up, and
// anything with a beat makes you jump on the beat instead of when you meant to. So this is a long
// triangle drone with a handful of notes over it, and the only thing that changes as you climb is
// the ROOT: a tone higher per band. By the lamp room you are a fifth above where you started, and
// the whole thing has brightened without ever having had a tune to follow.
// ---------------------------------------------------------------------------------------------
const FIG = [0, 7, 12, 7, 0, 5, 9, 5, 0, 7, 16, 7, 0, 3, 7, 3];

export const music = {
  on: false, step: 0, next: 0, timer: null, root: 45, want: 45,

  start() {
    if (this.timer || !started) return;
    this.next = ctx.currentTime + 0.2;
    // the AudioContext clock decides when notes sound; setInterval only decides when we schedule
    this.timer = setInterval(() => this.pump(), 50);
    this.on = true;
  },
  stop() { if (this.timer) { clearInterval(this.timer); this.timer = null; } this.on = false; },
  /** Reset, or a second climb opens a fifth too high and slides back down over thirteen seconds. */
  reset() { this.root = 45; this.want = 45; this.step = 0; },

  /** 0 at the base, 1 at the lamp. Shifts the root up seven semitones over the whole climb. */
  setHeight(h) { this.want = 45 + Math.round(Math.max(0, Math.min(1, h)) * 7); },

  pump() {
    if (!started) return;
    if (muted) {
      // keep the clock moving while silent, or unmuting runs thousands of catch-up iterations in
      // one interval callback and drops a frame
      if (this.next < ctx.currentTime) { this.next = ctx.currentTime + 0.1; this.step = 0; }
      return;
    }
    const beat = 0.46;
    while (this.next < ctx.currentTime + 0.3) {
      const at = this.next - ctx.currentTime;
      if (at >= 0) {
        const i = this.step % FIG.length;
        // the root creeps toward the height rather than jumping, so a long fall lowers the music
        // audibly but never lurches
        if (this.step % 4 === 0) this.root += Math.sign(this.want - this.root);
        if (i % 4 === 0) {
          tone({ hz: note(this.root - 12), type: 'tri', at, dur: beat * 3.6, vol: 0.26 });
        }
        if (i % 2 === 0) {
          tone({ hz: note(this.root + FIG[i]), duty: 0.125, at, dur: beat * 0.7, vol: 0.055 });
        }
        if (i === 6 || i === 14) {
          tone({ hz: note(this.root + FIG[i] + 12), duty: 0.25, at: at + beat * 0.5,
                 dur: beat * 0.5, vol: 0.035 });
        }
      }
      this.next += beat;
      this.step++;
    }
  },
};

export function suspend() { if (started && ctx.state === 'running') ctx.suspend(); }
export function resume() { if (started && ctx.state !== 'running') ctx.resume(); }
export const isMuted = () => muted;
