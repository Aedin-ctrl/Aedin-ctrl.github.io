// Music tab: Theremin · Drums · Strum (research/21). Audio starts once sound is unlocked.
import { ThereminVoice, drum, pluckHz, midiHz } from './voices.js';
import { el } from '../ui.js';

const PENTA = [0, 2, 4, 7, 9];
const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const PADS = ['tom', 'snare', 'kick', 'hat', 'clap'];
const PAD_HUES = [260, 20, 200, 55, 330];
const CHORDS = [ // C major: I, IV, V, vi (MIDI note sets)
  { name: 'C', notes: [48, 52, 55] }, { name: 'F', notes: [53, 57, 60] },
  { name: 'G', notes: [55, 59, 62] }, { name: 'Am', notes: [57, 60, 64] },
];

// ── pure helpers (tested) ─────────────────────────────────────────────
// Palm height → MIDI note (45–81). Snapped: pulled 85% toward the nearest pentatonic note.
export function pitchFromY(y, h, snap) {
  const t = Math.max(0, Math.min(1, (h * 0.85 - y) / (h * 0.75)));
  const m = 45 + t * 36;
  if (!snap) return m;
  let best = m, bd = Infinity;
  for (let o = 36; o <= 84; o += 12) for (const s of PENTA) { const n = o + s; if (Math.abs(n - m) < bd) { bd = Math.abs(n - m); best = n; } }
  return m + (best - m) * 0.85;
}
// Mean fingertip-to-palm distance ÷ hand size: ~0.9 fist … ~1.9 open → cutoff 250 Hz … 8 kHz.
export function cutoffFromOpenness(hand) {
  if (!hand.pts) return 2000;
  const o = hand.tips.reduce((s, t) => s + Math.hypot(t.x - hand.palm.x, t.y - hand.palm.y), 0) / hand.tips.length / hand.size;
  const k = Math.max(0, Math.min(1, (o - 0.9) / 1.0));
  return 250 * (8000 / 250) ** k;
}
// Fingertip moving down fast enough, predicted to cross the pad's top line → hit strength 0..1 (else 0).
export function drumHit(prevY, y, vy, lineY, size = 90) {
  const need = 300 * (size / 90);
  if (vy < need) return 0;
  const predicted = y + vy * 0.03;
  if (prevY >= lineY || predicted < lineY) return 0;
  return Math.max(0, Math.min(1, (vy - 300) / 1900));
}

export class MusicMode {
  name = 'Music';

  constructor({ sfx, size }) {
    this.sfx = sfx; this.size = size;
    this.inst = 0; this.snap = true;
    this.t = 0;
    this.flash = PADS.map(() => 0);
    this.prevTips = new Map();
    this.armed = new Map();
    this.chord = 0;
    this.strings = Array.from({ length: 12 }, () => ({ amp: 0, phase: Math.random() * 6 }));
    const btn = (label, fn) => el('button', { 'data-hand': '', onclick: fn }, label);
    this.buttons = ['Theremin', 'Drums', 'Strum'].map((n, i) => btn(n, () => this.pick(i)));
    this.snapBtn = btn('Snap to scale', () => { this.snap = !this.snap; this.snapBtn.classList.toggle('on', this.snap); });
    this.snapBtn.classList.add('on');
    this.readout = el('div', { class: 'music-readout' });
    this.panel = el('div', { class: 'mode-panel' }, [el('div', { class: 'subtabs' }, [...this.buttons, this.snapBtn]), this.readout]);
    this.pick(0, true);
  }

  get hint() {
    return ['Right hand height = pitch · left hand height = volume · open your hand to brighten the tone',
      'Tap down onto the pads with your index or middle finger · harder = louder',
      'Left hand picks a chord (pinch in a zone) · right hand sweeps across the strings'][this.inst];
  }

  pick(i, quiet) {
    this.inst = i;
    this.prevTips.clear(); this.armed.clear();     // don't compare against another instrument's fingertips
    this.buttons.forEach((b, k) => b.classList.toggle('on', k === i));
    this.snapBtn.hidden = i !== 0;
    if (i !== 0) this.silence();
    if (!quiet) { this.sfx.click(); this.env?.showHint?.(this.hint); }
  }

  onKey(e) {
    const n = Number(e.key);
    if (n >= 1 && n <= 3 && !e.metaKey && !e.ctrlKey) { this.pick(n - 1); return true; }
    if (e.key.toLowerCase() === 's' && this.inst === 0) { this.snapBtn.click(); return true; }
    return false;
  }

  silence() { this.voice?.stop(); this.voice = null; }
  exit() { this.silence(); }

  // which camera hand plays which role (screen side, with a little hysteresis)
  roles(hands) {
    const cam = hands.filter((h) => h.pts);
    const { w } = this.size();
    if (cam.length === 1) return { right: cam[0], left: null };
    if (cam.length >= 2) { const [a, b] = [...cam].sort((p, q) => p.palm.x - q.palm.x); return { left: a, right: b }; }
    return { right: hands[0] || null, left: null, w };
  }

  update(dt, hands) {
    this.t += dt;
    const a = this.sfx.audio?.();
    const { w, h } = this.size();
    if (this.inst === 0) this.theremin(a, hands, h);
    else if (this.inst === 1) this.drums(a, hands, w, h);
    else this.strum(a, hands, w, h);
    for (const id of this.prevTips.keys()) if (!hands.some((x) => x.id === id)) this.prevTips.delete(id);
    this.flash = this.flash.map((f) => f * Math.exp(-dt * 8));
    for (const s of this.strings) { s.amp *= Math.exp(-dt * 2.4); s.phase += dt * 40; }
    if (!a) this.readout.textContent = 'Click or press a key once to turn sound on';
  }

  theremin(a, hands, h) {
    const { left, right } = this.roles(hands);
    if (!a) return;
    if (!right) { this.lastVol = 0; this.voice?.set(this.lastMidi ?? 57, 0, 800, 0, 0.05); this.readout.textContent = 'Raise your right hand to play'; return; }
    this.voice ??= new ThereminVoice(a);
    const midi = pitchFromY(right.palm.y, h, this.snap);
    // volume: left hand height, or pinch amount when you only have one hand up
    // silent over the tab bar; with a mouse, only while the button is held
    const vol = right.pinch.y < 135 ? 0
      : left ? Math.max(0, Math.min(1, (h * 0.9 - left.palm.y) / (h * 0.7)))
      : right.pts ? 0.35 + 0.65 * (1 - right.pinchAmt) : (right.down ? 0.8 : 0);
    // vibrato from small shakes: palm y vs its 0.15 s average
    this.avgY = this.avgY == null ? right.palm.y : this.avgY + (right.palm.y - this.avgY) * 0.1;
    const shake = Math.max(0, Math.abs(right.palm.y - this.avgY) - 3);
    this.voice.set(midi, vol, cutoffFromOpenness(right), Math.min(40, shake * 4), this.snap ? 0.06 : 0.035);
    this.lastMidi = midi; this.lastY = right.palm.y; this.lastVol = vol;
    const n = Math.round(midi);
    this.readout.textContent = `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1} · ${Math.round(midiHz(midi))} Hz · volume ${Math.round(vol * 100)}%`;
  }

  padRect(i, w, h) { const pw = w / PADS.length; return { x: i * pw + 8, y: h * 0.72, w: pw - 16, h: h * 0.24 }; }

  drums(a, hands, w, h) {
    this.readout.textContent = PADS.join(' · ');
    const lineY = h * 0.72;
    for (const hand of hands) {
      const prev = this.prevTips.get(hand.id) || [];
      const tips = hand.pts ? [hand.tips[1], hand.tips[2]] : [hand.tips[0]];
      tips.forEach((t, k) => {
        const key = `${hand.id}:${k}`, p = prev[k];
        if (t.y < lineY - 24) this.armed.set(key, true);                       // re-arm above the line
        const v = p && this.armed.get(key) ? drumHit(p.y, t.y, t.vy, lineY, hand.size || 90) : 0;
        if (v > 0) {
          const i = Math.max(0, Math.min(PADS.length - 1, Math.floor(t.x / (w / PADS.length))));
          this.armed.set(key, false);
          this.flash[i] = 1;
          if (a) drum(a, PADS[i], v);
        }
      });
      this.prevTips.set(hand.id, tips.map((t) => ({ x: t.x, y: t.y })));
    }
  }

  stringX(i, w) { const m = w * 0.3; return m + ((w - m - w * 0.06) * i) / 11; }

  strum(a, hands, w, h) {
    const { left, right } = this.roles(hands);
    // left hand: pinch inside one of 4 vertical zones to pick (and latch) a chord
    // pinch (or click) inside a chord zone on the left to pick it — works with one hand or a mouse
    for (const hd of hands) if (hd.justDown && hd.pinch.x < w * 0.22) this.chord = Math.max(0, Math.min(3, Math.floor((hd.pinch.y / h) * 4)));
    const notes = CHORDS[this.chord].notes;
    const tuning = Array.from({ length: 12 }, (_, i) => notes[i % 3] + 12 * Math.floor(i / 3) - 12);
    this.readout.textContent = `Chord: ${CHORDS[this.chord].name}`;
    const player = right || (!left ? hands[0] : null);
    if (!player) return;
    const prev = this.prevTips.get(player.id);
    const tips = player.tips.map((t) => ({ x: t.x + t.vx * 0.03, y: t.y, vx: t.vx }));
    if (prev) tips.forEach((t, k) => {
      const p = prev[k];
      if (!p || t.y < h * 0.12 || t.y > h * 0.9) return;
      for (let i = 0; i < 12; i++) {
        const sx = this.stringX(i, w);
        if ((p.x - sx) * (t.x - sx) < 0) {
          this.strings[i].amp = 1;
          if (a) pluckHz(a, midiHz(tuning[i] + 12), Math.min(1, Math.abs(t.vx) / 1600), (sx / w) * 1.2 - 0.6);
        }
      }
    });
    this.prevTips.set(player.id, tips);
  }

  draw(g) {
    const { w, h } = this.size();
    g.save();
    if (this.inst === 0) {
      // scale ticks down the right side + a glowing pitch line
      for (let m = 45; m <= 81; m++) {
        if (!PENTA.includes(m % 12)) continue;
        const y = h * 0.85 - ((m - 45) / 36) * h * 0.75;
        g.fillStyle = m % 12 === 0 ? 'rgba(247,248,250,0.5)' : 'rgba(247,248,250,0.18)';
        g.fillRect(w - 46, y - 0.5, m % 12 === 0 ? 30 : 18, 1);
        if (m % 12 === 0) { g.font = '500 10px -apple-system, system-ui, sans-serif'; g.fillText(`C${Math.floor(m / 12) - 1}`, w - 78, y + 3); }
      }
      if (this.lastY != null && this.lastVol > 0.01) {
        const grad = g.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, 'rgba(124,227,177,0)'); grad.addColorStop(1, `rgba(124,227,177,${0.25 + 0.6 * this.lastVol})`);
        g.fillStyle = grad; g.fillRect(0, this.lastY - 1, w, 2);
      }
    } else if (this.inst === 1) {
      PADS.forEach((name, i) => {
        const r = this.padRect(i, w, h), f = this.flash[i];
        g.fillStyle = `hsla(${PAD_HUES[i]},80%,60%,${0.1 + 0.45 * f})`;
        g.strokeStyle = `hsla(${PAD_HUES[i]},90%,70%,${0.35 + 0.6 * f})`; g.lineWidth = 2;
        g.beginPath(); g.roundRect(r.x, r.y, r.w, r.h, 22); g.fill(); g.stroke();
        g.fillStyle = 'rgba(247,248,250,0.8)'; g.font = '600 14px -apple-system, system-ui, sans-serif'; g.textAlign = 'center';
        g.fillText(name.toUpperCase(), r.x + r.w / 2, r.y + r.h / 2 + 5);
      });
    } else {
      // chord zones on the left, strings on the right
      CHORDS.forEach((c, i) => {
        const y = (h / 4) * i;
        g.fillStyle = i === this.chord ? 'rgba(124,227,177,0.14)' : 'rgba(255,255,255,0.03)';
        g.fillRect(0, y + 4, w * 0.22, h / 4 - 8);
        g.fillStyle = i === this.chord ? '#7CE3B1' : 'rgba(247,248,250,0.5)';
        g.font = '600 28px -apple-system, system-ui, sans-serif'; g.textAlign = 'center';
        g.fillText(c.name, w * 0.11, y + h / 8 + 10);
      });
      g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
      this.strings.forEach((s, i) => {
        const x = this.stringX(i, w);
        g.strokeStyle = `hsla(${190 + i * 8},90%,75%,${0.35 + 0.6 * s.amp})`; g.lineWidth = 1.5 + s.amp * 2;
        g.beginPath(); g.moveTo(x, h * 0.12);
        for (let k = 1; k <= 20; k++) { const y = h * 0.12 + (h * 0.78 * k) / 20; g.lineTo(x + Math.sin(s.phase + k) * 10 * s.amp * Math.sin((Math.PI * k) / 20), y); }
        g.stroke();
      });
    }
    g.restore();
  }
}
