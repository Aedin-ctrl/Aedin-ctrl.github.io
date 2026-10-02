// Saving and sharing. A whole design becomes one string you can paste anywhere — into the address
// bar, a message, a text file. Nothing is stored on a server, because there is no server.
//
// The trick is to make that string short enough to survive being pasted. Raw JSON of a modest
// circuit runs to several kilobytes; packed and deflated it comes out around a tenth of that.
// Works unchanged in the browser (CompressionStream) and in Node (zlib).

const B64 = { to: (bytes) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
              from: (str) => { const s = atob(str.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, (c) => c.charCodeAt(0)); } };

async function deflate(bytes) {
  if (typeof CompressionStream === 'function') {
    const cs = new CompressionStream('deflate-raw');
    const w = cs.writable.getWriter(); w.write(bytes); w.close();
    return new Uint8Array(await new Response(cs.readable).arrayBuffer());
  }
  const { deflateRawSync } = await import('node:zlib');
  return new Uint8Array(deflateRawSync(bytes));
}
async function inflate(bytes) {
  if (typeof DecompressionStream === 'function') {
    const ds = new DecompressionStream('deflate-raw');
    const w = ds.writable.getWriter(); w.write(bytes); w.close();
    return new Uint8Array(await new Response(ds.readable).arrayBuffer());
  }
  const { inflateRawSync } = await import('node:zlib');
  return new Uint8Array(inflateRawSync(bytes));
}

// Part ids are long and repetitive, so renumber them 0..n for storage and shorten the field names.
// The wires then refer to parts by index, which is both smaller and order-independent.
function pack(circuit) {
  const parts = circuit.parts || [], wires = circuit.wires || [];
  const index = new Map(parts.map((p, i) => [p.id, i]));
  return {
    v: 1,
    p: parts.map((p) => {
      const row = [p.type, Math.round(p.x), Math.round(p.y)];
      if (p.label) row.push(p.label);
      return row;
    }),
    w: wires.filter((x) => index.has(x.from[0]) && index.has(x.to[0]))
            .map((x) => [index.get(x.from[0]), x.from[1], index.get(x.to[0]), x.to[1]]),
    s: parts.map((p, i) => (circuit.on?.includes(p.id) ? i : -1)).filter((i) => i >= 0),
    n: circuit.name || '',
  };
}

function unpack(data) {
  if (!data || data.v !== 1 || !Array.isArray(data.p)) throw new Error('not a Gatecraft design');
  const parts = data.p.map(([type, x, y, label], i) => ({ id: 'p' + i, type, x, y, ...(label ? { label } : {}) }));
  const wires = (data.w || []).map(([fi, fo, ti, tp]) => ({ from: ['p' + fi, fo], to: ['p' + ti, tp] }))
    .filter((w) => parts[+w.from[0].slice(1)] && parts[+w.to[0].slice(1)]);
  return { parts, wires, on: (data.s || []).map((i) => 'p' + i).filter((id) => parts[+id.slice(1)]), name: data.n || '' };
}

export async function encode(circuit) {
  const json = JSON.stringify(pack(circuit));
  return B64.to(await deflate(new TextEncoder().encode(json)));
}

export async function decode(code) {
  const clean = String(code || '').trim().replace(/^#?(?:d=)?/, '');
  if (!clean) throw new Error('nothing to load');
  const json = new TextDecoder().decode(await inflate(B64.from(clean)));
  return unpack(JSON.parse(json));
}

// Everything a person might paste: a full link, just the fragment, or the bare code.
export const codeFromText = (text) => {
  const t = String(text || '').trim();
  const m = /[#?&]d=([A-Za-z0-9_-]+)/.exec(t);
  return m ? m[1] : t.replace(/^#/, '');
};
