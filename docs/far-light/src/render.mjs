// Draws the tower. Reads the state, never writes it.

import { W, H, code } from './pixel.mjs';
import { PLATFORMS, SH, SW, WALL, LAMP, SCREEN_COUNT, worldY } from './level.mjs';
import { RULES, chargeOf } from './sim.mjs';
import { cosmetic } from './rng.mjs';
import * as particles from './particles.mjs';

const OUT = 0, WALLP = 1, LEDGE = 2, DETAIL = 3;
const P_YOU = 4, P_LIGHT = 5, P_IRON = 6, P_ACCENT = 7;

export const camera = { y: 0, trauma: 0 };
let camY = 0, shakeX = 0, shakeY = 0;

/**
 * The camera snaps a whole screen at a time rather than scrolling. That is a deliberate copy of
 * what Jump King does: a smooth camera makes a two-screen fall feel like a long slide, while a
 * snap makes it feel like two screens, which is the entire punishment the game has.
 */
export function updateCamera(state) {
  camera.y = (SCREEN_COUNT - 1 - state.screen) * SH;
  camera.trauma = Math.max(0, camera.trauma - 0.03);
}
export const addTrauma = (n) => { camera.trauma = Math.min(1, camera.trauma + n); };

const sy = (worldYv) => Math.round(worldYv - camY) + shakeY;
const sx = (x) => Math.round(x) + shakeX;

export function draw(screen, state, t) {
  camY = camera.y;
  const amp = camera.trauma * camera.trauma;
  shakeX = Math.round(amp * 3 * (cosmetic.next() * 2 - 1));
  shakeY = Math.round(amp * 3 * (cosmetic.next() * 2 - 1));

  screen.clear(code(OUT, 0));
  drawShaft(screen, state, t);
  drawPlatforms(screen, state);
  if (state.screen >= 10) drawLamp(screen, state, t);
  drawClimber(screen, state, t);
  particles.draw(screen, sx, shakeY);
  drawLight(screen, state);
}

// --- the shaft ---------------------------------------------------------------------------------
function drawShaft(screen, state, t) {
  // The two side walls. Entry 1 is the darkest the band has, so the shaft is near-black at the
  // base and genuinely stone by the lamp room — the palette does the work, not the drawing.
  for (const side of [0, 1]) {
    const x0 = side ? SW - WALL : 0;
    screen.rect(x0, 0, WALL, H, code(WALLP, 1));
    screen.vline(side ? SW - WALL : WALL - 1, 0, H, code(WALLP, 2));
    for (let y = -(((camY % 16) + 16) % 16); y < H; y += 16) {
      screen.dither(x0, y, WALL, 1, code(WALLP, 1), code(WALLP, 2), 0);
    }
  }

  // The back wall: courses of stone, offset every other row.
  //
  // Dithered rather than solid, and sparse rather than every eight pixels. The darkest colour this
  // palette has below the mortar is a saturated indigo, so a solid line every course turned the
  // whole screen into a bright blue brick grid. Checkerboarding it halves the weight the way the
  // hardware would have, and the result reads as stonework you can just make out instead of a
  // wallpaper sample.
  for (let y = -(((camY % 16) + 16) % 16); y < H; y += 16) {
    const row = Math.floor((camY + y) / 16);
    screen.dither(WALL, y, SW - WALL * 2, 1, code(OUT, 0), code(WALLP, 2), 0);
    for (let x = WALL + ((row % 2) ? 0 : 24); x < SW - WALL; x += 48) {
      screen.dither(x, y, 1, 16, code(OUT, 0), code(WALLP, 2), 1);
    }
  }

  // windows: one per screen, alternating sides, showing whatever is outside at this height
  for (let s = 0; s < SCREEN_COUNT; s++) {
    const wy = worldY(s, 40 + (s % 3) * 22);
    const y = sy(wy);
    if (y < -60 || y > H + 20) continue;
    const left = s % 2 === 0;
    const x = left ? 34 : SW - 34 - 40;
    screen.rect(x, y, 40, 46, code(OUT, 1));
    // the sea, moving slowly, and a horizon that is only visible once you are above the weather
    for (let i = 0; i < 40; i++) {
      const wyy = y + 30 + Math.round(2 * Math.sin((i + t * 8) * 0.4));
      screen.px(x + i, wyy, code(OUT, 2));
    }
    screen.rect(x, y + 36, 40, 10, code(OUT, 1));
    screen.rect(x - 2, y - 2, 44, 2, code(DETAIL, 2));
    screen.rect(x - 2, y + 46, 44, 2, code(DETAIL, 2));
    screen.vline(x + 20, y, 46, code(DETAIL, 2));
    screen.rect(x - 2, y - 2, 2, 50, code(DETAIL, 2));
    screen.rect(x + 40, y - 2, 2, 50, code(DETAIL, 2));
  }
}

function drawPlatforms(screen, state) {
  for (const b of PLATFORMS) {
    const y = sy(b.y);
    if (y < -20 || y > H + 20) continue;
    screen.rect(sx(b.x), y, b.w, b.h, code(LEDGE, 2));
    screen.hline(sx(b.x), y, b.w, code(LEDGE, 3));
    screen.hline(sx(b.x), y + b.h - 1, b.w, code(LEDGE, 1));
    // iron brackets underneath, every 16px, so a ledge reads as bolted to the wall
    for (let i = 4; i < b.w - 2; i += 16) {
      screen.vline(sx(b.x + i), y + b.h, 3, code(P_IRON, 2));
    }
  }
}

function drawLamp(screen, state, t) {
  const x = sx(LAMP.x), y = sy(LAMP.y);
  screen.rect(x - 22, y + 18, 44, 8, code(P_IRON, 2));
  screen.rect(x - 16, y - 10, 32, 30, code(P_LIGHT, 1));
  screen.rect(x - 12, y - 6, 24, 22, code(P_LIGHT, 2));
  screen.rect(x - 7, y - 1, 14, 12, code(P_LIGHT, 3));
  // the beam, out through the window, flickering on the 8px grid
  const phase = Math.floor(t * 10) % 2;
  screen.dither(x + 20, y - 4, SW - (x + 20), 16, code(P_LIGHT, 3), code(P_LIGHT, 2), phase);
}

function drawClimber(screen, state, t) {
  const p = state.p;
  const c = chargeOf(state);
  const x = sx(p.x), y = sy(p.y);

  // the crouch IS the charge meter. There is no bar anywhere on screen.
  const squash = p.charging ? Math.round(c * 4) : 0;
  const h = RULES.body.h - squash;
  const top = y + squash;

  screen.rect(x + 1, top + 4, 6, h - 4, code(P_YOU, 2));         // body
  screen.rect(x + 2, top, 4, 4, code(P_YOU, 3));                 // head
  screen.px(x + (p.face > 0 ? 6 : 1), top + 1, code(P_YOU, 1));  // the way they are looking

  // legs: together when winding up, apart in flight
  if (p.onGround) {
    screen.vline(x + 2, top + h - 2, 2, code(P_YOU, 1));
    screen.vline(x + 5, top + h - 2, 2, code(P_YOU, 1));
  } else {
    screen.vline(x + 1, top + h - 3, 3, code(P_YOU, 1));
    screen.vline(x + 6, top + h - 2, 2, code(P_YOU, 1));
  }

  // the lamp they carry: the only light in the lower tower, and it leans the way they will go
  const lx = x + (p.lean || p.face) * 5 + 3;
  screen.rect(lx, top - 4, 3, 3, code(P_LIGHT, 3));

  // winding up throws a few sparks off the feet, which is the one tell that the charge is full
  if (p.charging && c > 0.92 && (state.tick % 4 === 0)) {
    screen.px(x + cosmetic.int(-2, 9), y + RULES.body.h - cosmetic.int(0, 3), code(P_LIGHT, 3));
  }
}

function drawLight(screen, state) {
  const p = state.p;
  // the climber's own lamp: small, so the shaft stays dark and the climb stays a commitment
  screen.lamp(sx(p.x + 4), sy(p.y + 2), 34);
  if (state.screen >= 10) screen.lamp(sx(LAMP.x), sy(LAMP.y + 6), 92);
}
