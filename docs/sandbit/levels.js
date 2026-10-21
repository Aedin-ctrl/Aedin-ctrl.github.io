// Mini challenges, plus the demo scene the sandbox opens with.
//
// A level builds its world through `api` (see main.js), lists the tools and
// materials the player may use, and reports progress from `goal` as
// { p: 0..1, text }. Holding p >= 1 for `hold` frames wins. `budget` is
// how many cells the player may paint; stars go to thrifty solutions.
// Coordinates are cells in the 480 x 270 world, y pointing down.
import { M } from './materials.js';

const W = 480, H = 270;

/** What levels (and the demo) build worlds with. `sim` is a Sim from sim.js. */
export function makeApi(sim){
  return {
    W, H, M, sim,
    rect: (x0, y0, x1, y1, m, extra = 0) => sim.rect(x0, y0, x1, y1, m, extra),
    disc: (x, y, r, m) => sim.paint(x, y, r, m, 1, 0),
    line: (x0, y0, x1, y1, r, m) => sim.line(x0, y0, x1, y1, r, m, 1, 0),
    tap: (x, y, m) => sim.rect(x, y, x, y, M.TAP, m),
    body: (shape, m, x, y, size, angle = 0, tag = 0) => {
      const id = sim.spawn(shape, m, x, y, size, angle);
      if(tag) sim.tag(id, tag);
      return id;
    },
    /** A custom rigid body made of rectangles [x0, y0, x1, y1] of material m. */
    object: (m, rects, tag = 0) => {
      let b = [Infinity, Infinity, -Infinity, -Infinity];
      for(const [x0, y0, x1, y1] of rects){
        for(let y = y0; y <= y1; y++) for(let x = x0; x <= x1; x++) sim.paint(x, y, 0, m, 3, 0);
        b = [Math.min(b[0], x0), Math.min(b[1], y0), Math.max(b[2], x1), Math.max(b[3], y1)];
      }
      const id = sim.markedToBody(b[0], b[1], b[2], b[3]);
      if(tag) sim.tag(id, tag);
      return id;
    },
    pin: (x, y, motor = 0) => sim.pin(x, y, motor),
    rope: (x0, y0, x1, y1, m, thick = 2) => sim.rope(x0, y0, x1, y1, m, thick),
    count: (m, x0, y0, x1, y1) => sim.count(m, x0, y0, x1, y1),
    tagged: t => sim.tagged(t),
  };
}

function ground(api, top = 262, m = M.WALL){
  api.rect(0, top, W - 1, H - 1, m);
}
function cup(api, x0, y0, x1, y1, m = M.STONE, t = 3){
  api.rect(x0, y0, x0 + t, y1, m);
  api.rect(x1 - t, y0, x1, y1, m);
  api.rect(x0, y1 - t, x1, y1, m);
}

export function demo(api){
  const { rect, disc, line, tap, body, rope } = api;
  ground(api);
  // Hills and a sand dune on the left, with a little plant patch.
  disc(60, 300, 70, M.STONE);
  for(let x = 0; x < 150; x += 3) line(x, 262, x, 262 - Math.round(40 * Math.exp(-((x - 70) ** 2) / 1800)), 1, M.SAND);
  rect(30, 212, 44, 216, M.PLANT);
  // A pool in a stone basin with a few floating things.
  cup(api, 170, 200, 300, 261);
  rect(174, 216, 296, 257, M.WATER);
  body(0, M.WOOD, 205, 208, 12, 0.1);
  body(2, M.WOOD, 250, 211, 6, -0.05);
  body(1, M.ICE, 280, 205, 9);
  // A spout pouring water down a stone ramp into the pool.
  line(120, 120, 176, 150, 2, M.STONE);
  tap(122, 104, M.WATER); tap(123, 104, M.WATER);
  // Lava pit on the right with a rope bridge across it and a crate on the bridge.
  cup(api, 330, 225, 420, 261);
  rect(334, 236, 416, 257, M.LAVA);
  rect(314, 190, 329, 261, M.STONE);
  rect(421, 190, 436, 261, M.STONE);
  rope(329.5, 192, 420.5, 192, M.METAL, 2);
  body(0, M.WOOD, 372, 170, 10);
  // A stack of crates, a rubber ball to bounce and a metal ball on a ledge.
  for(let k = 0; k < 3; k++) body(0, M.WOOD, 455, 255 - k * 13, 12);
  body(1, M.RUBBER, 100, 40, 10);
  rect(360, 130, 420, 134, M.STONE);
  body(1, M.METAL, 372, 121, 12);
  // A little gunpowder bunker, for the bomb tool.
  rect(440, 150, 474, 154, M.WOOD);
  rect(444, 140, 470, 149, M.GUNPOWDER);
}

/** Ready-made sandbox scenes (MORE > Example scenes). */
export const SCENES = [
  { name: 'Demo', about: 'A bit of everything: water, lava, a rope bridge, crates.', build: demo },
  {
    name: 'Dominoes',
    about: 'A metal ball rolls down the ramp and knocks over a row of wooden dominoes.',
    build(api){
      const { rect, body, object } = api;
      ground(api);
      for(let x = 0; x < 90; x++) rect(x, Math.round(150 + x * 1.1), x, 261, M.STONE);
      // The ball has to hit above each domino's middle, or it kicks the
      // base out and the domino falls back toward it.
      body(1, M.METAL, 14, 146, 16);
      for(let k = 0; k < 16; k++) object(M.WOOD, [[110 + k * 20, 230, 113 + k * 20, 261]]);
      rect(450, 200, 474, 261, M.STONE);
    },
  },
  {
    name: 'Chain reaction',
    about: 'A blob of lava drops onto a gunpowder fuse. Fire runs down wooden posts from shelf to shelf, to a nitro barrel and a gas tank.',
    build(api){
      const { rect } = api;
      ground(api);
      // A blob of lava about to drop onto the start of the fuse.
      rect(26, 30, 32, 34, M.LAVA);
      // Shelves with a line of powder on each, joined by wooden posts.
      const shelf = (x0, x1, y) => { rect(x0, y, x1, y + 2, M.STONE); rect(x0 + 2, y - 2, x1 - 2, y - 1, M.GUNPOWDER); };
      shelf(20, 200, 70);
      rect(196, 71, 199, 108, M.WOOD);
      shelf(120, 320, 110);
      rect(316, 111, 319, 148, M.WOOD);
      shelf(240, 440, 150);
      // A wooden tank of gas sitting on the last shelf's far end.
      rect(380, 70, 382, 147, M.WOOD); rect(440, 70, 442, 147, M.WOOD); rect(380, 68, 442, 69, M.WOOD);
      rect(383, 100, 439, 147, M.GAS);
      // A barrel of nitro sitting on the fuse halfway along the last shelf.
      cup(api, 300, 128, 332, 147, M.WOOD, 2);
      rect(302, 132, 330, 145, M.NITRO);
      for(let k = 0; k < 4; k++) api.body(0, M.WOOD, 330 + k * 14, 255, 12);
    },
  },
  {
    name: 'Circuit',
    about: 'A battery sends sparks down a wire, through a pool, and into bombs under a stack of crates.',
    build(api){
      const { rect, line, body } = api;
      ground(api);
      rect(20, 246, 27, 261, M.BATTERY);
      line(28, 250, 60, 250, 0, M.METAL);
      line(60, 250, 60, 226, 0, M.METAL);
      line(60, 226, 104, 226, 0, M.METAL);
      line(104, 226, 104, 234, 0, M.METAL);
      rect(96, 228, 99, 261, M.GLASS); rect(250, 228, 253, 261, M.GLASS);
      rect(100, 235, 249, 261, M.WATER);
      line(246, 234, 246, 220, 0, M.METAL);
      line(246, 220, 330, 220, 0, M.METAL);
      line(330, 220, 330, 254, 0, M.METAL);
      rect(320, 255, 400, 261, M.GUNPOWDER);
      for(let r = 0; r < 4; r++) for(let i = 0; i < 4 - r; i++) body(0, M.WOOD, 334 + i * 15 + r * 7, 248 - r * 13, 12);
    },
  },
  {
    name: 'Paddle wheel',
    about: 'A motor-driven wooden paddle wheel churns a tank of sand and water. Shift-click with the pin tool to make your own motors.',
    build(api){
      const { rect, object, pin } = api;
      ground(api);
      cup(api, 140, 150, 340, 261, M.GLASS);
      rect(144, 200, 336, 257, M.WATER);
      rect(144, 236, 336, 257, M.SAND);
      object(M.WOOD, [[200, 197, 280, 203], [237, 160, 243, 240]]);
      pin(240, 200, 0.05);
      object(M.METAL, [[380, 150, 440, 154], [408, 124, 412, 180]]);
      pin(410, 152, -0.08);
      api.body(0, M.WOOD, 400, 100, 10);
      api.body(1, M.RUBBER, 420, 90, 8);
    },
  },
  {
    name: 'Fire and ice',
    about: 'Lava pours onto a glacier: the ice melts, the meltwater hardens the lava into stone, and the steam rises.',
    build(api){
      const { rect, disc, tap } = api;
      ground(api);
      // A glacier, with a lava spout pouring onto its shoulder.
      disc(300, 340, 170, M.ICE);
      rect(120, 250, 479, 261, M.ICE);
      rect(214, 20, 234, 24, M.WALL);
      for(let x = 218; x <= 230; x += 4) tap(x, 25, M.LAVA);
    },
  },
  {
    name: 'Boats',
    about: 'A metal boat floats because its hull holds air. Sand pours into the wooden one until it sinks.',
    build(api){
      const { rect, tap, object } = api;
      ground(api);
      rect(20, 170, 25, 261, M.STONE); rect(455, 170, 460, 261, M.STONE);
      rect(26, 190, 454, 261, M.WATER);
      // Both boats start at the waterline, with the water cleared out of them.
      rect(60, 172, 180, 195, M.EMPTY);
      object(M.WOOD, [[60, 192, 180, 195], [60, 172, 63, 191], [177, 172, 180, 191]]);
      rect(290, 170, 420, 213, M.EMPTY);
      object(M.METAL, [[290, 212, 420, 213], [290, 170, 291, 211], [419, 170, 420, 211]]);
      rect(110, 20, 130, 24, M.WALL);
      tap(120, 25, M.SAND);
    },
  },
  {
    name: 'Rain garden',
    about: 'Rain falls from the clouds and waters the seedlings, which grow into a jungle.',
    build(api){
      const { rect, disc, tap } = api;
      ground(api);
      disc(120, 330, 90, M.STONE); disc(360, 340, 110, M.STONE);
      for(let x = 24; x < 460; x += 22) tap(x, 4, M.WATER);
      rect(0, 0, 479, 3, M.WALL);
      rect(0, 261, 479, 261, M.DRAIN);
      // A seedling under every other raincloud, on whatever ground is there.
      for(let x = 46; x < 460; x += 44){
        let y = 5;
        while(y < 261 && api.sim.cell(x, y + 1) === M.EMPTY) y++;
        rect(x - 1, y - 3, x + 1, y, M.PLANT);
      }
      rect(220, 250, 260, 261, M.DRAIN);
    },
  },
];

export const LEVELS = [
  {
    id: 'pour',
    name: 'First pour',
    brief: 'Fill the cup with sand. Drag on the screen to pour.',
    done: 'The cup is full.',
    tools: ['paint', 'erase'],
    mats: [M.SAND],
    budget: 3500,
    stars: [0.6, 0.8],
    zones: [{ x0: 304, y0: 190, x1: 356, y1: 257, label: 'CUP' }],
    setup(api){
      ground(api);
      cup(api, 300, 190, 360, 261);
      api.rect(180, 120, 250, 124, M.STONE);
      api.rect(260, 60, 300, 63, M.STONE);
    },
    goal(api){
      const n = api.count(M.SAND, 304, 190, 356, 257);
      return { p: n / 1800, text: `Sand in the cup: ${n}/1800` };
    },
  },
  {
    id: 'waterworks',
    name: 'Water works',
    brief: 'The spout is pouring onto a drain. Build a stone channel to carry the water into the tank.',
    done: 'The tank is full.',
    tools: ['paint', 'erase'],
    mats: [M.STONE],
    budget: 2200,
    zones: [{ x0: 384, y0: 170, x1: 456, y1: 257, label: 'TANK' }],
    setup(api){
      api.rect(0, 262, W - 1, H - 1, M.WALL);
      api.rect(0, 261, W - 1, 261, M.DRAIN);
      cup(api, 380, 170, 460, 261);
      api.rect(200, 70, 214, 260, M.WALL);
      api.rect(36, 18, 46, 20, M.WALL);
      for(let x = 38; x <= 44; x++) api.tap(x, 21, M.WATER);
    },
    goal(api){
      const n = api.count(M.WATER, 384, 170, 456, 257);
      return { p: n / 2400, text: `Water in the tank: ${n}/2400` };
    },
  },
  {
    id: 'fuse',
    name: 'Long fuse',
    brief: 'Burn down the wooden tower. The only flame is the lava on the far left, and there is a moat and a wall in the way.',
    done: 'Burnt to the ground.',
    tools: ['paint', 'erase'],
    mats: [M.WOOD, M.OIL, M.GUNPOWDER],
    budget: 1400,
    stars: [0.45, 0.8],
    zones: [{ x0: 400, y0: 150, x1: 440, y1: 257, label: 'TOWER' }],
    setup(api){
      ground(api);
      cup(api, 6, 222, 60, 261);
      api.rect(10, 232, 56, 257, M.LAVA);
      cup(api, 110, 200, 330, 261);
      api.rect(114, 212, 326, 257, M.WATER);
      api.rect(356, 100, 362, 261, M.STONE);
      api.rect(390, 258, 450, 261, M.STONE);
      api.rect(400, 150, 440, 257, M.WOOD);
      this.wood = api.count(M.WOOD, 400, 150, 440, 257);
    },
    goal(api){
      const left = api.count(M.WOOD, 400, 150, 440, 257);
      const burnt = 1 - left / this.wood;
      return { p: burnt / 0.9, text: `Tower burnt: ${Math.round(burnt * 100)}% (need 90%)` };
    },
  },
  {
    id: 'delivery',
    name: 'Special delivery',
    brief: 'Get the crate into the basket in one piece. A stone stopper holds it on the icy ledge. Acid eats stone... and wood.',
    done: 'Delivered in one piece.',
    tools: ['paint', 'bomb'],
    mats: [M.ACID],
    budget: 400,
    uses: { bomb: 2 },
    zones: [{ x0: 372, y0: 214, x1: 452, y1: 257, label: 'BASKET' }],
    setup(api){
      ground(api);
      api.rect(40, 50, 59, 261, M.WALL);
      // Icy ledge tilted toward the stopper, then a long icy ramp to the basket.
      for(let x = 60; x <= 140; x++){
        const y = Math.round(100 + (x - 60) * 0.1);
        api.rect(x, y, x, y + 3, M.ICE);
      }
      api.rect(141, 101, 143, 111, M.STONE);
      // The long ramp is glass, which acid can't eat.
      for(let x = 130; x <= 372; x++){
        const y = Math.round(150 + (x - 130) * 0.34);
        api.rect(x, y, x, y + 3, M.GLASS);
      }
      // Posts holding the ramp up (unsupported terrain falls when damaged).
      for(const x of [130, 200, 290]) api.rect(x, Math.round(150 + (x - 130) * 0.34) + 4, x + 3, 261, M.STONE);
      cup(api, 368, 238, 456, 261, M.WOOD);
      api.body(0, M.WOOD, 128, 96, 16, 0, 1);
    },
    goal(api){
      const c = api.tagged(1).sort((a, b) => b.pixels - a.pixels)[0];
      if(!c) return { p: 0, text: 'The crate is gone. Press R to try again.' };
      const inside = c.x > 372 && c.x < 452 && c.y > 214 && c.y < 258;
      const whole = c.pixels >= 200;
      return { p: inside && whole ? 1 : 0, text: inside ? (whole ? 'In the basket!' : 'It arrived... in pieces. Press R.') : whole ? 'Get the crate into the basket.' : 'The crate is falling apart. Press R.' };
    },
  },
  {
    id: 'topple',
    name: 'Topple',
    brief: 'Knock over the last domino. There is a gap in the line: draw your own wooden dominoes to bridge it (O), then burn the chock to let the ball go.',
    done: 'Every domino down.',
    tools: ['draw', 'erase', 'fire'],
    mats: [M.WOOD],
    budget: 600,
    uses: { fire: 1 },
    stars: [0.4, 0.7],
    zones: [{ x0: 216, y0: 214, x1: 268, y1: 261, label: 'GAP' }],
    setup(api){
      ground(api);
      // The ramp from the Dominoes scene, with a chock holding the ball.
      for(let x = 0; x < 90; x++) api.rect(x, Math.round(150 + x * 1.1), x, 261, M.STONE);
      api.rect(36, 180, 39, 190, M.WOOD);
      api.body(1, M.METAL, 16, 150, 16);
      const at = x => api.object(M.WOOD, [[x, 234, x + 3, 261]]);
      for(let k = 0; k < 6; k++) at(110 + k * 20);
      let last = 0;
      for(let k = 0; k < 7; k++) last = at(270 + k * 20);
      api.sim.tag(last, 6);
      api.rect(420, 200, 474, 261, M.STONE);
    },
    goal(api){
      const d = api.tagged(6)[0];
      if(!d) return { p: 0, text: 'The last domino is gone. Press R.' };
      const down = Math.abs(d.angle) > 1.0;
      return { p: down ? 1 : 0, text: down ? 'Down it goes!' : 'Knock over the last domino.' };
    },
  },
  {
    id: 'crossing',
    name: 'Hot crossing',
    brief: 'Roll the metal ball over the lava to the flag. Water cools lava into stone. Burn the gate when you are ready.',
    done: 'Across the lava.',
    tools: ['paint', 'fire'],
    mats: [M.WATER],
    budget: 1800,
    uses: { fire: 1 },
    zones: [{ x0: 320, y0: 160, x1: 475, y1: 213, label: 'FLAG' }],
    setup(api){
      ground(api);
      // Left hill sloping down to the lava, flat bank on the right.
      for(let x = 0; x < 170; x++){
        const top = Math.round(60 + x * 0.9);
        api.rect(x, top, x, 261, M.STONE);
      }
      cup(api, 166, 214, 276, 261);
      api.rect(170, 214, 272, 257, M.LAVA);
      api.rect(276, 214, W - 1, 261, M.STONE);
      api.rect(58, 50, 61, 112, M.WOOD);
      api.body(1, M.METAL, 42, 84, 20, 0, 2);
    },
    goal(api){
      const b = api.tagged(2)[0];
      if(!b) return { p: 0, text: 'The ball is gone. Press R to retry.' };
      const there = b.x > 320 && b.y < 214;
      return { p: there ? 1 : 0, text: there ? 'Made it!' : b.y > 222 ? 'The ball sank into the lava. Press R.' : 'Get the ball to the flag.' };
    },
  },
  {
    id: 'demolition',
    name: 'Demolition',
    brief: 'Knock every glass block off the platform. You have three bombs and three metal balls to drop.',
    done: 'Platform cleared.',
    tools: ['bomb', 'ball'],
    mats: [M.METAL],
    uses: { bomb: 3, ball: 3 },
    par: 10,
    zones: [{ x0: 180, y0: 110, x1: 300, y1: 179, label: 'PLATFORM' }],
    setup(api){
      ground(api);
      api.rect(180, 180, 300, 187, M.STONE);
      api.rect(232, 188, 248, 261, M.STONE);
      const rows = [4, 3, 2, 1];
      let y = 173;
      rows.forEach(n => {
        for(let i = 0; i < n; i++) api.body(0, M.GLASS, 240 + (i - (n - 1) / 2) * 15, y, 12, 0, 3);
        y -= 13;
      });
    },
    goal(api){
      const on = api.tagged(3).filter(b => b.y < 180 && b.x > 178 && b.x < 302 && b.pixels > 20).length;
      return { p: on === 0 ? 1 : 0, text: `Blocks left on the platform: ${on}` };
    },
  },
  {
    id: 'greenhouse',
    name: 'Greenhouse',
    brief: 'Plants grow by drinking water. Get the plant to reach the sunlight at the top.',
    done: 'It reached the sun.',
    tools: ['paint', 'erase'],
    mats: [M.STONE],
    budget: 1600,
    zones: [{ x0: 200, y0: 40, x1: 280, y1: 64, label: 'SUNLIGHT' }],
    setup(api){
      ground(api);
      api.rect(0, 261, W - 1, 261, M.DRAIN);
      api.rect(226, 250, 254, 261, M.STONE);
      api.rect(232, 244, 248, 249, M.PLANT);
      api.rect(406, 8, 424, 10, M.WALL);
      for(let x = 408; x <= 422; x++) api.tap(x, 11, M.WATER);
      api.rect(300, 90, 360, 94, M.GLASS);
    },
    goal(api){
      const n = api.count(M.PLANT, 200, 40, 280, 64);
      return { p: n / 40, text: `Plant in the sunlight: ${n}/40` };
    },
  },
  {
    id: 'catapult',
    name: 'Catapult',
    brief: 'Launch the crate into the high basket. Drop heavy boulders on the seesaw (the size slider sets how big).',
    done: 'Nothing but net.',
    tools: ['boulder'],
    mats: [M.METAL],
    uses: { boulder: 3 },
    par: 8,
    zones: [{ x0: 351, y0: 186, x1: 409, y1: 212, label: 'BASKET' }],
    setup(api){
      ground(api);
      api.rect(236, 252, 244, 261, M.STONE);
      api.object(M.WOOD, [[200, 244, 280, 247], [200, 236, 202, 243], [214, 240, 216, 243]]);
      api.pin(240, 246);
      api.body(0, M.WOOD, 208, 230, 10, 0, 1);
      api.rect(368, 216, 392, 261, M.STONE);
      cup(api, 348, 196, 412, 215, M.WOOD, 2);
    },
    goal(api){
      const c = api.tagged(1)[0];
      if(!c) return { p: 0, text: 'The crate is gone. Press R.' };
      const inside = c.x > 351 && c.x < 409 && c.y > 186 && c.y < 213;
      return { p: inside ? 1 : 0, text: inside ? 'In the basket!' : 'Get the crate into the high basket.' };
    },
  },
  {
    id: 'counterweight',
    name: 'Counterweight',
    brief: 'Lift the stone crate up to the line. Sand is heavy: whatever piles on an object weighs it down.',
    done: 'Up it goes.',
    tools: ['paint', 'erase'],
    mats: [M.SAND],
    budget: 1400,
    stars: [0.55, 0.8],
    zones: [{ x0: 150, y0: 120, x1: 200, y1: 160, label: 'LIFT HERE' }],
    setup(api){
      ground(api);
      // A seesaw on a pin: a cup with the crate on the left, a bucket on the right.
      api.object(M.WOOD, [
        [158, 200, 330, 202],
        [158, 180, 160, 199], [186, 180, 188, 199],
        [300, 164, 302, 199], [328, 164, 330, 199],
      ]);
      api.pin(240, 201);
      api.body(0, M.STONE, 173, 193, 10, 0, 1);
      // The crate's end rests on a post until the bucket outweighs it.
      api.rect(164, 203, 176, 261, M.STONE);
    },
    goal(api){
      const c = api.tagged(1)[0];
      if(!c) return { p: 0, text: 'The crate is gone. Press R.' };
      const up = c.y < 160 && c.x > 140 && c.x < 210;
      return { p: up ? 1 : 0, text: up ? 'Hold it there...' : 'Lift the crate to the line.' };
    },
  },
  {
    id: 'wrecking',
    name: 'Wrecking ball',
    brief: 'Knock the crates off the ledge. Drop a metal ball on the shelf, chain it to the hook, pull it back and let it swing.',
    done: 'Smashing.',
    tools: ['ball', 'rope', 'grab'],
    mats: [M.METAL],
    uses: { ball: 2, rope: 2 },
    par: 20,
    zones: [{ x0: 196, y0: 114, x1: 266, y1: 183, label: 'LEDGE' }, { x0: 150, y0: 0, x1: 170, y1: 8, label: 'HOOK' }],
    setup(api){
      ground(api);
      api.rect(150, 0, 170, 6, M.WALL);
      api.rect(20, 150, 80, 155, M.STONE);
      api.rect(196, 184, 266, 190, M.STONE);
      api.rect(240, 191, 260, 261, M.STONE);
      [4, 3, 2, 1].forEach((n, r) => {
        for(let i = 0; i < n; i++) api.body(0, M.WOOD, 206 + i * 15 + r * 7.5, 177 - r * 13, 12, 0, 3);
      });
    },
    goal(api){
      const on = api.tagged(3).filter(b => b.y < 184 && b.x > 194 && b.x < 268 && b.pixels > 20).length;
      return { p: on <= 3 ? 1 : (10 - on) / 7, text: `Crates left on the ledge: ${on} (3 or fewer wins)` };
    },
  },
  {
    id: 'livewire',
    name: 'Live wire',
    brief: 'Blow open the wooden door. Sparks from the battery travel through metal and water. You only have enough metal for a short wire.',
    done: 'Door blown.',
    tools: ['paint', 'erase'],
    mats: [M.METAL],
    budget: 260,
    stars: [0.6, 0.85],
    zones: [{ x0: 430, y0: 180, x1: 440, y1: 261, label: 'DOOR' }],
    setup(api){
      ground(api);
      api.rect(20, 248, 27, 261, M.BATTERY);
      cup(api, 110, 230, 340, 261);
      api.rect(114, 236, 336, 257, M.WATER);
      api.rect(380, 236, 429, 240, M.STONE);
      api.rect(400, 241, 412, 261, M.STONE);
      // A settled mound of gunpowder (a heap painted as a block would slump).
      for(let x = 384; x <= 428; x++) api.rect(x, 235 - Math.round(9 - Math.abs(x - 406) / 3), x, 235, M.GUNPOWDER);
      api.rect(430, 180, 440, 261, M.WOOD);
      this.door = api.count(M.WOOD, 430, 180, 440, 261);
    },
    goal(api){
      const left = api.count(M.WOOD, 430, 180, 440, 261);
      const gone = 1 - left / this.door;
      return { p: gone / 0.7, text: `Door destroyed: ${Math.round(gone * 100)}% (need 70%)` };
    },
  },
  {
    id: 'bounce',
    name: 'Bounce house',
    brief: 'Get the ball into the basket without it touching the acid. Burn the chock (dry plant, it goes up fast) to let it roll, and use rubber: it is bouncy.',
    done: 'Swish.',
    tools: ['paint', 'erase', 'fire'],
    mats: [M.RUBBER],
    budget: 500,
    uses: { fire: 1 },
    stars: [0.3, 0.6],
    zones: [{ x0: 246, y0: 190, x1: 318, y1: 238, label: 'BASKET' }],
    setup(api){
      ground(api);
      // A launch ramp on the left, the ball held by a chock you burn. Plant
      // burns away at once, so the ball starts the same way every time.
      for(let x = 0; x < 110; x++){
        const top = Math.round(70 + x * 0.6);
        api.rect(x, top, x, 110 + x, M.STONE);
      }
      api.rect(38, 84, 41, 94, M.PLANT);
      api.body(1, M.METAL, 24, 72, 12, 0, 5);
      // Acid floor between the ramp and the tower.
      cup(api, 110, 236, 470, 261, M.GLASS);
      api.rect(114, 244, 466, 257, M.ACID);
      // The basket, on a post standing in the acid.
      api.rect(274, 241, 290, 257, M.WALL);
      cup(api, 244, 205, 320, 240, M.WOOD, 2);
    },
    goal(api){
      const b = api.tagged(5)[0];
      if(!b) return { p: 0, text: 'The ball is gone. Press R.' };
      const inside = b.x > 246 && b.x < 318 && b.y > 190 && b.y < 238;
      return { p: inside ? 1 : 0, text: inside ? 'In!' : b.y > 236 ? 'Into the acid. Press R.' : 'Bounce the ball into the basket.' };
    },
  },
  {
    id: 'meltdown',
    name: 'Meltdown',
    brief: 'Get the glass gem out of the metal vault and down to the ground. Thermite burns through metal. One match.',
    done: 'The gem is free.',
    tools: ['paint', 'fire'],
    mats: [M.THERMITE],
    budget: 400,
    uses: { fire: 1 },
    stars: [0.35, 0.7],
    zones: [{ x0: 200, y0: 230, x1: 300, y1: 261, label: 'GROUND' }],
    setup(api){
      ground(api);
      // A narrow metal vault, open at the top, on a metal slab between
      // stone pillars. The gem is a little glass cube.
      api.rect(190, 142, 196, 261, M.STONE);
      api.rect(304, 142, 310, 261, M.STONE);
      api.rect(197, 142, 303, 145, M.METAL);
      api.rect(232, 96, 237, 141, M.METAL);
      api.rect(263, 96, 268, 141, M.METAL);
      api.body(0, M.GLASS, 250, 137, 8, 0, 6);
    },
    goal(api){
      const g = api.tagged(6).sort((a, b) => b.pixels - a.pixels)[0];
      if(!g) return { p: 0, text: 'The gem is gone. Press R.' };
      const down = g.y > 230 && g.x > 196 && g.x < 304;
      return { p: down ? 1 : 0, text: down ? 'Free!' : 'Melt a way out for the gem.' };
    },
  },
  {
    id: 'copycat',
    name: 'Copycat',
    brief: 'Fill the tank with lava. There is only one drop, melting through a metal plate, so catch it with Clone: it copies whatever touches it, and needs room to pour.',
    done: 'A whole tank from one drop.',
    tools: ['paint', 'erase'],
    mats: [M.CLONE],
    budget: 120,
    stars: [0.25, 0.5],
    zones: [{ x0: 184, y0: 170, x1: 296, y1: 257, label: 'TANK' }],
    setup(api){
      ground(api);
      cup(api, 180, 170, 300, 261, M.GLASS);
      // The drop sits on a metal plate it slowly melts through (press Space
      // to pause while you get ready).
      api.rect(226, 40, 254, 42, M.METAL);
      api.rect(232, 38, 236, 43, M.WALL); api.rect(244, 38, 248, 43, M.WALL);
      api.rect(237, 35, 243, 39, M.LAVA);
    },
    goal(api){
      const n = api.count(M.LAVA, 184, 170, 296, 257);
      return { p: n / 2500, text: `Lava in the tank: ${n}/2500` };
    },
  },
];
