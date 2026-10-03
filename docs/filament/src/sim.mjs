// The whole game, with no screen and no speaker attached.
//
// Nothing here touches the DOM, canvas, audio, Date.now() or Math.random. It is a pure function of
// (state, input) advancing in fixed ticks. Three consequences, all deliberate:
//
//   1. The stress harness runs it in Node, thousands of game-hours in a coffee break, no browser.
//   2. Same seed + same input tape => the same run, bit for bit. A bug found at hour nine is still
//      there on the replay instead of being a ghost.
//   3. Juice cannot change the game. Anything the outside world should react to is pushed onto
//      `state.events` and drained by the caller; the simulation never knows if anyone is listening.
//
// The clock is `state.tick`, an integer. Every duration below is a tick count. A float
// `seconds += DT` accumulator drifts over a long session, and the drift is invisible until a night
// is quietly two seconds short.

import { makeRng } from './rng.mjs';

export const TPS = 60;                     // ticks per second; the only timestep there is
export const DT = 1 / TPS;                 // for anything that genuinely wants seconds
export const TILE = 8;
const sec = (s) => Math.round(s * TPS);

// ---------------------------------------------------------------------------------------------
// Every tunable in one object. Never a magic number inline — tuning is a harness run, not a hunt.
// ---------------------------------------------------------------------------------------------
export const RULES = {
  world: { end: 2600, groundY: 168 },

  // one day is about one round trip to the frontier, which is what makes "caught out west at
  // dusk" happen on its own as the line extends
  monarch: { speed: 60, cableSpeed: 92, accel: 360, friction: 460 },

  cost: { hire: 2, tool: 4, tower: 12, upgrade: 8, cable: 3, splice: 3, beacon: 30 },
  reward: { beacon: 40 },

  satchel: { base: 40, perBeacon: 30 },

  day: sec(75), dusk: sec(4), dawn: sec(4),
  nightLen: [sec(45), sec(50), sec(55), sec(60)],

  // A cut does not black the line out instantly. Every tower holds a reserve, so a break starts a
  // countdown you can beat rather than a disaster you watch. This is the difference between a
  // mechanic and a punishment: the player gets to respond.
  capacitor: { hold: sec(12), charge: 3, drain: 1 },

  dynamo: { hp: 16, mendPerDawn: 3, slots: 2 },

  winder: { period: sec(3.5), walk: 44 },
  lineman: { walk: 52, build: sec(3), cable: sec(1.6), repair: sec(1.2), lampPull: 110 },
  archer: { walk: 48, range: 68, period: sec(1.0), damage: 1 },

  tower: { tier: [null, { hp: 8, slots: 2, light: 38 }, { hp: 14, slots: 3, light: 52 }] },
  beacon: { hp: 12, light: 68 },
  cableRun: 64,
  get maxSpan() { return this.cableRun * 2.2; },

  gnaw:   { speed: 34, hp: 2, bite: sec(1.8), dynamoDamage: 1, hitPeriod: sec(3.0) },
  brute:  { speed: 22, hp: 5, hitPeriod: sec(1.4), damage: 1 },
  snatch: { speed: 42, hp: 2, steal: 6 },

  maxEnemies: 20,

  // Escalation follows BEACONS, not nights. Power and threat used to grow at the same linear rate,
  // so nothing ever became a crisis and a stuck player just got ground down by the clock. Now
  // relighting a beacon is a spike you earned, and dawdling escalates slowly.
  wave(nightsSinceBeacon, beaconsLit, nightNumber) {
    // Dawdling escalates, but only so far: a player who cannot light a beacon yet must not be
    // ground down by a number that keeps climbing while they are already losing.
    const budget = Math.min(RULES.maxEnemies,
      4 + Math.min(8, 2 * Math.max(0, nightsSinceBeacon)) + 7 * beaconsLit);
    const mix = nightNumber === 1 ? { gnaw: 1 }
              : nightNumber === 2 ? { gnaw: 0.85, brute: 0.15 }
              : nightNumber === 3 ? { gnaw: 0.6, brute: 0.2, snatch: 0.2 }
              :                     { gnaw: 0.55, brute: 0.3, snatch: 0.15 };
    return { budget, mix };
  },
};

// Measured: with beacons at 760/1560/2380 the first one lit at minute 9.7 on average, and 74% of
// all nights across a run were played with zero beacons lit — so the escalation curve, which keys
// off beacons, was never experienced. Minutes 2 to 10 of a 13-minute game contained no landmark
// event at all.
const BEACON_X = [420, 1100, 2000];

// ---------------------------------------------------------------------------------------------
// Terrain: a 1-D heightmap, used for drawing and for standing on. The world is a line, so there is
// no pathfinding anywhere in this game.
// ---------------------------------------------------------------------------------------------
function makeTerrain(rng, end) {
  const n = Math.ceil((end + 400) / TILE) + 1;
  const h = new Float32Array(n);
  const oct = (period, amp, phase) => {
    const out = new Float32Array(n);
    const ctrl = [];
    for (let i = 0; i <= Math.ceil(n * TILE / period) + 1; i++) ctrl.push(rng.range(-amp, amp));
    for (let i = 0; i < n; i++) {
      const p = (i * TILE + phase) / period;
      const a = ctrl[Math.floor(p) % ctrl.length], b = ctrl[(Math.floor(p) + 1) % ctrl.length];
      const t = p - Math.floor(p);
      out[i] = a + (b - a) * (t * t * (3 - 2 * t));          // smoothstep, so no corners
    }
    return out;
  };
  const a = oct(260, 12, 0), b = oct(96, 4, 37);
  for (let i = 0; i < n; i++) h[i] = RULES.world.groundY + a[i] + b[i];

  for (const bx of BEACON_X) {                 // a flat pad under every beacon
    const c = Math.round(bx / TILE);
    const level = h[Math.min(n - 1, Math.max(0, c))];
    for (let i = c - 5; i <= c + 5; i++) {
      if (i < 0 || i >= n) continue;
      const k = 1 - Math.abs(i - c) / 6;
      h[i] = h[i] * (1 - k) + level * k;
    }
  }
  const apron = h[13] ?? RULES.world.groundY;
  for (let i = 0; i < 14 && i < n; i++) h[i] = apron;
  return h;
}

export function groundAt(state, x) {
  const h = state.terrain;
  const p = x / TILE;
  const i = Math.floor(p);
  if (i < 0) return h[0];
  if (i >= h.length - 1) return h[h.length - 1];
  return h[i] + (h[i + 1] - h[i]) * (p - i);
}

// ---------------------------------------------------------------------------------------------
// New game
// ---------------------------------------------------------------------------------------------
export function newGame(seed = 1) {
  const rng = makeRng(seed);
  const state = {
    seed, rng, terrain: makeTerrain(rng, RULES.world.end),
    nextId: 1,
    tick: 0,
    phase: 'day', phaseT: 0, nightNumber: 0, dayNumber: 1,
    nightLen: 0, nightsSinceBeacon: 0,
    spark: 20,
    monarch: { x: 40, vx: 0, facing: 1, onCable: false },
    towers: [], segments: [], sites: [], shelters: [],
    units: [], enemies: [], shots: [], jobs: [],
    beaconsLit: 0, capTier: 0, dynamoHp: RULES.dynamo.hp,
    wave: null,
    over: null, overT: 0,
    // the conservation ledger. One invariant over these catches every double-spend, missing
    // refund and vanished coin in the game.
    // Conservation: every spark ever minted is, right now, in exactly one of five places —
    // the satchel, a thief's hands, something you bought, overflow off a full satchel, or gone
    // west with a thief that got away. One invariant over this audits the whole economy.
    ledger: { minted: 20, spent: 0, lostToCap: 0, escaped: 0 },
    stats: { cutsSpliced: 0, cutsMended: 0, enemiesKilled: 0, nightsSurvived: 0, towersLost: 0 },
    events: [],
  };
  const id = () => state.nextId++;

  state.towers.push({
    id: id(), x: 0, kind: 'dynamo', tier: 2, hp: RULES.dynamo.hp, maxHp: RULES.dynamo.hp,
    built: 1, fed: true, charge: RULES.capacitor.hold, ignited: true, archers: [],
    hitT: 0, wasLit: true, firedOnce: false,
  });

  for (const bx of BEACON_X) {
    state.towers.push({
      id: id(), x: bx, kind: 'beacon', tier: 2, hp: RULES.beacon.hp, maxHp: RULES.beacon.hp,
      built: 1, fed: false, charge: 0, ignited: false, archers: [],
      hitT: 0, wasLit: false, firedOnce: false,
    });
  }

  let x = 120;
  while (x < RULES.world.end) {
    if (!BEACON_X.some((b) => Math.abs(b - x) < 70)) state.sites.push({ id: id(), x: Math.round(x), taken: false });
    x += rng.range(78, 112);
  }

  // Make sure the line can actually be completed.
  //
  // Sites are kept clear of the beacons so a beacon has room to stand, and on most seeds that left
  // a beacon 150-odd pixels from its nearest neighbour — further than cable can ever span. The
  // result was a coast that looked fine, broke no invariant, and was quietly unwinnable past the
  // first beacon. Nothing in the simulation was wrong; the world was just impossible.
  //
  // So: walk every node the circuit will ever use and drop a site into any gap too wide to bridge.
  for (let pass = 0; pass < 8; pass++) {
    const nodes = [0, ...BEACON_X, ...state.sites.map((s) => s.x)].sort((a, b) => a - b);
    let added = false;
    for (let i = 1; i < nodes.length; i++) {
      const span = nodes[i] - nodes[i - 1];
      if (span <= RULES.maxSpan) continue;
      const n = Math.ceil(span / RULES.maxSpan);
      for (let k = 1; k < n; k++) {
        state.sites.push({ id: id(), x: Math.round(nodes[i - 1] + (span * k) / n), taken: false });
      }
      added = true;
    }
    if (!added) break;
  }
  state.sites.sort((a, b) => a.x - b.x);

  // Shelters have to stand clear of everything else you can press the button on. The prompt shows
  // whatever is NEAREST, so a shelter sitting on top of a build site means the site can never be
  // chosen — the player stands two pixels away from the thing they want, is offered a hire instead,
  // and nothing explains why. Pushing them apart at generation time is the fix; arbitrating it at
  // the prompt would just move the confusion somewhere else.
  const CLEAR = 34;
  const occupied = () => [...state.sites.map((s) => s.x), ...BEACON_X, 0, 16];
  const placeShelter = (wantX, people) => {
    let x = Math.round(wantX);
    for (let tries = 0; tries < 40; tries++) {
      const near = occupied().find((o) => Math.abs(o - x) < CLEAR);
      if (near === undefined) break;
      x = Math.round(near + CLEAR + 2);
    }
    if (x < RULES.world.end) state.shelters.push({ id: id(), x, people });
  };

  placeShelter(150, 2);
  let sx = 330;
  while (sx < RULES.world.end) {
    placeShelter(sx, rng.int(1, 3));
    sx += rng.range(260, 400);
  }

  // The old crew left something standing: one tower, wired, with an archer in it. Night 1's whole
  // lesson is watching it work, so it has to already exist before night 1 begins.
  const first = state.sites.find((s) => s.x > 90 && s.x <= RULES.maxSpan);
  if (first) {
    state.sites.splice(state.sites.indexOf(first), 1);
    const tower = {
      id: id(), x: first.x, kind: 'tower', tier: 1,
      hp: RULES.tower.tier[1].hp, maxHp: RULES.tower.tier[1].hp,
      built: 1, fed: false, charge: 0, ignited: true, archers: [],
      hitT: 0, wasLit: false, firedOnce: false,
    };
    state.towers.push(tower);
    state.segments.push({
      id: id(), a: state.towers[0].id, b: tower.id, ax: 0, bx: tower.x,
      built: 1, intact: true, spliced: false, live: false, cutX: null,
    });
    state.units.push({ id: id(), kind: 'archer', x: tower.x, facing: -1, timer: 0,
                       job: null, post: tower.x, idleT: 0, wander: null, stuckT: 0 });
  }

  // Two winders already cranking, and one lineman. The winders teach what a winder is simply by
  // existing and visibly producing something.
  //
  // The lineman is not a nicety. Without one, the first tower you pay for is never built by
  // anybody: the stump sits there marked as taken, the job waits in a queue with no one to claim
  // it, and the game deadlocks on day one in complete silence. That is how it behaved until the
  // trace showed a competent player stuck at one tower for the whole run.
  for (let i = 0; i < 2; i++) {
    state.units.push({ id: id(), kind: 'winder', x: 14 + i * 8, facing: 1, timer: i * 30,
                       job: null, post: 14 + i * 8, idleT: 0, wander: null, stuckT: 0 });
  }
  state.units.push({ id: id(), kind: 'lineman', x: 30, facing: 1, timer: 0,
                     job: null, post: 30, idleT: 0, wander: null, stuckT: 0 });

  solveCircuit(state);
  stepCharge(state, true);
  return state;
}

// ---------------------------------------------------------------------------------------------
// The circuit — the rule the whole game hangs off.
//
// A tower is FED if every segment between it and the dynamo exists, is finished and is unbroken.
// There is no alternate route: it is a series circuit, which is why one bite anywhere matters.
//
// But fed is not LIT. A tower holds a reserve and runs on it when the feed stops, so a cut starts
// a twelve-second countdown and an alarm rather than a blackout. That one distinction is what
// makes the rule a mechanic instead of a cliff.
// ---------------------------------------------------------------------------------------------
export const towerLight = (t) =>
  t.kind === 'dynamo' ? RULES.beacon.light
  : t.kind === 'beacon' ? (t.ignited ? RULES.beacon.light : 0)
  : RULES.tower.tier[t.tier].light;

export const isLit = (t) =>
  (t.kind !== 'beacon' || t.ignited) && (t.fed || t.charge > 0);

export function solveCircuit(state) {
  const order = [...state.towers].sort((a, b) => a.x - b.x || a.id - b.id);
  let live = true;
  for (let i = 0; i < order.length; i++) {
    const t = order[i];
    if (i === 0) { t.fed = true; continue; }
    const prev = order[i - 1];
    const seg = state.segments.find(
      (s) => (s.a === prev.id && s.b === t.id) || (s.a === t.id && s.b === prev.id));
    if (!seg || seg.built < 1 || !seg.intact) live = false;
    t.fed = live && t.built >= 1;
  }
  for (const seg of state.segments) {
    const a = state.towers.find((t) => t.id === seg.a);
    const b = state.towers.find((t) => t.id === seg.b);
    const inner = a && b ? (a.x <= b.x ? a : b) : null;
    seg.live = !!(seg.intact && seg.built >= 1 && inner && inner.fed);
  }
}

/** An independent, deliberately stupid reference solve. The dev build diffs the two every tick. */
export function referenceFed(state, tower) {
  const order = [...state.towers].sort((a, b) => a.x - b.x || a.id - b.id);
  const i = order.indexOf(tower);
  if (i <= 0) return i === 0;
  if (tower.built < 1) return false;
  for (let k = 1; k <= i; k++) {
    const seg = state.segments.find(
      (s) => (s.a === order[k - 1].id && s.b === order[k].id) ||
             (s.a === order[k].id && s.b === order[k - 1].id));
    if (!seg || seg.built < 1 || !seg.intact) return false;
  }
  return true;
}

/**
 * The hit flash.
 *
 * `hitT` was set to 11 whenever something struck a tower and then NEVER decremented anywhere in
 * the project — it is only ever read, by the renderer, which pins the tower's cap to the live
 * palette while it is non-zero. So one hit from one brute lit that tower's cap permanently AND
 * killed its reserve flicker, which is the visible twelve-second countdown the whole capacitor
 * mechanic depends on. The dynamo is hit constantly, so it was pinned from the first night.
 *
 * Nothing could catch it: it is pure render state, so no invariant covered it and no headless run
 * ever looked at it.
 */
function stepHitFlash(state) {
  for (const t of state.towers) if (t.hitT > 0) t.hitT--;
}

function stepCharge(state, instant = false) {
  // Unfed towers drain in ORDER, nearest the dynamo first, so a blackout propagates outward from
  // the break over a second or so instead of every lamp dying on the same frame. That ordering is
  // what lets the sound be a descending phrase whose LENGTH is the size of the loss — the player
  // learns to hear how much they lost without a single number on screen.
  const starving = state.towers
    .filter((t) => t.kind !== 'dynamo' && !t.fed && t.charge > 0)
    .sort((a, b) => a.x - b.x || a.id - b.id);
  const rank = new Map(starving.map((t, i) => [t.id, i]));

  for (const t of state.towers) {
    if (t.kind === 'dynamo') { t.charge = RULES.capacitor.hold; t.wasLit = true; continue; }
    const wasLit = t.wasLit;
    if (t.fed) {
      t.charge = instant ? RULES.capacitor.hold
        : Math.min(RULES.capacitor.hold, t.charge + RULES.capacitor.charge);
      t.warned = false;
    } else if (t.charge > 0) {
      const k = rank.get(t.id) ?? 0;
      t.charge = Math.max(0, t.charge - RULES.capacitor.drain * Math.max(0.55, 1 - k * 0.07));
      if (!t.warned) { t.warned = true; state.events.push({ type: 'tower-reserve', x: t.x, id: t.id }); }
    }
    const lit = isLit(t);
    if (lit && !wasLit) state.events.push({ type: 'tower-lit', x: t.x, id: t.id });
    if (!lit && wasLit) state.events.push({ type: 'tower-dark', x: t.x, id: t.id });
    t.wasLit = lit;
  }
}

export function cableGap(state) {
  const order = [...state.towers].sort((a, b) => a.x - b.x || a.id - b.id);
  for (let i = 1; i < order.length; i++) {
    const a = order[i - 1], b = order[i];
    if (b.built < 1) continue;
    if (state.segments.some((s) => (s.a === a.id && s.b === b.id) || (s.a === b.id && s.b === a.id))) continue;
    if (b.x - a.x > RULES.cableRun * 2.2) continue;    // too far; a tower is needed between them
    return { a, b };
  }
  return null;
}

export const segmentAt = (state, x) => state.segments.find(
  (s) => s.built >= 1 && x >= Math.min(s.ax, s.bx) - 4 && x <= Math.max(s.ax, s.bx) + 4);

// ---------------------------------------------------------------------------------------------
// Jobs. A job is CLAIMED, never browsed: it has an owner or it does not. Two linemen can never
// walk to the same break, which is the classic way a queue like this double-pays or deadlocks.
// ---------------------------------------------------------------------------------------------
function addJob(state, kind, targetId, x) {
  if (state.jobs.some((j) => j.kind === kind && j.target === targetId)) return;
  state.jobs.push({ id: state.nextId++, kind, target: targetId, x, owner: null });
}

function takeJob(state, unit) {
  const open = state.jobs.filter((j) => j.owner === null);
  if (!open.length) return null;
  const mx = state.monarch.x;
  open.sort((a, b) => {
    const rank = (j) => (j.kind === 'repair' ? 0 : j.kind === 'cable' ? 1 : 2);
    // Breaks first; then whatever is nearest the monarch's lamp. Riding to the trouble is what
    // makes the crew work on it, which is the player's agency during a night when nothing else
    // needs doing.
    const near = (j) => (Math.abs(j.x - mx) < RULES.lineman.lampPull ? 0 : 1);
    return rank(a) - rank(b) || near(a) - near(b) ||
           Math.abs(a.x - mx) - Math.abs(b.x - mx) || a.id - b.id;
  });
  const job = open[0];
  job.owner = unit.id;
  return job;
}

function releaseJob(state, job, done) {
  if (!job) return;
  const i = state.jobs.indexOf(job);
  if (done) { if (i >= 0) state.jobs.splice(i, 1); }
  else if (i >= 0) job.owner = null;
}

function jobStillValid(state, job) {
  if (!job) return false;
  if (job.kind === 'build') return state.sites.some((s) => s.id === job.target && s.taken);
  if (job.kind === 'cable') return state.segments.some((s) => s.id === job.target && s.built < 1);
  if (job.kind === 'repair') return state.segments.some((s) => s.id === job.target && (!s.intact || s.spliced));
  return false;
}

// ---------------------------------------------------------------------------------------------
// Money. Integer always. Accumulate a fractional TIMER, never fractional spark — otherwise
// 39.99999999 makes an affordable thing unaffordable and spark === 0 is never exactly true.
// ---------------------------------------------------------------------------------------------
/**
 * The satchel grows with every beacon you have ever lit, and never shrinks again.
 *
 * Tying it to beaconsLit meant that a brute putting a beacon out shrank the cap underneath spark
 * you were already carrying — so you silently lost thirty spark for a thing that was already a
 * setback, and the number on the ledger went out of range. You earned the bigger satchel; losing
 * the light does not take it off you.
 */
export const satchelCap = (state) => RULES.satchel.base + RULES.satchel.perBeacon * state.capTier;

function pay(state, n, why) {
  if (state.spark < n) return false;
  state.spark -= n;
  state.ledger.spent += n;
  state.events.push({ type: 'spend', amount: n, why, x: state.monarch.x });
  return true;
}

/**
 * `fresh` is the difference between spark the winders just made and spark coming back off a dead
 * thief. Only the former is newly minted; the latter was minted once already and counting it
 * twice is exactly the bug the ledger invariant caught.
 */
export function earn(state, n, x, fresh = true) {
  const room = Math.max(0, satchelCap(state) - state.spark);
  const got = Math.min(n, room);
  state.spark += got;
  if (fresh) state.ledger.minted += n;
  state.ledger.lostToCap += n - got;
  if (got > 0) state.events.push({ type: 'earn', amount: got, x });
  if (got < n) state.events.push({ type: 'satchel-full', x });
  return got;
}

/** minted === spark + carried by thieves + spent + lost to the cap + escaped west */
export function ledgerBalance(state) {
  const l = state.ledger;
  const carried = state.enemies.reduce((n, e) => n + (e.carrying || 0), 0);
  return l.minted - l.spent - l.lostToCap - l.escaped - state.spark - carried;
}

// ---------------------------------------------------------------------------------------------
// The step. The order below is fixed and load-bearing: the win check is maximally sensitive to it,
// so it is written down once here rather than being settled by whichever line got written first.
//
//   phase -> monarch -> crew -> the dark -> arrows -> solve -> charge -> beacons -> win/lose
// ---------------------------------------------------------------------------------------------
export function step(state, input = {}) {
  state.tick++;
  if (state.over) { state.overT++; return state; }

  stepHitFlash(state);
  stepPhase(state);
  stepMonarch(state, input);
  stepUnits(state);
  stepEnemies(state);
  stepShots(state);
  reapDead(state);
  solveCircuit(state);
  stepCharge(state);
  stepBeacons(state);
  checkEnd(state);
  return state;
}

function stepPhase(state) {
  state.phaseT++;
  switch (state.phase) {
    case 'day':
      if (state.phaseT >= RULES.day) {
        state.phase = 'dusk'; state.phaseT = 0;
        // a splice is a field fix, not a repair. It holds for the night it was made and then goes.
        for (const s of state.segments) {
          if (s.spliced && s.intact) {
            s.intact = false; s.spliced = false;
            addJob(state, 'repair', s.id, s.cutX ?? (s.ax + s.bx) / 2);
            state.events.push({ type: 'splice-failed', x: s.cutX ?? (s.ax + s.bx) / 2 });
          }
        }
        state.events.push({ type: 'dusk' });
      }
      break;

    case 'dusk':
      if (state.phaseT >= RULES.dusk) {
        state.phase = 'night'; state.phaseT = 0;
        state.nightNumber++;
        state.nightsSinceBeacon++;
        // sampled ONCE, here. Looking it up each tick lets a mid-night beacon retroactively change
        // tonight's length, and dawn becomes either already-past or unreachable.
        state.nightLen = RULES.nightLen[Math.min(state.nightNumber - 1, RULES.nightLen.length - 1)];
        const { budget, mix } = RULES.wave(state.nightsSinceBeacon - 1, state.beaconsLit, state.nightNumber);
        state.wave = { budget, spent: 0, mix, nextAt: sec(1.5), taught: false, taught2: false, behind: false };
        state.events.push({ type: 'night', n: state.nightNumber });
      }
      break;

    case 'night':
      if (state.wave) spawnWave(state);
      if (state.phaseT >= state.nightLen) {
        state.phase = 'dawn'; state.phaseT = 0;
        state.stats.nightsSurvived++;
        for (const e of state.enemies) {
          // it got away with it, and that spark is gone for good — the cost of being caught out
          // west with a full satchel.
          if (e.carrying > 0) { state.ledger.escaped += e.carrying; e.carrying = 0; }
          state.events.push({ type: 'burn', x: e.x, kind: e.kind });
        }
        state.enemies.length = 0;
        state.shots.length = 0;
        state.dynamoHp = Math.min(RULES.dynamo.hp, state.dynamoHp + RULES.dynamo.mendPerDawn);
        state.towers[0].hp = state.dynamoHp;
        state.events.push({ type: 'dawn' });
      }
      break;

    case 'dawn':
      if (state.phaseT >= RULES.dawn) {
        state.phase = 'day'; state.phaseT = 0; state.dayNumber++;
        for (const s of state.shelters) if (s.people < 3 && state.rng.chance(0.5)) s.people++;
      }
      break;
  }
}

function spawnWave(state) {
  const w = state.wave;
  if (w.spent >= w.budget) return;
  if (state.enemies.length >= RULES.maxEnemies) return;
  // never spawn something that cannot reach anything before dawn
  if (state.phaseT > state.nightLen - sec(6)) return;
  if (--w.nextAt > 0) return;

  const frontier = spawnLine(state);

  // ONE burst a night comes up behind the line.
  //
  // Everything used to spawn two hundred pixels beyond the furthest tower you had lit, bite the
  // first bare cable it met there, and be burned off by dawn. The dynamo sits one to two thousand
  // pixels behind that, so it could not be reached — not as a matter of balance but as a matter of
  // geometry. Eight different tuning variants over a hundred and sixty-five measured games all
  // ended the same way: every run won, the dynamo untouched at full health in every single one.
  //
  // This is the change the rest of the game was already built for and never got. A break behind
  // you is what the capacitor countdown is for, what the lineman queue's "breaks nearest the
  // dynamo first" rule is for, what the descending blackout phrase is for, and what the dynamo's
  // own archer slots are for. None of it could ever fire while the only threat was out in front.
  if (!w.behind && state.phaseT > sec(10) && state.nightNumber >= 2) {
    w.behind = true;
    const inner = state.segments.filter(
      (sg) => sg.intact && sg.built >= 1 && Math.max(sg.ax, sg.bx) < frontier - 120);
    if (inner.length) {
      const seg = state.rng.pick(inner);
      const at = (seg.ax + seg.bx) / 2 + state.rng.range(-18, 18);
      const n = Math.min(2, w.budget - w.spent);
      for (let i = 0; i < n; i++) state.enemies.push(makeEnemy(state, 'gnaw', at + i * 14));
      w.spent += n;
      state.events.push({ type: 'behind', x: at, n });
      w.nextAt = sec(5);
      return;
    }
  }

  // Night 2's lesson is scripted: one gnaw starts right on a bare segment, outside archer range,
  // so the player watches the cable go and learns the thesis in four seconds with no words.
  // Night ONE, and only one intact segment needed.
  //
  // This used to wait for night two AND require two intact segments — so a first-timer who spent
  // day one hiring instead of building never saw the one idea the whole game is about. The
  // starting segment always exists, so now it always lands.
  if (state.nightNumber === 1 && !w.taught && state.segments.some((s) => s.intact && s.built >= 1)) {
    w.taught = true;
    const bare = [...state.segments].filter((s) => s.built >= 1 && s.intact)
      .sort((a, b) => b.ax - a.ax)[0];
    { const s = bare;
    if (bare) {
      const mid = (Math.min(s0(bare), s1(bare)) + Math.max(s0(bare), s1(bare))) / 2;
      state.enemies.push(makeEnemy(state, 'gnaw', mid + 6));
      w.spent++;
      w.nextAt = sec(7);
      return;
    } }
  }
  // Night 3's lesson: the first snatch is guaranteed, so the player meets a thief before one can
  // ever matter.
  if (state.nightNumber === 3 && !w.taught2) {
    w.taught2 = true;
    state.enemies.push(makeEnemy(state, 'snatch', frontier));
    w.spent++;
    w.nextAt = sec(6);
    return;
  }

  // Night 1 arrives one at a time, so the first full kill cycle is watched alone.
  const burst = state.nightNumber === 1 ? 1 : Math.min(w.budget - w.spent, state.rng.int(1, 3));
  for (let i = 0; i < burst && state.enemies.length < RULES.maxEnemies; i++) {
    const r = state.rng.next();
    let kind = 'gnaw', acc = 0;
    for (const [k, p] of Object.entries(w.mix)) { acc += p; if (r <= acc) { kind = k; break; } }
    state.enemies.push(makeEnemy(state, kind, frontier + state.rng.range(0, 90)));
    w.spent++;
  }
  state.events.push({ type: 'spawn', n: burst });
  w.nextAt = state.rng.int(sec(4.5), sec(8));
}

const s0 = (seg) => seg.ax, s1 = (seg) => seg.bx;

/**
 * Where the dark comes in: just beyond the furthest thing you have actually lit.
 *
 * This used to take the furthest tower of ANY kind — which included the three cold beacons sitting
 * at the far end of the map from the first frame. So every enemy spawned two thousand pixels out,
 * spent the entire night walking, and never arrived. Nothing was ever threatened, nothing could
 * ever be lost, and the game was unloseable by construction. A beacon only counts once you have
 * paid to light it, which is also the moment it becomes worth defending.
 */
function spawnLine(state) {
  const held = state.towers.reduce((m, t) => (t.ignited ? Math.max(m, t.x) : m), 0);
  return Math.max(300, held + 200);
}

function makeEnemy(state, kind, x) {
  return { id: state.nextId++, kind, x, hp: RULES[kind].hp, state: 'walk', prevState: 'walk',
           timer: 0, target: null, carrying: 0, flash: 0, stateT: 0, bite: 0 };
}

function stepMonarch(state, input) {
  const m = state.monarch;
  // riding the line is faster than riding the dirt. Cable stops being pure liability the moment it
  // does something for you.
  const seg = segmentAt(state, m.x);
  m.onCable = !!(seg && seg.live);
  const top = m.onCable ? RULES.monarch.cableSpeed : RULES.monarch.speed;

  const want = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (want !== 0) { m.vx += want * RULES.monarch.accel * DT; m.facing = want; }
  else {
    const d = Math.sign(m.vx) * RULES.monarch.friction * DT;
    m.vx = Math.abs(d) >= Math.abs(m.vx) ? 0 : m.vx - d;
  }
  m.vx = Math.max(-top, Math.min(top, m.vx));
  m.x += m.vx * DT;
  if (m.x < 0) { m.x = 0; m.vx = 0; }
  const far = RULES.world.end + 120;
  if (m.x > far) { m.x = far; m.vx = 0; }
}

// --- the crew ---------------------------------------------------------------------------------
function stepUnits(state) {
  for (const u of state.units) {
    // `stuckT` counts ticks spent trying to GET somewhere. It resets the moment the unit arrives,
    // so a unit happily doing its job forever is fine and a unit walking forever is not.
    let arrived = true;
    switch (u.kind) {
      case 'follower': {
        const behind = state.monarch.x - (state.monarch.facing || 1) * (10 + u.slot * 9);
        arrived = Math.abs(u.x - behind) <= 24;
        walkToward(u, behind, RULES.winder.walk);
        break;
      }

      case 'winder':
        if (Math.abs(u.x - u.post) > 3) { arrived = false; walkToward(u, u.post, RULES.winder.walk); break; }
        if (++u.timer >= RULES.winder.period) {
          u.timer = 0;
          earn(state, 1, u.x);
          state.events.push({ type: 'crank', x: u.x });
        }
        break;

      case 'lineman': {
        if (!u.job) {
          u.job = takeJob(state, u);
          if (!u.job) { idleNear(state, u, 34); break; }
          u.timer = 0; u.stuckT = 0;
        }
        if (!jobStillValid(state, u.job)) { releaseJob(state, u.job, true); u.job = null; break; }
        if (Math.abs(u.x - u.job.x) > 5) { arrived = false; walkToward(u, u.job.x, RULES.lineman.walk); break; }
        u.timer++;
        const need = u.job.kind === 'build' ? RULES.lineman.build
                   : u.job.kind === 'cable' ? RULES.lineman.cable : RULES.lineman.repair;
        state.events.push({ type: 'work', x: u.x, kind: u.job.kind });
        if (u.timer >= need) {
          finishJob(state, u.job);
          releaseJob(state, u.job, true);
          u.job = null; u.timer = 0;
        }
        break;
      }

      case 'archer': {
        const post = bestPost(state, u);
        if (!post) { idleNear(state, u, 44); break; }
        if (Math.abs(u.x - post.x) > 4) { arrived = false; walkToward(u, post.x, RULES.archer.walk); break; }
        u.timer = Math.min(u.timer + 1, RULES.archer.period);
        if (u.timer >= RULES.archer.period && isLit(post)) {
          const prey = nearestEnemy(state, u.x, RULES.archer.range);
          if (prey) {
            u.timer = 0;
            state.shots.push({ id: state.nextId++, x: u.x, y: groundAt(state, u.x) - 26,
                               tx: prey.x, t: 0, dur: sec(0.26), target: prey.id });
            state.events.push({ type: 'shoot', x: u.x });
          }
        }
        break;
      }
    }
    u.stuckT = arrived ? 0 : (u.stuckT || 0) + 1;
    if (!Number.isFinite(u.x)) u.x = 0;
  }
}

function finishJob(state, job) {
  if (job.kind === 'build') {
    const site = state.sites.find((s) => s.id === job.target);
    if (!site) return;
    state.towers.push({
      id: state.nextId++, x: site.x, kind: 'tower', tier: 1,
      hp: RULES.tower.tier[1].hp, maxHp: RULES.tower.tier[1].hp,
      built: 1, fed: false, charge: 0, ignited: true, archers: [],
      hitT: 0, wasLit: false, firedOnce: false,
    });
    state.sites.splice(state.sites.indexOf(site), 1);
    state.events.push({ type: 'tower-raised', x: site.x });
  } else if (job.kind === 'cable') {
    const seg = state.segments.find((s) => s.id === job.target);
    if (!seg) return;
    seg.built = 1;
    state.events.push({ type: 'cable-laid', x: (seg.ax + seg.bx) / 2 });
  } else if (job.kind === 'repair') {
    const seg = state.segments.find((s) => s.id === job.target);
    if (!seg) return;
    seg.intact = true; seg.spliced = false; seg.cutX = null;
    state.stats.cutsMended++;
    state.events.push({ type: 'cable-mended', x: (seg.ax + seg.bx) / 2 });
  }
}

function walkToward(u, target, speed) {
  const d = target - u.x;
  const stepLen = speed * DT;
  u.facing = Math.sign(d) || u.facing || 1;
  u.x = Math.abs(d) <= stepLen ? target : u.x + Math.sign(d) * stepLen;   // snap, never overshoot
}

function idleNear(state, u, home) {
  if (++u.idleT > sec(2.4)) { u.idleT = 0; u.wander = home + state.rng.range(-26, 26); }
  if (u.wander != null) walkToward(u, u.wander, RULES.winder.walk * 0.5);
}

/** The furthest lit tower with a free slot — archers push outward, which is where they are wanted. */
function bestPost(state, u) {
  // Note: NOT filtered by isLit. An archer who abandons a tower the moment the lights go out turns
  // every cut into a rout — they stay at the post and simply cannot shoot, which is what "a dark
  // tower does nothing" was always supposed to mean.
  const free = state.towers.filter((t) =>
    t.built >= 1 && (t.archers.length < slotsOf(t) || t.archers.includes(u.id)));
  if (!free.length) {
    for (const t of state.towers) {
      const i = t.archers.indexOf(u.id);
      if (i >= 0) t.archers.splice(i, 1);
    }
    return null;
  }
  free.sort((a, b) => b.x - a.x || a.id - b.id);
  const post = free[0];
  for (const t of state.towers) {
    const i = t.archers.indexOf(u.id);
    if (i >= 0 && t !== post) t.archers.splice(i, 1);
  }
  if (!post.archers.includes(u.id)) post.archers.push(u.id);
  return post;
}

/** How many archers a structure holds. The dynamo counts, and is the post of last resort. */
export const slotsOf = (t) =>
  t.kind === 'dynamo' ? RULES.dynamo.slots
  : t.kind === 'beacon' ? RULES.tower.tier[2].slots
  : RULES.tower.tier[t.tier].slots;

function nearestEnemy(state, x, range) {
  let best = null, bestD = range;
  for (const e of state.enemies) {
    const d = Math.abs(e.x - x);
    if (d < bestD || (d === bestD && best && e.id < best.id)) { bestD = d; best = e; }
  }
  return best;
}

// --- the dark ---------------------------------------------------------------------------------
function stepEnemies(state) {
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const e = state.enemies[i];
    if (e.state !== e.prevState) { e.stateT = 0; e.prevState = e.state; }
    e.stateT++;
    if (e.flash > 0) e.flash--;

    if (e.hp <= 0) continue;              // reaped below, once all damage for the tick has landed

    switch (e.kind) {
      case 'gnaw': gnaw(state, e, i); break;
      case 'brute': brute(state, e, i); break;
      case 'snatch': snatch(state, e, i); break;
    }
    if (state.enemies[i] && !Number.isFinite(state.enemies[i].x)) despawn(state, i);
  }
}

/** The one place an enemy leaves the world. Anything it is carrying leaves with it, on the record. */
function despawn(state, i) {
  const e = state.enemies[i];
  if (!e) return;
  if (e.carrying > 0) { state.ledger.escaped += e.carrying; e.carrying = 0; }
  state.enemies.splice(i, 1);
}

function gnaw(state, e, i) {
  if (e.state === 'bite') {
    const seg = state.segments.find((s) => s.id === e.target);
    if (!seg || !seg.intact || seg.built < 1) { e.state = 'walk'; e.target = null; e.bite = 0; return; }
    e.timer++;
    e.bite = e.timer / RULES.gnaw.bite;          // drives the visible fraying
    // The chew. `audio.sfx.gnawing()` and its 160ms throttle were written for this, `main.mjs`
    // handles the event, and nothing ever emitted it — so four things could be eating your cable
    // at once and the game stayed silent until the snap. At night, outside the monarch's lamp, a
    // gnaw mid-bite is an 8x8 sprite you have to already be looking at; the sound was the answer.
    state.events.push({ type: 'gnawing', x: e.x });
    if (e.timer >= RULES.gnaw.bite) {
      // idempotent: two gnaws finishing on one segment is one cut, one job, one sound
      seg.intact = false; seg.spliced = false; seg.cutX = e.x;
      addJob(state, 'repair', seg.id, e.x);
      state.events.push({ type: 'cable-cut', x: e.x, id: seg.id });
      e.state = 'flee'; e.timer = 0; e.bite = 0;
    }
    return;
  }
  if (e.state === 'flee') {
    e.x += RULES.gnaw.speed * 1.4 * DT;
    if (e.x > RULES.world.end + 260) despawn(state, i);
    return;
  }
  const seg = state.segments.find((s) => s.intact && s.built >= 1 &&
    e.x >= Math.min(s.ax, s.bx) && e.x <= Math.max(s.ax, s.bx));
  if (seg) { e.state = 'bite'; e.target = seg.id; e.timer = 0; return; }

  // No cable anywhere? It is never idle — it goes for the dynamo, more slowly than a brute would.
  if (e.x <= 10) {
    if (++e.timer >= RULES.gnaw.hitPeriod) {
      e.timer = 0;
      hurtDynamo(state, RULES.gnaw.dynamoDamage);
    }
    return;
  }
  e.x -= RULES.gnaw.speed * DT;
  if (e.x < -40) despawn(state, i);
}

function brute(state, e, i) {
  const tower = nearestTowerAhead(state, e.x);
  if (tower && Math.abs(tower.x - e.x) < 13) {
    if (++e.timer >= RULES.brute.hitPeriod) {
      e.timer = 0;
      if (tower.kind === 'dynamo') hurtDynamo(state, RULES.brute.damage);
      else {
        tower.hp -= RULES.brute.damage;
        tower.hitT = 11;
        state.events.push({ type: 'tower-hit', x: tower.x, id: tower.id });
        if (tower.hp <= 0) destroyTower(state, tower);
      }
    }
    return;
  }
  e.x -= RULES.brute.speed * DT;
  if (e.x < -40) despawn(state, i);
}

function snatch(state, e, i) {
  if (e.state === 'flee') {
    e.x += RULES.snatch.speed * 1.3 * DT;
    if (e.x > RULES.world.end + 260) despawn(state, i);
    return;
  }
  const d = state.monarch.x - e.x;
  if (Math.abs(d) < 10) {
    // It robs you. It cannot end the run: losing to a mugging, in a game whose only skill is
    // movement, is the least fair ending available. The dynamo is the real stake.
    const took = Math.min(RULES.snatch.steal, state.spark);
    if (took > 0) {
      state.spark -= took;          // still in the world, just in worse hands
      e.carrying = took;
      state.events.push({ type: 'robbed', amount: took, x: e.x });
    } else {
      state.events.push({ type: 'robbed-nothing', x: e.x });
    }
    e.state = 'flee';
    return;
  }
  e.x += Math.sign(d) * RULES.snatch.speed * DT;
}

function hurtDynamo(state, n) {
  state.dynamoHp = Math.max(0, state.dynamoHp - n);
  state.towers[0].hp = state.dynamoHp;
  state.towers[0].hitT = 11;
  state.events.push({ type: 'dynamo-hit', x: 0, left: state.dynamoHp });
}

/** Removes everything that died this tick, after every source of damage has been applied. */
function reapDead(state) {
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const e = state.enemies[i];
    if (e.hp > 0) continue;
    if (e.carrying > 0) { earn(state, e.carrying, e.x, false); e.carrying = 0; }
    state.stats.enemiesKilled++;
    state.events.push({ type: 'enemy-died', x: e.x, kind: e.kind });
    state.enemies.splice(i, 1);
  }
}

function nearestTowerAhead(state, x) {
  let best = null, bestD = Infinity;
  for (const t of state.towers) {
    if (t.built < 1 || t.x > x + 6) continue;      // it walks inward; only what is behind counts
    const d = x - t.x;
    if (d < bestD || (d === bestD && best && t.id < best.id)) { bestD = d; best = t; }
  }
  return best;
}

function destroyTower(state, tower) {
  if (tower.kind === 'dynamo') return;
  if (tower.kind === 'beacon') {
    // stone. It goes cold rather than falling over, so the run can always be rebuilt.
    tower.hp = tower.maxHp; tower.ignited = false; tower.charge = 0; tower.firedOnce = false;
    state.events.push({ type: 'beacon-lost', x: tower.x });
    return;
  }
  const i = state.towers.indexOf(tower);
  if (i < 0) return;
  state.towers.splice(i, 1);
  state.sites.push({ id: state.nextId++, x: tower.x, taken: false });
  state.stats.towersLost++;

  for (let k = state.segments.length - 1; k >= 0; k--) {
    const s = state.segments[k];
    if (s.a === tower.id || s.b === tower.id) {
      for (const j of state.jobs.filter((j) => j.target === s.id)) releaseJob(state, j, true);
      // and anything mid-bite on it goes back to walking, or it chews a segment that is no
      // longer there — the same orphaned-reference bug as a job outliving its target
      for (const e of state.enemies) {
        if (e.target === s.id) { e.target = null; e.state = 'walk'; e.timer = 0; e.bite = 0; }
      }
      state.segments.splice(k, 1);
    }
  }
  for (const u of state.units) {
    if (u.job && !jobStillValid(state, u.job)) u.job = null;
    const ai = tower.archers.indexOf(u.id);
    if (ai >= 0) tower.archers.splice(ai, 1);
  }
  state.events.push({ type: 'tower-fell', x: tower.x });
}

function stepShots(state) {
  for (let i = state.shots.length - 1; i >= 0; i--) {
    const s = state.shots[i];
    if (++s.t < s.dur) continue;
    const prey = state.enemies.find((e) => e.id === s.target);
    if (prey) {
      prey.hp -= RULES.archer.damage;
      prey.flash = 7;
      state.events.push({ type: 'hit', x: prey.x });
    }
    state.shots.splice(i, 1);
  }
}

function stepBeacons(state) {
  let lit = 0;
  for (const t of state.towers) {
    if (t.kind !== 'beacon') continue;
    const on = t.ignited && isLit(t);
    if (on && !t.firedOnce) {
      t.firedOnce = true;
      state.nightsSinceBeacon = 0;
      state.capTier++;
      earn(state, RULES.reward.beacon, t.x);
      state.events.push({ type: 'beacon-fired', x: t.x });
    }
    if (on) lit++;
  }
  state.beaconsLit = lit;
}

function checkEnd(state) {
  if (state.over) return;
  if (state.dynamoHp <= 0) { state.over = 'lose'; state.events.push({ type: 'dynamo-fell' }); return; }
  const beacons = state.towers.filter((t) => t.kind === 'beacon');
  // checked continuously, not only at dawn — you do not lose a won game to a cut one tick later
  if (beacons.length && beacons.every((t) => t.ignited && isLit(t))) {
    state.over = 'win';
    state.events.push({ type: 'win' });
  }
}

// ---------------------------------------------------------------------------------------------
// One button, context-sensitive, exactly as Kingdom does it. `whatIsHere` is also what the UI
// reads to draw the prompt, so the two can never disagree about what pressing it would do.
// ---------------------------------------------------------------------------------------------
export function whatIsHere(state) {
  const mx = state.monarch.x;
  const near = [];
  const offer = (d, r) => { if (d <= r.reach) near.push({ ...r, d }); };

  // A break under your feet is the emergency and always wins, wherever you are standing.
  const cut = state.segments.find((s) => !s.intact && Math.abs((s.cutX ?? (s.ax + s.bx) / 2) - mx) <= 26);
  if (cut) return { kind: 'splice', cost: RULES.cost.splice, target: cut.id, label: 'splice' };

  // Everything else: whatever you are standing CLOSEST to. A fixed priority order meant that
  // standing between a shelter and a build site offered only the shelter, for ever — which left a
  // competent player parked two pixels from the site they wanted, unable to build, with no way to
  // tell why. Nearest-wins is both easier to reason about and impossible to get stuck in.
  for (const sh of state.shelters) {
    if (sh.people > 0) offer(Math.abs(sh.x - mx), { kind: 'hire', cost: RULES.cost.hire, target: sh.id, label: 'hire', reach: 18 });
  }
  const idle = state.units.find((u) => u.kind === 'follower');
  if (idle) offer(Math.abs(16 - mx), { kind: 'tool', cost: RULES.cost.tool, target: idle.id, label: 'tools', reach: 24 });

  for (const t of state.towers) {
    if (t.kind === 'beacon' && !t.ignited)
      offer(Math.abs(t.x - mx), { kind: 'beacon', cost: RULES.cost.beacon, target: t.id, label: 'light it', reach: 24 });
    if (t.kind === 'tower' && t.tier === 1)
      offer(Math.abs(t.x - mx), { kind: 'upgrade', cost: RULES.cost.upgrade, target: t.id, label: 'raise it', reach: 18 });
  }
  for (const site of state.sites) {
    if (!site.taken) offer(Math.abs(site.x - mx), { kind: 'tower', cost: RULES.cost.tower, target: site.id, label: 'tower', reach: 20 });
  }
  const gap = cableGap(state);
  if (gap) {
    const mid = (gap.a.x + gap.b.x) / 2;
    const spans = Math.max(1, Math.round((gap.b.x - gap.a.x) / RULES.cableRun));
    const inside = mx >= gap.a.x - 24 && mx <= gap.b.x + 24;
    if (inside) near.push({ kind: 'cable', cost: RULES.cost.cable * spans, target: gap.b.id,
                            label: 'cable', d: Math.abs(mid - mx) * 0.5 });
  }

  if (!near.length) return null;
  near.sort((a, b) => a.d - b.d || a.kind.localeCompare(b.kind));
  const { d, reach, ...best } = near[0];
  return best;
}

export function interact(state, roleWanted = 'archer') {
  const here = whatIsHere(state);
  if (!here) return { ok: false, why: 'nothing' };
  if (state.spark < here.cost) {
    state.events.push({ type: 'too-poor', x: state.monarch.x });
    return { ok: false, why: 'poor' };
  }

  switch (here.kind) {
    case 'splice': {
      const seg = state.segments.find((s) => s.id === here.target);
      if (!seg || seg.intact) return { ok: false, why: 'gone' };
      pay(state, here.cost, 'splice');
      seg.intact = true; seg.spliced = true;      // holds tonight; fails at the next dusk
      state.stats.cutsSpliced++;
      addJob(state, 'repair', seg.id, seg.cutX ?? (seg.ax + seg.bx) / 2);
      state.events.push({ type: 'spliced', x: seg.cutX ?? state.monarch.x });
      return { ok: true };
    }
    case 'hire': {
      const s = state.shelters.find((s) => s.id === here.target);
      if (!s || s.people <= 0) return { ok: false, why: 'gone' };
      pay(state, here.cost, 'hire');
      s.people--;
      state.units.push({ id: state.nextId++, kind: 'follower', x: s.x, facing: -1, timer: 0,
                         post: 18, slot: state.units.filter((u) => u.kind === 'follower').length + 1,
                         job: null, idleT: 0, wander: null, stuckT: 0 });
      state.events.push({ type: 'hired', x: s.x });
      return { ok: true };
    }
    case 'tool': {
      const u = state.units.find((u) => u.id === here.target);
      if (!u || u.kind !== 'follower') return { ok: false, why: 'gone' };
      pay(state, here.cost, 'tool');
      u.kind = roleWanted;
      u.timer = 0; u.job = null; u.stuckT = 0;
      u.post = roleWanted === 'winder'
        ? 14 + state.units.filter((x) => x.kind === 'winder').length * 8 : 18;
      let n = 1;
      for (const f of state.units) if (f.kind === 'follower') f.slot = n++;
      state.events.push({ type: 'tooled', x: u.x, role: roleWanted });
      return { ok: true, role: roleWanted };
    }
    case 'beacon': {
      const t = state.towers.find((t) => t.id === here.target);
      if (!t || t.ignited) return { ok: false, why: 'gone' };
      pay(state, here.cost, 'beacon');
      t.ignited = true;
      state.events.push({ type: 'beacon-ignited', x: t.x });
      return { ok: true };
    }
    case 'upgrade': {
      const t = state.towers.find((t) => t.id === here.target);
      if (!t || t.tier !== 1) return { ok: false, why: 'gone' };
      pay(state, here.cost, 'upgrade');
      t.tier = 2;
      t.maxHp = RULES.tower.tier[2].hp;
      t.hp = RULES.tower.tier[2].hp;
      state.events.push({ type: 'tower-raised-higher', x: t.x });
      return { ok: true };
    }
    case 'tower': {
      const site = state.sites.find((s) => s.id === here.target);
      if (!site || site.taken) return { ok: false, why: 'gone' };
      pay(state, here.cost, 'tower');
      site.taken = true;
      addJob(state, 'build', site.id, site.x);
      state.events.push({ type: 'tower-ordered', x: site.x });
      return { ok: true };
    }
    case 'cable': {
      const gap = cableGap(state);
      if (!gap || gap.b.id !== here.target) return { ok: false, why: 'gone' };
      pay(state, here.cost, 'cable');
      const seg = { id: state.nextId++, a: gap.a.id, b: gap.b.id, ax: gap.a.x, bx: gap.b.x,
                    built: 0, intact: true, spliced: false, live: false, cutX: null };
      state.segments.push(seg);
      addJob(state, 'cable', seg.id, (gap.a.x + gap.b.x) / 2);
      state.events.push({ type: 'cable-ordered', x: (gap.a.x + gap.b.x) / 2 });
      return { ok: true };
    }
  }
  return { ok: false, why: 'nothing' };
}
