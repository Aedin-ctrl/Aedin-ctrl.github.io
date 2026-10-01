// "Train on your face" results, kept in this browser only (localStorage), one set per mode:
//   { at, templates: { id: template }, exemplars: { id: { face, hands } }, report, on }
import { prepareMeme } from './score.js';

// v2: finger curls changed scale (2026-10-01), so older training no longer fits the features
const key = (mode) => `memematch.personal.${mode}.v2`;

export function loadPersonal(mode) {
  try { return JSON.parse(localStorage.getItem(key(mode)) || 'null'); } catch { return null; }
}
export function savePersonal(mode, data) {
  try { localStorage.setItem(key(mode), JSON.stringify(data)); return true; } catch { return false; }
}
export function clearPersonal(mode) { try { localStorage.removeItem(key(mode)); } catch {} }

// The library with personal templates (and your recorded expressions for the masks) swapped in.
export function applyPersonal(memes, personal) {
  if (!personal?.on) return memes;
  return memes.map((m) => {
    const t = personal.templates?.[m.id];
    if (!t) return m;
    return prepareMeme({ ...m, parts: t.parts, templates: [t], exemplar: personal.exemplars?.[m.id] ?? m.exemplar });
  });
}
