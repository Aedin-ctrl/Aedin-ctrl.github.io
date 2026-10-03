// Boot, loop, scenes, and the wiring between the simulation's events and everything you can see
// or hear. The simulation itself is in sim.mjs and knows nothing about any of this.

import { Screen, W, H, code } from './pixel.mjs';
import { DAY, NIGHT, LIT, TWILIGHT } from './palette.mjs';
import { newGame, step, interact, whatIsHere, groundAt, RULES, TPS, satchelCap, isLit } from './sim.mjs';
import { draw, updateCamera, addTrauma, camera } from './render.mjs';
import * as audio from './audio.mjs';
import * as particles from './particles.mjs';
import { CREW } from './sprites.mjs';
import { checkInvariants } from './invariants.mjs';

const DEV = location.search.includes('dev');
// Shake and hitstop are the only things here that could trouble anyone, so they are gated rather
// than the game being flattened — a reduced-motion player still gets the whole thing.
const CALM = matchMedia('(prefers-reduced-motion: reduce)');
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
const SPRITE_FOR = CREW;
let toast = null, toastT = 0, nudge = 0;
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
function pointerAt0(clientY) {
  const r = canvas.getBoundingClientRect();
  return (clientY - r.top) / r.height;
}
canvas.addEventListener('pointerdown', (e) => {
  audio.start();
  const p = pointerAt(e.clientX);
  const q = pointerAt0(e.clientY);
  if (scene !== 'play') { buffered.push('act'); return; }
  // The top strip changes the tool.
  //
  // Touch had no way to cycle roles at all, so on a phone every single person you hired became an
  // archer — you were stuck with the two starting winders for income and the one starting lineman
  // doing every build, every cable and every night repair across the whole coast. The hint under
  // the canvas says "up changes tools", which on a phone was simply a lie.
  if (q < 0.14) { buffered.push('role'); return; }
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

  // Handled here and REMOVED from the queue. These used to be read above the hitstop gate while
  // the gate pushed the same presses back on, so holding M through a twenty-frame beacon freeze
  // toggled mute twenty-one times and wrote localStorage as often.
  for (let i = presses.length - 1; i >= 0; i--) {
    const k = presses[i];
    if (k === 'mute') { toastFor(audio.toggleMute() ? 'sound off' : 'sound on'); presses.splice(i, 1); }
    else if (k === 'pause') { if (scene === 'play') paused = !paused; presses.splice(i, 1); }
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
    // Every press answers. Pressing the only action button in the game and getting silence is how
    // a first-timer concludes it has not started yet — and there is nothing to do at the spot you
    // begin on, so that silence was the very first thing that happened.
    if (!r.ok) { audio.sfx.deny(); nudge = 10; }
  }

  step(state, input);
  consumeEvents();
  // The camera, the shake and the toast clock belong on the TICK, not the frame. They were being
  // advanced from render() with a hardcoded 1/60, so on a 120Hz display the camera lerped at
  // double speed, the shake decayed in half the time and a toast lasted 0.75s instead of 1.5s —
  // the simulation was frame-rate independent and the feel was not, in a game whose whole budget
  // is feel.
  updateCamera(state, 1 / TPS);
  if (toastT > 0) toastT--;
  particles.update((x) => groundAt(state, x));
  particles.ride(state.monarch.x, groundAt(state, state.monarch.x) - 2, state.monarch.vx);

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

const shake = (n) => { if (!CALM.matches) addTrauma(n); };
const freeze = (n) => { if (!CALM.matches) hitstop = n; };

/**
 * Events -> sound and shake. This is the only place the two are connected, and the simulation
 * cannot see it, so turning the juice up can never change the game.
 */
function consumeEvents() {
  const now = state.tick;
  for (const e of state.events) {
    switch (e.type) {
      case 'earn': audio.sfx.earn(); spark(e.x, Math.min(4, e.amount)); break;
      case 'spend': audio.sfx.spend(); spark(e.x, 3); break;
      case 'too-poor': audio.sfx.deny(); break;
      case 'hired': audio.sfx.hire(); break;
      case 'tooled': audio.sfx.hire(); break;
      case 'shoot': audio.sfx.shoot(); break;
      case 'hit': audio.sfx.hit(); break;
      case 'enemy-died': audio.sfx.died(); particles.burst(e.x, groundAt(state, e.x) - 6, 3, 'mote'); break;
      case 'gnawing': audio.sfx.gnawing(); break;

      case 'cable-cut':
        audio.sfx.cut();
        shake(0.7);
        freeze(10);
        particles.burst(e.x, groundAt(state, e.x) - 4, 6, 'spark', 1.2);
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
      case 'behind': audio.sfx.behind(); toastFor('behind you'); break;
      case 'spliced': audio.sfx.spliced(); break;
      case 'cable-mended': audio.sfx.mended(); break;
      case 'cable-laid': audio.sfx.mended(); break;
      case 'tower-raised':
        audio.sfx.build(); shake(0.2);
        particles.burst(e.x, groundAt(state, e.x) - 2, 5, 'dust');
        break;
      case 'tower-raised-higher': audio.sfx.raised(); break;
      case 'tower-hit':
        audio.sfx.towerHit(); shake(0.45);
        particles.burst(e.x, groundAt(state, e.x) - 14, 3, 'debris');
        break;
      case 'tower-fell':
        audio.sfx.towerFell(); shake(0.75); freeze(8);
        particles.burst(e.x, groundAt(state, e.x) - 16, 10, 'debris', 1.3);
        break;
      case 'dynamo-hit': audio.sfx.dynamoHit(); shake(0.6); break;
      case 'robbed': audio.sfx.robbed(); shake(0.5); freeze(12); toastFor('robbed'); break;
      case 'burn': audio.sfx.burn(); break;
      case 'dusk': audio.sfx.dusk(); audio.setWind(0.03); break;
      case 'dawn': audio.sfx.dawn(); audio.setWind(0.018); break;
      case 'beacon-fired':
        audio.sfx.beacon(); shake(1); freeze(20);
        particles.burst(e.x, groundAt(state, e.x) - 40, 14, 'spark', 1.6);
        break;
      case 'splice-failed': audio.sfx.cut(); shake(0.4); break;
    }
  }
  state.events.length = 0;
  // the harmony line exists only while current is reaching something past the dynamo
  audio.music.setCircuit(state.towers.some((t) => t.kind !== 'dynamo' && t.fed));
}

/** Spark flies out in a small arc. Never more than four: five reads as a handful, twelve as mush. */
function spark(x, n) {
  particles.burst(x, groundAt(state, x) - 10, Math.max(1, Math.min(4, n)), 'spark', 0.8);
}

function restart() {
  state = newGame((Math.random() * 1e9) | 0);
  scene = 'play';
  hitstop = 0; paused = false; cascade = 0; relight = 0;
  // all of this used to survive into the new run: a toast from the old game, the night wind level,
  // the tool you happened to be holding, the elapsed clock the animations key off
  toast = null; toastT = 0;
  role = 'archer';
  elapsed = 0;
  camera.x = 0; camera.trauma = 0;
  particles.clear();
  audio.music.setNight(false);
  audio.setWind(0.018);
  audio.music.start();
  audio.sfx.select();
}

// ---------------------------------------------------------------------------------------------
// render
// ---------------------------------------------------------------------------------------------
function paletteFor() {
  // The ending darkens the world. It reads as a moment rather than a dialog box, and it also gives
  // the panel a guaranteed black backdrop to sit on — in daylight the backdrop is a bright blue
  // and white text on it was unreadable.
  if (scene === 'over') return [NIGHT, LIT];
  // The title is the one picture that has to say what the game is: a line of lit towers in the
  // dark. Drawing it in daylight meant the lamps did nothing at all, because a lamp here is a mask
  // and a mask does nothing when both palettes are the same.
  if (scene === 'title') return [NIGHT, LIT];
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
  const [dark, light] = paletteFor();
  screen.setPalettes(dark, light);

  if (scene === 'title') drawTitle();
  else {
    draw(screen, state, elapsed);
    drawPrompt();
    if (scene === 'over') drawOver();
    else if (paused) drawCentred(['paused', '', 'press p']);
  }

  if (toastT > 0) screen.centre(H - 32, toast, code(3, 3));
  screen.present(ctx, imageData);
}

const titleGround = (x) => 156 - Math.round(11 * Math.sin(x * 0.019) + 6 * Math.sin(x * 0.047 + 1));

function drawTitle() {
  screen.clear(code(0, 0));
  // a dead sky, a far ridge, and then the coast
  screen.dither(0, 60, W, 10, code(0, 0), code(0, 1), 0);
  screen.rect(0, 70, W, 16, code(0, 1));
  for (let x = 0; x < W; x++) {
    const r = 92 - Math.round(6 * Math.sin(x * 0.013 + 2));
    // the ridge draws from the ground palette, whose lit entry is a dark brown rather than a
    // bright green — a lamp pool clipping the horizon should not turn the far hills emerald
    screen.vline(x, r, 34, code(1, 1));
    screen.px(x, r, code(2, 1));
    const g = titleGround(x);
    screen.vline(x, g, H - g, code(1, 1));
    screen.px(x, g, code(1, 3));
  }

  // the line itself: five towers, lit, with current running along the cable between them
  for (let i = 0; i < 5; i++) {
    const x = 24 + i * 52;
    const g = titleGround(x);
    for (let k = 0; k < 3; k++) screen.sprite(x - 4, g - 8 - k * 8, S_BODY, 6);
    screen.rect(x - 3, g - 33, 7, 5, code(5, 2));
    screen.rect(x - 2, g - 32, 5, 3, code(5, 3));
    if (i < 4) screen.hline(x, g - 3, 52, code(5, 2));
  }
  // dots of current, travelling outward, so the title is doing the thing the game is about
  const flow = (elapsed * 90) % 26;
  for (let d = -flow; d < 212; d += 26) {
    if (d < 0) continue;
    const x = Math.round(24 + d);
    screen.rect(x, titleGround(x) - 5, 2, 2, code(5, 3));
  }
  for (let i = 0; i < 5; i++) screen.lamp(24 + i * 52, titleGround(24 + i * 52) - 18, 30);

  screen.clearLit(0, 28, W, 54);
  screen.centre(36, 'FILAMENT', code(5, 3));
  screen.centre(56, 'the sun went out', code(3, 3));
  screen.centre(66, 'the line did not', code(3, 3));

  screen.clearLit(0, 186, W, 46);
  if (Math.floor(elapsed * 2) % 2) screen.centre(192, 'press space', code(5, 3));
  screen.centre(210, 'arrows move   space acts', code(3, 3));
  screen.centre(220, 'up changes tools', code(3, 3));
}

const S_BODY = [
  [0,2,2,2,2,2,0,0], [0,2,1,2,2,0,0,0], [0,2,2,2,2,2,0,0], [0,2,2,2,2,0,0,0],
  [0,2,1,2,2,2,0,0], [0,2,2,2,2,0,0,0], [0,2,2,2,2,2,0,0], [0,2,1,2,2,0,0,0],
];

/** The only interface: what pressing the button would do, right here, and what it costs. */
function drawPrompt() {
  if (scene !== 'play' || state.over) return;
  const here = whatIsHere(state);
  const y = 6;

  // What you have, beside what the thing under you costs.
  //
  // The prompt printed a price and the satchel was eight single pixels on a moving sprite, so the
  // game showed an absolute cost and an eight-step relative bar and asked you to compare them.
  // Having printed half the sentence, printing the other half is the honest fix.
  const held = `${state.spark}`;
  screen.rect(2, y - 2, screen.textWidth(held) + 6, 11, code(0, 0));
  screen.text(5, y, held, code(1, 3));

  if (here) {
    const afford = state.spark >= here.cost;
    const text = `${here.label} ${here.cost}`;
    const w = screen.textWidth(text);
    screen.rect((W - w) / 2 - 4, y - 2, w + 8, 11, code(0, 0));
    // unaffordable blinks as well as dimming: a colour-only affordance cannot be learned on a
    // first encounter, because you have never seen the other state
    const dim = !afford && (Math.floor(elapsed * 3) % 2 === 0);
    screen.centre(y, text, afford ? code(1, 3) : dim ? code(3, 1) : code(3, 2));
  }
  // The tool you would hand out next, as the person AND the word, down beside the night tally
  // where there is room for both — the word alone was the weakest part of the indicator, and the
  // sprite is the thing you will actually see walking around.
  screen.sprite(6, H - 22, SPRITE_FOR[role], 4);
  screen.text(16, H - 21, role, code(3, 2));
  // nights survived, as tally marks
  for (let i = 0; i < Math.min(20, state.nightNumber); i++) {
    screen.vline(6 + i * 3, H - 11, 6, code(3, 3));
  }
}

function drawOver() {
  const won = state.over === 'win';
  const s2 = state.stats;
  const line = `${state.nightNumber} nights   ${s2.cutsSpliced + s2.cutsMended} breaks mended`;
  drawCentred(won
    ? ['the far light', 'takes current', '', 'and far out on the water',
       'something answers', 'with a light of its own', '', line, 'press space']
    : ['the dynamo is cold', '', 'and the coast', 'goes dark behind you', '', line, 'press space']);
}

/** Lines are kept to 28 characters, which is the widest that fits inside the panel at 8px a glyph. */
function drawCentred(lines) {
  const h = lines.length * 10 + 16;
  const y = Math.round((H - h) / 2);
  screen.clearLit(8, y, W - 16, h);
  screen.rect(8, y, W - 16, h, code(0, 0));
  screen.rect(8, y, W - 16, 1, code(3, 2));
  screen.rect(8, y + h - 1, W - 16, 1, code(3, 2));
  lines.forEach((l, i) => screen.centre(y + 9 + i * 10, l.slice(0, 28), code(3, 3)));
}

// ---------------------------------------------------------------------------------------------
// the window
// ---------------------------------------------------------------------------------------------
function fit() {
  // Integer in DEVICE pixels, not CSS pixels. At a devicePixelRatio of 1.25 or 1.5 — Windows at
  // 125%, most Android — an integer CSS scale lands on 3.75 or 4.5 device pixels per source pixel,
  // and `image-rendering: pixelated` then draws alternating 4px and 5px rows. Avoiding exactly
  // that is what this whole renderer is for.
  const dpr = Math.max(1, Math.min(4, window.devicePixelRatio || 1));
  const device = Math.max(1, Math.min(
    Math.floor((innerWidth * dpr) / W), Math.floor(((innerHeight - 8) * dpr) / H)));
  canvas.style.width = `${(W * device) / dpr}px`;
  canvas.style.height = `${(H * device) / dpr}px`;
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
