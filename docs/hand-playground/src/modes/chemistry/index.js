// Chemistry tab: the molecule builder (pinch atoms off the shelf, bond, tap bonds to raise order,
// yank to break). Recognized molecules get a label; first discoveries get a card.
import { Scene } from './scene.js';
import { Interaction, trayLayout } from './interact.js';
import { relax } from './physics.js';
import { Labels } from './labels.js';
import { Renderer } from './render.js';
import { TRAY, ELEMENTS } from './chem/elements.js';
import { el } from '../ui.js';
import { ENTRIES } from './chem/recognize.js';

export class ChemistryMode {
  name = 'Chemistry';
  hint = 'Pinch an atom off the shelf · drop it near another to bond · quick-pinch a bond to double it · yank to break';

  constructor({ sfx, size, dpr }) {
    this.sfx = sfx; this.size = size; this.dpr = dpr;
    this.scene = new Scene();
    this.renderer = new Renderer();
    this.undoStack = [];
    const step = (atom) => sfx.stepForMass(ELEMENTS[atom.el].mass);
    this.interaction = new Interaction(this.scene, (type, x) => {
      switch (type) {
        case 'change': this.pushUndo(); break;
        case 'spawn': case 'grab': sfx.pop(step(x)); this.renderer.pop(x.id, 0.1); break;
        case 'release': sfx.release(step(x)); break;
        case 'bond': sfx.bond(1, step(x.atom)); this.renderer.pop(x.atom.id); break;
        case 'order': sfx.bond(x.order); this.renderer.pop(x.bond.a, 0.08); this.renderer.pop(x.bond.b, 0.08); break;
        case 'order-blocked': sfx.click(); break;
        case 'break': sfx.snap(); break;
        case 'trash': sfx.release(0); break;
      }
    });
    this.labels = new Labels((res, isNew, ids) => {
      if (res.kind !== 'known') return;
      ids.forEach((id) => this.renderer.pop(id, 0.1));
      if (isNew) { sfx.discover(res.entry.atomCount); this.showCard(res.entry); } else sfx.collect();
      this.updateCount();
    });

    // panel: count chip + discovery card + tools
    this.count = el('button', { class: 'chip count', 'data-hand': '', title: 'Your molecule collection', onclick: () => this.toggleDex() });
    this.dex = el('div', { class: 'dex', hidden: '' });
    this.card = el('div', { class: 'card', hidden: '' }, [
      el('div', { class: 'card-kicker' }, 'New molecule'),
      el('div', { class: 'card-title' }, [el('span', { class: 'card-formula' }), ' ', el('span', { class: 'card-name' })]),
      el('div', { class: 'card-fact' }),
    ]);
    const btn = (label, title, fn) => el('button', { 'data-hand': '', title, onclick: fn }, label);
    this.panel = el('div', { class: 'mode-panel' }, [
      this.count, this.card, this.dex,
      el('div', { class: 'tools' }, [
        btn('Fill H', 'Fill open bonds with hydrogen (H)', () => this.fill()),
        btn('Undo', 'Undo (⌘Z)', () => this.undo()),
        btn('Clear', 'Clear everything', () => this.clear()),
      ]),
    ]);
    this.updateCount();
  }

  pushUndo() { this.undoStack.push(this.scene.snapshot()); if (this.undoStack.length > 50) this.undoStack.shift(); }
  undo() { if (this.undoStack.length) { this.scene.restore(this.undoStack.pop()); this.sfx.release(3); } }
  fill() { this.pushUndo(); if (this.scene.fillHydrogens()) this.sfx.bond(1, 7); else this.undoStack.pop(); }
  clear() {
    if (!this.scene.atoms.size) return;
    this.pushUndo();
    this.scene.restore(JSON.stringify({ atoms: [], bonds: [], nextId: this.scene.nextId }));
    this.sfx.release(0);
  }

  // The Molecule-dex: every molecule, easiest first. Found ones show their name; the rest are targets.
  toggleDex() {
    if (!this.dex.hidden) { this.dex.hidden = true; return; }
    this.dex.textContent = '';
    const close = el('button', { class: 'dex-close', 'data-hand': '', onclick: () => (this.dex.hidden = true) }, 'Close');
    const grid = el('div', { class: 'dex-grid' });
    for (const e of [...ENTRIES].sort((a, b) => a.atomCount - b.atomCount)) {
      const got = this.labels.discovered.has(e.id);
      grid.append(el('div', { class: `dex-tile${got ? ' got' : ''}`, title: got ? e.fact || e.name : `${e.atomCount} atoms` }, [
        el('div', { class: 'dex-formula' }, e.formula),
        el('div', { class: 'dex-name' }, got ? e.name : `${e.atomCount} atoms`),
      ]));
    }
    this.dex.append(el('div', { class: 'dex-head' }, [el('div', {}, `${this.labels.discovered.size} of ${ENTRIES.length} found`), close]), grid);
    this.dex.hidden = false;
    this.sfx.click();
  }

  updateCount() { this.count.textContent = `${this.labels.discovered.size} / ${this.labels.total} molecules`; }

  showCard(entry) {
    const c = this.card;
    c.querySelector('.card-formula').textContent = entry.formula;
    c.querySelector('.card-name').textContent = entry.name;
    c.querySelector('.card-fact').textContent = entry.fact || '';
    c.hidden = false; c.classList.remove('out');
    document.getElementById('hint')?.classList.add('gone');
    c.style.animation = 'none'; void c.offsetWidth; c.style.animation = '';
    clearTimeout(this.cardTimer);
    this.cardTimer = setTimeout(() => { c.classList.add('out'); setTimeout(() => (c.hidden = true), 320); }, 4200);
  }

  onKey(e) {
    if (e.key === 'Escape' && !this.dex.hidden) { this.dex.hidden = true; return true; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); this.undo(); return true; }
    if (e.metaKey || e.ctrlKey || e.altKey) return false;
    const k = e.key.toLowerCase();
    if (k === 'h') { this.fill(); return true; }
    if (k === 'backspace' || k === 'delete') {
      const hovered = [...this.interaction.state.values()].map((s) => s.hover).find(Boolean);
      if (hovered) { this.pushUndo(); this.scene.removeAtom(hovered); this.sfx.release(0); }
      return true;
    }
    return false;
  }

  update(dt, hands, now) {
    const { w, h } = this.size();
    this.tray = trayLayout(w, h, TRAY);
    this.interaction.tray = this.tray;
    const pointers = hands.map((hd) => ({ id: hd.id, kind: hd.kind, x: hd.pinch.x, y: hd.pinch.y, down: hd.down }));
    this.interaction.update(pointers, now);
    relax(this.scene, w, h);
    this.labels.update(this.scene, now);
    this.sfx.tension(this.interaction.tension);
  }

  exit() { this.sfx.tension(0); }

  draw(g) { this.renderer.drawUnder(g, this); }
  drawTop(g) { this.renderer.draw(g, this.dpr(), this); }
}
