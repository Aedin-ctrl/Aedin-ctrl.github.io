// Physics for one verb.
//
// Same discipline as Filament: no DOM, no canvas, no audio, no Date.now, no Math.random. Integer
// ticks, a pure step, events pushed out for the caller to react to. A precision platformer is
// exactly the kind of game where a frame-rate-dependent jump height would quietly ruin everything
// and never once throw an error.

import { PLATFORMS, WORLD_H, SW, SH, WALL, START, LAMP, TOP, screenOf } from './level.mjs';

// The set of ledges the physics runs against.
//
// It is the committed tower in the game, and tools/maketower.mjs swaps in candidate towers while
// it is laying one out. That matters more than it sounds: the tool used to carry its OWN copy of
// the jump arithmetic, the two drifted apart, and it certified a tower as climbable that the game
// could not climb past the second screen. One implementation, used by both.
let PLATS = PLATFORMS;
export function usePlatforms(list) { PLATS = list ?? PLATFORMS; }
export const platforms = () => PLATS;

export const TPS = 60;
export const DT = 1 / TPS;
const sec = (s) => Math.round(s * TPS);

export const RULES = {
  body: { w: 8, h: 12 },

  gravity: 520,
  maxFall: 330,

  walk: 44,                       // only on the ground, and only while not winding up
  charge: sec(0.55),              // full power

  // A jump is a fixed cast: no air control at all. Everything about where you land is decided
  // before you leave the floor, which is the whole point.
  jump: { minUp: 120, maxUp: 268, minSide: 28, maxSide: 118 },

  // Hitting a wall in flight reverses you at 70%. This is the most important number in the game:
  // it is how you reach places a direct jump cannot, and how a good jump becomes a disaster.
  bounce: 0.7,
  bounceFloorStop: 40,            // below this, a landing just stops rather than skittering

};

export function newGame() {
  return {
    tick: 0,
    p: { x: START.x, y: START.y, vx: 0, vy: 0, onGround: true, face: 1,
         charging: false, charge: 0, lean: 0 },
    best: START.y,                // the highest you have ever been, in world y (smaller is higher)
    screen: 0,
    falls: 0, jumps: 0,
    over: null, overT: 0,
    events: [],
  };
}

const overlaps = (ax, ay, aw, ah, b) =>
  ax < b.x + b.w && ax + aw > b.x && ay < b.y + b.h && ay + ah > b.y;

export function step(state, input) {
  state.tick++;
  if (state.over) { state.overT++; return state; }

  const p = state.p;
  const { w, h } = RULES.body;

  // --- winding up ---------------------------------------------------------------------------
  const wantLeft = !!input.left, wantRight = !!input.right;
  const dir = (wantRight ? 1 : 0) - (wantLeft ? 1 : 0);

  // No coyote time, deliberately.
  //
  // It was in RULES, set, decremented, and never once read — so the "breath of forgiveness leaving
  // a ledge" the design promised did not exist. Wiring it up made things worse: the wind-up takes
  // 0.55s and coyote is 0.08s, so all it bought was the ability to START a charge while already
  // falling, which looks wrong and is a different mechanic. A charge jump cannot have coyote time
  // in the usual sense, so it does not have it, and the design says so now.
  if (input.hold && p.onGround) {
    if (!p.charging) { p.charging = true; p.charge = 0; state.events.push({ type: 'wind' }); }
    p.charge = Math.min(RULES.charge, p.charge + 1);
    p.vx = 0;                                  // you cannot walk and wind up at once
    // The lean follows the keys EVERY tick, including back to nothing.
    //
    // It used to latch on the last non-zero direction, so one accidental tap of left at the start
    // of a wind-up committed you to a full-power jump left with no way to abort. In a game where
    // every metre is an aimed jump, not being able to straighten up is a control defect — and both
    // the comment below and the design document claimed you could.
    p.lean = dir;
    if (dir !== 0) p.face = dir;
  } else if (p.charging) {
    // released. The lean at THIS instant is the direction, not the lean when you started.
    const t = p.charge / RULES.charge;
    const j = RULES.jump;
    p.vy = -(j.minUp + (j.maxUp - j.minUp) * t);
    p.vx = p.lean * (j.minSide + (j.maxSide - j.minSide) * t);
    p.charging = false;
    p.charge = 0;
    p.onGround = false;
    state.jumps++;
    state.events.push({ type: 'jump', power: t, dir: p.lean });
    p.lean = 0;
  } else if (p.onGround) {
    p.vx = dir * RULES.walk;
    if (dir !== 0) p.face = dir;
  }

  // --- gravity ------------------------------------------------------------------------------
  if (!p.onGround) {
    p.vy = Math.min(RULES.maxFall, p.vy + RULES.gravity * DT);
  }

  const wasOnGround = p.onGround;

  // Horizontal FIRST, then vertical.
  //
  // The other order clips corners: the vertical sweep tests against last tick's x, so a body
  // arcing onto the left edge of a ledge is still left of it when the landing test runs, misses,
  // and is then pushed into the ledge's side by the horizontal step — a bounce instead of a
  // landing. The solver found whole ledges unreachable for that reason alone, and it would have
  // felt like the game cheating.
  // --- horizontal movement, then resolve -------------------------------------------------------
  p.x += p.vx * DT;
  let bounced = false;

  if (p.x < WALL) { p.x = WALL; bounced = true; }
  if (p.x + w > SW - WALL) { p.x = SW - WALL - w; bounced = true; }

  for (const b of PLATS) {
    if (!overlaps(p.x, p.y, w, h, b)) continue;
    if (p.vx > 0) { p.x = b.x - w; bounced = true; }
    else if (p.vx < 0) { p.x = b.x + b.w; bounced = true; }
  }

  if (bounced) {
    if (!p.onGround && Math.abs(p.vx) > 10) {
      p.vx = -p.vx * RULES.bounce;
      p.face = Math.sign(p.vx) || p.face;
      state.events.push({ type: 'bounce', x: p.x, y: p.y, speed: Math.abs(p.vx) });
    } else {
      p.vx = 0;
    }
  }

  // --- vertical movement, then resolve ---------------------------------------------------------
  p.y += p.vy * DT;
  let landed = false;
  for (const b of PLATS) {
    if (!overlaps(p.x, p.y, w, h, b)) continue;
    if (p.vy > 0) {                             // falling onto the top of a ledge
      p.y = b.y - h;
      landed = true;
      p.vy = 0;
    } else if (p.vy < 0) {                      // head into the underside
      p.y = b.y + b.h;
      p.vy = 0;
      state.events.push({ type: 'bonk', x: p.x, y: p.y });
    }
  }

  // the floor of the world: you cannot fall out of the tower
  if (p.y + h > WORLD_H - 4) { p.y = WORLD_H - 4 - h; landed = true; p.vy = 0; }

  // Standing still has to be detected by PROBING a pixel below, not by overlap.
  //
  // At rest the body sits exactly on top of a ledge and therefore does not overlap it at all, so
  // an overlap test says "airborne" on every tick you are not actively falling into something.
  // That made the player leave the ground the instant they stopped moving, which cancelled the
  // wind-up one tick after it started — every jump came out as a stumble and nothing in the tower
  // was reachable.
  const supported = landed || (p.vy >= 0 && (
    p.y + h + 1 >= WORLD_H - 4 || PLATS.some((b) => overlaps(p.x, p.y + 1, w, h, b))));

  if (supported) {
    if (!wasOnGround) {
      const drop = Math.abs(p.vx) > RULES.bounceFloorStop ? 'skid' : 'land';
      state.events.push({ type: drop, x: p.x, y: p.y, speed: Math.abs(p.vx) });
      // a landing kills horizontal speed; you do not slide off the ledge you just caught
      p.vx = 0;
    }
    p.onGround = true;
  } else {
    p.onGround = false;
  }

  // --- where are we ------------------------------------------------------------------------------
  const was = state.screen;
  state.screen = Math.max(0, Math.min(11, screenOf(p.y + h / 2)));
  if (state.screen > was) state.events.push({ type: 'up', screen: state.screen });
  if (state.screen < was) {
    state.falls++;
    state.events.push({ type: 'down', screen: state.screen, lost: was - state.screen });
  }
  if (p.y < state.best) state.best = p.y;

  // --- the lamp -----------------------------------------------------------------------------------
  // You win by STANDING on the last ledge of the climb, which is the ledge the lamp is bolted to.
  if (!state.over && p.onGround && Math.abs(p.y + h - TOP.y) < 3 &&
      p.x + w > TOP.x && p.x < TOP.x + TOP.w) {
    state.over = 'win';
    state.events.push({ type: 'win' });
  }

  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
    // Heal it, but leave a mark. Silently teleporting to the start made the invariant that checks
    // for this structurally unable to fire, and in play it would read as the game randomly
    // dropping you to the bottom of the tower for no reason.
    state.healed = (state.healed || 0) + 1;
    p.x = START.x; p.y = START.y; p.vx = 0; p.vy = 0;
  }
  return state;
}

/** 0..1, for the wind-up meter and the crouch. */
export const chargeOf = (state) => state.p.charge / RULES.charge;

/** How high you have climbed, as a fraction. Used for the palette, which makes height a colour. */
export const heightOf = (state) =>
  Math.max(0, Math.min(1, 1 - (state.p.y + RULES.body.h) / WORLD_H));
