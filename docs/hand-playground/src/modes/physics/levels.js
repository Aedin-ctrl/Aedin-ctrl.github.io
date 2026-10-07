// Challenge levels (research/19 §1.6): get enough marbles into the cup with a limited tray.
export const LEVELS = [
  { name: 'Mind the gap', goal: 3, inv: { ramp: 1 }, parts: (w, h) => [
    { type: 'spawner', x: 3, y: h - 2, angle: -0.2 },
    { type: 'ramp', x: 5.5, y: h - 3.2, angle: -0.3, len: 4 },
    { type: 'cup', x: Math.min(w - 2.4, 23.5), y: 0.05, angle: 0 }] },
  { name: 'Up and over', goal: 3, inv: { trampoline: 1, ramp: 1 }, parts: (w, h) => [
    { type: 'spawner', x: 3, y: h - 2, angle: -0.6 },
    { type: 'ramp', x: w * 0.5, y: 1.3, angle: Math.PI / 2, len: 2.6 },
    { type: 'cup', x: w * 0.75, y: 0.05, angle: 0 }] },
  { name: 'Now you see it', goal: 5, inv: { portal: 1, boost: 1, ramp: 1 }, parts: (w) => [
    { type: 'spawner', x: 3, y: 2, angle: 0 },
    { type: 'ramp', x: w * 0.72, y: 2.2, angle: 0, len: 3 },
    { type: 'ramp', x: w * 0.6, y: 1, angle: Math.PI / 2, len: 2 },
    { type: 'cup', x: w * 0.72, y: 0.05, angle: 0 }] },
];
