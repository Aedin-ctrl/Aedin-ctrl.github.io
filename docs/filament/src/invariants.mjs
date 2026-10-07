// What must be true at the end of every tick.
//
// The dangerous failure in this game is not a crash. It is a lineman stuck in "walk to job"
// forever, a job owned by a unit that no longer exists, a gnaw at x = NaN that never arrives and
// never despawns — a game that is quietly unwinnable with nothing in the console.
//
// So the checks below are mostly watchdogs rather than assertions about correctness. The three
// that earn their place over all the others, if only three could stay:
//
//   * time-in-state      — catches every soft-lock, which is the whole bug class that matters
//   * job <-> owner      — catches the double-claim and the orphan, which cause the soft-locks
//   * the spark ledger   — catches every double-spend, missing refund and vanished coin at once
//
// Dev build only. Shipped, this never runs.

import { RULES, TPS, satchelCap, ledgerBalance, referenceFed, isLit, slotsOf } from './sim.mjs';

const LIMIT = {
  units: 80, enemies: RULES.maxEnemies + 4, segments: 120, jobs: 120, shots: 60, towers: 80,
};

// A walk has to finish eventually: the world is 2600 wide and the slowest walker does 44 px/s, so
// a full traverse is about a minute. Anything still trying to ARRIVE after two minutes is stuck,
// not slow. The counter measures failure to arrive, never time alive — a winder that has cranked
// happily for ten minutes is working, and an earlier version of this check called that a bug.
const MAX_STUCK = TPS * 120;
const MAX_STATE_TICKS = { gnaw: TPS * 200, brute: TPS * 260, snatch: TPS * 200 };

export function checkInvariants(state) {
  const bad = [];
  const say = (cond, msg) => { if (!cond) bad.push(msg); };

  // --- numbers ------------------------------------------------------------------------------
  say(Number.isInteger(state.tick) && state.tick >= 0, `tick is ${state.tick}`);
  for (const [name, n] of [['spark', state.spark], ['dynamoHp', state.dynamoHp],
                           ['beaconsLit', state.beaconsLit], ['phaseT', state.phaseT]]) {
    say(Number.isFinite(n), `${name} is ${n}`);
  }
  say(Number.isInteger(state.spark), `spark is fractional: ${state.spark}`);
  say(state.spark >= 0, `spark went negative: ${state.spark}`);
  say(state.spark <= satchelCap(state), `spark ${state.spark} over cap ${satchelCap(state)}`);
  say(state.capTier >= state.beaconsLit, `capTier ${state.capTier} below beaconsLit ${state.beaconsLit}`);
  say(Number.isFinite(state.monarch.x) && Number.isFinite(state.monarch.vx), 'monarch has a NaN');
  say(state.monarch.x >= 0 && state.monarch.x <= RULES.world.end + 121,
      `monarch left the world at ${state.monarch.x}`);

  // --- the ledger. One line, and it audits the entire economy. --------------------------------
  say(ledgerBalance(state) === 0,
      `spark ledger off by ${ledgerBalance(state)} ` +
      `(minted ${state.ledger.minted} spent ${state.ledger.spent} cap ${state.ledger.lostToCap} ` +
      `escaped ${state.ledger.escaped} held ${state.spark})`);

  // --- identity -------------------------------------------------------------------------------
  const ids = new Set();
  for (const list of [state.towers, state.segments, state.sites, state.shelters,
                      state.units, state.enemies, state.shots, state.jobs]) {
    say(Array.isArray(list), 'a collection stopped being an array');
    for (const o of list) {
      say(Number.isInteger(o.id), `id ${o.id} is not an integer`);
      say(!ids.has(o.id), `duplicate id ${o.id}`);
      ids.add(o.id);
      say(o.id < state.nextId, `id ${o.id} >= nextId ${state.nextId}`);
    }
  }

  // --- population bounds, which catch a leak long before it is visible ------------------------
  for (const [k, max] of Object.entries(LIMIT)) {
    say(state[k].length <= max, `${state[k].length} ${k}, limit ${max}`);
  }

  // --- the crew --------------------------------------------------------------------------------
  const unitById = new Map(state.units.map((u) => [u.id, u]));
  for (const u of state.units) {
    say(['follower', 'winder', 'lineman', 'archer'].includes(u.kind), `unit kind ${u.kind}`);
    say(Number.isFinite(u.x), `unit ${u.id} x is ${u.x}`);
    say(u.x >= -80 && u.x <= RULES.world.end + 200, `unit ${u.id} left the world at ${u.x}`);
    say(Number.isFinite(u.timer) && u.timer >= 0, `unit ${u.id} timer ${u.timer}`);
    say((u.stuckT || 0) <= MAX_STUCK,
        `${u.kind} ${u.id} has been trying to reach somewhere for ${((u.stuckT || 0) / TPS) | 0}s — soft-lock`);
    if (u.job) {
      say(state.jobs.includes(u.job), `unit ${u.id} holds a job not in the queue`);
      say(u.job.owner === u.id, `unit ${u.id} holds job ${u.job.id} owned by ${u.job.owner}`);
    }
  }

  // --- jobs: bidirectional, unique owner, unique target ----------------------------------------
  const owners = new Set(), targets = new Set();
  for (const j of state.jobs) {
    say(['build', 'cable', 'repair'].includes(j.kind), `job kind ${j.kind}`);
    say(Number.isFinite(j.x), `job ${j.id} x is ${j.x}`);
    if (j.owner !== null) {
      const u = unitById.get(j.owner);
      say(!!u, `job ${j.id} owned by missing unit ${j.owner}`);
      say(!u || u.job === j, `job ${j.id} owner ${j.owner} is not holding it back`);
      say(!owners.has(j.owner), `unit ${j.owner} owns two jobs`);
      owners.add(j.owner);
    }
    const key = `${j.kind}:${j.target}`;
    say(!targets.has(key), `two ${j.kind} jobs for target ${j.target}`);
    targets.add(key);
  }

  // --- the dark ---------------------------------------------------------------------------------
  for (const e of state.enemies) {
    say(['gnaw', 'brute', 'snatch'].includes(e.kind), `enemy kind ${e.kind}`);
    say(Number.isFinite(e.x), `enemy ${e.id} x is ${e.x}`);
    say(e.hp > 0, `enemy ${e.id} is alive at ${e.hp} hp`);
    say(Number.isInteger(e.carrying) && e.carrying >= 0, `enemy ${e.id} carrying ${e.carrying}`);
    say(e.stateT <= MAX_STATE_TICKS[e.kind],
        `${e.kind} ${e.id} has been in one state ${(e.stateT / TPS) | 0}s — soft-lock`);
    if (e.kind === 'gnaw' && e.state === 'bite') {
      say(state.segments.some((s) => s.id === e.target),
          `gnaw ${e.id} is biting segment ${e.target}, which does not exist`);
    }
  }
  say(state.phase === 'night' || state.enemies.length === 0,
      `${state.enemies.length} enemies alive in ${state.phase}`);

  // --- the circuit ------------------------------------------------------------------------------
  const towerById = new Map(state.towers.map((t) => [t.id, t]));
  const seen = new Set();
  for (const s of state.segments) {
    say(s.a !== s.b, `segment ${s.id} connects a tower to itself`);
    say(towerById.has(s.a), `segment ${s.id} end A points at missing tower ${s.a}`);
    say(towerById.has(s.b), `segment ${s.id} end B points at missing tower ${s.b}`);
    const key = s.a < s.b ? `${s.a}-${s.b}` : `${s.b}-${s.a}`;
    say(!seen.has(key), `two segments between the same pair of towers (${key})`);
    seen.add(key);
    say(Number.isFinite(s.ax) && Number.isFinite(s.bx), `segment ${s.id} has a NaN endpoint`);
    say(!(s.spliced && !s.intact), `segment ${s.id} is spliced AND cut`);
  }

  // the independent, deliberately stupid reference solve must agree, every tick
  for (const t of state.towers) {
    say(t.fed === referenceFed(state, t),
        `tower ${t.id} at ${t.x | 0}: solve says fed=${t.fed}, reference says ${!t.fed}`);
    say(Number.isFinite(t.charge) && t.charge >= 0 && t.charge <= RULES.capacitor.hold,
        `tower ${t.id} charge ${t.charge}`);
    say(t.hp <= t.maxHp, `tower ${t.id} hp ${t.hp} over max ${t.maxHp}`);
    // pure render state, and it was stuck on forever because nothing decremented it
    say(Number.isFinite(t.hitT) && t.hitT >= 0 && t.hitT <= 12,
        `tower ${t.id} hit flash stuck at ${t.hitT}`);
    const slots = slotsOf(t);
    say(t.archers.length <= slots, `tower ${t.id} has ${t.archers.length} archers in ${slots} slots`);
    say(new Set(t.archers).size === t.archers.length, `tower ${t.id} lists an archer twice`);
    for (const aid of t.archers) {
      const a = unitById.get(aid);
      say(!!a && a.kind === 'archer', `tower ${t.id} is manned by missing unit ${aid}`);
    }
    // a cut strands everything beyond it — the rule the whole game rests on
    if (!t.fed && t.kind !== 'dynamo') {
      for (const o of state.towers) {
        if (o.x > t.x) say(!o.fed, `tower ${o.id} is fed through unfed tower ${t.id}`);
      }
    }
  }
  say(state.towers[0] && state.towers[0].fed, 'the dynamo is not fed');

  // The line must always be completable. Every node the circuit can ever use — the dynamo, the
  // beacons, every standing tower and every site still free — has to be within one cable span of
  // its neighbour, or there is a stretch of coast that can never be wired and the run is quietly
  // unwinnable with nothing visibly wrong.
  // A site that has been paid for but not yet raised is still a node in the chain — it has a tower
  // coming. Leaving taken sites out made this fire during every single build.
  const chain = [...state.towers.map((t) => ({ x: t.x, id: t.id })),
                 ...state.sites.map((s) => ({ x: s.x, id: null }))]
    .sort((a, b) => a.x - b.x);
  for (let i = 1; i < chain.length; i++) {
    const a = chain[i - 1], b = chain[i];
    if (b.x > RULES.world.end + 1) break;
    if (b.x - a.x <= RULES.maxSpan + 0.5) continue;
    // a span already wired is allowed to be longer than new cable could reach; what must never
    // happen is a stretch with no segment AND no way to make one
    const wired = a.id !== null && b.id !== null && state.segments.some(
      (s) => (s.a === a.id && s.b === b.id) || (s.a === b.id && s.b === a.id));
    say(wired, `unbridgeable gap of ${(b.x - a.x) | 0}px between ${a.x | 0} and ${b.x | 0} — ` +
               `cable spans at most ${RULES.maxSpan | 0} and nothing is wired across it`);
  }
  say(state.beaconsLit === state.towers.filter((t) => t.kind === 'beacon' && t.ignited && isLit(t)).length,
      'beaconsLit disagrees with the beacons');

  // nothing the player can press the button on may sit on top of anything else they can press the
  // button on, or the nearer one hides the other for ever
  for (const sh of state.shelters) {
    for (const site of state.sites) {
      say(Math.abs(sh.x - site.x) >= 20,
          `shelter at ${sh.x | 0} overlaps build site at ${site.x | 0} — one can never be chosen`);
    }
  }

  // --- phase -------------------------------------------------------------------------------------
  say(['day', 'dusk', 'night', 'dawn'].includes(state.phase), `phase ${state.phase}`);
  say(state.phaseT >= 0, `phaseT ${state.phaseT}`);
  if (state.phase === 'night') {
    say(state.nightLen > 0, 'night with no sampled length');
    say(state.wave.spent <= state.wave.budget,
        `wave spent ${state.wave.spent} over budget ${state.wave.budget}`);
  }
  say(!(state.over === 'win' && state.dynamoHp <= 0), 'won and lost at the same time');

  return bad;
}
