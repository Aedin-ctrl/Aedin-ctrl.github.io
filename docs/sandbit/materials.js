// Material ids, mirroring src/mat.rs (main.js checks the count matches).
export const M = {
  EMPTY: 0, WALL: 1, SAND: 2, WATER: 3, STONE: 4, WOOD: 5, FIRE: 6, SMOKE: 7, STEAM: 8,
  LAVA: 9, OIL: 10, ACID: 11, ICE: 12, GUNPOWDER: 13, PLANT: 14, GLASS: 15, METAL: 16,
  ASH: 17, SNOW: 18, GAS: 19, TAP: 20, DRAIN: 21, BATTERY: 22, RUBBER: 23, NITRO: 24, THERMITE: 25, CLONE: 26,
};
export const MAT_COUNT = 27;

// What the palette shows, in order. `solid` ones can be made into objects.
export const PALETTE = [
  { id: M.SAND, name: 'Sand', key: '1', tip: 'Piles up, sinks in water, melts into glass in lava.' },
  { id: M.WATER, name: 'Water', key: '2', tip: 'Flows and levels out. Puts out fire, hardens lava into stone, conducts electricity.' },
  { id: M.STONE, name: 'Stone', key: '3', solid: true, tip: 'Solid. Acid eats it slowly.' },
  { id: M.WOOD, name: 'Wood', key: '4', solid: true, tip: 'Solid and flammable. Floats as an object.' },
  { id: M.FIRE, name: 'Fire', key: '5', tip: 'Spreads to anything flammable.' },
  { id: M.LAVA, name: 'Lava', key: '6', tip: 'Thick, hot liquid. Ignites, melts ice, turns sand to glass.' },
  { id: M.OIL, name: 'Oil', key: '7', tip: 'Floats on water and burns for a long time.' },
  { id: M.ACID, name: 'Acid', key: '8', tip: 'Dissolves almost anything it touches, using itself up.' },
  { id: M.GUNPOWDER, name: 'Powder', key: '9', tip: 'Gunpowder. Explodes when it catches fire.' },
  { id: M.ICE, name: 'Ice', key: '0', solid: true, tip: 'Freezes nearby water a little. Melts near heat. Slippery.' },
  { id: M.PLANT, name: 'Plant', solid: true, tip: 'Grows by drinking water it touches. Burns fast.' },
  { id: M.METAL, name: 'Metal', solid: true, tip: 'Heavy, blast-proof, conducts electricity. Sinks in everything.' },
  { id: M.GLASS, name: 'Glass', solid: true, tip: 'Acid-proof and see-through. Shatters in explosions.' },
  { id: M.RUBBER, name: 'Rubber', solid: true, tip: 'Bouncy and grippy. Try a rubber ball.' },
  { id: M.NITRO, name: 'Nitro', tip: 'Liquid explosive. Goes off when lit, or when it lands hard after a fall.' },
  { id: M.THERMITE, name: 'Thermite', tip: 'Burns very hot for a long time, melting metal and stone into lava. Water cannot put it out.' },
  { id: M.SNOW, name: 'Snow', tip: 'Light powder that piles steeply and melts near heat.' },
  { id: M.GAS, name: 'Gas', tip: 'Flammable gas that drifts up. One spark sets it all off.' },
  { id: M.STEAM, name: 'Steam', tip: 'Rises and condenses back into water droplets.' },
  { id: M.SMOKE, name: 'Smoke', tip: 'Rises and fades away.' },
  { id: M.ASH, name: 'Ash', tip: 'What burnt wood leaves behind.' },
  { id: M.WALL, name: 'Wall', solid: true, tip: 'Indestructible.' },
  { id: M.DRAIN, name: 'Drain', tip: 'Swallows anything loose that touches it.' },
  { id: M.TAP, name: 'Spout', tip: 'Pours out the last loose material you picked (water by default).' },
  { id: M.CLONE, name: 'Clone', tip: 'Copies the first loose thing that touches it, then makes more of it forever.' },
  { id: M.BATTERY, name: 'Battery', tip: 'Pulses electricity into metal or water touching it. Sparks set off powder and gas.' },
];

export const LOOSE = new Set([M.SAND, M.WATER, M.LAVA, M.OIL, M.ACID, M.GUNPOWDER, M.SNOW, M.GAS, M.STEAM, M.SMOKE, M.ASH, M.FIRE, M.NITRO, M.THERMITE]);
export const SOLID = new Set(PALETTE.filter(p => p.solid).map(p => p.id));
export const NAME = Object.fromEntries(PALETTE.map(p => [p.id, p.name]));
