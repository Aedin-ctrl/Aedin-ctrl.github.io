// Recognised label → archetype → animator. Labels are Quick, Draw! category names.
import { Jelly } from './jelly.js';
import { Swim, Slither } from './swim.js';
import { Walk } from './walk.js';
import { Fly } from './fly.js';
import { Drive } from './drive.js';
import { Sway, Float, Hop, Roll, Fire } from './still.js';

export const ARCHETYPE = {
  swim: ['fish', 'shark', 'whale', 'dolphin', 'octopus', 'submarine', 'mermaid', 'crab', 'lobster', 'sea turtle'],
  fly: ['bird', 'butterfly', 'bee', 'mosquito', 'bat', 'dragon', 'owl', 'parrot', 'duck', 'swan', 'flamingo', 'airplane', 'helicopter', 'angel', 'flying saucer'],
  walk: ['cat', 'dog', 'horse', 'cow', 'pig', 'sheep', 'lion', 'tiger', 'elephant', 'giraffe', 'zebra', 'camel', 'bear', 'panda', 'raccoon', 'monkey', 'mouse', 'squirrel', 'hedgehog', 'rhinoceros', 'crocodile', 'spider', 'ant', 'scorpion', 'teddy-bear', 'penguin', 'snowman', 'yoga'],
  slither: ['snake', 'snail'],
  hop: ['frog', 'rabbit', 'kangaroo'],
  drive: ['car', 'bus', 'truck', 'pickup truck', 'police car', 'firetruck', 'ambulance', 'van', 'school bus', 'tractor', 'bicycle', 'motorbike', 'train', 'skateboard', 'bulldozer'],
  sway: ['flower', 'tree', 'palm tree', 'house plant', 'cactus', 'grass', 'leaf', 'mushroom', 'bush'],
  float: ['cloud', 'sun', 'moon', 'star', 'hot air balloon', 'lightning', 'rain'],
  roll: ['basketball', 'soccer ball', 'donut'],
  fire: ['campfire'],
};
// What the classifier may answer: everything we animate, plus a few common non-creature doodles
// (decoys) so a house or a smiley isn't forced into the nearest animal; those become jellies.
export const DECOYS = ['house', 'smiley face', 'circle', 'square', 'face', 'cup', 'apple', 'ice cream', 'pizza', 'cake', 'hat', 'umbrella', 'light bulb', 'key', 'book', 'eye', 'hand'];
export const archetypeOf = (label) => Object.keys(ARCHETYPE).find((k) => ARCHETYPE[k].includes(label)) || null;

export function makeCreature(strokes, opts) {
  const c = make(strokes, opts);
  c.archetype = c.constructor.name === 'Jelly' ? 'jelly' : (opts.world.forceArchetype || (opts.guess && archetypeOf(opts.guess.label)) || 'jelly');
  return c;
}
function make(strokes, { color, world, guess }) {
  const forced = world.forceArchetype;
  const arch = forced || (guess && guess.confidence >= 0.45 ? (guess.archetype !== 'other' ? guess.archetype : null) : null);
  const label = forced ? forced : guess?.label ?? null;
  const o = { color, world, label: arch ? label : null };
  switch (arch) {
    case 'swim': return new Swim(strokes, o);
    case 'slither': return new Slither(strokes, o);
    case 'walk': return new Walk(strokes, o);
    case 'fly': return new Fly(strokes, o);
    case 'drive': return new Drive(strokes, o);
    case 'hop': return new Hop(strokes, o);
    case 'sway': return new Sway(strokes, o);
    case 'roll': return new Roll(strokes, o);
    case 'fire': return new Fire(strokes, o);
    case 'float': return new Float(strokes, { ...o, kind: ['cloud', 'rain'].includes(label) ? 'cloud' : label === 'sun' ? 'sun' : label === 'ghost' ? 'ghost' : 'float' });
    default: return new Jelly(strokes, { color, world, label: guess && guess.archetype === 'other' && guess.p > 0.4 ? guess.label : null });
  }
}
