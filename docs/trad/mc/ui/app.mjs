/* app.mjs -- controls, worker orchestration, and the run loop. */
import { MODELS, fitAll, optimalBlockLength, fitT } from '../lib/generators.mjs';
import { mergeBatches, kellyLeverage } from '../lib/engine.mjs';
import { buildResults, tailCeiling, parametricWorst } from '../lib/results.mjs';
import { parseSource, parseVariants, KINDS, jsonSafe } from '../lib/sources.mjs';
import { EXAMPLES as DATA_EXAMPLES, buildExample } from '../lib/examples.mjs';
import { EXAMPLES as STRAT_EXAMPLES, validateStrategy, STRATEGY_HEADER } from '../lib/strategy.mjs';
import { verdict, sharpeNull } from '../lib/tests.mjs';
import * as S from '../lib/stats.mjs';
import { hashConfig } from '../lib/rng.mjs';
import * as R from './render.mjs';
import { initIdea } from './idea.mjs';
import { autoCondense, condense as autoCondenseNow } from './density.mjs';
import { loadBoard, BOARDS } from '../lib/boards.mjs';

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const n0 = v => Math.round(v).toLocaleString();
const pct = (v, d = 1) => (v * 100).toFixed(d) + '%';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------------- state ---------------- */
const ST = {
  mode: 'examples',          // examples | paste | strategy | saved
  source: null,              // Float64Array of returns
  sourceLabel: '',
  sourceNote: '',
  strategySrc: '',
  strategyOK: false,
  modelId: 'block',
  params: {},
  lastResults: null,
  lastVerdict: null,
  lastCfg: null,
  lastNull: null,
  variants: null,
  running: false,
};

const CORES = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1));
$('#coreNote').textContent = ` Using ${CORES} worker${CORES > 1 ? 's' : ''}.`;
$('#gen').textContent = 'simulation lab';

/* ---------------- tabs ---------------- */
$$('#srcTabs button').forEach(b => b.addEventListener('click', () => {
  $$('#srcTabs button').forEach(x => x.setAttribute('aria-selected', String(x === b)));
  for (const p of ['pExamples', 'pPaste', 'pStrat', 'pVar', 'pSaved']) $('#' + p).hidden = true;
  $('#' + b.dataset.pane).hidden = false;
  ST.mode = { pExamples: 'examples', pPaste: 'paste', pStrat: 'strategy', pVar: 'variants', pSaved: 'saved' }[b.dataset.pane];
  if (ST.mode === 'saved') renderSaved();
  refreshModelChips();
  updateSourceSummary();
}));

/* ---------------- built-in data ---------------- */
let exId = 'spy_full', exKind = 'real';
let REAL = null, realLoading = null;

/* The real series are ~100KB gzipped, so they are fetched the first time one is
 * picked rather than on every page load. */
async function loadReal() {
  if (REAL) return REAL;
  if (!realLoading) {
    realLoading = fetch(new URL('../data/real.json', import.meta.url))
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(j => {
        REAL = j;
        // the idea tester may have triggered this load; the Built-in pane is
        // showing a stale "Load real market data" button until it is redrawn
        try { renderExamples(); } catch {}
        return j;
      });
  }
  return realLoading;
}

function renderExamples() {
  const realChips = $('#realChips');
  if (REAL) {
    realChips.innerHTML = Object.entries(REAL.series).map(([id, e]) =>
      `<button class="chip" data-real="${id}" aria-pressed="${exKind === 'real' && id === exId}">${esc(e.label)}</button>`).join('');
    $$('#realChips button').forEach(b => b.addEventListener('click', () => { exKind = 'real'; exId = b.dataset.real; pickExample(); }));
  } else {
    realChips.innerHTML = `<button class="chip" id="loadReal">Load real market data (SPY, QQQ, IWM &middot; 15 years)</button>`;
    $('#loadReal').addEventListener('click', async (ev) => {
      ev.target.textContent = 'loading...'; ev.target.disabled = true;
      try { await loadReal(); exKind = 'real'; exId = 'spy_full'; pickExample(); }
      catch (e) { ev.target.textContent = 'could not load: ' + e.message; }
    });
  }
  $('#exChips').innerHTML = Object.entries(DATA_EXAMPLES).map(([id, e]) =>
    `<button class="chip" data-ex="${id}" aria-pressed="${exKind === 'gen' && id === exId}">${esc(e.label)}</button>`).join('');
  $$('#exChips button').forEach(b => b.addEventListener('click', () => { exKind = 'gen'; exId = b.dataset.ex; pickExample(); }));
}

function pickExample() {
  if (exKind === 'real') {
    const e = REAL && REAL.series[exId];
    if (!e) { exKind = 'gen'; exId = 'index'; return pickExample(); }
    ST.source = Float64Array.from(e.r);
    ST.sourceLabel = e.label;
    ST.sourceNote = e.note;
    ST.strategySrc = '';
    $('#ppy').value = e.ppy || 252;
    $('#horizon').value = Math.max(252, Math.min(5040, e.n));
    $('#exNote').innerHTML = `${esc(e.note)} <b>Real market data</b> &middot; ${e.from} to ${e.to} &middot;
      ${e.n.toLocaleString()} trading days &middot; source: Yahoo daily, adjusted.`;
  } else {
    const ex = buildExample(exId);
    ST.source = ex.returns;
    ST.sourceLabel = ex.label;
    ST.sourceNote = ex.note;
    ST.strategySrc = '';
    $('#ppy').value = ex.ppy;
    $('#exNote').innerHTML = esc(ex.note) + ' <b>Generated data, not a real market.</b>';
  }
  renderExamples();
  afterSourceChange();
}

/* ---------------- paste ---------------- */
$('#kindSel').innerHTML = '<option value="">auto-detect</option>' +
  Object.entries(KINDS).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('');

$('#parseBtn').addEventListener('click', doParse);
$('#pasteBox').addEventListener('paste', () => setTimeout(doParse, 40));
$('#kindSel').addEventListener('change', () => { if ($('#pasteBox').value.trim()) doParse(); });

function doParse() {
  const txt = $('#pasteBox').value;
  if (!txt.trim()) { $('#parseMsg').innerHTML = ''; return; }
  const kind = $('#kindSel').value || null;
  const r = parseSource(txt, kind ? { kind } : {});
  if (r.error) {
    $('#parseMsg').innerHTML = `<div class="msg bad"><b>Could not read that.</b> ${esc(r.error)}</div>`;
    return;
  }
  ST.source = r.returns;
  ST.sourceLabel = `pasted data (${n0(r.n)} observations)`;
  ST.sourceNote = r.why;
  ST.strategySrc = '';
  const warn = r.warnings.length
    ? `<div class="msg warn"><b>Check these.</b> ${r.warnings.map(esc).join(' &middot; ')}</div>` : '';
  $('#parseMsg').innerHTML = `<div class="msg ok"><b>Read ${n0(r.n)} ${KINDS[r.kind] ? KINDS[r.kind].label.toLowerCase() : r.kind}.</b>
      ${esc(r.why)}. Mean ${(r.stats.mean * 100).toFixed(3)}% per period, volatility
      ${(r.stats.sd * 100).toFixed(2)}%, skew ${r.stats.skew.toFixed(2)}, excess kurtosis ${r.stats.kurtosis.toFixed(1)}.
      ${r.confidence < 0.7 ? ' <b>Low confidence</b> — set the units by hand if this looks wrong.' : ''}</div>${warn}`;
  afterSourceChange();
}

/* ---------------- strategy ---------------- */
$('#stratEx').innerHTML = Object.entries(STRAT_EXAMPLES)
  .map(([id, e]) => `<option value="${id}">${esc(e.label)}</option>`).join('');
$('#stratBox').value = STRATEGY_HEADER + '\n' + STRAT_EXAMPLES.sma.code;
$('#stratEx').value = 'sma';
$('#stratEx').addEventListener('change', () => {
  $('#stratBox').value = STRATEGY_HEADER + '\n' + STRAT_EXAMPLES[$('#stratEx').value].code;
  $('#stratMsg').innerHTML = `<div class="msg info">${esc(STRAT_EXAMPLES[$('#stratEx').value].note)}</div>`;
  checkStrategy();
});
$('#checkBtn').addEventListener('click', checkStrategy);

function checkStrategy() {
  const v = validateStrategy($('#stratBox').value);
  if (!v.ok) {
    ST.strategyOK = false;
    $('#stratMsg').innerHTML = `<div class="msg bad"><b>${v.stage === 'compile' ? 'Will not compile' : 'Failed to run'}.</b> ${esc(v.message)}</div>`;
    return false;
  }
  ST.strategyOK = v.lookahead.clean;
  ST.strategySrc = $('#stratBox').value;
  const la = v.lookahead;
  const notes = v.notes.length ? `<div class="msg warn">${v.notes.map(esc).join('<br>')}</div>` : '';
  $('#stratMsg').innerHTML = la.clean
    ? `<div class="msg ok"><b>No look-ahead detected.</b> Positions depend only on earlier bars, across
        ${la.probes} probes. Changes position ${n0(v.changes)} times in 240 bars.</div>${notes}`
    : `<div class="msg bad"><b>Look-ahead detected.</b> ${esc(la.message)}
        <br>Any result from this strategy is fiction. The simulation will still run it so you can see
        how large the fake edge looks — compare it with the same code using <code>market[t-1]</code>.</div>${notes}`;
  afterSourceChange();
  return true;
}

/* ---------------- many variants ---------------- */
$('#varParse').addEventListener('click', () => {
  const r = parseVariants($('#varBox').value);
  if (r.error) { $('#varMsg').innerHTML = `<div class="msg bad"><b>Could not read that.</b> ${esc(r.error)}</div>`; return; }
  ST.variants = r;
  // the best variant by Sharpe becomes the series the simulation runs on
  let best = 0, bestSR = -Infinity;
  r.variants.forEach((v, i) => {
    const sd = S.sd(v.returns);
    const sr = sd > 0 ? S.mean(v.returns) / sd : 0;
    if (sr > bestSR) { bestSR = sr; best = i; }
  });
  ST.source = r.variants[best].returns;
  ST.sourceLabel = `best of ${r.count} variants (${r.variants[best].name})`;
  ST.sourceNote = r.why;
  ST.strategySrc = '';
  $('#trials').value = r.count;
  const warn = r.warnings.length ? `<div class="msg warn">${r.warnings.map(esc).join(' &middot; ')}</div>` : '';
  $('#varMsg').innerHTML = `<div class="msg ok"><b>Read ${r.count} variants of ${n0(r.n)} periods.</b>
    ${esc(r.why)}. The best by Sharpe is <b>${esc(r.variants[best].name)}</b> at
    ${(bestSR * Math.sqrt(+$('#ppy').value || 252)).toFixed(2)} annualised — that is the series the simulation
    will run on, and &ldquo;variants you tried&rdquo; has been set to ${r.count}.</div>${warn}`;
  afterSourceChange();
});

/* ---------------- saved attachments ---------------- */
const LSKEY = 'mc.saved.v1';
const loadSaved = () => { try { return JSON.parse(localStorage.getItem(LSKEY) || '[]'); } catch { return []; } };
const putSaved = a => { try { localStorage.setItem(LSKEY, JSON.stringify(a)); } catch {} };

$('#saveSrcBtn').addEventListener('click', () => {
  if (!ST.source || !ST.source.length) return;
  const name = prompt('Name this attachment:', ST.sourceLabel || 'my data');
  if (!name) return;
  const all = loadSaved();
  all.unshift({ name, when: Date.now(), kind: 'series', ppy: +$('#ppy').value,
                data: Array.from(ST.source, v => +v.toFixed(8)) });
  putSaved(all.slice(0, 30));
  renderSaved();
  $('#parseMsg').innerHTML = `<div class="msg ok">Saved as <b>${esc(name)}</b>, in this browser only.</div>`;
});

function renderSaved() {
  const all = loadSaved();
  if (!all.length) { $('#savedList').innerHTML = '<div class="hint">Nothing saved yet. Paste a series and press &ldquo;Save this&rdquo;.</div>'; return; }
  $('#savedList').innerHTML = `<div class="wrap"><table><thead><tr><th>Name</th><th>Kind</th><th>n</th><th>Saved</th><th></th></tr></thead><tbody>` +
    all.map((s, i) => `<tr><td>${esc(s.name)}</td><td class="dim">${esc(s.kind)}</td>
      <td>${n0((s.data || s.code || '').length)}</td>
      <td class="dim">${new Date(s.when).toLocaleDateString()}</td>
      <td><button class="btn" data-use="${i}">Use</button>
          <button class="btn" data-del="${i}">Delete</button></td></tr>`).join('') + '</tbody></table></div>';
  $$('#savedList [data-use]').forEach(b => b.addEventListener('click', () => {
    const s = loadSaved()[+b.dataset.use];
    if (s.kind === 'series') {
      ST.source = Float64Array.from(s.data); ST.sourceLabel = s.name;
      ST.sourceNote = 'saved in this browser'; ST.strategySrc = '';
      if (s.ppy) $('#ppy').value = s.ppy;
      afterSourceChange();
    }
  }));
  $$('#savedList [data-del]').forEach(b => b.addEventListener('click', () => {
    const all2 = loadSaved(); all2.splice(+b.dataset.del, 1); putSaved(all2); renderSaved();
  }));
}

/* ---------------- source summary ---------------- */
function updateSourceSummary() {
  const el = $('#srcSummary');
  if (ST.mode === 'strategy') {
    el.innerHTML = `<div class="msg info"><b>Strategy mode.</b> The model below generates a market;
      your code trades it. An attached series is only used if you pick a resampling model.</div>`;
    return;
  }
  if (!ST.source || !ST.source.length) { el.innerHTML = ''; return; }
  const m = S.moments(ST.source);
  const ppy = +$('#ppy').value || 252;
  const sr = m.sd > 0 ? m.mean / m.sd * Math.sqrt(ppy) : 0;
  el.innerHTML = `<div class="chips">
    <span class="chip"><b>${esc(ST.sourceLabel)}</b></span>
    <span class="chip">n <b>${n0(ST.source.length)}</b></span>
    <span class="chip">Sharpe <b>${sr.toFixed(2)}</b></span>
    <span class="chip">vol <b>${pct(m.sd * Math.sqrt(ppy), 0)}</b></span>
    <span class="chip">skew <b>${m.skew.toFixed(2)}</b></span>
    <span class="chip">kurtosis <b>${m.kurtosis.toFixed(1)}</b></span></div>`;
}

function afterSourceChange() {
  // whatever is attached now, it is not a board series until pickBoard says so
  ST.boardKey = null;
  updateSourceSummary();
  refreshModelChips();
  if (ST.source && ST.source.length > 40 && MODELS[ST.modelId] && MODELS[ST.modelId].needsSource) {
    const b = optimalBlockLength(ST.source);
    if (ST.params.L == null || ST.params._autoL) { ST.params.L = Math.max(1, Math.round(b.L)); ST.params._autoL = true; }
  }
  renderParams();
}

/* ---------------- model ---------------- */
function refreshModelChips() {
  const hasSrc = !!(ST.source && ST.source.length > 2);
  $('#modelChips').innerHTML = Object.entries(MODELS).map(([id, m]) => {
    const dis = m.needsSource && !hasSrc;
    return `<button class="chip" data-model="${id}" aria-pressed="${id === ST.modelId}"
      ${dis ? 'disabled title="needs an attached series"' : ''}>${esc(m.label)}</button>`;
  }).join('');
  $$('#modelChips button').forEach(b => b.addEventListener('click', () => {
    ST.modelId = b.dataset.model;
    ST.params = {};
    afterSourceChange();
  }));
  if (MODELS[ST.modelId] && MODELS[ST.modelId].needsSource && !hasSrc) { ST.modelId = 'normal'; ST.params = {}; }
  $('#modelNote').textContent = MODELS[ST.modelId] ? MODELS[ST.modelId].blurb : '';
}

function renderParams() {
  const M = MODELS[ST.modelId];
  if (!M) return;
  const host = $('#modelParams');
  if (!M.params.length) { host.innerHTML = '<div class="hint">This model has no parameters &mdash; it uses your series directly.</div>'; return; }
  host.innerHTML = M.params.map(p => {
    const v = ST.params[p.k] ?? p.def;
    return `<div><label class="f" for="pp_${p.k}">${esc(p.label)}
        <output id="po_${p.k}">${fmtParam(v, p)}</output></label>
      <div class="rangewrap"><input type="range" id="pp_${p.k}" data-k="${p.k}"
        min="${p.min}" max="${p.max}" step="${p.step}" value="${v}"></div></div>`;
  }).join('');
  host.querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => {
    const k = inp.dataset.k;
    const p = M.params.find(q => q.k === k);
    ST.params[k] = +inp.value;
    if (k === 'L') ST.params._autoL = false;
    $('#po_' + k).textContent = fmtParam(+inp.value, p);
  }));
}
function fmtParam(v, p) {
  if (p.k === 'mu' || p.k === 'mu1' || p.k === 'mu2') return (v * 100).toFixed(3) + '%';
  if (/^(sigma|sd1|sd2|jSd|jMu)$/.test(p.k)) return (v * 100).toFixed(2) + '%';
  if (p.k === 'omega') return v.toExponential(1);
  if (p.k === 'L') return v.toFixed(0);
  if (p.k === 'lambda') return v.toFixed(4);
  return v.toFixed(p.step >= 1 ? 0 : p.step >= 0.01 ? 2 : 3);
}

$('#resetParams').addEventListener('click', () => { ST.params = {}; afterSourceChange(); });
$('#fitBtn').addEventListener('click', () => {
  if (!ST.source || ST.source.length < 50) {
    $('#fitNote').textContent = 'Attach at least 50 observations first.';
    return;
  }
  const M = MODELS[ST.modelId];
  if (!M.fit) {
    const b = optimalBlockLength(ST.source);
    ST.params.L = Math.max(1, Math.round(b.L)); ST.params._autoL = true;
    renderParams();
    $('#fitNote').innerHTML = `Block length set to <b>${b.L}</b> by the Politis–White rule. ${esc(b.note || '')}`;
    return;
  }
  try {
    const f = M.fit(ST.source);
    for (const p of M.params) if (Number.isFinite(f[p.k])) ST.params[p.k] = Math.max(p.min, Math.min(p.max, f[p.k]));
    renderParams();
    let note = `Fitted to ${n0(ST.source.length)} observations.`;
    if (ST.modelId === 'garch') note += ` Persistence ${f.persistence.toFixed(3)}, implied annual vol ${pct(f.uncondVol * Math.sqrt(+$('#ppy').value || 252), 0)}.`;
    if (ST.modelId === 't') note += ` df ${f.df} — ${f.df < 6 ? 'distinctly fat tails.' : f.df < 15 ? 'moderately fat tails.' : 'close to normal.'}`;
    if (ST.modelId === 'regime') note += ` Calm spells average ${Math.round(f.meanDuration1)} periods, crises ${Math.round(f.meanDuration2)}; ${pct(f.timeInCalm, 0)} of the time is calm.`;
    if (ST.modelId === 'jump') note += ` ${f.nJumps} jumps found beyond ${pct(f.threshold, 1)}.`;
    $('#fitNote').innerHTML = note;
  } catch (e) {
    $('#fitNote').textContent = 'Could not fit: ' + e.message;
  }
});

/* ---------------- sizing controls ---------------- */
const bindRange = (id, fmt) => {
  const i = $('#' + id), o = $('#' + id + 'O');
  const upd = () => { o.textContent = fmt(+i.value); };
  i.addEventListener('input', upd); upd();
};
bindRange('lev', v => v.toFixed(2) + 'x');
bindRange('tgt', v => (v * 100).toFixed(0) + '%');
bindRange('volwin', v => v.toFixed(0));
bindRange('kf', v => v.toFixed(2));
bindRange('maxlev', v => v.toFixed(0) + 'x');
bindRange('ruinAt', v => v === 0 ? 'total loss' : 'down ' + ((1 - v) * 100).toFixed(0) + '%');
bindRange('skipProb', v => (v * 100).toFixed(0) + '%');
bindRange('gapProb', v => (v * 100).toFixed(1) + '%');

$('#sizeMode').addEventListener('change', () => {
  const m = $('#sizeMode').value;
  $('#wLev').hidden = m === 'kelly';
  $('#wTgt').hidden = m !== 'voltarget';
  $('#wWin').hidden = m !== 'voltarget';
  $('#wKf').hidden = m !== 'kelly';
});

/* ---------------- config ---------------- */
function buildConfig(overrides = {}) {
  const M = MODELS[ST.modelId];
  const params = {};
  for (const p of M.params) params[p.k] = ST.params[p.k] ?? p.def;
  const ppy = +$('#ppy').value || 252;
  const sizing = {
    mode: $('#sizeMode').value,
    leverage: +$('#lev').value,
    targetVol: +$('#tgt').value,
    volWindow: +$('#volwin').value,
    kellyFraction: +$('#kf').value,
    maxLeverage: +$('#maxlev').value,
    kellyFull: 0,
  };
  if (sizing.mode === 'kelly' && ST.source && ST.source.length > 10) {
    sizing.kellyFull = kellyLeverage(S.mean(ST.source), S.variance(ST.source));
  }
  const cfg = {
    seed: +$('#seed').value || 0,
    horizon: Math.max(10, +$('#horizon').value || 252),
    ppy,
    paths: +$('#paths').value,
    model: { id: ST.modelId, params },
    sizing,
    costs: {
      bpsPerPeriod: +$('#costBps').value || 0,
      bpsPerTurnover: +$('#turnBps').value || 0,
      financingAnnual: +$('#finRate').value || 0,
      taxRate: +$('#taxRate').value || 0,
      taxMode: $('#taxMode').value,
    },
    exec: {
      skipProb: +$('#skipProb').value || 0,
      slipMeanBps: +$('#slipMean').value || 0,
      slipSdBps: +$('#slipSd').value || 0,
      gapProb: +$('#gapProb').value || 0,
      gapBps: +$('#gapBps').value || 0,
    },
    ruinAt: +$('#ruinAt').value || 0,
    trials: Math.max(1, +$('#trials').value || 1),
    gridPoints: 120,
    keepPaths: 12,
    bandPaths: 20000,
    ...overrides,
  };
  if (M.needsSource) cfg.source = Array.from(ST.source);
  if (ST.mode === 'strategy' && ST.strategySrc) cfg.strategySrc = ST.strategySrc;
  return cfg;
}

/* ---------------- worker pool ---------------- */
let POOL = [], cancelled = false;
function ensurePool() {
  if (POOL.length) return POOL;
  for (let i = 0; i < CORES; i++) POOL.push(new Worker(new URL('../worker.mjs', import.meta.url), { type: 'module' }));
  return POOL;
}

function runOnPool(cfg, onProgress) {
  return new Promise((resolve, reject) => {
    const pool = ensurePool();
    const N = cfg.paths;
    const chunks = [];
    const per = Math.ceil(N / pool.length);
    for (let i = 0; i < pool.length; i++) {
      const lo = i * per, hi = Math.min(N, lo + per);
      if (lo < hi) chunks.push([lo, hi]);
    }
    const out = [];
    let done = 0, finished = 0;
    const progress = new Array(chunks.length).fill(0);
    const sendCfg = { ...cfg };
    delete sendCfg.strategyFn;
    // band paths are shared out across workers
    sendCfg.bandPaths = Math.max(1, Math.floor((cfg.bandPaths || N) / chunks.length));
    sendCfg.keepPaths = 0;

    chunks.forEach(([lo, hi], i) => {
      const w = pool[i];
      const id = Math.random().toString(36).slice(2);
      const handler = (e) => {
        if (e.data.id !== id) return;
        if (e.data.type === 'progress') {
          progress[i] = e.data.done;
          onProgress(progress.reduce((a, b) => a + b, 0), N);
        } else if (e.data.type === 'done') {
          w.removeEventListener('message', handler);
          out.push(e.data.res);
          if (++finished === chunks.length) resolve(mergeBatches(out, cfg));
        } else if (e.data.type === 'error') {
          w.removeEventListener('message', handler);
          reject(new Error(e.data.message));
        }
      };
      w.addEventListener('message', handler);
      const c = i === 0 ? { ...sendCfg, keepPaths: cfg.keepPaths || 0 } : sendCfg;
      w.postMessage({ id, cfg: c, lo, hi });
    });
    if (!chunks.length) reject(new Error('nothing to run'));
  });
}

/* ---------------- run ---------------- */
$('#runBtn').addEventListener('click', () => run());
$('#cancelBtn').addEventListener('click', () => {
  cancelled = true;
  POOL.forEach(w => w.terminate());
  POOL = [];
  setRunning(false);
  $('#runStat').textContent = 'cancelled';
});

function setRunning(on) {
  ST.running = on;
  $('#runBtn').disabled = on;
  $('#cancelBtn').hidden = !on;
  $('#cmpBtn').disabled = on;
  showBar(on);
}

/* The progress strip sticks to the bottom of the window, so leaving it up
 * permanently costs a line of the page forever. It appears for the run and
 * goes away after it; the verdict heading says how the run went. */
let barTimer = 0;
export function showBar(on) {
  clearTimeout(barTimer);
  if (on) { $('#runbar').hidden = false; return; }
  barTimer = setTimeout(() => { $('#runbar').hidden = true; }, 1800);
}

async function run(opts = {}) {
  if (ST.running) return;
  const M = MODELS[ST.modelId];
  if (M.needsSource && (!ST.source || !ST.source.length)) {
    $('#runStat').textContent = 'attach a series first';
    return;
  }
  if (ST.mode === 'strategy' && !ST.strategySrc) { if (!checkStrategy()) return; }

  cancelled = false;
  setRunning(true);
  const t0 = performance.now();
  $('#progBar').style.width = '0%';
  $('#runStat').textContent = 'running...';

  const ladder = buildLadder();
  const cfg = buildConfig({ ladder });

  try {
    const merged = await runOnPool(cfg, (done, total) => {
      $('#progBar').style.width = (done / total * 100).toFixed(1) + '%';
      $('#runStat').textContent = `${n0(done)} / ${n0(total)} paths`;
    });
    if (cancelled) return;
    const res = buildResults(merged, cfg);
    const ms = performance.now() - t0;

    ST.lastResults = res; ST.lastCfg = cfg;

    // the evidence panel tests the ATTACHED series, not the simulation
    let vd = null, nullRes = null;
    if (ST.source && ST.source.length > 30 && ST.mode !== 'strategy') {
      vd = verdict(ST.source, { ppy: cfg.ppy, trials: cfg.trials });
      nullRes = sharpeNull(ST.source, { iters: 4000, seed: cfg.seed || 1, ppy: cfg.ppy });
    }
    ST.lastVerdict = vd; ST.lastNull = nullRes;

    $('#results').hidden = false;
    R.renderScore(res, vd, cfg, ST.sourceLabel);
    R.renderTiles(res, vd);
    let tail = tailCeiling(ST.source, cfg.model.id, cfg.horizon);
    if (tail && ST.source.length > 60) {
      try {
        const f = fitT(ST.source);
        tail.t = {
          df: f.df,
          q50: parametricWorst(f.mu, f.sigma, f.df, cfg.horizon, 0.50),
          q10: parametricWorst(f.mu, f.sigma, f.df, cfg.horizon, 0.10),
          q01: parametricWorst(f.mu, f.sigma, f.df, cfg.horizon, 0.01),
        };
        if (!Number.isFinite(tail.t.q01)) tail.t = null;
      } catch { tail.t = null; }
    }
    // the overfitting battery, when a whole sweep was attached
    if (ST.mode === 'variants' && ST.variants) {
      R.renderVariants(ST.variants, cfg);
      $('#varSection').hidden = false;
    } else { $('#varSection').hidden = true; }
    R.renderInheritNote(vd, cfg, cfg.model.id);
    R.renderPaths(res, cfg, tail);
    R.renderEvidence(res, vd, cfg, nullRes);
    R.renderLadder(res, cfg);
    R.renderDiagnostics(res, ST.mode === 'strategy' ? null : ST.source, cfg);
    R.renderTable(res);
    autoCondenseNow();

    $('#progBar').style.width = '100%';
    // chained from the idea tester, the status line belongs to the three-test run
    if (!opts.quiet) $('#runStat').textContent = `${n0(cfg.paths)} paths in ${(ms / 1000).toFixed(2)}s`;
    $('#runFoot').innerHTML = `Run fingerprint <code>${hashConfig(cfg)}</code> &middot; seed
      <code>${cfg.seed}</code> &middot; ${n0(cfg.paths)} paths &times; ${n0(cfg.horizon)} periods
      &middot; ${MODELS[cfg.model.id].label} &middot; ${(ms / 1000).toFixed(2)}s on ${CORES} worker${CORES > 1 ? 's' : ''}.
      The same seed and settings reproduce these numbers exactly.`;
    if (!opts.quiet) $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    $('#runStat').textContent = 'failed';
    $('#score').innerHTML = `<div class="msg bad"><b>The run failed.</b> ${esc(e.message)}</div>`;
    $('#results').hidden = false;
  } finally {
    setRunning(false);
  }
}

function buildLadder() {
  const cap = Math.max(2, +$('#maxlev').value || 10);
  const out = [];
  const steps = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 25, 30];
  for (const s of steps) if (s <= cap) out.push(s);
  if (!out.length) out.push(1);
  return out;
}

/* ---------------- model comparison ---------------- */
$('#cmpBtn').addEventListener('click', async () => {
  if (ST.running) return;
  setRunning(true);
  const hasSrc = !!(ST.source && ST.source.length > 40);
  const ids = hasSrc
    ? ['block', 'iid', 'normal', 't', 'garch', 'regime', 'jump']
    : ['normal', 't', 'garch', 'regime', 'jump', 'ar1'];
  const list = [];
  const paths = Math.min(20000, +$('#paths').value);
  try {
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const M = MODELS[id];
      if (M.needsSource && !hasSrc) continue;
      const params = {};
      for (const p of M.params) {
        params[p.k] = ST.params[p.k] ?? p.def;
      }
      // fit each parametric model to the data, so the comparison is like-for-like
      if (hasSrc && M.fit) {
        try {
          const f = M.fit(ST.source);
          for (const p of M.params) if (Number.isFinite(f[p.k])) params[p.k] = Math.max(p.min, Math.min(p.max, f[p.k]));
        } catch {}
      }
      if (id === 'block' && hasSrc) params.L = Math.max(1, Math.round(optimalBlockLength(ST.source).L));

      const cfg = buildConfig({ paths, ladder: null, model: { id, params }, bandPaths: Math.min(paths, 8000), keepPaths: 0 });
      $('#runStat').textContent = `comparing: ${M.label} (${i + 1}/${ids.length})`;
      const merged = await runOnPool(cfg, (d, t) => {
        $('#progBar').style.width = ((i + d / t) / ids.length * 100).toFixed(1) + '%';
      });
      const res = buildResults(merged, cfg);
      const medBand = res.bands.find(b => b.p === 0.5).values;
      list.push({
        id, grid: res.grid, medianBand: medBand,
        medianCagr: res.stats.cagr.median, p05Cagr: res.stats.cagr.q[0.05],
        medianDD: res.stats.maxDD.median, p95DD: res.stats.maxDD.q[0.95],
        pLoss: res.props.loss.p, pRuin: res.props.ruin.p,
      });
    }
    $('#cmpSub').textContent = `· ${n0(paths)} paths each, every parametric model fitted to your data`;
    R.renderComparison(list);
    $('#runStat').textContent = 'comparison done';
    $('#progBar').style.width = '100%';
    $('#results').hidden = false;
  } catch (e) {
    $('#cmpFoot').innerHTML = `<span class="neg">Comparison failed: ${esc(e.message)}</span>`;
  } finally { setRunning(false); }
});

/* ---------------- export ---------------- */
function download(name, text, type = 'application/json') {
  const b = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$('#expJson').addEventListener('click', () => {
  if (!ST.lastResults) return;
  const r = ST.lastResults, c = ST.lastCfg;
  // jsonSafe everywhere: a bare NaN makes the whole file unparseable
  const out = jsonSafe({
    generatedAt: new Date().toISOString(),
    fingerprint: hashConfig(c),
    config: { ...c, source: c.source ? `[${c.source.length} values omitted]` : null },
    summary: {
      paths: r.n, horizon: r.horizon, ppy: r.ppy, years: r.years,
      probabilities: { ruin: r.props.ruin.p, loss: r.props.loss.p, double: r.props.double.p, halved: r.props.half.p },
    },
    percentiles: Object.fromEntries(Object.entries(r.stats).map(([k, v]) => [k, { q: v.q, mean: v.mean, sd: v.sd, medianSE: v.medianSE }])),
    ladder: r.ladder,
    verdict: ST.lastVerdict,
    equityBands: { grid: r.grid, bands: r.bands.map(b => ({ p: b.p, logEquity: Array.from(b.values) })) },
  });
  download(`montecarlo-${hashConfig(c)}.json`, JSON.stringify(out, null, 2));
  $('#expNote').textContent = 'downloaded';
});

$('#expCsv').addEventListener('click', () => {
  if (!ST.lastResults) return;
  const r = ST.lastResults;
  const keys = Object.keys(r.stats).filter(k => r.stats[k].n);
  const lines = ['metric,p01,p05,p25,median,p75,p95,p99,mean,sd,mc_error'];
  for (const k of keys) {
    const s = r.stats[k];
    const f = v => (Number.isFinite(v) ? v.toPrecision(8) : '');
    lines.push([k, f(s.q[0.01]), f(s.q[0.05]), f(s.q[0.25]), f(s.q[0.5]), f(s.q[0.75]),
                f(s.q[0.95]), f(s.q[0.99]), f(s.mean), f(s.sd), f(s.medianSE)].join(','));
  }
  download(`montecarlo-${hashConfig(ST.lastCfg)}.csv`, lines.join('\n'), 'text/csv');
  $('#expNote').textContent = 'downloaded';
});

$('#shareBtn').addEventListener('click', async () => {
  const cfg = buildConfig();
  const share = {
    m: cfg.model.id, p: cfg.model.params, s: cfg.sizing, c: cfg.costs, x: cfg.exec,
    h: cfg.horizon, y: cfg.ppy, n: cfg.paths, sd: cfg.seed, t: cfg.trials, r: cfg.ruinAt,
    ex: ST.mode === 'examples' ? exId : null,
    exk: ST.mode === 'examples' ? exKind : null,
    st: ST.mode === 'strategy' ? ST.strategySrc : null,
  };
  const url = location.origin + location.pathname + '#' + btoa(encodeURIComponent(JSON.stringify(jsonSafe(share))));
  try { await navigator.clipboard.writeText(url); $('#expNote').textContent = 'link copied'; }
  catch { $('#expNote').textContent = 'copy failed — the link is in the address bar'; location.hash = url.split('#')[1]; }
});

function restoreFromHash() {
  if (!location.hash || location.hash.length < 8) return false;
  try {
    const o = JSON.parse(decodeURIComponent(atob(location.hash.slice(1))));
    if (o.ex && o.exk === 'real') { loadReal().then(() => { exKind = 'real'; exId = o.ex; pickExample(); }).catch(() => {}); }
    else if (o.ex && DATA_EXAMPLES[o.ex]) { exKind = 'gen'; exId = o.ex; pickExample(); }
    if (o.st) {
      ST.strategySrc = o.st; $('#stratBox').value = o.st;
      $$('#srcTabs button').find(b => b.dataset.pane === 'pStrat').click();
      checkStrategy();
    }
    if (o.m && MODELS[o.m]) { ST.modelId = o.m; ST.params = { ...(o.p || {}) }; }
    if (o.h) $('#horizon').value = o.h;
    if (o.y) $('#ppy').value = o.y;
    if (o.n) $('#paths').value = o.n;
    if (o.sd != null) $('#seed').value = o.sd;
    if (o.t) $('#trials').value = o.t;
    if (o.r != null) { $('#ruinAt').value = o.r; $('#ruinAt').dispatchEvent(new Event('input')); }
    if (o.s) {
      $('#sizeMode').value = o.s.mode || 'fixed';
      $('#lev').value = o.s.leverage ?? 1; $('#tgt').value = o.s.targetVol ?? 0.15;
      $('#volwin').value = o.s.volWindow ?? 60; $('#kf').value = o.s.kellyFraction ?? 0.5;
      $('#maxlev').value = o.s.maxLeverage ?? 10;
      $('#sizeMode').dispatchEvent(new Event('change'));
      ['lev', 'tgt', 'volwin', 'kf', 'maxlev'].forEach(k => $('#' + k).dispatchEvent(new Event('input')));
    }
    if (o.x) {
      $('#skipProb').value = o.x.skipProb ?? 0; $('#slipMean').value = o.x.slipMeanBps ?? 0;
      $('#slipSd').value = o.x.slipSdBps ?? 0; $('#gapProb').value = o.x.gapProb ?? 0;
      $('#gapBps').value = o.x.gapBps ?? 0;
      ['skipProb', 'gapProb'].forEach(k => $('#' + k).dispatchEvent(new Event('input')));
    }
    if (o.c) {
      $('#costBps').value = o.c.bpsPerPeriod ?? 0; $('#turnBps').value = o.c.bpsPerTurnover ?? 0;
      $('#finRate').value = o.c.financingAnnual ?? 0; $('#taxRate').value = o.c.taxRate ?? 0;
      $('#taxMode').value = o.c.taxMode || 'net';
    }
    refreshModelChips(); renderParams();
    return true;
  } catch { return false; }
}

/* ---------------- mode switch ---------------- */
/* Two jobs, one page. "Test an idea" is the primary flow -- a rule plus the
 * ranges it may be searched over, run through all three robustness tests.
 * "Monte Carlo only" is for when you already have a return series and just want
 * the path, leverage and ruin analysis. */
function setMode(mode) {
  const idea = mode === 'idea';
  $('#mIdea').setAttribute('aria-selected', String(idea));
  $('#mMC').setAttribute('aria-selected', String(!idea));
  $('#ideaPane').hidden = !idea;
  $('#mcBrief').hidden = idea;
  $('#setup').hidden = idea || !mcOpen;
  if (!idea) syncMcLine();
  $('#results').hidden = !ST.lastResults;   // test 3's output, whichever mode produced it
  $('#ideaResults').hidden = !idea || !IDEA.last;
  $('#ideaRun').hidden = !idea;
  $('#runBtn').hidden = idea;
  syncTests(idea);
  syncWhatPick(mode);
  $('#runStat').textContent = 'ready';
  try { localStorage.setItem('mc.mode', mode); } catch {}
}

/* The Monte-Carlo-only controls are four steps of sliders. They stay shut until
 * asked for, and the state survives mode switches so it does not keep closing
 * itself under someone who opened it on purpose. */
let mcOpen = false;
function openSetup(on) {
  mcOpen = on;
  $('#setup').hidden = !on;
  $('#mcToggle').setAttribute('aria-expanded', String(on));
  $('#mcToggle').textContent = on ? 'Done' : 'Change';
}
$('#mcToggle').addEventListener('click', () => openSetup(!mcOpen));

/* One line standing in for the four steps. Built from the live controls, so it
 * cannot drift from what will actually be run. */
function syncMcLine() {
  const bits = [];
  if (ST.sourceLabel) bits.push(ST.sourceLabel);
  if (ST.source && ST.source.length) bits.push(`${n0(ST.source.length)} periods`);
  if (MODELS[ST.modelId]) bits.push(MODELS[ST.modelId].label);
  bits.push(`${n0(+$('#paths').value || 0)} paths`);
  bits.push(`${n0(+$('#horizon').value || 0)} ahead`);
  $('#mcLine').textContent = bits.join(' \u00b7 ');
}
$('#setup').addEventListener('input', syncMcLine);
$('#setup').addEventListener('change', syncMcLine);
$('#setup').addEventListener('click', () => setTimeout(syncMcLine, 0));

/* The three tests are the page in BOTH modes. Walk-forward and sensitivity
 * re-optimise and nudge the rule, so a finished return series -- which is all a
 * published board hands over -- can only take the third one. Greying the other
 * two and saying why beats quietly running one test under a heading of three. */
function syncTests(idea) {
  for (const id of ['#t-wf', '#t-sens']) {
    const li = $(id); if (!li) continue;
    const em = li.querySelector('em');
    if (!em.dataset.on) em.dataset.on = em.textContent;
    li.classList.toggle('off', !idea);
    em.textContent = idea ? em.dataset.on : em.dataset.why;
  }
  $('#runHint').textContent = idea
    ? 'Same seed, same answer, every time.'
    : 'A finished return series has no parameters left, so only the third test applies.';
}

/* Back. Inside the site shell the shell owns the address bar and the tab strip,
 * so it is asked to navigate rather than the frame moving under it. Standalone,
 * this is just the folder above. */
function goBack() {
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ source: 'trad', go: 'back' }, location.origin);
      return;
    }
  } catch { /* cross-origin parent: fall through to the plain link */ }
  location.href = '../';
}
for (const id of ['#backBtn', '#backBtn2']) {
  const b = $(id); if (b) b.addEventListener('click', goBack);
}
$('#mIdea').addEventListener('click', () => setMode('idea'));
$('#mMC').addEventListener('click', () => setMode('mc'));

const IDEA = initIdea({
  loadReal,
  showBar,
  /* Attach the walk-forward's out-of-sample returns as the simulator's source.
   * These are the only returns worth resampling: the parameters were never
   * fitted to them. Trials carry over, because searching a grid IS multiple
   * testing and the Deflated Sharpe has to be told how wide the search was. */
  loadOos(returns, label, trials) {
    ST.source = returns;
    ST.sourceLabel = label;
    ST.sourceNote = 'walk-forward out-of-sample output — never fitted to';
    ST.strategySrc = '';
    ST.mode = 'paste';
    exKind = 'gen';
    $('#trials').value = Math.max(1, trials || 1);
    $('#ppy').value = 252;
    $('#horizon').value = Math.max(252, Math.min(5040, returns.length));
    $$('#srcTabs button').forEach(x => x.setAttribute('aria-selected', String(x.dataset.pane === 'pPaste')));
    for (const p of ['pExamples', 'pPaste', 'pStrat', 'pVar', 'pSaved']) $('#' + p).hidden = true;
    $('#pPaste').hidden = false;
    $('#parseMsg').innerHTML = `<div class="msg ok"><b>Loaded ${n0(returns.length)} out-of-sample returns</b>
      from the walk-forward run. Trials set to ${n0(trials || 1)} from the grid you searched.</div>`;
    afterSourceChange();
  },
  sendToMonteCarlo(returns, label, trials) {
    this.loadOos(returns, label, trials);
    setMode('mc');
    $('#setup').scrollIntoView({ behavior: 'smooth', block: 'start' });
  },
  /* Test 3, on the same button press. One button was asked for, so the third
   * test cannot be a second button -- it runs here and its results land under
   * the other two. Quiet, because the status line belongs to the whole run. */
  async chainMonteCarlo(returns, label, trials) {
    this.loadOos(returns, label, trials);
    await run({ quiet: true });
    $('#ideaResults').hidden = false;
    $('#results').hidden = !ST.lastResults;
    return !!ST.lastResults;
  },
});

/* ---------------- what is being tested ---------------- */
/* Every strategy published on /trad, in one list, together with the rule flow.
 * Choosing also decides the mode, because the choice IS the mode: a board
 * publishes a finished return series, which can only take test 3.
 *
 * The boards are read in parallel in the background. You almost always arrive
 * here from /trad, which has just fetched the same four files, so they come
 * back from the HTTP cache. */
function renderWhatOptions(groups) {
  $('#whatPick').innerHTML =
    '<optgroup label="Your own">' +
      '<option value="rule">A rule I write</option>' +
      '<option value="attach">A series I paste in</option>' +
    '</optgroup>' +
    groups.map((g) => {
      /* Closed, a select shows only the option -- not the group it came from.
         Two boards both offer a series called "Parabolic SAR", so the market
         has to ride on the option itself or the collapsed control is a lie. */
      const market = g.label.includes(' \u00b7 ') ? g.label.split(' \u00b7 ').pop() : null;
      return `<optgroup label="${esc(g.label)}">` + g.series.map((x) => {
        const label = market && !x.label.includes(market) ? `${market} \u00b7 ${x.label}` : x.label;
        return `<option value="board:${esc(g.id)}:${esc(x.key)}">${esc(label)}</option>`;
      }).join('') + '</optgroup>';
    }).join('');
}

/* Keep the dropdown telling the truth about what is actually attached --
 * including when that is neither a rule nor a board, which is what the idea
 * tester hands over when it chains into the Monte Carlo. */
function syncWhatPick(mode) {
  const sel = $('#whatPick');
  if (mode === 'idea') { sel.value = 'rule'; return; }
  if (ST.boardKey && [...sel.options].some(o => o.value === ST.boardKey)) { sel.value = ST.boardKey; return; }
  let other = sel.querySelector('option[value="other"]');
  if (!other) {
    const g = document.createElement('optgroup');
    g.label = 'Attached here';
    other = document.createElement('option');
    other.value = 'other';
    g.appendChild(other);
    sel.insertBefore(g, sel.firstChild);
  }
  other.textContent = ST.sourceLabel || 'the attached series';
  sel.value = 'other';
}

async function buildWhatList() {
  renderWhatOptions([]);
  $('#whatNote').textContent = 'reading\u2026';
  // the order the tabs are in on /trad, so the two lists read the same way
  const ORDER = ['gs', 'gold', 'mes', 'bell'];
  const ids = [...ORDER.filter(x => BOARDS[x]), ...Object.keys(BOARDS).filter(x => !ORDER.includes(x))];
  const loaded = await Promise.all(ids.map(id => getBoard(id).catch(() => null)));
  const groups = [];
  ids.forEach((id, i) => {
    const b = loaded[i];
    if (b && b.series && b.series.length) groups.push({ id, label: b.label, series: b.series });
  });
  renderWhatOptions(groups);
  syncWhatPick($('#ideaPane').hidden ? 'mc' : 'idea');
  const n = groups.reduce((a, g) => a + g.series.length, 0);
  // the groups name themselves; a count underneath would just be more words
  $('#whatNote').textContent = groups.length ? '' : 'no boards could be read';
}

$('#whatPick').addEventListener('change', async () => {
  const v = $('#whatPick').value;
  if (v === 'other') return;                       // already attached; nothing to do
  if (v === 'rule' || v === 'attach') {
    // drop the board fragment, or the link still points at a board
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    if (v === 'rule') { setMode('idea'); return; }
    // "paste something in" has to open the pane you paste into
    setMode('mc');
    openSetup(true);
    $('#setup').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }
  const m = /^board:([a-z0-9_]+):(.*)$/i.exec(v);
  if (m) await pickBoard(m[1], m[2]);
});

/* ---------------- the /trad boards ---------------- */
/* The Test button on a board links here with #board=<id>&series=<key>, and the
 * dropdown at the top of the page switches between all of them. The data is
 * fetched from each board's own JSON rather than stuffed into a URL, so the lab
 * is always reading the published figures. Converted boards are cached: there
 * is no reason to re-read and re-verify one you have already looked at. */
const boardCache = new Map();
function getBoard(id) {
  if (!boardCache.has(id)) boardCache.set(id, loadBoard(id, '../'));
  return boardCache.get(id);
}

async function restoreFromBoard() {
  const m = /(?:^|[#&])board=([a-z0-9_]+)/i.exec(location.hash || '');
  if (!m) return false;
  const id = m[1];
  if (!BOARDS[id]) return false;
  const want = (/(?:^|[#&])series=([^&]+)/.exec(location.hash || '') || [])[1];
  return pickBoard(id, want && decodeURIComponent(want));
}

async function pickBoard(id, want) {
  if (!BOARDS[id]) return false;
  $('#runStat').textContent = `loading the ${BOARDS[id].label} board...`;
  try {
    const b = await getBoard(id);
    const chosen = (want && b.series.find(s2 => s2.key === want)) || b.series[0];
    ST.source = Float64Array.from(chosen.returns);
    // "Parabolic SAR · Gold — Parabolic SAR" says it twice
    ST.sourceLabel = b.label.includes(chosen.label) ? b.label : `${b.label} — ${chosen.label}`;
    ST.sourceNote = b.note;
    ST.strategySrc = '';
    ST.mode = 'paste';
    exKind = 'gen';
    $('#ppy').value = b.ppy;
    $('#horizon').value = Math.max(60, Math.min(5040, chosen.n));
    $('#trials').value = Math.max(1, b.series.length);
    setMode('mc');
    $$('#srcTabs button').forEach(x => x.setAttribute('aria-selected', String(x.dataset.pane === 'pPaste')));
    for (const pane of ['pExamples', 'pPaste', 'pStrat', 'pVar', 'pSaved']) $('#' + pane).hidden = true;
    $('#pPaste').hidden = false;

    const warn = b.unit === 'cumbps'
      ? `<div class="msg warn"><b>The board reports this additively, on a fixed stake.</b>
         Its published total is <b>${(chosen.additiveTotal * 100).toFixed(1)}%</b> — the sum of each period's
         result on the same notional. This simulator compounds instead, which turns the same series into
         <b>${(chosen.compoundedTotal * 100).toFixed(1)}%</b>. Neither is wrong; they are two different
         bet-sizing rules, and the leverage ladder below is exactly where that choice gets examined.</div>`
      : '';
    $('#parseMsg').innerHTML = `<div class="msg ok"><b>Loaded ${n0(chosen.n)} periods from the
      ${esc(ST.sourceLabel)} board</b>, ${b.ppy} periods a year.
      ${b.verified ? 'The conversion was checked against the figure the board itself publishes.'
                   : '<b>Warning: the conversion did not reproduce the board\'s published figure.</b>'}
      ${b.series.length > 1 ? `Trials set to ${b.series.length} — the number of variants that board shows.` : ''}
      </div>${warn}`;
    afterSourceChange();
    /* The attach pane is folded away by default, and the additive-vs-compounded
     * warning is not a detail -- it is the difference between +290% and +1,414%.
     * Mirror it where it can still be read. */
    $('#mcNote').innerHTML = $('#parseMsg').innerHTML;
    syncMcLine();
    /* The address has to follow the choice, or copying the link hands someone
     * the board you arrived from rather than the one you are looking at. */
    const frag = `#board=${id}&series=${encodeURIComponent(chosen.key)}`;
    if (location.hash !== frag) history.replaceState(null, '', frag);
    ST.boardKey = `board:${id}:${chosen.key}`;
    syncWhatPick('mc');
    $('#runStat').textContent = 'ready';
    return true;
  } catch (e) {
    $('#parseMsg').innerHTML = `<div class="msg bad"><b>Could not load that board.</b> ${esc(e.message)}</div>`;
    $('#runStat').textContent = 'board failed to load';
    return false;
  }
}

/* ---------------- boot ---------------- */
window.__mcGen = { optimalBlockLength };
exKind = 'gen'; exId = 'index';
renderExamples();
pickExample();
$('#sizeMode').dispatchEvent(new Event('change'));
$('#stratMsg').innerHTML = `<div class="msg info">${esc(STRAT_EXAMPLES.sma.note)}</div>`;
if (!restoreFromHash()) { /* defaults already in place */ }
refreshModelChips();
renderParams();
let savedMode = 'idea';
try { savedMode = localStorage.getItem('mc.mode') || 'idea'; } catch {}
setMode(location.hash && location.hash.length > 8 ? 'mc' : savedMode);
restoreFromBoard().then(buildWhatList);
/* The shell navigates between boards by changing this frame's fragment, which
 * does NOT reload the document -- so the board has to be re-read here. */
addEventListener('hashchange', () => { restoreFromBoard(); });
/* Fold every explanatory block behind an info button, now and for anything
   rendered later. The prose stays; it just stops taking up the page. */
autoCondense();
