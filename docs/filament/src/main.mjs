// Boot, loop, scenes, and the wiring between the simulation's events and everything you can see
// or hear. The simulation itself is in sim.mjs and knows nothing about any of this.

import { Screen, W, H, code } from './pixel.mjs';
import { DAY, NIGHT, LIT, TWILIGHT } from './palette.mjs';
import { newGame, step, interact, whatIsHere, RULES, TPS, satchelCap, isLit } from './sim.mjs';
import { draw, updateCamera, addTrauma, camera } from './render.mjs';
import * as audio from './audio.mjs';
import { checkInvariants } from './invariants.mjs';

const DEV = location.search.includes('dev');
const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d', { alpha: false });
ctx.imageSmoothingEnabled = false;
const imageData = ctx.createImageData(W, H);
const screen = new Screen();

let state = newGame((Math.random() * 1e9) | 0);
let scene = 'title';
let hitstop = 0;
let shownTick = 0;
let paused = false;
let role = 'archer';
const ROLES = ['archer', 'lineman', 'winder'];
let toast = null, toastT = 0;
let cascade = 0, cascadeAt = -1e9, relight = 0, relightAt = -1e9;

// ---------------------------------------------------------------------------------------------
// input. Held keys, plus edge-triggered presses that survive a freeze.
// ---------------------------------------------------------------------------------------------
const held = new Set();
const buffered = [];
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  Space: 'act', KeyZ: 'act', Enter: 'act',
  ArrowUp: 'role', KeyW: 'role', ArrowDown: 'role', KeyS: 'role',
  KeyM: 'mute', KeyR: 'restart', KeyP: 'pause',
};

addEventListener('keydown', (e) => {
  const k = KEYMAP[e.code];
  if (!k) return;
  e.preventDefault();
  audio.start();                         // the first key press is also the gesture audio needs
  if (!held.has(k)) buffered.push(k);    // buffered, so a freeze never eats a press
  held.add(k);
}, { passive: false });

addEventListener('keyup', (e) => {
  const k = KEYMAP[e.code];
  if (k) held.delete(k);
});

// a key held when the window loses focus never sends keyup, and the lineman walks west forever
addEventListener('blur', () => held.clear());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { paused = true; audio.suspend(); }
  else { audio.resume(); prev = null; acc = 0; }
});

// pointer and touch, so it works on a phone without a keyboard
let touchDir = 0;
function pointerAt(clientX) {
  const r = canvas.getBoundingClientRect();
  return (clientX - r.left) / r.width;
}
canvas.addEventListener('pointerdown', (e) => {
  audio.start();
  const p = pointerAt(e.clientX);
  if (scene !== 'play') { buffered.push('act'); return; }
  if (p < 0.35) touchDir = -1;
  else if (p > 0.65) touchDir = 1;
  else buffered.push('act');
});
addEventListener('pointerup', () => { touchDir = 0; });
addEventListener('pointercancel', () => { touchDir = 0; });

// ---------------------------------------------------------------------------------------------
// the loop. Fixed timestep, capped catch-up, and the first frame is never integrated.
// ---------------------------------------------------------------------------------------------
const DT_MS = 1000 / TPS;
let prev = null, acc = 0, frames = 0, elapsed = 0;

function frame(now) {
  requestAnimationFrame(frame);

  if (prev === null) { prev = now; return; }     // an uninitialised prev gives dt ~1.7e12
  let ft = now - prev;
  prev = now;
  if (ft > 250) ft = 250;                        // a tab return, a breakpoint, a long GC
  acc += ft;

  let steps = 0;
  while (acc >= DT_MS && steps < 5) { tick(); acc -= DT_MS; steps++; }
  if (steps === 5) acc = 0;                      // drop the backlog rather than spiral

  elapsed += ft / 1000;
  render();
  frames++;
}

function tick() {
  const presses = buffered.splice(0, buffered.length);

  for (const k of presses) {
    if (k === 'mute') { toastFor(audio.toggleMute() ? 'sound off' : 'sound on'); }
    if (k === 'pause' && scene === 'play') paused = !paused;
  }

  if (scene === 'title') {
    if (presses.includes('act')) { scene = 'play'; audio.sfx.select(); }
    return;
  }
  if (scene === 'over') {
    if (presses.includes('act') || presses.includes('restart')) restart();
    return;
  }
  if (presses.includes('restart')) { restart(); return; }
  if (paused) return;

  // Hitstop freezes the simulation but not the screen, the audio or the input queue. Eating
  // presses during a freeze is what makes hitstop feel like a dropped frame instead of impact.
  if (hitstop > 0) { hitstop--; buffered.unshift(...presses); return; }

  for (const k of presses) {
    if (k === 'role') {
      role = ROLES[(ROLES.indexOf(role) + 1) % ROLES.length];
      audio.sfx.select();
      toastFor(role);
    }
  }

  const input = {
    left: held.has('left') || touchDir < 0,
    right: held.has('right') || touchDir > 0,
  };
  if (presses.includes('act')) {
    const r = interact(state, role);
    if (!r.ok && r.why === 'poor') audio.sfx.deny();
  }

  step(state, input);
  consumeEvents();

  if (DEV) {
    const bad = checkInvariants(state);
    if (bad.length) { console.error('INVARIANT', state.tick, bad); paused = true; }
  }

  if (state.over && scene === 'play') {
    scene = 'over';
    (state.over === 'win' ? audio.sfx.win : audio.sfx.lose)();
    audio.music.stop();
  }
}

function toastFor(text) { toast = text; toastT = 90; }

/**
 * Events -> sound and shake. This is the only place the two are connected, and the simulation
 * cannot see it, so turning the juice up can never change the game.
 */
function consumeEvents() {
  const now = state.tick;
  for (const e of state.events) {
    switch (e.type) {
      case 'earn': audio.sfx.earn(); break;
      case 'spend': audio.sfx.spend(); break;
      case 'too-poor': audio.sfx.deny(); break;
      case 'hired': audio.sfx.hire(); break;
      case 'tooled': audio.sfx.hire(); break;
      case 'shoot': audio.sfx.shoot(); break;
      case 'hit': audio.sfx.hit(); break;
      case 'enemy-died': audio.sfx.died(); break;
      case 'gnawing': audio.sfx.gnawing(); break;

      case 'cable-cut':
        audio.sfx.cut();
        addTrauma(0.7);
        hitstop = 10;
        cascade = 0; cascadeAt = now;
        break;

      case 'tower-dark':
        // the cascade: each tower two semitones below the last, so the length of the phrase is
        // the size of the loss
        if (now - cascadeAt > 180) cascade = 0;
        cascadeAt = now;
        audio.sfx.blackout(cascade++);
        break;

      case 'tower-lit':
        if (now - relightAt > 180) relight = 0;
        relightAt = now;
        audio.sfx.relight(relight++);
        break;

      case 'tower-reserve': audio.sfx.reserve(); break;
      case 'spliced': audio.sfx.spliced(); break;
      case 'cable-mended': audio.sfx.mended(); break;
      case 'cable-laid': audio.sfx.mended(); break;
      case 'tower-raised': audio.sfx.build(); addTrauma(0.2); break;
      case 'tower-raised-higher': audio.sfx.raised(); break;
      case 'tower-hit': audio.sfx.towerHit(); addTrauma(0.45); break;
      case 'tower-fell': audio.sfx.towerFell(); addTrauma(0.75); hitstop = 8; break;
      case 'dynamo-hit': audio.sfx.dynamoHit(); addTrauma(0.6); break;
      case 'robbed': audio.sfx.robbed(); addTrauma(0.5); hitstop = 12; toastFor('robbed'); break;
      case 'burn': audio.sfx.burn(); break;
      case 'dusk': audio.sfx.dusk(); audio.setWind(0.03); break;
      case 'dawn': audio.sfx.dawn(); audio.setWind(0.018); break;
      case 'beacon-fired': audio.sfx.beacon(); addTrauma(1); hitstop = 20; break;
      case 'splice-failed': audio.sfx.cut(); addTrauma(0.4); break;
    }
  }
  state.events.length = 0;
  // the harmony line exists only while current is reaching something past the dynamo
  audio.music.setCircuit(state.towers.some((t) => t.kind !== 'dynamo' && t.fed));
}

function restart() {
  state = newGame((Math.random() * 1e9) | 0);
  scene = 'play';
  hitstop = 0; paused = false; cascade = 0; relight = 0;
  camera.x = 0; camera.trauma = 0;
  audio.music.setNight(false);
  audio.music.start();
  audio.sfx.select();
}

// ---------------------------------------------------------------------------------------------
// render
// ---------------------------------------------------------------------------------------------
function paletteFor() {
  // dusk and dawn step through twilight rather than crossfading, because the hardware changed the
  // sky in steps and the stepping is what reads as "the world is changing"
  switch (state.phase) {
    case 'day': return [DAY, DAY];
    // The lit palette must always be BRIGHTER than the unlit one, or a lamp pool reads as a hole
    // punched in the world. At dusk the unlit world is still twilight, so daylight is what a lamp
    // has to rotate back to; only at full night is LIT the right target.
    case 'dusk': return [state.phaseT > RULES.dusk * 0.5 ? TWILIGHT : DAY, DAY];
    case 'night': return [NIGHT, LIT];
    case 'dawn': return [state.phaseT > RULES.dawn * 0.5 ? DAY : TWILIGHT, DAY];
    default: return [DAY, DAY];
  }
}

function render() {
  updateCamera(state, 1 / 60);
  const [dark, light] = paletteFor();
  screen.setPalettes(dark, light);

  if (scene === 'title') drawTitle();
  else {
    draw(screen, state, elapsed);
    drawPrompt();
    if (scene === 'over') drawOver();
    else if (paused) drawCentred(['paused', '', 'press p']);
  }

  if (toastT > 0) {
    toastT--;
    screen.centre(H - 20, toast, code(3, 3));
  }
  screen.present(ctx, imageData);
}

function drawTitle() {
  screen.clear(code(0, 0));
  screen.rect(0, 0, W, H, code(0, 1));
  for (let x = 0; x < W; x++) {
    const h = 150 - Math.round(12 * Math.sin(x * 0.02) + 7 * Math.sin(x * 0.05 + 1));
    screen.vline(x, h, H - h, code(1, 1));
    screen.px(x, h, code(2, 2));
  }
  // a line of towers, lit, marching off into the distance
  for (let i = 0; i < 5; i++) {
    const x = 26 + i * 52;
    const g = 150 - Math.round(12 * Math.sin(x * 0.02) + 7 * Math.sin(x * 0.05 + 1));
    for (let k = 0; k < 3; k++) screen.rect(x - 2, g - 8 - k * 8, 5, 8, code(3, 2));
    screen.rect(x - 3, g - 34, 7, 4, code(1, 3));
    screen.hline(x, g - 3, 52, code(1, 3));
    screen.lamp(x, g - 30, 30);
  }
  screen.centre(44, 'FILAMENT', code(3, 3));
  screen.centre(62, 'the sun went out', code(3, 2));
  screen.centre(72, 'the line did not', code(3, 2));
  if (Math.floor(elapsed * 2) % 2) screen.centre(188, 'press space', code(1, 3));
  screen.centre(206, 'arrows move   space acts', code(3, 2));
  screen.centre(216, 'up changes tools   m mutes', code(3, 2));
}

/** The only interface: what pressing the button would do, right here, and what it costs. */
function drawPrompt() {
  if (scene !== 'play' || state.over) return;
  const here = whatIsHere(state);
  const y = 6;
  if (here) {
    const afford = state.spark >= here.cost;
    const text = `${here.label} ${here.cost}`;
    const w = screen.textWidth(text);
    screen.rect((W - w) / 2 - 4, y - 2, w + 8, 11, code(0, 0));
    screen.centre(y, text, afford ? code(1, 3) : code(3, 2));
  }
  // the tool you would hand out next, so changing it is not a guess
  screen.text(6, y, role, code(3, 2));
  // nights survived, as tally marks, bottom left. The only number anywhere, and it is not a digit.
  for (let i = 0; i < Math.min(12, state.nightNumber); i++) {
    screen.vline(6 + i * 3, H - 10, 6, code(3, 3));
  }
}

function drawOver() {
  const won = state.over === 'win';
  drawCentred(won
    ? ['the far light takes current', '', 'and something out there', 'answers with a light of its own',
       '', 'press space']
    : ['the dynamo is cold', '', 'the coast goes dark', '', 'press space']);
}

function drawCentred(lines) {
  const h = lines.length * 10 + 12;
  screen.rect(10, (H - h) / 2, W - 20, h, code(0, 0));
  lines.forEach((l, i) => screen.centre((H - h) / 2 + 7 + i * 10, l, code(3, 3)));
}

// ---------------------------------------------------------------------------------------------
// the window
// ---------------------------------------------------------------------------------------------
function fit() {
  const scale = Math.max(1, Math.min(
    Math.floor(innerWidth / W), Math.floor((innerHeight - 8) / H)));
  canvas.style.width = `${W * scale}px`;
  canvas.style.height = `${H * scale}px`;
}
addEventListener('resize', fit);
fit();

if (DEV) {
  globalThis.__filament = {
    get state() { return state; },
    step: (n = 1) => { for (let i = 0; i < n; i++) step(state, {}); },
    check: () => checkInvariants(state),
    give: (n) => { state.spark += n; state.ledger.minted += n; },
    night: () => { state.phase = 'day'; state.phaseT = RULES.day - 1; },
    pause: (v = true) => { paused = v; },
  };
  console.log('dev hooks on window.__filament');
}

requestAnimationFrame(frame);
