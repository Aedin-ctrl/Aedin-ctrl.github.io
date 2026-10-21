// Placeholder for a tab that's still being built.
import { el } from './ui.js';

export class SoonMode {
  constructor(name, blurb) {
    this.name = name;
    this.hint = blurb;
    this.panel = el('div', { class: 'mode-panel' }, [el('div', { class: 'soon' }, [el('div', { class: 'soon-title' }, name), el('div', {}, 'Coming next — ' + blurb)])]);
  }
  update() {}
  draw() {}
}
