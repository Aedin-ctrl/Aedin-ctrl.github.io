/* render.mjs -- draw a finished run. */
import * as C from './charts.mjs';
import { percentileRows, PCTS } from '../lib/results.mjs';
import * as S from '../lib/stats.mjs';
import * as T from '../lib/tests.mjs';
import { MODELS } from '../lib/generators.mjs';

const $ = s => document.querySelector(s);
const pct = (v, d = 1) => (v * 100).toFixed(d) + '%';
/** A proportion that never rounds a non-zero count down to "0.0%". */
const pctSmart = (v) => {
  if (v === 0) return '0%';
  if (v >= 0.1) return (v * 100).toFixed(1) + '%';
  if (v >= 0.01) return (v * 100).toFixed(1) + '%';
  if (v >= 0.001) return (v * 100).toFixed(2) + '%';
  if (v >= 0.0001) return (v * 100).toFixed(3) + '%';
  return '< 0.01%';
};
const sgn = (v, d = 1) => (v > 0 ? '+' : '') + (v * 100).toFixed(d) + '%';
const x2 = v => v >= 100 ? v.toFixed(0) + 'x' : v >= 10 ? v.toFixed(1) + 'x' : v.toFixed(2) + 'x';
const cls = v => v > 0 ? 'pos' : v < 0 ? 'neg' : 'dim';
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const n0 = v => Math.round(v).toLocaleString();

/* ---------------- verdict scorecard ---------------- */
export function renderScore(res, vd, cfg, srcInfo) {
  const mk = o => `<span class="mk ${o}">${o === 'yes' ? '✓' : o === 'no' ? '✕' : o === 'mid' ? '!' : '–'}</span>`;
  const row = (q, a, o) => `<div class="row2">${mk(o)}<span class="q">${q}</span>
    <span class="a" style="color:var(--${o === 'yes' ? 'good' : o === 'no' ? 'bad' : o === 'mid' ? 'warn' : 'muted'})">${a}</span></div>`;

  const cards = [];

  if (vd) {
    const sigNaive = vd.pNeweyWest < 0.05;
    const seesIt = vd.mdeRatio >= 1;
    const dsrOK = vd.deflated ? vd.deflated.dsr > 0.95 : null;
    cards.push(`<div class="sc">
      <h4>The evidence</h4>
      <div class="cap">${n0(vd.n)} observations &middot; ${cfg.trials > 1 ? `${cfg.trials} variants declared` : 'one variant'}</div>
      ${row('Sharpe above zero?', `${vd.sharpeAnnual.toFixed(2)} &plusmn; ${vd.sharpeSEAnnual.toFixed(2)}`, vd.sharpeAnnual > 0 ? 'yes' : 'no')}
      ${row('Significant, autocorrelation-adjusted?', `t ${vd.tNeweyWest.toFixed(2)} &middot; p ${vd.pNeweyWest < 0.001 ? '<0.001' : vd.pNeweyWest.toFixed(3)}`, sigNaive ? 'yes' : 'no')}
      ${row('Could this sample even see it?', `edge is ${vd.mdeRatio.toFixed(2)}&times; the MDE`, seesIt ? 'yes' : 'na')}
      ${dsrOK === null ? row('Deflated for multiple trials?', 'only one trial declared', 'na')
        : row('Survives the trials you ran?', `DSR ${(vd.deflated.dsr * 100).toFixed(0)}%`, dsrOK ? 'yes' : 'no')}
      ${row('Track record long enough?', Number.isFinite(vd.minTRL) ? `needs ${n0(vd.minTRL)}, has ${n0(vd.n)}` : 'never, at this Sharpe', Number.isFinite(vd.minTRL) && vd.minTRL <= vd.n ? 'yes' : 'no')}
    </div>`);
  }

  const p = res.props;
  const med = res.stats.cagr.median, p05 = res.stats.cagr.q[0.05];
  const dd = res.stats.maxDD;
  cards.push(`<div class="sc">
    <h4>The simulated future</h4>
    <div class="cap">${n0(res.n)} paths &middot; ${n0(res.horizon)} periods &middot; ${res.years.toFixed(1)} years</div>
    ${row('Median outcome', `${sgn(med)} a year`, med > 0 ? 'yes' : 'no')}
    ${row('Bad case (5th percentile)', `${sgn(p05)} a year`, p05 > 0 ? 'yes' : 'no')}
    ${row('Chance of ending down', pctSmart(p.loss.p), p.loss.p < 0.5 ? 'yes' : 'no')}
    ${row('Typical worst drawdown', pct(dd.median), dd.median < 0.25 ? 'yes' : dd.median < 0.5 ? 'mid' : 'no')}
    ${row('Chance of ruin', p.ruin.p === 0 ? 'none in this run' : pctSmart(p.ruin.p), p.ruin.p === 0 ? 'yes' : p.ruin.p < 0.01 ? 'mid' : 'no')}
  </div>`);

  $('#score').innerHTML = cards.join('');
}

/* ---------------- tiles ---------------- */
export function renderTiles(res, vd) {
  const s = res.stats, p = res.props;
  const tile = (k, v, n, mod = '') => `<div class="m ${mod}"><div class="k">${k}</div>
    <div class="v">${v}</div><div class="n">${n}</div></div>`;
  const se = x => x != null && Number.isFinite(x) ? `&plusmn;${(x * 100).toFixed(2)}pp` : '';
  const out = [];
  out.push(tile('Median CAGR', sgn(s.cagr.median), `5th–95th: ${sgn(s.cagr.q[0.05])} to ${sgn(s.cagr.q[0.95])}`,
    s.cagr.median > 0 ? 'good' : 'flag'));
  out.push(tile('Median terminal', x2(s.terminal.median), `1st pct ${x2(s.terminal.q[0.01])} · 99th ${x2(s.terminal.q[0.99])}`));
  out.push(tile('Median max drawdown', pct(s.maxDD.median), `95th pct ${pct(s.maxDD.q[0.95])}`,
    s.maxDD.median > 0.4 ? 'flag' : ''));
  out.push(tile('Chance of a loss', pctSmart(p.loss.p),
    p.loss.k === 0 ? `no path ended below its start` : `${n0(p.loss.k)} of ${n0(res.n)} paths`));
  out.push(tile('Chance of ruin', pctSmart(p.ruin.p),
    p.ruin.p === 0 ? 'no path was wiped out' : `${n0(p.ruin.k)} of ${n0(res.n)} paths wiped out`,
    p.ruin.p > 0.005 ? 'flag' : ''));
  out.push(tile('Median Sharpe', s.sharpe.median.toFixed(2), `5th–95th: ${s.sharpe.q[0.05].toFixed(2)} to ${s.sharpe.q[0.95].toFixed(2)}`));
  out.push(tile('Longest drawdown', n0(s.maxDDDuration.median) + ' periods',
    `95th pct ${n0(s.maxDDDuration.q[0.95])}`));
  out.push(tile('Time below the last peak', pct(s.timeUnderwater.median, 0),
    'median share of the horizon spent below a previous high — normal even for a winning path'));
  $('#tiles').innerHTML = out.join('');
}

/* ---------------- part 1 ---------------- */
/** Part 1 simulates whatever edge the sample contained. If Part 2 says that edge
 *  may not be real, every optimistic number above is simulating a fiction -- and
 *  that connection is the easiest one in the world to miss while reading a fan
 *  chart that curves pleasantly upwards. */
export function renderInheritNote(vd, cfg, modelId) {
  const host = $('#inheritNote');
  if (!host) return;
  if (!vd) { host.innerHTML = ''; return; }
  const RESAMPLERS = new Set(['iid', 'permute', 'block', 'circblock', 'movblock', 'replay']);
  const resampling = RESAMPLERS.has(modelId);
  const weak = [];
  if (vd.deflated && vd.deflated.dsr < 0.95) weak.push(`a Deflated Sharpe of only <b>${(vd.deflated.dsr * 100).toFixed(0)}%</b> after the ${cfg.trials} variants you declared`);
  if (vd.mdeRatio < 1) weak.push(`an observed edge <b>${vd.mdeRatio.toFixed(2)}&times;</b> the smallest this sample could resolve`);
  if (vd.pNeweyWest >= 0.05) weak.push(`a p-value of <b>${vd.pNeweyWest.toFixed(3)}</b> once autocorrelation is allowed for`);
  if (!weak.length) { host.innerHTML = ''; return; }
  host.innerHTML = `<div class="msg bad" style="margin-top:10px"><b>Read this before the charts below.</b>
    ${resampling
      ? 'These paths are resampled from your series, so they inherit its apparent edge exactly.'
      : 'These paths come from a model fitted to your series, so they inherit its apparent edge.'}
    Part&nbsp;2 reports ${weak.join(', and ')}.
    If the edge is not real, every optimistic number below is a simulation of a fiction &mdash; the median
    return, the probability of a loss and the leverage ladder all scale with a drift that may be noise.
    <b>Nothing a Monte Carlo can do will fix that</b>, because the drift is an input, not a finding.</div>`;
}

export function renderPaths(res, cfg, tail) {
  $('#p1sub').textContent = `${n0(res.n)} paths · ${n0(res.horizon)} periods`;
  C.legend($('#fanLeg'), [
    { color: C.BAND[4], label: '25–75%' },
    { color: C.BAND[2], label: '5–95%' },
    { color: C.BAND[0], label: '1–99%' },
    { color: '#17407a', label: 'median' },
    { color: 'var(--ink)', label: 'sample paths' },
  ]);
  C.fanChart($('#fan'), {
    grid: res.grid, bands: res.bands, samples: res.samples,
    height: 340, xLabel: 'periods', yLabel: 'equity (multiple of start)',
  });
  // The single most important caveat on the page, with its number computed.
  const tn = $('#tailNote');
  if (tail && tail.t) {
    const f = v => (v * 100).toFixed(2) + '%';
    tn.innerHTML = `<div class="msg warn"><b>This model cannot produce a worse day than ${f(tail.worst)}.</b>
      A resampling model draws only values that already happened, so your sample's worst period is a hard
      ceiling &mdash; and over ${n0(tail.horizon)} periods it lands in ${pct(tail.pIncluded, 0)} of paths,
      which is why the simulated worst day collapses onto it.
      A Student-t fitted to the same data (df ${tail.t.df}) says the typical worst day is ${f(tail.t.q50)},
      but one path in ten sees ${f(tail.t.q10)} and one in a hundred sees <b>${f(tail.t.q01)}</b> &mdash;
      worse than this bootstrap can ever generate.
      <b>The event you need to survive is, by construction, not in this chart.</b>
      Switch the model to Student-t, jump diffusion or GARCH to put it back.</div>`;
  } else if (tail) {
    tn.innerHTML = `<div class="msg warn"><b>Worst possible simulated period: ${(tail.worst * 100).toFixed(2)}%.</b>
      A resampling model can only draw values that already happened, so your sample's worst period is a
      hard ceiling on the tail however many paths you run.</div>`;
  } else { tn.innerHTML = ''; }

  const b1 = res.bands.find(b => b.p === 0.01), b99 = res.bands.find(b => b.p === 0.99);
  const last = res.grid.length - 1;
  $('#fanFoot').innerHTML = `At the end of the horizon the middle half of paths land between
    <b>${x2(Math.exp(res.bands.find(b => b.p === 0.25).values[last]))}</b> and
    <b>${x2(Math.exp(res.bands.find(b => b.p === 0.75).values[last]))}</b>; one path in a hundred does worse than
    <b>${x2(Math.exp(b1.values[last]))}</b> and one in a hundred better than <b>${x2(Math.exp(b99.values[last]))}</b>.
    Bands are computed from ${n0(res.bandPaths)} retained paths; the metrics above use all ${n0(res.n)}.`;

  const h = res.hist.terminal;
  C.histogram($('#histTerm'), {
    counts: h.counts, edges: h.edges, height: 250, color: 'var(--s1)',
    xFmt: v => x2(Math.exp(v)), xLabel: 'terminal equity (log scale)', total: res.n,
    markers: [
      { at: 0, label: 'break even', color: 'var(--bad)', row: 0 },
      { at: Math.log(res.stats.terminal.median), label: 'median', color: 'var(--ink)', row: 1 },
    ],
  });

  const d = res.hist.maxDD;
  C.histogram($('#histDD'), {
    counts: d.counts, edges: d.edges, height: 250, color: '#b8cfe9',
    xFmt: v => pct(v, 0), xLabel: 'worst peak-to-trough fall', total: res.n,
    markers: [
      { at: res.stats.maxDD.median, label: 'median', color: 'var(--ink)', row: 0 },
      { at: res.stats.maxDD.q[0.95], label: '95th', color: 'var(--s2)', row: 1 },
    ],
  });

  C.scatter($('#scatterDD'), {
    x: res.scatter.maxDD, y: res.scatter.cagr, height: 290,
    xLabel: 'worst drawdown', yLabel: 'CAGR',
    xFmt: v => pct(v, 0), yFmt: v => pct(v, 0),
    markers: [{ y: 0, label: 'break even', color: 'var(--bad)' }],
  });

  const uw = res.underwater;
  C.lineChart($('#uwChart'), {
    series: [{ name: 'under water', x: res.grid, y: Array.from(uw), color: 'var(--s1)' }],
    height: 290, xLabel: 'periods', yLabel: 'share of paths below the start',
    yFmt: v => pct(v, 0), zeroLine: true,
  });
}

/* ---------------- part 2 ---------------- */
export function renderEvidence(res, vd, cfg, nullRes) {
  if (!vd) {
    $('#p2note').textContent = 'Attach a return series to test. A strategy run on a generated market has no observed sample to test against.';
    for (const id of ['#nullChart', '#powerChart', '#dsrChart']) $(id).innerHTML = '<div class="hint" style="padding:30px 0;text-align:center">needs an attached series</div>';
    $('#nullFoot').textContent = ''; $('#powerFoot').textContent = ''; $('#dsrFoot').textContent = '';
    return;
  }
  $('#p2note').innerHTML = `These tests look at the <b>attached series</b>, not the simulation.
    A bootstrap inherits whatever edge your sample happened to contain, so it can never tell you the edge
    was real &mdash; only this can.`;

  C.nullVsObserved($('#nullChart'), {
    dist: nullRes.dist, obs: nullRes.obs, pval: nullRes.p, height: 240,
    xLabel: 'annualised Sharpe when the signs are shuffled',
  });
  $('#nullFoot').innerHTML = `Each shuffle flips the sign of every return at random, which destroys any
    edge but keeps the exact distribution of magnitudes. Your observed Sharpe of
    <b>${nullRes.obs.toFixed(2)}</b> was beaten by <b>${(nullRes.p * 100).toFixed(1)}%</b> of
    ${n0(nullRes.dist.length)} shuffles.
    ${nullRes.p < 0.05
      ? `That is unlikely to be chance <i>for a single test</i>${cfg.trials > 1
          ? ' — but this test knows nothing about the other variants you tried. The deflation below does.'
          : '.'}`
      : 'That is well inside what chance produces.'}`;

  // power curve: detection probability against true Sharpe
  const xs = [], ys = [], ys2 = [];
  for (let i = 0; i <= 60; i++) {
    const srAnn = i / 60 * 2.0;
    const perPeriod = srAnn / Math.sqrt(vd.ppy);
    xs.push(srAnn);
    ys.push(T.power(perPeriod * vd.sdPeriod, vd.sdPeriod, vd.n, 0.05));
    ys2.push(T.power(perPeriod * vd.sdPeriod, vd.sdPeriod, vd.n * 4, 0.05));
  }
  C.lineChart($('#powerChart'), {
    series: [
      { name: `n = ${n0(vd.n)}`, x: xs, y: ys, color: 'var(--s1)' },
      { name: `4× the data`, x: xs, y: ys2, color: 'var(--s3)', dash: '5 3' },
    ],
    height: 240, xLabel: 'true annualised Sharpe', yLabel: 'chance of detecting it',
    xFmt: v => v.toFixed(1), yFmt: v => pct(v, 0), zeroLine: true,
  });
  $('#powerFoot').innerHTML = `With ${n0(vd.n)} observations this sample can resolve an edge of
    <b>${vd.mdeAnnualSharpe.toFixed(2)} Sharpe</b> at 80% power. You observed
    <b>${vd.sharpeAnnual.toFixed(2)}</b>.
    ${vd.mdeRatio >= 1
      ? 'The sample is large enough to see an edge this size, so a significant result here means something.'
      : `<b>The sample cannot resolve an edge this small.</b> A null result would tell you nothing — the test was never able to see it. You would need roughly ${n0(T.periodsNeeded(vd.sharpePeriod))} observations.`}`;

  // DSR: observed Sharpe against the best-of-N noise bar, as trials grow
  const trialsAxis = [], bar = [];
  for (let k = 1; k <= 48; k++) {
    const nT = Math.round(Math.pow(10, k / 16));
    if (trialsAxis.length && nT === trialsAxis[trialsAxis.length - 1]) continue;
    trialsAxis.push(nT);
    bar.push(T.expectedMaxSharpe(Math.max(2, nT), vd.sharpeSE * vd.sharpeSE) * Math.sqrt(vd.ppy));
  }
  C.lineChart($('#dsrChart'), {
    series: [
      { name: 'noise bar', x: trialsAxis, y: bar, color: 'var(--s2)', dash: '5 3' },
      { name: 'your Sharpe', x: trialsAxis, y: trialsAxis.map(() => vd.sharpeAnnual), color: 'var(--s1)' },
    ],
    height: 250, xLabel: 'number of variants tried', yLabel: 'annualised Sharpe',
    xFmt: v => v >= 1000 ? (v / 1000).toFixed(0) + 'k' : String(v), yFmt: v => v.toFixed(2), zeroLine: true,
  });
  let crossing = null;
  for (let i = 0; i < bar.length; i++) if (bar[i] >= vd.sharpeAnnual) { crossing = trialsAxis[i]; break; }
  $('#dsrFoot').innerHTML = `${vd.deflated
      ? `Deflating for the <b>${cfg.trials}</b> variants you declared leaves a Deflated Sharpe of
         <b>${(vd.deflated.dsr * 100).toFixed(1)}%</b> &mdash; the probability the true Sharpe beats the best
         of ${cfg.trials} noise trials. ` : 'You declared a single trial, so nothing is deflated. '}
    ${crossing
      ? `Pure noise reaches your Sharpe of ${vd.sharpeAnnual.toFixed(2)} as the best of about <b>${n0(crossing)}</b> trials.
         If you tested more variants than that before settling here, you have no evidence left.`
      : `Even the best of ${n0(trialsAxis[trialsAxis.length - 1])} noise trials would not reach your Sharpe on this sample length.`}
    ${vd.haircut ? ` A Benjamini–Hochberg–Yekutieli haircut takes your t of ${vd.tNaive.toFixed(2)} down to
      <b>${vd.haircut.tBHY.toFixed(2)}</b>.` : ''}`;
}

/* ---------------- part 3 ---------------- */
export function renderLadder(res, cfg) {
  if (!res.ladder) return;
  const L = res.ladder;
  const xs = L.map(r => r.leverage);
  const pc0 = v => (v >= 0 ? '+' : '') + v.toFixed(0) + '%';
  const pc1 = v => v.toFixed(v >= 10 || v <= -10 ? 0 : 1) + '%';
  C.smallMultiples($('#ladderFacets'), [
    { title: 'Median CAGR', sub: 'the typical outcome', x: xs, y: L.map(r => r.medianCagr * 100), color: 'var(--s1)', points: true, yFmt: pc0 },
    { title: 'Mean log growth', sub: 'what Kelly maximises', x: xs, y: L.map(r => r.meanLogGrowth), color: 'var(--s1)', points: true, yFmt: v => v.toFixed(2) },
    { title: '5th percentile CAGR', sub: 'the bad case', x: xs, y: L.map(r => r.p05Cagr * 100), color: 'var(--s2)', points: true, yFmt: pc0 },
    { title: 'Mean max drawdown', sub: 'what you have to sit through', x: xs, y: L.map(r => r.maxDD * 100), color: 'var(--s2)', points: true, yFmt: pc1 },
    { title: 'Probability of ruin', sub: 'wiped out before the end', x: xs, y: L.map(r => r.ruin * 100), color: 'var(--bad)', points: true,
      yFmt: pc1, flatNote: v => v === 0 ? 'No path was ruined at any leverage on this ladder.' : `${pc1(v)} at every leverage.` },
  ], { cols: 3, height: 142, sharedY: false, xFmt: v => v + 'x', yFmt: v => v.toFixed(2) });

  const best = L.reduce((a, b) => b.meanLogGrowth > a.meanLogGrowth ? b : a, L[0]);
  const tb = $('#ladderTab').querySelector('tbody');
  tb.innerHTML = L.map(r => `<tr class="${r === best ? 'hl' : ''}">
    <td>${r.leverage}x${r === best ? ' <span class="dim">&larr; growth-optimal</span>' : ''}</td>
    <td class="${cls(r.medianCagr)}">${sgn(r.medianCagr)}</td>
    <td class="${cls(r.p05Cagr)}">${sgn(r.p05Cagr)}</td>
    <td>${r.meanLogGrowth.toFixed(3)}</td>
    <td>${pct(r.maxDD)}</td>
    <td class="${r.ruin > 0.01 ? 'neg' : 'dim'}">${pctSmart(r.ruin)}</td></tr>`).join('');

  const half = L.reduce((a, b) => Math.abs(b.leverage - best.leverage / 2) < Math.abs(a.leverage - best.leverage / 2) ? b : a, L[0]);
  $('#ladderFoot').innerHTML = `Growth peaks at <b>${best.leverage}x</b>, where the median path compounds at
    ${sgn(best.medianCagr)} a year and the mean worst drawdown is <b>${pct(best.maxDD)}</b>.
    At <b>${half.leverage}x</b> &mdash; roughly half of that &mdash; growth falls to ${sgn(half.medianCagr)} while the
    mean drawdown drops to ${pct(half.maxDD)}. Half Kelly gives up about a quarter of the growth for
    roughly half the drawdown, which is why almost nobody sensible runs full Kelly.
    ${best.ruin > 0 ? `<b>Note the ruin column.</b>` : ''}`;
}

/* ---------------- part 5 ---------------- */
export function renderDiagnostics(res, source, cfg) {
  const cv = res.convergence.logGrowth;
  if (cv) {
    C.lineChart($('#convChart'), {
      series: [{ name: 'mean log growth', x: cv.x, y: cv.y, color: 'var(--s1)' }],
      bandsFor: [{ x: cv.x, lo: cv.lo, hi: cv.hi }],
      height: 250, xLabel: 'paths simulated', yLabel: 'mean log growth',
      xFmt: v => v >= 1000 ? (v / 1000).toFixed(0) + 'k' : String(v), yFmt: v => v.toFixed(3), zeroLine: false,
    });
    const rel = Math.abs(cv.finalSE / (cv.final || 1));
    $('#convFoot').innerHTML = `After ${n0(res.n)} paths the estimate is
      <b>${cv.final.toFixed(4)} &plusmn; ${(1.96 * cv.finalSE).toFixed(4)}</b> (95%).
      ${rel < 0.01 ? 'The band is tight: more paths would not move the answer.'
        : rel < 0.05 ? 'Reasonably converged — add paths before splitting hairs over the third digit.'
        : '<b>Not converged.</b> The band is still wide relative to the estimate; add paths.'}
      Monte Carlo error falls as 1/&radic;N, so four times the paths halves it.`;
  }

  if (source && source.length > 30) {
    const a = S.sorted(source);
    const n = a.length;
    const theo = new Float64Array(n);
    const m = S.mean(source), sdv = S.sd(source);
    for (let i = 0; i < n; i++) theo[i] = m + sdv * S.normalInv((i + 0.5) / n);
    const step = Math.max(1, Math.floor(n / 900));
    const ss = [], tt = [];
    for (let i = 0; i < n; i += step) { ss.push(a[i]); tt.push(theo[i]); }
    C.qqPlot($('#qqChart'), { sample: ss, theoretical: tt, height: 290 });
    const mo = S.moments(source);
    const jb = S.jarqueBera(source);
    $('#qqFoot').innerHTML = `Skew <b>${mo.skew.toFixed(2)}</b>, excess kurtosis <b>${mo.kurtosis.toFixed(1)}</b>.
      Jarque–Bera p ${jb.p < 0.001 ? '&lt; 0.001' : jb.p.toFixed(3)}.
      ${jb.p < 0.01
        ? 'Your returns are <b>not normal</b>. Points bending below the line on the left mean the real left tail is fatter than a normal model admits — simulate with Student-t, a jump model or a bootstrap, not with the normal.'
        : 'Close enough to normal that the choice of tail model will not change much.'}`;

    const ac = S.acf(source, 20);
    const sq = Float64Array.from(source, v => v * v);
    const acSq = S.acf(sq, 20);
    const lagsX = Array.from({ length: 20 }, (_, i) => i + 1);
    C.legend($('#acfLeg'), [
      { color: 'var(--s1)', label: 'returns' },
      { color: 'var(--s2)', label: 'squared returns (volatility clustering)' },
    ]);
    C.lineChart($('#acfChart'), {
      series: [
        { name: 'returns', x: lagsX, y: lagsX.map(k => ac[k]), color: 'var(--s1)', points: true },
        { name: 'squared', x: lagsX, y: lagsX.map(k => acSq[k]), color: 'var(--s2)', points: true },
      ],
      height: 250, xLabel: 'lag', yLabel: 'autocorrelation', yFmt: v => v.toFixed(2), zeroLine: true,
    });
    const lb = S.ljungBox(source, 10), lbSq = S.ljungBox(sq, 10);
    const { optimalBlockLength } = window.__mcGen || {};
    $('#acfFoot').innerHTML = `Ljung–Box on returns: p ${lb.p < 0.001 ? '&lt; 0.001' : lb.p.toFixed(3)}
      ${lb.p < 0.05 ? '(returns are serially dependent)' : '(no detectable dependence in the returns themselves)'}.
      On squared returns: p ${lbSq.p < 0.001 ? '&lt; 0.001' : lbSq.p.toFixed(3)}
      ${lbSq.p < 0.05
        ? '— <b>volatility clusters</b>. An IID bootstrap will understate your drawdowns; use the stationary bootstrap or GARCH.'
        : '— no clustering detected, so an IID bootstrap is defensible here.'}`;
  } else {
    $('#qqChart').innerHTML = '<div class="hint" style="padding:30px 0;text-align:center">needs an attached series</div>';
    $('#acfChart').innerHTML = '<div class="hint" style="padding:30px 0;text-align:center">needs an attached series</div>';
    $('#qqFoot').textContent = ''; $('#acfFoot').textContent = '';
  }
}

/* ---------------- percentile table ---------------- */
export function renderTable(res) {
  const rows = percentileRows(res);
  const tb = $('#pctTab').querySelector('tbody');
  tb.innerHTML = rows.map(({ label, fmt, s }) => `<tr>
    <td>${label}</td>
    ${PCTS.map(p => `<td>${fmt(s.q[p])}</td>`).join('')}
    <td class="str">${fmt(s.mean)}</td>
    <td class="dim">${Number.isFinite(s.medianSE) ? fmt(s.medianSE) : '&ndash;'}</td></tr>`).join('');
}

/* ---------------- model comparison ---------------- */
export function renderComparison(list) {
  const panels = list.map(r => ({
    title: MODELS[r.id] ? MODELS[r.id].label : r.id,
    sub: `${(r.medianCagr * 100).toFixed(1)}%/yr`,
    x: r.grid, y: Array.from(r.medianBand, v => Math.exp(v)),
    color: 'var(--s1)',
  }));
  C.smallMultiples($('#cmpFacets'), panels, {
    cols: 3, height: 136, sharedY: true,
    xFmt: v => String(Math.round(v)), yFmt: v => v.toFixed(1),
  });
  const tb = $('#cmpTab').querySelector('tbody');
  const base = list[0];
  tb.innerHTML = list.map(r => `<tr>
    <td>${MODELS[r.id] ? MODELS[r.id].label : r.id}</td>
    <td class="${cls(r.medianCagr)}">${sgn(r.medianCagr)}</td>
    <td class="${cls(r.p05Cagr)}">${sgn(r.p05Cagr)}</td>
    <td>${pct(r.medianDD)}</td>
    <td>${pct(r.p95DD)}</td>
    <td>${pctSmart(r.pLoss)}</td>
    <td class="${r.pRuin > 0.01 ? 'neg' : 'dim'}">${pctSmart(r.pRuin)}</td></tr>`).join('');

  const ddSpread = Math.max(...list.map(r => r.p95DD)) - Math.min(...list.map(r => r.p95DD));
  const cagrSpread = Math.max(...list.map(r => r.medianCagr)) - Math.min(...list.map(r => r.medianCagr));
  const worst = list.reduce((a, b) => b.p95DD > a.p95DD ? b : a, list[0]);
  const bestM = list.reduce((a, b) => b.p95DD < a.p95DD ? b : a, list[0]);
  $('#cmpFoot').innerHTML = `Median CAGR moves by <b>${(cagrSpread * 100).toFixed(1)} percentage points</b>
    across these models and the 95th-percentile drawdown by <b>${(ddSpread * 100).toFixed(1)} points</b> —
    from ${pct(bestM.p95DD)} under ${MODELS[bestM.id] ? MODELS[bestM.id].label : bestM.id}
    to ${pct(worst.p95DD)} under ${MODELS[worst.id] ? MODELS[worst.id].label : worst.id}.
    ${ddSpread > 0.12
      ? '<b>The tail is a modelling choice here, not a fact.</b> Quote the pessimistic one, or say which model you used every time you quote a drawdown.'
      : 'The models broadly agree, which is the best case: the conclusion does not hinge on the tail assumption.'}`;
}
