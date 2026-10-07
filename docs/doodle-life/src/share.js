// Share link: every creature's strokes, colour and label packed into the URL hash (quantised,
// delta-encoded, deflated, base64url). No server. Opening the link brings the same scene back.
const enc = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const dec = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
async function deflate(str) { return new Uint8Array(await new Response(new Blob([str]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()); }
async function inflate(u8) { return new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text(); }

export async function encodeScene(creatures, W, H) {
  const items = creatures.filter((c) => c.rawStrokes).slice(-16).map((c) => ({
    c: c.color, l: c.forcedLabel || null,
    s: c.rawStrokes.map((s) => { let px = 0, py = 0; return s.flatMap((p) => { const x = Math.round((p.x / W) * 1000), y = Math.round((p.y / H) * 1000), d = [x - px, y - py]; px = x; py = y; return d; }); }),
  }));
  return enc(await deflate(JSON.stringify(items)));
}
export async function decodeScene(hash, W, H) {
  const items = JSON.parse(await inflate(dec(hash)));
  if (!Array.isArray(items)) return [];
  return items.slice(0, 16).map((it) => ({
    color: /^#[0-9A-Fa-f]{6}$/.test(it.c) ? it.c : '#2A2D34', label: typeof it.l === 'string' ? it.l.slice(0, 40) : null,
    strokes: (it.s || []).slice(0, 60).map((d) => { const out = []; let x = 0, y = 0; for (let i = 0; i + 1 < d.length && i < 4000; i += 2) { x += +d[i] || 0; y += +d[i + 1] || 0; out.push({ x: (x / 1000) * W, y: (y / 1000) * H }); } return out; }).filter((s) => s.length),
  })).filter((it) => it.strokes.length);
}
