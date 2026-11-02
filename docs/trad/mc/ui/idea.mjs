/* idea.mjs -- the "test an idea" flow: controls, worker, rendering. */
import * as C from './charts.mjs';
import { IDEA_EXAMPLES } from '../lib/ideatest.mjs';
import { extractParamSpec, expandGrid } from '../lib/strategylab.mjs';
import * as S from '../lib/stats.mjs';

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n0 = v => Math.round(v).toLocaleString();
const pct = (v, d = 1) => (v * 100).toFixed(d) + '%';
const sgn = (v, d = 1) => (v > 0 ? '+' : '') + (v * 100).toFixed(d) + '%';
const f2 = v => Number.isFinite(v) ? v.toFixed(2) : '—';

export function initIdea(ctx) {
  // ctx supplies: getRealSeries(), loadReal(), sendToMonteCarlo(returns, label)
  const ST = { market: null, marketLabel: '', benchmark: null, marketId: null, last: null, running: false };

  $('#ideaEx').innerHTML = Object.entries(IDEA_EXAMPLES)
    .map(([id, e]) => `<option value="${id}">${esc(e.label)}</option>`).join('');
  $('#ideaBox').value = IDEA_EXAMPLES.momentum.code;
  $('#ideaEx').addEventListener('change', () => {
    $('#ideaBox').value = IDEA_EXAMPLES[$('#ideaEx').value].code;
    refreshGrid();
  });
  $('#ideaBox').addEventListener('input', refreshGrid);

  const bind = (id, fmt) => { const i = $('#' + id), o = $('#' + id + 'O');
    const u = () => o.textContent = fmt(+i.value); i.addEventListener('input', u); u(); };
  bind('ideaFolds', v => String(v));
  bind('ideaIS', v => (v * 100).toFixed(0) + '%');
  bind('ideaRadius', v => v + ' step' + (v > 1 ? 's' : ''));

  function refreshGrid() {
    const spec = extractParamSpec($('#ideaBox').value);
    if (!spec) { $('#ideaGrid').innerHTML = '<span class="neg">no PARAMS block found</span>'; return null; }
    const n = expandGrid(spec).length;
    const names = Object.keys(spec).join(', ');
    $('#ideaGrid').innerHTML = `<b>${n0(n)}</b> combination${n === 1 ? '' : 's'} over ${esc(names)}` +
      (n > 2000 ? ' <span class="neg">— that is a lot of trials to deflate for</span>' : '');
    return spec;
  }

  async function renderMarkets() {
    const real = await ctx.loadReal().catch(() => null);
    if (!real) { $('#ideaMarket').innerHTML = '<button class="chip" id="ideaLoadReal">Load real market data</button>';
      $('#ideaLoadReal').addEventListener('click', renderMarkets); return; }
    // only the full-day series make sense as a market to trade
    const entries = Object.entries(real.series).filter(([id]) => /_full$/.test(id));
    $('#ideaMarket').innerHTML = entries.map(([id, e]) =>
      `<button class="chip" data-mk="${id}" aria-pressed="${id === ST.marketId}">${esc(e.label.split('—')[0].trim())}</button>`).join('');
    $$('#ideaMarket button').forEach(b => b.addEventListener('click', () => pickMarket(real, b.dataset.mk)));
    if (!ST.marketId) pickMarket(real, entries[0][0]);
  }

  function pickMarket(real, id) {
    const e = real.series[id];
    ST.market = Float64Array.from(e.r);
    ST.benchmark = ST.market;            // buy and hold the same thing
    ST.marketId = id; ST.marketLabel = e.label;
    const m = S.moments(ST.market);
    $('#ideaMarketNote').innerHTML = `${esc(e.label)} · <b>${n0(e.n)}</b> trading days,
      ${e.from} to ${e.to} · buy-and-hold Sharpe
      <b>${(m.mean / m.sd * Math.sqrt(252)).toFixed(2)}</b>. Your idea has to beat that.`;
    $$('#ideaMarket button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mk === id)));
  }

  let worker = null;
  function getWorker() {
    if (!worker) worker = new Worker(new URL('../ideaworker.mjs', import.meta.url), { type: 'module' });
    return worker;
  }

  $('#ideaRun').addEventListener('click', run);
  async function run() {
    if (ST.running) return;
    const spec = refreshGrid();
    if (!spec) { $('#ideaMsg').innerHTML = `<div class="msg bad"><b>No <code>PARAMS</code> block.</b> Declare the ranges the tester may search.</div>`; return; }
    if (!ST.market) { $('#ideaMsg').innerHTML = `<div class="msg bad">Pick a market first.</div>`; return; }
    ST.running = true;
    $('#ideaRun').disabled = true;
    $('#ideaMsg').innerHTML = '';
    $('#runStat').textContent = 'testing...';

    const id = Math.random().toString(36).slice(2);
    const w = getWorker();
    const onMsg = (e) => {
      if (e.data.id !== id) return;
      if (e.data.type === 'progress') {
        $('#progBar').style.width = (e.data.p * 100).toFixed(0) + '%';
        $('#runStat').textContent = e.data.label;
      } else if (e.data.type === 'done') {
        w.removeEventListener('message', onMsg);
        ST.running = false; $('#ideaRun').disabled = false;
        $('#progBar').style.width = '100%';
        ST.last = e.data.res;
        render(e.data.res);
        $('#runStat').textContent = `${e.data.res.gates.passed} of ${e.data.res.gates.total} gates passed`;
        $('#ideaResults').hidden = false;
        $('#ideaResults').scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (e.data.type === 'error') {
        w.removeEventListener('message', onMsg);
        ST.running = false; $('#ideaRun').disabled = false;
        $('#ideaMsg').innerHTML = `<div class="msg bad"><b>Could not run.</b> ${esc(e.data.message)}</div>`;
        $('#runStat').textContent = 'failed';
      }
    };
    w.addEventListener('message', onMsg);
    w.postMessage({
      id, src: $('#ideaBox').value,
      market: Array.from(ST.market), benchmark: Array.from(ST.benchmark),
      opts: {
        folds: +$('#ideaFolds').value, isFraction: +$('#ideaIS').value,
        anchored: $('#ideaWindow').value === 'anchored',
        objective: $('#ideaObj').value, bpsPerTurnover: +$('#ideaCost').value,
        radius: +$('#ideaRadius').value, ppy: 252, seed: +($('#seed').value || 1),
      },
    });
  }

  $('#ideaToMC').addEventListener('click', () => {
    if (ST.last && ST.last.oosReturns) {
      ctx.sendToMonteCarlo(Float64Array.from(ST.last.oosReturns),
        `walk-forward out-of-sample (${ST.marketLabel})`, ST.last.gridSize);
    }
  });

  renderMarkets();
  refreshGrid();
  return ST;
}

/* ---------------- rendering ---------------- */
function render(r) {
  renderGates(r);
  renderWalkForward(r);
  renderSensitivity(r);
  renderStats(r);
}

function renderGates(r) {
  const g = r.gates;
  $('#ideaVerdictSub').textContent = `${g.passed} of ${g.total} gates passed · ${n0(r.gridSize)} combinations searched`;
  $('#ideaVerdictH').textContent = g.blocking ? 'No — and nothing below counts'
    : g.allPassed ? 'It survived every test' : `It failed ${g.total - g.passed} of ${g.total} gates`;

  $('#ideaBlock').innerHTML = g.blocking
    ? `<div class="msg bad" style="margin-top:10px"><b>Blocked: this rule uses information it would not have had.</b>
       Every number below is fiction, including the good ones — and notice how good they are. That is the
       point: look-ahead passes almost every other test. Fix the rule so it only reads
       <code>market[0..t-1]</code>, then run it again.</div>`
    : g.allPassed
      ? `<div class="msg ok" style="margin-top:10px"><b>All ${g.total} gates passed.</b> That is rare and it is
         not a licence to trade — it means the idea is worth a forward test on paper, with the position size
         you would actually use. Check the out-of-sample drawdown below before you decide that size.</div>`
      : `<div class="msg warn" style="margin-top:10px"><b>${g.total - g.passed} gate${g.total - g.passed === 1 ? '' : 's'} failed.</b>
         The failures are the informative part — each one below says what it was testing and why it matters.</div>`;

  $('#ideaGates').innerHTML = g.gates.map(x => `
    <div class="gate ${x.pass ? '' : 'fail'}">
      <span class="mk ${x.pass ? 'yes' : 'no'}">${x.pass ? '✓' : '✕'}</span>
      <div class="gt"><div class="gl">${esc(x.label)}</div>
        <div class="gd">${esc(x.detail)}</div>
        <div class="gw">${esc(x.why)}</div></div>
    </div>`).join('');
}

function renderWalkForward(r) {
  const wf = r.walkForward;
  if (!wf || !wf.ok) { $('#wfFoot').innerHTML = `<span class="neg">${esc(wf?.note || 'walk-forward did not run')}</span>`; return; }
  const good = wf.results.filter(x => x.ok);
  const folds = good.map(x => x.fold + 1);

  C.legend($('#wfLeg'), [
    { color: 'var(--s1)', label: 'in sample (fitted)' },
    { color: 'var(--s2)', label: 'out of sample (what you would have got)' },
    { color: 'var(--s3)', label: 'best possible in hindsight' },
  ]);
  C.lineChart($('#wfChart'), {
    series: [
      { name: 'in sample', x: folds, y: good.map(x => x.isScore), color: 'var(--s1)', points: true },
      { name: 'out of sample', x: folds, y: good.map(x => x.oosScore), color: 'var(--s2)', points: true },
      { name: 'hindsight', x: folds, y: good.map(x => x.hindsightScore), color: 'var(--s3)', points: true, dash: '4 3' },
    ],
    height: 260, xLabel: 'fold', yLabel: r.objective, xFmt: v => String(Math.round(v)), yFmt: f2,
  });

  $('#wfTab').querySelector('tbody').innerHTML = good.map(x => `<tr>
    <td>${x.fold + 1}</td>
    <td class="dim">${n0(x.isLen)} periods</td>
    <td>${esc(Object.entries(x.params).map(([k, v]) => `${k}=${v}`).join(', '))}</td>
    <td>${f2(x.isScore)}</td>
    <td class="${x.oosScore > 0 ? 'pos' : 'neg'}">${f2(x.oosScore)}</td>
    <td class="dim">${f2(x.hindsightScore)}</td>
    <td class="dim">${Number.isFinite(x.isRankOfChosenOOS) ? `${x.isRankOfChosenOOS} of ${n0(r.gridSize)}` : '—'}</td></tr>`).join('');

  const driftBits = Object.entries(wf.drift).map(([k, d]) =>
    `<b>${esc(k)}</b> took ${d.distinct} distinct value${d.distinct === 1 ? '' : 's'} (${d.values.join(', ')})`);
  $('#wfFoot').innerHTML = `Walk-forward efficiency <b>${Number.isFinite(wf.efficiency) ? (wf.efficiency * 100).toFixed(0) + '%' : '—'}</b>
    — mean in-sample ${f2(wf.meanIS)} became mean out-of-sample ${f2(wf.meanOOS)}.
    ${wf.oosPositive} of ${wf.folds} folds were positive.
    The hindsight column is what the best possible choice would have scored on that same window; the gap to
    it is the cost of not knowing the future.
    ${driftBits.length ? `Across folds, ${driftBits.join('; ')}.` : ''}
    ${Object.values(wf.drift).some(d => d.distinct > Math.max(2, wf.folds * 0.6))
      ? ' <b>The chosen settings jump around</b>, which means the optimiser is fitting noise rather than finding a stable number.'
      : ' The chosen settings are reasonably stable, which is what you want to see.'}`;

  // the stitched out-of-sample equity curve
  const oos = r.oosReturns || [];
  if (oos.length) {
    let eq = 1; const curve = [0]; const xs = [0];
    for (let i = 0; i < oos.length; i++) { eq *= 1 + oos[i]; curve.push(Math.log(Math.max(eq, 1e-12))); xs.push(i + 1); }
    C.lineChart($('#wfEquity'), {
      series: [{ name: 'out of sample', x: xs, y: curve, color: 'var(--s2)' }],
      height: 280, xLabel: 'out-of-sample periods', yLabel: 'equity (log)',
      yFmt: v => Math.exp(v).toFixed(2) + 'x', zeroLine: true,
    });
    const m = r.oosMetrics;
    $('#wfEqFoot').innerHTML = m ? `Over ${n0(oos.length)} out-of-sample periods: terminal
      <b>${m.terminal.toFixed(2)}x</b>, CAGR <b>${sgn(m.cagr)}</b>, Sharpe <b>${f2(m.sharpe)}</b>,
      worst drawdown <b>${pct(m.maxDD)}</b>${r.benchmark ? `, against buy and hold at ${sgn(r.benchmark.stats.cagr)} and ${pct(r.benchmark.stats.maxDD)} over the same periods` : ''}.` : '';
  }
}

function renderSensitivity(r) {
  const se = r.sensitivity;
  if (!se || !se.ok) { $('#sensFoot').innerHTML = `<span class="neg">${esc(se?.note || 'sensitivity did not run')}</span>`; return; }
  const keys = Object.keys(se.profiles);
  C.smallMultiples($('#sensProfiles'), keys.map(k => {
    const p = se.profiles[k];
    return { title: k, sub: `chosen ${se.chosen[k]}${p.atEdge ? ' · at the edge' : ''}`,
      x: p.values, y: p.points.map(q => q.score), color: p.atEdge ? 'var(--s2)' : 'var(--s1)',
      points: true, mark: se.chosen[k], yFmt: f2 };
  }), { cols: Math.min(3, Math.max(1, keys.length)), height: 160, sharedY: false,
        xFmt: v => String(v), yFmt: f2 });

  const tile = (k, v, n, mod = '') => `<div class="m ${mod}"><div class="k">${k}</div>
    <div class="v">${v}</div><div class="n">${n}</div></div>`;
  $('#sensTiles').innerHTML = [
    tile('Verdict', se.verdict.label, `${n0(se.neighbourCount)} neighbours tested`,
      se.verdict.label === 'plateau' ? 'good' : se.verdict.label === 'spike' ? 'flag' : ''),
    tile('Neighbours holding up', pct(se.plateauScore, 0), 'keep at least half the score',
      se.plateauScore >= 0.8 ? 'good' : se.plateauScore < 0.5 ? 'flag' : ''),
    tile('Worst neighbour', f2(se.worstNeighbour), `chosen is ${f2(se.chosenScore)}`),
    tile('Rank in the full grid', `${n0(se.gridRank)} / ${n0(se.gridValid)}`,
      `grid median ${f2(se.gridMedian)}`, se.gridRank === 1 ? 'flag' : ''),
  ].join('');

  const scores = se.neighbours.filter(x => Number.isFinite(x.score)).map(x => x.score);
  if (scores.length > 3) {
    const h = S.histogram(Float64Array.from(scores), Math.min(24, Math.max(6, scores.length)));
    C.histogram($('#sensHist'), {
      counts: h.counts, edges: h.edges, height: 210, color: '#b8cfe9', total: scores.length,
      xLabel: `${r.objective} across the neighbourhood`, yLabel: 'settings', xFmt: f2,
      markers: [{ at: se.chosenScore, label: 'chosen', color: 'var(--s2)', dash: '0', anchor: 'end' }],
    });
  }

  $('#sensFoot').innerHTML = `<b>${esc(se.verdict.label)}.</b> ${esc(se.verdict.why)}
    ${se.anyAtEdge.length
      ? ` <b>${esc(se.anyAtEdge.join(', '))}</b> ${se.anyAtEdge.length === 1 ? 'sits' : 'sit'} at the edge of the
          range you gave — the optimiser wanted to keep going and was stopped by your limits, not by the data.
          Widen the range and run it again before believing the number.`
      : ''}
    ${se.gridRank === 1
      ? ' The chosen point is the maximum of the whole grid, which is exactly what the Deflated Sharpe above is correcting for.'
      : ''}`;
}

function renderStats(r) {
  const v = r.verdictStats, m = r.oosMetrics;
  if (!v || !m) { $('#ideaStatFoot').innerHTML = '<span class="neg">no out-of-sample series to test</span>'; return; }
  const tile = (k, val, n, mod = '') => `<div class="m ${mod}"><div class="k">${k}</div>
    <div class="v">${val}</div><div class="n">${n}</div></div>`;
  $('#ideaStatTiles').innerHTML = [
    tile('Out-of-sample Sharpe', f2(v.sharpeAnnual), `95%: ${f2(v.sharpeCI[0])} to ${f2(v.sharpeCI[1])}`,
      v.sharpeCI[0] > 0 ? 'good' : 'flag'),
    tile('Significance', `p ${v.pNeweyWest < 0.001 ? '<0.001' : v.pNeweyWest.toFixed(3)}`,
      `t ${f2(v.tNeweyWest)}, autocorrelation-adjusted`, v.pNeweyWest < 0.05 ? 'good' : 'flag'),
    tile('Deflated Sharpe', v.deflated ? pct(v.deflated.dsr, 0) : '—',
      `after ${n0(r.gridSize)} combinations`, v.deflated && v.deflated.dsr > 0.95 ? 'good' : 'flag'),
    tile('Could it be seen?', `${f2(v.mdeRatio)}×`, `edge vs minimum detectable effect`,
      v.mdeRatio >= 1 ? 'good' : 'flag'),
    tile('Worst drawdown', pct(m.maxDD), 'out of sample', m.maxDD > 0.35 ? 'flag' : ''),
    tile('Periods', n0(v.n), `${(v.n / 252).toFixed(1)} years out of sample`),
  ].join('');
  $('#ideaStatFoot').innerHTML = `These are computed on the <b>stitched walk-forward output</b> —
    ${n0(v.n)} periods the parameters were never fitted to. The trial count for the Deflated Sharpe is
    ${n0(r.gridSize)}, taken from the size of the grid you searched, because searching a grid <i>is</i>
    multiple testing. ${v.mdeRatio < 1
      ? `<b>The sample cannot resolve an edge this small</b> — it would take roughly ${n0(Math.min(1e7, 1 / 0 || 0) || 0)}` : ''}
    ${v.mdeRatio < 1 ? `about ${n0(Math.ceil(Math.pow((1.959963984540054 + 0.8416212335729143) / Math.max(v.sharpePeriod, 1e-9), 2)))} periods to settle it, so neither a positive nor a null result here means much.` : ''}`;
}
