// Boot, loop, scenes.

import { Screen, W, H, code } from './pixel.mjs';
import { HALL, LIT, SETS, validate } from './palette.mjs';
import { newBout, step, play, RULES, TPS, MEASURES, inDistance, measureName } from './sim.mjs';
import { draw, addShake, fx, stances } from './render.mjs';
import * as audio from './audio.mjs';

const DEV = location.search.includes('dev');
const CALM = matchMedia('(prefers-reduced-motion: reduce)');
const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d', { alpha: false });
ctx.imageSmoothingEnabled = false;
const imageData = ctx.createImageData(W, H);
const screen = new Screen();

let state = newBout((Math.random() * 1e9) | 0);
let scene = 'title';
let elapsed = 0;
let paused = false;
const view = { lampYou: 0, lampFoe: 0, selected: 0, dir: 1 };
let note = null, noteT = 0;

const buffered = [];
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  Digit1: 'p1', Digit2: 'p2', Digit3: 'p3',
  Space: 'ok', Enter: 'ok', KeyZ: 'ok',
  ArrowUp: 'toward', KeyW: 'toward', ArrowDown: 'away', KeyS: 'away',
  KeyM: 'mute', KeyR: 'restart', KeyP: 'pause',
};

addEventListener('keydown', (e) => {
  const k = KEYMAP[e.code];
  if (!k) return;
  e.preventDefault();
  audio.start();
  buffered.push(k);
}, { passive: false });

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { paused = true; audio.suspend(); }
  else { audio.resume(); prev = null; acc = 0; }
});

// touch: tap a card to pick it, tap it again to play it; the strip toggles which way you step
canvas.addEventListener('pointerdown', (e) => {
  audio.start();
  const r = canvas.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * W;
  const y = ((e.clientY - r.top) / r.height) * H;
  if (scene !== 'play') { buffered.push('ok'); return; }
  if (y > H - 60) {
    const n = state.you.hand.length;
    const cw = 44, gap = 8;
    const x0 = (W - (n * cw + (n - 1) * gap)) / 2;
    for (let i = 0; i < n; i++) {
      if (x >= x0 + i * (cw + gap) && x <= x0 + i * (cw + gap) + cw) {
        buffered.push(view.selected === i ? 'ok' : `p${i + 1}`);
        return;
      }
    }
    return;
  }
  buffered.push(view.dir > 0 ? 'away' : 'toward');
});

const DT_MS = 1000 / TPS;
let prev = null, acc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  if (prev === null) { prev = now; return; }
  let ft = now - prev;
  prev = now;
  if (ft > 250) ft = 250;
  acc += ft;
  let steps = 0;
  while (acc >= DT_MS && steps < 5) { tick(); acc -= DT_MS; steps++; }
  if (steps === 5) acc = 0;
  elapsed += ft / 1000;
  render();
}

function tick() {
  const presses = buffered.splice(0, buffered.length);

  // handled here and removed, so a freeze can never re-deliver them
  for (let i = presses.length - 1; i >= 0; i--) {
    const k = presses[i];
    if (k === 'mute') { say(audio.toggleMute() ? 'sound off' : 'sound on'); presses.splice(i, 1); }
    else if (k === 'pause') { if (scene === 'play') paused = !paused; presses.splice(i, 1); }
  }

  if (scene === 'title') {
    if (presses.length) { scene = 'play'; audio.sfx.select(); }
    return;
  }
  if (scene === 'over') {
    if (presses.includes('ok') || presses.includes('restart')) restart();
    return;
  }
  if (presses.includes('restart')) { restart(); return; }
  if (paused) return;

  if (view.lampYou > 0) view.lampYou--;
  if (view.lampFoe > 0) view.lampFoe--;
  if (noteT > 0) noteT--;

  if (state.phase === 'choose') {
    const n = state.you.hand.length;
    for (const k of presses) {
      if (k === 'left') { view.selected = (view.selected + n - 1) % n; audio.sfx.move(); }
      if (k === 'right') { view.selected = (view.selected + 1) % n; audio.sfx.move(); }
      if (k === 'toward' && view.dir !== 1) { view.dir = 1; audio.sfx.move(); say('closing'); }
      if (k === 'away' && view.dir !== -1) { view.dir = -1; audio.sfx.move(); say('opening'); }
      if (k === 'p1' || k === 'p2' || k === 'p3') {
        const i = Number(k[1]) - 1;
        if (i < n) { view.selected = i; commit(); }
      }
      if (k === 'ok') commit();
    }
  }

  step(state);
  consume();

  if (state.over && scene === 'play') {
    scene = 'over';
    (state.over === 'win' ? audio.sfx.win
      : state.over === 'lose' ? audio.sfx.lose : audio.sfx.doubleOut)();
  }
}

function commit() {
  const card = state.you.hand[view.selected];
  if (!card) return;
  const r = play(state, card, view.dir);
  if (r.ok) {
    audio.sfx.select();
    view.selected = Math.min(view.selected, Math.max(0, state.you.hand.length - 1));
  }
}

function say(text) { note = text; noteT = 90; }

function consume() {
  for (const e of state.events) {
    switch (e.type) {
      case 'tell': audio.sfx.tell(); break;
      case 'passivity': say('on guard'); audio.sfx.stepOn(); break;
      case 'reveal':
        if (e.you === 'attack' || e.foe === 'attack') audio.sfx.lunge();
        else if (e.you === 'step' || e.foe === 'step') audio.sfx.stepOn();
        break;
      case 'double':
        audio.sfx.box(true);
        view.lampYou = TPS * 1.6;
        // the second lamp follows the first by the lockout, which is the one number everyone knows
        setTimeout(() => { view.lampFoe = TPS * 1.3; }, 260);
        if (!CALM.matches) addShake(1);
        say('double');
        break;
      case 'light':
        audio.sfx.box(false);
        if (e.side === 'you') view.lampYou = TPS * 1.6; else view.lampFoe = TPS * 1.6;
        if (!CALM.matches) addShake(0.55);
        break;
      case 'nothing':
        if (e.kind === 'riposte-you' || e.kind === 'riposte-foe') audio.sfx.parry();
        else if (e.kind.startsWith('short')) { audio.sfx.short(); say('short'); }
        else audio.sfx.nothing();
        break;
      case 'result':
        if (state.you.card === 'parry' && state.foe.card === 'attack') audio.sfx.parry();
        if (state.you.card === 'attack' && state.foe.card === 'parry') audio.sfx.parry();
        break;
    }
  }
  state.events.length = 0;
}

function restart() {
  state = newBout((Math.random() * 1e9) | 0);
  scene = 'play';
  paused = false;
  view.lampYou = 0; view.lampFoe = 0; view.selected = 0; view.dir = 1;
  note = null; noteT = 0;
  fx.shake = 0;
  elapsed = 0;
  audio.sfx.select();
}

// ---------------------------------------------------------------------------------------------
function render() {
  screen.setPalettes(HALL, LIT);
  if (scene === 'title') drawTitle();
  else {
    draw(screen, state, view, elapsed);
    drawChrome();
    if (scene === 'over') drawOver();
    else if (paused) panel(['paused', '', 'press p']);
  }
  screen.present(ctx, imageData);
}

function drawChrome() {
  // Above the strip, in the dark band — this used to be printed across the piste itself, on top of
  // the two fencers, which is the one part of the screen that has to stay legible.
  const m = measureName(state);
  const reach = inDistance(state.measure);
  // the measure, centred, with a bright rule under it when an attack would actually reach —
  // "am I close enough" is the only question the picture cannot answer at a glance
  const w = screen.textWidth(m);
  screen.centre(116, m, reach ? code(3, 3) : code(3, 2));
  if (reach) screen.rect((W - w) / 2, 125, w, 1, code(6, 3));

  // which way your step would go, on the other side of the screen from the measure
  const dirText = view.dir > 0 ? 'step in' : 'step out';
  screen.text(W - 8 - screen.textWidth(dirText), 116, dirText, code(3, 2));
  if (noteT > 0) screen.centre(100, note, code(6, 3));
}

function drawTitle() {
  screen.clear(code(0, 0));
  // the box, big, with both lamps lit — which is the whole idea in one picture
  const y = 54;
  screen.rect(W / 2 - 62, y, 124, 50, code(3, 1));
  screen.hline(W / 2 - 62, y, 124, code(3, 3));
  screen.hline(W / 2 - 62, y + 49, 124, code(3, 2));
  const lamp = (cx, pal) => {
    for (let dy = -13; dy <= 13; dy++) {
      for (let dx = -13; dx <= 13; dx++) {
        if (dx * dx + dy * dy > 169) continue;
        screen.px(cx + dx, y + 25 + dy, code(pal, dx * dx + dy * dy > 130 ? 2 : 3));
      }
    }
  };
  const both = Math.floor(elapsed * 1.4) % 2 === 0;
  lamp(W / 2 - 30, 6);
  if (both) lamp(W / 2 + 30, 7);
  screen.lamp(W / 2 - 30, y + 25, 40);
  if (both) screen.lamp(W / 2 + 30, y + 25, 40);

  screen.clearLit(0, 112, W, 60);
  screen.rect(0, 112, W, 58, code(0, 0));
  screen.centre(118, 'LOCKOUT', code(6, 3));
  screen.centre(136, 'both lights can come on', code(3, 3));
  screen.centre(146, 'at once. that is the point.', code(3, 3));

  screen.clearLit(0, 184, W, 50);
  screen.rect(0, 184, W, 50, code(0, 0));
  if (Math.floor(elapsed * 2) % 2) screen.centre(190, 'press anything', code(6, 3));
  screen.centre(206, '1 2 3 play a card', code(3, 3));
  screen.centre(216, 'up and down change step', code(3, 3));
}

function drawOver() {
  const how = state.timeout ? 'on time' : '';
  const line = `${Math.max(state.you.score, state.foe.score)} to ` +
               `${Math.min(state.you.score, state.foe.score)}`;
  panel(state.over === 'win' ? ['the bout is yours', how, line, '', 'press space']
    : state.over === 'lose' ? ['the bout is theirs', how, line, '', 'press space']
    : ['both lights', 'both of you out', '', `${state.you.score} all`, '', 'press space']);
}

function panel(lines) {
  const h = lines.length * 10 + 16;
  const y = Math.round((H - h) / 2);
  screen.clearLit(10, y, W - 20, h);
  screen.rect(10, y, W - 20, h, code(0, 0));
  screen.hline(10, y, W - 20, code(3, 3));
  screen.hline(10, y + h - 1, W - 20, code(3, 3));
  lines.forEach((l, i) => screen.centre(y + 9 + i * 10, l.slice(0, 28), code(3, 3)));
}

function fit() {
  const dpr = Math.max(1, Math.min(4, window.devicePixelRatio || 1));
  const device = Math.max(1, Math.min(
    Math.floor((innerWidth * dpr) / W), Math.floor(((innerHeight - 8) * dpr) / H)));
  canvas.style.width = `${(W * device) / dpr}px`;
  canvas.style.height = `${(H * device) / dpr}px`;
}
addEventListener('resize', fit);
fit();

if (DEV) {
  const problems = Object.entries(SETS).flatMap(([k, s]) => validate(s, k));
  console[problems.length ? 'error' : 'log']('palettes', problems.length ? problems : 'legal');
  globalThis.__lockout = { get state() { return state; }, get view() { return view; } };
}

requestAnimationFrame(frame);
