// 2D hand shapes for placing a hand mask on a meme by hand (tools/annotate). A right hand, palm
// toward the camera, thumb on the image-left, wrist at (0, 0), middle knuckle near (0, -1).
// Curling a finger bends its joints into the picture, so in 2D the finger shortens and folds back.
const OPEN = [
  [0, 0],
  [-0.35, -0.15], [-0.6, -0.4], [-0.78, -0.62], [-0.92, -0.82],
  [-0.32, -0.95], [-0.38, -1.38], [-0.41, -1.65], [-0.43, -1.88],
  [-0.05, -1.0], [-0.06, -1.48], [-0.07, -1.78], [-0.08, -2.02],
  [0.2, -0.95], [0.24, -1.38], [0.27, -1.65], [0.29, -1.86],
  [0.42, -0.84], [0.5, -1.15], [0.55, -1.35], [0.59, -1.52],
];
const BEND = [70, 90, 60].map((d) => (d * Math.PI) / 180);   // MCP, PIP, DIP at a full curl

export const SHAPES = {
  open: [0, 0, 0, 0, 0], point: [0.7, 0, 1, 1, 1], fist: [0.8, 1, 1, 1, 1], 'thumbs-up': [0, 1, 1, 1, 1],
  peace: [0.8, 0, 0, 1, 1], claw: [0.3, 0.45, 0.45, 0.45, 0.45], pinch: [0.5, 0.5, 0.15, 0.15, 0.15],
};

// The point you click (after the wrist) to place each shape: the tip of the finger that sticks out.
export const SHAPE_KEY = { open: [12, 'the tip of the middle finger'], point: [8, 'the tip of the pointing finger'], fist: [9, 'the middle knuckle'],
  'thumbs-up': [4, 'the tip of the thumb'], peace: [12, 'the tip of the middle finger (the V)'], claw: [12, 'the tip of the middle finger'], pinch: [12, 'the tip of the middle finger'] };

// curls: [thumb, index, middle, ring, pinky], 0 = straight … 1 = fully curled
export function handShape(curls = SHAPES.open) {
  const out = OPEN.map((p) => [...p]);
  for (let f = 1; f <= 4; f++) {
    const b = 1 + f * 4, m = OPEN[b];
    const dir = [OPEN[b + 3][0] - m[0], OPEN[b + 3][1] - m[1]];
    const dl = Math.hypot(...dir); const d = [dir[0] / dl, dir[1] / dl];
    let th = 0, s = 0;
    for (let k = 1; k <= 3; k++) {
      const l = Math.hypot(OPEN[b + k][0] - OPEN[b + k - 1][0], OPEN[b + k][1] - OPEN[b + k - 1][1]);
      th += BEND[k - 1] * curls[f];
      s += l * Math.cos(th);
      out[b + k] = [m[0] + d[0] * s, m[1] + d[1] * s];
    }
  }
  // thumb: swing the whole chain across the palm around its base
  const a = (curls[0] * 75 * Math.PI) / 180, c1 = OPEN[1];
  for (let k = 2; k <= 4; k++) {
    const dx = OPEN[k][0] - c1[0], dy = OPEN[k][1] - c1[1];
    const shrink = 1 - 0.25 * curls[0] * (k - 1) / 3;
    out[k] = [c1[0] + (dx * Math.cos(a) - dy * Math.sin(a)) * shrink, c1[1] + (dx * Math.sin(a) + dy * Math.cos(a)) * shrink];
  }
  return out;
}
