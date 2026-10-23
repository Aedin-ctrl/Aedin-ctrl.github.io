// Recording and export.
//
// Stored columnar in Float32Arrays rather than as an array of objects per frame.
// 553 landmarks x 4 values x 30 fps is about 265 KB/s as raw floats and roughly
// ten times that once every point is a JS object with four string keys — a ten
// minute session becomes a gigabyte of garbage-collected heap. Columnar keeps it
// flat, bounded, and cheap to serialise.
//
// The face MESH is excluded by default: 478 of the 553 points, the least useful
// part of a movement recording. Note this does NOT make the export
// de-identifying: body landmarks 0-10 are nose, eyes, ears and mouth corners,
// and hand geometry is itself a biometric. Say so to anyone who records a
// person with this.

import { partInfo } from '../schema.js';

const VALUES = 4; // x, y, z, score

export class Recorder {
  #chunks = [];
  #frame = null;
  #used = 0;
  #frames = 0;
  #meta = [];
  #layout = null;
  #chunkFrames = 64;
  #provenance = null;

  constructor({ maxFrames = 36_000, parts = ['body', 'leftHand', 'rightHand'] } = {}) {
    this.maxFrames = maxFrames; // ~20 min at 30 fps; refuses to grow past this
    this.parts = parts;
    this.recording = false;
    this.droppedForLimit = 0;
  }

  get frames() { return this.#frames; }
  get layout() { return this.#layout; }
  /** Rough heap cost of what has been captured so far, in bytes. */
  get bytes() { return this.#chunks.length * this.#chunkFrames * (this.#layout?.stride ?? 0) * 4; }

  start(result) {
    // Provenance is captured HERE, from the frame that began the recording.
    // Reading it at save time meant the file described whatever happened to be
    // on screen when you pressed the button, and threw outright if that was null.
    this.#provenance = {
      schemaVersion: result?.schemaVersion ?? null,
      modelId: result?.modelId ?? null,
      modelRevision: result?.modelRevision ?? null,
      startedAt: new Date().toISOString(),
    };
    this.#chunks = [];
    this.#frame = null;
    this.#used = 0;
    this.#frames = 0;
    this.#meta = [];
    this.droppedForLimit = 0;
    this.#layout = this.#layoutFor();
    this.recording = true;
    return this.#layout;
  }

  stop() { this.recording = false; return this.#frames; }

  /**
   * Columns come from the parts this recorder was CONFIGURED for, not from
   * whichever parts happened to be present in frame one. Deriving them from the
   * first frame silently dropped any part that appeared later — and "arms at
   * your sides, hands not yet found" is the normal opening of exactly the
   * supine work this tool is for, so a whole hand could vanish from a recording
   * with nothing in the file to say it had.
   */
  #layoutFor() {
    const columns = [];
    for (const part of this.parts) {
      const { names, count } = partInfo(part);
      for (let i = 0; i < count; i++) {
        columns.push({ part, index: i, name: names ? names[i] : `${part}_${i}` });
      }
    }
    return { parts: [...this.parts], columns, stride: columns.length * VALUES };
  }

  push(result, timestampMs) {
    if (!this.recording || !this.#layout) return false;
    if (this.#frames >= this.maxFrames) { this.droppedForLimit++; return false; }

    const { stride, columns } = this.#layout;
    if (!this.#frame || this.#used === this.#chunkFrames) {
      this.#frame = new Float32Array(this.#chunkFrames * stride);
      this.#chunks.push(this.#frame);
      this.#used = 0;
    }
    const base = this.#used * stride;
    let o = base;
    for (const col of columns) {
      const p = result.parts[col.part]?.[col.index];
      // A landmark the model guessed outside the frame is written as blank: it
      // was not measured, and a consumer cannot tell the difference afterwards.
      if (p && p.present !== false) {
        this.#frame[o] = p.x; this.#frame[o + 1] = p.y;
        this.#frame[o + 2] = p.z ?? 0; this.#frame[o + 3] = p.score;
      } else {
        // A part that vanished mid-recording: NaN, never 0. A zero is a
        // coordinate and would read as "the joint is at the top-left corner".
        this.#frame[o] = NaN; this.#frame[o + 1] = NaN;
        this.#frame[o + 2] = NaN; this.#frame[o + 3] = NaN;
      }
      o += VALUES;
    }
    this.#used++;
    this.#frames++;
    this.#meta.push({
      t: Math.round(timestampMs * 1000) / 1000,
      rot: result.orientation.applied,
      rotScore: Math.round(result.orientation.score * 1000) / 1000,
      searched: result.orientation.searched ? 1 : 0,
      ms: Math.round(result.timings.totalMs * 100) / 100,
      passes: result.timings.passes,
    });
    return true;
  }

  #each(fn) {
    const { stride } = this.#layout;
    for (let f = 0; f < this.#frames; f++) {
      const chunk = this.#chunks[Math.floor(f / this.#chunkFrames)];
      fn(f, chunk, (f % this.#chunkFrames) * stride);
    }
  }

  /** Provenance travels with the data; a bare coordinate dump is unreadable later. */
  #header() {
    const p = this.#provenance ?? {};
    return {
      format: 'anybody-pose',
      formatVersion: 1,
      schemaVersion: p.schemaVersion,
      model: { id: p.modelId, revision: p.modelRevision },
      recordedAt: p.startedAt,
      frameCount: this.#frames,
      parts: this.#layout.parts,
      columns: this.#layout.columns,
      values: ['x', 'y', 'z', 'score'],
      coordinates: 'normalised to the source frame; origin top-left; z is model-relative and has no metric scale',
      note: 'Confidence is model-specific and is not comparable across models.',
    };
  }

  toJSON() {
    const { stride, columns } = this.#layout;
    const frames = [];
    this.#each((f, chunk, base) => {
      const pts = [];
      for (let c = 0; c < columns.length; c++) {
        const o = base + c * VALUES;
        pts.push([
          round(chunk[o]), round(chunk[o + 1]), round(chunk[o + 2]), round(chunk[o + 3], 3),
        ]);
      }
      frames.push({ ...this.#meta[f], p: pts });
    });
    return JSON.stringify({ ...this.#header(), frames }, null, 0);
  }

  /** One row per frame, one column group per landmark. Opens in any spreadsheet. */
  toCSV() {
    const { columns } = this.#layout;
    const head = ['frame', 'time_ms', 'rotation_deg', 'rotation_score', 'searched', 'total_ms', 'passes'];
    for (const c of columns) {
      head.push(`${c.part}.${c.name}.x`, `${c.part}.${c.name}.y`, `${c.part}.${c.name}.z`, `${c.part}.${c.name}.score`);
    }
    const lines = [
      `# anybody-pose v1  model=${this.#provenance?.modelId}@${this.#provenance?.modelRevision}  schema=${this.#provenance?.schemaVersion}`,
      '# coordinates normalised to the source frame, origin top-left; blank = part absent that frame',
      head.join(','),
    ];
    this.#each((f, chunk, base) => {
      const m = this.#meta[f];
      const row = [f, m.t, m.rot, m.rotScore, m.searched, m.ms, m.passes];
      for (let c = 0; c < columns.length; c++) {
        const o = base + c * VALUES;
        for (let v = 0; v < VALUES; v++) {
          const n = chunk[o + v];
          row.push(Number.isNaN(n) ? '' : round(n, v === 3 ? 3 : 5));
        }
      }
      lines.push(row.join(','));
    });
    return lines; // array of rows: hand straight to Blob, never concatenated
  }
}

const round = (n, d = 5) => (Number.isNaN(n) ? null : Math.round(n * 10 ** d) / 10 ** d);

/**
 * Hand a Blob to the user as a file.
 *
 * `body` may be an array of strings. Blob joins them itself, so a long CSV never
 * becomes one giant JS string first — building and holding that concatenation
 * was the peak-memory step of the whole export.
 */
export function download(filename, body, type) {
  const parts = Array.isArray(body) ? body.flatMap((l, i) => (i ? ['\n', l] : [l])) : [body];
  const blob = new Blob(parts, { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export const stamp = () =>
  new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
