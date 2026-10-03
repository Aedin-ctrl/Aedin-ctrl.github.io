// Cosmetic only, and deliberately kept outside the simulation.
//
// Shared in spirit with Filament's: same discipline, same budgets, different palette slots. It is
// the third file the two games have in common after pixel.mjs and rng.mjs, which is most of the
// argument for having built the first one carefully.
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

const P_YOU = 4, P_LIGHT = 5, P_IRON = 6, P_ACCENT = 7;

/** Palette and entry are fixed per kind, so a particle can never be a colour nothing else is. */
const KIND = {
  spark:  { pal: P_LIGHT, entries: [3, 2, 1], g: 300, life: 34, bounce: 0.4 },
  debris: { pal: P_IRON, entries: [3, 2, 1], g: 380, life: 28, bounce: 0.3 },
  dust:   { pal: P_IRON, entries: [3, 2, 1], g: -10, life: 22, bounce: 0 },
  mote:   { pal: P_ACCENT, entries: [3, 2, 1], g: 30,  life: 26, bounce: 0 },
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

/** A scuff under the boots while winding up: the only tell that the charge is still building. */
export function scuff(x, y) {
  if (list.length >= MAX) return;
  list.push({ x: x + cosmetic.range(-3, 9), y, vx: cosmetic.range(-18, 18),
              vy: cosmetic.range(-22, -6), t: 0, life: 14, kind: 'dust' });
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
