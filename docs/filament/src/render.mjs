// Draws the state. Reads it, never writes it.
//
// Everything lands on the indexed framebuffer, so this file never names a colour — only a
// sub-palette and an entry. Night happens entirely in pixel.mjs by swapping which palette the
// buffer resolves through, which is why a lamp here is just a mask and costs nothing.
//
// The camera is rounded ONCE, before any layer draws. Rounding per-layer instead lets the parallax
// layers crawl against each other by a pixel, which at this scale is the most obvious tell that
// something is not really an 8-bit game.

import { W, H, code } from './pixel.mjs';
import { RULES, groundAt, isLit, towerLight, satchelCap, segmentAt, TPS } from './sim.mjs';
import { cosmetic } from './rng.mjs';
import * as S from './sprites.mjs';
import * as particles from './particles.mjs';

// sub-palette slots, named so the draws read as intent rather than as numbers
const SKY = 0, GROUND = 1, SCRUB = 2, STONE = 3;
const P_CREW = 4, P_LIVE = 5, P_DEAD = 6, P_DARK = 7;

// the screen is 240 tall; these split it into sky, a strip of sea, the shore, and the ground
const SKY_BOTTOM = 74;
const SEA_TOP = 74;
const SEA_H = 14;

export const camera = { x: 0, shake: 0, trauma: 0 };

export function updateCamera(state, dt) {
  const want = state.monarch.x + (state.monarch.facing || 1) * 40 - W / 2;
  const max = Math.max(0, RULES.world.end + 120 - W);
  const target = Math.max(0, Math.min(max, want));
  // a 24px dead zone, so small corrections do not make the whole world jitter
  if (Math.abs(target - camera.x) > 24) {
    camera.x += (target - camera.x) * 0.08;
  } else {
    camera.x += (target - camera.x) * 0.02;
  }
  camera.trauma = Math.max(0, camera.trauma - 1.8 * dt);
}

export function addTrauma(n) { camera.trauma = Math.min(1, camera.trauma + n); }

/** Screen x for a world x, with the camera already rounded. */
let camX = 0, shakeX = 0, shakeY = 0;
const sx = (worldX) => Math.round(worldX - camX) + shakeX;
export const toScreenX = (worldX) => sx(worldX);
export const shakeOffsetY = () => shakeY;

export function draw(screen, state, t) {
  camX = Math.round(camera.x);
  // trauma squared, then quantised: at a 4px maximum a trauma of 0.3 gives 0.36px, which rounds
  // to nothing. Values have to be large enough to survive the rounding or the shake is invisible.
  const amp = camera.trauma * camera.trauma;
  shakeX = Math.round(amp * 4 * (cosmetic.next() * 2 - 1) * 0.5);
  shakeY = Math.round(amp * 4 * (cosmetic.next() * 2 - 1));

  screen.clear(code(SKY, 0));
  drawSky(screen, state, t);
  drawFar(screen, state);
  drawSea(screen, state, t);
  drawGround(screen, state);
  drawRack(screen, state);
  drawShelters(screen, state);
  drawSites(screen, state);
  drawCable(screen, state, t);
  drawTowers(screen, state, t);
  drawCrew(screen, state, t);
  drawEnemies(screen, state, t);
  drawShots(screen, state);
  drawMonarch(screen, state, t);
  particles.draw(screen, sx, shakeY);
  drawLamps(screen, state);
}

// --- sky ---------------------------------------------------------------------------------------
function drawSky(screen, state, t) {
  screen.rect(0, 0, W, SKY_BOTTOM, code(SKY, 1));
  screen.dither(0, SKY_BOTTOM - 16, W, 10, code(SKY, 1), code(SKY, 2), 0);
  screen.rect(0, SKY_BOTTOM - 6, W, 6, code(SKY, 2));
  // Stars. A third of the frame was empty black above the horizon, in a game whose entire premise
  // is that the sun went out — so the sky was the one place that should have been saying something.
  // Positions come from the world x, so they hold still while everything else parallaxes.
  for (let i = 0; i < 80; i++) {
    // a proper avalanche mix; multiplying the index by one constant and slicing bits off it put
    // the stars in visible rows, which is worse than no stars
    let h = (i + 1) * 2654435761 >>> 0;
    h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0;
    h ^= h >>> 13; h = Math.imul(h, 3266489917) >>> 0;
    h ^= h >>> 16;
    const span = W + 96;
    const sxp = (((h % span) - Math.round(camX * 0.04)) % span + span) % span - 48;
    const syp = 3 + ((h >>> 11) % (SKY_BOTTOM - 14));
    screen.px(sxp, syp, code(SKY, (h >>> 7) % 4 === 0 ? 2 : 1));
  }

  // the one other thing up there: a slow drift of cloud, dithered, a few cells tall
  const drift = Math.round(t * 2) % (W + 120);
  for (let i = 0; i < 3; i++) {
    const x = ((i * 110) - drift + W + 120) % (W + 120) - 60;
    screen.dither(x, 14 + i * 10, 48 + i * 14, 4, code(SKY, 1), code(SKY, 2), i);
  }
}

// --- far hills, at a quarter speed ---------------------------------------------------------------
function drawFar(screen, state) {
  const off = Math.round(camX * 0.25);
  for (let x = 0; x < W; x++) {
    const wx = x + off;
    const h = SKY_BOTTOM - Math.round(9 * Math.sin(wx * 0.011) + 5 * Math.sin(wx * 0.027 + 1.3));
    screen.vline(x, h, SEA_TOP - h, code(SCRUB, 1));
    screen.px(x, h, code(SCRUB, 2));
    // the occasional dead pylon on the ridge: the old line, still standing, still not working
    if ((wx * 2654435761 >>> 22) % 97 === 0) {
      screen.vline(x, h - 9, 9, code(STONE, 1));
      screen.hline(x - 2, h - 9, 5, code(STONE, 1));
      screen.hline(x - 1, h - 6, 3, code(STONE, 1));
    }
  }
}

// --- a thin strip of sea, then the shore sloping away toward the camera ---------------------------
function drawSea(screen, state, t) {
  const off = Math.round(camX * 0.5);
  screen.rect(0, SEA_TOP, W, SEA_H, code(SKY, 0));
  for (let x = 0; x < W; x++) {
    const wx = x + off;
    const y = SEA_TOP + 4 + Math.round(2 * Math.sin(wx * 0.05 + t * 0.6));
    screen.px(x, y, code(SKY, 1));
    if (((wx + Math.round(t * 8)) % 23) === 0) screen.hline(x - 2, y - 1, 4, code(SKY, 2));
  }
  // the shore: dithered bands stepping from sea to land, so the gap between the horizon and the
  // ground is somewhere rather than a slab of empty backdrop
  const shore = SEA_TOP + SEA_H;
  screen.dither(0, shore, W, 7, code(SKY, 0), code(GROUND, 1), 0);
  screen.rect(0, shore + 7, W, 9, code(GROUND, 1));
  screen.dither(0, shore + 16, W, 7, code(GROUND, 1), code(GROUND, 2), 1);
  screen.rect(0, shore + 23, W, H - (shore + 23), code(GROUND, 1));

  // a mid-distance ridge at six-tenths speed, between the shore and the ground the player walks
  // on. Without it the middle of the screen is fifty flat pixels of one colour.
  const mid = Math.round(camX * 0.6);
  for (let x = 0; x < W; x++) {
    const wx = x + mid;
    const h = shore + 26
      - Math.round(7 * Math.sin(wx * 0.009 + 2.1) + 4 * Math.sin(wx * 0.023));
    screen.vline(x, h, H - h, code(GROUND, 2));
    screen.px(x, h, code(SCRUB, 1));
    // scrub along the ridge line, stable because it is a function of world x
    if ((wx * 2246822519 >>> 25) % 11 === 0) {
      screen.px(x, h - 1, code(SCRUB, 1));
      screen.px(x, h - 2, code(SCRUB, 1));
    }
  }
}

// --- the ground the whole game stands on --------------------------------------------------------
function drawGround(screen, state) {
  for (let x = 0; x < W; x++) {
    const wx = x + camX;
    const g = Math.round(groundAt(state, wx)) + shakeY;
    if (g >= H) continue;
    screen.vline(x, g, H - g, code(GROUND, 1));
    screen.px(x, g, code(SCRUB, 1));
    screen.px(x, g + 1, code(GROUND, 3));
    // a sparse scatter of scrub and stones, stable because it is a function of world x
    if ((wx * 2654435761 >>> 24) % 23 === 0) {
      screen.px(x, g - 1, code(SCRUB, 1));
      screen.px(x, g - 2, code(SCRUB, 1));
    }
    if ((wx * 40503 >>> 20) % 61 === 0) screen.px(x, g - 1, code(GROUND, 3));
  }
}

/** The tool rack. It was an invisible coordinate at x=16, so handing out tools was a place you
 *  had to be told about rather than one you could see. */
function drawRack(screen, state) {
  const x = sx(16);
  if (x < -20 || x > W + 20) return;
  const g = Math.round(groundAt(state, 16)) + shakeY;
  const waiting = state.units.some((u) => u.kind === 'follower');
  screen.rect(x - 7, g - 14, 15, 2, code(STONE, 2));
  screen.vline(x - 7, g - 14, 14, code(STONE, 1));
  screen.vline(x + 7, g - 14, 14, code(STONE, 1));
  // a bow, a hammer and a crank hanging off it, lit when somebody is waiting for one
  const pal = waiting ? P_LIVE : P_DEAD;
  screen.rect(x - 5, g - 12, 1, 6, code(pal, 3));
  screen.px(x - 4, g - 12, code(pal, 2));
  screen.px(x - 4, g - 7, code(pal, 2));
  screen.rect(x - 1, g - 12, 2, 7, code(pal, 3));
  screen.rect(x - 2, g - 12, 4, 2, code(pal, 2));
  screen.rect(x + 4, g - 11, 1, 5, code(pal, 3));
  screen.px(x + 5, g - 11, code(pal, 2));
  screen.px(x + 3, g - 8, code(pal, 2));
}

function drawShelters(screen, state) {
  for (const s of state.shelters) {
    const x = sx(s.x);
    if (x < -16 || x > W + 16) continue;
    const g = Math.round(groundAt(state, s.x)) + shakeY;
    screen.sprite(x - 4, g - 8, S.SHELTER, s.people > 0 ? P_LIVE : P_DEAD);
  }
}

function drawSites(screen, state) {
  for (const s of state.sites) {
    const x = sx(s.x);
    if (x < -16 || x > W + 16) continue;
    const g = Math.round(groundAt(state, s.x)) + shakeY;
    screen.sprite(x - 4, g - 8, S.STUMP, s.taken ? P_LIVE : P_DEAD);
  }
}

// --- the cable: the most important thing on the screen -------------------------------------------
function drawCable(screen, state, t) {
  for (const seg of state.segments) {
    const ax = Math.min(seg.ax, seg.bx), bx = Math.max(seg.ax, seg.bx);
    if (sx(bx) < -8 || sx(ax) > W + 8) continue;

    const pal = seg.live ? P_LIVE : P_DEAD;
    const cut = !seg.intact ? (seg.cutX ?? (ax + bx) / 2) : null;
    const bitten = state.enemies.find((e) => e.kind === 'gnaw' && e.target === seg.id && e.state === 'bite');

    for (let wx = Math.floor(ax); wx <= Math.ceil(bx); wx++) {
      const x = sx(wx);
      if (x < 0 || x >= W) continue;
      const g = Math.round(groundAt(state, wx)) + shakeY;
      const y = g - 3;

      // a break leaves a visible gap with the ends curled back, so it is findable at a glance
      if (cut !== null && Math.abs(wx - cut) < 3) continue;
      if (cut !== null && Math.abs(wx - cut) < 5) { screen.px(x, y - 1, code(P_DEAD, 2)); continue; }

      if (seg.built < 1) { if (wx % 4 === 0) screen.px(x, y, code(P_DEAD, 1)); continue; }

      // fraying: a gnaw eats the cable down from 2px solid to a dithered 1px before it goes
      if (bitten && Math.abs(wx - bitten.x) < 7) {
        const chew = bitten.bite;
        if (chew < 0.5) screen.px(x, y, code(pal, 2));
        else if (chew < 0.8) { if ((wx + 1) % 2 === 0) screen.px(x, y, code(pal, 2)); }
        else if ((wx % 3) === 0) screen.px(x, y, code(pal, 1));
        continue;
      }

      screen.px(x, y, code(pal, 2));
      if (seg.spliced && Math.abs(wx - (seg.cutX ?? (ax + bx) / 2)) < 6) {
        screen.px(x, y - 1, code(P_LIVE, 3));           // the splice, visible as a lump
      }
    }

    // current, drawn as dots travelling outward. Static lit-vs-grey is a readout; moving dots are
    // a system you can watch, and it is the thing that makes the circuit legible at all.
    if (seg.live) {
      const span = bx - ax;
      const flow = (t * 120) % 32;
      for (let d = -flow; d < span; d += 32) {
        if (d < 0) continue;
        const wx = ax + d;
        const x = sx(wx);
        if (x < 0 || x >= W) continue;
        const g = Math.round(groundAt(state, wx)) + shakeY;
        screen.rect(x, g - 4, 2, 2, code(P_LIVE, 3));
      }
    }
  }
}

// --- towers ---------------------------------------------------------------------------------------
function drawTowers(screen, state, t) {
  for (const tower of state.towers) {
    const x = sx(tower.x);
    if (x < -20 || x > W + 20) continue;
    const g = Math.round(groundAt(state, tower.x)) + shakeY;
    const lit = isLit(tower);
    // running on reserve: the lamp stutters, which is the twelve-second warning made visible
    const reserve = !tower.fed && tower.charge > 0;
    const flicker = reserve && (Math.floor(t * 9) % 4 === 0);
    const pal = tower.hitT > 0 ? P_LIVE : (lit && !flicker) ? P_LIVE : P_DEAD;

    if (tower.kind === 'dynamo') {
      for (let i = 0; i < 3; i++) screen.sprite(x - 4, g - 8 - i * 8, S.DYNAMO, pal);
      // the crank wheel turns while winders are cranking
      const turning = state.units.some((u) => u.kind === 'winder' && Math.abs(u.x - u.post) <= 3);
      if (turning) screen.sprite(x + 5, g - 12, S.CRANK, P_DEAD);
      drawDamage(screen, x - 4, g - 26, state.dynamoHp / RULES.dynamo.hp);
      continue;
    }

    if (tower.kind === 'beacon') {
      const h = 5;
      for (let i = 0; i < h; i++) screen.sprite(x - 4, g - 8 - i * 8, S.BEACON_BODY, lit ? P_LIVE : P_DEAD);
      screen.sprite(x - 4, g - 8 - h * 8, S.BEACON_TOP, pal);
      if (lit) {
        // the beam: a dithered column climbing off the top of the screen
        const top = g - 8 - h * 8;
        const phase = Math.floor(t * 12) % 2;
        screen.dither(x - 6, 0, 13, top, code(P_LIVE, 3), code(P_LIVE, 2), phase);
      }
      drawDamage(screen, x - 4, g - 10 - h * 8, tower.hp / tower.maxHp);
      continue;
    }

    const body = tower.tier === 2 ? S.TOWER_BODY_2 : S.TOWER_BODY;
    const h = tower.tier === 2 ? 3 : 2;
    for (let i = 0; i < h; i++) screen.sprite(x - 4, g - 8 - i * 8, body, lit ? P_LIVE : P_DEAD);
    screen.sprite(x - 4, g - 8 - h * 8, S.TOWER_TOP[tower.tier], pal);
    drawDamage(screen, x - 4, g - 10 - h * 8, tower.hp / tower.maxHp);
  }
}

/** Damage is read off the structure itself — three states, drawn as missing pixels, never a bar. */
function drawDamage(screen, x, y, frac) {
  if (frac > 0.66) return;
  const n = frac > 0.33 ? 2 : 4;
  for (let i = 0; i < n; i++) {
    screen.px(x + 1 + ((i * 3) % 7), y + 2 + ((i * 5) % 6), code(SKY, 0));
  }
}

// --- the crew ---------------------------------------------------------------------------------------
function drawCrew(screen, state, t) {
  for (const u of state.units) {
    const x = sx(u.x);
    if (x < -12 || x > W + 12) continue;
    const g = Math.round(groundAt(state, u.x)) + shakeY;
    const art = S.CREW[u.kind] ?? S.CREW.follower;
    const bob = Math.abs(u.x % 16) < 8 ? 0 : -1;        // a two-frame gait, keyed off position
    screen.sprite(x - 4, g - 8 + bob, art, P_CREW, u.facing < 0);
  }
}

function drawEnemies(screen, state, t) {
  for (const e of state.enemies) {
    const x = sx(e.x);
    if (x < -12 || x > W + 12) continue;
    const g = Math.round(groundAt(state, e.x)) + shakeY;
    const pal = e.flash > 0 ? P_LIVE : P_DARK;
    const f = Math.floor(t * 8) % 2;
    if (e.kind === 'gnaw') screen.sprite(x - 4, g - 8, S.GNAW[f], pal, e.state === 'flee');
    else if (e.kind === 'brute') screen.sprite(x - 4, g - 8, S.BRUTE, pal);
    else screen.sprite(x - 4, g - 8, S.SNATCH[f], pal, e.state === 'flee');
  }
}

function drawShots(screen, state) {
  for (const s of state.shots) {
    const p = s.t / s.dur;
    const wx = s.x + (s.tx - s.x) * p;
    const gy = Math.round(groundAt(state, wx)) + shakeY;
    // a flat arc, which at this scale is two pixels in the right place
    const y = Math.round(s.y + (gy - 6 - s.y) * p - Math.sin(p * Math.PI) * 10);
    const x = sx(wx);
    screen.px(x, y, code(P_LIVE, 3));
    screen.px(x - Math.sign(s.tx - s.x), y, code(P_LIVE, 2));
  }
}

function drawMonarch(screen, state, t) {
  const m = state.monarch;
  const x = sx(m.x);
  const g = Math.round(groundAt(state, m.x)) + shakeY;
  const moving = Math.abs(m.vx) > 4;
  const frame = moving && (Math.floor(t * 9) % 2) ? 1 : 0;
  screen.sprite(x - 4, g - 14, S.MONARCH[frame], P_CREW, m.facing < 0);

  // the satchel, as discrete pips. Full and it pulses — the whole "go and spend it" nudge, with
  // no interface of any kind.
  const cap = satchelCap(state);
  const pips = Math.min(8, Math.ceil((state.spark / cap) * 8));
  const full = state.spark >= cap;
  const on = full ? (Math.floor(t * 4) % 2 ? P_LIVE : P_DEAD) : P_LIVE;
  for (let i = 0; i < 8; i++) {
    const px = x - 10 + (i % 4) * 3;
    const py = g - 20 + (i < 4 ? 0 : 3);
    screen.px(px, py, i < pips ? code(on, 3) : code(P_DEAD, 1));
  }
}

// --- light. Everything above drew into the dark palette; this is what rotates it back. ---------
function drawLamps(screen, state) {
  // the dynamo always glows a little, so the way home is always visible
  for (const tower of state.towers) {
    if (!isLit(tower)) continue;
    const x = sx(tower.x);
    const g = Math.round(groundAt(state, tower.x)) + shakeY;
    let r = towerLight(tower);
    // a tower on reserve dims as the charge drains, so you can see how long you have
    if (!tower.fed) r = Math.round(r * (0.45 + 0.55 * (tower.charge / RULES.capacitor.hold)));
    const h = tower.kind === 'beacon' ? 44 : tower.kind === 'dynamo' ? 20 : tower.tier === 2 ? 28 : 20;
    screen.lamp(x, g - h, r);
  }
  // the lineman's own lamp is small on purpose: riding west has to feel like a commitment, not a
  // stroll with a floodlight
  const m = state.monarch;
  screen.lamp(sx(m.x), Math.round(groundAt(state, m.x)) + shakeY - 14, 22);
}
