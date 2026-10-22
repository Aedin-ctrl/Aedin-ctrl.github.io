// Anybody — full-body tracking that does not assume you are standing up.
//
//   import { createTracker } from './src/anybody.js';
//   const tracker = await createTracker({ orientation: 'auto' });
//   const result = await tracker.estimate(videoEl, performance.now());
//
// Every result says which model produced it and which parts it actually
// contains. Nothing is zero-filled to make a schema look complete.

import { emptyResult, SCHEMA_VERSION } from './schema.js';
import { OrientationSearch, unrotatePoint, scoreBody } from './orient.js';
import { createMediaPipeBackend } from './backends/mediapipe.js';

export { SCHEMA_VERSION, PARTS, BODY_NAMES, HAND_NAMES, BODY_EDGES, HAND_EDGES, partInfo, sideOf }
  from './schema.js';
export { ROTATIONS, rotatePoint, unrotatePoint, rotatedSize } from './orient.js';

const BACKENDS = {
  mediapipe: createMediaPipeBackend,
};

/** Axis-aligned bounds of the body points, in normalised source coordinates. */
export function boxOf(points, { part = 'body', minScore = 0.3 } = {}) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of points) {
    if (p.part !== part || p.score < minScore) continue;
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
  parts = ['body', 'leftHand', 'rightHand', 'face'],
  keepAbove = 0.5,
  margin = 0.08,
  recheckEvery = 150,
  ...backendOptions
} = {}) {
  const make = BACKENDS[backend];
  if (!make) throw new Error(`unknown backend: ${backend}. Known: ${Object.keys(BACKENDS).join(', ')}`);

  const impl = await make({ parts, ...backendOptions });
  const search = new OrientationSearch({ mode: orientation, keepAbove, margin, recheckEvery });

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
      let lastFound = {};
      let lastWorld = null;

      const run = async (deg) => {
        const a = performance.now();
        const { points, found, world } = impl.run(source, deg, timestampMs + passes);
        inferenceMs += performance.now() - a;
        passes++;
        lastFound = found;
        lastWorld = world;
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

      const out = emptyResult({ modelId: impl.id, modelRevision: impl.revision });
      out.points = points;
      for (const [part, ok] of Object.entries(lastFound)) {
        if (ok) out.parts[part] = points.filter((p) => p.part === part);
      }
      out.world = lastWorld;
      out.box = boxOf(points);
      out.orientation = {
        applied: picked.rotation,
        score: picked.score,
        searched: picked.searched,
        scores: picked.scores,
      };
      out.timings = { totalMs: performance.now() - t0, inferenceMs, passes };
      return out;
    },

    /** Forget the cached rotation. Call when the camera or subject changes. */
    resetOrientation() { search.reset(); },

    close() { impl.close?.(); },
  };
}
