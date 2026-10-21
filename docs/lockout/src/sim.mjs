// The bout. No DOM, no canvas, no audio, no Date.now, no Math.random.
//
// Same discipline as the other two: integer ticks, a pure step, events pushed out for the caller
// to react to. A card game has far less physics to get wrong and far more *rules* to get wrong, so
// the resolution table below is written once, as data, and the code does nothing but read it.

import { makeRng } from './rng.mjs';

export const TPS = 60;
const sec = (s) => Math.round(s * TPS);

export const CARDS = ['attack', 'parry', 'step'];

/**
 * The measure. Four of them, not three.
 *
 * With three, two fencers both stepping forward crossed from out of distance to close in a single
 * turn, so every bout opened in a brawl and the manoeuvring the game is supposed to be about never
 * happened. Four leaves room to be approached without being arrived at.
 */
export const MEASURES = ['out', 'long', 'lunge', 'close'];
export const inDistance = (m) => m >= 2;

export const RULES = {
  target: 5,                      // touches to take the bout
  deck: { attack: 6, parry: 4, step: 5 },
  hand: 3,

  // Non-combativity, which is a real rule and the answer to a real bug: a player who simply
  // retreats for ever can make a bout that never ends, and the stress harness found exactly that.
  // In the sport the referee halts a passive bout and brings both fencers back on guard; here,
  // after this many turns with nobody scoring, the referee closes the distance for you.
  passive: 4,
  // and a hard backstop, because a rule that depends on scoring cannot save a bout where neither
  // side ever can
  maxTurns: 40,

  reveal: sec(0.5),               // both cards face up, before anything resolves
  resolve: sec(1.1),              // lamps, the hit, the step
  settle: sec(0.7),               // back to guard

  // The lockout, drawn rather than simulated: when both land, the second lamp follows the first by
  // this much. It is the one number in the sport everyone knows.
  lockout: sec(0.26),
};

/**
 * What happens, given both cards and whether the distance allows a touch.
 *
 * Written as a table because the rules of a bout are a table. `you` and `foe` are 1 if that side
 * scores. `step` is how the measure changes: -1 opens, +1 closes.
 */
function resolve(mine, theirs, reach, myStep, theirStep, myOpen = false, theirOpen = false) {
  const hit = (c) => c === 'attack' && reach;

  // A parry you are not able to make is not a parry.
  //
  // This is the triangle actually closing. Attack beats step and parry beats attack were always
  // true, but step beat parry only in the design document: parry against step fell through to
  // "nothing happens", and a wasted turn in this game costs nothing at all — no clock, no attrition,
  // the discard reshuffles. So parry weakly dominated step from inside distance, which is 82% of
  // turns, and a player who simply never attacked beat the reference opponent 64% of the time.
  //
  // The fix is the one the sport already uses. A parry that closes on nothing has committed your
  // blade to a line the other fencer was never in, and you cannot find the next one in time. Draw
  // the parry with a step and the parry AFTER it fails. Step beats parry — one exchange later.
  if (myOpen && mine === 'parry') mine = 'open';
  if (theirOpen && theirs === 'parry') theirs = 'open';

  // being open is being open: an attack that reaches you lands
  if (hit(theirs) && mine === 'open') return { you: 0, foe: 1, step: 0, kind: 'open-you' };
  if (hit(mine) && theirs === 'open') return { you: 1, foe: 0, step: 0, kind: 'open-foe' };
  if (mine === 'open') mine = 'parry';            // against anything else it is just a lost turn
  if (theirs === 'open') theirs = 'parry';

  if (mine === 'attack' && theirs === 'attack') {
    return reach
      ? { you: 1, foe: 1, step: 0, kind: 'double' }
      : { you: 0, foe: 0, step: 0, kind: 'short-both' };
  }
  if (mine === 'attack' && theirs === 'parry') {
    return reach ? { you: 0, foe: 1, step: 0, kind: 'riposte-foe' }
                 : { you: 0, foe: 0, step: 0, kind: 'short' };
  }
  if (mine === 'parry' && theirs === 'attack') {
    return reach ? { you: 1, foe: 0, step: 0, kind: 'riposte-you' }
                 : { you: 0, foe: 0, step: 0, kind: 'short' };
  }
  if (hit(mine) && theirs === 'step') return { you: 1, foe: 0, step: theirStep, kind: 'touch-you' };
  if (hit(theirs) && mine === 'step') return { you: 0, foe: 1, step: myStep, kind: 'touch-foe' };

  // the feint: a parry drawn onto nothing, which leaves that fencer open next exchange
  if (mine === 'parry' && theirs === 'step') {
    return { you: 0, foe: 0, step: theirStep, kind: 'drawn-you', opens: 'you' };
  }
  if (mine === 'step' && theirs === 'parry') {
    return { you: 0, foe: 0, step: myStep, kind: 'drawn-foe', opens: 'foe' };
  }

  // nobody landed: steps still move the measure, and two steps in opposite directions cancel
  if (mine === 'step' && theirs === 'step') {
    return { you: 0, foe: 0, step: myStep + theirStep, kind: 'both-move' };
  }
  if (mine === 'step') return { you: 0, foe: 0, step: myStep, kind: 'you-move' };
  if (theirs === 'step') return { you: 0, foe: 0, step: theirStep, kind: 'foe-move' };
  return { you: 0, foe: 0, step: 0, kind: 'nothing' };      // parry against parry
}

function freshDeck(rng) {
  const d = [];
  for (const [card, n] of Object.entries(RULES.deck)) for (let i = 0; i < n; i++) d.push(card);
  return rng.shuffle(d);
}

export function newBout(seed = 1) {
  const rng = makeRng(seed);
  const state = {
    seed, rng,
    tick: 0,
    phase: 'choose', phaseT: 0,
    measure: 0,                                    // index into MEASURES
    // `open` is set by a parry that caught nothing and lasts exactly one exchange
    you: { score: 0, deck: freshDeck(rng), hand: [], discard: [], card: null, step: 1, open: false },
    foe: { score: 0, deck: freshDeck(rng), hand: [], discard: [], card: null, step: 1, open: false },
    last: null,
    turns: 0,
    quiet: 0,                                      // turns since anybody scored
    bouts: 0,
    memory: {},                                    // what you have done from each measure
    tell: null,                                    // the opponent's weight shift, if it is attacking
    over: null, overT: 0,
    events: [],
  };
  refill(state.you);
  refill(state.foe);
  return state;
}

function refill(side) {
  while (side.hand.length < RULES.hand) {
    if (!side.deck.length) {
      side.deck = side.discard;
      side.discard = [];
      if (!side.deck.length) break;               // cannot happen with 15 cards and a hand of 3
    }
    side.hand.push(side.deck.pop());
  }
}

/** How many of each card are still unseen, which is public information in this game. */
export function remaining(side) {
  const left = { attack: 0, parry: 0, step: 0 };
  for (const c of side.deck) left[c]++;
  return left;
}

// ---------------------------------------------------------------------------------------------
// The opponent. It remembers what you do from each measure and leans toward the answer, so
// repeating yourself is punished — and the way to beat it is to notice that it noticed.
// ---------------------------------------------------------------------------------------------
function chooseFoe(state) {
  const foe = state.foe;
  const m = state.measure;
  const mem = state.memory[m] ?? { attack: 0, parry: 0, step: 0 };
  const playable = [...new Set(foe.hand)];

  const score = (card) => {
    let s = state.rng.range(0, 0.9);               // never fully deterministic
    const reach = inDistance(m);
    if (card === 'attack') {
      s += reach ? 2.2 : -2.0;
      s -= mem.parry * 1.1;                        // they have been parrying: do not walk into it
      s += mem.step * 0.7;                         // they have been stepping: punish it
      if (foe.score === RULES.target - 1 && state.you.score === RULES.target - 1) s += 1.4;
    }
    if (card === 'parry') {
      s += reach ? 0.6 : -1.4;
      s += mem.attack * 1.3;                       // they attack from here: be ready
      s -= mem.step * 0.5;
    }
    if (card === 'step') {
      s += reach ? -0.2 : 1.6;                     // out of distance, closing is the whole job
      s += mem.parry * 0.6;
      // behind on touches, it wants to be close; ahead, it is content to wait
      if (foe.score < state.you.score) s += 0.4;
    }
    return s;
  };

  playable.sort((a, b) => score(b) - score(a));
  return playable[0] ?? foe.hand[0];
}

/** Which way the opponent would move, if it moves. Closing unless it is already close. */
function foeStep(state) {
  if (state.measure >= MEASURES.length - 1) return -1;
  if (state.foe.score > state.you.score && state.measure === 1) return -1;   // content to open up
  return 1;
}

// ---------------------------------------------------------------------------------------------
export function play(state, card, dir = 1) {
  if (state.phase !== 'choose' || state.over) return { ok: false };
  const you = state.you;
  const i = you.hand.indexOf(card);
  if (i < 0) return { ok: false, why: 'not in hand' };

  you.card = card;
  you.step = dir;
  you.hand.splice(i, 1);

  // the decision the tell was drawn from, not a fresh one
  state.foe.card = state.foe.intent ?? chooseFoe(state);
  state.foe.intent = null;
  state.foe.step = foeStep(state);
  const fi = state.foe.hand.indexOf(state.foe.card);
  if (fi >= 0) state.foe.hand.splice(fi, 1);

  // remember what you did from here, for next time
  const m = state.measure;
  state.memory[m] = state.memory[m] ?? { attack: 0, parry: 0, step: 0 };
  // Decay, so the opponent's read of you is of what you have been doing LATELY. The counters only
  // ever went up, so three parries in the opening drove its model negative for the rest of the
  // bout and nothing you did afterwards could move it — which made a fixed strategy safe.
  for (const k of CARDS) state.memory[m][k] *= 0.82;
  state.memory[m][card] += 1;

  state.turns++;
  state.phase = 'reveal';
  state.phaseT = 0;
  state.tell = null;
  state.events.push({ type: 'reveal', you: card, foe: state.foe.card });
  return { ok: true };
}

export function step(state) {
  state.tick++;
  if (state.over) { state.overT++; return state; }
  state.phaseT++;

  switch (state.phase) {
    case 'choose':
      // The tell: a fencer shifts their weight before they go.
      //
      // Three things were wrong with it. It was gated on half a second of thinking, so below 24
      // ticks you got nothing and at 25 you got an oracle — a cliff, not a tell, and worth 28
      // points of win rate for the single act of pausing. It was computed from a THROWAWAY call to
      // chooseFoe, so it was not forecasting the decision the game would actually make, it was
      // making a different one and being right 97% of the time by luck of the score gaps. And it
      // was never exercised by any harness, which is how all of that survived 2000 bouts.
      //
      // It is now decided once, on the first tick, from the opponent's real committed choice, and
      // it lies: it shows on most attacks and on some things that are not attacks. A tell you can
      // trust completely is not a tell, it is a scoreboard.
      if (state.tell === null) {
        state.foe.intent = chooseFoe(state);
        const attacking = state.foe.intent === 'attack' && inDistance(state.measure);
        const show = attacking ? state.rng.next() < 0.72 : state.rng.next() < 0.16;
        state.tell = show ? 'weight' : 'none';
        if (show) state.events.push({ type: 'tell' });
      }
      break;

    case 'reveal':
      if (state.phaseT >= RULES.reveal) {
        const wasOpen = { you: state.you.open, foe: state.foe.open };
        const r = resolve(state.you.card, state.foe.card, inDistance(state.measure),
                          state.you.step, state.foe.step, wasOpen.you, wasOpen.foe);
        state.last = r;
        // being open lasts one exchange, and a new one can be opened by this exchange
        state.you.open = r.opens === 'you';
        state.foe.open = r.opens === 'foe';
        state.measure = Math.max(0, Math.min(MEASURES.length - 1, state.measure + r.step));
        state.you.score += r.you;
        state.foe.score += r.foe;
        state.phase = 'resolve';
        state.phaseT = 0;

        // the referee's call
        // The referee only resets the clock when the referee actually intervenes. It used to zero
        // `quiet` whether or not the `measure < 2` branch fired, so a parry-against-parry stall
        // from inside distance — exactly where a real referee steps in — reset the count every
        // four turns and was never called at all.
        state.quiet = (r.you || r.foe) ? 0 : state.quiet + 1;
        if (state.quiet >= RULES.passive && !state.over) {
          if (state.measure < 2) { state.measure = 2; state.events.push({ type: 'passivity' }); }
          else { state.events.push({ type: 'passivity' }); }
          state.quiet = 0;
        }
        state.events.push({ type: 'result', ...r, measure: state.measure });
        if (r.you && r.foe) state.events.push({ type: 'double' });
        else if (r.you) state.events.push({ type: 'light', side: 'you' });
        else if (r.foe) state.events.push({ type: 'light', side: 'foe' });
        else state.events.push({ type: 'nothing', kind: r.kind });
      }
      break;

    case 'resolve':
      if (state.phaseT >= RULES.resolve) {
        state.phase = 'settle';
        state.phaseT = 0;
      }
      break;

    case 'settle':
      if (state.phaseT >= RULES.settle) {
        state.you.discard.push(state.you.card);
        state.foe.discard.push(state.foe.card);
        state.you.card = null;
        state.foe.card = null;
        refill(state.you);
        refill(state.foe);
        state.phase = 'choose';
        state.phaseT = 0;

        const done = state.you.score >= RULES.target || state.foe.score >= RULES.target
                  || state.turns >= RULES.maxTurns;
        if (done) {
          state.over = state.you.score > state.foe.score ? 'win'
                     : state.foe.score > state.you.score ? 'lose' : 'double-out';
          state.timeout = state.turns >= RULES.maxTurns &&
                          state.you.score < RULES.target && state.foe.score < RULES.target;
          state.events.push({ type: 'over', how: state.over, timeout: state.timeout });
        }
      }
      break;
  }
  return state;
}

export const measureName = (state) => MEASURES[state.measure];
