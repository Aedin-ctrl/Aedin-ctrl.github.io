// Hands tab (the default): your masked hands, plus a few quiet delights —
// a note + ring whenever fingertips tap, a soft glow under each palm, and hidden gestures to find.
import { describe } from './signing/features.js';
import { Particles } from '../toys/particles.js';
import { STYLES } from '../handviz.js';
import { Moves } from '../moves.js';

const MOVE_ICON = { swipeLeft: '👈', swipeRight: '👉', swipeUp: '👆', swipeDown: '👇', push: '🫸', pull: '🫷', fistBump: '👊',
  twistCW: '🔃', twistCCW: '🔄', grab: '✊', release: '🖐', circleCW: '⭕', circleCCW: '⭕', snap: '🫰', clap: '👏', spread: '↔️', squeeze: '🤏' };
import { el } from './ui.js';

const PAIR_STEP = { '0-1': 0, '0-2': 2, '0-3': 4, '0-4': 5, '1-2': 7, '2-3': 8, '3-4': 9 };
const GESTURES = {
  thumbsUp: { label: '👍 Thumbs up', test: (d) => allCurled(d, ['index', 'middle', 'ring', 'pinky']) && d.thumb.tip.y > 0.9 && d.up < 0.4 },
  peace: { label: '✌️ Peace', test: (d) => d.f.index.ext && d.f.middle.ext && !d.f.ring.ext && !d.f.pinky.ext && d.spreadIM > 16, tip: 'that’s a V in Signing' },
  ok: { label: '👌 OK', test: (d, h) => h.touch.has('0-1') && d.f.middle.ext && d.f.ring.ext && d.f.pinky.ext, tip: 'that’s close to F in Signing' },
  point: { label: '☝️ Pointing', test: (d) => d.f.index.ext && allCurled(d, ['middle', 'ring', 'pinky']) },
  rock: { label: '🤘 Rock on', test: (d) => d.f.index.ext && d.f.pinky.ext && !d.f.middle.ext && !d.f.ring.ext },
  wave: { label: '👋 Hello!', test: () => false },
};
const allCurled = (d, names) => names.every((n) => !d.f[n].ext);
const STORE = 'hp-gestures-found';

export class HandsMode {
  name = 'Hands';
  hint = 'Show your hands to the camera · tap fingertips together · there are 6 hidden gestures';

  constructor({ sfx, hands }) {
    this.sfx = sfx;
    this.handModel = hands;
    this.rings = [];
    this.glow = new Particles(160);
    this.prevTouch = new Map();
    this.hold = new Map();        // hand id → { name, since }
    this.cool = 0;
    this.wave = new Map();        // hand id → { dir, flips: [t…] }
    this.moves = new Moves();
    this.bursts = [];             // ring bursts where a move happened
    this.moveFeed = el('div', { class: 'move-feed' });
    this.found = new Set();
    try { JSON.parse(localStorage.getItem(STORE) || '[]').forEach((g) => this.found.add(g)); } catch {}
    this.toast = el('div', { class: 'toast' });
    this.styleBtns = STYLES.map((name) => el('button', { 'data-hand': '', onclick: () => this.setStyle(name) }, name));
    this.panel = el('div', { class: 'mode-panel' }, [this.toast, this.moveFeed, el('div', { class: 'subtabs' }, this.styleBtns)]);
    let saved = 'Glove';
    try { saved = localStorage.getItem('hp-hand-style') || 'Glove'; } catch {}
    this.setStyle(STYLES.includes(saved) ? saved : 'Glove', true);
    this.t = 0;
  }

  update(dt, hands, now) {
    this.t += dt;
    // basic moves: swipes, push/pull, twist, grab/release, circle, clap, spread/squeeze, snap
    for (const m of this.moves.update(hands, now)) this.onMove(m);
    for (const b of this.bursts) b.age += dt;
    this.bursts = this.bursts.filter((b) => b.age < 0.7);
    for (const h of hands) {
      if (!h.pts) continue;
      // fingertip taps → a note and a ring at the contact point
      const before = this.prevTouch.get(h.id) || new Set();
      for (const key of h.touch) {
        if (before.has(key)) continue;
        const [a, b] = key.split('-').map(Number), tips = [4, 8, 12, 16, 20];
        const p = { x: (h.pts[tips[a]].x + h.pts[tips[b]].x) / 2, y: (h.pts[tips[a]].y + h.pts[tips[b]].y) / 2 };
        this.rings.push({ x: p.x, y: p.y, age: 0 });
        this.sfx.pop(PAIR_STEP[key] ?? 3);
      }
      this.prevTouch.set(h.id, new Set(h.touch));

      // faint sparkles from fast fingertips
      for (const t of h.tips) {
        const sp = Math.hypot(t.vx, t.vy);
        if (sp > 600 && Math.random() < 0.5) this.glow.add({ x: t.x, y: t.y, vx: t.vx * 0.05, vy: t.vy * 0.05, g: 0, decay: 1.6, size: 2, color: 'rgba(210,240,255,0.8)' });
      }

      // hidden gestures (hold 350 ms, 4 s cooldown)
      if (this.isWave(h, now)) {
        if (now > this.cool) { this.cool = now + 4000; this.celebrate('wave'); }
        this.hold.delete(h.id);
        continue;
      }
      const d = describe(h);
      if (!d) continue;
      const name = Object.entries(GESTURES).find(([, g]) => g.test(d, h))?.[0] ?? null;
      const st = this.hold.get(h.id);
      if (!st || st.name !== name) this.hold.set(h.id, { name, since: now });
      else if (name && now - st.since > 350 && now > this.cool) {
        this.cool = now + 4000;
        this.celebrate(name);
        st.since = Infinity;                       // once per pose; changing pose re-arms it
      }
    }
    for (const id of this.prevTouch.keys()) if (!hands.some((h) => h.id === id)) { this.prevTouch.delete(id); this.hold.delete(id); this.wave.delete(id); }
    for (const r of this.rings) r.age += dt;
    this.rings = this.rings.filter((r) => r.age < 0.6);
    this.glow.update(dt);
    this.hands = hands;
  }

  setStyle(name, quiet) {
    this.style = name;
    this.styleBtns.forEach((b, i) => b.classList.toggle('on', STYLES[i] === name));
    if (this.handModel) this.handModel.style = name;
    try { localStorage.setItem('hp-hand-style', name); } catch {}
    if (!quiet) this.sfx.click();
  }
  enter() { if (this.handModel) this.handModel.style = this.style; }
  exit() { if (this.handModel) this.handModel.style = 'Glove'; }       // other tabs always use the glove

  onMove(m) {
    this.bursts.push({ x: m.x, y: m.y, age: 0, big: m.hand === 'both' });
    const chip = el('div', { class: 'move-chip' }, `${MOVE_ICON[m.name] || '✨'} ${m.label}`);
    this.moveFeed.prepend(chip);
    while (this.moveFeed.children.length > 4) this.moveFeed.lastChild.remove();
    setTimeout(() => chip.classList.add('gone'), 1600);
    setTimeout(() => chip.remove(), 2100);
    this.sfx.pop({ clap: 0, grab: 1, release: 2, push: 3, pull: 3, snap: 7 }[m.name] ?? 5);
  }

  // a wave: the palm swings side to side, changing direction 3 times within 1.2 s
  isWave(h, now) {
    const vx = h.tips.reduce((s, t) => s + t.vx, 0) / h.tips.length;
    let w = this.wave.get(h.id);
    if (!w) { w = { dir: 0, flips: [] }; this.wave.set(h.id, w); }
    const dir = vx > 250 ? 1 : vx < -250 ? -1 : 0;
    if (dir && dir !== w.dir) { if (w.dir) w.flips.push(now); w.dir = dir; }
    w.flips = w.flips.filter((t) => now - t < 1200);
    if (w.flips.length >= 3) { w.flips = []; return true; }
    return false;
  }

  celebrate(name) {
    const g = GESTURES[name];
    const isNew = !this.found.has(name);
    this.found.add(name);
    try { localStorage.setItem(STORE, JSON.stringify([...this.found])); } catch {}
    this.toast.textContent = `${g.label}${isNew ? ' · new!' : ''}  ·  ${this.found.size}/${Object.keys(GESTURES).length} found${g.tip ? `  ·  ${g.tip}` : ''}`;
    this.toast.classList.remove('show'); void this.toast.offsetWidth; this.toast.classList.add('show');
    document.getElementById('hint')?.classList.add('gone');
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => this.toast.classList.remove('show'), 2600);
    if (isNew) this.sfx.discover(4); else this.sfx.collect();
  }

  // soft light under each palm (drawn beneath the gloves)
  draw(g) {
    if (this.style === 'Shadow') {                                  // a warm lamp-lit wall behind the puppets
      const { width, height } = g.canvas, k = g.getTransform().a;
      const w = width / k, h = height / k;
      const lamp = g.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, Math.max(w, h) * 0.7);
      lamp.addColorStop(0, 'rgba(255,226,170,0.92)'); lamp.addColorStop(1, 'rgba(120,82,40,0.9)');
      g.fillStyle = lamp; g.fillRect(0, 0, w, h);
      return;
    }
    if (!this.hands) return;
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const h of this.hands) {
      if (!h.pts) continue;
      const r = h.size * 2.2, a = 0.1 + 0.1 * h.pinchAmt;
      const grad = g.createRadialGradient(h.palm.x, h.palm.y, 0, h.palm.x, h.palm.y, r);
      grad.addColorStop(0, `rgba(170,210,255,${a})`); grad.addColorStop(1, 'rgba(170,210,255,0)');
      g.fillStyle = grad; g.beginPath(); g.arc(h.palm.x, h.palm.y, r, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }

  drawTop(g) {
    g.save();
    for (const b of this.bursts) {                                  // a move happened here
      const k = b.age / 0.7, r = (b.big ? 30 : 16) + (b.big ? 140 : 80) * k;
      g.strokeStyle = `rgba(160,220,255,${0.9 * (1 - k)})`; g.lineWidth = 3 * (1 - k) + 1;
      g.beginPath(); g.arc(b.x, b.y, r, 0, Math.PI * 2); g.stroke();
    }
    for (const r of this.rings) {
      const k = r.age / 0.6;
      g.strokeStyle = `rgba(124,227,177,${0.8 * (1 - k)})`; g.lineWidth = 2;
      g.beginPath(); g.arc(r.x, r.y, 10 + 40 * k, 0, Math.PI * 2); g.stroke();
    }
    g.restore();
    this.glow.draw(g, true);
  }
}
