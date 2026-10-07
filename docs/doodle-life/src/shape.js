// Shape analysis of a doodle in local coordinates (centred, y down), shared by the animators:
// stroke stats, which end is the head, and parts (eyes, legs, wings, wheels) found with simple
// per-stroke heuristics (research/02 §2d, §3.7).

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function strokeLen(s) { let L = 0; for (let i = 1; i < s.length; i++) L += dist(s[i - 1], s[i]); return L; }
function bbox(s) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of s) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}
function shoelace(s) { let a = 0; for (let i = 0; i < s.length; i++) { const p = s[i], q = s[(i + 1) % s.length]; a += p.x * q.y - q.x * p.y; } return Math.abs(a) / 2; }

// Principal axis of all points: angle of the long direction, and the spread along / across it.
export function principalAxis(strokes) {
  let n = 0, mx = 0, my = 0;
  for (const s of strokes) for (const p of s) { mx += p.x; my += p.y; n++; }
  mx /= n; my /= n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const s of strokes) for (const p of s) { const dx = p.x - mx, dy = p.y - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { ang, mx, my };
}

export function analyse(strokes, W, H, { fish = false } = {}) {
  const diag = Math.hypot(W, H) || 1;
  const info = strokes.map((s, i) => {
    const b = bbox(s), len = strokeLen(s);
    const closed = s.length > 3 && (dist(s[0], s[s.length - 1]) < 0.2 * len || dist(s[0], s[s.length - 1]) < 0.1 * diag);
    const area = closed ? shoelace(s) : 0;
    const circ = closed && len > 0 ? (4 * Math.PI * area) / (len * len) : 0;
    const ext = Math.max(b.w, b.h);
    return { i, s, b, len, closed, area, circ, ext, frac: ext / (Math.max(W, H) || 1) };
  });
  // body: biggest closed stroke, else the stroke with the biggest box
  const body = [...info].sort((a, b) => (b.closed - a.closed) || (b.area - a.area) || (b.ext - a.ext))[0];
  const bb = body.b;
  const eyes = info.filter((t) => t !== body && (t.len < 0.05 * diag || (t.closed && t.frac < 0.16)) && t.b.cx > bb.x0 && t.b.cx < bb.x1 && t.b.cy > bb.y0 - 0.1 * H && t.b.cy < bb.y1);
  const wheels = info.filter((t) => t !== body && t.closed && t.circ > 0.6 && t.frac > 0.08 && t.frac < 0.55 && t.b.cy > bb.y0 + bb.h * 0.45);
  const rest = info.filter((t) => t !== body && !eyes.includes(t) && !wheels.includes(t));
  const legs = [], wings = [], tails = [];
  for (const t of rest) {
    if (t.closed && t.frac > 0.25) continue;
    // attach point: the end nearest the body box centre line; far end = the other one
    const a0 = t.s[0], a1 = t.s[t.s.length - 1];
    const dIn = (p) => Math.hypot(Math.max(bb.x0 - p.x, 0, p.x - bb.x1), Math.max(bb.y0 - p.y, 0, p.y - bb.y1));
    const [attach, far] = dIn(a0) <= dIn(a1) ? [a0, a1] : [a1, a0];
    const dx = far.x - attach.x, dy = far.y - attach.y, dl = Math.hypot(dx, dy) || 1;
    const part = { ...t, attach, far, dir: { x: dx / dl, y: dy / dl } };
    if (dy / dl > 0.6 && far.y > bb.cy && t.b.h > 0.12 * H) legs.push(part);
    else if (dy / dl < -0.3 && attach.y < bb.cy + bb.h * 0.2 && t.len > 0.18 * Math.max(W, H)) wings.push(part);
    else if (Math.abs(dx / dl) > 0.7) tails.push(part);
  }
  // drawn eyes only count in the upper part of the body (nostrils and spots sit lower)
  const realEyes = eyes.filter((e) => e.b.cy < bb.y0 + bb.h * 0.6 && e.frac < 0.1 && e.b.cx > bb.x0 + bb.w * 0.08 && e.b.cx < bb.x1 - bb.w * 0.08);
  // head side (−1 = left, +1 = right): drawn eyes vote strongest; then, for side-on animals, the
  // end that reaches higher (heads sit up, tails and rumps sit low); then a thin tail stroke
  let vote = 0;
  for (const e of realEyes) vote += Math.sign(e.b.cx - bb.cx) * 2.5;
  if (fish) {
    // fish tails stick up, so the upper-ink rule would pick the tail; use the tail fin's pinch
    // instead (22/24 on fresh Quick Draw fish vs ~9/22 with upper ink). Drawn eyes still win.
    vote += fishPinch(strokes, W) * 2;
  } else {
    // (thin horizontal strokes are as often trunks, necks or snouts as tails, so they don't vote)
    // heads carry more ink above the body line (face, ears, horns, trunk) than rumps do; legs are
    // excluded by only counting the upper half. 11/11 on hand-labelled Quick Draw animals.
    const ink = upperInk(strokes, W);
    if (Math.abs(ink.left - ink.right) > 0.08 * (ink.left + ink.right)) vote += ink.left > ink.right ? -3 : 3;
    if (!vote) vote = fishPinch(strokes, W);
  }
  const head = vote > 0 ? 1 : vote < 0 ? -1 : 0;
  return { info, body, eyes: realEyes, wheels, legs, wings, tails, head, bodyBox: bb, headBox: headBox(strokes, W, head) };
}

// ink length in the outer thirds, above the drawing's centre line
function upperInk(strokes, W) {
  let left = 0, right = 0;
  for (const s of strokes) for (let i = 1; i < s.length; i++) {
    const a = s[i - 1], b = s[i], m = (a.x + b.x) / 2, l = Math.hypot(b.x - a.x, b.y - a.y);
    if ((a.y + b.y) / 2 > 0) continue;
    if (m < -W / 6) left += l; else if (m > W / 6) right += l;
  }
  return { left, right };
}
// bounding box of the ink at the head end (outer 30%), for placing eyes on the actual head
function headBox(strokes, W, head) {
  if (!head) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) for (const p of s) {
    if (head * p.x < W * 0.2) continue;
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  return Number.isFinite(x0) ? { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 } : null;
}

// For fish-like outlines: the tail fin is wide at the very end and pinches (the peduncle) just
// inside it, while a head end rounds off. Compare (end thickness) / (thinnest just inside) at each
// end; the end that pinches more is the tail, so the head is the other one.
function fishPinch(strokes, W) {
  const bins = 16, top = new Array(bins).fill(Infinity), bot = new Array(bins).fill(-Infinity);
  for (const s of strokes) for (let i = 0; i < s.length; i++) {
    const a = s[Math.max(0, i - 1)], b = s[i];
    for (let t = 0; t <= 1; t += 0.1) {        // sample along segments so long straight edges fill every bin
      const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      const k = Math.max(0, Math.min(bins - 1, Math.floor(((x + W / 2) / (W || 1)) * bins)));
      top[k] = Math.min(top[k], y); bot[k] = Math.max(bot[k], y);
    }
  }
  const th = top.map((t, k) => (Number.isFinite(t) ? bot[k] - t : 0));
  const pinch = (o, ins) => (th[o] + 1) / (Math.min(...ins.map((k) => th[k])) + 1);
  const left = pinch(0, [1, 2, 3, 4, 5]), right = pinch(15, [14, 13, 12, 11, 10]);
  if (Math.abs(left - right) < 0.05) return 0;
  return left > right ? 1 : -1;      // pinch on the left → tail on the left → head on the right
}
