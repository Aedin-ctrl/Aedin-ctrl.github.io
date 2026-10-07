// One picture: the box above, the strip across the middle, your hand along the bottom.
// Reads the state, never writes it.

import { W, H, code } from './pixel.mjs';
import { RULES, MEASURES, inDistance, remaining, CARDS } from './sim.mjs';
import { cosmetic } from './rng.mjs';

const HALL = 0, PISTE = 1, FAR = 2, BOX = 3;
/**
 * You are RED. They are GREEN. Everywhere.
 *
 * The lamps were red and green — because that is what a scoring box is — while the fencers were
 * ochre and blue, so the one thing the game asks you to do (look up at the box and read who landed)
 * required translating between two colour schemes that shared nothing. Left and right were doing
 * all the work, and the screen shake moves both. Now the box is a legend for the piste.
 *
 * The two spare sprite palettes keep their old names and carry the cards instead.
 */
const P_YOU = 6, P_FOE = 7, CARD_A = 4, CARD_B = 5;

const PISTE_Y = 150;          // where the strip sits
const BOX_Y = 28;

export const fx = { shake: 0 };   // `flash` lived here and nothing ever set it
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
  // A high dark room: a lighting rig under the ceiling, a band of lit air beneath it, a run of
  // lockers along the back wall, and the floor of the hall below the strip. Without all of it the
  // screen was two thirds flat black with a box floating in the middle of it.
  // the rig: dark housings with a bright tube under each, and a short dithered throw. Drawn with
  // bright housings first, they read as a row of flags rather than as lights.
  screen.rect(0, 0, W, 6, code(FAR, 1));
  for (let x = 10; x < W; x += 38) {
    // housing in stone grey, not the indigo of the far-detail palette — drawn in indigo with a
    // white checkerboard under it, a row of these reads as bunting rather than as lighting
    screen.rect(x, 1, 18, 5, code(FAR, 3));
    screen.rect(x + 1, 2, 16, 2, code(BOX, 1));
    screen.rect(x + 3, 6, 12, 1, code(BOX, 3));
    screen.dither(x + 3, 7, 12, 3, code(BOX, 1), code(HALL, 2), 0);
    screen.dither(x + 5, 10, 8, 4, code(HALL, 2), code(HALL, 0), 1);
  }
  // The air under the rig, and the far wall of the hall above the lockers.
  //
  // All of this was drawn in entry 1 of the hall palette against entry 0 — and entry 1 of the hall
  // palette IS black, the same black as the backdrop. Every atmospheric layer in the upper half of
  // the screen was therefore being dithered black onto black, which is why forty per cent of the
  // frame was an empty void with a scoring box floating in it. Entry 2 is the navy it should always
  // have been. Nothing but a human eye was ever going to catch this: no tool imports this file.
  screen.dither(0, 15, W, 8, code(HALL, 2), code(HALL, 0), 0);
  for (let y = 26; y < PISTE_Y - 50; y += 10) {
    screen.dither(0, y, W, 1, code(HALL, 0), code(HALL, 2), (y / 10) & 1);
  }
  // Two rows of empty seats along the back of the hall. This is a club night, not a final — the
  // room should feel large and mostly unwatched, which is the whole mood of the game.
  for (let r = 0; r < 2; r++) {
    const sy = PISTE_Y - 60 + r * 7;
    for (let x = 5 + r * 5; x < W - 7; x += 15) {
      screen.dither(x, sy, 9, 3, code(HALL, 2), code(HALL, 0), r & 1);
    }
  }
  // the box hangs from the rig
  screen.vline(W / 2 - 18, 6, BOX_Y - 6, code(FAR, 2));
  screen.vline(W / 2 + 18, 6, BOX_Y - 6, code(FAR, 2));
  // The wall behind the strip, dithered rather than filled. Filled with entry 1 it was black on
  // black and absent; filled with a real colour it became a flat slab brighter than the piste and
  // took the eye off the only part of the screen that matters.
  // The wall behind the strip.
  //
  // This has now been wrong in both directions. Filled with entry 1 it was black on black and the
  // top half of the screen was a void. Filled with a real colour, or dithered at the even 50% that
  // `screen.dither` gives you, 44 by 256 pixels of blue became the brightest thing on screen and
  // pulled the eye straight off the piste, which is the only place the game happens. A wall wants
  // to be dark with a texture you notice second: one pixel in four, fading out as it descends
  // towards the floor.
  for (let y = PISTE_Y - 44; y < PISTE_Y; y++) {
    const depth = (y - (PISTE_Y - 44)) / 44;          // 0 at the top, 1 at the floor
    const every = depth > 0.66 ? 8 : depth > 0.33 ? 6 : 4;
    for (let x = (y & 1) * 2; x < W; x += every) screen.px(x, y, code(HALL, 2));
  }
  screen.dither(0, PISTE_Y - 48, W, 4, code(HALL, 0), code(HALL, 2), 1);
  // lockers along the back wall, dithered down: at full strength they were a row of bright bars
  // competing with the piste for attention, and the piste is where the game happens
  for (let x = 4; x < W; x += 22) {
    screen.vline(x + shakeX, PISTE_Y - 44, 44, code(FAR, 2));
    screen.px(x + 11 + shakeX, PISTE_Y - 26, code(FAR, 3));
  }
  screen.hline(0, PISTE_Y - 44, W, code(FAR, 2));
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
  // the floor of the hall in front of the strip, so the piste sits ON something
  screen.rect(0, y + 22, W, H - (y + 22), code(HALL, 0));
  screen.dither(0, y + 22, W, 8, code(PISTE, 1), code(HALL, 0), 1);
  screen.hline(0, y + 22, W, code(PISTE, 2));
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
  lamp(x - 28, view.lampYou > 0, P_YOU);
  lamp(x + 28, view.lampFoe > 0, P_FOE);

  // the score, as pips under each lamp, because a scoring box counts in lights and not in digits
  // The opponent's new pip waits out the lockout with the opponent's lamp. Both scores used to be
  // applied on the same tick the first lamp lit, so on a double the scoreboard announced "you both
  // scored" a quarter of a second before the second lamp said it — which is the one beat the game
  // is named after, given away by its own scoreboard.
  const foeShown = state.foe.score - (view.holdFoePip > 0 ? 1 : 0);
  for (let i = 0; i < RULES.target; i++) {
    screen.rect(x - 44 + i * 7, y + 34, 5, 3,
                i < state.you.score ? code(P_YOU, 3) : code(BOX, 2));
    screen.rect(x + 12 + i * 7, y + 34, 5, 3,
                i < foeShown ? code(P_FOE, 3) : code(BOX, 2));
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

/**
 * Where the cards are. Exported, because the touch handler needs the same answer.
 *
 * It used to have its own copy of these numbers — 44 wide with an 8px gap against the 56 and 6 drawn
 * here — so on a phone the outer third of the left and right cards did nothing and a tap in the gap
 * played card one. Two copies of a layout are two layouts. This is the only one.
 */
export function cardBox(n, i) {
  const cw = 56, gap = 6;
  const x0 = Math.round((W - (n * cw + (n - 1) * gap)) / 2);
  return { x: x0 + i * (cw + gap), y: H - 54, w: cw, h: 40 };
}

/** Which card is under a point, or -1. The same geometry, asked backwards. */
export function cardAt(n, px, py) {
  for (let i = 0; i < n; i++) {
    const b = cardBox(n, i);
    // a little vertical slack, because the picked card lifts 3px and fingers are not precise
    if (px >= b.x && px < b.x + b.w && py >= b.y - 6 && py < b.y + b.h + 6) return i;
  }
  return -1;
}

function drawHand(screen, state, view, t) {
  const n = state.you.hand.length;
  const cw = 56;
  const y = H - 54;
  const reach = inDistance(state.measure);

  for (let i = 0; i < n; i++) {
    const x = cardBox(n, i).x;
    const card = state.you.hand[i];
    const picked = view.selected === i && state.phase === 'choose';
    const useful = card !== 'attack' || reach;
    const lift = picked ? 3 : 0;

    // The chosen card is drawn as a dark card with a bright edge, not a white one. Filling it with
    // entry 3 and then writing the label in entry 3 put white text on a white card.
    screen.rect(x, y - lift, cw, 40, code(BOX, 1));
    const edge = picked ? code(P_YOU, 3) : code(BOX, 2);   // your colour, which is now red
    screen.hline(x, y - lift, cw, edge);
    screen.hline(x, y - lift + 39, cw, edge);
    screen.vline(x, y - lift, 40, edge);
    screen.vline(x + cw - 1, y - lift, 40, edge);
    if (picked) {
      screen.hline(x + 1, y - lift + 1, cw - 2, edge);
      screen.hline(x + 1, y - lift + 38, cw - 2, edge);
    }

    // An attack you cannot reach with used to be drawn in the OPPONENT's palette, so "unusable"
    // and "theirs" were the same colour. Unusable is simply dim now — the card's own palette when
    // it can be played, the box grey when it cannot.
    const pal = useful ? CARD_A : BOX;
    GLYPH[card](screen, x + Math.round(cw / 2) - 6, y - lift + 5, pal);
    screen.centreIn(x, cw, y - lift + 20, card, picked ? code(P_YOU, 3) : code(BOX, useful ? 3 : 2));
    screen.centreIn(x, cw, y - lift + 30, String(i + 1), code(BOX, 2));
  }

  // what is left in the deck, as a row of marks. Public information, and it should look it.
  const left = remaining(state.you);
  let lx = 6;
  for (const c of CARDS) {
    for (let i = 0; i < left[c]; i++) {
      // One mark per card still in your deck, coloured and shaped by type rather than drawn as
      // three identical grey clusters. DESIGN.md calls this display "the game" — that your last
      // parry is public — and three shades of the same grey communicated none of it.
      const h = c === 'attack' ? 6 : c === 'parry' ? 4 : 2;
      screen.rect(lx, H - 4 - h, 2, h,
                  code(c === 'attack' ? P_YOU : c === 'parry' ? CARD_A : CARD_B, 3));
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
