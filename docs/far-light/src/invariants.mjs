// What must be true at the end of every tick.
//
// A platformer's dangerous failures are not crashes — they are the player ending up somewhere the
// game did not intend and cannot get them out of: inside a ledge, below the floor, outside the
// shaft, airborne forever, or stuck in a wind-up that can never be released. None of those throw.

import { PLATFORMS, WORLD_H, SW, WALL, SCREEN_COUNT } from './level.mjs';
import { RULES, TPS } from './sim.mjs';

export function checkInvariants(state) {
  const bad = [];
  const say = (c, m) => { if (!c) bad.push(m); };
  const p = state.p;
  const { w, h } = RULES.body;

  say(Number.isInteger(state.tick) && state.tick >= 0, `tick is ${state.tick}`);
  say(Number.isFinite(p.x) && Number.isFinite(p.y), `position is ${p.x},${p.y}`);
  say(Number.isFinite(p.vx) && Number.isFinite(p.vy), `velocity is ${p.vx},${p.vy}`);

  // inside the shaft, always
  say(p.x >= WALL - 0.5, `left the shaft on the left at x ${p.x.toFixed(1)}`);
  say(p.x + w <= SW - WALL + 0.5, `left the shaft on the right at x ${p.x.toFixed(1)}`);
  say(p.y + h <= WORLD_H - 3, `fell through the floor to y ${p.y.toFixed(1)}`);
  say(p.y > -40, `left the top of the world at y ${p.y.toFixed(1)}`);

  // never inside a ledge. The one failure a player would call "the game is broken".
  for (const b of PLATFORMS) {
    const inside = p.x + 0.5 < b.x + b.w && p.x + w - 0.5 > b.x &&
                   p.y + 0.5 < b.y + b.h && p.y + h - 0.5 > b.y;
    say(!inside, `inside a ledge at ${b.x},${b.y} (${b.w}x${b.h}) standing at ${p.x.toFixed(1)},${p.y.toFixed(1)}`);
  }

  // speeds stay within what the rules can produce
  say(Math.abs(p.vx) <= RULES.jump.maxSide + 1, `horizontal speed ${p.vx.toFixed(1)}`);
  say(p.vy <= RULES.maxFall + 1, `falling at ${p.vy.toFixed(1)}`);
  say(p.vy >= -(RULES.jump.maxUp + 1), `rising at ${p.vy.toFixed(1)}`);

  // the wind-up
  say(p.charge >= 0 && p.charge <= RULES.charge, `charge is ${p.charge}`);
  say(!(p.charging && !p.onGround), 'winding up in mid-air');

  say(state.screen >= 0 && state.screen < SCREEN_COUNT, `screen is ${state.screen}`);
  say(['win', null].includes(state.over), `over is ${state.over}`);
  return bad;
}

/**
 * A soft-lock watchdog, kept outside the per-tick checks because it is about history rather than
 * state: if nothing has changed in ten seconds of play, the player is stuck in a way no single
 * tick can reveal.
 */
export function makeWatchdog() {
  let lastX = null, lastY = null, still = 0;
  return (state, inputWasPressed) => {
    const p = state.p;
    const moved = lastX === null || Math.abs(p.x - lastX) > 0.5 || Math.abs(p.y - lastY) > 0.5;
    lastX = p.x; lastY = p.y;
    still = moved || inputWasPressed ? 0 : still + 1;
    return still > TPS * 10
      ? [`nothing has moved for ${(still / TPS) | 0}s at ${p.x | 0},${p.y | 0} — soft-locked`]
      : [];
  };
}
