// Boot, loop, scenes. Same shape as Filament's, rewritten for a game with one verb.

import { Screen, W, H, code } from './pixel.mjs';
import { bandFor, litFor, BASE, DAWN, SETS, validate } from './palette.mjs';
import { newGame, step, RULES, TPS, chargeOf, heightOf } from './sim.mjs';
import { PLATFORMS } from './level.mjs';
import { SCREEN_COUNT } from './level.mjs';
import { draw, updateCamera, decayTrauma, shakeTick, addTrauma, camera } from './render.mjs';
import * as audio from './audio.mjs';
import * as particles from './particles.mjs';

const DEV = location.search.includes('dev');
// Shake and hitstop are the only things here that could trouble anyone; both are gated rather than
// the whole game being flattened, so a reduced-motion player still gets the climb.
const CALM = matchMedia('(prefers-reduced-motion: reduce)');
const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d', { alpha: false });
ctx.imageSmoothingEnabled = false;
const imageData = ctx.createImageData(W, H);
const screen = new Screen();

let state = newGame();
let scene = 'title';
let paused = false;
let elapsed = 0;
let hitstop = 0;
let bestScreen = 0;
let lastHeightSent = -1;

const held = new Set();
const buffered = [];
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  Space: 'hold', KeyZ: 'hold', ArrowUp: 'hold', KeyW: 'hold',
  KeyM: 'mute', KeyR: 'restart', KeyP: 'pause', Enter: 'hold',
};

addEventListener('keydown', (e) => {
  const k = KEYMAP[e.code];
  if (!k) return;
  e.preventDefault();
  audio.start();
  if (!held.has(k)) buffered.push(k);
  held.add(k);
}, { passive: false });
addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) held.delete(k); });
addEventListener('blur', () => {
  // `touch` was not cleared here, and `pointerup` fires on the window — so releasing outside the
  // page, or losing focus first, left the climber wound to maximum. You came back from another
  // window already at full charge and the next click launched you.
  held.clear();
  pointers.clear();
  touch = readTouch();
});
document.addEventListener('visibilitychange', () => {
  // Pause while hidden, and — this is the part that was missing — UNPAUSE on the way back. It used
  // to set `paused` and never clear it, so a tab you came back to was frozen for good. The escape
  // was the letter P, which is not in the hint line, not on the title screen, and not on a phone
  // at all: a notification mid-game left a mobile player staring at a PAUSED panel with no way out
  // but a reload, losing the run.
  if (document.hidden) { paused = true; audio.suspend(); }
  else { paused = false; audio.resume(); prev = null; acc = 0; }
});

// touch: left third, right third, and the middle is the button
let touch = { left: false, right: false, hold: false };
function touchAt(clientX) {
  const r = canvas.getBoundingClientRect();
  return (clientX - r.left) / r.width;
}
// Touch, by finger rather than by zone.
//
// Two versions of this have been wrong, in opposite directions, and both were uncompletable.
//
// The first set `hold: true` for every touch, so you could jump and never walk. The fix PARTITIONED
// the screen into three exclusive zones — outer thirds walk, middle winds up — which made
// `touch.hold` and `touch.left/right` mutually exclusive. But `sim.mjs` only writes the lean inside
// the hold branch, so on a phone the lean was permanently 0 and every jump went dead vertical:
// measured against the real physics, **0 of 76 route steps are makeable with no lean**. Not most.
// None. You cannot clear the first one.
//
// So the zones overlap now, and each finger is tracked by its own pointerId instead of a single
// object that each new touch clobbers. The bottom strip is a lean pad; anywhere above it winds up;
// and a second finger ADDS a lean to a wind-up already in progress rather than cancelling it.
const pointers = new Map();

function readTouch() {
  let left = false, right = false, hold = false;
  for (const p of pointers.values()) {
    if (p.lean === 'left') left = true;
    else if (p.lean === 'right') right = true;
    if (p.hold) hold = true;
  }
  return { left, right, hold };
}

function classify(e) {
  const r = canvas.getBoundingClientRect();
  const fx = (e.clientX - r.left) / r.width;
  const fy = (e.clientY - r.top) / r.height;
  // the bottom fifth is the lean pad; everywhere else winds up. A finger on the lean pad also
  // holds, so one thumb can charge and lean at once — which is how a phone is actually held.
  const lean = fx < 0.34 ? 'left' : fx > 0.66 ? 'right' : null;
  return { lean: fy > 0.8 ? lean : (fx < 0.2 ? 'left' : fx > 0.8 ? 'right' : null), hold: true };
}

canvas.addEventListener('pointerdown', (e) => {
  audio.start();
  if (scene !== 'play') { buffered.push('hold'); return; }
  try { canvas.setPointerCapture(e.pointerId); } catch {}
  pointers.set(e.pointerId, classify(e));
  touch = readTouch();
});
canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId) || scene !== 'play') return;
  pointers.set(e.pointerId, classify(e));
  touch = readTouch();
});
const lift = (e) => { pointers.delete(e.pointerId); touch = readTouch(); };
canvas.addEventListener('pointerup', lift);
canvas.addEventListener('pointercancel', lift);
addEventListener('pointerup', lift);

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
  // The shake lives on the tick clock like everything else in this game. Decayed inside the render
  // path it ran once per frame, so the fall — the biggest reaction the game has — was half as long
  // on a 120Hz display and a third as long at 144.
  decayTrauma();
  shakeTick();
  const presses = buffered.splice(0, buffered.length);

  // Mute and pause are handled HERE, and removed from the queue, before anything can re-deliver
  // them. They used to be handled above the hitstop gate while the gate pushed the same presses
  // back on — so holding M through a twenty-frame beacon freeze toggled mute twenty-one times,
  // wrote localStorage twenty-one times, and left you unable to predict which way it landed.
  for (let i = presses.length - 1; i >= 0; i--) {
    const k = presses[i];
    if (k === 'mute') { audio.toggleMute(); presses.splice(i, 1); }
    else if (k === 'pause') { if (scene === 'play') paused = !paused; presses.splice(i, 1); }
  }

  if (scene === 'title') {
    if (presses.includes('hold')) { scene = 'play'; audio.sfx.select(); held.delete('hold'); }
    return;
  }
  if (scene === 'over') {
    if (presses.includes('hold') || presses.includes('restart')) restart();
    return;
  }
  if (presses.includes('restart')) { restart(); return; }
  if (paused) return;
  if (hitstop > 0) { hitstop--; buffered.unshift(...presses); return; }

  step(state, {
    left: held.has('left') || touch.left,
    right: held.has('right') || touch.right,
    hold: held.has('hold') || touch.hold,
  });
  consumeEvents();

  if (state.p.charging) {
    audio.sfx.winding(chargeOf(state));
    // scuffs under the boots as the wind-up builds, faster the fuller it gets
    if (chargeOf(state) > 0.35 && state.tick % Math.max(2, 7 - Math.floor(chargeOf(state) * 6)) === 0) {
      particles.scuff(state.p.x, state.p.y + RULES.body.h);
    }
  }
  particles.update((x) => {
    // particles rest on whatever ledge is under them, so dust settles instead of falling forever
    let floor = 12 * 240;
    for (const b of PLATFORMS) {
      if (x + 1 > b.x && x < b.x + b.w && b.y < floor && b.y > state.p.y - 40) floor = b.y;
    }
    return floor;
  });
  // an AudioParam automation every tick is 72,000 scheduled events over twenty minutes for a
  // value that changes slowly; only send it when it has actually moved
  const h = Math.round(heightOf(state) * 40) / 40;
  if (h !== lastHeightSent) {
    lastHeightSent = h;
    audio.setHeight(h);
    audio.music.setHeight(h);
  }

  if (state.over && scene === 'play') { scene = 'over'; audio.music.stop(); audio.sfx.win(); }
}

function consumeEvents() {
  const shake = (n) => { if (!CALM.matches) addTrauma(n); };
  const freeze = (n) => { if (!CALM.matches) hitstop = n; };
  for (const e of state.events) {
    switch (e.type) {
      case 'jump': audio.sfx.jump(e.power); break;
      case 'land':
        audio.sfx.land(); shake(0.18);
        particles.burst(e.x + 4, e.y + RULES.body.h, 3, 'dust', 0.6);
        break;
      case 'skid':
        audio.sfx.skid(); shake(0.3);
        particles.burst(e.x + 4, e.y + RULES.body.h, 5, 'dust', 0.9);
        break;
      case 'bounce':
        audio.sfx.bounce(e.speed); shake(0.22);
        particles.burst(e.x + 4, e.y + 6, 3, 'spark', 0.8);
        break;
      case 'bonk':
        audio.sfx.bonk(); shake(0.4); freeze(4);
        particles.burst(e.x + 4, e.y, 5, 'debris', 1.1);
        break;
      case 'up': audio.sfx.up(e.screen); bestScreen = Math.max(bestScreen, e.screen); break;
      // A fall is the only punishment this game has, so it gets the biggest reaction in it.
      case 'down': audio.sfx.down(e.lost); shake(Math.min(1, 0.35 + e.lost * 0.25));
                   freeze(Math.min(16, 6 + e.lost * 4)); break;
      case 'win':
        shake(1); freeze(20);
        particles.burst(state.p.x + 4, state.p.y, 14, 'spark', 1.5);
        break;
    }
  }
  state.events.length = 0;
}

function restart() {
  state = newGame();
  audio.music.start();
  // Reset, or a second climb opens a fifth too high and slides back down over thirteen seconds —
  // which is what `music.reset()` was written for, and nothing had ever called it.
  audio.music.reset();
  scene = 'play';
  paused = false; hitstop = 0;
  camera.trauma = 0;
  particles.clear();
  // and let go of whatever was being held. Press R while holding space — or hold space on the
  // ending screen, which says `press space` — and the new run began already wound to full.
  held.clear();
  pointers.clear();
  touch = readTouch();
  audio.sfx.select();
}

// ---------------------------------------------------------------------------------------------
function render() {
  updateCamera(state);
  const band = scene === 'title' ? BASE : scene === 'over' ? DAWN : bandFor(heightOf(state));
  screen.setPalettes(band, litFor(band));

  if (scene === 'title') drawTitle();
  else {
    draw(screen, state, elapsed);
    drawHud();
    if (scene === 'over') drawOver();
    else if (paused) panel(['paused', '', 'press p']);
  }
  screen.present(ctx, imageData);
}

/**
 * The only interface: how far up the tower you are, as a column of marks down the right-hand edge.
 * No numbers, no bar, no timer. The crouch is the charge meter and the wind is the altimeter.
 */
function drawHud() {
  for (let i = 0; i < SCREEN_COUNT; i++) {
    const y = H - 14 - i * 7;
    const reached = i <= state.screen;
    const everReached = i <= bestScreen;
    // unreached marks use entry 3 of the structure palette, which is the lightest thing the band
    // has — entry 1 is black at the base, where the player most needs to see how far there is to go
    screen.rect(W - 8, y, reached ? 5 : 3, 2,
      // Entry 3 for BOTH, which is what the comment above has always said and the code did not:
      // never-reached marks were drawn in entry 2, and at the base of the tower that is the same
      // dark blue as the mortar dither behind them. The altimeter was invisible in exactly the
      // place "how far is there to go" is worth knowing.
      reached ? code(5, 3) : code(3, 3));
  }
}

function drawTitle() {
  screen.clear(code(0, 0));
  // the tower in silhouette, with the lamp lit at the top
  const baseY = 196;
  for (let i = 0; i < 11; i++) {
    const w = 54 - i * 2;
    screen.rect(128 - w / 2, baseY - i * 14, w, 14, code(1, i > 7 ? 3 : 2));
    screen.hline(128 - w / 2, baseY - i * 14, w, code(3, 3));
    if (i % 2 === 0) screen.rect(128 - 4, baseY - i * 14 + 4, 8, 6, code(0, 0));
  }
  screen.rect(112, 38, 32, 18, code(5, 1));
  screen.rect(116, 42, 24, 10, code(5, 2));
  screen.rect(121, 45, 14, 5, code(5, 3));
  const phase = Math.floor(elapsed * 10) % 2;
  screen.dither(144, 42, W - 144, 10, code(5, 3), code(5, 2), phase);
  screen.dither(0, 42, 112, 10, code(5, 2), code(5, 3), phase);
  screen.lamp(128, 48, 74);

  // clearLit only rotates the palette back; it does not erase. Without a solid band behind it the
  // tower drew straight through the prose and 'SOMETHING OUT THERE' read as 'SOMETHING OOT THERE'.
  screen.clearLit(0, 70, W, 46);
  screen.rect(0, 70, W, 46, code(0, 0));
  screen.centre(78, 'THE FAR LIGHT', code(5, 3));
  screen.centre(96, 'something out there', code(3, 3));
  screen.centre(106, 'answered. go and see.', code(3, 3));

  screen.clearLit(0, 196, W, 44);
  screen.rect(0, 196, W, 42, code(0, 0));
  if (Math.floor(elapsed * 2) % 2) screen.centre(202, 'hold space to wind up', code(5, 3));
  screen.centre(218, 'lean with the arrows', code(3, 3));
  screen.centre(228, 'let go to jump', code(3, 3));
}

function drawOver() {
  const mins = Math.floor(state.tick / TPS / 60);
  const secs = Math.floor((state.tick / TPS) % 60);
  panel(['you came up out of the dark', 'and the light on the water',
         'was closer than it looked', '',
         `${state.jumps} jumps  ${state.falls} falls  ${mins}:${String(secs).padStart(2, '0')}`,
         'press space'], true);
}

function panel(lines, atBottom = false) {
  const h = lines.length * 10 + 16;
  // the ending sits low, so the thing you climbed eighty-eight ledges to see is not covered by a
  // box of text congratulating you on seeing it
  const y = atBottom ? H - h - 14 : Math.round((H - h) / 2);
  screen.clearLit(8, y, W - 16, h);
  screen.rect(8, y, W - 16, h, code(0, 0));
  screen.hline(8, y, W - 16, code(3, 2));
  screen.hline(8, y + h - 1, W - 16, code(3, 2));
  lines.forEach((l, i) => screen.centre(y + 9 + i * 10, l.slice(0, 29), code(3, 3)));
}

function fit() {
  // Integer scaling has to be integer in DEVICE pixels, not CSS pixels. At a devicePixelRatio of
  // 1.25 or 1.5 — Windows at 125%, most Android — an integer CSS scale lands on 3.75 or 4.5 device
  // pixels per source pixel, and `image-rendering: pixelated` then draws alternating 4px and 5px
  // rows. The whole point of this renderer is that it never does that.
  // Reserve the instruction line's REAL measured height, not a guess.
  //
  // It used to be fixed to the bottom of the window while the canvas took `innerHeight - 8`, so
  // whenever rounding the scale down to a whole multiple of 240 happened to leave less than about
  // 17px of slack, the line printed across the bottom of the game. A height sweep found it at 5 of
  // 14 window heights, including 728, 740 and 760 — which is to say, on an ordinary laptop. The
  // line now sits below the canvas and claims its own space, and that space is measured, because
  // the line wraps to two rows on a narrow phone.
  //
  // NOTE: the first attempt at this fix computed `reserve` and then never used it, because the
  // replacement that was supposed to put it into the maths matched the words `innerHeight - 8`
  // inside this very comment instead of in the code below. The overlap went away — the line sits
  // in its own row now — so the test said the bug was fixed, while the canvas was quietly being
  // pushed up and clipped at the top at the same window heights as before.
  const hintEl = document.querySelector('.hint');
  const reserve = (hintEl ? hintEl.offsetHeight : 0) + 16;
  const dpr = Math.max(1, Math.min(4, window.devicePixelRatio || 1));
  const maxW = Math.floor((innerWidth * dpr) / W);
  const maxH = Math.floor(((innerHeight - reserve) * dpr) / H);
  const device = Math.max(1, Math.min(maxW, maxH));
  canvas.style.width = `${(W * device) / dpr}px`;
  canvas.style.height = `${(H * device) / dpr}px`;
}
addEventListener('resize', fit);
fit();

if (DEV) {
  const problems = Object.entries(SETS).flatMap(([k, s]) => validate(s, k));
  if (problems.length) console.error('PALETTE', problems);
  else console.log('palettes legal');
  globalThis.__farlight = {
    get state() { return state; },
    warp: (s) => { state.p.y = (SCREEN_COUNT - 1 - s) * 240 + 180; state.p.vy = 0; },
    pause: (v = true) => { paused = v; },
    // the camera, so a test can check that the shake decays on the TICK clock rather than on the
    // frame clock — which it did not, and which no tool could see because none import render.mjs
    camera,
    shake: (n) => addTrauma(n),
  };
}

requestAnimationFrame(frame);
