// One hall, one strip, one box. A smaller palette problem than the other two, because the light
// never changes — but the same hard budget: one backdrop, 4 background sub-palettes of 3, 4 sprite
// sub-palettes of 3, 25 colours on screen.
//
// Two of the four sprite palettes are spent on the lamps, which is extravagant and correct: the
// red and the green have to be on screen at the same time and be unmistakably themselves, because
// the whole point of épée is that both can light at once.

export const MASTER = [
  '#656565', '#002d69', '#131f7f', '#3c137c', '#600b62', '#730a37', '#710f07', '#5a1a00',
  '#342800', '#0b3400', '#003c00', '#003d10', '#003448', '#000000', '#000000', '#000000',
  '#aeaeae', '#0f63b3', '#4051d0', '#7841cc', '#a736a9', '#c03470', '#bd3c30', '#9f4a00',
  '#6d5c00', '#366d00', '#077704', '#00793d', '#00727d', '#000000', '#000000', '#000000',
  '#fefeff', '#5db3ff', '#8fa1ff', '#c890ff', '#f785fa', '#ff83c0', '#ff8b7f', '#ef9a49',
  '#bdac25', '#89bc2a', '#5ec648', '#45c882', '#48c2c9', '#4e4e4e', '#000000', '#000000',
  '#fefeff', '#bcdfff', '#d1d8ff', '#e8cfff', '#fbc9ff', '#ffc9e9', '#ffd0c6', '#f8d7a8',
  '#e6e096', '#d1e695', '#bfeaa4', '#b3ecbf', '#b2e9e2', '#b8b8b8', '#000000', '#000000',
];

// $0F is black; $00 is a mid grey. Keeping those straight has caught me out before.
const C = {
  black: 0x0f, slate: 0x00, grey: 0x10, pale: 0x20, white: 0x30,
  navy: 0x01, blue: 0x11, sky: 0x21,
  indigo: 0x02, steel: 0x12, lilac: 0x22,
  wine: 0x05, rose: 0x15, pink: 0x25,
  rust: 0x06, red: 0x16, salmon: 0x26,
  umber: 0x07, amber: 0x17, gold: 0x27, cream: 0x37,
  olive: 0x08, brass: 0x18, sand: 0x38,
  forest: 0x0a, grass: 0x1a, leaf: 0x2a,
  teal: 0x0b, jade: 0x1b, spring: 0x2b,
  deep: 0x0c, cyan: 0x1c,
};

const set = (name, backdrop, bg, spr) => ({ name, backdrop, bg, spr });

// bg0 the hall · bg1 the piste · bg2 far detail · bg3 the box and the cards
// spr0 and spr1 the cards · spr2 YOU, red · spr3 YOUR OPPONENT, green
//
// You and your lamp are the same red and they and their lamp are the same green, so the box reads
// as a legend for the piste. The fencers used to be ochre and blue against red and green lamps,
// which meant the one thing the game asks you to do — look up and see who landed — needed a
// translation step that nothing on screen provided.
export const HALL = set('hall', C.black,
  [
    [C.black,  C.navy,   C.indigo],
    [C.slate,  C.grey,   C.pale],
    // NOTE: entry 1 here is black, the same black as the backdrop — which is correct for a dark
    // hall, but it means anything filled with `code(FAR, 1)` is invisible. Most of the upper half
    // of this screen used to be drawn that way and simply was not there. The far wall is dithered
    // out of entry 2 instead; see `drawHall`.
    [C.black,  C.indigo, C.slate],
    [C.slate,  C.grey,   C.pale],
  ],
  [
    [C.umber,  C.brass,  C.cream],
    [C.indigo, C.steel,  C.blue],
    [C.wine,   C.red,    C.salmon],
    [C.teal,   C.jade,   C.spring],
  ]);

/** Inside a lamp's throw. Everything a step brighter; the lamps themselves go to their brightest. */
export const LIT = set('lit', C.indigo,
  [
    [C.navy,   C.indigo, C.steel],
    [C.grey,   C.pale,   C.white],
    [C.indigo, C.slate,  C.grey],
    [C.grey,   C.pale,   C.white],
  ],
  [
    [C.brass,  C.cream,  C.white],
    [C.steel,  C.blue,   C.sky],
    [C.red,    C.salmon, C.pink],
    [C.jade,   C.spring, C.leaf],
  ]);

export const SETS = { HALL, LIT };

export function colour(s, which, pal, entry) {
  if (entry === 0) return which === 'bg' ? MASTER[s.backdrop] : null;
  return MASTER[s[which][pal][entry - 1]];
}

export function onScreen(s) {
  const out = new Set([MASTER[s.backdrop]]);
  for (const p of s.bg) for (const e of p) out.add(MASTER[e]);
  for (const p of s.spr) for (const e of p) out.add(MASTER[e]);
  return out;
}

export const MAX_ON_SCREEN = 25;

export function validate(s, name = s.name) {
  const bad = [];
  if (s.bg.length !== 4) bad.push(`${name}: ${s.bg.length} bg palettes`);
  if (s.spr.length !== 4) bad.push(`${name}: ${s.spr.length} spr palettes`);
  for (const p of [...s.bg, ...s.spr]) {
    if (p.length !== 3) bad.push(`${name}: a palette has ${p.length} entries`);
    for (const e of p) if (!Number.isInteger(e) || e < 0 || e > 0x3f) bad.push(`${name}: ${e} invalid`);
  }
  const n = onScreen(s).size;
  if (n > MAX_ON_SCREEN) bad.push(`${name}: ${n} colours, hardware allows ${MAX_ON_SCREEN}`);
  return bad;
}
