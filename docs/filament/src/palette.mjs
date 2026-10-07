// The NES palette, and the rule that only 25 of its colours may be on screen at once.
//
// The hardware had 4 background sub-palettes and 4 sprite sub-palettes, 3 colours each, over one
// shared backdrop: 4*3 + 4*3 + 1 = 25. Honouring that is the difference between "8-bit" and
// "pixel art with modern colours", because the limit is what forces the flat, posterised look and
// the reuse of the same few hues across unrelated objects.
//
// Night is not a dark overlay. The hardware could not blend, so it faked light by swapping which
// colours the sub-palettes pointed at. That is what happens here: dusk rotates the background
// sub-palettes to their night entries, and a lamp rotates a region back. It costs nothing and it
// is the single biggest reason this reads as period-correct.
//
// Entry numbering follows the hardware: entry 0 of every sub-palette is special — the shared
// backdrop for background palettes, transparent for sprite palettes — and entries 1, 2 and 3 are
// the three colours a sub-palette actually gets. So each array below has exactly three members,
// and they are entries 1..3.

/** NES master palette, index -> #rrggbb. Standard consumer-set values. */
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

/** Named indices, so the sub-palettes read as colours rather than as numbers. */
// NOTE on two colours that look alike by name and are not: $0F is black, $00 is a MID GREY.
// Mixing them up floods every lamp pool with grey, which is exactly what happened the first time.
const C = {
  black: 0x0f, slate: 0x00, grey: 0x10, pale: 0x20, white: 0x30,
  navy: 0x01, blue: 0x11, sky: 0x21, ice: 0x31,
  indigo: 0x02, steel: 0x12, lilac: 0x22, mist: 0x32,
  plum: 0x03, violet: 0x13,
  wine: 0x05, rose: 0x15, pink: 0x25,
  rust: 0x06, red: 0x16, salmon: 0x26, peach: 0x36,
  umber: 0x07, amber: 0x17, gold: 0x27, cream: 0x37,
  olive: 0x08, brass: 0x18, straw: 0x28, sand: 0x38,
  moss: 0x09, green: 0x19, lime: 0x29,
  forest: 0x0a, grass: 0x1a, leaf: 0x2a,
  teal: 0x0b, jade: 0x1b,
  deep: 0x0c, cyan: 0x1c, aqua: 0x2c,
};

// Slot meanings are fixed across every set, so a rotation never changes what a thing *is*:
//   bg 0  sky and sea          spr 0  the monarch and the crew
//   bg 1  ground and rock      spr 1  live cable, lamps, fire, spark
//   bg 2  scrub and detail     spr 2  dead cable, dead metal, stone
//   bg 3  stone and structure  spr 3  the dark, and what lives in it

/** Daylight — such as it is. The sun is dead, so "day" is a cold overcast, not a blue sky. */
export const DAY = {
  name: 'day',
  backdrop: C.steel,
  bg: [
    [C.navy,   C.blue,   C.sky],      // sky and sea
    [C.olive,  C.umber,  C.brass],    // ground and rock
    [C.forest, C.moss,   C.green],    // dead scrub
    [C.slate,  C.grey,   C.pale],     // stone and structure
  ],
  spr: [
    [C.umber, C.brass, C.cream],      // the crew
    [C.rust,  C.amber, C.gold],       // live cable, lamps, fire
    [C.slate, C.grey,  C.pale],       // dead cable, dead metal
    [C.wine,  C.rose,  C.pink],       // the dark
  ],
};

/** Night. Same structure, same slot meanings — only the entries move. */
export const NIGHT = {
  name: 'night',
  backdrop: C.black,
  bg: [
    [C.black,  C.navy,   C.indigo],
    // Entries 1 AND 2 go black at night: those are the two big fills — the near ground and the
    // distant ridge — and the dark is the best thing this game has. Only entry 3 keeps any colour,
    // for edges and highlights. A lit region rotates all of it back through the LIT set, which is
    // the entire point of doing this with palettes rather than with an overlay.
    [C.black,  C.black,  C.olive],
    [C.black,  C.forest, C.olive],
    [C.black,  C.indigo, C.slate],
  ],
  spr: [
    [C.indigo, C.slate,  C.grey],
    [C.rust,   C.amber,  C.cream],   // live cable: the brightest thing in the world at night
    [C.black,  C.navy,   C.slate],   // dead cable all but vanishes
    [C.wine,   C.red,    C.salmon],
  ],
};

/** Inside a lamp's pool at night, everything rotates most of the way back toward day. */
export const LIT = {
  name: 'lit',
  // the SAME backdrop as night: the sky does not brighten because a lamp is on under it
  backdrop: C.black,
  bg: [
    [C.navy,   C.indigo, C.steel],
    [C.olive,  C.umber,  C.brass],
    [C.forest, C.moss,   C.green],
    [C.slate,  C.grey,   C.pale],
  ],
  spr: DAY.spr,
};

/** Dusk and dawn: one step between the two, so the sky changes in steps as the hardware's would. */
export const TWILIGHT = {
  name: 'twilight',
  backdrop: C.indigo,
  bg: [
    [C.navy,   C.indigo, C.violet],
    [C.olive,  C.umber,  C.brass],
    [C.black,  C.forest, C.moss],
    [C.slate,  C.grey,   C.pale],
  ],
  spr: [
    [C.umber,  C.brass, C.sand],
    [C.rust,   C.amber, C.gold],
    [C.indigo, C.slate, C.grey],
    [C.wine,   C.rose,  C.pink],
  ],
};

export const SETS = { DAY, NIGHT, LIT, TWILIGHT };

/**
 * Resolve (set, 'bg'|'spr', sub-palette 0-3, entry 0-3) to a CSS colour.
 * Entry 0 is the backdrop for a background palette and transparent for a sprite palette, so this
 * returns null in the one case where the hardware would have drawn nothing at all.
 */
export function colour(set, which, pal, entry) {
  if (entry === 0) return which === 'bg' ? MASTER[set.backdrop] : null;
  return MASTER[set[which][pal][entry - 1]];
}

/** Every colour a set can put on screen, as hex. Used by the palette test. */
export function onScreen(set) {
  const out = new Set([MASTER[set.backdrop]]);
  for (const p of set.bg) for (const e of p) out.add(MASTER[e]);
  for (const p of set.spr) for (const e of p) out.add(MASTER[e]);
  return out;
}

export const MAX_ON_SCREEN = 25;

/**
 * The hardware budget. A set that needs more than 25 distinct colours is not an NES screen, and
 * the test suite fails on it rather than letting the look drift one shade at a time.
 */
export function validate(set, name = set.name) {
  const problems = [];
  if (set.bg.length !== 4) problems.push(`${name}: ${set.bg.length} background palettes, want 4`);
  if (set.spr.length !== 4) problems.push(`${name}: ${set.spr.length} sprite palettes, want 4`);
  for (const [i, p] of set.bg.entries())
    if (p.length !== 3) problems.push(`${name}: bg palette ${i} has ${p.length} entries, want 3`);
  for (const [i, p] of set.spr.entries())
    if (p.length !== 3) problems.push(`${name}: spr palette ${i} has ${p.length} entries, want 3`);
  for (const p of [...set.bg, ...set.spr])
    for (const e of p)
      if (!Number.isInteger(e) || e < 0 || e > 0x3f)
        problems.push(`${name}: ${e} is not a master-palette index`);
  const n = onScreen(set).size;
  if (n > MAX_ON_SCREEN) problems.push(`${name}: ${n} colours on screen, hardware allows ${MAX_ON_SCREEN}`);
  return problems;
}
