// Worked examples. These live here rather than inside the page so the tests can check they
// actually compute what they claim — a wrong example is worse than no example, because someone
// learning from it has no way to know.
//
// Each is written as compact tuples: parts are [type, x, y, label?] and wires are
// [fromPartIndex, fromPin, toPartIndex, toPin].

export const EXAMPLES = {
  'Half adder': {
    why: 'Adds two bits: sum and carry',
    parts: [['in', 40, 70, 'A'], ['in', 40, 170, 'B'], ['xor', 190, 60], ['and', 190, 170],
            ['out', 330, 72, 'Sum'], ['out', 330, 180, 'Carry']],
    wires: [[0, 0, 2, 0], [1, 0, 2, 1], [0, 0, 3, 0], [1, 0, 3, 1], [2, 0, 4, 0], [3, 0, 5, 0]],
  },

  'Full adder': {
    why: 'Adds three bits — chain these to add real numbers',
    parts: [
      ['in', 30, 60, 'A'], ['in', 30, 150, 'B'], ['in', 30, 260, 'Carry in'],
      ['xor', 180, 70], ['xor', 330, 150], ['and', 330, 260], ['and', 180, 180], ['or', 470, 270],
      ['out', 470, 162, 'Sum'], ['out', 610, 282, 'Carry out'],
    ],
    wires: [
      [0, 0, 3, 0], [1, 0, 3, 1],          // A xor B
      [3, 0, 4, 0], [2, 0, 4, 1],          // sum = that xor carry-in
      [3, 0, 5, 0], [2, 0, 5, 1],          // one carry path
      [0, 0, 6, 0], [1, 0, 6, 1],          // the other carry path
      [5, 0, 7, 0], [6, 0, 7, 1],          // carry out = either
      [4, 0, 8, 0], [7, 0, 9, 0],
    ],
  },

  'Latch (remembers)': {
    why: 'Press Set, let go — it stays on',
    parts: [['in', 40, 70, 'Set'], ['in', 40, 190, 'Reset'], ['nor', 200, 160], ['nor', 200, 60], ['out', 350, 70, 'Q']],
    wires: [[1, 0, 3, 0], [2, 0, 3, 1], [0, 0, 2, 0], [3, 0, 2, 1], [3, 0, 4, 0]],
  },

  'Flip-flop + clock': {
    why: 'Halves the clock — the start of counting',
    parts: [['clock', 40, 110], ['dff', 200, 90], ['out', 360, 100, 'Q']],
    wires: [[0, 0, 1, 1], [1, 1, 1, 0], [1, 0, 2, 0]],
  },

  'Two-bit counter': {
    why: 'Counts 0,1,2,3 and round again — watch the lamps',
    parts: [['clock', 30, 120], ['dff', 170, 100], ['dff', 350, 100], ['out', 530, 80, 'Bit 1'], ['out', 530, 170, 'Bit 2']],
    wires: [
      [0, 0, 1, 1],        // clock drives the first flip-flop
      [1, 1, 1, 0],        // its inverted output back to its own input: it toggles
      [1, 0, 2, 1],        // the first one's output clocks the second
      [2, 1, 2, 0],        // which toggles too, so it counts at half the rate
      [1, 0, 3, 0], [2, 0, 4, 0],
    ],
  },

  'Majority vote': {
    why: 'On when at least two of three are on',
    parts: [['in', 30, 50, 'A'], ['in', 30, 140, 'B'], ['in', 30, 230, 'C'],
            ['and', 170, 50], ['and', 170, 140], ['and', 170, 230], ['or', 310, 90], ['or', 430, 150],
            ['out', 560, 160, 'Most']],
    wires: [[0, 0, 3, 0], [1, 0, 3, 1], [1, 0, 4, 0], [2, 0, 4, 1], [0, 0, 5, 0], [2, 0, 5, 1],
            [3, 0, 6, 0], [4, 0, 6, 1], [6, 0, 7, 0], [5, 0, 7, 1], [7, 0, 8, 0]],
  },
};

// Turn one of the compact definitions above into a circuit the engine can run.
export function buildExample(name) {
  const ex = EXAMPLES[name];
  if (!ex) throw new Error(`no example called ${name}`);
  return {
    name,
    parts: ex.parts.map(([type, x, y, label], i) => ({ id: 'e' + i, type, x, y, ...(label ? { label } : {}) })),
    wires: ex.wires.map(([a, ao, b, bi]) => ({ from: ['e' + a, ao], to: ['e' + b, bi] })),
  };
}
