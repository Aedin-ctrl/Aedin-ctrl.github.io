// Cosmetic only, and deliberately kept outside the simulation.
//
// These run on the `cosmetic` RNG stream and live in their own module, so turning the juice up or
// down can never change where an enemy spawns or what a seed does. That separation is the reason
// the stress harness can trust a replay.
//
// Budgets are small on purpose. At 256x240 a thirty-particle burst covers a meaningful fraction of
// the screen and reads as noise rather than as impact.

import { code } from './pixel.mjs';
import { cosmetic } from './rng.mjs';

const MAX = 44;
const list = [];

const P_CREW = 4, P_LIVE = 5, P_DEAD = 6, P_DARK = 7;

/** Palette and entry are fixed per kind, so a particle can never be a colour nothing else is. */
const KIND = {
  spark:  { pal: P_LIVE, entries: [3, 2, 1], g: 290, life: 46, bounce: 0.42 },
  debris: { pal: P_DEAD, entries: [3, 2, 1], g: 360, life: 34, bounce: 0.3 },
  dust:   { pal: P_DEAD, entries: [2, 1, 1], g: -14, life: 20, bounce: 0 },
  mote:   { pal: P_DARK, entries: [3, 2, 1], g: 40,  life: 24, bounce: 0 },
};

export function burst(x, y, n, kind, spread = 1) {
  const k = KIND[kind];
  if (!k) return;
  for (let i = 0; i < n && list.length < MAX; i++) {
    list.push({
      x, y,
      vx: cosmetic.range(-34, 34) * spread,
      vy: cosmetic.range(-96, -34) * spread,
      t: 0, life: k.life + cosmetic.int(-6, 6), kind,
    });
  }
}

/** One puff behind the lineman, no more than once every eight pixels travelled. */
let lastDustX = 0;
export function ride(x, y, speed) {
  if (Math.abs(speed) < 40) return;
  if (Math.abs(x - lastDustX) < 8) return;
  lastDustX = x;
  if (list.length >= MAX) return;
  list.push({ x, y, vx: cosmetic.range(-6, 6), vy: cosmetic.range(-16, -4),
              t: 0, life: 20, kind: 'dust' });
}

export function update(groundFor) {
  const dt = 1 / 60;
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    const k = KIND[p.kind];
    p.vy += k.g * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const floor = groundFor(p.x) - 1;
    if (k.bounce && p.y > floor && p.vy > 0) {
      p.y = floor;
      p.vy = -p.vy * k.bounce;
      p.vx *= 0.6;
    }
    if (++p.t >= p.life) list.splice(i, 1);
  }
}

/**
 * Particles die through a three-entry palette ramp rather than by fading, because the hardware
 * could not blend and a fade is the loudest tell that something is not really 8-bit.
 */
export function draw(screen, toScreenX, shakeY) {
  for (const p of list) {
    const k = KIND[p.kind];
    const age = p.t / p.life;
    const entry = k.entries[Math.min(2, Math.floor(age * 3))];
    screen.px(toScreenX(p.x), Math.round(p.y) + shakeY, code(k.pal, entry));
  }
}

export function clear() { list.length = 0; }
export const count = () => list.length;
