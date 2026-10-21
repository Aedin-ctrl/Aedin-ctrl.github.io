// DoodleLife: draw something; when you stop, it's recognised and comes alive as what it is.
import { Pen, inkStrokes } from './draw.js';
import { Jelly } from './creatures/jelly.js';
import { makeCreature } from './creatures/index.js';
import { Sound } from './sound.js';
import { loadDoodleNet, classifyAll } from './doodlenet.js';
import { ARCHETYPE, DECOYS, archetypeOf } from './creatures/index.js';
import { Seer } from './see.js';
import { encodeScene, decodeScene } from './share.js';

const $ = (id) => document.getElementById(id);
const canvas = $('world'), g = canvas.getContext('2d');
const INKS = ['#2A2D34', '#D9534F', '#2E86AB', '#3E8E5A', '#E0A030', '#8E5AB5'];

const world = {
  w: 0, h: 0, ground: 0, focus: null, creatures: [], particles: [], food: [], ink: INKS[0], t: 0,
  sound: null, recognise: null,
  forceArchetype: new URLSearchParams(location.search).get('as'),      // debug: ?as=swim
};
// Who chases whom (cute, not violent: a catch makes hearts). Prey runs away; same kinds flock.
const CHASES = {
  cat: ['mouse', 'bird', 'fish', 'butterfly'], dog: ['cat', 'rabbit', 'duck'], shark: ['fish', 'octopus', 'crab'],
  spider: ['ant', 'bee', 'mosquito', 'butterfly'], frog: ['mosquito', 'bee', 'butterfly'], lion: ['zebra', 'sheep', 'cow', 'rabbit'],
  crocodile: ['duck', 'fish', 'frog'], owl: ['mouse', 'snake'], snake: ['mouse', 'frog'], bear: ['fish', 'bee'],
};
world.steer = (c) => {
  if (c.target && world.food.includes(c.target)) return { dir: Math.sign(c.target.x - c.x) || 1, chase: true, food: c.target };
  let best = null, bd = 380;
  for (const o of world.creatures) {
    if (o === c || !o.label || !c.label) continue;
    const d = Math.hypot(o.x - c.x, o.y - c.y);
    if (d > bd) continue;
    if (CHASES[c.label]?.includes(o.label)) { best = { dir: Math.sign(o.x - c.x), o, d, chase: true }; bd = d; }
    else if (CHASES[o.label]?.includes(c.label)) { best = { dir: Math.sign(c.x - o.x), o, d, flee: true }; bd = d; }
  }
  if (best?.chase && best.d < (c.w + best.o.w) * 0.4 && !(c.metAt > performance.now() - 2500)) {
    c.metAt = performance.now();
    for (let k = 0; k < 4; k++) world.emit({ kind: 'heart', x: (c.x + best.o.x) / 2, y: Math.min(c.y, best.o.y) - 20, vx: (Math.random() - 0.5) * 40, vy: -40 - Math.random() * 30, life: 1.4 });
    sound.play('chirp', best.o);
  }
  return best;
};
world.emit = (p) => { if (world.particles.length < 600) world.particles.push({ age: 0, ...p }); };
const sound = new Sound();
world.sound = (name, c) => sound.play(name, c);

function resize() {
  const dpr = devicePixelRatio || 1;
  // the ground sits just above the toolbar (which wraps to two rows on a phone)
  const bar = document.querySelector('.bar')?.getBoundingClientRect() || { top: innerHeight - 66 };
  document.documentElement.style.setProperty('--bar', `${Math.round(innerHeight - bar.top)}px`);
  world.w = innerWidth; world.h = innerHeight; world.ground = Math.round(bar.top) - 26;
  canvas.width = Math.round(world.w * dpr); canvas.height = Math.round(world.h * dpr);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', () => { resize(); backdrop = null; });
new ResizeObserver(() => { resize(); backdrop = null; }).observe(document.querySelector('.bar'));
resize();

// ── drawing ───────────────────────────────────────────────────────────────────────────────
let live = [];                                   // strokes of the doodle in progress
const pen = new Pen(canvas, {
  onStroke: (strokes) => { live = strokes; $('hello').classList.add('gone'); },
  onDone: (strokes) => { live = []; spawn(strokes); },
  isPoke: (p) => !!hitTest(p.x, p.y),
});
canvas.addEventListener('pointermove', (e) => { world.mouse = { x: e.clientX, y: e.clientY, at: performance.now() }; });
canvas.addEventListener('pointerleave', () => { world.mouse = null; });

// Recognition: DoodleNet's scores over the classes we know (creatures + a few decoys), pooled per
// archetype (a cat-or-dog-or-horse is surely a walker even when the animal is unsure), then the
// best label inside the winning archetype. Decoys ("other") become labelled jellies.
const ALLOWED = new Set([...Object.values(ARCHETYPE).flat(), ...DECOYS]);
loadDoodleNet().then((D) => {
  world.recognise = (strokes) => {
    const all = classifyAll(D, strokes).filter((r) => ALLOWED.has(r.label));
    const tot = all.reduce((a, r) => a + r.p, 0) || 1;
    for (const r of all) r.p /= tot;
    const pool = {};
    for (const r of all) { const a = archetypeOf(r.label) || 'other'; pool[a] = (pool[a] || 0) + r.p; }
    const [arch, conf] = Object.entries(pool).sort((x, y) => y[1] - x[1])[0];
    const best = all.find((r) => (archetypeOf(r.label) || 'other') === arch);
    return { label: best.label, p: best.p, archetype: arch, confidence: conf, top: all.slice(0, 4) };
  };
}, (e) => console.warn('classifier failed to load', e));

async function spawn(strokes, forcedLabel = null, color = world.ink) {
  const b = boundsOf(strokes);
  if (Math.max(b.w, b.h) < 8) return;                  // a stray dot, not a doodle
  // a small scribble next to a creature is food: it drops, and the hungry one goes to eat it
  if (!forcedLabel && Math.max(b.w, b.h) < 42 && world.creatures.length) {
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    const near = world.creatures.filter((c) => c.label && !['sway', 'float', 'fire', 'roll', 'drive'].includes(c.archetype)).sort((a, z) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(z.x - cx, z.y - cy))[0];
    if (near && Math.hypot(near.x - cx, near.y - cy) < 320) {
      world.food.push({ strokes: strokes.map((s) => s.map((p) => ({ x: p.x - cx, y: p.y - cy }))), x: cx, y: cy, vy: 0, color: world.ink, for: near, t: 0 });
      hint(`Food for the ${near.label}!`);
      return;
    }
  }
  let guess = null;
  try { guess = world.recognise ? await world.recognise(strokes) : null; } catch (e) { console.warn('recognition failed', e); }
  if (forcedLabel) guess = { label: forcedLabel, archetype: archetypeOf(forcedLabel) || 'other', confidence: 1, top: guess?.top || [] };
  const c = makeCreature(strokes, { color, world, guess }) || new Jelly(strokes, { color, world });
  c.rawStrokes = strokes; c.guess = guess; c.forcedLabel = forcedLabel; c.color = color;
  world.creatures.push(c);
  if (world.creatures.length > 24) world.creatures.shift();
  showTag(c);
  sound.play('spawn', c);
  for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2, v = 90 + Math.random() * 90; world.emit({ kind: 'spark', x: c.x, y: c.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.3, color: c.color }); }
  world.made = (world.made || 0) + 1;
  if (world.made === 1) hint('Draw another one. They notice each other.');
  else if (world.made === 3) hint('Tap a creature to poke it. Wrong guess? Tap the right one above it.');
  else if (world.made === 5) hint('👀 Camera lets them look at you.');
  return c;
}
const boundsOf = (strokes) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const s of strokes) for (const p of s) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); } return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 }; };

// The name tag rides above the newest creature for a moment; the chips under it offer the other
// guesses, and tapping one re-makes the creature as that.
let tagged = null, tagUntil = 0;
function showTag(c) {
  tagged = c; tagUntil = performance.now() + 2600;
  const tag = $('tag'), chips = $('chips');
  tag.textContent = c instanceof Jelly ? (c.label ? `a jelly ${c.label}!` : 'a jelly!') : c.label;
  tag.hidden = false;
  const alts = (c.guess?.top || []).filter((t) => t.label !== c.label).slice(0, 3);
  chips.replaceChildren(...alts.map((t) => {
    const btn = document.createElement('button');
    btn.textContent = `${t.label}?`;
    btn.onclick = async () => {
      const i = world.creatures.indexOf(c);
      if (i >= 0) world.creatures.splice(i, 1);
      await spawn(c.rawStrokes, t.label, c.color);
    };
    return btn;
  }));
  chips.hidden = !alts.length;
  placeChips(c);
}
function placeTag() {
  const tag = $('tag'), chips = $('chips');
  if (!tagged || performance.now() > tagUntil || !world.creatures.includes(tagged)) { tag.hidden = true; chips.hidden = true; tagged = null; return; }
  const x = Math.max(60, Math.min(world.w - 60, tagged.x)), top = tagged.y - tagged.h / 2 - 14;
  tag.style.left = `${x}px`; tag.style.top = `${Math.max(30, top)}px`;
}
// the chips stay where the creature was when it was tagged, so they hold still to be tapped
function placeChips(c) {
  const chips = $('chips'), x = Math.max(120, Math.min(world.w - 120, c.x)), top = c.y - c.h / 2 - 14;
  chips.style.left = `${x}px`; chips.style.top = `${Math.max(64, top) - 4}px`;
}
$('chips').addEventListener('pointerenter', () => { tagUntil = performance.now() + 4000; });
$('chips').addEventListener('pointerdown', () => { tagUntil = performance.now() + 4000; });

// Poke a creature: it jumps and squeaks (and the tag shows again).
const hitTest = (x, y) => [...world.creatures].reverse().find((c) => Math.hypot(c.x - x, c.y - y) < Math.max(24, c.size * 0.45));
canvas.addEventListener('pointerdown', (e) => {
  const hit = hitTest(e.clientX, e.clientY);
  if (!hit) return;
  // a quick second tap turns it around (for when it guessed its front wrong)
  const now = performance.now();
  if (hit.pokedAt && now - hit.pokedAt < 350) { hit.flipFront?.(); hint('Turned around.'); }
  hit.poke?.(e.clientX, e.clientY); hit.pokedAt = now;
  sound.play('chirp', hit);
  showTag(hit);
}, { capture: true });

// ── loop ──────────────────────────────────────────────────────────────────────────────────
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000); last = now;
  world.t += dt;
  // what the eyes look at: the cursor while you're moving it, else your face (if they can see you)
  if (world.mouse && now - world.mouse.at > 1500) world.mouse = null;
  world.focus = world.mouse || world.face || null;
  for (const c of world.creatures) c.update(dt);
  updateParticles(dt);
  updateFood(dt);
  weather(dt);
  skyClock(dt);
  render();
  placeTag();
  requestAnimationFrame(frame);
}

let backdrop = null;
function paintBackdrop() {
  const { w, h, ground } = world, dpr = devicePixelRatio || 1;
  const c = document.createElement('canvas'); c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  const b = c.getContext('2d'); b.scale(dpr, dpr);
  const sky = b.createLinearGradient(0, 0, 0, ground);
  sky.addColorStop(0, '#EEF3F1'); sky.addColorStop(1, '#F6F3EC');
  b.fillStyle = sky; b.fillRect(0, 0, w, ground);
  const sun = b.createRadialGradient(w * 0.82, ground * 0.18, 0, w * 0.82, ground * 0.18, Math.min(w, h) * 0.45);
  sun.addColorStop(0, 'rgba(255,214,140,0.35)'); sun.addColorStop(1, 'rgba(255,214,140,0)');
  b.fillStyle = sun; b.fillRect(0, 0, w, ground);
  // two soft hills far away
  for (const [y0, amp, col] of [[ground - 70, 40, 'rgba(62,142,126,0.08)'], [ground - 30, 26, 'rgba(62,142,126,0.12)']]) {
    b.fillStyle = col; b.beginPath(); b.moveTo(0, ground);
    for (let x = 0; x < w + 20; x += 20) b.lineTo(Math.min(x, w), y0 - amp * Math.sin(Math.min(x, w) / w * Math.PI * 2.2 + y0) * Math.sin(Math.min(x, w) / w * Math.PI));
    b.lineTo(w, ground); b.closePath(); b.fill();
  }
  b.fillStyle = '#EDE8DC'; b.fillRect(0, ground, w, h - ground);
  b.strokeStyle = 'rgba(42,45,52,0.18)'; b.lineWidth = 2; b.beginPath(); b.moveTo(0, ground); b.lineTo(w, ground); b.stroke();
  backdrop = c;
}
function render() {
  const { w, h, ground } = world;
  if (!backdrop || backdrop.width !== Math.round(w * (devicePixelRatio || 1))) paintBackdrop();
  g.clearRect(0, 0, w, h);
  g.drawImage(backdrop, 0, 0, w, h);
  // shadows under creatures
  for (const c of world.creatures) {
    const hgt = Math.max(0, ground - (c.y + c.h / 2));
    const a = Math.max(0, 0.16 - hgt / 2500), r = c.w * 0.45 * Math.max(0.3, 1 - hgt / 900);
    if (a > 0.01) { g.fillStyle = `rgba(42,45,52,${a})`; g.beginPath(); g.ellipse(c.x, ground + 3, r, 5, 0, 0, Math.PI * 2); g.fill(); }
  }
  if (world.nightK > 0.01) drawNight();
  drawParticles();
  for (const f of world.food) drawFood(f);
  for (const c of world.creatures) c.draw(g);
  if (live.length) inkStrokes(g, live, world.ink, 4);
}
// ── particles: bubbles, rain, dust, exhaust puffs ───────────────────────────────────────────
function updateParticles(dt) {
  const P = world.particles;
  for (const p of P) {
    p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.kind === 'bubble') { p.x += Math.sin(p.age * 6) * 12 * dt; }
    if (p.kind === 'rain' && p.y >= world.ground) { p.age = p.life; world.emit({ kind: 'splash', x: p.x, y: world.ground, vx: 0, vy: 0, life: 0.25 }); }
    if (p.kind === 'puff') { p.r += 10 * dt; }
    if (p.kind === 'spark') { p.vx *= Math.exp(-dt * 4); p.vy = p.vy * Math.exp(-dt * 4) + 200 * dt; }
    if (p.kind === 'firefly') { p.vx += (Math.random() - 0.5) * 60 * dt; p.vy += (Math.random() - 0.5) * 60 * dt; if (world.nightK < 0.3) p.age = Math.max(p.age, p.life - 0.3); }
  }
  world.particles = P.filter((p) => p.age < p.life && p.y > -20);
}
function drawParticles() {
  for (const p of world.particles) {
    const k = 1 - p.age / p.life;
    g.save();
    if (p.kind === 'bubble') { g.strokeStyle = `rgba(46,134,171,${0.6 * k})`; g.lineWidth = 1.5; g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.stroke(); }
    else if (p.kind === 'spark') { g.fillStyle = p.color || '#E0A030'; g.globalAlpha = k; g.beginPath(); g.arc(p.x, p.y, 3 * k + 0.5, 0, Math.PI * 2); g.fill(); }
    else if (p.kind === 'heart') { g.fillStyle = `rgba(217,83,79,${k})`; g.font = `${14 + 6 * (1 - k)}px sans-serif`; g.textAlign = 'center'; g.fillText('♥', p.x, p.y); }
    else if (p.kind === 'firefly') { const a = Math.min(1, p.age * 2, (p.life - p.age) * 2) * (0.5 + 0.5 * Math.sin(p.age * 4 + p.ph)) * world.nightK; const grd = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, 9); grd.addColorStop(0, `rgba(255,236,140,${a})`); grd.addColorStop(1, 'rgba(255,236,140,0)'); g.fillStyle = grd; g.beginPath(); g.arc(p.x, p.y, 9, 0, Math.PI * 2); g.fill(); }
    else if (p.kind === 'ember') { g.fillStyle = `rgba(255,140,40,${0.9 * k})`; g.beginPath(); g.arc(p.x + Math.sin(p.age * 8) * 3, p.y, 2 * k + 0.5, 0, Math.PI * 2); g.fill(); }
    else if (p.kind === 'rain') { g.strokeStyle = 'rgba(46,134,171,0.55)'; g.lineWidth = 2; g.lineCap = 'round'; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x, p.y + 9); g.stroke(); }
    else if (p.kind === 'splash') { g.strokeStyle = `rgba(46,134,171,${0.6 * k})`; g.lineWidth = 1.5; g.beginPath(); g.arc(p.x, p.y, 2 + 8 * (1 - k), Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
    else if (p.kind === 'puff' || p.kind === 'dust') { g.fillStyle = `rgba(140,138,132,${0.25 * k})`; g.beginPath(); g.ellipse(p.x, p.y, p.r * (p.kind === 'dust' ? 1 + (1 - k) : 1), p.kind === 'dust' ? 4 : p.r, 0, 0, Math.PI * 2); g.fill(); }
    g.restore();
  }
}
requestAnimationFrame(frame);

// ── food: falls (or floats, for swimmers), the creature it's for heads over; eating = crumbs + a gulp
function updateFood(dt) {
  for (const f of world.food) {
    f.t += dt;
    const swimmer = f.for?.archetype === 'swim' || f.for?.archetype === 'fly';
    if (!swimmer) { f.vy += 900 * dt; f.y = Math.min(world.ground - 6, f.y + f.vy * dt); } else f.y += Math.sin(f.t * 2) * 6 * dt;
    const c = f.for;
    if (!c || !world.creatures.includes(c)) { f.for = null; continue; }
    c.target = f;
    const mouth = c.toWorld ? c.toWorld({ x: (c.head || 1) * c.w * 0.4, y: 0 }) : c;
    // in reach: level with the front end and within the body's height (food on the ground counts
    // for a tall walker whose mouth is up at body height)
    if (Math.abs(mouth.x - f.x) < Math.max(28, c.w * 0.3) && f.y > c.y - c.h / 2 - 30 && f.y < c.y + c.h / 2 + 30) {
      f.eaten = true; c.target = null; c.poke?.(c.x, c.y); c.fed = (c.fed || 0) + 1;
      for (let k = 0; k < 8; k++) world.emit({ kind: 'spark', x: f.x, y: f.y, vx: (Math.random() - 0.5) * 120, vy: -Math.random() * 120, life: 0.5, color: f.color });
      world.emit({ kind: 'heart', x: c.x, y: c.y - c.h / 2 - 10, vx: 0, vy: -40, life: 1.2 });
      sound.play('chirp', c);
    }
  }
  world.food = world.food.filter((f) => !f.eaten && f.t < 25);
}
function drawFood(f) {
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = f.color; g.lineWidth = 3;
  for (const s of f.strokes) { g.beginPath(); s.forEach((p, i) => (i ? g.lineTo(f.x + p.x, f.y + p.y) : g.moveTo(f.x + p.x, f.y + p.y))); g.stroke(); }
  g.restore();
}

// ── weather: a sun makes plants grow a little; rain makes flowers perk up
function weather(dt) {
  const sun = world.creatures.some((c) => c.label === 'sun'), rain = world.creatures.some((c) => c.label === 'cloud' || c.label === 'rain');
  for (const c of world.creatures) if (c.archetype === 'sway') {
    const want = 1 + (sun ? 0.18 : 0) + (rain ? 0.12 : 0) + Math.min(0.2, (c.fed || 0) * 0.05);
    c.grow = (c.grow || 1) + (want - (c.grow || 1)) * dt * 0.25;
  }
}

// ── day and night: draw a moon and night falls (stars, fireflies, campfires glow brighter);
// draw a sun and it's morning. The newest moon or sun on screen decides, so Undo/Clear work too.
world.nightK = 0;
let stars = [], wasNight = false, fireflyIn = 0;
function skyClock(dt) {
  const last = [...world.creatures].reverse().find((c) => c.label === 'moon' || c.label === 'sun');
  const night = last?.label === 'moon';
  if (night !== wasNight) { wasNight = night; hint(night ? 'Night falls. Draw a sun for morning.' : 'Good morning!'); }
  world.nightK += ((night ? 1 : 0) - world.nightK) * Math.min(1, dt * 0.9);
  if (world.nightK > 0.5 && (fireflyIn -= dt) < 0 && world.particles.filter((p) => p.kind === 'firefly').length < 14) {
    fireflyIn = 0.35 + Math.random() * 0.5;
    world.emit({ kind: 'firefly', x: Math.random() * world.w, y: world.ground - 20 - Math.random() * 160, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 20, life: 3 + Math.random() * 3, ph: Math.random() * 6 });
  }
}
function drawNight() {
  const { w, ground } = world, k = world.nightK;
  if (stars.length === 0 || stars.w !== w) {
    stars = Array.from({ length: Math.round(w / 18) }, () => ({ x: Math.random() * w, y: Math.random() * ground * 0.65, r: 0.6 + Math.random() * 1.3, ph: Math.random() * 6 }));
    stars.w = w;
  }
  const sky = g.createLinearGradient(0, 0, 0, ground);
  sky.addColorStop(0, `rgba(22,30,78,${0.64 * k})`); sky.addColorStop(1, `rgba(44,54,110,${0.4 * k})`);
  g.fillStyle = sky; g.fillRect(0, 0, w, ground);
  g.fillStyle = `rgba(36,40,70,${0.3 * k})`; g.fillRect(0, ground, w, world.h - ground);
  for (const st of stars) {
    g.fillStyle = `rgba(255,250,235,${k * (0.55 + 0.45 * Math.sin(world.t * 1.7 + st.ph))})`;
    g.beginPath(); g.arc(st.x, st.y, st.r, 0, Math.PI * 2); g.fill();
  }
  // a cool glow round each moon
  for (const c of world.creatures) if (c.label === 'moon') {
    const r = Math.max(c.w, c.h) * 1.4, grd = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, r);
    grd.addColorStop(0, `rgba(235,240,255,${0.35 * k})`); grd.addColorStop(1, 'rgba(235,240,255,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(c.x, c.y, r, 0, Math.PI * 2); g.fill();
  }
}

// a small hint line above the toolbar
function hint(text) {
  const el = $('hint'); el.textContent = text; el.classList.add('show');
  clearTimeout(hint.t); hint.t = setTimeout(() => el.classList.remove('show'), 5000);
}
const IDEAS = ['a fish', 'a snake', 'a cat', 'a bird', 'a car', 'a flower', 'a cloud', 'a spider', 'a frog', 'a campfire', 'a moon', 'a butterfly'];
let ideaK = 0;
setInterval(() => { if (world.made) return; ideaK = (ideaK + 1) % IDEAS.length; $('idea').textContent = IDEAS[ideaK]; }, 1400);

// ── toolbar ───────────────────────────────────────────────────────────────────────────────
$('inks').replaceChildren(...INKS.map((col, i) => {
  const b = document.createElement('button');
  b.style.background = col; b.title = 'Ink colour';
  b.classList.toggle('on', i === 0);
  b.onclick = () => { world.ink = col; for (const x of $('inks').children) x.classList.toggle('on', x === b); };
  return b;
}));
const seer = new Seer(world, $('peek'));
world.leanIn = () => { for (const c of world.creatures) { c.poke?.(c.x, c.y + c.h); } sound.play('chirp', world.creatures[0]); };
$('see').onclick = async () => {
  if (seer.on) { seer.stop(); $('see').classList.remove('on'); $('see').textContent = '👀 Camera'; return; }
  $('see').textContent = '👀 …';
  try { await seer.start(); $('see').classList.add('on'); $('see').textContent = '👀 On'; }
  catch (e) { console.warn(e); $('see').textContent = e?.name === 'NotAllowedError' ? '👀 Blocked' : '👀 No camera'; }
};
$('share').onclick = async () => {
  if (!world.creatures.length) { hint('Draw something first.'); return; }
  const h = await encodeScene(world.creatures, world.w, world.h);
  const url = `${location.origin}${location.pathname}#s=${h}`;
  history.replaceState(null, '', `#s=${h}`);
  try { await navigator.clipboard.writeText(url); hint('Link copied. Anyone who opens it gets your creatures.'); }
  catch { hint('Link is in the address bar. Copy it to share.'); }
};
// open a shared scene
(async () => {
  const m = location.hash.match(/#s=([A-Za-z0-9_-]+)/);
  if (!m) return;
  try {
    const items = await decodeScene(m[1], world.w, world.h);
    $('hello').classList.add('gone');
    for (const [k, it] of items.entries()) setTimeout(() => spawn(it.strokes, it.label, it.color), 400 + k * 250);
  } catch (e) { console.warn('bad share link', e); }
})();
$('undo').onclick = () => { world.creatures.pop(); };
$('clear').onclick = () => { world.creatures.length = 0; pen.cancel(); live = []; };
$('sound').onclick = () => { sound.on = !sound.on; $('sound').textContent = sound.on ? '🔊' : '🔇'; };
addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); $('undo').click(); }
  if (e.key === 'm' || e.key === 'M') $('sound').click();
});

window.__doodle = { world, spawn };     // for headless checks
