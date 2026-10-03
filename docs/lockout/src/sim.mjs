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
function resolve(mine, theirs, reach, myStep, theirStep) {
  const hit = (c) => c === 'attack' && reach;

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
    you: { score: 0, deck: freshDeck(rng), hand: [], discard: [], card: null, step: 1 },
    foe: { score: 0, deck: freshDeck(rng), hand: [], discard: [], card: null, step: 1 },
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

  state.foe.card = chooseFoe(state);
  state.foe.step = foeStep(state);
  const fi = state.foe.hand.indexOf(state.foe.card);
  if (fi >= 0) state.foe.hand.splice(fi, 1);

  // remember what you did from here, for next time
  const m = state.measure;
  state.memory[m] = state.memory[m] ?? { attack: 0, parry: 0, step: 0 };
  state.memory[m][card]++;

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
      // the tell: a fencer shifts their weight before they go
      if (state.tell === null && state.phaseT > sec(0.4)) {
        const would = chooseFoe(state);
        state.tell = would === 'attack' && inDistance(state.measure) ? 'weight' : 'none';
        if (state.tell === 'weight') state.events.push({ type: 'tell' });
      }
      break;

    case 'reveal':
      if (state.phaseT >= RULES.reveal) {
        const r = resolve(state.you.card, state.foe.card, inDistance(state.measure),
                          state.you.step, state.foe.step);
        state.last = r;
        state.measure = Math.max(0, Math.min(MEASURES.length - 1, state.measure + r.step));
        state.you.score += r.you;
        state.foe.score += r.foe;
        state.phase = 'resolve';
        state.phaseT = 0;

        // the referee's call
        state.quiet = (r.you || r.foe) ? 0 : state.quiet + 1;
        if (state.quiet >= RULES.passive && !state.over) {
          state.quiet = 0;
          if (state.measure < 2) {
            state.measure = 2;
            state.events.push({ type: 'passivity' });
          }
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
