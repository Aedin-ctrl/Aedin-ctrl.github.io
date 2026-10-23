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
// MEASURED CAVEAT -- the passes are not as independent as this design assumes.
// MediaPipe's HolisticLandmarker carries state between detect() calls even in
// IMAGE mode. On fixtures/prone90.jpg the same image yields 33 landmarks from a
// fresh landmarker and ZERO immediately after a different image was processed.
// So each rotation in a search is influenced by the one before it, and the four
// scores are not strictly comparable. In practice the signal that matters is
// coarse -- detection either works or returns nothing at all -- which survives
// the contamination. Finer comparisons between rotations do not; see README.
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

/**
 * Un-rotate a camera-aligned WORLD landmark back into the source camera frame.
 *
 * World landmarks are metres from the hip midpoint in a frame aligned with the
 * camera, so rotating the input image rotates the whole skeleton about the
 * optical axis. Image +x is right and image +y is down, so a 90-degree
 * clockwise image rotation sends source-right to rotated-down; inverting that
 * is a rotation of the XY pair. Z (toward the camera) is unaffected.
 */
export function unrotateWorld(x, y, deg) {
  switch (((deg % 360) + 360) % 360) {
    case 0: return { x, y };
    case 90: return { x: -y, y: x };
    case 180: return { x: -x, y: -y };
    case 270: return { x: y, y: -x };
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
  #cooling = 0;

  constructor({ mode = 'auto', keepAbove = 0.5, recheckEvery = 150, cooldown = 15 } = {}) {
    if (mode !== 'auto' && mode !== 'none' && !ROTATIONS.includes(mode)) {
      throw new Error(`orientation must be 'auto', 'none', or one of ${ROTATIONS.join('/')}`);
    }
    this.mode = mode;
    // NOTE: `keepAbove` gates on a score that cannot detect a wrong pose -- a
    // measured wrong detection scores 0.80, well above the 0.5 default. So this
    // keeps a rotation that is FINDING something, not one that is RIGHT.
    this.keepAbove = keepAbove;
    this.recheckEvery = recheckEvery; // forced full search, so a wrong lock cannot persist
    // A search that changes nothing used to be free to run again on the very
    // next frame: low confidence -> four passes -> subject moved and blurred ->
    // low confidence again. On the out-of-distribution subjects this library is
    // for, that pins the frame rate at the worst value indefinitely. Back off
    // after a search that didn't help.
    this.cooldown = cooldown;
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
    let tried = null;
    if (!forced) {
      const points = await run(this.#current);
      const s = score(points);
      if (s >= this.keepAbove) {
        this.#score = s;
        return { rotation: this.#current, points, score: s, searched: false, scores: null };
      }
      tried = { rotation: this.#current, points, score: s };
      // Still in the backoff window from a search that didn't change anything.
      if (this.#cooling > 0) {
        this.#cooling--;
        this.#score = s;
        return { rotation: this.#current, points, score: s, searched: false, scores: null };
      }
    }

    // Full search. The cached rotation has already been run above unless this
    // search was forced, so re-running it here cost a whole extra inference pass
    // -- a "four-way" search was really five -- and under MediaPipe's hidden
    // state the duplicate could even disagree with itself. Reuse it instead.
    const results = [];
    if (!forced && tried) results.push(tried);
    for (const deg of ROTATIONS) {
      if (results.some((r) => r.rotation === deg)) continue;
      const points = await run(deg);
      results.push({ rotation: deg, points, score: score(points) });
    }
    const scores = Object.fromEntries(results.map((r) => [r.rotation, r.score]));

    const ranked = [...results].sort((a, b) => b.score - a.score);
    const best = ranked[0];

    // No hysteresis any more. It arbitrated between scores this module already
    // documents as not strictly comparable, i.e. it was arbitration over noise.
    const changed = best.rotation !== this.#current;
    this.#cooling = changed ? 0 : this.cooldown;
    this.#current = best.rotation;
    this.#score = best.score;
    this.#sinceSearch = 0;

    // Hand back every candidate that actually found a body. Comparing those
    // candidates geometrically is the only thing measured to differ between a
    // correct and an incorrect detection. The scores do not.
    return {
      ...best, searched: true, scores,
      candidates: ranked.filter((r) => r.points.some((p) => p.part === 'body')),
    };
  }

  reset() {
    this.#current = this.mode === 'auto' || this.mode === 'none' ? 0 : this.mode;
    this.#score = 0;
    this.#sinceSearch = Infinity;
    this.#cooling = 0;
  }
}
