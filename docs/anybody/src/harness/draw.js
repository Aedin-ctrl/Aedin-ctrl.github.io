// Canvas overlay: box, skeleton, points, and the hover label.
//
// Labelling every point at once was the original ask and it does not survive
// contact with the data: eleven of the 33 body landmarks sit inside the head,
// and the face mesh adds 478 more. At webcam resolution that is a grey smear.
// So: colour and shape carry the always-on information, hovering names a single
// point, and the table beside the canvas lists all of them exactly.

import { BODY_EDGES, HAND_EDGES, sideOf } from '../schema.js';

const EDGES = { body: BODY_EDGES, leftHand: HAND_EDGES, rightHand: HAND_EDGES };

/**
 * Read the theme colours as something canvas can actually use.
 *
 * getComputedStyle().getPropertyValue('--x') returns the custom property's
 * *unresolved* token. For a token defined with light-dark() that is the literal
 * string "light-dark(#5a5a62, #b0b0ba)", which every canvas colour parser
 * rejects — and createLinearGradient().addColorStop() throws on it, taking the
 * whole frame down with it.
 *
 * So resolve each one through a probe element's `color`, which the engine
 * computes down to an rgb() triple regardless of how it was written.
 */
export function readTheme(root = document.documentElement) {
  const probe = document.createElement('span');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.position = 'absolute';
  probe.style.opacity = '0';
  probe.style.pointerEvents = 'none';
  (document.body ?? root).append(probe);

  const v = (name, fallback) => {
    probe.style.color = fallback;
    probe.style.color = `var(${name}, ${fallback})`;
    const c = getComputedStyle(probe).color;
    // An unparseable value leaves `color` at the fallback we set first.
    return c && c !== 'rgba(0, 0, 0, 0)' ? c : fallback;
  };

  const theme = {
    left: v('--left', '#e8903a'),
    right: v('--right', '#3aa0e8'),
    centre: v('--centre', '#888888'),
    accent: v('--accent', '#5fd0a0'),
    warn: v('--warn', '#ffb267'),
    ghost: v('--ghost', '#b06cf0'),
    ink: v('--ink', '#eeeeee'),
    panel: v('--panel', '#1c1c20'),
  };
  probe.remove();
  return theme;
}

const colourFor = (p, theme) => {
  if (p.part === 'leftHand') return theme.left;
  if (p.part === 'rightHand') return theme.right;
  if (p.part === 'face') return theme.centre;
  const side = sideOf(p.name ?? '');
  return side === 'left' ? theme.left : side === 'right' ? theme.right : theme.centre;
};

/** Size the backing store to the element's real pixels. Returns the scale used. */
export function fitCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return { w: rect.width, h: rect.height, dpr };
}

/**
 * @param ctx 2D context
 * @param result an Anybody result (normalised coordinates)
 * @param opts { w, h, dpr, theme, show, minScore, hover }
 */
export function drawResult(ctx, result, opts) {
  const { w, h, dpr, theme, show, minScore = 0.3, hover = null } = opts;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (!result) return;

  const X = (p) => p.x * w;
  const Y = (p) => p.y * h;

  // --- face mesh, drawn first and faintly so it never competes with the body
  if (show.face && result.parts.face) {
    ctx.fillStyle = theme.centre;
    ctx.globalAlpha = 0.5;
    for (const p of result.parts.face) {
      if (p.score < minScore) continue;
      ctx.fillRect(X(p) - 0.5, Y(p) - 0.5, 1.2, 1.2);
    }
    ctx.globalAlpha = 1;
  }

  // --- the runner-up rotation, drawn as a ghost.
  // The model cannot tell you when it is confidently wrong, and nor can this
  // harness. What it CAN do is show you the other pose the model was equally
  // happy with. When the ghost sits on the subject the two agree and there is
  // nothing to worry about; when it sprawls across empty floor, you can see at
  // a glance that the confidence number is meaningless on this frame.
  if (show.ghost && result.rival?.body?.length) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = theme.ghost;
    ctx.lineWidth = 1.8;
    ctx.setLineDash([4, 3]);
    const g = result.rival.body;
    for (const [a, b] of BODY_EDGES) {
      const pa = g[a];
      const pb = g[b];
      if (!pa || !pb || pa.score < minScore || pb.score < minScore) continue;
      ctx.beginPath();
      ctx.moveTo(X(pa), Y(pa));
      ctx.lineTo(X(pb), Y(pb));
      ctx.stroke();
    }
    ctx.restore();
  }

  // --- skeleton
  if (show.skeleton) {
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    for (const [part, edges] of Object.entries(EDGES)) {
      const pts = result.parts[part];
      if (!pts) continue;
      for (const [a, b] of edges) {
        const pa = pts[a];
        const pb = pts[b];
        if (!pa || !pb || pa.score < minScore || pb.score < minScore) continue;
        // An edge is drawn in its own side's colour; a cross-body edge (shoulder
        // to shoulder, hip to hip) gets a gradient so neither side claims it.
        const ca = colourFor(pa, theme);
        const cb = colourFor(pb, theme);
        if (ca === cb) {
          ctx.strokeStyle = ca;
        } else {
          try {
            const g = ctx.createLinearGradient(X(pa), Y(pa), X(pb), Y(pb));
            g.addColorStop(0, ca);
            g.addColorStop(1, cb);
            ctx.strokeStyle = g;
          } catch {
            ctx.strokeStyle = ca; // a colour we cannot parse is not worth a dead frame
          }
        }
        ctx.beginPath();
        ctx.moveTo(X(pa), Y(pa));
        ctx.lineTo(X(pb), Y(pb));
        ctx.stroke();
      }
    }
  }

  // --- points. Radius tracks confidence, so a weak joint looks weak.
  if (show.points) {
    for (const p of result.points) {
      if (p.part === 'face') continue;
      if (p.score < minScore) continue;
      const r = 2.2 + 2.2 * Math.min(1, Math.max(0, p.score));
      ctx.fillStyle = colourFor(p, theme);
      ctx.beginPath();
      ctx.arc(X(p), Y(p), r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // --- bounding box
  if (show.box && result.box) {
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(result.box.x * w, result.box.y * h, result.box.w * w, result.box.h * h);
    ctx.setLineDash([]);
  }

  // --- hover label, drawn last so it sits above everything
  if (hover) {
    const x = X(hover);
    const y = Y(hover);
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.stroke();

    const label = `${hover.name}  ${hover.score.toFixed(2)}`;
    ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
    const tw = ctx.measureText(label).width;
    // Flip the tag to whichever side keeps it inside the frame.
    const flip = x + tw + 22 > w;
    const bx = flip ? x - tw - 20 : x + 13;
    ctx.fillStyle = theme.panel;
    ctx.globalAlpha = 0.92;
    ctx.fillRect(bx - 5, y - 11, tw + 10, 21);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 1;
    ctx.strokeRect(bx - 5, y - 11, tw + 10, 21);
    ctx.fillStyle = theme.ink;
    ctx.fillText(label, bx, y + 4);
  }
}

/**
 * Nearest drawn point to a pointer position, or null if nothing is close.
 * Works in CSS pixels; `within` is a radius in the same units.
 */
export function pick(result, px, py, w, h, { minScore = 0.3, within = 18, includeFace = false } = {}) {
  if (!result) return null;
  let best = null;
  let bestD = within * within;
  for (const p of result.points) {
    if (!includeFace && p.part === 'face') continue;
    if (p.score < minScore) continue;
    const dx = p.x * w - px;
    const dy = p.y * h - py;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}
