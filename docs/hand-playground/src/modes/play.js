// Play tab: a row of toys (bubbles, balls, paint, strings, sparks, harp, fluid).
import { Bubbles } from '../toys/bubbles.js';
import { Balls } from '../toys/balls.js';
import { Paint } from '../toys/paint.js';
import { Strings } from '../toys/strings.js';
import { Sparks } from '../toys/sparks.js';
import { Harp } from '../toys/harp.js';
import { Fluid } from '../toys/fluid.js';
import { Lightning } from '../toys/lightning.js';
import { Galaxy } from '../toys/galaxy.js';
import { Spacetime } from '../toys/spacetime.js';
import { Kaleidoscope } from '../toys/kaleidoscope.js';
import { Magnet } from '../toys/magnet.js';
import { Pond } from '../toys/pond.js';
import { Liquid } from '../toys/liquid.js';
import { Warp } from '../toys/warp.js';
import { Lasers } from '../toys/lasers.js';
import { Constellation } from '../toys/constellation.js';
import { Ribbons } from '../toys/ribbons.js';
import { el } from './ui.js';

const TOYS = [Bubbles, Balls, Paint, Strings, Sparks, Harp, Fluid, Lightning, Galaxy, Spacetime, Kaleidoscope, Magnet, Pond, Liquid, Warp, Lasers, Constellation, Ribbons];
const NAMES = ['Bubbles', 'Balls', 'Paint', 'Strings', 'Sparks', 'Harp', 'Fluid', 'Lightning', 'Galaxy', 'Spacetime', 'Kaleido', 'Magnet', 'Pond', 'Liquid', 'Warp', 'Lasers', 'Stars', 'Ribbons'];   // no need to build every toy just for its name

export class PlayMode {
  name = 'Play';

  constructor(env) {
    this.env = env;
    this.buttons = TOYS.map((T, i) => el('button', { 'data-hand': '', onclick: () => { this.pick(i); env.sfx.click(); } },
      i < 9 ? [NAMES[i], el('kbd', {}, String(i + 1))] : [NAMES[i]]));
    this.panel = el('div', { class: 'mode-panel' }, [el('div', { class: 'toy-grid' }, this.buttons)]);
    let saved = 0;
    try { saved = Number(localStorage.getItem('hp-toy')) || 0; } catch {}
    this.pick(Math.min(saved, TOYS.length - 1), true);
  }

  get hint() { return this.toy.hint; }

  pick(i, quiet) {
    this.toy = new TOYS[i](this.env);
    this.buttons.forEach((b, k) => b.classList.toggle('on', k === i));
    try { localStorage.setItem('hp-toy', String(i)); } catch {}
    if (!quiet) this.env.showHint(this.toy.hint);
  }

  onKey(e) {
    const n = Number(e.key);
    if (n >= 1 && n <= Math.min(9, TOYS.length) && !e.metaKey && !e.ctrlKey) { this.pick(n - 1); return true; }
    return false;
  }

  update(dt, hands) { this.toy.update(dt, hands); }
  draw(g) { this.toy.draw(g); }
  drawTop(g) { this.toy.drawTop?.(g); }
}
