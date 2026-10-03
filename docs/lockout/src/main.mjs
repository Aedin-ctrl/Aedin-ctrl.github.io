// Boot, loop, scenes.

import { Screen, W, H, code } from './pixel.mjs';
import { HALL, LIT, SETS, validate } from './palette.mjs';
import { newBout, step, play, RULES, TPS, inDistance, measureName } from './sim.mjs';
import { draw, addShake, fx, cardAt } from './render.mjs';
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
// Everything that used to be a wall-clock setTimeout is a tick counter here, so it obeys pause,
// tab-switching and restart like the rest of the game.
//   lampFoeIn  counts down to the SECOND lamp of a double — the lockout, drawn rather than simulated
//   holdFoePip hides the opponent's new score pip for exactly as long, so the scoreboard cannot
//              announce the double before the second lamp does
const view = { lampYou: 0, lampFoe: 0, lampFoeIn: 0, holdFoePip: 0, selected: 0, dir: 1 };
let note = null, noteT = 0;
let queued = null;      // a card press that arrived while the last touch was still resolving

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
  // Pause while hidden, and — this is the part that was missing — UNPAUSE on the way back. It used
  // to set paused and never clear it, so coming back to the tab left the game frozen with only the
  // letter P to save you, and the title screen does not mention the letter P.
  if (document.hidden) { paused = true; audio.suspend(); }
  else { paused = false; audio.resume(); prev = null; acc = 0; }
});

// touch: tap a card to pick it, tap it again to play it; the strip toggles which way you step
canvas.addEventListener('pointerdown', (e) => {
  audio.start();
  const r = canvas.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * W;
  const y = ((e.clientY - r.top) / r.height) * H;
  if (scene !== 'play') { buffered.push('ok'); return; }
  // ask the renderer where the cards are, rather than keeping a second, slightly wrong copy
  const i = cardAt(state.you.hand.length, x, y);
  if (i >= 0) { buffered.push(`p${i + 1}`); return; }
  if (y > H - 60) return;                     // the card row, but between two cards: do nothing
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
  if (view.holdFoePip > 0) view.holdFoePip--;
  // the second lamp of a double, on the game's own clock
  if (view.lampFoeIn > 0 && --view.lampFoeIn === 0) view.lampFoe = Math.round(TPS * 1.3);

  const choosing = state.phase === 'choose';
  const n = state.you.hand.length;

  for (const k of presses) {
    // Choosing and stepping only move the cursor, so they work in any phase — there is no reason
    // to ignore them for the 2.3 seconds a touch takes to resolve.
    if (k === 'left') { view.selected = (view.selected + n - 1) % n; audio.sfx.move(); }
    if (k === 'right') { view.selected = (view.selected + 1) % n; audio.sfx.move(); }
    if (k === 'toward' && view.dir !== 1) { view.dir = 1; audio.sfx.move(); say('closing'); }
    if (k === 'away' && view.dir !== -1) { view.dir = -1; audio.sfx.move(); say('opening'); }

    // Playing a card can only happen on your turn — but a press that lands mid-resolve is now
    // REMEMBERED rather than thrown away. The whole buffer used to be spliced and dropped every
    // tick, so for most of every turn the game ate your keystrokes and said nothing.
    if (k === 'p1' || k === 'p2' || k === 'p3' || k === 'ok') {
      const i = k === 'ok' ? view.selected : Number(k[1]) - 1;
      if (choosing) { if (i < n) { view.selected = i; commit(); } }
      else { queued = i; say('ready'); }
    }
  }

  if (choosing && queued !== null) {
    const i = queued;
    queued = null;
    if (i < state.you.hand.length) { view.selected = i; commit(); }
  }

  step(state);
  consume();
  // the music tightens as either of you approaches five
  const near = Math.max(state.you.score, state.foe.score) / RULES.target;
  audio.music.setTension(near);

  if (state.over && scene === 'play') {
    scene = 'over';
    audio.music.stop();
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

/**
 * What just happened, in words.
 *
 * `resolve()` works out exactly why each exchange ended the way it did and puts it in `kind` — and
 * the game then showed the player a lamp and a 1.1-second pose and nothing else. You lost a touch
 * and were never told whether you were parried, out of distance, or simply beaten to it. The
 * information already existed; it was only being thrown away.
 */
const CALL = {
  'riposte-you': 'parried \u2014 riposte',
  'riposte-foe': 'parried \u2014 their riposte',
  'touch-you': 'touch',
  'touch-foe': 'their touch',
  'short': 'short \u2014 no distance',
  'short-both': 'both short',
  'nothing': 'both parried',
};

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
        view.lampYou = Math.round(TPS * 1.6);
        // The second lamp follows the first by the lockout — RULES.lockout, which until now was
        // declared in sim.mjs and then ignored while this line said 260 instead. Real lockout is
        // 40ms, which is two and a half frames and therefore invisible; the exaggeration is
        // deliberate and now lives in one place, next to the comment that explains it.
        view.lampFoeIn = RULES.lockout;
        // and the scoreboard waits with it, so the pips cannot give the double away first
        view.holdFoePip = RULES.lockout;
        if (!CALM.matches) addShake(1);
        say('double');
        break;
      case 'light':
        audio.sfx.box(false);
        if (e.side === 'you') view.lampYou = TPS * 1.6; else view.lampFoe = TPS * 1.6;
        if (!CALM.matches) addShake(0.55);
        break;
      case 'nothing':
        if (e.kind.startsWith('short')) audio.sfx.short();
        else audio.sfx.nothing();
        break;
      case 'result':
        if (CALL[e.kind]) say(CALL[e.kind]);
        // the sound of steel on steel, whichever side of it you were on
        if (e.kind === 'riposte-you' || e.kind === 'riposte-foe') audio.sfx.parry();
        break;
    }
  }
  state.events.length = 0;
}

function restart() {
  state = newBout((Math.random() * 1e9) | 0);
  scene = 'play';
  paused = false;
  view.lampYou = 0; view.lampFoe = 0; view.lampFoeIn = 0; view.holdFoePip = 0;
  view.selected = 0; view.dir = 1;
  note = null; noteT = 0;
  queued = null;
  fx.shake = 0;
  elapsed = 0;
  audio.music.reset();
  audio.music.start();
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

  // Which way a STEP would go — shown only when step is the card under the cursor. It used to be
  // on screen permanently, which reads as though it modifies whatever you play; `view.dir` is in
  // fact only ever consulted when the card is a step.
  if (state.you.hand[view.selected] === 'step' && state.phase === 'choose') {
    const dirText = view.dir > 0 ? 'step in' : 'step out';
    screen.text(W - 8 - screen.textWidth(dirText), 116, dirText, code(3, 3));
  }
  if (noteT > 0) screen.centre(100, note, code(6, 3));
}

function drawTitle() {
  screen.clear(code(0, 0));

  // The box, with the lockout happening on it, over and over.
  //
  // This used to alternate: the red lamp always on, the green one blinking on and off beside it —
  // under a line of text that says both lights can come on at once. Half the time the picture
  // contradicted the sentence. And the glow was thrown at a radius of 40 from a box only 50 tall,
  // so the lit region washed out the left half of the panel and left the right half a flat grey
  // slab: cold, it read as a draw-order fault rather than as a machine.
  //
  // Now it plays the actual event. One lamp, then the other a beat later, then both held, then
  // dark — which is what a double looks like on a real box, and what the game is named after.
  const y = 54;
  const CYCLE = 2.6;
  const at = elapsed % CYCLE;
  const first = at > 0.35 && at < 2.1;
  const second = at > 0.72 && at < 2.1;      // the lockout, slowed until the eye can catch it

  screen.rect(W / 2 - 62, y, 124, 50, code(3, 1));
  screen.hline(W / 2 - 62, y, 124, code(3, 3));
  screen.hline(W / 2 - 62, y + 49, 124, code(3, 2));
  screen.vline(W / 2 - 62, y, 50, code(3, 2));
  screen.vline(W / 2 + 61, y, 50, code(3, 2));

  const lamp = (cx, on, pal) => {
    for (let dy = -13; dy <= 13; dy++) {
      for (let dx = -13; dx <= 13; dx++) {
        const r = dx * dx + dy * dy;
        if (r > 169) continue;
        const edge = r > 130;
        screen.px(cx + dx, y + 25 + dy,
                  code(on ? pal : 3, on ? (edge ? 2 : 3) : (edge ? 1 : 2)));
      }
    }
  };
  lamp(W / 2 - 30, first, 6);
  lamp(W / 2 + 30, second, 7);
  // a throw that stays inside the machine rather than flooding the screen
  if (first) screen.lamp(W / 2 - 30, y + 25, 21);
  if (second) screen.lamp(W / 2 + 30, y + 25, 21);

  screen.clearLit(0, 110, W, 130);
  screen.rect(0, 110, W, 130, code(0, 0));
  screen.centre(118, 'LOCKOUT', code(6, 3));
  screen.centre(136, 'both lights can come on', code(3, 3));
  screen.centre(146, 'at once. that is the point.', code(3, 3));

  if (Math.floor(elapsed * 2) % 2) screen.centre(172, 'press anything', code(6, 3));
  screen.centre(190, '1 2 3 play a card', code(3, 3));
  screen.centre(200, 'up and down change step', code(3, 3));
  // the triangle, stated once, because until recently it was only true in the design document
  screen.centre(210, 'attack beats step', code(3, 2));
  screen.centre(219, 'parry beats attack', code(3, 2));
  screen.centre(228, 'step draws a parry out', code(3, 2));
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
  // Reserve the instruction line's REAL measured height, not a guess.
  //
  // It used to be fixed to the bottom of the window while the canvas took `innerHeight - reserve`, so
  // whenever rounding the scale down to a whole multiple of 240 happened to leave less than about
  // 17px of slack, the line printed across the bottom of the game. A height sweep found it at 5 of
  // 14 window heights, including 728, 740 and 760 — which is to say, on an ordinary laptop. The
  // line now sits below the canvas and claims its own space, and that space is measured, because
  // the line wraps to two rows on a narrow phone.
  const hintEl = document.querySelector('.hint');
  const reserve = (hintEl ? hintEl.offsetHeight : 0) + 16;
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
