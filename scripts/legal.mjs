// Make /privacy and /terms resolve as real URLs.
//
// Both policies live as panels inside docs/index.html and are reached by the
// client-side router, so the footer buttons work but a DIRECT link 404s -- which
// is what Google, Meta and TikTok check when you give them a policy URL.
//
// This extracts those panels and writes standalone pages. index.html stays the
// single source of truth: edit the panel, re-run this, never edit the output.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'docs/index.html'), 'utf8');

function panel(id) {
  const open = src.indexOf(`<section class="panel" id="${id}">`);
  if (open === -1) throw new Error(`no panel #${id} in docs/index.html`);
  // the panel ends at the next sibling <section class="panel" or the wrapper close
  const after = src.slice(open + 10);
  const next = after.indexOf('<section class="panel"');
  const slice = next === -1 ? after : after.slice(0, next);
  const endTag = slice.lastIndexOf('</section>');
  if (endTag === -1) throw new Error(`panel #${id} has no closing tag`);
  const html = slice.slice(0, endTag);

  const heading = html.match(/<h2 class="panel-heading">([^<]+)<\/h2>/)?.[1] ?? id;
  const sub = html.match(/<p class="panel-sub">([\s\S]*?)<\/p>/)?.[1] ?? '';
  const body = html.match(/<div class="legal">([\s\S]*)$/)?.[1] ?? '';
  const legal = body.slice(0, body.lastIndexOf('</div>'));
  if (!legal.trim()) throw new Error(`panel #${id} produced an empty body`);
  return { heading, sub, legal };
}

const page = ({ heading, sub, legal }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${heading} — Aedin Lai</title>
<meta name="description" content="${sub.replace(/<[^>]+>/g, '').replace(/"/g, '&quot;').trim()}">
<link rel="icon" href="data:,">
<style>
  @font-face{font-family:'Inter';font-style:normal;font-weight:400 600;font-display:swap;src:url('/fonts/Inter-latin.woff2') format('woff2');}
  @font-face{font-family:'Space Grotesk';font-style:normal;font-weight:500 700;font-display:swap;src:url('/fonts/SpaceGrotesk-latin.woff2') format('woff2');}
  :root{--paper:#fff;--ink:#101114;--muted:#4b5059;--faint:#6f747c;--line:#e6e7eb;}
  @media(prefers-color-scheme:dark){:root{--paper:#0d0e11;--ink:#f2f3f5;--muted:#b7bcc4;--faint:#9aa0aa;--line:#24262c;}}
  *{box-sizing:border-box;margin:0;padding:0;}
  body{background:var(--paper);color:var(--ink);font-family:'Inter',system-ui,sans-serif;
       line-height:1.65;padding:48px 16px 72px;}
  .wrap{max-width:760px;margin:0 auto;}
  h1{font-family:'Space Grotesk',sans-serif;font-weight:600;letter-spacing:-0.01em;
     font-size:clamp(26px,5vw,34px);margin-bottom:6px;}
  .sub{color:var(--muted);font-size:15px;margin-bottom:28px;}
  .legal{color:var(--muted);font-size:14px;}
  .legal h3{font-family:'Space Grotesk',sans-serif;font-size:16px;color:var(--ink);margin:26px 0 6px;}
  .legal p,.legal li{margin:6px 0;}
  .legal ul{padding-left:20px;}
  .legal a{color:var(--ink);text-decoration:underline;}
  .legal code{font-size:12.5px;background:rgba(127,127,127,.12);padding:1px 4px;border-radius:3px;}
  .legal .updated{color:var(--faint);font-size:12.5px;}
  .back{display:inline-block;margin-top:34px;padding-top:18px;border-top:1px solid var(--line);
        color:var(--faint);font-size:13px;text-decoration:none;}
  .back:hover{color:var(--ink);}
</style>
</head>
<body>
  <main class="wrap">
    <h1>${heading}</h1>
    <p class="sub">${sub}</p>
    <div class="legal">${legal}</div>
    <a class="back" href="/">← aedinlai.com</a>
  </main>
</body>
</html>
`;

for (const id of ['privacy', 'terms']) {
  const p = panel(id);
  const dir = join(root, 'docs', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), page(p));
  console.log(`  docs/${id}/index.html  (${p.legal.length} chars of policy, heading "${p.heading}")`);
}
console.log('\n  Generated from docs/index.html. Edit the panel there, never these files.');
