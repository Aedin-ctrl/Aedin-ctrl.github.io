// "Can every meme win?" (research/03 lessons): for each meme, build the frame a person would
// produce doing it exactly (its template targets, everything else at rest) and rank the library.
// A meme that loses its own ideal frame can never be shown; a small margin means look-alikes.
import { FEAT, FEATS, N_FEATS, HAND_FEATS } from '../features/schema.js';
import { rankMemes } from './score.js';
import { restValue } from './teach.js';

// Rest values for every feature, then the template's targets on top.
export function idealFrame(template) {
  const x = new Float32Array(N_FEATS), v = new Uint8Array(N_FEATS);
  for (let i = 0; i < N_FEATS; i++) { x[i] = restValue(FEATS[i].name); v[i] = 1; }
  const hn = template.feats.hands_n?.mu ?? 0;
  const nHands = hn >= 0.75 ? 2 : hn >= 0.25 ? 1 : 0;
  // hands that aren't up have no hand features at all (as when they're out of view)
  for (let k = nHands; k < 2; k++) for (const [n] of HAND_FEATS) { v[FEAT[`h${k}_${n}`]] = 0; }
  for (let k = 0; k < nHands; k++) x[FEAT[`h${k}_present`]] = 1;
  x[FEAT.hands_n] = nHands / 2;
  x[FEAT.hands_face] = nHands ? 0.3 : 2;
  if (nHands < 2) { v[FEAT.hands_dist] = 0; v[FEAT.hands_level] = 0; }
  for (const [name, f] of Object.entries(template.feats)) { const i = FEAT[name]; if (i === undefined || f.gate) continue; x[i] = f.mu; v[i] = 1; }
  return { x, valid: v };
}

// → [{ id, rank, score, best: { id, score }, margin }] (rank 1 = wins its own frame)
export function selfCheck(memes) {
  return memes.map((m) => {
    const { x, valid } = idealFrame(m.compiled[0]);
    const r = rankMemes(x, valid, memes);
    const rank = r.findIndex((e) => e.id === m.id) + 1;
    const mine = r[rank - 1], other = r.find((e) => e.id !== m.id);
    return { id: m.id, rank, score: mine.score, best: { id: other.id, score: other.score }, margin: mine.score - other.score };
  });
}
