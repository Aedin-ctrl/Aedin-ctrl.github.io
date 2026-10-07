// The tower.
//
// The shape of the climb is generated and proven by tools/maketower.mjs, which flies every step
// through the real jump arithmetic before placing it and repairs any step a later ledge breaks.
// Its output is committed as data, so the game never does any of that work and the tower is
// identical for everyone who plays it.
//
// Three earlier approaches are recorded in DESIGN.md: hand-authoring twelve screens left seams
// 184px apart when the jump reaches 69; forbidding a ledge from ever sitting above another made
// the route flee to the far wall, because a switchback climb must pass back over itself; and
// searching random seeds for one that happened to work was right in spirit but far too slow.

import { TOWER } from './tower.mjs';

export const SW = 256;
export const SH = 240;
export const WALL = 10;
export const SCREEN_COUNT = 12;
export const WORLD_H = SCREEN_COUNT * SH;

export const PLATFORMS = TOWER;

/** Where you start: standing on the floor of the tower. */
export const START = { x: 32, y: WORLD_H - 26 - 12 };

/** The last ledge of the route, and the lamp standing on it. Reaching it is the ending. */
export const TOP = TOWER.find((b) => b.lamp) ?? TOWER.reduce((m, b) => (b.y < m.y ? b : m), TOWER[0]);
export const LAMP = { x: TOP.x + TOP.w / 2, y: TOP.y - 26 };

export const screenOf = (y) => SCREEN_COUNT - 1 - Math.floor(y / SH);
export const worldY = (screen, localY) => (SCREEN_COUNT - 1 - screen) * SH + localY;
