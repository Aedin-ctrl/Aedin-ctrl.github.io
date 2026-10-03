// Height is a colour.
//
// Four palette sets stacked up the tower: the base is nearly black, and each one is a little
// lighter and a little warmer until the lamp room, which is dawn. Because the framebuffer is
// indexed, moving between them costs one lookup-table swap — so the tower visibly gets lighter as
// you climb without a single extra draw call, and a long fall visibly takes the light away again.
//
// Same hardware budget as always: one backdrop, 4 background sub-palettes of 3, 4 sprite
// sub-palettes of 3, 25 colours on screen.

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

// $0F is black. $00 is a mid grey. Keeping these straight matters more than it sounds like it does.
const C = {
  black: 0x0f, slate: 0x00, grey: 0x10, pale: 0x20, white: 0x30,
  navy: 0x01, blue: 0x11, sky: 0x21, ice: 0x31,
  indigo: 0x02, steel: 0x12, lilac: 0x22, mist: 0x32,
  plum: 0x03, violet: 0x13, orchid: 0x23,
  wine: 0x05, rose: 0x15, pink: 0x25, shell: 0x35,
  rust: 0x06, red: 0x16, salmon: 0x26, peach: 0x36,
  umber: 0x07, amber: 0x17, gold: 0x27, cream: 0x37,
  olive: 0x08, brass: 0x18, straw: 0x28, sand: 0x38,
  deep: 0x0c, cyan: 0x1c, aqua: 0x2c, frost: 0x3c,
};

// slot meanings, fixed across every band so a swap never changes what a thing IS:
//   bg0  what is outside the windows      spr0  the climber
//   bg1  the shaft wall                   spr1  light: the lamp, the charge, the beam
//   bg2  ledges you can stand on          spr2  iron: rails, brackets, rungs
//   bg3  detail: mortar, rivets, rail     spr3  accent

const band = (name, backdrop, out, wall, ledge, detail, climber, light, iron, accent) =>
  ({ name, backdrop, bg: [out, wall, ledge, detail], spr: [climber, light, iron, accent] });

/** The base of the shaft. Almost nothing but the sound of water. */
export const BASE = band('base', C.black,
  [C.black, C.navy, C.indigo],
  [C.black, C.indigo, C.slate],
  [C.black, C.slate, C.grey],
  [C.black, C.indigo, C.slate],
  [C.umber, C.brass, C.sand],
  [C.rust, C.amber, C.cream],
  [C.black, C.indigo, C.slate],
  [C.wine, C.rose, C.pink]);

/** Halfway. The sea is visible through the windows now. */
export const MID = band('mid', C.navy,
  [C.navy, C.deep, C.steel],
  [C.indigo, C.slate, C.grey],
  [C.slate, C.grey, C.pale],
  [C.indigo, C.slate, C.grey],
  [C.umber, C.brass, C.cream],
  [C.rust, C.amber, C.cream],
  [C.indigo, C.slate, C.grey],
  [C.wine, C.rose, C.pink]);

/**
 * Above the weather.
 *
 * The backdrop is what the empty middle of the shaft resolves to, so it carries most of the screen.
 * An earlier version used a saturated blue up here and the whole tower came out electric; these
 * bands get LIGHTER as you climb without getting louder, which is the difference between dawn and
 * a colour test card.
 */
export const HIGH = band('high', C.indigo,
  [C.indigo, C.steel, C.blue],
  [C.indigo, C.slate, C.grey],
  [C.slate, C.grey, C.pale],
  [C.indigo, C.slate, C.grey],
  [C.umber, C.gold, C.cream],
  [C.amber, C.gold, C.cream],
  [C.indigo, C.slate, C.grey],
  [C.rose, C.pink, C.shell]);

/**
 * The lamp room, at dawn.
 *
 * This was mid-grey walls, mid-grey ledges, mid-grey detail and a night-blue window — four of the
 * eight sub-palettes resolving to the same ramp, so the payoff of a twelve-screen climb was a flat
 * grey card with a cold window in it. The interior is now a warm dark, the stone is pale against
 * it, and what you see through the glass is the sunrise you climbed up here to look at.
 */
export const DAWN = band('dawn', C.umber,
  [C.salmon, C.peach, C.cream],
  [C.slate, C.grey, C.pale],
  [C.grey, C.pale, C.white],
  [C.brass, C.sand, C.pale],
  [C.umber, C.gold, C.cream],
  [C.gold, C.cream, C.white],
  [C.slate, C.grey, C.pale],
  [C.rose, C.salmon, C.peach]);

/** Inside a lamp pool, whatever the band: warmer and a step brighter. */
export const LIT = band('lit', C.indigo,
  [C.navy, C.steel, C.blue],
  [C.umber, C.slate, C.grey],
  [C.slate, C.grey, C.pale],
  [C.umber, C.brass, C.sand],
  [C.umber, C.gold, C.cream],
  [C.amber, C.gold, C.cream],
  [C.slate, C.grey, C.pale],
  [C.rose, C.pink, C.shell]);

/**
 * A lamp pool has to keep the band's own backdrop.
 *
 * The backdrop is what empty space resolves to, and a lamp does not light empty space — it lights
 * the things in it. Sharing one LIT set across every band meant a pool over open sky punched a
 * bright blue disc into the dark, which looked like a bug because it was one. Each band therefore
 * gets its own lit variant, differing from LIT only in the backdrop it keeps.
 */
const litCache = new Map();
export function litFor(band) {
  if (!litCache.has(band)) {
    litCache.set(band, { ...LIT, name: `lit-${band.name}`, backdrop: band.backdrop });
  }
  return litCache.get(band);
}

export const BANDS = [BASE, MID, HIGH, DAWN];
export const SETS = { BASE, MID, HIGH, DAWN, LIT };

/** Which band a height fraction (0 at the base, 1 at the lamp) belongs to. */
export function bandFor(height) {
  if (height < 0.3) return BASE;
  if (height < 0.6) return MID;
  if (height < 0.86) return HIGH;
  return DAWN;
}

export function colour(set, which, pal, entry) {
  if (entry === 0) return which === 'bg' ? MASTER[set.backdrop] : null;
  return MASTER[set[which][pal][entry - 1]];
}

export function onScreen(set) {
  const out = new Set([MASTER[set.backdrop]]);
  for (const p of set.bg) for (const e of p) out.add(MASTER[e]);
  for (const p of set.spr) for (const e of p) out.add(MASTER[e]);
  return out;
}

export const MAX_ON_SCREEN = 25;

export function validate(set, name = set.name) {
  const problems = [];
  if (set.bg.length !== 4) problems.push(`${name}: ${set.bg.length} bg palettes, want 4`);
  if (set.spr.length !== 4) problems.push(`${name}: ${set.spr.length} spr palettes, want 4`);
  for (const p of [...set.bg, ...set.spr]) {
    if (p.length !== 3) problems.push(`${name}: a palette has ${p.length} entries, want 3`);
    for (const e of p) {
      if (!Number.isInteger(e) || e < 0 || e > 0x3f) problems.push(`${name}: ${e} is not a palette index`);
    }
  }
  const n = onScreen(set).size;
  if (n > MAX_ON_SCREEN) problems.push(`${name}: ${n} colours on screen, hardware allows ${MAX_ON_SCREEN}`);
  return problems;
}
