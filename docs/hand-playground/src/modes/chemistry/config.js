// Every tuning constant in one place (research/02 §10). Units in comments.
// URL overrides for quick experiments: ?hands=1 ?delegate=cpu ?debug
const q = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);

export const CONFIG = {
  debug: q.has('debug'),

  // tracking
  numHands: Number(q.get('hands') || 2),
  delegate: (q.get('delegate') || 'gpu').toUpperCase(),     // GPU | CPU
  camera: { width: 640, height: 480, frameRate: 30 },

  // pinch (ratio = thumb–index distance ÷ palm size)
  pinch: { enter: 0.30, exit: 0.45, armOpen: 0.55, enterMs: 60, exitMs: 80 },
  oneEuro: { minCutoff: 1.2, beta: 0.012, dCutoff: 1.0 },  // screen px
  handAppearFrames: 3,
  handGraceMs: 250,

  // interaction
  grabRadius: { mouse: 1.15, hand: 1.9 },                  // × atom radius
  bondTapRadius: 16,                                       // px around bond midpoint
  tapMaxMs: 320, tapMaxMove: 22,                           // px
  joinRadius: 1.9,                                         // × (rA + rB)
  breakStretch: 1.9,                                       // × rest length
  breakHoldMs: 60,
  rejoinCooldownMs: 600,
  settleMs: 500,                                           // quiet time before recognizing
  maxNeighbourSpeed: 16,                                   // px/frame — gives molecules "inertia" so yanks stretch bonds

  // layout springs (research/12 §1.4)
  bondGap: 20,                                             // px between atom surfaces at rest
  kBond: 0.22, kAngle: 0.07, kRepel: 900, damp: 0.8, iters: 4,
};
