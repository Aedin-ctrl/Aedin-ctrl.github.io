// Harness controller.
//
// This page is the measuring instrument, not a demo. Its job is to let you point
// the tracker at awkward footage and see exactly what it did: which rotation it
// chose, what it scored, which joints it actually found, and how long it took.

import { createTracker, partInfo } from '../anybody.js';
import { drawResult, fitCanvas, pick, readTheme } from './draw.js';
import { Recorder, download, stamp } from './export.js';

const $ = (id) => document.getElementById(id);

const ui = {
  stage: $('stage'), video: $('feed'), canvas: $('overlay'), empty: $('empty'),
  status: $('status'), table: $('table').querySelector('tbody'),
  stats: $('stats'), rot: $('rot'),
  orientation: $('orientation'), minScore: $('minScore'), minScoreOut: $('minScoreOut'),
  rec: $('rec'), saveJson: $('saveJson'), saveCsv: $('saveCsv'), recInfo: $('recInfo'),
  reset: $('reset'), frame: $('frame'),
};

const show = { skeleton: true, points: true, box: true, face: false, feed: true };
const state = {
  tracker: null, result: null, hover: null, running: false, busy: false,
  minScore: 0.3, frames: 0, fpsAt: 0, fps: 0, visible: true, lastTableAt: 0, rows: null,
};
const recorder = new Recorder();
let theme = readTheme();

// --- status ----------------------------------------------------------------

function say(msg, kind = '') {
  ui.status.textContent = msg;
  ui.status.className = kind;
}

// --- source ----------------------------------------------------------------

async function useCamera() {
  stop();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
    });
    ui.video.srcObject = stream;
    ui.video.loop = false;
    ui.video.muted = true;
    await ui.video.play();
    begin('camera');
  } catch (err) {
    say(`Camera unavailable: ${err.message}`, 'warn');
  }
}

function useFile(file) {
  stop();
  if (ui.video.srcObject) {
    ui.video.srcObject.getTracks().forEach((t) => t.stop());
    ui.video.srcObject = null;
  }
  ui.video.src = URL.createObjectURL(file);
  ui.video.loop = true;
  ui.video.muted = true;
  ui.video.controls = true;
  ui.video.play().then(() => begin(file.name)).catch((e) => say(e.message, 'warn'));
}

function stop() {
  state.running = false;
  state.result = null;
  if (recorder.recording) toggleRecord();
}

async function begin(label) {
  ui.empty.hidden = true;
  ui.stage.hidden = false;
  say(`Loading model…`);
  if (!state.tracker) {
    try {
      state.tracker = await createTracker({ orientation: ui.orientation.value || 'auto' });
    } catch (err) {
      say(`Could not load the model: ${err.message}`, 'warn');
      return;
    }
  }
  say(`Tracking — ${label}`);
  state.running = true;
  state.frames = 0;
  state.fpsAt = performance.now();
  loop();
}

// --- loop ------------------------------------------------------------------

function schedule(fn) {
  if ('requestVideoFrameCallback' in HTMLVideoElement.prototype && !ui.video.paused) {
    ui.video.requestVideoFrameCallback(() => fn());
  } else {
    requestAnimationFrame(() => fn());
  }
}

async function loop() {
  if (!state.running) return;
  // Skip the work entirely while the stage is not being rendered.
  if (!state.visible || ui.video.readyState < 2) { schedule(loop); return; }

  // Drop to the latest frame rather than queueing: a backlog turns into
  // unbounded latency, and a stale skeleton is worse than a skipped one.
  if (!state.busy) {
    state.busy = true;
    try {
      state.result = await state.tracker.estimate(ui.video, performance.now());
      state.frames++;
    } catch (err) {
      say(`Tracking stopped: ${err.message}`, 'warn');
      state.running = false;
      return;
    } finally {
      state.busy = false;
    }
    if (recorder.recording) {
      recorder.push(state.result, ui.video.currentTime * 1000);
      updateRecInfo();
    }
  }

  render();
  schedule(loop);
}

function render() {
  const { w, h, dpr } = fitCanvas(ui.canvas);
  const ctx = ui.canvas.getContext('2d');
  drawResult(ctx, state.result, {
    w, h, dpr, theme, show, minScore: state.minScore, hover: state.hover,
  });

  const now = performance.now();
  if (now - state.fpsAt > 500) {
    state.fps = (state.frames * 1000) / (now - state.fpsAt);
    state.frames = 0;
    state.fpsAt = now;
  }
  updateStats();
  if (now - state.lastTableAt > 100) { updateTable(); state.lastTableAt = now; }
}

// --- panel -----------------------------------------------------------------

function updateStats() {
  const r = state.result;
  const row = (k, v) => `<dt>${k}</dt><dd>${v}</dd>`;
  if (!r) { ui.stats.innerHTML = row('status', '—'); ui.rot.innerHTML = ''; return; }

  const found = Object.keys(r.parts);
  ui.stats.innerHTML = [
    row('fps', state.fps.toFixed(1)),
    row('frame', `${r.timings.totalMs.toFixed(1)} ms`),
    row('inference', `${r.timings.inferenceMs.toFixed(1)} ms`),
    row('passes', r.timings.passes),
    row('rotation', `${r.orientation.applied}°${r.orientation.searched ? ' (searched)' : ''}`),
    row('rot. score', r.orientation.score.toFixed(3)),
    row('parts', found.length ? found.join(', ') : '<span class="warn">none found</span>'),
    row('points', r.points.length),
    row('model', `${r.modelId}`),
    row('schema', `v${r.schemaVersion}`),
  ].join('');

  // Per-rotation scores, shown only on the frames where a search actually ran —
  // otherwise three of the four numbers would be stale.
  if (r.orientation.scores) {
    ui.rot.innerHTML = Object.entries(r.orientation.scores).map(([deg, s]) =>
      `<div class="${Number(deg) === r.orientation.applied ? 'win' : ''}">${deg}°<span class="v">${s.toFixed(2)}</span></div>`
    ).join('');
  }
}

/** Build the table once per layout, then only write cell text. */
function buildTable(result) {
  const rows = [];
  ui.table.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const part of Object.keys(result.parts)) {
    if (part === 'face') continue; // 478 rows helps nobody; the mesh is a visual check
    for (const p of result.parts[part]) {
      const tr = document.createElement('tr');
      const colour = part === 'leftHand' ? 'var(--left)'
        : part === 'rightHand' ? 'var(--right)'
        : p.name.startsWith('left_') ? 'var(--left)'
        : p.name.startsWith('right_') ? 'var(--right)' : 'var(--centre)';
      // Set via CSSOM, not a style="" attribute: the page's own CSP forbids
      // inline style attributes, and CSSOM writes are not covered by it.
      tr.innerHTML =
        `<td class="dot">${p.name}</td>` +
        `<td class="num">${p.index}</td><td class="num"></td>` +
        `<td class="num"></td><td class="num"></td>`;
      tr.firstElementChild.style.setProperty('--c', colour);
      frag.append(tr);
      rows.push({ tr, part, index: p.index, cells: tr.querySelectorAll('td') });
    }
  }
  ui.table.append(frag);
  state.rows = rows;
  state.rowKey = Object.keys(result.parts).join('|');
}

function updateTable() {
  const r = state.result;
  if (!r) return;
  const key = Object.keys(r.parts).join('|');
  if (!state.rows || state.rowKey !== key) buildTable(r);
  for (const row of state.rows) {
    const p = r.parts[row.part]?.[row.index];
    const hot = state.hover && state.hover.part === row.part && state.hover.index === row.index;
    row.tr.classList.toggle('hot', !!hot);
    if (!p) { row.cells[2].textContent = row.cells[3].textContent = row.cells[4].textContent = '—'; continue; }
    row.cells[2].textContent = p.x.toFixed(3);
    row.cells[3].textContent = p.y.toFixed(3);
    row.cells[4].textContent = p.score.toFixed(2);
  }
}

function updateRecInfo() {
  const mb = recorder.bytes / 1048576;
  ui.recInfo.textContent = recorder.frames
    ? `${recorder.frames} frames · ${mb.toFixed(1)} MB${recorder.droppedForLimit ? ' · limit reached' : ''}`
    : '';
  const has = recorder.frames > 0 && !recorder.recording;
  ui.saveJson.disabled = !has;
  ui.saveCsv.disabled = !has;
}

// --- controls --------------------------------------------------------------

function toggleRecord() {
  if (!recorder.recording) {
    if (!state.result) { say('Nothing to record yet.', 'warn'); return; }
    recorder.start(state.result);
    ui.rec.textContent = '■ Stop';
    ui.rec.setAttribute('aria-pressed', 'true');
  } else {
    recorder.stop();
    ui.rec.textContent = '● Record';
    ui.rec.setAttribute('aria-pressed', 'false');
  }
  updateRecInfo();
}

function bindToggle(id, key) {
  const el = $(id);
  el.setAttribute('aria-pressed', String(show[key]));
  el.addEventListener('click', () => {
    show[key] = !show[key];
    el.setAttribute('aria-pressed', String(show[key]));
    if (key === 'feed') ui.stage.style.setProperty('--feed-opacity', show.feed ? '1' : '0.12');
    render();
  });
}

$('useCamera').addEventListener('click', useCamera);
$('file').addEventListener('change', (e) => { if (e.target.files[0]) useFile(e.target.files[0]); });
['skeleton', 'points', 'box', 'face', 'feed'].forEach((k) => bindToggle(`t-${k}`, k));

ui.orientation.addEventListener('change', async () => {
  const v = ui.orientation.value;
  const mode = v === 'auto' || v === 'none' ? v : Number(v);
  if (state.tracker) { state.tracker.close(); state.tracker = null; }
  state.tracker = await createTracker({ orientation: mode });
  say(`Orientation: ${v}`);
});

ui.minScore.addEventListener('input', () => {
  state.minScore = Number(ui.minScore.value);
  ui.minScoreOut.textContent = state.minScore.toFixed(2);
  render();
});

ui.reset.addEventListener('click', () => {
  state.tracker?.resetOrientation();
  say('Orientation lock cleared.');
});

ui.rec.addEventListener('click', toggleRecord);
ui.saveJson.addEventListener('click', () =>
  download(`anybody_${stamp()}.json`, recorder.toJSON(state.result), 'application/json'));
ui.saveCsv.addEventListener('click', () =>
  download(`anybody_${stamp()}.csv`, recorder.toCSV(state.result), 'text/csv'));

// --- hover -----------------------------------------------------------------

ui.frame.addEventListener('pointermove', (e) => {
  const rect = ui.canvas.getBoundingClientRect();
  state.hover = pick(state.result, e.clientX - rect.left, e.clientY - rect.top,
    rect.width, rect.height, { minScore: state.minScore });
  render();
});
ui.frame.addEventListener('pointerleave', () => { state.hover = null; render(); });

// --- lifecycle -------------------------------------------------------------

// Pause the whole pipeline when the stage is not being rendered.
ui.stage.addEventListener('contentvisibilityautostatechange', (e) => {
  state.visible = !e.skipped;
});
document.addEventListener('visibilitychange', () => {
  state.visible = document.visibilityState === 'visible';
});

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  theme = readTheme();
  render();
});
addEventListener('resize', render);

updateRecInfo();
say('Choose a camera or a video file to begin.');
