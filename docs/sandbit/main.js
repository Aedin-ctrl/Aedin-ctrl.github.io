// Sandbit front end: input, tools, the frame loop, challenges and saving.
import { loadSim } from './sim.js';
import { Renderer } from './render.js';
import { M, MAT_COUNT, PALETTE, LOOSE, SOLID, NAME } from './materials.js';
import { iconCanvas, swatch } from './icons.js';
import { LEVELS, SCENES, demo, makeApi } from './levels.js';
import { Sfx } from './audio.js';

const W = 480, H = 270;
const STEP_MS = 1000 / 60;
const $ = id => document.getElementById(id);

const TOOLS = [
  { id: 'paint', name: 'Paint', key: 'b' },
  { id: 'erase', name: 'Erase', key: 'e' },
  { id: 'fire', name: 'Lighter', key: 'f' },
  { id: 'bomb', name: 'Bomb', key: 'x' },
  { id: 'grab', name: 'Grab objects (or right-drag)', key: 'g' },
  'sep',
  { id: 'crate', name: 'Drop a crate', key: 'c', shape: 0 },
  { id: 'ball', name: 'Drop a ball', key: 'n', shape: 1 },
  { id: 'plank', name: 'Drop a plank', key: 'p', shape: 2 },
  { id: 'boulder', name: 'Drop a boulder', key: 'k', shape: 3 },
  { id: 'tri', name: 'Drop a wedge', key: 'w', shape: 4 },
  { id: 'draw', name: 'Draw your own object', key: 'o' },
  { id: 'rope', name: 'Rope: drag between two points (ends tie to walls and objects)', key: 'l' },
  { id: 'pin', name: 'Pin an object to the background (click a pin to remove it)', key: 'i' },
];
const LIQUID = new Set([M.WATER, M.LAVA, M.OIL, M.ACID, M.NITRO]);
const sfx = new Sfx();
const TOOL = Object.fromEntries(TOOLS.filter(t => t !== 'sep').map(t => [t.id, t]));

const S = {
  tool: 'paint', mat: M.SAND, spout: M.WATER, solid: M.WOOD, size: 4,
  paused: false, speed: 1, debug: false, level: null, hover: null, sandbox: null,
};

let sim, renderer;
try {
  sim = await loadSim('sandbit.wasm', W, H);
  if(sim.ex.mat_count() !== MAT_COUNT) console.warn('materials.js is out of date with src/mat.rs');
  renderer = new Renderer($('gl'), W, H, sim.palette());
} catch(e){
  document.body.innerHTML = `<p class="nojs">Couldn't start Sandbit: ${String(e.message || e).replace(/</g, '&lt;')}</p>`;
  throw e;
}

// ---------- level API (also used by the demo scene) ----------
const api = makeApi(sim);

// ---------- toolbar + palette ----------
const toolBtns = {};
for(const t of TOOLS){
  if(t === 'sep'){ const s = document.createElement('i'); s.className = 'sep'; $('tools').append(s); continue; }
  const b = document.createElement('button');
  b.className = 'btn tool';
  b.title = t.name + (t.key ? ` (${t.key.toUpperCase()})` : '');
  b.setAttribute('aria-label', t.name);
  b.append(iconCanvas(t.id));
  const count = document.createElement('span'); count.className = 'count'; b.append(count);
  b.addEventListener('click', () => setTool(t.id));
  $('tools').append(b);
  toolBtns[t.id] = b;
}
const palette = sim.palette();
const matBtns = {};
const addLabel = text => { const l = document.createElement('div'); l.className = 'pal-label'; l.textContent = text; $('palette').append(l); };
addLabel('MATERIALS');
PALETTE.forEach((p, i) => {
  if(p.id === M.WALL) addLabel('SPECIAL');
  const b = document.createElement('button');
  b.className = 'mat';
  b.title = `${p.name}: ${p.tip}` + (p.key ? ` (${p.key})` : '');
  b.append(swatch(palette, p.id), p.name);
  if(p.key){ const k = document.createElement('kbd'); k.textContent = p.key; b.append(k); }
  b.addEventListener('click', () => setMat(p.id));
  $('palette').append(b);
  matBtns[p.id] = b;
});

function setTool(id){
  if(!allowedTool(id)) return;
  S.tool = id;
  for(const [k, b] of Object.entries(toolBtns)) b.setAttribute('aria-pressed', k === id);
  refreshMats();
}
function setMat(id){
  if(!allowedMat(id)) return;
  S.mat = id;
  if(LOOSE.has(id)) S.spout = id;
  if(SOLID.has(id)) S.solid = id;
  const shapeTool = TOOL[S.tool].shape !== undefined || S.tool === 'draw' || S.tool === 'rope';
  if(!(shapeTool && SOLID.has(id)) && S.tool !== 'paint') setTool(allowedTool('paint') ? 'paint' : S.tool);
  refreshMats();
}
function refreshMats(){
  const shapeTool = TOOL[S.tool].shape !== undefined || S.tool === 'draw' || S.tool === 'rope';
  const shown = shapeTool ? S.solid : S.mat;
  for(const [k, b] of Object.entries(matBtns)){
    b.setAttribute('aria-pressed', +k === shown);
    b.classList.toggle('locked', !allowedMat(+k) || (shapeTool && !SOLID.has(+k)));
  }
}
function allowedTool(id){ return !S.level || S.level.def.tools.includes(id); }
function allowedMat(id){ return !S.level || S.level.def.mats.includes(id); }
function applyRestrictions(){
  for(const [k, b] of Object.entries(toolBtns)){
    b.disabled = !allowedTool(k);
    b.querySelector('.count').textContent = S.level && S.level.uses[k] !== undefined ? S.level.uses[k] : '';
  }
  if(!allowedTool(S.tool)) S.tool = S.level.def.tools[0];
  if(!allowedMat(S.mat)) S.mat = S.level.def.mats[0] ?? M.SAND;
  if(S.level && !allowedMat(S.solid)) S.solid = S.level.def.mats.find(m => SOLID.has(m)) ?? M.WOOD;
  setTool(S.tool);
}

$('size').addEventListener('input', e => setSize(+e.target.value));
function setSize(n){
  S.size = Math.max(1, Math.min(20, n));
  $('size').value = S.size;
  $('sizeVal').textContent = S.size;
}

// ---------- pointer ----------
const ov = $('ov');
const octx = ov.getContext('2d');
const P = { down: false, mode: null, x: 0, y: 0, fx: 0, fy: 0, lx: 0, ly: 0, bbox: null };

function toSim(e){
  const r = ov.getBoundingClientRect();
  const fx = (e.clientX - r.left) / r.width * W, fy = (e.clientY - r.top) / r.height * H;
  return [Math.floor(fx), Math.floor(fy), fx, fy];
}
ov.addEventListener('contextmenu', e => e.preventDefault());
ov.addEventListener('pointerdown', e => {
  sfx.wake();
  if(S.level && S.level.won) return;
  try { ov.setPointerCapture(e.pointerId); } catch(err){}
  const [x, y, fx, fy] = toSim(e);
  Object.assign(P, { down: true, x, y, fx, fy, lx: x, ly: y, shift: e.shiftKey, alt: e.altKey, straight: null });
  let mode = S.tool;
  if(e.button === 2) mode = sim.bodyAt(fx, fy) ? 'grab' : 'erase';
  if(e.button === 1) mode = 'grab';
  // Challenges limit the tools, whichever button you use.
  if(mode === 'grab' && !allowedTool('grab')) mode = e.button === 2 ? 'erase' : null;
  if(mode === 'erase' && !allowedTool('erase')) mode = null;
  P.mode = mode;
  if(!mode) return;
  if(mode !== 'grab') snapshot();
  // Alt/Option + drag: a straight line, drawn when you let go.
  if(e.altKey && (mode === 'paint' || mode === 'erase' || mode === 'draw')){
    P.straight = [x, y];
    if(mode === 'draw') P.bbox = [x, y, x, y];
    return;
  }
  begin(mode, x, y, fx, fy);
});
ov.addEventListener('pointermove', e => {
  const [x, y, fx, fy] = toSim(e);
  S.hover = [x, y];
  Object.assign(P, { x, y, fx, fy, shift: e.shiftKey });
  if(!P.down || !P.mode || P.straight) return;
  drag(P.mode);
});
const endPointer = () => {
  if(!P.down) return;
  P.down = false;
  if(P.mode) end(P.mode);
  P.mode = null;
};
ov.addEventListener('pointerup', endPointer);
ov.addEventListener('pointercancel', endPointer);
ov.addEventListener('pointerleave', () => { if(!P.down) S.hover = null; });

function paintMode(){ return P.shift ? 1 : 0; }
function extraFor(m){ return m === M.TAP ? S.spout : m === M.ICE ? 3 : 0; }
function budgetLeft(){
  const L = S.level;
  if(!L || !L.def.budget) return Infinity;
  return L.def.budget - L.used;
}
function spend(n){
  if(S.level && S.level.def.budget) S.level.used += n;
}
function useCharge(tool){
  const L = S.level;
  if(!L || L.uses[tool] === undefined) return true;
  if(L.uses[tool] <= 0){ toast(`No ${TOOL[tool].name.toLowerCase()} left`); return false; }
  L.uses[tool]--;
  toolBtns[tool].querySelector('.count').textContent = L.uses[tool];
  return true;
}
let inkWarned = false;
function strokeTo(x, y){
  if(P.mode === 'paint' || P.mode === 'draw'){
    if(budgetLeft() <= 0){
      if(!inkWarned){ toast('Out of ink'); inkWarned = true; }
      return;
    }
    const m = P.mode === 'draw' ? S.solid : S.mat;
    const n = sim.line(P.lx, P.ly, x, y, S.size - 1, m, P.mode === 'draw' ? 3 : paintMode(), extraFor(m));
    spend(n);
    if(n) sfx.pour(LIQUID.has(m) ? 'liquid' : SOLID.has(m) ? 'solid' : 'powder');
    if(P.mode === 'draw'){
      const r = S.size;
      const b = P.bbox;
      P.bbox = [Math.min(b[0], x - r), Math.min(b[1], y - r), Math.max(b[2], x + r), Math.max(b[3], y + r)];
    }
  } else if(P.mode === 'erase'){
    // In a challenge you can only erase the materials you're allowed to paint.
    let n = 0;
    if(S.level) for(const m of S.level.def.mats) n += sim.line(P.lx, P.ly, x, y, S.size - 1, m, 4, 0);
    else n = sim.line(P.lx, P.ly, x, y, S.size - 1, 0, 2, 0);
    if(n) sfx.pour('erase');
  }
  P.lx = x; P.ly = y;
}

function begin(mode, x, y, fx, fy){
  inkWarned = false;
  const t = TOOL[mode];
  if(mode === 'paint' || mode === 'erase'){ strokeTo(x, y); return; }
  if(mode === 'draw'){ P.bbox = [x, y, x, y]; strokeTo(x, y); return; }
  if(mode === 'fire'){ if(useCharge('fire')) sim.ignite(x, y, S.size); else P.mode = null; return; }
  if(mode === 'bomb'){ if(useCharge('bomb')) sim.explode(x, y, bombRadius()); P.mode = null; return; }
  if(mode === 'grab'){ if(!sim.grabStart(fx, fy)) P.mode = null; return; }
  if(mode === 'rope'){ P.start = [fx, fy]; return; }
  if(mode === 'pin'){
    if(sim.unpin(fx, fy, 3)) sfx.click();
    else if(useCharge('pin') && sim.pin(fx, fy, P.shift ? 0.06 : P.alt ? -0.06 : 0)) sfx.pop();
    else toast('Click on an object to pin it');
    P.mode = null;
    return;
  }
  if(t && t.shape !== undefined){
    if(useCharge(mode) && sim.spawn(t.shape, S.solid, fx, fy, shapeSize(t.shape), 0)) sfx.pop();
    P.mode = null;
  }
}
function drag(mode){
  if(mode === 'paint' || mode === 'erase' || mode === 'draw') strokeTo(P.x, P.y);
  else if(mode === 'grab') sim.grabMove(P.fx, P.fy);
  else if(mode === 'fire') sim.ignite(P.x, P.y, S.size);
}
function end(mode){
  if(P.straight){
    const [x0, y0] = P.straight;
    P.straight = null;
    P.lx = x0; P.ly = y0;
    strokeTo(P.x, P.y);
  }
  if(mode === 'grab') sim.grabEnd();
  if(mode === 'rope' && P.start){
    const [x0, y0] = P.start;
    P.start = null;
    if(Math.hypot(P.fx - x0, P.fy - y0) < 4) return;
    if(!useCharge('rope')) return;
    if(sim.rope(x0, y0, P.fx, P.fy, S.solid, S.size > 8 ? 3 : 2)) sfx.pop();
  }
  if(mode === 'draw' && P.bbox){
    const b = P.bbox;
    if(!sim.markedToBody(b[0] - 1, b[1] - 1, b[2] + 1, b[3] + 1)) toast('Too small to be an object');
    else sfx.pop();
    P.bbox = null;
  }
}
// Held still, loose things keep pouring and the lighter keeps burning.
function hold(){
  if(!P.down || !P.mode || P.straight) return;
  if(P.mode === 'paint' && LOOSE.has(S.mat)) strokeTo(P.x, P.y);
  else if(P.mode === 'erase') strokeTo(P.x, P.y);
  else if(P.mode === 'fire') sim.ignite(P.x, P.y, S.size);
}
const bombRadius = () => Math.round(4 + S.size * 0.6);
const shapeSize = shape => Math.max(4, Math.min(60, S.size * (shape === 2 ? 2 : 3)));

// ---------- undo ----------
const undoStack = [], redoStack = [];
const capture = () => ({ bytes: sim.save(), level: S.level ? { used: S.level.used, uses: { ...S.level.uses } } : null });
function restore(s){
  sim.load(s.bytes);
  if(S.level && s.level){ S.level.used = s.level.used; S.level.uses = s.level.uses; applyRestrictions(); }
}
function snapshot(){
  undoStack.push(capture());
  if(undoStack.length > 40) undoStack.shift();
  redoStack.length = 0;
}
function undo(){
  const s = undoStack.pop();
  if(!s) return toast('Nothing to undo');
  redoStack.push(capture());
  restore(s);
}
function redo(){
  const s = redoStack.pop();
  if(!s) return toast('Nothing to redo');
  undoStack.push(capture());
  restore(s);
}

// ---------- layout ----------
const dpr = () => Math.min(window.devicePixelRatio || 1, 2);
function fit(){
  const st = $('stage').getBoundingClientRect();
  const pad = 20;
  let s = Math.min((st.width - pad) / W, (st.height - pad) / H);
  if(s >= 3) s = Math.floor(s);
  s = Math.max(s, 0.5);
  const cw = Math.round(W * s), ch = Math.round(H * s);
  for(const c of [$('gl'), ov]){
    c.style.width = cw + 'px';
    c.style.height = ch + 'px';
    c.width = Math.round(cw * dpr());
    c.height = Math.round(ch * dpr());
  }
  $('screen').style.width = cw + 'px';
  $('screen').style.height = ch + 'px';
  octx.imageSmoothingEnabled = false;
}
new ResizeObserver(fit).observe($('stage'));
fit();

// ---------- overlay ----------
const discEdges = new Map();
function discEdge(r){
  if(discEdges.has(r)) return discEdges.get(r);
  const inside = (x, y) => x * x + y * y <= r * r + r;
  const cells = [];
  for(let y = -r - 1; y <= r + 1; y++) for(let x = -r - 1; x <= r + 1; x++){
    if(inside(x, y) && (!inside(x + 1, y) || !inside(x - 1, y) || !inside(x, y + 1) || !inside(x, y - 1))) cells.push([x, y]);
  }
  discEdges.set(r, cells);
  return cells;
}
function drawOverlay(time){
  const k = ov.width / W;
  octx.clearRect(0, 0, ov.width, ov.height);
  if(S.debug){
    const r = sim.rects();
    octx.strokeStyle = 'rgba(110,224,122,0.8)';
    octx.lineWidth = Math.max(1, k * 0.5);
    for(let i = 0; i < r.length; i += 4) octx.strokeRect(r[i] * k, r[i + 1] * k, (r[i + 2] - r[i] + 1) * k, (r[i + 3] - r[i + 1] + 1) * k);
    octx.strokeStyle = 'rgba(255,255,255,0.06)';
    for(let x = 32; x < W; x += 32){ octx.beginPath(); octx.moveTo(x * k, 0); octx.lineTo(x * k, H * k); octx.stroke(); }
    for(let y = 32; y < H; y += 32){ octx.beginPath(); octx.moveTo(0, y * k); octx.lineTo(W * k, y * k); octx.stroke(); }
  }
  if(S.level){
    for(const z of S.level.def.zones || []){
      octx.save();
      octx.setLineDash([k * 2, k * 2]);
      octx.lineDashOffset = -time * 10;
      octx.strokeStyle = z.color || 'rgba(255,205,74,0.85)';
      octx.lineWidth = Math.max(1, k * 0.75);
      octx.strokeRect(z.x0 * k, z.y0 * k, (z.x1 - z.x0 + 1) * k, (z.y1 - z.y0 + 1) * k);
      octx.restore();
      if(z.label){
        octx.font = `700 ${Math.max(9, Math.round(k * 5))}px ui-monospace, Menlo, monospace`;
        octx.fillStyle = z.color || 'rgba(255,205,74,0.95)';
        octx.fillText(z.label, z.x0 * k + k * 2, z.y0 * k - k * 2);
      }
    }
  }
  // Pins, and the rope being dragged out.
  const j = sim.joints();
  for(let i = 0; i < j.length; i += 5){
    if(!j[i + 4]) continue;
    octx.strokeStyle = j[i + 4] === 2 ? 'rgba(255,205,74,0.95)' : 'rgba(255,106,74,0.95)';
    octx.lineWidth = Math.max(1, k * 0.6);
    octx.beginPath(); octx.arc(j[i + 2] * k, j[i + 3] * k, k * 1.6, 0, Math.PI * 2); octx.stroke();
  }
  if(P.down && P.straight){
    octx.strokeStyle = P.mode === 'erase' ? 'rgba(255,106,74,0.8)' : 'rgba(255,255,255,0.7)';
    octx.lineWidth = Math.max(1, (S.size * 2 - 1) * k);
    octx.lineCap = 'round';
    octx.globalAlpha = 0.5;
    octx.beginPath(); octx.moveTo((P.straight[0] + 0.5) * k, (P.straight[1] + 0.5) * k); octx.lineTo((P.x + 0.5) * k, (P.y + 0.5) * k); octx.stroke();
    octx.globalAlpha = 1;
  }
  if(P.down && P.mode === 'rope' && P.start){
    octx.strokeStyle = 'rgba(255,255,255,0.6)';
    octx.setLineDash([k * 2, k * 2]);
    octx.lineWidth = Math.max(1, k * 0.6);
    octx.beginPath(); octx.moveTo(P.start[0] * k, P.start[1] * k); octx.lineTo(P.fx * k, P.fy * k); octx.stroke();
    octx.setLineDash([]);
  }
  const hv = S.hover;
  if(hv){
    const mode = P.down && P.mode ? P.mode : S.tool;
    const t = TOOL[mode];
    octx.fillStyle = mode === 'erase' ? 'rgba(255,106,74,0.9)' : 'rgba(255,255,255,0.75)';
    if(mode === 'rope' || mode === 'pin'){
      octx.fillStyle = mode === 'pin' ? 'rgba(255,106,74,0.95)' : 'rgba(255,255,255,0.8)';
      for(const [dx, dy] of [[0, 0], [0, -1], [0, 1], [-1, 0], [1, 0]]) octx.fillRect((hv[0] + dx) * k, (hv[1] + dy) * k, k, k);
    } else if(mode === 'grab'){
      const id = sim.bodyAt(P.fx, P.fy);
      octx.fillStyle = id || (P.down && P.mode === 'grab') ? 'rgba(255,205,74,0.95)' : 'rgba(255,255,255,0.6)';
      for(const [dx, dy] of [[0, -2], [0, -1], [0, 1], [0, 2], [-2, 0], [-1, 0], [1, 0], [2, 0]]) octx.fillRect((hv[0] + dx) * k, (hv[1] + dy) * k, k, k);
    } else if(t && t.shape !== undefined){
      const s = shapeSize(t.shape);
      const [w, h] = t.shape === 2 ? [s * 3, Math.max(2, Math.floor(s / 3))] : [s, s];
      octx.strokeStyle = 'rgba(255,255,255,0.6)';
      octx.lineWidth = Math.max(1, k * 0.5);
      if(t.shape === 1 || t.shape === 3){ octx.beginPath(); octx.arc(P.fx * k, P.fy * k, s / 2 * k, 0, Math.PI * 2); octx.stroke(); }
      else octx.strokeRect((P.fx - w / 2) * k, (P.fy - h / 2) * k, w * k, h * k);
    } else {
      const r = mode === 'bomb' ? bombRadius() : S.size - 1;
      if(mode === 'bomb') octx.fillStyle = 'rgba(255,106,74,0.8)';
      for(const [dx, dy] of discEdge(r)) octx.fillRect((hv[0] + dx) * k, (hv[1] + dy) * k, k, k);
    }
  }
  if(S.paused){
    octx.font = `800 ${Math.max(11, Math.round(k * 7))}px ui-monospace, Menlo, monospace`;
    octx.fillStyle = 'rgba(255,205,74,0.95)';
    octx.textAlign = 'right';
    octx.fillText('PAUSED', ov.width - k * 6, k * 12);
    octx.textAlign = 'left';
  }
}

// ---------- loop ----------
let acc = 0, last = performance.now(), frames = 0, simMs = 0, simN = 0, lastStat = 0;
function tick(){
  const t0 = performance.now();
  sim.step(1);
  simMs += performance.now() - t0; simN++;
  checkLevel();
}
function frame(now){
  const dt = Math.min(100, now - last);
  last = now;
  hold();
  if(!S.paused){
    acc += dt * S.speed;
    let n = 0;
    while(acc >= STEP_MS && n < 8){ tick(); acc -= STEP_MS; n++; }
    if(n === 8) acc = 0;
  } else {
    acc = 0;
  }
  const rows = sim.render();
  if(rows) renderer.upload(sim.view, rows[0], rows[1]);
  renderer.draw(now / 1000);
  drawOverlay(now / 1000);
  sounds();
  frames++;
  if(now - lastStat > 500) updateStatus(now);
  requestAnimationFrame(frame);
}
let lastBlasts = 0;
function sounds(){
  const s = sim.stats();
  if(s.explosions < lastBlasts) lastBlasts = s.explosions;
  if(s.explosions > lastBlasts){ sfx.boom(s.explosions - lastBlasts); lastBlasts = s.explosions; }
  if(S.paused) return;
  if(s.impact > 1.3) sfx.thud(s.impact);
  if(s.burning) sfx.crackle(s.burning);
}
function updateStatus(now){
  const s = sim.stats();
  const fps = frames * 1000 / (now - lastStat);
  const ms = simN ? simMs / simN : 0;
  frames = 0; simMs = 0; simN = 0; lastStat = now;
  const total = Math.ceil(W / 32) * Math.ceil(H / 32);
  const k = v => v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(Math.round(v));
  $('status').innerHTML =
    `<span><b>FPS</b> ${Math.round(fps)}</span>` +
    `<span><b>SIM</b> ${ms.toFixed(2)} ms</span>` +
    `<span><b>ACTIVE</b> ${s.chunks}/${total} chunks</span>` +
    `<span><b>CELLS</b> ${k(s.cells)}/frame</span>` +
    `<span><b>FLYING</b> ${k(s.particles)}</span>` +
    `<span><b>OBJECTS</b> ${s.bodies} (${s.awake} awake)</span>` +
    `<span class="tip">${tipText()}</span>`;
}
function tipText(){
  const t = TOOL[S.tool];
  if(S.tool === 'paint') return `${NAME[S.mat] || ''}: drag to paint, Shift replaces, right-drag erases`;
  if(S.tool === 'grab') return 'Drag objects around. Fling them.';
  if(S.tool === 'draw') return `Draw a shape in ${NAME[S.solid]}; it becomes an object when you let go`;
  if(S.tool === 'rope') return `Drag out a ${NAME[S.solid].toLowerCase()} rope. Wood burns through; metal makes a chain.`;
  if(S.tool === 'pin') return 'Click an object to pin it (it can still swing). Shift-click: a motor. Alt-click: reverse motor.';
  if(t.shape !== undefined) return `Click to drop a ${NAME[S.solid].toLowerCase()} ${t.id === 'tri' ? 'wedge' : t.id}. Pick a solid material to change it.`;
  if(S.tool === 'bomb') return 'Click to blow things up';
  if(S.tool === 'fire') return 'Hold to set things alight. On metal or water it makes a spark.';
  return 'Drag to erase';
}

// ---------- time controls ----------
function setPaused(p){
  S.paused = p;
  $('play').textContent = p ? 'PLAY' : 'PAUSE';
  $('play').setAttribute('aria-pressed', p);
}
$('play').addEventListener('click', () => setPaused(!S.paused));
$('stepBtn').addEventListener('click', () => { setPaused(true); tick(); });
const SPEEDS = [1, 2, 0.5, 0.25];
$('speed').addEventListener('click', () => {
  S.speed = SPEEDS[(SPEEDS.indexOf(S.speed) + 1) % SPEEDS.length];
  $('speed').textContent = S.speed >= 1 ? S.speed + 'X' : (S.speed === 0.5 ? '1/2X' : '1/4X');
});

// ---------- menu, scene files, share links ----------
const menu = $('menu');
function toggleMenu(open = !menu.classList.contains('open')){
  menu.classList.toggle('open', open);
  $('menuBtn').setAttribute('aria-expanded', open);
}
$('menuBtn').addEventListener('click', e => { e.stopPropagation(); toggleMenu(); });
document.addEventListener('click', e => { if(!e.target.closest?.('#menu')) toggleMenu(false); });
menu.addEventListener('click', () => setTimeout(() => toggleMenu(false), 0));

function setCheck(id, on){ $(id).setAttribute('aria-checked', on); }
$('soundBtn').addEventListener('click', () => { sfx.on = !sfx.on; if(sfx.on) sfx.wake(); setCheck('soundBtn', sfx.on); store('sound', sfx.on); });
$('glowBtn').addEventListener('click', () => { renderer.glow = !renderer.glow; setCheck('glowBtn', renderer.glow); store('glow', renderer.glow); });
$('crtBtn').addEventListener('click', () => { renderer.crt = !renderer.crt; setCheck('crtBtn', renderer.crt); store('crt', renderer.crt); });
$('debugBtn').addEventListener('click', toggleDebug);
function toggleDebug(){ S.debug = !S.debug; setCheck('debugBtn', S.debug); }

$('undo').addEventListener('click', undo);
$('clearBtn').addEventListener('click', () => {
  if(S.level){ restartLevel(); toast('Restarted'); return; }
  snapshot();
  sim.clear();
  toast('Cleared (undo brings it back)');
});
$('demoBtn').addEventListener('click', () => {
  const g = el('div', 'levels');
  for(const sc of SCENES){
    const b = el('button', 'lvl');
    b.append(el('b', null, sc.name), el('p', null, sc.about));
    b.addEventListener('click', () => {
      closeModal();
      if(S.level) exitLevel(false);
      snapshot();
      sim.clear();
      sc.build(api);
      setPaused(false);
    });
    g.append(b);
  }
  openModal('Example scenes', g);
});

$('saveBtn').addEventListener('click', () => {
  const blob = new Blob([sim.save()], { type: 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `sandbit-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.sbt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('loadBtn').addEventListener('click', () => $('fileIn').click());
$('pictureBtn').addEventListener('click', () => {
  // Draw a frame and grab it straight away, before the buffer is cleared.
  renderer.draw(performance.now() / 1000);
  $('gl').toBlob(blob => {
    if(!blob) return toast('Could not save the picture');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sandbit-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, 'image/png');
});
$('fileIn').addEventListener('change', async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if(!f) return;
  const bytes = new Uint8Array(await f.arrayBuffer());
  if(String.fromCharCode(...bytes.subarray(0, 4)) !== 'SBT2') return toast('That file is not a Sandbit scene');
  if(S.level) exitLevel(false);
  snapshot();
  toast(sim.load(bytes) ? 'Scene loaded' : 'That scene file is damaged');
});

async function pack(bytes){
  if(typeof CompressionStream === 'undefined') return 'r' + b64(bytes);
  const out = await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer();
  return 'z' + b64(new Uint8Array(out));
}
async function unpack(s){
  const bytes = unb64(s.slice(1));
  if(s[0] === 'r') return bytes;
  const out = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
  return new Uint8Array(out);
}
function b64(bytes){
  let s = '';
  for(let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64(s){
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}
$('shareBtn').addEventListener('click', async () => {
  const code = await pack(sim.save());
  history.replaceState(null, '', '#s=' + code);
  try {
    await navigator.clipboard.writeText(location.href);
    toast(`Link copied (${(code.length / 1024).toFixed(1)} KB)`);
  } catch(e){
    toast('Link is in the address bar');
  }
});

// ---------- toast + modal ----------
let toastTimer = 0;
function toast(msg){
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), Math.max(1800, msg.length * 60));
}
function openModal(title, body){
  $('modalTitle').textContent = title;
  $('modalBody').replaceChildren(body);
  $('modal').hidden = false;
  $('modalClose').focus();
}
function closeModal(){ $('modal').hidden = true; }
$('modalClose').addEventListener('click', closeModal);
$('modal').addEventListener('click', e => { if(e.target === $('modal')) closeModal(); });
function el(tag, cls, text){ const n = document.createElement(tag); if(cls) n.className = cls; if(text != null) n.textContent = text; return n; }

function showHelp(){
  const k = el('div', 'keys');
  const rows = [
    ['Left drag', 'Use the selected tool'], ['Right drag', 'Grab an object, or erase'], ['Shift + drag', 'Paint over things instead of only empty space'],
    ['Alt + drag', 'Draw a straight line'],
    ['1-0', 'Pick a material'], ['[ ]', 'Brush size'], ['B E F X G', 'Paint, erase, lighter, bomb, grab'],
    ['C N P K W O', 'Crate, ball, plank, boulder, wedge, draw an object'],
    ['L I', 'Rope (drag between two points), pin (Shift/Alt: a motor)'],
    ['Space / .', 'Pause / step one frame'], ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo'], ['D', 'Show the chunks being simulated'], ['M', 'Sound on/off'], ['R', 'Restart the challenge'],
  ];
  for(const [a, b] of rows){ k.append(el('kbd', null, a), el('span', null, b)); }
  const p = el('p', null, 'Objects are made of pixels too: fire burns wooden ones, acid eats them, bombs break them into pieces, and water holds up the ones lighter than it. The simulation only updates chunks where something is moving; press D to watch.');
  p.style.cssText = 'color:var(--dim); margin-top:14px; max-width:60ch;';
  const wrap = el('div'); wrap.append(k, p);
  openModal('Controls', wrap);
}
$('helpBtn').addEventListener('click', showHelp);

function showHow(){
  const wrap = el('div', 'how');
  const para = t => { const p = el('p', null, t); wrap.append(p); };
  const head = t => wrap.append(el('h3', null, t));
  head('Only what moves costs anything');
  para('The world is 480 x 270 cells, split into 32 x 32 chunks. Each chunk remembers the small rectangle of cells that changed last frame, and only those get updated. A settled sand pile or a still lake costs nothing. Turn on the overlay below to watch the rectangles light up where things move.');
  head('Objects are made of pixels too');
  para('A crate is a little grid of wood pixels. Every frame it is drawn into the world as ordinary cells, so fire, acid and explosions act on it like any other wood, and then lifted back out. Pixels that got burnt or dissolved are gone from the crate, and a crate broken in two becomes two crates. While lifted out, crates move with a rigid-body solver: pixel contacts are boiled down to a couple of points per face, joints hold ropes together, water pushes up on whatever it touches (air inside a hull counts, so a metal boat floats), and sand piled on top weighs it down.');
  head('Tricks for things falling sand usually cannot do');
  para('Water finds its level through U-bends: a stuck surface cell pressed against a wall searches the water below it for an opening lower down and moves there. Terrain cut off from the ground becomes a falling object. Sparks travel through metal and water as a pulse.');
  head('Written for speed');
  para('The simulation is Rust compiled to WebAssembly, with no libraries. Cells are stored as separate byte arrays so the inner loop touches as little memory as possible, and the page reads the grid straight out of WebAssembly memory and uploads only the rows that changed to the GPU.');
  const b = el('button', 'btn accent', S.debug ? 'Hide the chunk overlay' : 'Show the chunk overlay');
  b.addEventListener('click', () => { toggleDebug(); closeModal(); });
  wrap.append(b);
  openModal('How it works', wrap);
}
$('howBtn').addEventListener('click', showHow);

// ---------- challenges ----------
function stars(n, of = 3){
  const s = el('span', 'stars');
  for(let i = 0; i < of; i++){ const x = el('span', i < n ? 'on' : null, '\u2605'); s.append(x); }
  return s;
}
function progress(){ return load('progress', {}); }
function showLevels(){
  const g = el('div', 'levels');
  const prog = progress();
  LEVELS.forEach((L, i) => {
    const b = el('button', 'lvl');
    b.append(el('span', 'n', `LEVEL ${i + 1}`), el('b', null, L.name), el('p', null, L.brief), stars(prog[L.id] || 0));
    b.addEventListener('click', () => startLevel(L));
    g.append(b);
  });
  const wrap = el('div');
  wrap.append(g);
  if(S.level){
    const back = el('button', 'btn', 'Back to sandbox');
    back.style.marginTop = '14px';
    back.addEventListener('click', () => { closeModal(); exitLevel(); });
    wrap.append(back);
  }
  openModal('Challenges', wrap);
}
$('levelsBtn').addEventListener('click', showLevels);

function startLevel(def){
  closeModal();
  if(!S.level) S.sandbox = sim.save();
  S.level = { def, used: 0, uses: { ...(def.uses || {}) }, hold: 0, won: false, failed: false, t: 0 };
  undoStack.length = 0; redoStack.length = 0;
  sim.clear();
  def.setup(api);
  applyRestrictions();
  $('hud').hidden = false;
  $('hudName').textContent = def.name;
  $('hudBrief').textContent = def.brief;
  $('hudRes').textContent = '';
  setPaused(false);
  checkLevel(true);
}
function restartLevel(){ if(S.level) startLevel(S.level.def); }
function exitLevel(restore = true){
  S.level = null;
  $('hud').hidden = true;
  undoStack.length = 0; redoStack.length = 0;
  sim.clear();
  if(restore && S.sandbox) sim.load(S.sandbox);
  applyRestrictions();
}
$('hudReset').addEventListener('click', restartLevel);
$('hudName').title = 'Click to show or hide the description';
$('hudName').addEventListener('click', () => $('hud').classList.toggle('collapsed'));
$('hudExit').addEventListener('click', () => exitLevel());

function checkLevel(force){
  const L = S.level;
  if(!L || L.won) return;
  L.t++;
  if(!force && L.t % 6) return;
  const g = L.def.goal(api);
  const p = Math.max(0, Math.min(1, g.p));
  $('hudBar').style.width = (p * 100).toFixed(1) + '%';
  $('hudGoal').textContent = g.text;
  const res = [];
  if(L.def.budget) res.push(`INK ${Math.max(0, L.def.budget - L.used)}/${L.def.budget}`);
  const SHORT = { fire: 'LIGHTER', bomb: 'BOMBS', crate: 'CRATES', ball: 'BALLS', plank: 'PLANKS', boulder: 'BOULDERS', tri: 'WEDGES', rope: 'ROPES', pin: 'PINS' };
  for(const [k, v] of Object.entries(L.uses)) res.push(`${SHORT[k] || k.toUpperCase()} x${v}`);
  $('hudRes').textContent = res.join('  ');
  if(p >= 1){
    L.hold += 6;
    if(L.hold >= (L.def.hold ?? 60)) win();
  } else {
    L.hold = 0;
  }
}
function win(){
  const L = S.level;
  L.won = true;
  sfx.win();
  let n = 3;
  if(L.def.budget){
    const f = L.used / L.def.budget;
    n = f <= (L.def.stars?.[0] ?? 0.35) ? 3 : f <= (L.def.stars?.[1] ?? 0.7) ? 2 : 1;
  } else if(L.def.par){
    const sec = L.t / 60;
    n = sec <= L.def.par ? 3 : sec <= L.def.par * 2 ? 2 : 1;
  }
  const prog = progress();
  prog[L.def.id] = Math.max(prog[L.def.id] || 0, n);
  store('progress', prog);
  const box = el('div', 'win');
  box.append(stars(n));
  const used = L.def.budget ? `Used ${L.used} of ${L.def.budget} ink.` : `Took ${(L.t / 60).toFixed(1)} seconds.`;
  box.append(el('p', null, `${L.def.done || 'Nice.'} ${used}`));
  const row = el('div', 'row');
  const i = LEVELS.indexOf(L.def);
  const next = LEVELS[i + 1];
  const again = el('button', 'btn', 'Replay');
  again.addEventListener('click', () => startLevel(L.def));
  const all = el('button', 'btn', 'All challenges');
  all.addEventListener('click', showLevels);
  row.append(again, all);
  if(next){
    const nb = el('button', 'btn accent', 'Next: ' + next.name);
    nb.addEventListener('click', () => startLevel(next));
    row.append(nb);
  }
  box.append(row);
  openModal('Challenge complete', box);
}

// ---------- keyboard ----------
const matKeys = Object.fromEntries(PALETTE.filter(p => p.key).map(p => [p.key, p.id]));
const toolKeys = Object.fromEntries(TOOLS.filter(t => t.key).map(t => [t.key, t.id]));
document.addEventListener('keydown', e => {
  sfx.wake();
  if(e.target.closest?.('input, textarea')) return;
  if(e.key === 'Escape'){ closeModal(); toggleMenu(false); return; }
  if(!$('modal').hidden) return;
  if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z'){ e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y'){ e.preventDefault(); redo(); return; }
  if(e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if(k === ' '){ e.preventDefault(); setPaused(!S.paused); }
  else if(k === '.'){ setPaused(true); tick(); }
  else if(k === '['){ setSize(S.size - 1); }
  else if(k === ']'){ setSize(S.size + 1); }
  else if(k === 'd'){ toggleDebug(); }
  else if(k === 'm'){ $('soundBtn').click(); toast(sfx.on ? 'Sound on' : 'Sound off'); }
  else if(k === 'r'){ restartLevel(); }
  else if(k === '?'){ showHelp(); }
  else if(matKeys[k] !== undefined){ setMat(matKeys[k]); }
  else if(toolKeys[k]){ setTool(toolKeys[k]); }
});

// ---------- GPU resets ----------
// Laptops sleeping or switching graphics can lose the WebGL context. Wait for
// it to come back, then rebuild the renderer and redraw every cell.
$('gl').addEventListener('webglcontextlost', e => { e.preventDefault(); toast('Graphics reset...'); });
$('gl').addEventListener('webglcontextrestored', () => {
  const { glow, crt } = renderer;
  renderer = new Renderer($('gl'), W, H, sim.palette());
  Object.assign(renderer, { glow, crt });
  sim.ex.redraw();
});

// ---------- per-viewer settings ----------
function store(k, v){ try { localStorage.setItem('sandbit.' + k, JSON.stringify(v)); } catch(e){} }
function load(k, d){ try { const v = localStorage.getItem('sandbit.' + k); return v == null ? d : JSON.parse(v); } catch(e){ return d; } }
renderer.glow = load('glow', true); setCheck('glowBtn', renderer.glow);
sfx.on = load('sound', true); setCheck('soundBtn', sfx.on);
document.addEventListener('click', e => { if(e.target.closest?.('.btn, .mat, .lvl, .menu button')){ sfx.wake(); sfx.click(); } });
renderer.crt = load('crt', false); setCheck('crtBtn', renderer.crt);

// ---------- start ----------
setTool('paint');
setMat(M.SAND);
let loaded = false;
if(location.hash.startsWith('#s=')){
  try { loaded = sim.load(await unpack(location.hash.slice(3))); } catch(e){ loaded = false; }
  toast(loaded ? 'Shared scene loaded' : 'That share link is broken');
}
if(!loaded){
  demo(api);
  setTimeout(() => { if(!S.level) toast('Drag to paint. Try CHALLENGES, or MORE > Example scenes'); }, 600);
}
requestAnimationFrame(t => { last = t; lastStat = t; requestAnimationFrame(frame); });

// For poking at it from the console.
window.sandbit = {
  sim, api, S, startLevel, LEVELS,
  /** Run n frames and draw, even when the tab is in the background. */
  advance(n = 60){
    for(let i = 0; i < n; i++){ hold(); tick(); }
    const rows = sim.render();
    if(rows) renderer.upload(sim.view, rows[0], rows[1]);
    renderer.draw(performance.now() / 1000);
    drawOverlay(performance.now() / 1000);
    return sim.stats();
  },
};
