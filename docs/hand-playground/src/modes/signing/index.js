// Signing tab: fingerspell ASL letters. Hold a letter steady to type it, drop your hand for a
// space. "Teach" walks through the alphabet and learns your own handshapes.
import { describe, vector } from './features.js';
import { classify, Taught, Smoother, STATIC_LETTERS } from './classify.js';
import { el } from '../ui.js';
import WORDS from './words.js';
import { Trails } from './motion.js';

// Word suggestions for the word being spelled. Each typed letter keeps the model's top guesses,
// so a misread letter can still match ("MAMY" → "many").
export function suggest(slots, n = 3) {
  if (!slots.length) return [];
  const out = [];
  WORDS.forEach((w, rank) => {
    if (w.length < slots.length) return;
    let score = 0;
    for (let i = 0; i < slots.length; i++) {
      const k = slots[i].indexOf(w[i].toUpperCase());
      if (k < 0) return;
      score += k === 0 ? 3 : 1;
    }
    if (w.length === slots.length) score += 1;
    out.push({ w, score: score - rank / 2000 });
  });
  return out.sort((a, b) => b.score - a.score).slice(0, n).map((o) => o.w);
}

const HOLD_MS = 650;             // steady this long to type a letter
const SPACE_MS = 1300;           // hand gone this long → space
const TEACH_MS = 1600;           // samples collected per letter while teaching

export class SigningMode {
  name = 'Signing';
  numHands = 1;                    // one signing hand → faster, lower-latency detection
  hint = 'Fingerspell with one hand · hold a letter steady to type it · lower your hand for a space';

  constructor({ sfx, size }) {
    this.sfx = sfx; this.size = size;
    this.taught = new Taught();
    this.text = '';
    this.cur = null; this.held = 0; this.lastTyped = null; this.nullSince = 0; this.goneSince = 0;
    this.smoother = new Smoother();
    this.trails = new Trails();
    this.prevWrist = null;
    this.teach = null;             // { i, start, got }

    const btn = (label, title, fn) => el('button', { 'data-hand': '', title, onclick: fn }, label);
    this.letterEl = el('div', { class: 'sign-letter' }, '');
    this.sourceEl = el('div', { class: 'sign-source' }, '');
    this.ring = el('div', { class: 'sign-ring' });
    this.textEl = el('div', { class: 'sign-text' }, '');
    this.teachEl = el('div', { class: 'sign-teach', hidden: '' });
    this.teachBtn = btn('Teach', 'Learn your own handshapes for each letter', () => this.startTeach());
    this.practiceBtn = btn('Practice', 'Practice letters: sign the one shown', () => this.togglePractice());
    this.practice = null;         // { target, since, holdMs, score, streak, weights }
    this.slots = [];              // top guesses for each letter of the current word
    this.sugEl = el('div', { class: 'sign-suggest' });
    this.panel = el('div', { class: 'mode-panel' }, [
      el('div', { class: 'sign-card' }, [this.ring, this.letterEl, this.sourceEl]),
      this.sugEl, this.textEl, this.teachEl,
      el('div', { class: 'tools' }, [
        btn('Space', 'Add a space', () => this.type(' ')),
        btn('Delete', 'Delete the last letter (Backspace)', () => this.backspace()),
        btn('Clear', 'Clear the text', () => { this.text = ''; this.slots = []; this.render(); }),
        btn('Speak', 'Read the text aloud', () => this.speak()),
        this.practiceBtn, this.teachBtn,
      ]),
    ]);
    this.render();
  }

  type(ch, alts) {
    if (ch === ' ' && (this.text === '' || this.text.endsWith(' '))) return;
    this.text = (this.text + ch).slice(-60);
    if (ch === ' ') this.slots = []; else this.slots.push(alts?.length ? alts : [ch]);
    this.render();
  }
  backspace() { this.text = this.text.slice(0, -1); this.slots.pop(); this.render(); }
  accept(word) {
    const cut = this.text.lastIndexOf(' ') + 1;
    this.text = (this.text.slice(0, cut) + word.toUpperCase() + ' ').slice(-60);
    this.slots = [];
    this.sfx.bond(2, 4);
    this.render();
  }
  speak() {
    if (!('speechSynthesis' in window) || !this.text.trim()) return;
    speechSynthesis.cancel();
    speechSynthesis.speak(new SpeechSynthesisUtterance(this.text.toLowerCase()));
  }

  onKey(e) {
    if (e.key === 'Backspace') { this.backspace(); return true; }
    if (e.key === ' ') { e.preventDefault(); this.type(' '); return true; }
    if (e.key === 'Escape' && this.teach) { this.endTeach(); return true; }
    return false;
  }

  // ── teaching ────────────────────────────────────────────────────────
  startTeach() {
    if (this.teach) return this.endTeach();
    if (this.practice) { this.practice = null; this.practiceBtn.textContent = 'Practice'; }
    this.teach = { i: 0, start: 0, got: 0 };
    this.teachBtn.textContent = 'Stop teaching';
    this.teachEl.hidden = false;
    this.renderTeach();
  }
  endTeach() {
    this.teach = null;
    this.taught.save();
    this.teachBtn.textContent = 'Teach';
    this.teachEl.hidden = true;
    this.sfx.discover(4);
  }
  ensureTeachParts() {
    if (!this.teachParts) {
      this.teachParts = {
        kicker: el('div', { class: 'teach-kicker' }), letter: el('div', { class: 'teach-letter' }),
        sub: el('div', { class: 'teach-sub' }), fill: el('div', { class: 'teach-fill' }),
      };
      const t = this.teachParts;
      this.teachEl.append(t.kicker, t.letter, t.sub, el('div', { class: 'teach-bar' }, [t.fill]));
    }
    return this.teachParts;
  }
  renderTeach(progress = 0) {
    const t = this.ensureTeachParts(), L = STATIC_LETTERS[this.teach.i];
    t.kicker.textContent = `Teach ${this.teach.i + 1} / ${STATIC_LETTERS.length}`;
    t.letter.textContent = L;
    t.sub.textContent = progress > 0 ? 'Hold it…' : 'Show this letter and hold still';
    t.fill.style.width = `${Math.round(progress * 100)}%`;        // CSSOM, allowed by the CSP
  }

  // ── practice: sign the letter shown; letters you miss come up more often ──
  togglePractice() {
    if (this.practice) { clearTimeout(this.practice.advanceT); this.practice = null; this.teachEl.hidden = true; this.practiceBtn.textContent = 'Practice'; return; }
    if (this.teach) this.endTeach();
    let weights = {};
    try { weights = JSON.parse(localStorage.getItem('hp-sign-weights') || '{}'); } catch {}
    this.practice = { score: 0, streak: 0, weights };
    this.practiceBtn.textContent = 'Stop practice';
    this.teachEl.hidden = false;
    this.nextTarget();
  }
  nextTarget() {
    const P = this.practice, letters = [...STATIC_LETTERS, 'J', 'Z'];
    const w = letters.map((l) => (P.weights[l] ?? 1) * (l === P.target ? 0.1 : 1));
    let r = Math.random() * w.reduce((a, b) => a + b, 0), i = 0;
    while ((r -= w[i]) > 0 && i < letters.length - 1) i++;
    P.target = letters[i]; P.since = performance.now(); P.holdMs = 0;
    this.renderPractice('Sign this letter');
  }
  renderPractice(sub, progress = 0) {
    const P = this.practice;
    const t = this.ensureTeachParts();
    t.kicker.textContent = `Practice · ${P.score} right · streak ${P.streak}`;
    t.letter.textContent = P.target;
    t.sub.textContent = sub;
    t.fill.style.width = `${Math.round(progress * 100)}%`;
  }
  practiceStep(letter, conf, dt, now) {
    const P = this.practice;
    if (P.since === Infinity) return;                              // paused between letters after a miss
    const hit = letter === P.target && (conf >= 0.7 || 'JZ'.includes(letter));
    P.holdMs = hit ? P.holdMs + dt * 1000 : Math.max(0, P.holdMs - dt * 2000);
    const saveW = () => { try { localStorage.setItem('hp-sign-weights', JSON.stringify(P.weights)); } catch {} };
    if (P.holdMs >= 500 || (hit && 'JZ'.includes(letter))) {
      P.score++; P.streak++;
      P.weights[P.target] = Math.max(0.5, (P.weights[P.target] ?? 1) * 0.8); saveW();
      this.sfx.discover(3);
      return this.nextTarget();
    }
    if (now - P.since > 8000) {
      P.streak = 0;
      P.weights[P.target] = Math.min(4, (P.weights[P.target] ?? 1) * 1.5); saveW();
      this.sfx.release(0);
      this.renderPractice(letter ? `That looked like ${letter} — here’s another` : 'Let’s try another', 0);
      P.since = Infinity;
      P.advanceT = setTimeout(() => { if (this.practice === P) this.nextTarget(); }, 1200);   // bound to this session
      return;
    }
    this.renderPractice(letter && letter !== P.target ? `That’s ${letter}` : 'Sign this letter', Math.min(1, P.holdMs / 500));
  }

  // ── per-frame ──────────────────────────────────────────────────────
  update(dt, hands, now) {
    const hand = hands.find((h) => h.world);
    const d = hand ? describe(hand) : null;

    // wrist speed (palm lengths / s) — pauses typing and teaching while the hand is moving
    if (hand) {
      const w = hand.pts[0], palm = Math.hypot(hand.pts[9].x - w.x, hand.pts[9].y - w.y) || 1;
      const speed = this.prevWrist ? Math.hypot(w.x - this.prevWrist.x, w.y - this.prevWrist.y) / palm / Math.max(dt, 1e-3) : 0;
      this.prevWrist = { x: w.x, y: w.y };
      this.moving = speed > (this.moving ? 0.8 : 1.2);
    } else { this.prevWrist = null; this.moving = false; }

    if (this.teach) {
      if (!d) { this.teach.start = 0; this.renderTeach(0); return; }
      // don't record while moving, pinching, or reaching for the buttons
      if (this.moving || hand.down || hand.pinch.y > (this.size?.().h ?? 1e9) * 0.75) { this.teach.start = 0; this.renderTeach(0); return; }
      const L = STATIC_LETTERS[this.teach.i];
      if (!this.teach.start) { this.teach.start = now; this.taught.forget(L); }
      const p = (now - this.teach.start) / TEACH_MS;
      if (p > 0.25 && (this.teach.frame = (this.teach.frame || 0) + 1) % 2 === 0) { this.taught.add(L, vector(d)); this.teach.got++; }   // skip the first moment while the hand settles
      this.renderTeach(Math.min(1, p));
      if (p >= 1) {
        this.sfx.bond(1, 3);
        this.teach.i++; this.teach.start = 0; this.teach.got = 0;
        if (this.teach.i >= STATIC_LETTERS.length) this.endTeach();
        else this.renderTeach(0);
      }
      return;
    }

    if (!d) {
      this.cur = null; this.lastTyped = null; this.smoother.reset(); this.prevWrist = null; this.trails.reset();
      this.showLetter(null);
      if (!this.goneSince) this.goneSince = now;
      if (now - this.goneSince > SPACE_MS && this.text && !this.text.endsWith(' ')) this.type(' ');
      return;
    }
    this.goneSince = 0;

    const res = classify(d, this.taught, hand.pts);
    const sm = this.smoother.update(res.p, dt);
    const letter = sm.letter;

    // motion letters: J (I + pinky hook) and Z (point + zig-zag). If the static letter was
    // just typed on the way in, replace it.
    this.trails.add(hand, sm.top[0].letter, now);
    const motion = this.trails.detect();
    if (motion && now - (this.motionAt || 0) > 900) {
      this.motionAt = now;
      if (!this.practice) {
        const prev = this.text.slice(-1);
        if ((motion === 'J' && prev === 'I') || (motion === 'Z' && 'DGX'.includes(prev))) this.backspace();
        this.type(motion, [motion]);
        this.lastTyped = motion;
      }
      this.trails.reset();
      this.sfx.bond(2, 6);
    }


    if (this.practice) {
      this.practiceStep(motion || letter, sm.conf, dt, now);
      this.showLetter(letter, res.taught === letter ? 'taught' : 'model', 0);
      return;
    }
    if (letter !== this.cur) { this.cur = letter; this.held = 0; }
    if (!letter) {
      this.nullSince ||= now;
      if (now - this.nullSince > 250) this.lastTyped = null;       // a real relax allows a repeat
    } else this.nullSince = 0;
    if (letter && !this.moving) this.held += dt * 1000;
    if (letter && letter !== this.lastTyped && this.held >= HOLD_MS) {
      this.lastTyped = letter;
      this.type(letter, sm.top.slice(0, 3).filter((t) => t.p > 0.08).map((t) => t.letter));
      this.sfx.pop(4);
    }
    this.lastConf = sm.conf;
    const done = letter && letter === this.lastTyped;
    this.showLetter(letter, res.taught === letter ? 'taught' : 'model', done ? 1 : Math.min(1, this.held / HOLD_MS));
    this.handPos = hand.palm;
  }

  showLetter(letter, source, held = 0) {
    this.letterEl.textContent = letter ?? '·';
    this.letterEl.classList.toggle('dim', !letter);
    this.sourceEl.textContent = letter ? (source === 'taught' ? 'your handshape' : `${Math.round((this.lastConf || 0) * 100)}% sure`) : this.moving ? 'hold still' : 'no letter';
    this.ring.style.setProperty('--p', held);
    this.ring.classList.toggle('done', held >= 1);
  }

  render() {
    const words = suggest(this.slots);
    this.sugEl.textContent = '';
    for (const w of words) this.sugEl.append(el('button', { 'data-hand': '', onclick: () => this.accept(w) }, w.toUpperCase()));
    this.textEl.textContent = this.text ? (this.text.length > 36 ? '…' + this.text.slice(-36) : this.text) : 'Start fingerspelling…';
    this.textEl.classList.toggle('placeholder', !this.text);
    const n = this.taught.letters.size;
    this.teachBtn.title = n ? `Taught ${n} letters — click to re-teach` : 'Learn your own handshapes for each letter';
  }

  draw() {}
}
