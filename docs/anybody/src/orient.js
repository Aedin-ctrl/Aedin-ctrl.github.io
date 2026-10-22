// Orientation search.
//
// Pose models are trained almost entirely on upright people. A subject lying on
// a mat is out of distribution, which is the whole problem this library exists
// for. The fix here is deliberately dumb: run the model at 0/90/180/270, keep
// whichever reports the most confidence, and remember it.
//
// What this is NOT: an orientation *estimator*. An earlier design estimated the
// body axis from the bounding box and carried it forward with a temporal prior.
// That is 180-degree ambiguous by construction (a supine person is a wide box
// whichever way their head points), has no first-frame bootstrap, and closes a
// feedback loop with no damping — one left/right swap rotates the next crop,
// which makes the swap self-consistent, and it never recovers. Brute force has
// none of those failure modes because each search is stateless.
//
// Caching is only an optimisation. `recheckEvery` bounds how long a confidently
// wrong lock can survive, which is the one way brute force could still latch.
//
// Note what rotation does and does not buy you: it is an IN-PLANE transform. It
// addresses a model trained on upright bodies. It does nothing for foreshortening,
// self-occlusion, or out-of-plane rotation, which are different problems.

export const ROTATIONS = [0, 90, 180, 270];

/**
 * Map a normalised point from the SOURCE frame into the frame rotated `deg`
 * clockwise. Coordinates are in [0,1] on each axis of their own frame.
 */
export function rotatePoint(x, y, deg) {
  switch (((deg % 360) + 360) % 360) {
    case 0: return { x, y };
    case 90: return { x: 1 - y, y: x };
    case 180: return { x: 1 - x, y: 1 - y };
    case 270: return { x: y, y: 1 - x };
    default: throw new Error(`rotation must be a multiple of 90, got ${deg}`);
  }
}

/** Inverse of `rotatePoint`: rotated frame back to source frame. */
export function unrotatePoint(x, y, deg) {
  switch (((deg % 360) + 360) % 360) {
    case 0: return { x, y };
    case 90: return { x: y, y: 1 - x };
    case 180: return { x: 1 - x, y: 1 - y };
    case 270: return { x: 1 - y, y: x };
    default: throw new Error(`rotation must be a multiple of 90, got ${deg}`);
  }
}

/** Pixel dimensions after rotating a `w`x`h` image by `deg`. */
export function rotatedSize(w, h, deg) {
  const d = ((deg % 360) + 360) % 360;
  return d === 90 || d === 270 ? { w: h, h: w } : { w, h };
}

/**
 * Score a result for "does this look like a body the model understood".
 *
 * Uses the torso and limb joints only. Scoring over all 33 landmarks lets the
 * ten head points dominate, and a model can be confident about a face while
 * getting the limbs wrong — which is exactly the case we are trying to detect.
 */
const CORE = [11, 12, 23, 24, 13, 14, 15, 16, 25, 26, 27, 28];

export function scoreBody(points) {
  if (!points?.length) return 0;
  const body = points.filter((p) => p.part === 'body');
  if (!body.length) return 0;
  let sum = 0;
  let n = 0;
  for (const i of CORE) {
    const p = body[i];
    if (p && Number.isFinite(p.score)) { sum += p.score; n++; }
  }
  return n ? sum / n : 0;
}

/**
 * Picks a rotation and remembers it.
 *
 * `mode` is 'auto' (search), 'none' (always 0), or a literal 0/90/180/270 to pin
 * one. Pinning is useful when the integrator already knows how the camera is
 * mounted, which is cheaper and more reliable than any amount of inference.
 */
export class OrientationSearch {
  #current = 0;
  #score = 0;
  #sinceSearch = Infinity;
  #lastScores = null;

  constructor({ mode = 'auto', keepAbove = 0.5, margin = 0.08, recheckEvery = 150 } = {}) {
    if (mode !== 'auto' && mode !== 'none' && !ROTATIONS.includes(mode)) {
      throw new Error(`orientation must be 'auto', 'none', or one of ${ROTATIONS.join('/')}`);
    }
    this.mode = mode;
    this.keepAbove = keepAbove;   // cached rotation is trusted while it scores above this
    this.margin = margin;         // a challenger must beat the cached one by this much
    this.recheckEvery = recheckEvery; // forced full search, so a wrong lock cannot persist
    if (mode !== 'auto' && mode !== 'none') this.#current = mode;
  }

  get current() { return this.#current; }
  get score() { return this.#score; }

  /**
   * @param run async (deg) => points — run the backend with the source rotated by `deg`
   * @param score (points) => number
   * @returns {{ rotation, points, score, searched, scores }}
   */
  async pick(run, score = scoreBody) {
    if (this.mode === 'none') {
      const points = await run(0);
      return { rotation: 0, points, score: score(points), searched: false, scores: null };
    }
    if (this.mode !== 'auto') {
      const points = await run(this.mode);
      return { rotation: this.mode, points, score: score(points), searched: false, scores: null };
    }

    // Try the remembered rotation first; most frames stop here. Counted on entry
    // so that `recheckEvery` is the maximum number of frames between full
    // searches, not one more than it.
    this.#sinceSearch++;
    const forced = this.#sinceSearch >= this.recheckEvery;
    if (!forced) {
      const points = await run(this.#current);
      const s = score(points);
      if (s >= this.keepAbove) {
        this.#score = s;
        return { rotation: this.#current, points, score: s, searched: false, scores: null };
      }
    }

    // Full search. Stateless: every rotation is re-evaluated from scratch, so a
    // previous wrong answer carries no weight beyond `margin`.
    const results = [];
    for (const deg of ROTATIONS) {
      const points = await run(deg);
      results.push({ rotation: deg, points, score: score(points) });
    }
    const scores = Object.fromEntries(results.map((r) => [r.rotation, r.score]));

    let best = results[0];
    for (const r of results) if (r.score > best.score) best = r;

    // Hysteresis: only switch if the challenger is clearly better, so a frame of
    // noise does not flip the skeleton. `recheckEvery` is what stops this from
    // becoming a latch.
    const incumbent = results.find((r) => r.rotation === this.#current);
    if (incumbent && best.rotation !== this.#current && best.score < incumbent.score + this.margin) {
      best = incumbent;
    }

    this.#current = best.rotation;
    this.#score = best.score;
    this.#sinceSearch = 0;
    this.#lastScores = scores;
    return { ...best, searched: true, scores };
  }

  reset() {
    this.#current = this.mode === 'auto' || this.mode === 'none' ? 0 : this.mode;
    this.#score = 0;
    this.#sinceSearch = Infinity;
    this.#lastScores = null;
  }
}
