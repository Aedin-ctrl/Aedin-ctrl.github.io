/* idea.mjs -- the "test an idea" flow: controls, worker, rendering. */
import * as C from './charts.mjs';
import { IDEA_EXAMPLES } from '../lib/ideatest.mjs';
import { extractParamSpec, expandGrid, COST_PRESETS } from '../lib/strategylab.mjs';
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

  const periodHint = () => {
    const yrs = $('#ideaPeriod').value;
    $('#wISRow').hidden = !!yrs;
    if (!yrs) { $('#ideaPeriodHint').textContent = 'the split is set by the slider instead'; return; }
    const need = Math.round(+yrs * 252);
    const have = ST.market ? ST.market.length : 0;
    const train = have - need;
    $('#ideaPeriodHint').innerHTML = have
      ? (train < 250
          ? `<span class="neg">only ${n0(Math.max(0, train))} days left to train on — pick a shorter period</span>`
          : `tests ${n0(need)} days, trains on the ${n0(train)} before them`)
      : '';
  };
  $('#ideaPeriod').addEventListener('change', periodHint);
  ST.periodHint = periodHint;

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
    ST.real = real;
    const m = S.moments(ST.market);
    $('#ideaMarketNote').innerHTML = `${esc(e.label)} · <b>${n0(e.n)}</b> trading days,
      ${e.from} to ${e.to} · buy-and-hold Sharpe
      <b>${(m.mean / m.sd * Math.sqrt(252)).toFixed(2)}</b>. Your idea has to beat that.`;
    $$('#ideaMarket button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mk === id)));
    if (ST.periodHint) ST.periodHint();
    // the right cost is not the same for a $690 share and a $250 one
    const sym = (id.split('_')[0] || '').toUpperCase();
    const preset = COST_PRESETS[sym];
    if (preset) {
      $('#ideaCost').value = preset.bpsPerTurnover;
      $('#ideaCostHint').innerHTML = `${preset.bpsPerTurnover}bp suggested for ${esc(sym)} — ${esc(preset.note)}`;
    }
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
        // a refusal is a result too, and it has to be shown rather than rendered
        if (!e.data.res || !e.data.res.ok) {
          $('#ideaMsg').innerHTML = `<div class="msg bad"><b>Nothing to test.</b>
            ${esc((e.data.res && e.data.res.note) || 'the run produced no usable result')}</div>`;
          $('#ideaResults').hidden = true;
          $('#runStat').textContent = 'nothing to test';
          return;
        }
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
    // everything else the money could have gone into, over the same days
    const alts = {};
    if (ST.real) {
      const sym = (ST.marketId.split('_')[0] || '').toUpperCase();
      for (const [k, v] of Object.entries(ST.real.markets || {})) if (k !== sym) alts[v.name] = v.r;
      for (const v of Object.values(ST.real.blends || {})) alts[v.label] = v.r;
    }
    const yrs = $('#ideaPeriod').value;
    w.postMessage({
      id, src: $('#ideaBox').value,
      market: Array.from(ST.market), benchmark: Array.from(ST.benchmark),
      dates: ST.real ? ST.real.dates : null,
      alternatives: alts,
      opts: {
        oosPeriods: yrs ? Math.round(+yrs * 252) : null,
        capital: +$('#ideaCapital').value || 10000,
        anchored: $('#ideaWindow').value === 'anchored',
        folds: +$('#ideaFolds').value, isFraction: +$('#ideaIS').value,
        objective: $('#ideaObj').value, bpsPerTurnover: +$('#ideaCost').value,
        financingAnnual: +$('#ideaFin').value || 0, shortBorrowAnnual: +$('#ideaBorrow').value || 0,
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
  renderMoney(r);
  renderRegimes(r);
  renderSensitivity(r);
  renderStress(r);
  renderStats(r);
}

function renderStress(r) {
  const st = r.stress;
  if (!st) { $('#stressFoot').innerHTML = '<span class="neg">execution stress did not run</span>'; return; }
  const ladder = st.rows.filter(x => x.skip === 0 && x.slipSd === 0);
  C.lineChart($('#stressChart'), {
    series: [{ name: 'out of sample', x: ladder.map(x => x.mult), y: ladder.map(x => x.score),
               color: 'var(--s2)', points: true }],
    height: 230, xLabel: 'multiple of the assumed cost', yLabel: r.objective,
    xFmt: v => v + '\u00d7', yFmt: f2, zeroLine: true,
  });
  $('#stressTab').querySelector('tbody').innerHTML = st.rows.map(x => {
    const d = x.score - st.assumed;
    return `<tr${x.id === 'assumed' ? ' class="hl"' : ''}>
      <td>${esc(x.label)}</td>
      <td class="${x.score > 0 ? 'pos' : 'neg'}">${f2(x.score)}</td>
      <td class="${d > 0 ? 'pos' : d < 0 ? 'neg' : 'dim'}">${x.id === 'assumed' ? '—' : (d >= 0 ? '+' : '') + d.toFixed(3)}</td></tr>`;
  }).join('');
  $('#stressFoot').innerHTML = `At the assumed ${st.assumedBps}bp the out-of-sample score is
    <b>${f2(st.assumed)}</b>.
    ${st.beyondRange
      ? `It stays positive even at <b>${st.maxTestedMult}×</b> the assumption — though look at the ladder to see how little is left there.`
      : `It reaches zero at about <b>${st.breakEvenBps.toFixed(1)}bp</b>, ${st.breakEvenMult.toFixed(1)}× the assumption.`}
    ${st.holdsAt2 ? 'Doubling the cost keeps most of it.' : '<b>Doubling the cost takes most of it away</b> — the result depends on the cost estimate being right.'}
    ${st.skipHelps
      ? ` <b>Randomly skipping trades improves the result</b> (${esc(st.bestMiss.label.toLowerCase())} scores
          ${f2(st.bestMiss.score)} against ${f2(st.assumed)}). The trades are on net harmful: the signal is
          subtracting value rather than adding it.`
      : ' Skipping trades makes it worse, which is what a rule whose trades add value should do.'}`;
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

/* ---------------- the money ---------------- */
const $m = (v, d = 0) => (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
const $sgn = (v, d = 0) => (v >= 0 ? '+' : '-') + '$' + Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });

function renderMoney(r) {
  const mo = r.money, c = r.comparison, w = r.window;
  if (!mo) { $('#moneySub').textContent = 'no calendar supplied'; return; }
  $('#moneySub').textContent = `${w.from} to ${w.to} · ${n0(w.n)} trading days · ${$m(mo.capital)} start`;

  const tile = (k, v, n, mod = '') => `<div class="m ${mod}"><div class="k">${k}</div>
    <div class="v">${v}</div><div class="n">${n}</div></div>`;
  const beat = c ? mo.profit > c.benchmark.profit : null;
  $('#moneyTiles').innerHTML = [
    tile('Final account value', $m(mo.final), `from ${$m(mo.capital)}`, mo.profit > 0 ? 'good' : 'flag'),
    tile('Profit', $sgn(mo.profit), `${(mo.profitPct * 100).toFixed(1)}% over ${mo.years.toFixed(1)} years`,
      mo.profit > 0 ? 'good' : 'flag'),
    tile('Per year', pct(mo.cagr), 'compound annual growth', mo.cagr > 0 ? 'good' : 'flag'),
    c ? tile('Against buy and hold', $sgn(c.excessProfit),
      `it made ${$m(c.benchmark.profit)}`, beat ? 'good' : 'flag') : '',
    tile('Worst drawdown', $m(Math.abs(mo.maxDDDollars)), `${pct(mo.maxDD)} · ${mo.maxDDFrom} to ${mo.maxDDTo}`,
      mo.maxDD > 0.25 ? 'flag' : ''),
    tile('Worst day', $m(mo.worstDay.pnl), `${pct(mo.worstDay.ret, 2)} on ${mo.worstDay.date}`),
    tile('Winning months', `${mo.positiveMonths}/${mo.months.length}`,
      `best ${$sgn(mo.bestMonth.pnl)}, worst ${$sgn(mo.worstMonth.pnl)}`),
    tile('Recovery', mo.maxDDRecovered ? `${n0(mo.maxDDRecoveryDays)} days` : 'never',
      mo.maxDDRecovered ? `back to the high by ${mo.maxDDRecovered}` : 'still below its high at the end',
      mo.maxDDRecovered ? '' : 'flag'),
  ].filter(Boolean).join('');

  // the headline chart: account value in dollars
  const eq = r.equityCurve, be = r.benchmarkCurve;
  const xs = eq.map((_, i) => i);
  C.legend($('#eqLeg'), [
    { color: 'var(--s1)', label: 'your strategy' },
    { color: 'var(--s2)', label: 'buy and hold' },
  ]);
  C.lineChart($('#moneyEquity'), {
    series: [
      { name: 'strategy', x: xs, y: eq, color: 'var(--s1)' },
      be ? { name: 'buy & hold', x: xs, y: be, color: 'var(--s2)' } : null,
    ].filter(Boolean),
    height: 320, xLabel: 'trading days in the test period', yLabel: 'account value',
    xFmt: v => String(Math.round(v)), yFmt: v => $m(v), zeroLine: false,
  });
  $('#moneyEqFoot').innerHTML = c
    ? `${$m(mo.capital)} became <b>${$m(mo.final)}</b> with the strategy and <b>${$m(c.benchmark.final)}</b>
       buying and holding — a difference of <b>${$sgn(c.excessProfit)}</b>.
       The strategy's worst fall was ${$m(Math.abs(mo.maxDDDollars))} against ${$m(Math.abs(c.benchmark.maxDDDollars))}.
       ${beat ? 'It made more money.' : 'It made less money'}${!beat && mo.maxDD < c.benchmark.maxDD
         ? `, but with a smaller worst loss — whether that trade is worth making is a question about you, not about the data.` : '.'}`
    : `${$m(mo.capital)} became <b>${$m(mo.final)}</b>.`;

  // monthly P&L
  C.signedBars($('#monthBars'), {
    values: mo.months.map(x => x.pnl), labels: mo.months.map(x => x.key),
    height: 250, fmt: v => $m(v), yLabel: 'profit and loss',
  });
  const up = mo.positiveMonths, tot = mo.months.length;
  $('#monthFoot').innerHTML = `<b>${up} of ${tot}</b> months made money (${pct(up / tot, 0)}).
    Best ${mo.bestMonth.key} at ${$sgn(mo.bestMonth.pnl)}, worst ${mo.worstMonth.key} at
    ${$sgn(mo.worstMonth.pnl)}.`;

  // underwater, in dollars
  const dd = mo.drawdownDollars;
  C.areaChart($('#ddArea'), {
    x: dd.map((_, i) => i), y: dd, height: 250, fmt: v => $m(v),
    yLabel: 'below the high water mark', xLabel: 'test period',
  });
  $('#ddFoot').innerHTML = `The deepest point was <b>${$m(Math.abs(mo.maxDDDollars))}</b> below the high
    (${pct(mo.maxDD)}), from ${mo.maxDDFrom} to ${mo.maxDDTo}.
    ${mo.maxDDRecovered
      ? `It took <b>${n0(mo.maxDDRecoveryDays)} trading days</b> to get back, reaching the old high on ${mo.maxDDRecovered}.`
      : '<b>It had not recovered by the end of the test.</b>'}
    This is the chart to look at before deciding how much to risk: it is what you would have had to sit through.`;

  // year by year
  const by = c ? c.benchmark.yearly : null;
  $('#yearTab').querySelector('tbody').innerHTML = mo.yearly.map((y, i) => {
    const b = by && by[i];
    const diff = b ? y.pnl - b.pnl : null;
    return `<tr>
      <td>${y.key}</td><td class="dim">${y.n}</td>
      <td class="${y.ret > 0 ? 'pos' : 'neg'}">${sgn(y.ret)}</td>
      <td class="${y.pnl > 0 ? 'pos' : 'neg'}">${$sgn(y.pnl)}</td>
      <td>${$m(y.endEquity)}</td>
      <td class="dim">${b ? sgn(b.ret) : '—'}</td>
      <td class="${diff > 0 ? 'pos' : diff < 0 ? 'neg' : 'dim'}">${diff != null ? $sgn(diff) : '—'}</td></tr>`;
  }).join('');
  const wins = by ? mo.yearly.filter((y, i) => by[i] && y.pnl > by[i].pnl).length : 0;
  $('#yearFoot').innerHTML = by
    ? `The strategy beat buy and hold in <b>${wins} of ${mo.yearly.length}</b> calendar years.
       Note the partial years at each end — the test period does not start on 1 January.`
    : '';

  // alternatives
  if (r.alternatives && r.alternatives.length) {
    const rows = [{ label: 'Your strategy', final: mo.final, profit: mo.profit, cagr: mo.cagr, maxDD: mo.maxDD, sharpe: mo.sharpe, me: true }];
    if (c) rows.push({ label: 'Buy and hold the same thing', final: c.benchmark.final, profit: c.benchmark.profit,
      cagr: c.benchmark.cagr, maxDD: c.benchmark.maxDD, sharpe: c.benchmark.sharpe });
    for (const a of r.alternatives) rows.push({ label: a.label, final: a.final, profit: a.profit, cagr: a.cagr, maxDD: a.maxDD, sharpe: a.sharpe });
    rows.push({ label: 'Cash (0%)', final: mo.capital, profit: 0, cagr: 0, maxDD: 0, sharpe: 0 });
    const sorted = [...rows].sort((a, b) => b.final - a.final);
    C.barsCI($('#altChart'), {
      items: sorted.map(x => ({ label: x.label, value: x.profit,
        color: x.me ? 'var(--s1)' : (x.profit >= 0 ? 'var(--s3)' : 'var(--s2)'),
        note: `${pct(x.cagr)} a year, worst fall ${pct(x.maxDD)}` })),
      fmt: v => $m(v), xLabel: 'profit over the test period', zero: 0,
    });
    $('#altTab').querySelector('tbody').innerHTML = sorted.map(x => `<tr${x.me ? ' class="hl"' : ''}>
      <td>${esc(x.label)}${x.me ? ' <span class="dim">&larr; yours</span>' : ''}</td>
      <td>${$m(x.final)}</td>
      <td class="${x.profit > 0 ? 'pos' : x.profit < 0 ? 'neg' : 'dim'}">${$sgn(x.profit)}</td>
      <td class="${x.cagr > 0 ? 'pos' : x.cagr < 0 ? 'neg' : 'dim'}">${sgn(x.cagr)}</td>
      <td>${pct(x.maxDD)}</td><td>${f2(x.sharpe)}</td></tr>`).join('');
    const rank = sorted.findIndex(x => x.me) + 1;
    $('#altFoot').innerHTML = `Over this exact period your strategy finished <b>${rank} of ${sorted.length}</b>
      by profit. ${rank === 1 ? 'It beat every alternative here.'
        : `${esc(sorted[0].label)} made ${$m(sorted[0].profit)}.`}
      Five years is one sample: a different five years reorders this table, which is what the Monte Carlo
      section is for.`;
  }
}

/* ---------------- which markets ---------------- */
function renderRegimes(r) {
  const rg = r.regimes, c = r.comparison;
  if (!rg) { $('#regimeBlocks').innerHTML = '<div class="hint">needs a benchmark</div>'; return; }

  const blocks = [];
  for (const [key, d] of Object.entries(rg.dims)) {
    const rows = d.rows.map(x => ({
      label: x.label, sub: `${n0(x.n)} days · ${pct(x.share, 0)} of the test`,
      a: x.stratTotal * 100, b: x.benchTotal * 100, raw: x,
    }));
    blocks.push(`<section><h3>${esc(d.label)} <span>&middot; ${esc(d.note)}</span></h3>
      <div id="rg_${key}"></div>
      <div class="wrap" style="margin-top:10px"><table id="rgt_${key}">
        <thead><tr><th>Regime</th><th>Days</th><th>Strategy total</th><th>Benchmark total</th>
          <th>Per day</th><th>Win rate</th><th>Share of the result</th></tr></thead>
        <tbody>${d.rows.map(x => `<tr>
          <td>${esc(x.label)}</td><td class="dim">${n0(x.n)}</td>
          <td class="${x.stratTotal > 0 ? 'pos' : 'neg'}">${sgn(x.stratTotal)}</td>
          <td class="dim">${sgn(x.benchTotal)}</td>
          <td>${x.stratPerDayBps.toFixed(2)} bps</td>
          <td>${pct(x.winRate, 0)}</td>
          <td class="${x.pnlShare > 0 ? 'pos' : 'neg'}">${Number.isFinite(x.pnlShare) ? pct(x.pnlShare, 0) : '—'}</td>
          </tr>`).join('')}</tbody></table></div></section>`);
  }
  $('#regimeBlocks').innerHTML = blocks.join('');
  for (const [key, d] of Object.entries(rg.dims)) {
    C.groupedBars($('#rg_' + key), {
      rows: d.rows.map(x => ({ label: x.label.replace(/\s*\(.*\)$/, ''),
        sub: `${n0(x.n)} days`, a: x.stratTotal * 100, b: x.benchTotal * 100 })),
      fmt: v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%',
      xLabel: 'total return over all days in that regime',
      nameA: 'strategy', nameB: 'benchmark',
    });
  }

  // a plain-language summary of where the money came from
  const best = rg.best, worst = rg.worst;
  if (best && worst && best !== worst) {
    const note = document.createElement('div');
    note.className = 'msg info';
    note.style.marginTop = '12px';
    note.innerHTML = `<b>Best in: ${esc(best.label)}</b> (${esc(best.dim)}) — ${sgn(best.stratTotal)} over
      ${n0(best.n)} days, against ${sgn(best.benchTotal)} for the benchmark.
      <b>Worst in: ${esc(worst.label)}</b> (${esc(worst.dim)}) — ${sgn(worst.stratTotal)} over ${n0(worst.n)} days.
      ${c ? `Across the whole period it captured <b>${pct(c.upCapture, 0)}</b> of the benchmark's up days and
        <b>${pct(c.downCapture, 0)}</b> of its down days${c.downCapture < c.upCapture
          ? ' — it takes less of the falls than it gives up of the rises, which is the shape you want.'
          : ' — it takes more of the falls than it keeps of the rises, which is the shape you do not want.'}
        Beta to the benchmark is ${f2(c.beta)}.` : ''}`;
    $('#regimeBlocks').appendChild(note);
  }

  // concentration
  const k = rg.concentration;
  const tile = (a, b, cc, mod = '') => `<div class="m ${mod}"><div class="k">${a}</div>
    <div class="v">${b}</div><div class="n">${cc}</div></div>`;
  $('#concTiles').innerHTML = [
    tile('Best 1% of days', Number.isFinite(k.top1Pct) ? pct(k.top1Pct, 0) : '—', 'of the whole result',
      k.top1Pct > 0.7 ? 'flag' : ''),
    tile('Best 5% of days', Number.isFinite(k.top5Pct) ? pct(k.top5Pct, 0) : '—', 'of the whole result'),
    tile('Best 10 days', Number.isFinite(k.top10Days) ? pct(k.top10Days, 0) : '—', `of ${n0(k.n)} days`),
    tile('Without those 10 days', pct(k.annualWithoutTop10), 'a year', k.annualWithoutTop10 < 0 ? 'flag' : ''),
  ].join('');
  $('#concFoot').innerHTML = `The best 1% of days account for <b>${Number.isFinite(k.top1Pct) ? pct(k.top1Pct, 0) : '—'}</b>
    of the result. Strip out the ten best days and what is left compounds at
    <b>${pct(k.annualWithoutTop10)}</b> a year.
    ${k.top1Pct > 0.7
      ? '<b>That is very concentrated.</b> A result that rests on a handful of days is a lottery ticket with a backtest attached — and those days are exactly the ones you are most likely to miss in practice.'
      : 'That is reasonably spread out, which is what a durable edge looks like.'}`;

  // rolling
  if (r.rolling) {
    const w = r.rolling.window;
    C.legend($('#rollLeg'), [
      { color: 'var(--s1)', label: 'strategy' },
      { color: 'var(--s2)', label: 'buy and hold' },
    ]);
    C.lineChart($('#rollChart'), {
      series: [
        { name: 'strategy', x: r.rolling.strategy.x, y: r.rolling.strategy.y.map(v => v * 100), color: 'var(--s1)' },
        { name: 'buy & hold', x: r.rolling.benchmark.x, y: r.rolling.benchmark.y.map(v => v * 100), color: 'var(--s2)' },
      ],
      height: 260, xLabel: 'trading day in the test period',
      yLabel: `rolling ${w}-day return`, yFmt: v => v.toFixed(0) + '%', zeroLine: true,
    });
    const ys = r.rolling.strategy.y;
    const posWin = ys.filter(v => v > 0).length;
    $('#rollFoot').innerHTML = `Each point is the return over the previous ${w} trading days.
      The strategy was positive over <b>${pct(posWin / ys.length, 0)}</b> of those windows.
      A line that spends long stretches below zero is one you would have abandoned, whatever the
      final number says.`;
  }
}
