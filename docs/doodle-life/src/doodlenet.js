// DoodleNet (ml5.js, MIT, trained on all 345 Quick, Draw! classes) run in plain JS, with a
// rasteriser that reproduces how Google drew the dataset's 28×28 bitmaps (line 16 px at 256,
// padding 16, centred). Both pieces are from research/01 (verified: 200/200 against tfjs,
// 0.997 pixel correlation with the official bitmaps).

export async function loadDoodleNet(base = new URL('../models/doodlenet/', import.meta.url)) {
  const read = async (n, kind) => { const u = new URL(n, base); if (u.protocol === 'file:') { const { readFile } = await import('node:fs/promises'); const b = await readFile(u); return kind === 'json' ? JSON.parse(b) : kind === 'text' ? b.toString() : b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); } const r = await fetch(u); return kind === 'json' ? r.json() : kind === 'text' ? r.text() : r.arrayBuffer(); };
  const [mj, bin, names] = await Promise.all([read('model.json', 'json'), read('group1-shard1of1.bin', 'bin'), read('class_names.txt', 'text')]);
  const f32 = new Float32Array(bin), W = {};
  let off = 0;
  for (const g of mj.weightsManifest) for (const w of g.weights) { const n = w.shape.reduce((a, b) => a * b, 1); W[w.name] = f32.subarray(off, off + n); off += n; }
  return { W, classes: names.trim().split(/\r?\n/).map((s) => s.replace(/_/g, ' ')) };
}

function conv3same(inp, H, Wd, Cin, k, b, Cout) {
  const out = new Float32Array(H * Wd * Cout);
  for (let y = 0; y < H; y++) for (let x = 0; x < Wd; x++) {
    const o = (y * Wd + x) * Cout; for (let co = 0; co < Cout; co++) out[o + co] = b[co];
    for (let ky = 0; ky < 3; ky++) { const iy = y + ky - 1; if (iy < 0 || iy >= H) continue;
      for (let kx = 0; kx < 3; kx++) { const ix = x + kx - 1; if (ix < 0 || ix >= Wd) continue;
        const ib = (iy * Wd + ix) * Cin, kb = (ky * 3 + kx) * Cin * Cout;
        for (let ci = 0; ci < Cin; ci++) { const v = inp[ib + ci]; if (v === 0) continue; const kr = kb + ci * Cout;
          for (let co = 0; co < Cout; co++) out[o + co] += v * k[kr + co]; } } }
    for (let co = 0; co < Cout; co++) if (out[o + co] < 0) out[o + co] = 0;
  }
  return out;
}
function pool2(inp, H, Wd, C) {
  const h = H >> 1, w = Wd >> 1, out = new Float32Array(h * w * C);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < C; c++) {
    const i = (r, s) => inp[((2 * y + r) * Wd + 2 * x + s) * C + c];
    out[(y * w + x) * C + c] = Math.max(i(0, 0), i(0, 1), i(1, 0), i(1, 1));
  }
  return [out, h, w];
}
function dense(inp, k, b, nIn, nOut, tanh) {
  const out = Float32Array.from(b);
  for (let i = 0; i < nIn; i++) { const v = inp[i]; if (v === 0) continue; const r = i * nOut; for (let j = 0; j < nOut; j++) out[j] += v * k[r + j]; }
  if (tanh) for (let j = 0; j < nOut; j++) out[j] = Math.tanh(out[j]);
  return out;
}
export function logits(W, x) {
  let t = x, H = 28, Wd = 28, C = 1;
  const L = (n, cin, cout) => { t = conv3same(t, H, Wd, cin, W[n + '/kernel'], W[n + '/bias'], cout); C = cout; };
  L('conv2d', 1, 16); L('conv2d_1', 16, 16); [t, H, Wd] = pool2(t, H, Wd, C);
  L('conv2d_2', 16, 32); L('conv2d_3', 32, 32); [t, H, Wd] = pool2(t, H, Wd, C);
  L('conv2d_4', 32, 64); L('conv2d_5', 64, 64); [t, H, Wd] = pool2(t, H, Wd, C);
  t = dense(t, W['dense/kernel'], W['dense/bias'], 576, 512, true);
  return dense(t, W['dense_1/kernel'], W['dense_1/bias'], 512, 345, false);
}

// strokes [[{x, y}]] in any space → Quick Draw style 28×28, ink = 1
export function rasterizeQD(strokes, side = 28) {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const s of strokes) for (const p of s) { if (p.x < minx) minx = p.x; if (p.x > maxx) maxx = p.x; if (p.y < miny) miny = p.y; if (p.y > maxy) maxy = p.y; }
  const sc = 255 / Math.max(maxx - minx, maxy - miny, 1e-6);
  // decimate to ≥ 2 units apart in 255-space so long scribbles stay cheap
  const pts = strokes.map((s) => { const o = []; for (const p of s) { const q = { x: (p.x - minx) * sc, y: (p.y - miny) * sc }; const l = o[o.length - 1]; if (!l || Math.hypot(q.x - l.x, q.y - l.y) >= 2) o.push(q); } if (o.length === 1) o.push({ ...o[0] }); return o; });
  const LINE = 16, PAD = 16, TP = PAD * 2 + LINE, scale = side / (256 + TP);
  let bx = 0, by = 0;
  for (const s of pts) for (const p of s) { if (p.x > bx) bx = p.x; if (p.y > by) by = p.y; }
  const ox = (256 - bx) / 2 + TP / 2, oy = (256 - by) / 2 + TP / 2, r = (LINE * scale) / 2;
  const segs = [];
  for (const s of pts) for (let i = 0; i < Math.max(1, s.length - 1); i++) { const j = Math.min(i + 1, s.length - 1); segs.push([(s[i].x + ox) * scale, (s[i].y + oy) * scale, (s[j].x + ox) * scale, (s[j].y + oy) * scale]); }
  const out = new Float32Array(side * side);
  for (let py = 0; py < side; py++) for (let px = 0; px < side; px++) {
    const cx = px + 0.5, cy = py + 0.5; let d2 = Infinity;
    for (const [x1, y1, x2, y2] of segs) {
      const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy;
      let t = L ? ((cx - x1) * dx + (cy - y1) * dy) / L : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = x1 + t * dx - cx, ey = y1 + t * dy - cy, e = ex * ex + ey * ey; if (e < d2) d2 = e;
    }
    const v = r + 0.5 - Math.sqrt(d2); out[py * side + px] = v <= 0 ? 0 : v >= 1 ? 1 : v;
  }
  return out;
}

// → [{ label, p }] over all 345 classes, best first
export function classifyAll(model, strokes) {
  const l = logits(model.W, rasterizeQD(strokes));
  let m = -Infinity; for (const v of l) m = Math.max(m, v);
  let s = 0; const e = Array.from(l, (v) => { const x = Math.exp(v - m); s += x; return x; });
  return e.map((v, i) => ({ label: model.classes[i], p: v / s })).sort((a, b) => b.p - a.p);
}
