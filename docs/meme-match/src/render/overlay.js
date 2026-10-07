// The mask drawn on a meme picture. Three sources, best first:
//   1. meme.exemplar (your recorded expression, face-frame units) fitted to meme.anchors.face,
//   2. meme.overlay (image-pixel points: detected, annotated or placed from anchors),
//   3. nothing.
// The picture is shown with object-fit: contain inside rect.
import { drawBody } from './mask.js';
import { FACE_ANCHORS, fitAffine } from './fit.js';

export function memeBodyPx(meme) {
  const ov = meme.overlay;
  if (meme.exemplar?.face && meme.anchors?.face) {
    const f = fitAffine(FACE_ANCHORS.map((i) => meme.exemplar.face[i]), meme.anchors.face);
    const [w, h] = meme.anchors.size || [512, 512];
    return { w, h, face: meme.exemplar.face.map(f), hands: (meme.exemplar.hands || []).map((hh) => hh.map(f)), pose: null };
  }
  return ov ? { w: ov.w, h: ov.h, face: ov.face, hands: ov.hands || [], pose: ov.pose } : null;
}

export function overlayToBody(ov, rect) {
  const s = Math.min(rect.w / ov.w, rect.h / ov.h);
  const ox = rect.x + (rect.w - ov.w * s) / 2, oy = rect.y + (rect.h - ov.h * s) / 2;
  const P = (p) => ({ x: ox + p[0] * s, y: oy + p[1] * s, v: p[2] ?? 1 });
  return { face: ov.face ? ov.face.map(P) : null, hands: (ov.hands || []).map((h) => h.map(P)), pose: ov.pose ? ov.pose.map(P) : null };
}

export function drawMemeOverlay(g, meme, img, rect, colors, opts) {
  const px = memeBodyPx(meme);
  if (!px) return;
  drawBody(g, overlayToBody(px, rect), colors, { outline: 4, ...opts });
}
