// Element data. Pure data, no DOM.
//   valence: allowed "normal" bond-order sums (first = default). Used for implicit H in SMILES
//            and for the "valid unknown molecule" check.
//   max:     the most bond order the sandbox lets you attach (covers CO, O₃, nitro N, SO₃ …).
//   color:   modernized CPK (research/06 §8). ink: letter colour on the ball.
//   r:       display radius in px (not to scale — hand-friendly sizes).
export const ELEMENTS = {
  H:  { name: 'Hydrogen',   mass: 1.008,  valence: [1],       max: 1, color: '#F3F4F6', ink: '#3A3F48', r: 17 },
  B:  { name: 'Boron',      mass: 10.81,  valence: [3],       max: 3, color: '#F4B8B8', ink: '#3A3F48', r: 22 },
  C:  { name: 'Carbon',     mass: 12.011, valence: [4],       max: 4, color: '#4A4F59', ink: '#F2F3F5', r: 24 },
  N:  { name: 'Nitrogen',   mass: 14.007, valence: [3, 5],    max: 4, color: '#4F7CFF', ink: '#F2F3F5', r: 24 },
  O:  { name: 'Oxygen',     mass: 15.999, valence: [2],       max: 3, color: '#F0525A', ink: '#F2F3F5', r: 24 },
  F:  { name: 'Fluorine',   mass: 18.998, valence: [1],       max: 1, color: '#9BE08A', ink: '#26402A', r: 21 },
  P:  { name: 'Phosphorus', mass: 30.974, valence: [3, 5],    max: 5, color: '#F2994A', ink: '#3A2A1A', r: 27 },
  S:  { name: 'Sulfur',     mass: 32.06,  valence: [2, 4, 6], max: 6, color: '#F2C94C', ink: '#3A3218', r: 27 },
  Cl: { name: 'Chlorine',   mass: 35.45,  valence: [1],       max: 1, color: '#4CC38A', ink: '#0F2E20', r: 26 },
  Br: { name: 'Bromine',    mass: 79.904, valence: [1],       max: 1, color: '#B5544E', ink: '#F2F3F5', r: 28 },
  I:  { name: 'Iodine',     mass: 126.9,  valence: [1],       max: 1, color: '#8E5BB5', ink: '#F2F3F5', r: 30 },
};

// Shown in the atom tray, top to bottom.
export const TRAY = ['H', 'C', 'N', 'O', 'S', 'P', 'Cl', 'F'];

export const defaultValence = (el) => ELEMENTS[el].valence[0];
export const maxBonds = (el) => ELEMENTS[el].max;
