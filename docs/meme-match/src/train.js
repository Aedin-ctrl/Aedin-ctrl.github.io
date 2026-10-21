// "Train on your face": a guided session that shows each target of the mode for a few seconds,
// twice in shuffled order, after a short neutral face. The landmarks become this person's own
// templates (src/match/session.js) and mask expressions (src/features/exemplar.js), stored in the
// browser. Nothing is uploaded; on the dev server the result can also be saved as the defaults.
import { NeutralCapture } from './features/calib.js';
import { extract } from './features/extract.js';
import { exemplarFrom } from './features/exemplar.js';
import { buildSession } from './match/session.js';
import { calibToJSON, gzipJSON, obsToJSON } from './track/record.js';
import { memePictureURL } from './render/picture.js';

const GET = 1300, HOLD = 1700, NEUTRAL = 1500;
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

export class Trainer {
  // ui: { panel, step, img, title, cue, bar, barWrap, result, summary }
  constructor({ mode, memes, ui, onDone }) {
    Object.assign(this, { mode, memes, ui, onDone });
    this.steps = [{ kind: 'neutral' }, ...shuffle(memes).map((m) => ({ kind: 'target', meme: m, round: 0 })), ...shuffle(memes).map((m) => ({ kind: 'target', meme: m, round: 1 }))];
    this.i = -1; this.obs = this.steps.map(() => []); this.done = false;
    this.total = NEUTRAL * 2 + memes.length * 2 * (GET + HOLD);
  }
  get running() { return this.i >= 0 && !this.done; }
  start(now) { const u = this.ui; u.panel.hidden = false; u.result.hidden = true; u.barWrap.hidden = false; u.stop.hidden = false; this.next(now); }
  stop() { this.done = true; this.ui.panel.hidden = true; }

  next(now) {
    this.i++;
    if (this.i >= this.steps.length) { this.finish(); return; }
    const s = this.steps[this.i];
    s.start = now; s.capFrom = now + (s.kind === 'neutral' ? NEUTRAL : GET); s.end = s.capFrom + (s.kind === 'neutral' ? NEUTRAL : HOLD);
    const u = this.ui;
    if (s.kind === 'neutral') {
      u.img.removeAttribute('src'); u.img.hidden = true;
      u.title.textContent = 'Relax your face';
      u.cue.textContent = 'Hands down, mouth closed, look at the camera. This is your neutral face.';
    } else {
      u.img.hidden = false;
      u.title.textContent = s.meme.title;
      u.img.src = memePictureURL(s.meme);
      u.cue.textContent = s.meme.cue;
    }
  }
  feed(obs, now) {
    const s = this.steps[this.i];
    if (!this.running || !s || now < s.capFrom || now > s.end) return;
    if (obs.face || obs.pose) this.obs[this.i].push(obs);
  }
  tick(now) {
    if (!this.running) return;
    const s = this.steps[this.i];
    if (now >= s.end) { this.next(now); return; }
    const capturing = now >= s.capFrom;
    const p = capturing ? (now - s.capFrom) / (s.end - s.capFrom) : (now - s.start) / (s.capFrom - s.start);
    this.ui.bar.style.width = `${Math.round(p * 100)}%`;
    this.ui.barWrap.classList.toggle('get', !capturing);
    const targets = this.steps.length - 1;
    this.ui.step.textContent = s.kind === 'neutral' ? 'Neutral face' : `${this.i} of ${targets} · ${capturing ? 'hold it' : 'get ready'}`;
  }

  finish() {
    this.done = true;
    const cap = new NeutralCapture();
    for (const o of this.obs[0]) cap.add(o);
    const calib = cap.finish();
    if (!calib) { this.result('Your face wasn’t in view for the neutral part. Try again in better light, facing the camera.', null); return; }
    const neutral = this.obs[0].map((o) => extract(o, calib));
    const byId = new Map(this.memes.map((m) => [m.id, { id: m.id, rounds: [[], []], obs: [] }]));
    this.steps.forEach((s, k) => {
      if (s.kind !== 'target') return;
      const t = byId.get(s.meme.id);
      t.rounds[s.round].push(...this.obs[k].map((o) => extract(o, calib)));
      t.obs.push(...this.obs[k]);
    });
    const missing = [...byId.values()].filter((t) => t.rounds.flat().length < 8).map((t) => this.memes.find((m) => m.id === t.id).title);
    if (missing.length > this.memes.length / 3) { this.result(`Too many were missed (${missing.join(', ')}). Keep your face in view and try again.`, null); return; }
    const targets = [...byId.values()].filter((t) => t.rounds[0].length && t.rounds[1].length);
    const { templates, report } = buildSession({ targets, neutral, source: `trained ${new Date().toISOString().slice(0, 16)}` });
    const exemplars = Object.fromEntries([...byId.values()].map((t) => [t.id, exemplarFrom(t.obs, calib)]).filter(([, e]) => e));
    const personal = { at: Date.now(), on: true, calib: calibToJSON(calib), templates, exemplars, report: { self: report.self.overall, cross: report.cross?.overall ?? null, per: report.cross?.per ?? report.self.per } };
    this.recordings = { calib, neutral: this.obs[0], targets: [...byId.values()].map((t) => ({ id: t.id, obs: t.obs })) };
    const title = (id) => this.memes.find((m) => m.id === id)?.title ?? id;
    const per = personal.report.per;
    const weak = Object.entries(per).filter(([, v]) => v < 0.7).sort((a, b) => a[1] - b[1]);
    const lines = [
      `Learned ${targets.length} from your face. Checking one round against the other, it picked the right one <b>${Math.round(100 * (personal.report.cross ?? personal.report.self))}%</b> of the time.`,
      weak.length ? `Still easy to mix up: ${weak.slice(0, 4).map(([id, v]) => `${title(id)} (${Math.round(v * 100)}%)`).join(', ')}. Exaggerate those a bit, or train again.` : 'Every one came out clearly different. 🎉',
      missing.length ? `Skipped (face not seen): ${missing.join(', ')}.` : '',
    ];
    this.result(lines.filter(Boolean).join('<br>'), personal);
  }
  result(html, personal) {
    const u = this.ui;
    u.result.hidden = false; u.barWrap.hidden = true; u.stop.hidden = true;
    u.summary.innerHTML = html;
    u.title.textContent = personal ? 'Done' : 'Training didn’t work';
    u.cue.textContent = ''; u.img.hidden = true; u.step.textContent = '';
    this.onDone?.(personal, calibOf(personal));
  }

  // Dev server only: write the trained templates as the shipped defaults, plus landmark recordings.
  async saveDefaults(personal) {
    for (const m of this.memes) {
      const t = personal.templates[m.id];
      if (!t) continue;
      const { compiled, dir, exemplar, ...plain } = m;
      // your tolerances fit your face tightly; the shared default gets 1.4× room for other faces
      const loose = { ...t, source: `${t.source} (default)`, feats: Object.fromEntries(Object.entries(t.feats).map(([k, f]) => [k, f.gate ? f : { ...f, tol: Math.round(f.tol * 1.4 * 1000) / 1000 }])) };
      const out = { ...plain, parts: t.parts, templates: [loose], ...(personal.exemplars[m.id] ? { exemplar: personal.exemplars[m.id] } : {}) };
      const r = await fetch(`/api/memes/${m.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(out) });
      if (!r.ok) throw new Error(`${m.id}: ${r.status}`);
    }
    const rec = this.recordings;
    const up = async (id, kind, obs) => fetch(`/api/recordings/${id}`, { method: 'POST', body: await gzipJSON({ v: 1, kind, mode: this.mode, meme: id, at: new Date().toISOString(), calib: calibToJSON(rec.calib), frames: obs.map(obsToJSON) }) });
    await up('neutral', 'neutral', rec.neutral);
    for (const t of rec.targets) await up(t.id, 'take', t.obs);
  }
}

function calibOf(personal) {
  const c = personal?.calib;
  return c ? { ...c, neutralBs: c.neutralBs ? Float32Array.from(c.neutralBs) : null } : null;
}
