/* optim.mjs -- derivative-free optimisation for the model fits.
 *
 * GARCH and the regime switcher need maximum likelihood, and their likelihoods are
 * cheap but have constrained, badly-scaled parameters. Nelder-Mead with restarts is
 * the right tool: no gradients to get wrong, and the restart loop is what stops it
 * reporting a corner of the simplex as a fit.
 */

/** Nelder-Mead simplex minimiser. Returns {x, fx, iters, converged}. */
export function nelderMead(f, x0, opts = {}) {
  const {
    step = 0.1, maxIter = 2000, tolX = 1e-9, tolF = 1e-12,
    alpha = 1, gamma = 2, rho = 0.5, sigma = 0.5,
  } = opts;
  const n = x0.length;
  const pts = [x0.slice()];
  for (let i = 0; i < n; i++) {
    const p = x0.slice();
    const s = Math.abs(p[i]) > 1e-8 ? p[i] * step : step;
    p[i] += s;
    pts.push(p);
  }
  let fs = pts.map(f);
  let iters = 0;
  const centroid = (ex) => {
    const c = new Array(n).fill(0);
    for (let i = 0; i < pts.length; i++) { if (i === ex) continue; for (let j = 0; j < n; j++) c[j] += pts[i][j]; }
    for (let j = 0; j < n; j++) c[j] /= pts.length - 1;
    return c;
  };
  for (; iters < maxIter; iters++) {
    const order = pts.map((_, i) => i).sort((a, b) => fs[a] - fs[b]);
    const sp = order.map(i => pts[i]), sf = order.map(i => fs[i]);
    pts.length = 0; pts.push(...sp); fs = sf;

    // converged when both the simplex and the spread of values are tiny
    let dx = 0;
    for (let i = 1; i < pts.length; i++) for (let j = 0; j < n; j++) dx = Math.max(dx, Math.abs(pts[i][j] - pts[0][j]));
    if (dx < tolX && Math.abs(fs[fs.length - 1] - fs[0]) < tolF) break;

    const c = centroid(pts.length - 1);
    const worst = pts[pts.length - 1];
    const xr = c.map((v, j) => v + alpha * (v - worst[j]));
    const fr = f(xr);
    if (fr < fs[0]) {
      const xe = c.map((v, j) => v + gamma * (xr[j] - v));
      const fe = f(xe);
      if (fe < fr) { pts[pts.length - 1] = xe; fs[fs.length - 1] = fe; }
      else { pts[pts.length - 1] = xr; fs[fs.length - 1] = fr; }
    } else if (fr < fs[fs.length - 2]) {
      pts[pts.length - 1] = xr; fs[fs.length - 1] = fr;
    } else {
      const xc = fr < fs[fs.length - 1]
        ? c.map((v, j) => v + rho * (xr[j] - v))
        : c.map((v, j) => v + rho * (worst[j] - v));
      const fc = f(xc);
      if (fc < Math.min(fr, fs[fs.length - 1])) { pts[pts.length - 1] = xc; fs[fs.length - 1] = fc; }
      else {
        for (let i = 1; i < pts.length; i++) {
          pts[i] = pts[i].map((v, j) => pts[0][j] + sigma * (v - pts[0][j]));
          fs[i] = f(pts[i]);
        }
      }
    }
  }
  const best = fs.indexOf(Math.min(...fs));
  return { x: pts[best], fx: fs[best], iters, converged: iters < maxIter };
}

/** Nelder-Mead with restarts from the previous optimum -- the usual guard against
 *  a premature collapse of the simplex reporting itself as a solution. */
export function minimize(f, x0, opts = {}) {
  const restarts = opts.restarts ?? 3;
  let best = nelderMead(f, x0, opts);
  for (let i = 0; i < restarts; i++) {
    const next = nelderMead(f, best.x, { ...opts, step: 0.05 / (i + 1) });
    if (next.fx < best.fx - 1e-14) best = next; else { best = next.fx < best.fx ? next : best; break; }
  }
  return best;
}

/** Golden-section search on a bracketed 1-D minimum. Used for profile likelihoods. */
export function golden(f, a, b, tol = 1e-8, maxIter = 200) {
  const gr = (Math.sqrt(5) - 1) / 2;
  let c = b - gr * (b - a), d = a + gr * (b - a);
  let fc = f(c), fd = f(d);
  for (let i = 0; i < maxIter && Math.abs(b - a) > tol; i++) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - gr * (b - a); fc = f(c); }
    else { a = c; c = d; fc = fd; d = a + gr * (b - a); fd = f(d); }
  }
  const x = (a + b) / 2;
  return { x, fx: f(x) };
}

/** Map an unconstrained real to (lo, hi) and back -- how the fits stay inside
 *  stationarity bounds without the optimiser ever seeing a constraint. */
export const squash = (z, lo, hi) => lo + (hi - lo) / (1 + Math.exp(-z));
export const unsquash = (x, lo, hi) => {
  const t = Math.min(1 - 1e-12, Math.max(1e-12, (x - lo) / (hi - lo)));
  return Math.log(t / (1 - t));
};
export const softplus = z => z > 30 ? z : Math.log1p(Math.exp(z));
export const invSoftplus = x => x > 30 ? x : Math.log(Math.expm1(Math.max(x, 1e-300)));
