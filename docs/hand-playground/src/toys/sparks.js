// Fingertips throw sparks when they move fast. Pinch for a firework.
import { Particles, rand } from './particles.js';

const HUES = [340, 30, 55, 160, 210];

export class Sparks {
  name = 'Sparks';
  hint = 'Wave your fingers to throw sparks · pinch for a firework';

  constructor({ sfx }) {
    this.sfx = sfx;
    this.fx = new Particles(1400);
  }

  update(dt, hands) {
    for (const hand of hands) {
      hand.tips.forEach((t, i) => {
        const speed = Math.hypot(t.vx, t.vy);
        const n = Math.min(6, Math.floor(speed / 350));
        for (let k = 0; k < n; k++) {
          this.fx.add({
            x: t.x, y: t.y, vx: t.vx * 0.15 + rand(-60, 60), vy: t.vy * 0.15 + rand(-60, 60),
            g: 240, drag: 0.97, decay: rand(1.1, 1.8), size: rand(1.5, 3.2),
            color: `hsl(${(hand.pts ? HUES[i] : 45) + rand(-15, 15)},100%,${rand(62, 80)}%)`,
          });
        }
      });
      if (hand.justDown) {
        const hue = rand(0, 360);
        this.fx.burst(hand.pinch.x, hand.pinch.y, 70, () => {
          const a = rand(0, Math.PI * 2), sp = rand(120, 520);
          return { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 220, drag: 0.965, decay: rand(0.6, 1.1), size: rand(1.8, 3.6), color: `hsl(${hue + rand(-40, 40)},100%,72%)` };
        });
        this.sfx.discover(4);
      }
    }
    this.fx.update(dt);
  }

  draw(g) {}
  drawTop(g) { this.fx.draw(g, true); }
}
