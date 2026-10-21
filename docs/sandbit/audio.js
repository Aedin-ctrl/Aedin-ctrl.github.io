// 8-bit sound effects, synthesised on the fly with WebAudio (no files).
// Nothing plays until the first click, since browsers only allow audio
// after a user gesture.
export class Sfx {
  constructor(){
    this.ctx = null;
    this.on = true;
    this.last = {};
  }

  /** Call from a user gesture to unlock audio. */
  wake(){
    if(!this.on) return false;
    if(!this.ctx){
      const AC = window.AudioContext || window.webkitAudioContext;
      if(!AC) return false;
      this.ctx = new AC();
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.32;
      this.out.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, len);
      const d = this.noiseBuf.getChannelData(0);
      for(let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if(this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx.state !== 'closed';
  }
  ready(){ return this.on && this.ctx && this.ctx.state === 'running'; }

  /** At most one of `key` per `ms` milliseconds. */
  throttle(key, ms){
    const now = performance.now();
    if(now - (this.last[key] || 0) < ms) return false;
    this.last[key] = now;
    return true;
  }

  tone(freq, dur, { type = 'square', vol = 0.15, slide = 0, delay = 0 } = {}){
    if(!this.ready()) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(dur, { freq = 1200, to = 0, q = 0.8, vol = 0.2, type = 'lowpass', delay = 0 } = {}){
    if(!this.ready()) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if(to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.out);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }

  click(){ this.tone(880, 0.04, { vol: 0.06 }); }
  boom(n = 1){
    if(!this.throttle('boom', 70)) return;
    const big = Math.min(1, 0.4 + n * 0.15);
    this.noise(0.5 + big * 0.5, { freq: 1600, to: 60, vol: 0.35 * big + 0.1 });
    this.tone(90, 0.35, { type: 'square', vol: 0.18 * big, slide: 0.3 });
  }
  thud(speed){
    if(!this.throttle('thud', 55)) return;
    const v = Math.min(1, (speed - 1) / 3);
    this.tone(150 + Math.random() * 40, 0.09, { type: 'square', vol: 0.05 + 0.12 * v, slide: 0.45 });
    this.noise(0.06, { freq: 700, vol: 0.05 + 0.08 * v });
  }
  crackle(amount){
    if(Math.random() > Math.min(0.6, amount / 400)) return;
    if(!this.throttle('crackle', 30)) return;
    this.noise(0.025, { freq: 2500 + Math.random() * 3000, type: 'bandpass', q: 3, vol: 0.05 + Math.random() * 0.05 });
  }
  pour(kind){
    if(!this.throttle('pour', 55)) return;
    if(kind === 'liquid'){
      this.tone(300 + Math.random() * 500, 0.05, { type: 'sine', vol: 0.05, slide: 1.6 });
    } else if(kind === 'solid'){
      this.noise(0.03, { freq: 400, vol: 0.05 });
    } else if(kind === 'erase'){
      this.noise(0.04, { freq: 5000, type: 'highpass', vol: 0.03 });
    } else {
      this.noise(0.05, { freq: 3500, type: 'bandpass', q: 1.5, vol: 0.05 });
    }
  }
  pop(){ this.tone(520, 0.08, { vol: 0.1, slide: 1.8 }); }
  win(){
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, i === 5 ? 0.35 : 0.12, { vol: 0.12, delay: i * 0.1 }));
  }
  fail(){ [392, 330, 262].forEach((f, i) => this.tone(f, 0.18, { vol: 0.1, delay: i * 0.14 })); }
}
