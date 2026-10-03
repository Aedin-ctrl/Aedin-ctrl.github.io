// One picture: the box above, the strip across the middle, your hand along the bottom.
// Reads the state, never writes it.

import { W, H, code } from './pixel.mjs';
import { RULES, MEASURES, inDistance, remaining, CARDS } from './sim.mjs';
import { cosmetic } from './rng.mjs';

const HALL = 0, PISTE = 1, FAR = 2, BOX = 3;
const P_YOU = 4, P_FOE = 5, P_RED = 6, P_GREEN = 7;

const PISTE_Y = 150;          // where the strip sits
const BOX_Y = 28;

export const fx = { shake: 0, flash: 0 };
let shakeX = 0, shakeY = 0;

export function addShake(n) { fx.shake = Math.min(1, fx.shake + n); }

export function draw(screen, state, view, t) {
  fx.shake = Math.max(0, fx.shake - 0.035);
  const amp = fx.shake * fx.shake;
  shakeX = Math.round(amp * 3 * (cosmetic.next() * 2 - 1));
  shakeY = Math.round(amp * 3 * (cosmetic.next() * 2 - 1));

  screen.clear(code(HALL, 0));
  drawHall(screen, state, t);
  drawPiste(screen, state);
  drawBox(screen, state, view, t);
  drawFencers(screen, state, t);
  drawHand(screen, state, view, t);
  drawLight(screen, state, view, t);
}

// --- the hall ----------------------------------------------------------------------------------
function drawHall(screen, state, t) {
  // a high dark room: a band of lighter air near the ceiling, and a run of lockers along the back
  screen.rect(0, 0, W, 18, code(HALL, 1));
  screen.dither(0, 18, W, 10, code(HALL, 1), code(HALL, 0), 0);
  screen.rect(0, PISTE_Y - 44, W, 44, code(FAR, 1));
  screen.dither(0, PISTE_Y - 48, W, 5, code(HALL, 0), code(FAR, 1), 1);
  // lockers along the back wall, dithered down: at full strength they were a row of bright bars
  // competing with the piste for attention, and the piste is where the game happens
  for (let x = 4; x < W; x += 22) {
    screen.dither(x + shakeX, PISTE_Y - 44, 1, 44, code(FAR, 1), code(FAR, 2), 0);
    screen.px(x + 11 + shakeX, PISTE_Y - 26, code(FAR, 2));
  }
  screen.dither(0, PISTE_Y - 44, W, 1, code(FAR, 1), code(FAR, 2), 0);
}

// --- the strip ---------------------------------------------------------------------------------
function drawPiste(screen, state) {
  const y = PISTE_Y + shakeY;
  screen.rect(0, y, W, 22, code(PISTE, 1));
  screen.hline(0, y, W, code(PISTE, 3));
  screen.hline(0, y + 21, W, code(PISTE, 2));
  // centre line, the two en-garde lines, and the warning lines, in the right places
  screen.vline(W / 2, y + 2, 18, code(PISTE, 3));
  for (const dx of [-34, 34]) screen.vline(W / 2 + dx, y + 4, 14, code(PISTE, 3));
  for (const dx of [-86, 86]) {
    for (let i = y + 4; i < y + 18; i += 4) screen.vline(W / 2 + dx, i, 2, code(PISTE, 2));
  }
  screen.rect(0, y + 22, W, H - (y + 22), code(HALL, 0));
}

/** Where each fencer stands, in screen x, for the current measure. */
export function stances(state) {
  const gap = [94, 70, 46, 26][state.measure];
  return { you: Math.round(W / 2 - gap), foe: Math.round(W / 2 + gap) };
}

// --- the box ------------------------------------------------------------------------------------
function drawBox(screen, state, view, t) {
  const x = W / 2, y = BOX_Y + shakeY;
  screen.rect(x - 54, y, 108, 40, code(BOX, 1));
  screen.hline(x - 54, y, 108, code(BOX, 3));
  screen.hline(x - 54, y + 39, 108, code(BOX, 2));
  screen.vline(x - 54, y, 40, code(BOX, 2));
  screen.vline(x + 53, y, 40, code(BOX, 2));

  const lamp = (cx, on, pal) => {
    for (let dy = -11; dy <= 11; dy++) {
      for (let dx = -11; dx <= 11; dx++) {
        if (dx * dx + dy * dy > 121) continue;
        const edge = dx * dx + dy * dy > 90;
        screen.px(cx + dx, y + 20 + dy, code(on ? pal : BOX, on ? (edge ? 2 : 3) : (edge ? 1 : 2)));
      }
    }
  };
  lamp(x - 28, view.lampYou > 0, P_RED);
  lamp(x + 28, view.lampFoe > 0, P_GREEN);

  // the score, as pips under each lamp, because a scoring box counts in lights and not in digits
  for (let i = 0; i < RULES.target; i++) {
    const on = i < state.you.score;
    screen.rect(x - 44 + i * 7, y + 34, 5, 3, on ? code(P_RED, 3) : code(BOX, 2));
    const on2 = i < state.foe.score;
    screen.rect(x + 12 + i * 7, y + 34, 5, 3, on2 ? code(P_GREEN, 3) : code(BOX, 2));
  }
}

// --- the fencers ---------------------------------------------------------------------------------
function fencer(screen, x, y, pal, facing, pose, t) {
  const f = facing;
  // on guard: back leg bent, front arm out. Lunge: stretched. Parry: blade up and across.
  if (pose === 'lunge') {
    screen.rect(x - 2, y - 14, 5, 8, code(pal, 2));                 // body, low
    screen.rect(x - 1, y - 19, 4, 5, code(pal, 3));                 // head
    screen.rect(x + f * 3, y - 16, 10 * f, 2, code(pal, 3));        // arm
    screen.hline(x + f * 12, y - 16, 16 * f, code(pal, 3));         // blade
    screen.rect(x - 6 * f, y - 7, 8, 7, code(pal, 2));              // back leg
    screen.rect(x + 2 * f, y - 5, 12 * f, 5, code(pal, 2));         // front leg, extended
  } else if (pose === 'parry') {
    screen.rect(x - 2, y - 16, 5, 10, code(pal, 2));
    screen.rect(x - 1, y - 21, 4, 5, code(pal, 3));
    screen.rect(x + f * 3, y - 20, 7 * f, 2, code(pal, 3));
    for (let i = 0; i < 12; i++) screen.px(x + f * (9 + i), y - 22 + i, code(pal, 3));
    screen.rect(x - 5, y - 7, 10, 7, code(pal, 2));
  } else {
    const bob = Math.floor(t * 2) % 2;
    screen.rect(x - 2, y - 17 + bob, 5, 11, code(pal, 2));
    screen.rect(x - 1, y - 22 + bob, 4, 5, code(pal, 3));
    screen.rect(x + f * 3, y - 17 + bob, 8 * f, 2, code(pal, 3));
    screen.hline(x + f * 10, y - 17 + bob, 14 * f, code(pal, 3));
    screen.rect(x - 5, y - 7, 10, 7, code(pal, 2));
  }
}

function drawFencers(screen, state, t) {
  const s = stances(state);
  const y = PISTE_Y + 20 + shakeY;
  const poseOf = (card, side) => {
    if (state.phase === 'choose' || !card) {
      // the tell: before it attacks, the opponent shifts its weight
      return side === 'foe' && state.tell === 'weight' ? 'coil' : 'guard';
    }
    if (state.phase === 'reveal') return 'guard';
    return card === 'attack' ? 'lunge' : card === 'parry' ? 'parry' : 'guard';
  };
  const you = poseOf(state.you.card, 'you');
  const foe = poseOf(state.foe.card, 'foe');
  fencer(screen, s.you + shakeX, y, P_YOU, 1, you === 'coil' ? 'guard' : you, t);
  fencer(screen, s.foe + shakeX, y, P_FOE, -1, foe === 'coil' ? 'guard' : foe, t);
  if (foe === 'coil') {
    // weight back: one pixel of lean, which is all a tell needs to be
    screen.vline(s.foe + 6 + shakeX, y - 6, 6, code(P_FOE, 1));
  }
}

// --- your hand -----------------------------------------------------------------------------------
const GLYPH = {
  // 12x12 icons, drawn rather than lettered: a blade, a bell guard, a boot
  attack: (screen, x, y, pal) => {
    screen.hline(x + 1, y + 6, 10, code(pal, 3));
    screen.px(x + 10, y + 5, code(pal, 3));
    screen.px(x + 10, y + 7, code(pal, 3));
    screen.rect(x, y + 4, 2, 5, code(pal, 2));
  },
  parry: (screen, x, y, pal) => {
    for (let i = 0; i < 9; i++) screen.px(x + 2 + i, y + 10 - i, code(pal, 3));
    screen.rect(x + 1, y + 2, 7, 2, code(pal, 2));
    screen.rect(x + 1, y + 2, 2, 6, code(pal, 2));
  },
  step: (screen, x, y, pal) => {
    screen.rect(x + 1, y + 7, 6, 3, code(pal, 2));
    screen.rect(x + 5, y + 4, 2, 4, code(pal, 3));
    screen.hline(x + 7, y + 5, 4, code(pal, 3));
    screen.px(x + 9, y + 4, code(pal, 3));
    screen.px(x + 9, y + 6, code(pal, 3));
  },
};

function drawHand(screen, state, view, t) {
  const n = state.you.hand.length;
  const cw = 56, gap = 6;
  const total = n * cw + (n - 1) * gap;
  const x0 = Math.round((W - total) / 2);
  const y = H - 54;
  const reach = inDistance(state.measure);

  for (let i = 0; i < n; i++) {
    const x = x0 + i * (cw + gap);
    const card = state.you.hand[i];
    const picked = view.selected === i && state.phase === 'choose';
    const useful = card !== 'attack' || reach;
    const lift = picked ? 3 : 0;

    // The chosen card is drawn as a dark card with a bright edge, not a white one. Filling it with
    // entry 3 and then writing the label in entry 3 put white text on a white card.
    screen.rect(x, y - lift, cw, 40, code(BOX, 1));
    const edge = picked ? code(P_YOU, 3) : code(BOX, 2);
    screen.hline(x, y - lift, cw, edge);
    screen.hline(x, y - lift + 39, cw, edge);
    screen.vline(x, y - lift, 40, edge);
    screen.vline(x + cw - 1, y - lift, 40, edge);
    if (picked) {
      screen.hline(x + 1, y - lift + 1, cw - 2, edge);
      screen.hline(x + 1, y - lift + 38, cw - 2, edge);
    }

    const pal = useful ? P_YOU : P_FOE;
    GLYPH[card](screen, x + Math.round(cw / 2) - 6, y - lift + 5, pal);
    screen.centreIn(x, cw, y - lift + 20, card, picked ? code(P_YOU, 3) : code(BOX, useful ? 3 : 2));
    screen.centreIn(x, cw, y - lift + 30, String(i + 1), code(BOX, 2));
  }

  // what is left in the deck, as a row of marks. Public information, and it should look it.
  const left = remaining(state.you);
  let lx = 6;
  for (const c of CARDS) {
    for (let i = 0; i < left[c]; i++) {
      screen.rect(lx, H - 9, 2, 5, code(BOX, c === 'attack' ? 3 : c === 'parry' ? 2 : 1));
      lx += 4;
    }
    lx += 5;
  }
}

// --- light ---------------------------------------------------------------------------------------
function drawLight(screen, state, view, t) {
  const x = W / 2, y = BOX_Y + shakeY;
  if (view.lampYou > 0) screen.lamp(x - 28, y + 20, 34);
  if (view.lampFoe > 0) screen.lamp(x + 28, y + 20, 34);
}
