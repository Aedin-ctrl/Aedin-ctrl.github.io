// What must be true at the end of every tick.
//
// A card game has almost no physics to get wrong and a great deal of BOOKKEEPING to get wrong, and
// bookkeeping errors are silent: a card that quietly ceases to exist, a hand that refills from
// nowhere, a score that creeps past the target. None of it throws.

import { RULES, MEASURES, CARDS } from './sim.mjs';

const DECK_SIZE = Object.values(RULES.deck).reduce((a, b) => a + b, 0);

export function checkInvariants(state) {
  const bad = [];
  const say = (c, m) => { if (!c) bad.push(m); };

  say(Number.isInteger(state.tick) && state.tick >= 0, `tick is ${state.tick}`);
  say(['choose', 'reveal', 'resolve', 'settle'].includes(state.phase), `phase ${state.phase}`);
  say(state.phaseT >= 0, `phaseT ${state.phaseT}`);
  say(Number.isInteger(state.measure) && state.measure >= 0 && state.measure < MEASURES.length,
      `measure ${state.measure}`);

  for (const [name, side] of [['you', state.you], ['foe', state.foe]]) {
    // Every card ever dealt is still somewhere. This is the whole invariant for a card game: the
    // deck is a closed system and the only way to notice it leaking is to count it.
    const all = [...side.deck, ...side.hand, ...side.discard, ...(side.card ? [side.card] : [])];
    say(all.length === DECK_SIZE,
        `${name} has ${all.length} cards, should always have ${DECK_SIZE}`);
    const count = Object.fromEntries(CARDS.map((c) => [c, 0]));
    for (const c of all) {
      say(CARDS.includes(c), `${name} holds an unknown card "${c}"`);
      if (count[c] !== undefined) count[c]++;
    }
    for (const c of CARDS) {
      say(count[c] === RULES.deck[c],
          `${name} has ${count[c]} ${c} cards, dealt with ${RULES.deck[c]}`);
    }

    say(side.hand.length <= RULES.hand, `${name} holds ${side.hand.length} cards in hand`);
    say(state.phase !== 'choose' || side.hand.length === RULES.hand || all.length < RULES.hand,
        `${name} is choosing from ${side.hand.length} cards`);
    say(Number.isInteger(side.score) && side.score >= 0, `${name} score ${side.score}`);
    say(side.score <= RULES.target, `${name} score ${side.score} past the target ${RULES.target}`);
    say(side.step === 1 || side.step === -1, `${name} step direction ${side.step}`);
    // a card is only in play between the reveal and the settle
    say(state.phase === 'choose' ? side.card === null : true,
        `${name} still has a card in play while choosing`);
    // Being open is a one-exchange state, so it is a boolean and never anything else. If it ever
    // became a counter that someone forgot to clear, a fencer would be permanently unable to
    // parry and the game would still look like it was working.
    say(side.open === true || side.open === false, `${name} open flag is ${side.open}`);
  }

  // both fencers open at once would mean two parries were drawn onto nothing in one exchange,
  // which `resolve` has no path to
  say(!(state.you.open && state.foe.open), 'both fencers open at the same time');
  say(['win', 'lose', 'double-out', null].includes(state.over), `over is ${state.over}`);
  say(state.turns <= RULES.maxTurns, `${state.turns} turns, past the limit of ${RULES.maxTurns}`);
  say(state.quiet <= RULES.passive, `${state.quiet} quiet turns, past the passivity rule`);
  if (state.over) {
    say(state.you.score >= RULES.target || state.foe.score >= RULES.target ||
        state.turns >= RULES.maxTurns,
        'the bout ended with nobody on the target and time left');
  }
  return bad;
}
