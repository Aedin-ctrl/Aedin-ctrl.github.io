// Dynamic hand "moves" (research/24): swipes, push/pull, twist, grab/release, circle, snap,
// plus two-hand clap and spread/squeeze. Call once per frame with the smoothed hands:
//   const moves = new Moves();   for (const m of moves.update(hands, now)) { … m.name, m.label, m.x, m.y }
// Distances are in palm lengths (h.size), so the thresholds hold near or far from the camera.
// Screen x is already mirrored (selfie view), so "left" is the user's left.
import { describe } from './modes/signing/features.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const DEG = Math.PI / 180;
const OPP = { Left: 'Right', Right: 'Left', Up: 'Down', Down: 'Up' };
const LABELS = {
  swipeLeft: 'Swipe left', swipeRight: 'Swipe right', swipeUp: 'Swipe up', swipeDown: 'Swipe down',
  push: 'Push', pull: 'Pull', fistBump: 'Fist bump', twistCW: 'Twist clockwise', twistCCW: 'Twist anticlockwise',
  grab: 'Grab', release: 'Release', circleCW: 'Circle clockwise', circleCCW: 'Circle anticlockwise', snap: 'Snap',
  clap: 'Clap', spread: 'Spread (zoom in)', squeeze: 'Squeeze (zoom out)',
};
const COOL = { swipe: 500, push: 600, twist: 600, pose: 350, circle: 800, snap: 500, clap: 250, zoom: 250 };   // ms
const KEEP = 1600;                                  // ms of history kept per hand

export class Moves {
  constructor() { this.st = new Map(); this.cool = new Map(); this.pair = { hist: [], armed: true, zoom: null }; this.pairBusy = 0; }

  update(hands, now) {
    const out = [], live = hands.filter((h) => h.pts && h.size > 25 && h.alpha > 0.5);
    this.two(live, now, out);                       // first: a fast two-hand approach stands swipes down
    for (const h of live) this.one(h, now, out);
    for (const id of this.st.keys()) if (!live.some((h) => h.id === id)) this.st.delete(id);
    for (const [k, t] of this.cool) if (t <= now) this.cool.delete(k);   // hand ids never repeat — don't let this grow
    return out;
  }

  emit(out, key, group, name, hand, x, y, now) {
    const k = `${key}:${group}`;
    if (now < (this.cool.get(k) || 0)) return false;
    this.cool.set(k, now + COOL[group]);
    out.push({ name, label: LABELS[name], hand, x, y });
    return true;
  }

  // oldest sample inside the last `ms`, if the history really spans most of that window
  back(hist, now, ms) {
    for (const s of hist) if (s.t >= now - ms) return now - s.t > ms * 0.6 ? s : null;
    return null;
  }

  one(h, now, out) {
    const p = h.pts, S = h.size;
    let s = this.st.get(h.id);
    if (!s) { s = { born: now, hist: [], pose: 'mid', raw: 'mid', rawT: now, openT: -1e9, fistT: -1e9, lock: 0, lastSwipe: null, circleFrom: 0, touchStart: null, armSnap: 0 }; this.st.set(h.id, s); }
    const c = { t: now, x: h.palm.x, y: h.palm.y, size: S, len: dist(p[0], p[9]), wid: dist(p[5], p[17]),
      ang: Math.atan2(p[9].y - p[0].y, p[9].x - p[0].x), ix: p[8].x, iy: p[8].y };
    const prev = s.hist[s.hist.length - 1];
    if (prev && dist(prev, c) > 2.5 * S) s.hist = [];              // tracking jump / hand re-identified
    s.hist.push(c);
    while (s.hist[0].t < now - KEEP) s.hist.shift();
    if (now - s.born < 300) return;                                // let a new hand settle first
    const fire = (group, name, x = c.x, y = c.y) => {
      const ok = this.emit(out, h.id, group, name, h.id, x, y, now);
      if (ok && (group === 'swipe' || group === 'push' || group === 'twist')) s.lock = now + 350;   // one motion move at a time
      return ok;
    };
    const free = now >= s.lock;
    const r = this.back(s.hist, now, 100);
    const speed = r ? dist(r, c) / S / ((now - r.t) / 1000) : 0;   // palm speed, palm lengths / s

    // grab / release: open ⇄ fist within 450 ms (debounced 60 ms, ignored while the palm is flying)
    const d = describe(h);
    if (d) {
      const fs = ['index', 'middle', 'ring', 'pinky'].map((n) => d.f[n]);
      const ext = fs.filter((f) => f.ext).length, curled = fs.filter((f) => f.curled).length;
      const raw = curled >= 3 && ext === 0 ? 'fist' : ext === 4 ? 'open' : 'mid';
      if (raw !== s.raw) { s.raw = raw; s.rawT = now; }
      if (now - s.rawT >= 60 && raw !== s.pose) {
        if (speed < 4 && raw === 'fist' && now - s.openT < 450) fire('pose', 'grab');
        if (speed < 4 && raw === 'open' && now - s.fistT < 450) fire('pose', 'release');
        s.pose = raw;
      }
      if (s.pose === 'open') s.openT = now;
      if (s.pose === 'fist') s.fistT = now;
    }

    // snap (experimental): thumb+middle held ≥100 ms, then they part and the middle tip whips in
    if (h.touch.has('0-2') && !h.touch.has('0-1')) s.touchStart ??= now;
    else if (s.touchStart != null) { s.armSnap = now - s.touchStart > 100 ? now : 0; s.touchStart = null; }
    const mt = h.tips[2];
    if (s.armSnap && now - s.armSnap < 180 && speed < 3 && mt && Math.hypot(mt.vx, mt.vy) > 7 * S && d && d.f.middle.bend > 90 &&
        fire('snap', 'snap', p[4].x, p[4].y)) s.armSnap = 0;

    // swipe: palm travels > 1.4 palm lengths in 250 ms along one axis (2:1), same size, not pinching
    const a = this.back(s.hist, now, 250);
    if (a && !h.down) {
      const dx = c.x - a.x, dy = c.y - a.y;
      if (Math.hypot(dx, dy) > 1.4 * S && Math.abs(Math.log(c.size / a.size)) < 0.2) {
        const dir = Math.abs(dx) > 2 * Math.abs(dy) ? (dx < 0 ? 'Left' : 'Right') : Math.abs(dy) > 2 * Math.abs(dx) ? (dy < 0 ? 'Up' : 'Down') : null;
        if (dir) {
          const L = s.lastSwipe, same = L && L.dir === dir && now - L.t < 150;            // still the same stroke
          const returning = !same && L && L.dir === OPP[dir] && now - L.t < 700;         // the hand coming back / a wave
          let used = same ? L.used : returning;                                         // stroke already fired or vetoed
          if (!used && free && now >= this.pairBusy) used = fire('swipe', 'swipe' + dir);
          s.lastSwipe = { dir, t: now, used };          // tracked even while locked, so waves stay suppressed
        }
      }
    }

    // push / pull and twist, over 300 ms
    const b = this.back(s.hist, now, 300);
    if (b && free) {
      const rl = c.len / b.len, rw = c.wid / b.wid, drift = dist(b, c) / S;
      const uniform = Math.abs(Math.log(rl / rw)) < 0.25;          // both palm axes scale together → depth, not tilt
      if (uniform && drift < 1.2 && rl > 1.25 && rw > 1.25) fire('push', s.pose === 'fist' ? 'fistBump' : 'push');
      else if (uniform && drift < 1.2 && rl < 0.8 && rw < 0.8) fire('push', 'pull');
      const turn = wrap(c.ang - b.ang);                             // + = clockwise on screen (y down)
      if (Math.abs(turn) > 55 * DEG && drift < 1 && c.len > 0.8 * c.wid && Math.abs(Math.log(c.size / b.size)) < 0.25)
        fire('twist', turn > 0 ? 'twistCW' : 'twistCCW');
    }

    // circle: index tip winds ≥ 330° around its own centroid within 1.5 s, at a steady radius
    if (!h.down) {
      const q = s.hist.filter((e) => e.t >= Math.max(now - 1500, s.circleFrom));
      if (q.length > 12 && now - q[0].t > 400) {
        let cx = 0, cy = 0, wind = 0, rs = 0, rs2 = 0, last = null;
        for (const e of q) { cx += e.ix / q.length; cy += e.iy / q.length; }
        for (const e of q) {
          const rr = Math.hypot(e.ix - cx, e.iy - cy), an = Math.atan2(e.iy - cy, e.ix - cx);
          rs += rr; rs2 += rr * rr;
          if (last != null) wind += wrap(an - last);
          last = an;
        }
        const mr = rs / q.length, cv = Math.sqrt(Math.max(0, rs2 / q.length - mr * mr)) / (mr || 1);
        if (Math.abs(wind) > 330 * DEG && mr > 0.4 * S && cv < 0.35 && fire('circle', wind > 0 ? 'circleCW' : 'circleCCW', cx, cy)) s.circleFrom = now;
      }
    }
  }

  two(live, now, out) {
    const P = this.pair;
    if (live.length !== 2) {                         // the tracker often drops a hand at the moment of a clap
      const l = P.hist[P.hist.length - 1];
      if (l && now - l.t < 150 && P.armed && l.D < 1.8 * l.S && Math.max(...P.hist.map((e) => e.v)) > 4)
        this.emit(out, 'pair', 'clap', 'clap', 'both', l.x, l.y, now);
      P.hist = []; P.zoom = null; P.armed = true;
      return;
    }
    const [a, b] = live, S = (a.size + b.size) / 2, D = dist(a.palm, b.palm);
    const x = (a.palm.x + b.palm.x) / 2, y = (a.palm.y + b.palm.y) / 2;
    const old = this.back(P.hist, now, 200);
    const v = old ? (old.D - D) / old.S / ((now - old.t) / 1000) : 0;   // closing speed, palm lengths / s
    P.hist.push({ t: now, D, S, x, y, v });
    while (P.hist[0].t < now - 400) P.hist.shift();
    if (Math.abs(v) > 3) this.pairBusy = now + 300;  // hands rushing together/apart → not swipes

    // clap: closing faster than 4 palm lengths/s in the last 400 ms, then palms within 1.2 palm lengths
    if (D > 2.2 * S) P.armed = true;
    const vmax = Math.max(...P.hist.map((e) => e.v));
    if (P.armed && D < 1.2 * S && vmax > 4 && !(a.down && b.down)) { P.armed = false; this.emit(out, 'pair', 'clap', 'clap', 'both', x, y, now); }

    // spread / squeeze: both pinching, distance grows past ×1.35 or shrinks under ×0.74 (then re-bases)
    const fist = (h) => this.st.get(h.id)?.pose === 'fist';
    if (!(a.down && b.down) || fist(a) || fist(b)) P.zoom = null;
    else if (!P.zoom) P.zoom = { D0: D, t: now };
    else if (now - P.zoom.t > 120) {
      const k = D / P.zoom.D0;
      if ((k > 1.35 || k < 0.74) && this.emit(out, 'pair', 'zoom', k > 1 ? 'spread' : 'squeeze', 'both', x, y, now)) P.zoom = { D0: D, t: now };
    }
  }
}
