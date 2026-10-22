// Recording and export.
//
// Stored columnar in Float32Arrays rather than as an array of objects per frame.
// 553 landmarks x 4 values x 30 fps is about 265 KB/s as raw floats and roughly
// ten times that once every point is a JS object with four string keys — a ten
// minute session becomes a gigabyte of garbage-collected heap. Columnar keeps it
// flat, bounded, and cheap to serialise.
//
// The face mesh is excluded by default: it is 478 of the 553 points, it is the
// least useful part of a movement recording, and it is the part most obviously
// identifying.

const VALUES = 4; // x, y, z, score

export class Recorder {
  #chunks = [];
  #frame = null;
  #used = 0;
  #frames = 0;
  #meta = [];
  #layout = null;
  #chunkFrames = 64;

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
    this.#chunks = [];
    this.#frame = null;
    this.#used = 0;
    this.#frames = 0;
    this.#meta = [];
    this.droppedForLimit = 0;
    this.#layout = this.#layoutFor(result);
    this.recording = true;
    return this.#layout;
  }

  stop() { this.recording = false; return this.#frames; }

  /** Fix the column order from the first frame; later frames must match it. */
  #layoutFor(result) {
    const parts = this.parts.filter((p) => result.parts[p]);
    const columns = [];
    for (const part of parts) {
      for (const p of result.parts[part]) columns.push({ part, index: p.index, name: p.name });
    }
    return { parts, columns, stride: columns.length * VALUES };
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
      if (p) {
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
  #header(source) {
    return {
      format: 'anybody-pose',
      formatVersion: 1,
      schemaVersion: source.schemaVersion,
      model: { id: source.modelId, revision: source.modelRevision },
      recordedAt: new Date().toISOString(),
      frameCount: this.#frames,
      parts: this.#layout.parts,
      columns: this.#layout.columns,
      values: ['x', 'y', 'z', 'score'],
      coordinates: 'normalised to the source frame; origin top-left; z is model-relative and has no metric scale',
      note: 'Confidence is model-specific and is not comparable across models.',
    };
  }

  toJSON(source) {
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
    return JSON.stringify({ ...this.#header(source), frames }, null, 0);
  }

  /** One row per frame, one column group per landmark. Opens in any spreadsheet. */
  toCSV(source) {
    const { columns } = this.#layout;
    const head = ['frame', 'time_ms', 'rotation_deg', 'rotation_score', 'searched', 'total_ms', 'passes'];
    for (const c of columns) {
      head.push(`${c.part}.${c.name}.x`, `${c.part}.${c.name}.y`, `${c.part}.${c.name}.z`, `${c.part}.${c.name}.score`);
    }
    const lines = [
      `# anybody-pose v1  model=${source.modelId}@${source.modelRevision}  schema=${source.schemaVersion}`,
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
    return lines.join('\n');
  }
}

const round = (n, d = 5) => (Number.isNaN(n) ? null : Math.round(n * 10 ** d) / 10 ** d);

/** Hand a Blob to the user as a file. Revoked on the next task, not immediately. */
export function download(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export const stamp = () =>
  new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
