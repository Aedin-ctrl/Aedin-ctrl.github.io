/* ideaworker.mjs -- runs the three robustness tests off the main thread. */
import { testIdea } from './lib/ideatest.mjs';
import { compileStrategy } from './lib/strategy.mjs';
import { extractParamSpec } from './lib/strategylab.mjs';
import { jsonSafe } from './lib/sources.mjs';

self.onmessage = (e) => {
  const { id, market, benchmark, src, opts, dates, alternatives } = e.data;
  try {
    const spec = extractParamSpec(src);
    if (!spec) throw new Error('no PARAMS block found — declare the ranges the tester may search');
    const fn = compileStrategy(src);
    const res = testIdea(new Float64Array(market), fn, spec,
      { ...opts, benchmark: benchmark ? new Float64Array(benchmark) : null,
        dates: dates || null,
        alternatives: alternatives && Object.keys(alternatives).length ? alternatives : null,
        onProgress: (p, label) => self.postMessage({ id, type: 'progress', p, label }) });
    self.postMessage({ id, type: 'done', res: jsonSafe({ ...res, spec }) });
  } catch (err) {
    self.postMessage({ id, type: 'error', message: String(err && err.message || err) });
  }
};
