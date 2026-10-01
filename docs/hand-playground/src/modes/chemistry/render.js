// Canvas2D drawing: soft-shaded atom sprites, bonds, ghost bonds, open-valence dots,
// label pills, tray and hand cursors. The camera feed is a separate <video> underneath.
import { ELEMENTS } from './chem/elements.js';
import { freeAngle } from './scene.js';
import { CONFIG } from './config.js';

const FONT = '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", system-ui, sans-serif';

function mix(hex, to, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = p(hex), b = p(to);
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;
}

const sprites = new Map();
function sprite(el, dpr) {
  const key = `${el}@${dpr}`;
  if (sprites.has(key)) return sprites.get(key);
  const { r, color, ink } = ELEMENTS[el];
  const pad = 10, size = Math.ceil((r + pad) * 2 * dpr);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const cx = r + pad, cy = r + pad;
  g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 10; g.shadowOffsetY = 3;
  const grad = g.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
  grad.addColorStop(0, mix(color, '#ffffff', 0.38));
  grad.addColorStop(0.55, color);
  grad.addColorStop(1, mix(color, '#000000', 0.28));
  g.fillStyle = grad;
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  g.shadowColor = 'transparent';
  g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = 1;
  g.stroke();
  g.fillStyle = ink;
  g.font = `600 ${Math.round(r * (el.length > 1 ? 0.72 : 0.85))}px ${FONT}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(el, cx, cy + 1);
  const out = { canvas: c, half: r + pad };
  sprites.set(key, out);
  return out;
}

export class Renderer {
  constructor() {
    this.scale = new Map();       // atom id → current draw scale (springy)
    this.dpr = 1;
  }

  pop(atomId, amount = 0.14) { this.scale.set(atomId, (this.scale.get(atomId) || 1) + amount); }

  // Shelf goes under the hands; atoms, bonds and labels go on top of them.
  drawUnder(g, { interaction, scene, tray }) {
    this.ctx = g;
    const held = [...interaction.state.values()].map((st) => st.grab).filter(Boolean);
    const hot = held.some((id) => { const a = scene.atoms.get(id); return a && interaction.inTray(a.x, a.y); });
    this.drawTray(tray, hot);
  }

  draw(g, dpr, { scene, interaction, labels }) {
    this.ctx = g;
    if (dpr !== this.dpr) { this.dpr = dpr; sprites.clear(); }

    const hover = new Set(), held = new Set(), ghosts = [];
    for (const [, st] of interaction.state) {
      if (st.hover) hover.add(st.hover);
      if (st.grab) {
        held.add(st.grab);
        if (st.ghost) ghosts.push([st.grab, st.ghost]);
      }
    }

    // bonds
    g.lineCap = 'round';
    for (const b of scene.bonds) {
      const A = scene.atoms.get(b.a), B = scene.atoms.get(b.b);
      const ratio = Math.hypot(A.x - B.x, A.y - B.y) / scene.restLength(b);
      const t = Math.max(0, Math.min(1, (ratio - 1.15) / (CONFIG.breakStretch - 1.15)));
      g.strokeStyle = t > 0 ? mix('#A3A9B3', '#F2994A', t) : '#A3A9B3';
      this.bondLines(A, B, b.order, 3.2 * (1 - 0.45 * t));
    }
    // ghost bonds (release to connect)
    g.setLineDash([4, 6]);
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    for (const [a, b] of ghosts) {
      const A = scene.atoms.get(a), B = scene.atoms.get(b);
      if (A && B) this.bondLines(A, B, 1, 2.2);
    }
    g.setLineDash([]);

    // atoms
    for (const a of scene.atoms.values()) {
      const target = held.has(a.id) ? 1.08 : hover.has(a.id) ? 1.04 : 1;
      let s = this.scale.get(a.id) ?? 0.6;
      s += (target - s) * 0.22;
      this.scale.set(a.id, s);
      const sp = sprite(a.el, dpr);
      const half = sp.half * s;
      g.drawImage(sp.canvas, a.x - half, a.y - half, half * 2, half * 2);
      if (!labels.known.has(a.id)) this.openDots(scene, a, s);
    }
    for (const id of this.scale.keys()) if (!scene.atoms.has(id)) this.scale.delete(id);

    // label pills
    for (const pill of labels.pills.values()) if (pill.alpha > 0.02 && pill.text) this.drawPill(pill);

  }

  bondLines(A, B, order, width) {
    const g = this.ctx;
    const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1;
    const nx = -dy / d, ny = dx / d;
    const ra = ELEMENTS[A.el].r * 0.7, rb = ELEMENTS[B.el].r * 0.7;
    const x1 = A.x + (dx / d) * ra, y1 = A.y + (dy / d) * ra, x2 = B.x - (dx / d) * rb, y2 = B.y - (dy / d) * rb;
    const line = (o, dash) => {
      g.save();
      if (dash) g.setLineDash([5, 5]);
      g.lineWidth = width;
      g.beginPath(); g.moveTo(x1 + nx * o, y1 + ny * o); g.lineTo(x2 + nx * o, y2 + ny * o); g.stroke();
      g.restore();
    };
    const sp = 6;
    if (order === 1) line(0);
    else if (order === 1.5) { line(-sp / 2); line(sp / 2, true); }
    else if (order === 2) { line(-sp / 2); line(sp / 2); }
    else { line(-sp); line(0); line(sp); }
  }

  openDots(scene, atom, s) {
    const n = scene.openValence(atom.id);
    if (!n) return;
    const g = this.ctx, r = ELEMENTS[atom.el].r * s + 7;
    const base = freeAngle(scene, atom);
    const spread = scene.neighbours(atom.id).length ? 0.5 : (Math.PI * 2) / Math.max(n, 1);
    g.fillStyle = 'rgba(255,255,255,0.55)';
    for (let k = 0; k < n; k++) {
      const ang = base + (k - (n - 1) / 2) * spread;
      g.beginPath(); g.arc(atom.x + Math.cos(ang) * r, atom.y + Math.sin(ang) * r, 2.4, 0, Math.PI * 2); g.fill();
    }
  }

  drawTray(tray, hot) {
    const g = this.ctx;
    g.fillStyle = hot ? 'rgba(240,82,90,0.22)' : 'rgba(14,15,18,0.55)';
    g.strokeStyle = hot ? 'rgba(240,82,90,0.6)' : 'rgba(255,255,255,0.08)';
    g.lineWidth = 1;
    g.beginPath(); g.roundRect(tray.x, tray.y, tray.w, tray.h, 22); g.fill(); g.stroke();
    for (const w of tray.wells) {
      const sp = sprite(w.el, this.dpr);
      const k = w.r / ELEMENTS[w.el].r, half = sp.half * k;
      g.drawImage(sp.canvas, w.x - half, w.y - half, half * 2, half * 2);
    }
  }

  drawPill(p) {
    const g = this.ctx;
    g.save();
    g.globalAlpha = p.alpha;
    const s = 0.92 + 0.08 * p.alpha;
    g.translate(p.x, p.y); g.scale(s, s);
    const main = `600 16px ${FONT}`, sub = `400 14px ${FONT}`;
    g.font = main; const w1 = g.measureText(p.text).width;
    g.font = sub; const w2 = g.measureText(p.sub).width;
    const dot = g.measureText(' · ').width;
    const w = w1 + dot + w2 + 28, h = 32;
    g.fillStyle = 'rgba(22,24,29,0.82)';
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.beginPath(); g.roundRect(-w / 2, -h / 2, w, h, h / 2); g.fill(); g.stroke();
    g.textBaseline = 'middle';
    let x = -w / 2 + 14;
    g.font = main; g.fillStyle = p.kind === 'known' ? '#F2F3F5' : '#9BA1AB'; g.fillText(p.text, x, 1); x += w1;
    g.font = sub; g.fillStyle = '#9BA1AB'; g.fillText(' · ', x, 1); x += dot;
    g.fillStyle = p.kind === 'known' ? '#C9CED6' : '#7D838D'; g.fillText(p.sub, x, 1);
    g.restore();
  }
}
