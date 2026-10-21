// Tiny particle pool shared by the toys.
export class Particles {
  constructor(max = 800) { this.list = []; this.max = max; }
  add(p) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({ life: 1, decay: 1, g: 0, drag: 0.98, size: 3, ...p });
  }
  burst(x, y, n, make) { for (let i = 0; i < n; i++) this.add({ x, y, ...make(i) }); }
  update(dt) {
    for (const p of this.list) {
      p.vy += p.g * dt;
      p.vx *= p.drag; p.vy *= p.drag;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.life -= p.decay * dt;
    }
    this.list = this.list.filter((p) => p.life > 0);
  }
  draw(g, glow = false) {
    g.save();
    if (glow) g.globalCompositeOperation = 'lighter';
    for (const p of this.list) {
      g.globalAlpha = Math.max(0, Math.min(1, p.life));
      g.fillStyle = p.color;
      g.beginPath(); g.arc(p.x, p.y, p.size * (glow ? 0.6 + p.life * 0.6 : 1), 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }
}

export const rand = (a, b) => a + Math.random() * (b - a);
