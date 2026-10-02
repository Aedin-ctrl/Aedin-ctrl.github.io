// The logic engine. A circuit is plain data — parts and wires — and this turns it into values on
// wires, over and over, as fast as the screen refreshes.
//
// The interesting problem is feedback. A latch feeds its own output back to its input, so there is
// no order you can evaluate the parts in that works; you have to settle. We evaluate everything
// repeatedly until nothing changes, which is what real gates do (each pass is roughly one gate
// delay). If it never settles, the circuit is genuinely oscillating — a ring of inverters does this
// in hardware too — so we stop and say so rather than hanging.

export const LOW = 0, HIGH = 1;

// Every kind of part: how many pins it has, where they sit on its body, and what it computes.
// `step` sees its input values and returns its output values. Sequential parts also get `mem`,
// their own little scrap of memory that survives between passes.
export const PARTS = {
  in:    { name: 'Switch',   ins: 0, outs: 1, w: 46, h: 32, toggle: true,
           step: (_, mem) => [mem.on ? HIGH : LOW] },
  clock: { name: 'Clock',    ins: 0, outs: 1, w: 46, h: 32, clock: true,
           step: (_, mem) => [mem.on ? HIGH : LOW] },
  out:   { name: 'Lamp',     ins: 1, outs: 0, w: 40, h: 32, step: () => [] },
  // A four-bit readout. The adder and counter examples produce binary you have to decode in your
  // head, which is the point at which people stop following; this shows the number itself.
  // Lowest bit at the top, matching the truth table's column order.
  num:   { name: 'Number',   ins: 4, outs: 0, w: 52, h: 66, readout: true,
           pinNames: { ins: ['1', '2', '4', '8'], outs: [] }, step: () => [] },
  not:   { name: 'NOT',      ins: 1, outs: 1, w: 54, h: 34, step: ([a]) => [a ? LOW : HIGH] },
  and:   { name: 'AND',      ins: 2, outs: 1, w: 58, h: 42, step: ([a, b]) => [a && b ? HIGH : LOW] },
  or:    { name: 'OR',       ins: 2, outs: 1, w: 58, h: 42, step: ([a, b]) => [a || b ? HIGH : LOW] },
  xor:   { name: 'XOR',      ins: 2, outs: 1, w: 58, h: 42, step: ([a, b]) => [a !== b ? HIGH : LOW] },
  nand:  { name: 'NAND',     ins: 2, outs: 1, w: 58, h: 42, step: ([a, b]) => [a && b ? LOW : HIGH] },
  nor:   { name: 'NOR',      ins: 2, outs: 1, w: 58, h: 42, step: ([a, b]) => [a || b ? LOW : HIGH] },
  xnor:  { name: 'XNOR',     ins: 2, outs: 1, w: 58, h: 42, step: ([a, b]) => [a === b ? HIGH : LOW] },
  // D flip-flop: copies D to Q on the clock's rising edge, and holds it the rest of the time.
  // This is what lets a circuit remember anything.
  dff:   { name: 'D flip-flop', ins: 2, outs: 2, w: 66, h: 56, pinNames: { ins: ['D', 'CLK'], outs: ['Q', 'Q̅'] },
           step: ([d, clk], mem) => {
             if (clk === HIGH && mem.lastClk !== HIGH) mem.q = d;      // rising edge
             mem.lastClk = clk;
             const q = mem.q ? HIGH : LOW;
             return [q, q ? LOW : HIGH];
           } },
};

export const isSource = (type) => PARTS[type]?.ins === 0;

// What a Number part is showing, as 0-15, from its four input wires (lowest bit first).
export const readoutValue = (bits) => bits.reduce((n, b, i) => n + (b === HIGH ? 1 << i : 0), 0);

// ---- chips: a circuit packaged up and reused ----
//
// This is what turns a gate toy into something you design with. You build an adder once, name it,
// and from then on it is a part like any other. A design carries its chip definitions with it, so a
// shared link still works for someone who has never seen your chip.
//
// A chip's pins come from the switches and lamps inside it: every switch becomes an input, every
// lamp an output, ordered top to bottom so the pins sit where you would expect.
export const CHIP = 'chip:';
export const isChip = (type) => typeof type === 'string' && type.startsWith(CHIP);
export const chipName = (type) => type.slice(CHIP.length);

const byY = (a, b) => a.y - b.y || a.x - b.x;
export function chipPins(def) {
  return {
    ins: (def.parts || []).filter((p) => p.type === 'in').sort(byY),
    outs: (def.parts || []).filter((p) => p.type === 'out').sort(byY),
  };
}

// What a chip instance looks like on the board, so the canvas and hit-testing agree.
export function chipShape(def) {
  const { ins, outs } = chipPins(def);
  const rows = Math.max(ins.length, outs.length, 1);
  return { name: 'Chip', ins: ins.length, outs: outs.length, w: 78, h: Math.max(42, 20 + rows * 22),
           pinNames: { ins: ins.map((p) => p.label || ''), outs: outs.map((p) => p.label || '') } };
}

// Replace every chip instance with its innards, so the engine only ever sees real gates. Chips may
// contain chips; `depth` stops a chip that somehow contains itself from expanding for ever.
export function flatten(circuit, depth = 0) {
  const chips = circuit.chips || {};
  const parts = [], wires = [...(circuit.wires || [])];
  let expanded = false;

  for (const p of circuit.parts || []) {
    if (!isChip(p.type)) { parts.push(p); continue; }
    const def = chips[chipName(p.type)];
    if (!def || depth > 6) { continue; }          // unknown or too deep: drop it rather than loop
    expanded = true;
    const inner = flatten({ ...def, chips }, depth + 1);
    const pre = p.id + '/';
    for (const ip of inner.parts) parts.push({ ...ip, id: pre + ip.id, x: p.x, y: p.y });
    for (const iw of inner.wires) wires.push({ from: [pre + iw.from[0], iw.from[1]], to: [pre + iw.to[0], iw.to[1]] });

    const { ins, outs } = chipPins(def);
    // an input pin on the instance feeds whatever the matching inner switch fed
    ins.forEach((sw, i) => {
      const feed = wires.find((w) => w.to[0] === p.id && w.to[1] === i);
      const inside = inner.wires.filter((w) => w.from[0] === sw.id);
      for (const target of inside) {
        if (feed) wires.push({ from: feed.from, to: [pre + target.to[0], target.to[1]] });
      }
    });
    // an output pin carries whatever the matching inner lamp was reading
    outs.forEach((lamp, i) => {
      const innerFeed = inner.wires.find((w) => w.to[0] === lamp.id);
      if (!innerFeed) return;
      for (const w of wires) {
        if (w.from[0] === p.id && w.from[1] === i) { w.from = [pre + innerFeed.from[0], innerFeed.from[1]]; }
      }
    });
  }

  // drop the wires that referred to the instance itself; they have been rerouted above
  const live = new Set(parts.map((x) => x.id));
  const clean = wires.filter((w) => live.has(w.from[0]) && live.has(w.to[0]));
  const out = { parts, wires: clean, chips };
  return expanded ? flatten(out, depth + 1) : out;
}

// Where a pin sits on the part's body, so the canvas and the hit-testing agree on one answer.
export function defOf(part, chips) {
  if (isChip(part.type)) {
    const def = (chips || {})[chipName(part.type)];
    return def ? chipShape(def) : null;
  }
  return PARTS[part.type];
}

export function pinPos(part, side, index, chips) {
  const def = defOf(part, chips);
  if (!def) return { x: part.x, y: part.y };
  const n = side === 'in' ? def.ins : def.outs;
  const spacing = def.h / (n + 1);
  return {
    x: part.x + (side === 'in' ? 0 : def.w),
    y: part.y + spacing * (index + 1),
  };
}

const key = (partId, side, index) => `${partId}:${side}:${index}`;
// where the carried-over wire values live inside the memory map
export const NETS = Symbol('nets');

// Run the circuit until the values stop changing.
//   circuit : { parts: [...], wires: [...] }
//   memory  : Map of partId -> that part's scrap memory (switch positions, flip-flop contents)
// Returns { values, settled, passes } where values maps every output pin to LOW/HIGH.
export function simulate(rawCircuit, memory, { maxPasses = 60 } = {}) {
  const circuit = (rawCircuit.parts || []).some((p) => isChip(p.type)) ? flatten(rawCircuit) : rawCircuit;
  const parts = circuit.parts || [];
  const wires = circuit.wires || [];

  // what feeds each input pin
  const feeds = new Map();
  for (const w of wires) feeds.set(key(w.to[0], 'in', w.to[1]), key(w.from[0], 'out', w.from[1]));

  // Carry the previous values forward. A cross-coupled latch keeps its state in the feedback loop
  // rather than in any one part, so starting every pass from all-zero wiped its memory: it would
  // hold while you watched it, then forget the moment you let go of the button.
  const carried = memory.get(NETS);
  const values = carried instanceof Map ? carried : new Map();
  if (!carried) memory.set(NETS, values);
  for (const p of parts) {
    const def = PARTS[p.type];
    if (!def) continue;
    for (let i = 0; i < def.outs; i++) if (!values.has(key(p.id, 'out', i))) values.set(key(p.id, 'out', i), LOW);
  }

  let settled = false, passes = 0;
  for (; passes < maxPasses && !settled; passes++) {
    settled = true;
    for (const p of parts) {
      const def = PARTS[p.type];
      if (!def) continue;
      const mem = memory.get(p.id) || (memory.set(p.id, {}), memory.get(p.id));
      const ins = [];
      for (let i = 0; i < def.ins; i++) {
        const src = feeds.get(key(p.id, 'in', i));
        ins.push(src ? values.get(src) ?? LOW : LOW);       // an unwired input reads low
      }
      const outs = def.step(ins, mem) || [];
      for (let i = 0; i < def.outs; i++) {
        const k = key(p.id, 'out', i), next = outs[i] ? HIGH : LOW;
        if (values.get(k) !== next) { values.set(k, next); settled = false; }
      }
    }
  }
  return { values, settled, passes };
}

// What a given input pin is reading — used to light up the wires.
export function valueAt(circuit, values, partId, side, index) {
  if (side === 'out') return values.get(key(partId, 'out', index)) ?? LOW;
  const c = (circuit.parts || []).some((p) => isChip(p.type)) ? flatten(circuit) : circuit;
  const w = (c.wires || []).find((x) => x.to[0] === partId && x.to[1] === index);
  return w ? values.get(key(w.from[0], 'out', w.from[1])) ?? LOW : LOW;
}

// A circuit people actually type in has loose ends; say which, so the UI can point them out
// rather than silently treating them as zero.
export function problems(circuit) {
  const out = [];
  const parts = circuit.parts || [], wires = circuit.wires || [];
  const fed = new Set(wires.map((w) => key(w.to[0], 'in', w.to[1])));
  for (const p of parts) {
    const def = defOf(p, circuit.chips);
    if (!def) continue;
    for (let i = 0; i < def.ins; i++) {
      if (!fed.has(key(p.id, 'in', i))) out.push({ partId: p.id, pin: i, what: `${def.name} input not connected` });
    }
  }
  return out;
}

// Truth table for a circuit, by trying every combination of its switches. This is the thing that
// turns "I think I wired an adder" into "I know I did".
export function truthTable(circuit, { limit = 10 } = {}) {
  const parts = circuit.parts || [];
  const switches = parts.filter((p) => p.type === 'in');
  const lamps = parts.filter((p) => p.type === 'out');
  if (!switches.length || !lamps.length) return null;
  if (switches.length > limit) return { tooBig: switches.length };
  const rows = [];
  for (let combo = 0; combo < (1 << switches.length); combo++) {
    const mem = new Map();
    for (const [i, s] of switches.entries()) mem.set(s.id, { on: !!(combo & (1 << i)) });
    // settle twice so anything with memory lands in a steady state
    simulate(circuit, mem);
    const { values, settled } = simulate(circuit, mem);
    rows.push({
      ins: switches.map((_, i) => (combo & (1 << i) ? 1 : 0)),
      outs: lamps.map((l) => valueAt(circuit, values, l.id, 'in', 0)),
      settled,
    });
  }
  return { switches: switches.map((s) => s.label || s.id), lamps: lamps.map((l) => l.label || l.id), rows };
}
