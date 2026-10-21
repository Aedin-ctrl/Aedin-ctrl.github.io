// Half-res persistent canvas that fades each frame — for glowing trails. Created lazily (no DOM in tests).
export class Trail {
  constructor(size, k = 0.5) { this.size = size; this.k = k; this.c = null; }
  begin(fade = 0.12) {
    this.c ??= document.createElement('canvas');
    this.o ??= this.c.getContext('2d');
    const { w, h } = this.size(), W = Math.ceil(w * this.k), H = Math.ceil(h * this.k), o = this.o;
    if (this.c.width !== W || this.c.height !== H) { this.c.width = W; this.c.height = H; }
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.globalCompositeOperation = 'destination-out';
    o.fillStyle = `rgba(0,0,0,${Math.max(0.06, fade)})`; o.fillRect(0, 0, W, H);      // ≥0.06 or 8-bit alpha never clears
    o.globalCompositeOperation = 'lighter';
    o.setTransform(this.k, 0, 0, this.k, 0, 0);
    return o;
  }
  blit(g) { const { w, h } = this.size(); g.save(); g.globalCompositeOperation = 'lighter'; g.drawImage(this.c, 0, 0, w, h); g.restore(); }
}
