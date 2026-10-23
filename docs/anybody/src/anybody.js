// Anybody — full-body tracking that does not assume you are standing up.
//
//   import { createTracker } from './src/anybody.js';
//   const tracker = await createTracker({ orientation: 'auto' });
//   const result = await tracker.estimate(videoEl, performance.now());
//
// Every result says which model produced it and which parts it actually
// contains. Nothing is zero-filled to make a schema look complete.

import { emptyResult, SCHEMA_VERSION, PARTS } from './schema.js';
import { OrientationSearch, unrotatePoint, scoreBody } from './orient.js';
import { createMediaPipeBackend } from './backends/mediapipe.js';

export { SCHEMA_VERSION, PARTS, BODY_NAMES, HAND_NAMES, BODY_EDGES, HAND_EDGES, partInfo, sideOf }
  from './schema.js';
export { ROTATIONS, rotatePoint, unrotatePoint, rotatedSize } from './orient.js';

const BACKENDS = {
  mediapipe: createMediaPipeBackend,
};

/** Joints used to compare two candidate poses: torso and limbs, not the head. */
const CORE = [11, 12, 23, 24, 13, 14, 15, 16, 25, 26, 27, 28];

/**
 * Mean distance between two candidate body poses over the core joints, both
 * already mapped into source coordinates. Normalised units, so 0.1 is a tenth
 * of the frame.
 *
 * This is the one quantity measured to differ between a correct and an
 * incorrect detection: on the prone fixture the two candidates disagreed by
 * 0.139 while reporting confidences of 0.80 and 0.81. It cannot say WHICH is
 * right — tested, it picks wrong — but a large value means the model has two
 * confident and incompatible opinions, which is worth showing a human.
 */
export function disagreement(a, b) {
  let sum = 0;
  let n = 0;
  for (const i of CORE) {
    const pa = a[i];
    const pb = b[i];
    if (!pa || !pb) continue;
    sum += Math.hypot(pa.x - pb.x, pa.y - pb.y);
    n++;
  }
  return n ? sum / n : null;
}

/** Axis-aligned bounds of the body points, in normalised source coordinates. */
export function boxOf(points, { part = 'body', minScore = 0.3 } = {}) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of points) {
    if (p.part !== part || p.present === false || p.score < minScore) continue;
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  if (!Number.isFinite(x0)) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * @param {object} options
 * @param {'mediapipe'} [options.backend]
 * @param {'auto'|'none'|0|90|180|270} [options.orientation]
 *   'auto' searches the four quarter turns and keeps the best. 'none' never
 *   rotates. A literal angle pins one — if you already know how the camera is
 *   mounted, pinning beats searching on both speed and reliability.
 * @param {string[]} [options.parts]
 * @param {'IMAGE'|'VIDEO'} [options.runningMode] see backends/mediapipe.js
 */
export async function createTracker({
  backend = 'mediapipe',
  orientation = 'auto',
  // The face MESH is off by default: 478 of 553 points, the least useful part
  // of a movement recording, the most identifying, and it costs an allocation
  // and a loop over every one of them on every frame. Ask for 'face' if you
  // want it.
  parts = ['body', 'leftHand', 'rightHand'],
  keepAbove = 0.5,
  recheckEvery = 150,
  cooldown = 15,
  ...backendOptions
} = {}) {
  // A function may be passed directly. That is how the tests drive the real
  // estimate() in node with a fake backend — the previous regression test
  // reimplemented estimate() and so could not have caught a regression in it.
  const make = typeof backend === 'function' ? backend : BACKENDS[backend];
  if (!make) throw new Error(`unknown backend: ${backend}. Known: ${Object.keys(BACKENDS).join(', ')}`);

  // Unknown options are a silent no-op otherwise, which is the worst outcome
  // for a library whose value is tuning keepAbove / margin / recheckEvery.
  for (const part of parts) {
    if (!PARTS.includes(part)) throw new Error(`unknown part: ${part}. Known: ${PARTS.join(', ')}`);
  }

  const impl = await make({ parts, ...backendOptions });
  const search = new OrientationSearch({ mode: orientation, keepAbove, recheckEvery, cooldown });

  return {
    backend: impl.id,
    revision: impl.revision,
    declaredParts: impl.declaredParts,
    connections: impl.connections,

    /**
     * Estimate one frame.
     * @returns a result stamped with schemaVersion / modelId / modelRevision,
     *   whose `parts` contains only what was actually found.
     */
    async estimate(source, timestampMs = performance.now()) {
      const t0 = performance.now();
      let inferenceMs = 0;
      let passes = 0;
      // Keyed by rotation, because a search runs the backend four times and the
      // answer we keep belongs to the winner — not to whichever ran last.
      const perRotation = new Map();

      const run = async (deg) => {
        const a = performance.now();
        const { points, world } = impl.run(source, deg, timestampMs + passes);
        inferenceMs += performance.now() - a;
        passes++;
        perRotation.set(deg, { world });
        return points;
      };

      const picked = await search.pick(run, scoreBody);

      // Map every point out of the rotated frame back into source coordinates.
      const points = picked.rotation === 0
        ? picked.points
        : picked.points.map((p) => {
            const { x, y } = unrotatePoint(p.x, p.y, picked.rotation);
            return { ...p, x, y };
          });

      // Map each rival candidate into source coordinates too, so they can be
      // compared with the winner and drawn as a ghost.
      const toSource = (pts, rot) => (rot === 0 ? pts : pts.map((p) => {
        const { x, y } = unrotatePoint(p.x, p.y, rot);
        return { ...p, x, y };
      }));
      let rival = null;
      if (picked.candidates?.length > 1) {
        const r = picked.candidates.find((c) => c.rotation !== picked.rotation);
        if (r) {
          const pts = toSource(r.points, r.rotation);
          rival = { rotation: r.rotation, score: r.score, points: pts,
                    body: pts.filter((p) => p.part === 'body') };
        }
      }

      const out = emptyResult({ modelId: impl.id, modelRevision: impl.revision });
      out.points = points;
      // Parts are derived from the points themselves, so the two can never
      // disagree about what was found. Points arrive in landmark order within a
      // part, so the array index is the landmark index.
      for (const p of points) (out.parts[p.part] ??= []).push(p);
      out.world = perRotation.get(picked.rotation)?.world ?? null;
      out.box = boxOf(points);
      out.orientation = {
        applied: picked.rotation,
        score: picked.score,
        searched: picked.searched,
        scores: picked.scores,
      };
      // How much the runner-up rotation disagrees with the winner. Present only
      // on frames where a search actually ran and at least two rotations found
      // a body. null otherwise -- it is NOT a confidence, and there is no
      // threshold here that means "wrong".
      out.agreement = rival && out.parts.body
        ? { disagreement: disagreement(out.parts.body, rival.body),
            rotation: rival.rotation, score: rival.score }
        : null;
      out.rival = rival;

      out.timings = { totalMs: performance.now() - t0, inferenceMs, passes };
      return out;
    },

    /** Forget the cached rotation. Call when the camera or subject changes. */
    resetOrientation() { search.reset(); },

    close() { impl.close?.(); },
  };
}
