// Hand Playground: camera + hands + mouse → smoothed hands → current tab (mode) → canvas + sound.
import { PointerInput } from './input/pointer.js';
import { Hands } from './handviz.js';
import { CONFIG } from './config.js';
import * as sfx from './sfx.js';
import { HandsMode } from './modes/hands.js';
import { PlayMode } from './modes/play.js';
import { ChemistryMode } from './modes/chemistry/index.js';
import { SoonMode } from './modes/soon.js';
import { PhysicsMode } from './modes/physics/index.js';
import { SigningMode } from './modes/signing/index.js';
import { MusicMode } from './modes/music/index.js';
import { el } from './modes/ui.js';

const $ = (id) => document.getElementById(id);
const video = $('feed'), canvas = $('scene'), g = canvas.getContext('2d');
const mouse = new PointerInput(window);
const hands = new Hands();
let tracker = null, delegate = '—';
let debug = CONFIG.debug;

// ── canvas ─────────────────────────────────────────────────────────────
let W = 0, H = 0, dpr = 1;
function resize() {
  dpr = Math.min(1.5, devicePixelRatio || 1);
  W = innerWidth; H = innerHeight;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
}
resize();
addEventListener('resize', resize);

// ── tabs (modes) ───────────────────────────────────────────────────────
function showHint(text) {
  if (typeof tut !== 'undefined' && !tut.hidden) return;         // the tutorial card has priority
  const hint = $('hint');
  hint.textContent = text || '';
  hint.classList.remove('gone');
  clearTimeout(showHint.t);
  showHint.t = setTimeout(() => hint.classList.add('gone'), 6000);
}
const env = { sfx, size: () => ({ w: W, h: H }), dpr: () => dpr, showHint, hands };
const MODES = [
  () => new HandsMode(env),
  () => new SigningMode(env),
  () => new PlayMode(env),
  () => new ChemistryMode(env),
  () => new PhysicsMode(env),
  () => { const m = new MusicMode(env); m.env = env; return m; },
];
const NAMES = ['Hands', 'Signing', 'Play', 'Chemistry', 'Physics', 'Music'];
const built = [];

// First visit to a tab: a short three-step card (shown once, remembered per browser).
const TUTORIALS = {
  Hands: ['Hold a hand up to the camera', 'Tap your fingertips together — each pair plays a note', 'Six hidden gestures are waiting to be found'],
  Signing: ['Make an ASL letter with one hand and hold still', 'The ring fills, then the letter types — lower your hand for a space', 'Press Teach to tune it to your own handshapes'],
  Play: ['Pick one of 18 toys on the left (keys 1–9 for the first nine)', 'Pinch (thumb + index) to grab, blow, paint or pluck', 'Your fingertips and palms are solid — push things around'],
  Chemistry: ['Pinch an atom off the shelf on the left', 'Let go near another atom to bond — quick-pinch a bond to double it', 'Yank to break, drop on the shelf to delete, and fill the Molecule-dex'],
  Physics: ['Pinch a part on the shelf and drop it in the scene', 'Grab either end of a ramp to stretch it; two hands work too', 'Get marbles into the cup — or try the Challenge levels'],
  Music: ['Theremin: right hand height is pitch, left hand is volume', 'Drums: tap down onto the pads', 'Strum: left hand picks the chord, right hand sweeps the strings'],
};
const tut = el('div', { class: 'tutorial', hidden: '' });
document.body.append(tut);
function showTutorial(name) {
  let seen = false;
  try { seen = localStorage.getItem(`hp-tut-${name}`) === '1'; } catch {}
  if (seen || !TUTORIALS[name]) { tut.hidden = true; return false; }
  tut.textContent = '';
  const done = el('button', { 'data-hand': '', onclick: () => { tut.hidden = true; try { localStorage.setItem(`hp-tut-${name}`, '1'); } catch {} sfx.click(); showHint(mode.hint); } }, 'Got it');
  tut.append(el('div', { class: 'tut-title' }, name), el('ol', {}, TUTORIALS[name].map((t) => el('li', {}, t))), done);
  tut.hidden = false;
  return true;
}
let mode = null, modeIndex = -1;
function pickMode(i) {
  if (i === modeIndex) return;
  mode?.exit?.();
  if (mode?.panel) mode.panel.classList.remove('active');
  if (!built[i]) { built[i] = MODES[i](); if (built[i].panel) $('mode-ui').append(built[i].panel); }
  mode = built[i]; modeIndex = i;
  mode.enter?.();
  tracker?.setNumHands(mode.numHands ?? CONFIG.numHands);          // e.g. Signing only needs one
  mode.panel?.classList.add('active');
  document.querySelectorAll('.tabs button').forEach((b, k) => b.classList.toggle('on', k === i));
  movePill();
  if (!showTutorial(NAMES[i])) showHint(mode.hint); else $('hint').classList.add('gone');
}
// sliding highlight behind the active tab
const pill = el('div', { class: 'tab-pill' });
function movePill() {
  const b = document.querySelectorAll('.tabs button')[modeIndex];
  if (!b) return;
  pill.style.width = `${b.offsetWidth}px`;
  pill.style.transform = `translateX(${b.offsetLeft}px)`;
}
addEventListener('resize', movePill);
document.fonts?.ready.then(movePill);
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(movePill).observe($('tabs'));
$('tabs').append(pill);
NAMES.forEach((name, i) => $('tabs').append(el('button', { 'data-hand': '', onclick: () => { pickMode(i); sfx.click(); } }, name)));
// start with just your hands — or ?tab=play / ?tab=physics … to open a tab directly
{ const want = new URLSearchParams(location.search).get('tab'); const i = NAMES.findIndex((n) => n.toLowerCase() === want?.toLowerCase()); pickMode(i >= 0 ? i : 0); }
// a shared Physics link (#level=…) opens straight into that contraption
async function loadShared() {
  const parts = await PhysicsMode.fromHash();
  if (!parts) return;
  const i = NAMES.indexOf('Physics');
  if (!built[i]) { built[i] = MODES[i](); if (built[i].panel) $('mode-ui').append(built[i].panel); }
  const pm = built[i];
  pm.leaveChallenge?.();
  pm.shared = parts; pm.loaded = false;
  pickMode(i);
  pm.ensureLoaded();
  history.replaceState(null, '', location.pathname + location.search);   // reloads won't re-apply it
}
loadShared();
addEventListener('hashchange', loadShared);

// ── UI ─────────────────────────────────────────────────────────────────
function setStatus(text, kind = '') { const el = $('status'); el.textContent = text; el.className = `chip status ${kind}`; }
// ── record a clip of the canvas (gloves + toys only — the camera feed is a separate layer) ──
let recorder = null, recTimer = 0;
function toggleRecord() {
  if (recorder) { if (recorder.state !== 'inactive') recorder.stop(); return; }
  if (!canvas.captureStream || typeof MediaRecorder === 'undefined') { setStatus('Recording isn’t supported in this browser', 'error'); return; }
  const type = ['video/webm;codecs=vp9', 'video/webm', 'video/mp4'].find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
  const chunks = [];
  recorder = new MediaRecorder(canvas.captureStream(60), type ? { mimeType: type, videoBitsPerSecond: 6e6 } : undefined);
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.onstop = () => {
    clearTimeout(recTimer);
    const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `hand-playground-${Date.now()}.${(recorder.mimeType || '').includes('mp4') ? 'mp4' : 'webm'}` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    recorder = null;
    $('rec').textContent = '● Record'; $('rec').classList.remove('recording');
  };
  recorder.start();
  recTimer = setTimeout(() => { if (recorder && recorder.state !== 'inactive') recorder.stop(); }, 15000);            // clips are capped at 15 s
  $('rec').textContent = '■ Stop'; $('rec').classList.add('recording');
}
$('rec').onclick = toggleRecord;

let showLabels = true;
try { showLabels = localStorage.getItem('hp-labels') !== '0'; } catch {}
const refreshLabels = () => { $('labels').textContent = showLabels ? 'Labels on' : 'Labels off'; };
refreshLabels();
$('labels').onclick = () => { showLabels = !showLabels; refreshLabels(); try { localStorage.setItem('hp-labels', showLabels ? '1' : '0'); } catch {} };
$('cam').onclick = () => { const hid = video.classList.toggle('hidden'); $('cam').textContent = hid ? 'Show camera' : 'Hide camera'; };
function refreshSound() { $('sound').textContent = sfx.isMuted() ? '🔇 Sound off' : '🔈 Sound on'; }
let soundReady = false;
$('sound').onclick = (e) => {
  if (soundReady) { sfx.toggleMute(); refreshSound(); }
  else if (!e.isTrusted) showHint('Your browser needs one real click or key press before it can play sound');
};
// Audio can only start after a click or key press (hand gestures don't count).
const unlockAudio = () => { if (!soundReady) sfx.unlock().then(() => { soundReady = true; refreshSound(); }, () => {}); };
addEventListener('pointerdown', unlockAudio, true);
addEventListener('keydown', unlockAudio, true);
addEventListener('click', (e) => e.target.closest?.('button')?.blur(), true);   // Space/Enter shouldn't re-press it
addEventListener('keydown', (e) => {
  if (mode.onKey?.(e)) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key.toLowerCase() === 'm') { if (soundReady) { sfx.toggleMute(); refreshSound(); } }   // the keypress itself unlocks audio
  else if (e.key.toLowerCase() === 'l') $('labels').click();
  else if (e.key.toLowerCase() === 'd') { debug = !debug; $('hud').hidden = !debug; }
});
$('hud').hidden = !debug;

// ── camera + hand tracking (permission is requested right away) ────────
let made = null, lmP = null, paused = false, gen = 0, active = false;
const stopStream = () => { video.srcObject?.getTracks().forEach((t) => t.stop()); video.srcObject = null; };
async function startTracking() {
  const my = ++gen;                                  // a newer start (or a pause) cancels this one
  active = true;
  $('retry').hidden = true;
  setStatus('Starting camera…');
  let mod;
  try { mod = await import('./input/hands.js'); }
  catch (e) { console.error(e); active = false; setStatus('Hand tracking failed to load — the mouse still works', 'error'); $('retry').hidden = false; return; }
  const { openCamera, attachCamera, createTracker, HandInput } = mod;
  if (!made) lmP ??= createTracker().catch((e) => { lmP = null; throw e; });      // one shared model load (worker or main thread)
  let stream;
  try {
    stream = await openCamera();
  } catch (e) {
    if (my !== gen) return;
    const msg = {
      NotAllowedError: 'Camera blocked — allow it in the address bar, then try again',
      NotFoundError: 'No camera found — the mouse still works',
      NotReadableError: 'Camera is busy in another app',
      NotSupportedError: 'This browser can’t use the camera — the mouse still works',
    }[e.name] || `Camera error: ${e.message}`;
    setStatus(msg, 'error');
    active = false;
    $('retry').hidden = e.name === 'NotFoundError' || e.name === 'NotSupportedError';
    lmP?.then((m) => (made = m), () => {});
    return;
  }
  const drop = () => stream.getTracks().forEach((t) => t.stop());
  if (my !== gen) return drop();                    // superseded: stop only *this* start's stream
  await attachCamera(video, stream).catch(() => {});
  if (my !== gen) { drop(); if (video.srcObject === stream) video.srcObject = null; return; }
  setStatus('Loading hand tracking…');
  try {
    made ??= await lmP;
    if (my !== gen) { drop(); if (video.srcObject === stream) video.srcObject = null; return; }
    delegate = `${made.delegate} · ${made.where}`;
    tracker?.stop();
    tracker = new HandInput(video, made);
    tracker.numHands = undefined;                                   // unknown: the reused model may be set to 1
    tracker.setNumHands(mode?.numHands ?? CONFIG.numHands);
    tracker.start();
    setStatus('Camera on · stays on this device', 'ok');
    if (document.hidden) pauseCamera();
  } catch (e) {
    console.error(e);
    if (my !== gen) return;
    drop(); if (video.srcObject === stream) video.srcObject = null;   // don't leave the camera light on with nothing tracking
    active = false;
    setStatus('Hand tracking failed to load — the mouse still works', 'error');
    $('retry').hidden = false;
  }
}
$('retry').onclick = startTracking;

function pauseCamera() {
  gen++;
  tracker?.stop();
  tracker = null;
  stopStream();
  paused = true;
  setStatus('Camera paused');
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (video.srcObject || active) pauseCamera(); }
  else if (paused) { paused = false; startTracking(); }
});
// Camera only when we're the top page or framed by our own site (aedinlai.com embeds projects in an
// iframe). A cross-origin parent makes reading top.location throw.
let framedByOther = false;
try { framedByOther = window.top !== window.self && window.top.location.origin !== location.origin; } catch { framedByOther = true; }
if (framedByOther) setStatus('Open this page directly to use the camera', 'error');
else startTracking();

// ── hand pinches on buttons ────────────────────────────────────────────
const consumed = new Set();
const wasDown = new Map();
let hovered = new Set();
function routeButtons(pointers) {
  const nowHover = new Set();
  const out = pointers.map((p) => {
    const hit = document.elementFromPoint(p.x, p.y);
    const el = hit?.closest('[data-hand]');
    const blocked = !el && hit?.closest('.tutorial, .dex');     // pinches on an overlay don't reach the tab
    if (blocked && p.down && !wasDown.get(p.id)) consumed.add(p.id);
    if (el) { nowHover.add(el); el.style.setProperty('--p', p.down ? 1 : (p.progress || 0).toFixed(2)); }
    const was = wasDown.get(p.id);
    wasDown.set(p.id, p.down);
    if (p.down && !was && el) {
      consumed.add(p.id);
      el.classList.add('hand-press'); setTimeout(() => el.classList.remove('hand-press'), 150);
      el.click();
    }
    if (!p.down) consumed.delete(p.id);
    return consumed.has(p.id) ? { ...p, down: false } : p;
  });
  // only touch classes that changed (no style churn every frame)
  for (const e of hovered) if (!nowHover.has(e)) { e.classList.remove('hand-hover'); e.style.removeProperty('--p'); }
  for (const e of nowHover) if (!hovered.has(e)) e.classList.add('hand-hover');
  hovered = nowHover;
  return out;
}

// ── loop ───────────────────────────────────────────────────────────────
let last = performance.now(), frames = 0, fps = 0, fpsT = last;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const pointers = [...mouse.pointers(), ...routeButtons(tracker ? tracker.pointers(now) : [])];
  const list = hands.update(pointers, now);
  feedback(list, now);
  mode.update(dt, tut.hidden ? list : [], now);                  // the tutorial card pauses the tab underneath

  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  mode.draw(g);
  hands.draw(g);
  mode.drawTop?.(g);
  if (showLabels) hands.drawLabels(g);
  hands.drawCursors(g);
  if (debug) drawSkeleton(list);

  frames++;
  if (now - fpsT > 500) { fps = (frames * 1000) / (now - fpsT); frames = 0; fpsT = now; if (debug) hud(list); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ── presence + tracking-quality feedback ──────────────────────────────
let camHands = 0, noHandSince = performance.now(), qualityMsg = '', qualitySince = 0;
function feedback(list, now) {
  const cam = list.filter((h) => h.pts);
  if (cam.length > camHands) sfx.handFound(); else if (cam.length < camHands) sfx.handLost();
  camHands = cam.length;
  if (cam.length) noHandSince = now;
  const tracking = !!tracker;
  $('nudge').classList.toggle('show', tracking && !cam.length && now - noHandSince > 1200);
  // too close / too far / at the edge (shown after 1.5 s, cleared when fixed)
  let msg = '';
  for (const h of cam) {
    const m = Math.min(W, H);
    if (h.size > 0.42 * m) msg = 'A little further from the camera';
    else if (h.size < 0.07 * m) msg = 'Come a little closer';
    else if (h.palm.x < W * 0.04 || h.palm.x > W * 0.96 || h.palm.y < H * 0.04 || h.palm.y > H * 0.96) msg = 'Keep your hand inside the frame';
  }
  if (msg !== qualityMsg) { qualityMsg = msg; qualitySince = now; }
  const q = $('quality');
  if (qualityMsg && now - qualitySince > 1500) { q.textContent = qualityMsg; q.classList.add('show'); }
  else if (!qualityMsg) q.classList.remove('show');
}

function hud(list) {
  const s = tracker?.stats() || { p50: 0, p95: 0, hands: 0 };
  $('hud').textContent = [
    `render   ${fps.toFixed(0)} fps`,
    `track    p50 ${s.p50.toFixed(1)} ms · p95 ${s.p95.toFixed(1)} ms`,
    `delegate ${delegate} · numHands ${CONFIG.numHands}`,
    `hands    ${list.filter((h) => h.pts).length}${list.some((h) => h.down) ? ' · PINCH' : ''}`,
  ].join('\n');
}

function drawSkeleton(list) {
  const chains = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [5, 9, 10, 11, 12], [9, 13, 14, 15, 16], [13, 17, 18, 19, 20], [0, 17]];
  g.save(); g.strokeStyle = 'rgba(124,227,177,0.8)'; g.lineWidth = 1.5;
  for (const h of list) {
    if (!h.pts) continue;
    for (const c of chains) { g.beginPath(); c.forEach((i, k) => (k ? g.lineTo(h.pts[i].x, h.pts[i].y) : g.moveTo(h.pts[i].x, h.pts[i].y))); g.stroke(); }
  }
  g.restore();
}
