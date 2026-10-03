// Boot, loop, scenes. Same shape as Filament's, rewritten for a game with one verb.

import { Screen, W, H, code } from './pixel.mjs';
import { bandFor, litFor, BASE, DAWN, SETS, validate } from './palette.mjs';
import { newGame, step, RULES, TPS, chargeOf, heightOf } from './sim.mjs';
import { SCREEN_COUNT } from './level.mjs';
import { draw, updateCamera, addTrauma, camera } from './render.mjs';
import * as audio from './audio.mjs';

const DEV = location.search.includes('dev');
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
addEventListener('blur', () => held.clear());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { paused = true; audio.suspend(); }
  else { audio.resume(); prev = null; acc = 0; }
});

// touch: left third, right third, and the middle is the button
let touch = { left: false, right: false, hold: false };
function touchAt(clientX) {
  const r = canvas.getBoundingClientRect();
  return (clientX - r.left) / r.width;
}
canvas.addEventListener('pointerdown', (e) => {
  audio.start();
  if (scene !== 'play') { buffered.push('hold'); return; }
  const p = touchAt(e.clientX);
  touch = { left: p < 0.33, right: p > 0.67, hold: true };
});
addEventListener('pointerup', () => { touch = { left: false, right: false, hold: false }; });
addEventListener('pointercancel', () => { touch = { left: false, right: false, hold: false }; });

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
  for (const k of presses) {
    if (k === 'mute') audio.toggleMute();
    if (k === 'pause' && scene === 'play') paused = !paused;
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

  if (state.p.charging) audio.sfx.winding(chargeOf(state));
  audio.setHeight(heightOf(state));

  if (state.over && scene === 'play') { scene = 'over'; audio.sfx.win(); }
}

function consumeEvents() {
  for (const e of state.events) {
    switch (e.type) {
      case 'jump': audio.sfx.jump(e.power); break;
      case 'land': audio.sfx.land(); addTrauma(0.18); break;
      case 'skid': audio.sfx.skid(); addTrauma(0.3); break;
      case 'bounce': audio.sfx.bounce(e.speed); addTrauma(0.22); break;
      case 'bonk': audio.sfx.bonk(); addTrauma(0.4); hitstop = 4; break;
      case 'up': audio.sfx.up(e.screen); bestScreen = Math.max(bestScreen, e.screen); break;
      // A fall is the only punishment this game has, so it gets the biggest reaction in it.
      case 'down': audio.sfx.down(e.lost); addTrauma(Math.min(1, 0.35 + e.lost * 0.25));
                   hitstop = Math.min(16, 6 + e.lost * 4); break;
      case 'win': addTrauma(1); hitstop = 20; break;
    }
  }
  state.events.length = 0;
}

function restart() {
  state = newGame();
  scene = 'play';
  paused = false; hitstop = 0;
  camera.trauma = 0;
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
    screen.rect(W - 8, y, reached ? 5 : 3, 2,
      code(reached ? 5 : 3, reached ? 3 : (everReached ? 2 : 1)));
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

  screen.clearLit(0, 70, W, 50);
  screen.centre(78, 'THE FAR LIGHT', code(5, 3));
  screen.centre(96, 'something out there', code(3, 3));
  screen.centre(106, 'answered. go and see.', code(3, 3));

  screen.clearLit(0, 196, W, 44);
  if (Math.floor(elapsed * 2) % 2) screen.centre(202, 'hold space to wind up', code(5, 3));
  screen.centre(218, 'lean with the arrows', code(3, 3));
  screen.centre(228, 'let go to jump', code(3, 3));
}

function drawOver() {
  panel(['you came up out of the dark', '', 'and the light on the water',
         'was closer than it looked', '', 'press space']);
}

function panel(lines) {
  const h = lines.length * 10 + 16;
  const y = Math.round((H - h) / 2);
  screen.clearLit(8, y, W - 16, h);
  screen.rect(8, y, W - 16, h, code(0, 0));
  screen.hline(8, y, W - 16, code(3, 2));
  screen.hline(8, y + h - 1, W - 16, code(3, 2));
  lines.forEach((l, i) => screen.centre(y + 9 + i * 10, l.slice(0, 29), code(3, 3)));
}

function fit() {
  const scale = Math.max(1, Math.min(Math.floor(innerWidth / W), Math.floor((innerHeight - 8) / H)));
  canvas.style.width = `${W * scale}px`;
  canvas.style.height = `${H * scale}px`;
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
  };
}

requestAnimationFrame(frame);
