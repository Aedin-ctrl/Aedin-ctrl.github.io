// An NES APU, more or less, in WebAudio. No files — every sound is synthesised.
//
// Four voices, which is what the hardware had minus its sample channel:
//   pulse1   melody, and the bright transient effects. Effects STEAL the channel for ~80ms, which
//            is authentic, makes them cut through with no limiter, and is itself a cue.
//   pulse2   harmony — and it only plays while current is actually reaching something. Break the
//            circuit and the music goes hollow instantly. One boolean, and it is the strongest
//            emotional feedback in the game.
//   triangle bass, and the blackout cascade. Real hardware gave the triangle no volume control: it
//            arrives at full and then stops, which is exactly the gut-drop a snapped cable wants.
//   noise    wind, and every impact. Both modes — long-period hiss and short-period "metallic",
//            the latter being most of what separates an NES from a generic chiptune.
//
// Nothing exists until the first key press, because the autoplay policy will not have it otherwise.

const A4 = 440;
export const note = (n) => A4 * Math.pow(2, (n - 69) / 12);     // MIDI number -> Hz

// The hardware could not play an arbitrary frequency: it loaded an 11-bit period into a register,
// so pitches were quantised, and increasingly so as they got lower. Rounding through that register
// is ten lines and it is a surprising share of why a thing sounds like an NES.
const CPU = 1789773;
function nesPitch(hz) {
  const period = Math.max(8, Math.min(0x7ff, Math.round(CPU / (16 * hz) - 1)));
  return CPU / (16 * (period + 1));
}

let ctx = null, master = null, started = false;
let muted = false;
const waves = new Map();

try { muted = localStorage.getItem('filament.mute') === '1'; } catch { muted = false; }

/** A pulse wave of a given duty, built from its Fourier series. */
function pulseWave(duty) {
  if (waves.has(duty)) return waves.get(duty);
  const n = 32;
  const real = new Float32Array(n), imag = new Float32Array(n);
  for (let i = 1; i < n; i++) {
    imag[i] = (2 / (i * Math.PI)) * Math.sin(Math.PI * i * duty);
  }
  const w = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  waves.set(duty, w);
  return w;
}

let noiseLong = null, noiseShort = null;
function noiseBuffer(short) {
  // long period is hiss; short period repeats quickly enough to have a pitch, which is what makes
  // a metallic snap sound metallic rather than like a puff of air
  const len = short ? 1024 : ctx.sampleRate;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let reg = 1;
  for (let i = 0; i < len; i++) {
    const bit = (reg ^ (reg >> (short ? 6 : 1))) & 1;
    reg = (reg >> 1) | (bit << 14);
    d[i] = (reg & 1) ? 0.6 : -0.6;
  }
  return buf;
}

export function start() {
  if (started) return;
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.26;
  master.connect(ctx.destination);
  noiseLong = noiseBuffer(false);
  noiseShort = noiseBuffer(true);
  started = true;
  if (ctx.state === 'suspended') ctx.resume();
  wind();
  music.start();
}

export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem('filament.mute', muted ? '1' : '0'); } catch { /* private mode */ }
  if (master) {
    // a one-frame ramp, never a jump — a gain step to zero clicks, loudly, in a chiptune mix
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(muted ? 0 : 0.26, ctx.currentTime, 0.008);
  }
  return muted;
}
export const isMuted = () => muted;

// ---------------------------------------------------------------------------------------------
// voices
// ---------------------------------------------------------------------------------------------
function tone({ hz, duty = 0.5, at = 0, dur = 0.1, vol = 0.25, type = 'pulse', slideTo = null, steps = 1 }) {
  if (!started || muted) return;
  const t0 = ctx.currentTime + at;
  const o = ctx.createOscillator();
  if (type === 'tri') o.type = 'triangle';
  else o.setPeriodicWave(pulseWave(duty));

  if (slideTo && steps > 1) {
    // stepped, not glided: the hardware changed the period register in discrete jumps, and that
    // staircase is what makes a sweep read as a machine rather than as a synth
    for (let i = 0; i < steps; i++) {
      const f = hz + (slideTo - hz) * (i / (steps - 1));
      o.frequency.setValueAtTime(nesPitch(f), t0 + (dur * i) / steps);
    }
  } else {
    o.frequency.setValueAtTime(nesPitch(hz), t0);
  }

  const g = ctx.createGain();
  // attack inside one frame; anything slower sounds like a pad, not a chip
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.004);
  g.gain.setValueAtTime(vol, t0 + Math.max(0.005, dur * 0.5));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
  o.onended = () => { try { o.disconnect(); g.disconnect(); } catch {} };
}

function noise({ at = 0, dur = 0.08, vol = 0.3, short = false, filter = 0 }) {
  if (!started || muted) return;
  const t0 = ctx.currentTime + at;
  const s = ctx.createBufferSource();
  s.buffer = short ? noiseShort : noiseLong;
  s.loop = true;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let tail = g;
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = filter; f.Q.value = 1.4;
    g.connect(f); tail = f;
  }
  s.connect(g); tail.connect(master);
  s.start(t0);
  s.stop(t0 + dur + 0.02);
  s.onended = () => { try { s.disconnect(); g.disconnect(); } catch {} };
}

/** The absence of silence is what makes the coast feel inhabited rather than empty. */
function wind() {
  if (!started) return;
  const s = ctx.createBufferSource();
  s.buffer = noiseLong; s.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 420;
  const g = ctx.createGain();
  g.gain.value = 0.018;
  s.connect(f); f.connect(g); g.connect(master);
  s.start();
  windGain = g;
}
let windGain = null;
export function setWind(level) {
  if (windGain && started) windGain.gain.setTargetAtTime(level, ctx.currentTime, 1.5);
}

// ---------------------------------------------------------------------------------------------
// effects
// ---------------------------------------------------------------------------------------------
const cooldown = new Map();
function throttled(name, ms) {
  const now = started ? ctx.currentTime * 1000 : 0;
  if ((cooldown.get(name) ?? -1e9) + ms > now) return false;
  cooldown.set(name, now);
  return true;
}

let chain = 0, chainAt = -1e9;

export const sfx = {
  /** rising by a semitone for each coin in the chain — the reward for the only verb there is */
  earn() {
    if (!started) return;
    const now = ctx.currentTime;
    if (now - chainAt > 0.4) chain = 0;
    chainAt = now;
    tone({ hz: note(76 + Math.min(chain, 14)), duty: 0.125, dur: 0.07, vol: 0.14 });
    chain++;
  },
  spend() { tone({ hz: note(64), duty: 0.25, dur: 0.06, vol: 0.13 }); },
  deny()  { if (throttled('deny', 220)) tone({ hz: note(47), duty: 0.5, dur: 0.1, vol: 0.12 }); },

  hire()  { tone({ hz: note(69), duty: 0.25, dur: 0.07, vol: 0.15 });
            tone({ hz: note(76), duty: 0.25, dur: 0.09, vol: 0.15, at: 0.07 }); },

  shoot() { if (throttled('shoot', 70)) noise({ dur: 0.035, vol: 0.1, short: true, filter: 2600 }); },
  hit()   { if (throttled('hit', 50)) noise({ dur: 0.05, vol: 0.18, short: true, filter: 1500 }); },
  died()  { if (throttled('died', 70)) {
              noise({ dur: 0.1, vol: 0.2 });
              tone({ hz: note(50), duty: 0.5, dur: 0.1, vol: 0.1, slideTo: note(36), steps: 5 });
            } },

  gnawing() { if (throttled('gnawing', 160)) noise({ dur: 0.04, vol: 0.07, short: true, filter: 900 }); },

  /** The loudest thing in the game. Three layers, then silence. */
  cut() {
    if (!started) return;
    noise({ dur: 0.09, vol: 0.4, short: true, filter: 4200 });            // the crack
    tone({ hz: 1200, duty: 0.125, dur: 0.11, vol: 0.3, slideTo: 180, steps: 8 });  // the twang
    tone({ hz: 55, type: 'tri', dur: 0.35, vol: 0.5 });                   // the gut-drop
    music.hush(0.12);                                                     // then nothing at all
  },

  spliced() {
    tone({ hz: note(64), duty: 0.25, dur: 0.05, vol: 0.16 });
    tone({ hz: note(71), duty: 0.25, dur: 0.09, vol: 0.16, at: 0.05 });
    noise({ at: 0.02, dur: 0.05, vol: 0.12, short: true, filter: 3000 });
  },
  mended() {
    for (let i = 0; i < 3; i++)
      tone({ hz: note(64 + i * 4), duty: 0.25, dur: 0.07, vol: 0.14, at: i * 0.06 });
  },

  build()  { noise({ dur: 0.12, vol: 0.2, filter: 700 });
             tone({ hz: note(45), type: 'tri', dur: 0.18, vol: 0.4 }); },
  raised() { for (let i = 0; i < 3; i++)
               tone({ hz: note(60 + i * 5), duty: 0.5, dur: 0.08, vol: 0.16, at: i * 0.07 }); },

  towerHit() { if (throttled('towerHit', 90)) {
                 noise({ dur: 0.08, vol: 0.24, filter: 500 });
                 tone({ hz: note(40), type: 'tri', dur: 0.12, vol: 0.45 });
               } },
  towerFell() { noise({ dur: 0.45, vol: 0.34, filter: 320 });
                tone({ hz: note(38), type: 'tri', dur: 0.5, vol: 0.5 }); },
  dynamoHit() { noise({ dur: 0.2, vol: 0.3, filter: 260 });
                tone({ hz: note(33), type: 'tri', dur: 0.3, vol: 0.55 }); },

  robbed() { tone({ hz: note(72), duty: 0.125, dur: 0.1, vol: 0.2, slideTo: note(55), steps: 6 });
             noise({ dur: 0.09, vol: 0.14, short: true, filter: 2000 }); },

  /** A tower coming back. Pitched up a step per tower, so a relight cascade is a fanfare. */
  relight(step = 0) {
    const base = 67 + Math.min(step, 8) * 2;
    for (let i = 0; i < 3; i++)
      tone({ hz: note(base + [0, 4, 7][i]), duty: 0.5, dur: 0.07, vol: 0.15, at: i * 0.055 });
    tone({ hz: note(base - 12), type: 'tri', dur: 0.2, vol: 0.3 });
  },

  /** A tower going out. Pitched DOWN a step per tower: the length of the phrase is the damage. */
  blackout(step = 0) {
    tone({ hz: note(Math.max(28, 60 - step * 2)), type: 'tri', dur: 0.16, vol: 0.4 });
    noise({ dur: 0.05, vol: 0.08, filter: 600 });
  },

  reserve() { if (throttled('reserve', 900))
                tone({ hz: note(59), duty: 0.125, dur: 0.06, vol: 0.1 }); },

  dusk() { tone({ hz: note(52), type: 'tri', dur: 0.8, vol: 0.4 }); music.setNight(true); },
  dawn() {
    for (let i = 0; i < 4; i++)
      tone({ hz: note(64 + [0, 4, 7, 12][i]), duty: 0.5, dur: 0.14, vol: 0.14, at: i * 0.09 });
    music.setNight(false);
  },
  burn() { if (throttled('burn', 60)) noise({ dur: 0.06, vol: 0.09, filter: 1800 }); },

  beacon() {
    for (let i = 0; i < 6; i++)
      tone({ hz: note(60 + [0, 7, 12, 16, 19, 24][i]), duty: 0.5, dur: 0.22, vol: 0.18, at: i * 0.1 });
    tone({ hz: note(36), type: 'tri', dur: 1.4, vol: 0.5 });
    noise({ dur: 0.6, vol: 0.14, filter: 900 });
  },

  win() {
    const tune = [60, 64, 67, 72, 71, 72, 76, 79];
    tune.forEach((n, i) => {
      tone({ hz: note(n), duty: 0.5, dur: 0.24, vol: 0.18, at: i * 0.19 });
      tone({ hz: note(n - 24), type: 'tri', dur: 0.26, vol: 0.34, at: i * 0.19 });
    });
  },
  lose() {
    const tune = [55, 53, 51, 48];
    tune.forEach((n, i) => {
      tone({ hz: note(n), duty: 0.25, dur: 0.5, vol: 0.18, at: i * 0.42 });
      tone({ hz: note(n - 12), type: 'tri', dur: 0.5, vol: 0.4, at: i * 0.42 });
    });
  },
  select() { tone({ hz: note(72), duty: 0.25, dur: 0.05, vol: 0.14 }); },
};

// ---------------------------------------------------------------------------------------------
// music: one sequence, with a night variant. The bass never changes, so dusk sounds like the same
// world getting worse rather than like a different song.
// ---------------------------------------------------------------------------------------------
const BASS  = [40, 40, 43, 40, 38, 38, 40, 36];
const LEAD  = [64, 67, 71, 67, 64, 62, 60, 62];
const LEAD_N = [64, 63, 67, 63, 61, 60, 58, 60];

export const music = {
  on: false, night: false, step: 0, next: 0, timer: null, hushUntil: 0, circuit: true,

  start() {
    if (this.timer || !started) return;
    this.next = ctx.currentTime + 0.1;
    // a lookahead scheduler. setTimeout drives WHEN we schedule; the AudioContext clock decides
    // when things actually sound, which is the only way to avoid audible jitter.
    this.timer = setInterval(() => this.pump(), 40);
    this.on = true;
  },
  stop() { if (this.timer) { clearInterval(this.timer); this.timer = null; } this.on = false; },

  setNight(v) { this.night = v; },
  setCircuit(v) { this.circuit = v; },
  /** Everything stops, briefly. Only the cable snap does this, and the silence is the point. */
  hush(s) { if (started) this.hushUntil = ctx.currentTime + s; },

  pump() {
    if (!started || muted) return;
    const beat = this.night ? 0.3 : 0.36;
    while (this.next < ctx.currentTime + 0.18) {
      const at = this.next - ctx.currentTime;
      if (this.next >= this.hushUntil && at >= 0) {
        const i = this.step % 8;
        tone({ hz: note(BASS[i] - 12), type: 'tri', at, dur: beat * 0.9, vol: 0.3 });
        if (this.step % 2 === 0) {
          const lead = this.night ? LEAD_N : LEAD;
          tone({ hz: note(lead[i]), duty: this.night ? 0.125 : 0.25, at,
                 dur: beat * 0.8, vol: 0.075 });
        }
        // the harmony only exists while current is reaching something. Break the line and the
        // music goes hollow the instant it happens.
        if (this.circuit && this.step % 4 === 2) {
          tone({ hz: note(LEAD[i] - 5), duty: 0.5, at, dur: beat * 1.4, vol: 0.05 });
        }
        if (this.night && this.step % 4 === 0) noise({ at, dur: 0.03, vol: 0.05, filter: 5000 });
      }
      this.next += beat;
      this.step++;
    }
  },
};

export function suspend() { if (started && ctx.state === 'running') ctx.suspend(); }
export function resume()  { if (started && ctx.state === 'suspended') ctx.resume(); }
