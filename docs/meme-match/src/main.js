// MemeMatch app: camera → tracking worker → features → scores for the current mode → calm winner.
// Modes: Emoji and Hamsters (memes/index.json; the old meme set is ?mode=memes). The analysed camera
// frame is drawn together with its mask, so the mask never trails the picture.
import { Tracker } from './track/tracker.js';
import { openCamera, cameraError, delegatesFromURL, fitCanvas } from './track/camera.js';
import { BodySmoother } from './track/smooth.js';
import { drawBody, obsToBody } from './render/mask.js';
import { memeBodyPx, overlayToBody } from './render/overlay.js';
import { BS_NAMES } from './track/frame.js';
import { extract } from './features/extract.js';
import { FEATS } from './features/schema.js';
import { AutoCalib, DEFAULT_CALIB, loadCalib, saveCalib } from './features/calib.js';
import { rankMemes } from './match/score.js';
import { WinnerPicker, WINNER_DEFAULTS } from './match/winner.js';
import { loadIndex, loadLibrary } from './match/library.js';
import { applyPersonal, loadPersonal, savePersonal } from './match/personal.js';
import { hintFor } from './match/hints.js';
import { Trainer } from './train.js';
import { memeImage } from './render/picture.js';

const q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const video = $('feed'), stage = $('stage'), you = $('you'), hud = $('hud'), statusEl = $('status'), nudge = $('nudge');
const memeCanvas = $('meme'), memeCard = $('memeCard');
const g = you.getContext('2d'), mg = memeCanvas.getContext('2d');

const state = {
  mode: null, index: null, base: [], memes: [], byId: new Map(), images: new Map(), personal: null,
  raw: null, obs: null, image: null, arrivals: [], showCam: true, debug: q.has('debug'),
  showMasks: (() => { try { return localStorage.getItem('memematch.masks') !== 'off'; } catch { return true; } })(),
  calib: loadCalib() || { ...DEFAULT_CALIB }, calibSource: loadCalib() ? 'saved' : 'auto',
  feats: null, ranked: null, match: { winner: null, smooth: [] }, trainer: null,
};
hud.hidden = !state.debug;
$('debug').classList.toggle('on', state.debug);

const COL = { none: '#F4F5F7', good: '#7CE3B1', ok: '#F2C46D', bad: '#F08A8E' };
const grade = (s) => (s === undefined ? 'none' : s >= 0.75 ? 'good' : s >= 0.5 ? 'ok' : 'bad');
const tint = (parts) => ({ face: COL[grade(parts?.face)], hands: COL[grade(parts?.hands)], arms: COL[grade(parts?.arms)] });
const setStatus = (text, kind = '') => { statusEl.textContent = text; statusEl.className = `chip status ${kind}`; };

// ── modes ─────────────────────────────────────────────────────────────────────────────────
const picker = new WinnerPicker();
const autoCalib = new AutoCalib();

async function setMode(mode) {
  state.mode = mode;
  try { localStorage.setItem('memematch.mode', mode); } catch {}
  for (const b of $('tabs').children) b.classList.toggle('on', b.dataset.mode === mode);
  const u = new URL(location.href); u.searchParams.set('mode', mode); history.replaceState(null, '', u);
  state.trainer?.stop();
  // some modes always show their closest match instead of "no match" (memes/index.json → always)
  picker.o = { ...WINNER_DEFAULTS, ...(state.index?.always?.includes(mode) ? { enter: 0, exit: 0, enterMargin: 0, margin: 0.08 } : {}) };
  state.base = await loadLibrary(mode);
  state.personal = loadPersonal(mode);
  applyLibrary();
  for (const m of state.base) if (!state.images.has(m.id)) memeImage(m).then((im) => state.images.set(m.id, im), () => {});
  $('emptyBig').textContent = mode.startsWith('hamster') ? 'Be a hamster' : 'Make a face';
  $('emptySub').textContent = `${state.base.length} to find. ${state.personal?.on ? 'Using your training.' : 'Press “Train on your face” for the best results.'}`;
}
function applyLibrary() {
  state.memes = applyPersonal(state.base, state.personal);
  state.byId = new Map(state.memes.map((m) => [m.id, m]));
  picker.reset();
  const c = state.personal?.on && state.personal.calib;
  const saved = loadCalib();
  state.calib = c ? { ...c, neutralBs: c.neutralBs ? Float32Array.from(c.neutralBs) : null } : saved || autoCalib.calib || { ...DEFAULT_CALIB };
  state.calibSource = c ? 'training' : saved ? 'saved' : 'auto';
  const b = $('usePersonal');
  b.hidden = !state.personal;
  b.textContent = state.personal?.on ? 'Using your training' : 'Using the defaults';
  b.classList.toggle('on', !!state.personal?.on);
}
$('usePersonal').onclick = () => {
  if (!state.personal) return;
  state.personal.on = !state.personal.on;
  savePersonal(state.mode, state.personal);
  applyLibrary();
};

// ── camera + tracker ──────────────────────────────────────────────────────────────────────
let tracker = null;
// light smoothing only: the picture is the same frame the landmarks came from, so any lag shows
const smoother = new BodySmoother({ face: { minCutoff: 2.5, beta: 0.05 }, hand: { minCutoff: 3, beta: 0.05 }, pose: { minCutoff: 2, beta: 0.03 } });

async function start() {
  $('retry').hidden = true;
  setStatus('Starting camera…');
  try {
    const [t] = await Promise.all([tracker ? Promise.resolve(tracker) : Tracker.create({ delegates: delegatesFromURL(q), pose: state.mode === 'memes' }), openCamera(video)]);
    tracker = t;
  } catch (e) {
    setStatus(e?.name ? cameraError(e) : `Tracking failed to start: ${e.message}`, 'error');
    $('retry').hidden = false;
    console.error(e);
    return;
  }
  setStatus('Tracking', 'ok');
  tracker.pump(video, onObs, { keep: true });
}

function onObs(obs) {
  const now = performance.now();
  state.arrivals.push(now);
  while (state.arrivals.length && now - state.arrivals[0] > 1000) state.arrivals.shift();
  state.image?.close();
  state.image = obs.image;
  video.classList.add('synced');
  state.raw = obs;
  state.obs = smoother.update(obs, obs.t / 1000);
  if (state.trainer?.running) state.trainer.feed(obs, now);
  // until you train or calibrate, measure expressions against your own resting face as it's learned
  const learned = autoCalib.add(obs);
  if (state.calibSource === 'auto' && learned) state.calib = learned;
  if (!(obs.face || obs.pose) || !state.memes.length) { state.match = picker.update(null, now); state.ranked = null; return; }
  const f = extract(obs, state.calib);
  state.feats = f;
  state.ranked = rankMemes(f.x, f.valid, state.memes);
  state.match = picker.update(state.ranked, now);
}

// ── training ──────────────────────────────────────────────────────────────────────────────
const trainUI = { panel: $('trainer'), step: $('trainStep'), img: $('trainImg'), title: $('trainTitle'), cue: $('trainCue'), bar: $('trainBar'), barWrap: $('trainBar').parentElement, result: $('trainResult'), summary: $('trainSummary'), stop: $('trainStop') };
let devAPI = false;
fetch('/api/recordings').then((r) => { devAPI = r.ok && /json/.test(r.headers.get('content-type') || ''); }, () => {});
function startTraining() {
  if (!tracker) { setStatus('Wait for the camera first', 'error'); return; }
  state.trainer?.stop();
  state.trainer = new Trainer({ mode: state.mode, memes: state.base, ui: trainUI, onDone: (personal, calib) => {
    $('trainSaveDefault').hidden = !(personal && devAPI);
    if (!personal) return;
    state.personal = personal;
    savePersonal(state.mode, personal);
    if (calib) saveCalib(calib);
    applyLibrary();
  } });
  state.trainer.start(performance.now());
}
$('train').onclick = startTraining;
$('trainAgain').onclick = startTraining;
$('trainStop').onclick = () => state.trainer?.stop();
$('trainDone').onclick = () => state.trainer?.stop();
$('trainSaveDefault').onclick = async () => {
  try { await state.trainer.saveDefaults(state.personal); setStatus('Saved as the defaults (memes/*.json + recordings/)', 'ok'); }
  catch (e) { setStatus(`Save failed: ${e.message}`, 'error'); }
};

// ── drawing ───────────────────────────────────────────────────────────────────────────────
function nudgeText(obs) {
  if (state.trainer?.running || !obs) return '';
  if (!obs.face) return obs.hands.length ? 'Show your face too' : 'Face the camera';
  return '';
}
const liveScore = (id) => state.ranked?.find((r) => r.id === id);
const smoothScore = (id) => state.match.smooth.find((r) => r.id === id)?.score ?? 0;

let lastPanel = '';
function frame() {
  const { w, h, dpr } = fitCanvas(you, stage);
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, you.width, you.height); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  // the exact frame the landmarks came from, mirrored like a selfie view
  if (state.image && state.showCam && state.raw) {
    const iw = state.raw.w, ih = state.raw.h, s = Math.max(w / iw, h / ih);
    g.save();
    g.filter = 'brightness(0.55) saturate(0.4) contrast(1.05)';
    g.translate(w, 0); g.scale(-1, 1);
    try { g.drawImage(state.image, (w - iw * s) / 2, (h - ih * s) / 2, iw * s, ih * s); } catch {}
    g.restore();
  }
  const meme = state.match.winner ? state.byId.get(state.match.winner) : null;
  const live = meme ? liveScore(meme.id) : null;
  const colors = tint(live?.parts);
  if (state.raw && state.showMasks) drawBody(g, obsToBody(state.obs ?? state.raw, { x: 0, y: 0, w, h }, true), colors);
  const n = nudgeText(state.raw);
  if (n) nudge.textContent = n;
  nudge.classList.toggle('show', !!n);
  state.trainer?.tick(performance.now());
  drawMeme(meme, colors);
  updatePanel(meme, live);
  if (state.debug) hud.textContent = hudText();
  requestAnimationFrame(frame);
}

function drawMeme(meme, colors) {
  const { w, h, dpr } = fitCanvas(memeCanvas, memeCard);
  mg.setTransform(1, 0, 0, 1, 0, 0); mg.clearRect(0, 0, memeCanvas.width, memeCanvas.height); mg.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!meme) return;
  const im = state.images.get(meme.id);
  if (!im) return;
  const pad = 12, s = Math.min((w - 2 * pad) / im.naturalWidth, (h - 2 * pad) / im.naturalHeight);
  const iw = im.naturalWidth * s, ih = im.naturalHeight * s, ix = (w - iw) / 2, iy = (h - ih) / 2;
  mg.drawImage(im, ix, iy, iw, ih);
  const px = state.showMasks ? memeBodyPx(meme) : null;
  if (px) {
    mg.save();
    mg.beginPath(); mg.rect(ix, iy, iw, ih); mg.clip();
    drawBody(mg, overlayToBody(px, { x: ix, y: iy, w: iw, h: ih }), colors, { alpha: 0.9, outline: 4 });
    mg.restore();
  }
}

function updatePanel(meme, live) {
  const top = state.match.smooth.slice(0, 5);
  const key = JSON.stringify([meme?.id, live && Math.round(live.score * 100), live?.parts, top.map((t) => [t.id, Math.round(t.score * 100)]), live?.worst?.name]);
  if (key === lastPanel) return;
  lastPanel = key;
  $('memeEmpty').hidden = !!meme;
  $('memeHead').hidden = !meme;
  $('memeCredit').hidden = !meme;
  if (meme) {
    $('memeTitle').textContent = meme.title;
    $('memeScore').textContent = `${Math.round(smoothScore(meme.id) * 100)}%`;
    $('memeCredit').textContent = meme.source.credit ? `${meme.source.credit} ↗` : meme.source.note ? 'Original art' : meme.source.glyph ? 'Emoji ↗' : 'Source ↗';
    $('memeCredit').href = meme.source.kym;
  }
  $('parts').replaceChildren(...(meme && live ? Object.entries(live.parts).map(([k, v]) => {
    const el = document.createElement('span');
    el.className = `part ${grade(v)}`;
    el.append(document.createElement('i'), `${k[0].toUpperCase() + k.slice(1)} ${Math.round(v * 100)}%`);
    return el;
  }) : []));
  const t0 = top[0] && state.byId.get(top[0].id);
  $('hint').textContent = meme ? (hintFor(live?.worst) || meme.cue) : (t0 && top[0].score > 0.3 ? `Closest: ${t0.title}. ${t0.cue}` : '');
  for (let i = 0; i < BAR_ROWS.length; i++) {
    const t = top[i], r = BAR_ROWS[i];
    r.row.hidden = !t;
    if (!t) continue;
    r.row.classList.toggle('on', t.id === meme?.id);
    r.name.textContent = state.byId.get(t.id)?.title ?? t.id;
    r.fill.style.width = `${Math.round(t.score * 100)}%`;
    r.num.textContent = Math.round(t.score * 100);
  }
}

// Five score rows, built once (the CSP forbids inline style attributes; widths go through CSSOM).
const BAR_ROWS = Array.from({ length: 5 }, () => {
  const row = document.createElement('div'); row.className = 'brow'; row.hidden = true;
  const name = document.createElement('span');
  const track = document.createElement('div'); track.className = 'track';
  const fill = document.createElement('b');
  const tick = document.createElement('i'); tick.className = 'tick'; tick.style.left = `${WINNER_DEFAULTS.enter * 100}%`;
  track.append(fill, tick);
  const num = document.createElement('em');
  row.append(name, track, num);
  $('bars').append(row);
  return { row, name, fill, num };
});

// ── details HUD ───────────────────────────────────────────────────────────────────────────
function hudText() {
  const o = state.raw, s = tracker?.stats();
  const lines = [
    `mode ${state.mode}   tracking ${state.arrivals.length} Hz   camera ${video.videoWidth}×${video.videoHeight}   templates ${state.personal?.on ? 'yours' : 'defaults'}   neutral face ${state.calibSource}${state.calibSource === 'auto' && !autoCalib.calib ? ' (learning…)' : ''}`,
    tracker ? `delegates face ${tracker.delegates.face} · hand ${tracker.delegates.hand} · pose ${tracker.delegates.pose}` : 'tracker starting',
    s ? `ms  face ${s.face.toFixed(1)}  hand ${s.hand.toFixed(1)}  pose ${s.pose.toFixed(1)}  total ${s.total.toFixed(1)}` : '',
    o ? `face ${o.face ? 'yes' : 'no'}  hands ${o.hands.length}` : '',
  ];
  const r = state.ranked;
  if (r) {
    lines.push('', 'live scores');
    for (const m of r.slice(0, 6)) lines.push(`  ${m.id.padEnd(16)} ${(m.score * 100).toFixed(0).padStart(3)}  ${Object.entries(m.parts).map(([k, v]) => `${k[0]}${(v * 100).toFixed(0)}`).join(' ')}  ${m.worst ? `worst ${m.worst.name} ${m.worst.value.toFixed(2)}→${m.worst.mu.toFixed(2)}` : ''}`);
  }
  const f = state.feats;
  if (f) {
    lines.push('', 'features');
    const rows = FEATS.map((ft, i) => [ft.name, f.valid[i] ? f.x[i] : null]).filter(([n, v]) => v !== null && !n.startsWith('arm') && (/_touch_/.test(n) ? v < 0.6 : Math.abs(v) > 0.04));
    for (let i = 0; i < rows.length; i += 3) lines.push('  ' + rows.slice(i, i + 3).map(([n, v]) => `${n.padEnd(17)} ${v.toFixed(2).padStart(5)}`).join('   '));
  }
  if (o?.bs && q.has('bs')) {
    lines.push('', 'blendshapes > 0.15');
    for (const [n, v] of BS_NAMES.map((n, i) => [n, o.bs[i]]).filter(([n, v]) => n !== '_neutral' && v > 0.15).sort((a, b) => b[1] - a[1])) lines.push(`  ${n.padEnd(20)} ${v.toFixed(2)}`);
  }
  return lines.join('\n');
}

// ── controls ──────────────────────────────────────────────────────────────────────────────
$('retry').onclick = start;
const masksLabel = () => { $('masks').textContent = state.showMasks ? 'Hide masks' : 'Show masks'; };
masksLabel();
$('masks').onclick = () => {
  state.showMasks = !state.showMasks;
  try { localStorage.setItem('memematch.masks', state.showMasks ? 'on' : 'off'); } catch {}
  masksLabel();
};
$('cam').onclick = () => {
  state.showCam = !state.showCam;
  $('cam').textContent = state.showCam ? 'Hide camera' : 'Show camera';
};
$('debug').onclick = () => { state.debug = !state.debug; hud.hidden = !state.debug; $('debug').classList.toggle('on', state.debug); };
addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea, select')) return;
  const k = e.key.toLowerCase();
  if (k === 'd') $('debug').click();
  if (k === 'c') $('cam').click();
  if (k === 'm') $('masks').click();
  if (k === 't') $('train').click();
  if (k === 'escape') state.trainer?.stop();
});

(async () => {
  state.index = await loadIndex();
  const shown = state.index.shown || Object.keys(state.index.modes);
  let want = q.get('mode');
  if (!want) { try { want = localStorage.getItem('memematch.mode'); } catch {} }
  if (!state.index.modes[want]) want = shown[0];
  const tabs = shown.includes(want) ? shown : [...shown, want];
  $('tabs').replaceChildren(...tabs.map((m) => {
    const b = document.createElement('button');
    b.dataset.mode = m; b.textContent = state.index.titles?.[m] || m;
    b.onclick = () => setMode(m);
    return b;
  }));
  await setMode(want);
  requestAnimationFrame(frame);
  start();
})();
