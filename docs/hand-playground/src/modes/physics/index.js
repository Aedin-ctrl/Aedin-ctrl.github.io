// Physics tab: a Rube-Goldberg sandbox. Pinch a tile to pull a part out, drop it to place,
// pinch a placed part to move it (a second pinch rotates / stretches), drop on the shelf to
// delete. Pinch a marble, domino or plank to grab and throw it. Open fingers push things.
import { Sim } from './sim.js';
import { TILES, STRETCHY, DEFAULT_LEN, hitPart, drawPart, drawMarble, drawTrail, drawIcon } from './parts.js';
import { Particles } from '../../toys/particles.js';
import { el } from '../ui.js';
import { LEVELS } from './levels.js';

const S = 50;                         // px per metre
const STORE = 'hp-physics-level';
const TILE = 52, GAP = 8, PAD = 12;

function defaultLevel(w, h) {
  const ramp = { type: 'ramp', x: 5.8, y: h - 3.8, angle: -0.35, len: 5.2 };
  const onRamp = (x) => ({ x, y: ramp.y + Math.tan(ramp.angle) * (x - ramp.x) + 0.07 });
  const bp = onRamp(6.8);
  const k = w / 28.8;                 // stretch the far end to the screen width
  return [
    { type: 'spawner', x: 3.0, y: h - 2.2, angle: -0.3 },
    ramp,
    { type: 'boost', x: bp.x, y: bp.y, angle: -0.35, len: 1.2 },
    { type: 'trampoline', x: 17.6 * k, y: 1.4, angle: 0.2, len: 1.8 },
    { type: 'cup', x: 23.0 * k, y: 0.05, angle: 0 },
  ].map((p, i) => ({ ...p, id: i + 1 }));
}

export class PhysicsMode {
  name = 'Physics';
  hint = 'Pinch a part on the shelf and drop it · grab the ends of a ramp to stretch it (one hand or both) · drop on the shelf to delete';

  constructor({ sfx, size }) {
    this.sfx = sfx; this.size = size;
    this.sim = new Sim((type, x) => this.onEvent(type, x));
    this.state = new Map();           // hand id → { drag?, joint? }
    this.t = 0;
    this.loaded = false;
    this.sparks = new Particles(300);            // world units (metres)
    this.undoStack = [];

    const btn = (label, title, fn) => el('button', { 'data-hand': '', title, onclick: fn }, label);
    this.pauseBtn = btn('Pause', 'Pause / play (space)', () => this.togglePause());
    this.slowBtn = btn('Slow-mo', 'Slow motion (S)', () => this.toggleSlow());
    this.challengeBtn = btn('Challenge', 'Play the challenge levels', () => this.nextChallenge());
    this.challenge = null;        // { i, level, inv, won }
    this.score = el('div', { class: 'chip count' }, '0 in the cup');
    this.panel = el('div', { class: 'mode-panel' }, [
      this.score,
      el('div', { class: 'tools' }, [
        this.pauseBtn, this.slowBtn,
        btn('Undo', 'Undo (⌘Z)', () => this.undo()),
        btn('Reset', 'Reset marbles and dominoes (R)', () => this.reset()),
        btn('Clear', 'Remove every part', () => this.clearAll()),
        btn('Starter', 'Load the starter contraption', () => this.loadDefault()),
        this.challengeBtn,
        btn('Share', 'Copy a link to this contraption', () => this.share()),
      ]),
    ]);
  }

  // ── level persistence ──────────────────────────────────────────────
  ensureLoaded() {
    if (this.loaded) return;
    this.loaded = true;
    const { w, h } = this.worldSize();
    this.sim.setSize(w, h);
    let parts = null;
    try { parts = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch {}
    if (this.shared) {
      // opening a shared link: your own level stays one Undo away (and in a backup slot)
      if (Array.isArray(parts)) {
        this.undoStack.push(JSON.stringify({ parts, inv: null }));
        try { localStorage.setItem(STORE + '-backup', JSON.stringify(parts)); } catch {}
      }
      parts = this.shared; this.shared = null;
    }
    if (!Array.isArray(parts)) parts = defaultLevel(w, h);
    this.sim.load(parts);
  }
  // ── share: the level rides in the URL hash (deflate + base64url), no server involved ──
  async share() {
    const json = JSON.stringify(JSON.parse(this.snapshot()).parts.map(({ locked, ...p }) => p));
    const deflated = await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(deflated))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const url = `${location.origin}${location.pathname}#level=${b64}`;
    try { await navigator.clipboard.writeText(url); this.score.textContent = 'Link copied'; }
    catch { history.replaceState(null, '', `#level=${b64}`); this.score.textContent = 'Link is in the address bar'; }
    this.sfx.bond(2, 5);
  }
  static async fromHash() {
    const m = /#level=([A-Za-z0-9_-]+)/.exec(location.hash);
    if (!m) return null;
    try {
      const bin = atob(m[1].replace(/-/g, '+').replace(/_/g, '/'));
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      const text = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
      return validateParts(JSON.parse(text));
    } catch { return null; }
  }

  // ── challenge mode ─────────────────────────────────────────────────
  nextChallenge() {
    const i = this.challenge ? this.challenge.i + 1 : 0;
    if (i >= LEVELS.length) {                      // back to the sandbox
      this.challenge = null; this.challengeBtn.textContent = 'Challenge'; this.undoStack = [];
      this.state.clear(); this.loaded = false; this.ensureLoaded(); this.sfx.release(2);
      return;
    }
    const level = LEVELS[i], { w, h } = this.worldSize();
    this.challenge = { i, level, inv: { ...level.inv }, won: false };
    this.state.clear(); this.undoStack = [];
    this.sim.load(level.parts(w, h).map((p, k) => ({ ...p, id: k + 1, locked: true, len: p.len })));
    this.challengeBtn.textContent = 'Skip level';
    this.sfx.bond(2, 3);
  }
  checkWin(total) {
    const c = this.challenge;
    if (!c || c.won || total < c.level.goal) return;
    c.won = true;
    this.challengeBtn.textContent = c.i + 1 < LEVELS.length ? 'Next level' : 'Back to sandbox';
    this.sfx.discover(6);
    const cup = this.sim.parts.find((p) => p.type === 'cup');
    if (cup) this.sparks.burst(cup.x, cup.y + 1, 120, () => { const a = Math.random() * Math.PI, sp = 3 + Math.random() * 6; return { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: -9, drag: 0.985, decay: 0.6 + Math.random() * 0.4, size: 0.06, color: `hsl(${Math.random() * 360},90%,70%)` }; });
  }

  save() {
    if (this.challenge) return;                    // challenge levels are never saved over the sandbox
    const keep = this.sim.parts.map(({ id, type, x, y, angle, len, side, pair, speed, locked }) => ({ id, type, x, y, angle, len, side, pair, speed, locked }));
    try { localStorage.setItem(STORE, JSON.stringify(keep)); } catch {}
  }
  snapshot() {
    const parts = this.sim.parts.map(({ id, type, x, y, angle, len, side, pair, speed, locked }) => ({ id, type, x, y, angle, len, side, pair, speed, locked }));
    return JSON.stringify({ parts, inv: this.challenge?.inv ?? null });
  }
  pushUndo() {
    const s = this.snapshot();
    if (this.undoStack.at(-1) !== s) { this.undoStack.push(s); if (this.undoStack.length > 100) this.undoStack.shift(); }
  }
  undo() {
    if (!this.undoStack.length) return;
    this.state.clear();
    const s = JSON.parse(this.undoStack.pop());
    this.sim.load(s.parts);
    if (this.challenge && s.inv) this.challenge.inv = { ...s.inv };
    this.save(); this.sfx.release(1);
  }
  toggleSlow() {
    this.userSlow = !this.userSlow;
    this.sim.slowTarget = this.userSlow ? 0.25 : 1;
    this.slowBtn.textContent = this.userSlow ? 'Normal speed' : 'Slow-mo';
  }
  leaveChallenge() {
    if (!this.challenge) return;
    this.challenge = null; this.challengeBtn.textContent = 'Challenge'; this.undoStack = [];
  }
  loadDefault() { this.leaveChallenge(); this.pushUndo(); this.state.clear(); const { w, h } = this.worldSize(); this.sim.load(defaultLevel(w, h)); this.save(); this.sfx.bond(2, 3); }
  reset() { for (const p of this.sim.parts) p.count = 0; this.sim.load(this.sim.parts); this.state.clear(); this.sfx.release(2); }
  clearAll() { this.leaveChallenge(); this.pushUndo(); this.sim.load([]); this.state.clear(); this.save(); this.sfx.release(0); }
  togglePause() { this.sim.paused = !this.sim.paused; this.pauseBtn.textContent = this.sim.paused ? 'Play' : 'Pause'; }

  onKey(e) {
    const k = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && k === 'z') { e.preventDefault(); this.undo(); return true; }
    if (e.metaKey || e.ctrlKey || e.altKey) return false;
    if (k === 's') { this.toggleSlow(); return true; }
    if (k === ' ') { e.preventDefault(); this.togglePause(); return true; }
    if (k === 'r') { this.reset(); return true; }
    // keyboard rotate/stretch for the mouse: hover a part, then Q/E rotate and [/] stretch
    const part = this.hovered;
    if (!part) return false;
    if (['q', 'e', '[', ']', 'backspace', 'delete'].includes(k)) this.pushUndo();
    if (k === 'q' || k === 'e') { part.angle += (k === 'q' ? 1 : -1) * Math.PI / 12; this.sim.buildPart(part); this.save(); return true; }
    if ((k === '[' || k === ']') && STRETCHY.has(part.type)) { part.len = clampLen(part.len + (k === ']' ? 0.4 : -0.4)); this.sim.buildPart(part); this.save(); return true; }
    if (k === 'backspace' || k === 'delete') { this.sim.removePart(part); this.save(); this.sfx.release(0); return true; }
    return false;
  }

  // ── coordinates ────────────────────────────────────────────────────
  worldSize() { const { w, h } = this.size(); return { w: w / S, h: h / S }; }
  toWorld(p) { const { h } = this.size(); return { x: p.x / S, y: (h - p.y) / S }; }

  trayLayout() {
    const { h } = this.size();
    const rows = Math.ceil(TILES.length / 2);
    const th = rows * (TILE + GAP) - GAP + PAD * 2;
    const x = 16, y = Math.max(60, (h - th) / 2);
    return {
      x, y, w: TILE * 2 + GAP + PAD * 2, h: th,
      tiles: TILES.map((t, i) => ({ ...t, x: x + PAD + (i % 2) * (TILE + GAP), y: y + PAD + Math.floor(i / 2) * (TILE + GAP), s: TILE })),
    };
  }
  inTray(p) { const t = this.tray; return p.x > t.x - 6 && p.x < t.x + t.w + 6 && p.y > t.y - 6 && p.y < t.y + t.h + 6; }

  // ── per-frame ──────────────────────────────────────────────────────
  update(dt, hands) {
    this.ensureLoaded();
    this.t += dt;
    const ws = this.worldSize();
    this.sim.setSize(ws.w, ws.h);
    this.tray = this.trayLayout();

    for (const st of this.state.values()) if (st.joint?.gone) st.joint = null;
    for (const hand of hands) this.handle(hand, dt);
    for (const id of [...this.state.keys()]) if (!hands.some((h) => h.id === id)) this.drop(id);

    // open fingers push things around
    for (const hand of hands) {
      if (!hand.pts || hand.down || this.inTray(hand.pinch)) continue;
      const r = (hand.size * 0.13) / S;
      hand.tips.forEach((t, i) => { const w = this.toWorld(t); this.sim.pusher(`${hand.id}:${i}`, w.x, w.y, r, dt); });
      const pw = this.toWorld(hand.palm);
      this.sim.pusher(`${hand.id}:palm`, pw.x, pw.y, (hand.size * 0.35) / S, dt);
    }
    this.sim.sweepPushers();

    this.sim.update(dt);
    this.sparks.update(dt);
    // predicted path of the next marble from each spawner (throwaway world, every 250 ms)
    if (this.t - (this.previewAt || 0) > 0.25) {
      this.previewAt = this.t;
      const key = this.snapshot();                 // only re-simulate when the layout changed
      if (key !== this.previewKey) { this.previewKey = key; this.preview = this.predict(); }
    }

    // hover (for keyboard tools) — nearest part under the first pointer
    const first = hands[0];
    this.hovered = first ? this.partAt(this.toWorld(first.pinch)) : null;
    const total = this.sim.parts.filter((p) => p.type === 'cup').reduce((s, p) => s + (p.count || 0), 0);
    if (this.challenge) {
      const c = this.challenge;
      this.score.textContent = c.won ? `Solved “${c.level.name}” ★` : `Level ${c.i + 1}: ${c.level.name} · ${total}/${c.level.goal}`;
      this.checkWin(total);
    } else this.score.textContent = `${total} in the cup`;
  }

  partAt(w) {
    let best = null, bd = 0;
    for (const p of this.sim.parts) {
      if (this.isDragged(p) || p.locked) continue;
      const d = hitPart(p, w.x, w.y);
      if (d < bd) { best = p; bd = d; }
    }
    return best;
  }
  // One snapping rule shared by the live ghost and the drop: ends of stretchy parts click onto other
  // parts' ends (0.4 m), otherwise a 0.25 m grid and 15° angles (within 4°).
  snapPose(part, held = null) {
    const out = { x: part.x, y: part.y, angle: part.angle, len: part.len, guide: null };
    if (STRETCHY.has(part.type)) {
      const mine = part._ends || endpoints(part);
      let best = null, bd = 0.4;
      for (const o of this.sim.parts) {
        if (o === part || !STRETCHY.has(o.type)) continue;
        const e = endpoints(o);
        for (const k of held ? [held] : ['a', 'b']) for (const m of ['a', 'b']) {
          const d = Math.hypot(e[m].x - mine[k].x, e[m].y - mine[k].y);
          if (d < bd) { bd = d; best = { k, to: e[m] }; }
        }
      }
      if (best) {
        if (part._ends) {
          const q = { ...part, _ends: { ...part._ends, [best.k]: best.to } };
          fromEndpoints(q);
          Object.assign(out, { x: q.x, y: q.y, angle: q.angle, len: q.len });
        } else { out.x += best.to.x - mine[best.k].x; out.y += best.to.y - mine[best.k].y; }
        out.guide = best.to;
        return out;
      }
    }
    if (!part._ends) { out.x = Math.round(out.x * 4) / 4; out.y = Math.round(out.y * 4) / 4; }
    const step = Math.PI / 12, near = Math.round(out.angle / step) * step;
    if (Math.abs(near - out.angle) < (4 * Math.PI) / 180) {
      if (part._ends && held) {
        // rotate around the end you're NOT holding, so it stays attached to its neighbour
        const fixed = part._ends[held === 'a' ? 'b' : 'a'], sgn = held === 'a' ? -1 : 1;
        const q = { ...part, _ends: { ...part._ends, [held]: { x: fixed.x + sgn * Math.cos(near) * out.len, y: fixed.y + sgn * Math.sin(near) * out.len } } };
        fromEndpoints(q);
        Object.assign(out, { x: q.x, y: q.y, angle: q.angle });
      } else out.angle = near;
    }
    return out;
  }

  endAt(w, r) {
    let best = null, bd = r;
    for (const p of this.sim.parts) {
      if (!STRETCHY.has(p.type) || p.locked) continue;
      if ([...this.state.values()].some((st) => st.drag?.part === p && !st.drag.end)) continue;   // being moved whole → twist instead
      const ends = p._ends || endpoints(p);
      for (const k of ['a', 'b']) {
        if ([...this.state.values()].some((st) => st.drag?.part === p && st.drag.end === k)) continue;
        const d = Math.hypot(ends[k].x - w.x, ends[k].y - w.y);
        if (d < bd) { best = { part: p, end: k }; bd = d; }
      }
    }
    return best;
  }

  isDragged(p) { for (const st of this.state.values()) if (st.drag?.part === p) return true; return false; }

  handle(hand, dt) {
    let st = this.state.get(hand.id);
    if (!st) { st = {}; this.state.set(hand.id, st); }
    const w = this.toWorld(hand.pinch);
    st.pos = w;

    if (hand.justDown) {
      const tile = this.tray.tiles.find((t) => hand.pinch.x >= t.x && hand.pinch.x <= t.x + t.s && hand.pinch.y >= t.y && hand.pinch.y <= t.y + t.s);
      if (tile) return this.fromTile(tile, st, w);

      // pinch near either end of a ramp/belt/trampoline/boost → drag that end (the other end stays put,
      // or follows the other hand if it's holding the other end)
      const end = this.endAt(w, hand.kind === 'hand' ? 0.55 : 0.3);
      if (end) {
        this.pushUndo();
        const part = end.part;
        if (!part._ends) { this.sim.unbuildPart(part); part._ends = endpoints(part); }
        st.drag = { part, end: end.end, dx: 0, dy: 0 };
        this.sfx.pop(3);
        return;
      }

      // second hand on a part someone is already dragging → rotate / stretch it
      for (const [id, other] of this.state) {
        if (id === hand.id || !other.drag) continue;
        if (hitPart(other.drag.part, w.x, w.y) < 0.6) {
          const o = this.handPos(id);
          st.twist = { of: id, a0: Math.atan2(w.y - o.y, w.x - o.x), d0: Math.hypot(w.x - o.x, w.y - o.y), angle0: other.drag.part.angle, len0: other.drag.part.len };
          this.sfx.click();
          return;
        }
      }

      const body = this.sim.bodyAt(w.x, w.y, hand.kind === 'hand' ? 0.45 : 0.2);
      if (body) { st.joint = this.sim.grab(body, w.x, w.y); this.sfx.pop(4); return; }

      const part = this.partAt(w);
      if (part?.type === 'windmill' && Math.hypot(w.x - part.x, w.y - part.y) < 0.25) {   // pinch the hub: reverse it
        this.pushUndo(); part.speed = -(part.speed ?? -2.5); this.sim.buildPart(part); this.save(); this.sfx.click();
        return;
      }
      if (part) {
        this.pushUndo();
        this.sim.unbuildPart(part);
        st.drag = { part, dx: part.x - w.x, dy: part.y - w.y };
        this.sfx.pop(2);
        return;
      }

      // empty space: drop a fresh marble into your fingers (not in challenges — marbles come from the spawner)
      if (this.challenge) return;
      const m = this.sim.spawnMarble(w.x, w.y);
      st.joint = this.sim.grab(m, w.x, w.y);
      this.sfx.pop(5);
      return;
    }

    if (hand.down) {
      if (st.joint) st.joint.setTarget(w);
      if (st.drag?.end) {
        const part = st.drag.part;
        part._ends[st.drag.end] = { x: w.x, y: w.y };
        fromEndpoints(part);
      } else if (st.drag) {
        st.drag.part.x = w.x + st.drag.dx;
        st.drag.part.y = w.y + st.drag.dy;
      }
      if (st.twist) {
        const holder = this.state.get(st.twist.of);
        if (!holder?.drag) { st.twist = null; return; }
        const o = this.handPos(st.twist.of), part = holder.drag.part;
        const a = Math.atan2(w.y - o.y, w.x - o.x), d = Math.hypot(w.x - o.x, w.y - o.y);
        part.angle = st.twist.angle0 + (a - st.twist.a0);
        if (STRETCHY.has(part.type)) part.len = clampLen(st.twist.len0 * (d / Math.max(0.3, st.twist.d0)));
      }
    }

    if (hand.justUp || !hand.down) this.drop(hand.id);
  }

  handPos(id) { return this.state.get(id)?.pos ?? { x: 0, y: 0 }; }

  fromTile(tile, st, w) {
    if (this.challenge) {
      if (!this.challenge.inv[tile.type]) { this.sfx.click(); return; }
      this.challenge.inv[tile.type]--;
    }
    if (tile.type === 'marble') {
      const m = this.sim.spawnMarble(w.x, w.y);
      st.joint = this.sim.grab(m, w.x, w.y);
      this.sfx.pop(5);
      return;
    }
    this.pushUndo();
    const part = { type: tile.type, x: w.x, y: w.y, angle: 0, len: DEFAULT_LEN[tile.type], fresh: true };
    if (tile.type === 'portal') part.side = 'A';
    if (tile.type === 'conveyor') part.speed = 3;
    part.id = this.sim.nextId++;
    this.sim.parts.push(part);
    st.drag = { part, dx: 0, dy: 0 };
    this.sfx.pop(3);
  }

  drop(id) {
    const st = this.state.get(id);
    if (!st) return;
    if (st.joint) { this.sim.release(st.joint); st.joint = null; this.sfx.release(4); }
    if (st.drag) {
      const part = st.drag.part, heldEnd = st.drag.end || null;
      st.drag = null;
      const stillHeld = [...this.state.entries()].some(([other, o]) => other !== id && o.drag?.part === part);
      if (stillHeld) { this.state.delete(id); return; }
      delete part._ends;
      const { h } = this.size();
      const screen = { x: part.x * S, y: h - part.y * S };
      if (this.inTray(screen)) {
        this.sim.removePart(part);
        if (this.challenge) this.challenge.inv[part.type] = (this.challenge.inv[part.type] || 0) + 1;
        this.sfx.release(0);
      } else {
        const pose = this.snapPose(part, heldEnd);
        part.x = pose.x; part.y = pose.y; part.angle = pose.angle; part.len = pose.len;
        this.sim.buildPart(part);
        if (part.fresh && part.type === 'portal') {
          const twin = { type: 'portal', side: 'B', x: part.x + 4, y: part.y, angle: Math.PI, pair: part.id };
          this.sim.addPart(twin);
          part.pair = twin.id;
        }
        delete part.fresh;
        this.sfx.bond(1, 2);
      }
      this.save();
    }
    st.twist = null;
    this.state.delete(id);
  }

  predict() {
    // parts being dragged are included where they'd land, so the path updates live while placing
    const parts = this.sim.parts.map((p) => (this.isDragged(p) ? { ...p, ...this.snapPose(p), _ends: undefined } : p));
    const spawners = parts.filter((p) => p.type === 'spawner');
    if (!spawners.length) return [];
    const ghost = new Sim(() => {});
    const { w, h } = this.worldSize();
    ghost.setSize(w, h);
    ghost.load(parts.filter((p) => p.type !== 'spawner'));
    const marbles = spawners.map((p) => {
      const c = Math.cos(p.angle), s = Math.sin(p.angle);
      return { b: ghost.spawnMarble(p.x + c * 0.5, p.y + s * 0.5, c * 3, s * 3), path: [] };
    });
    for (let i = 0; i < 180; i++) {
      ghost.update(1 / 60);
      if (i % 3) continue;
      for (const m of marbles) if (!m.b.dead) { const p = m.b.getPosition(); m.path.push({ x: p.x, y: p.y }); }
    }
    return marbles.map((m) => m.path);
  }

  onEvent(type, x) {
    if (type === 'bounce') this.sfx.pop(Math.max(0, 6 - Math.round(x.speed / 3)));
    else if (type === 'boost') this.sfx.hover(6);
    else if (type === 'portal') this.sfx.bond(2, 5);
    else if (type === 'kick') this.sfx.impact(0.8, 'bell');
    else if (type === 'score') {
      this.sfx.discover(3);
      // a beat of slow-mo + confetti when a marble lands in a cup
      if (!this.userSlow) { this.sim.slowTarget = 0.3; clearTimeout(this.slowT); this.slowT = setTimeout(() => { this.sim.slowTarget = this.userSlow ? 0.25 : 1; }, 900); }
      this.sparks.burst(x.x, x.y + 0.5, 30, () => { const a = Math.random() * Math.PI, sp = 2 + Math.random() * 4; return { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: -9, drag: 0.98, decay: 0.9 + Math.random() * 0.5, size: 0.05, color: `hsl(${Math.random() * 360},90%,70%)` }; });
    } else if (type === 'hit') {
      const v = Math.min(1, (x.dv - 1.2) / 10);
      this.sfx.impact(v, x.a === 'domino' || x.b === 'domino' || x.b === 'plank' ? 'wood' : x.b === 'bumper' ? 'bell' : 'glass');
      const n = Math.min(10, Math.round(2 + x.dv * 0.8)), base = Math.atan2(x.ny, x.nx);
      this.sparks.burst(x.x, x.y, n, () => { const a = base + (Math.random() - 0.5) * 2.1, sp = x.dv * 0.4 * (0.5 + Math.random()); return { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: -6, drag: 0.96, decay: 2.5 + Math.random(), size: 0.03 + Math.random() * 0.02, color: 'rgba(247,248,250,0.9)' }; });
      if (x.dv > 4) for (let b = this.sim.world.getBodyList(); b; b = b.getNext()) {
        const u = b.getUserData();
        if (u?.role === 'marble' && Math.hypot(b.getPosition().x - x.x, b.getPosition().y - x.y) < 0.3) u.squash = Math.min(0.25, x.dv / 40);
      }
    }
  }

  // ── drawing ────────────────────────────────────────────────────────
  draw(g) {
    const t = this.tray;
    if (!t) return;
    const dragging = [...this.state.values()].some((st) => st.drag && this.inTray(this.partScreen(st.drag.part)));
    // the shelf only changes with its layout, the challenge counts, or the delete highlight — cache it
    const dpr = g.getTransform().a;
    const key = `${t.x},${t.y},${t.w},${t.h},${dpr},${dragging},${this.challenge ? JSON.stringify(this.challenge.inv) : ''}`;
    if (key !== this.trayKey) {
      this.trayKey = key;
      const c = (this.trayCanvas ??= document.createElement('canvas'));
      c.width = Math.ceil((t.w + 4) * dpr); c.height = Math.ceil((t.h + 4) * dpr);
      const tg = c.getContext('2d');
      tg.setTransform(dpr, 0, 0, dpr, (2 - t.x) * dpr, (2 - t.y) * dpr);
      this.drawTray(tg, t, dragging);
    }
    g.drawImage(this.trayCanvas, t.x - 2, t.y - 2, t.w + 4, t.h + 4);
  }

  drawTray(g, t, dragging) {
    g.save();
    g.fillStyle = dragging ? 'rgba(240,82,90,0.22)' : 'rgba(14,15,18,0.6)';
    g.strokeStyle = dragging ? 'rgba(240,82,90,0.6)' : 'rgba(255,255,255,0.08)';
    g.beginPath(); g.roundRect(t.x, t.y, t.w, t.h, 20); g.fill(); g.stroke();
    for (const tile of t.tiles) {
      const count = this.challenge ? this.challenge.inv[tile.type] || 0 : null;
      g.globalAlpha = count === 0 ? 0.25 : 1;
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.beginPath(); g.roundRect(tile.x, tile.y, tile.s, tile.s, 14); g.fill();
      g.save(); g.translate(tile.x + tile.s / 2, tile.y + tile.s / 2 - 6); drawIcon(g, tile.type); g.restore();
      g.fillStyle = '#9BA1AB'; g.font = '500 10px -apple-system, system-ui, sans-serif'; g.textAlign = 'center';
      g.fillText(tile.label, tile.x + tile.s / 2, tile.y + tile.s - 6);
      if (count) {
        g.fillStyle = '#7CE3B1'; g.beginPath(); g.arc(tile.x + tile.s - 8, tile.y + 8, 9, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#0E0F12'; g.font = '700 11px -apple-system, system-ui, sans-serif'; g.fillText(String(count), tile.x + tile.s - 8, tile.y + 12);
      }
      g.globalAlpha = 1;
    }
    g.restore();
  }

  partScreen(p) { const { h } = this.size(); return { x: p.x * S, y: h - p.y * S }; }

  drawTop(g) {
    const { h } = this.size();
    g.save();
    g.translate(0, h); g.scale(S, -S);
    for (const p of this.sim.parts) {
      const dragged = this.isDragged(p);
      drawPart(g, p, dragged ? null : this.sim.built.get(p.id), this.t, dragged);
    }
    // predicted marble path: fading dots
    for (const path of this.preview || []) {
      path.forEach((p, i) => {
        g.fillStyle = `rgba(247,248,250,${0.35 * (1 - i / path.length)})`;
        g.beginPath(); g.arc(p.x, p.y, 0.035, 0, Math.PI * 2); g.fill();
      });
    }
    const marbles = this.sim.marbles();
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const b of marbles) drawTrail(g, b);
    g.restore();
    for (const b of marbles) drawMarble(g, b);
    this.sparks.draw(g, true);
    // where a dragged part will land (snapped), plus a ring when an end clicks onto another part
    this.readouts = [];
    for (const st of this.state.values()) {
      if (!st.drag) continue;
      const part = st.drag.part, pose = this.snapPose(part, st.drag.end || null);
      if (Math.hypot(pose.x - part.x, pose.y - part.y) > 0.03 || Math.abs(pose.angle - part.angle) > 0.01) {
        g.save(); g.globalAlpha = 0.25; drawPart(g, { ...part, ...pose }, null, this.t, false); g.restore();
      }
      if (pose.guide) { g.strokeStyle = '#7CE3B1'; g.lineWidth = 0.05; g.beginPath(); g.arc(pose.guide.x, pose.guide.y, 0.2, 0, Math.PI * 2); g.stroke(); }
      const deg = Math.round((pose.angle * 180) / Math.PI);
      this.readouts.push({ x: part.x, y: part.y + 0.9, text: `${deg}°${STRETCHY.has(part.type) ? ` · ${pose.len.toFixed(1)} m` : ''}`, snapped: deg % 15 === 0 });
    }
    // end handles on stretchy parts (brighter while held)
    for (const p of this.sim.parts) {
      if (!STRETCHY.has(p.type) || p.locked) continue;
      const ends = p._ends || endpoints(p);
      for (const k of ['a', 'b']) {
        const held = [...this.state.values()].some((st) => st.drag?.part === p && st.drag.end === k);
        g.fillStyle = held ? 'rgba(124,227,177,0.95)' : 'rgba(247,248,250,0.35)';
        g.beginPath(); g.arc(ends[k].x, ends[k].y, held ? 0.13 : 0.08, 0, Math.PI * 2); g.fill();
      }
    }
    // grab tethers
    g.strokeStyle = 'rgba(247,248,250,0.5)'; g.lineWidth = 0.03;
    for (const st of this.state.values()) {
      if (!st.joint) continue;
      const a = st.joint.getAnchorB(), tgt = st.joint.getTarget();
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(tgt.x, tgt.y); g.stroke();
    }
    g.restore();
    // angle / length readouts (screen space so the text isn't mirrored)
    g.save();
    g.font = '600 12px -apple-system, system-ui, sans-serif'; g.textAlign = 'center';
    for (const r of this.readouts) {
      const sx = r.x * S, sy = h - r.y * S, tw = g.measureText(r.text).width + 16;
      g.fillStyle = r.snapped ? 'rgba(124,227,177,0.95)' : 'rgba(14,15,18,0.8)';
      g.beginPath(); g.roundRect(sx - tw / 2, sy - 11, tw, 22, 11); g.fill();
      g.fillStyle = r.snapped ? '#0E0F12' : '#F2F3F5'; g.fillText(r.text, sx, sy + 4);
    }
    g.restore();
  }
}

const clampLen = (l) => Math.max(0.8, Math.min(9, l));

// Shared links are untrusted input: keep only known part types and sane numbers.
const TYPES = new Set(['ramp', 'trampoline', 'boost', 'conveyor', 'seesaw', 'pulley', 'fan', 'portal', 'dominoes', 'cup', 'spawner', 'bumper', 'windmill', 'antigrav']);
function validateParts(parts) {
  if (!Array.isArray(parts) || parts.length > 200) return null;
  const num = (v, lo, hi, d) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
  const used = new Set();
  let next = Math.max(0, ...parts.map((p) => (Number.isInteger(p?.id) ? p.id : 0))) + 1;
  const out = parts.filter((p) => p && TYPES.has(p.type)).map((p) => ({
    id: Number.isInteger(p.id) && p.id > 0 && !used.has(p.id) ? (used.add(p.id), p.id) : (used.add(next), next++), type: p.type,
    x: num(p.x, -5, 200, 5), y: num(p.y, -5, 200, 5), angle: num(p.angle, -20, 20, 0),
    len: STRETCHY.has(p.type) ? clampLen(num(p.len, 0.8, 9, DEFAULT_LEN[p.type])) : undefined,
    side: p.side === 'B' ? 'B' : p.side === 'A' ? 'A' : undefined,
    pair: Number.isInteger(p.pair) ? p.pair : undefined, speed: num(p.speed, -10, 10, undefined),
  }));
  const portals = new Set(out.filter((p) => p.type === 'portal').map((p) => p.id));
  for (const p of out) if (p.pair !== undefined && (p.type !== 'portal' || !portals.has(p.pair))) p.pair = undefined;
  return out;
}

// Ends of a stretchy part: 'a' = the −x end, 'b' = the +x end (in the part's own frame).
function endpoints(p) {
  const c = Math.cos(p.angle), s = Math.sin(p.angle), h = p.len / 2;
  return { a: { x: p.x - c * h, y: p.y - s * h }, b: { x: p.x + c * h, y: p.y + s * h } };
}
function fromEndpoints(p) {
  const { a, b } = p._ends;
  p.x = (a.x + b.x) / 2; p.y = (a.y + b.y) / 2;
  p.angle = Math.atan2(b.y - a.y, b.x - a.x);
  p.len = clampLen(Math.hypot(b.x - a.x, b.y - a.y));
}
