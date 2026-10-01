// Tuning constants. URL overrides: ?hands=1 ?delegate=cpu ?debug
const q = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);

export const CONFIG = {
  debug: q.has('debug'),

  // tracking
  numHands: Number(q.get('hands') || 2),
  delegate: (q.get('delegate') || 'gpu').toUpperCase(),     // GPU | CPU
  worker: q.get('worker') !== '0',                           // ?worker=0 → track on the main thread
  camera: { width: 640, height: 480, frameRate: 30 },

  // pinch (ratio = thumb–index distance ÷ palm size)
  pinch: { enter: 0.30, exit: 0.45, armOpen: 0.55, enterMs: 40, exitMs: 80 },
  oneEuro: { minCutoff: 1.2, beta: 0.012, dCutoff: 1.0 },  // screen px
  handAppearFrames: 3,
  handGraceMs: 250,
};
