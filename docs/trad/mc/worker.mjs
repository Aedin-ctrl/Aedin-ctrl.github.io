/* worker.mjs -- one simulation worker.
 *
 * Each worker is handed a contiguous slice of path indices. Because path p always
 * draws from stream p (see rng.mjs), the slicing is invisible in the result: the
 * same seed gives the same numbers whether this runs on one core or sixteen.
 */
import { runBatch } from './lib/engine.mjs';
import { compileStrategy } from './lib/strategy.mjs';

self.onmessage = (e) => {
  const { id, cfg, lo, hi } = e.data;
  try {
    const c = { ...cfg };
    if (cfg.source) c.source = new Float64Array(cfg.source);
    if (cfg.strategySrc) c.strategyFn = compileStrategy(cfg.strategySrc);
    if (cfg.ladder) c.ladder = Array.from(cfg.ladder);

    const res = runBatch(c, lo, hi, (done, total) => {
      self.postMessage({ id, type: 'progress', done, total });
    });

    const transfer = [res.band.buffer];
    for (const k of Object.keys(res.metrics)) transfer.push(res.metrics[k].buffer);
    if (res.fullPaths) for (const p of res.fullPaths) transfer.push(p.buffer);
    if (res.ladder) {
      transfer.push(res.ladder.logGrowth.buffer, res.ladder.logGrowthSq.buffer,
                    res.ladder.maxDD.buffer, res.ladder.ruin.buffer);
      for (const m of res.ladder.median) transfer.push(m.buffer);
    }
    self.postMessage({ id, type: 'done', res }, transfer);
  } catch (err) {
    self.postMessage({ id, type: 'error', message: String(err && err.message || err), stack: String(err && err.stack || '') });
  }
};
