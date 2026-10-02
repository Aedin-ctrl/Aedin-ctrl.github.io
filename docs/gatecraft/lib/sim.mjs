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

// Where a pin sits on the part's body, so the canvas and the hit-testing agree on one answer.
export function pinPos(part, side, index) {
  const def = PARTS[part.type];
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
export function simulate(circuit, memory, { maxPasses = 60 } = {}) {
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
  const w = (circuit.wires || []).find((x) => x.to[0] === partId && x.to[1] === index);
  return w ? values.get(key(w.from[0], 'out', w.from[1])) ?? LOW : LOW;
}

// A circuit people actually type in has loose ends; say which, so the UI can point them out
// rather than silently treating them as zero.
export function problems(circuit) {
  const out = [];
  const parts = circuit.parts || [], wires = circuit.wires || [];
  const fed = new Set(wires.map((w) => key(w.to[0], 'in', w.to[1])));
  for (const p of parts) {
    const def = PARTS[p.type];
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
