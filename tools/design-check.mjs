// Checks every page on the site for accessibility problems, before they ship.
//
//   node tools/design-check.mjs            # check the files in docs/, served locally
//   node tools/design-check.mjs --live     # check what is actually deployed
//   node tools/design-check.mjs --page gatecraft
//
// Exits non-zero if anything fails, so it can gate a deploy.
//
// Why this exists: on 2026-10-02 this found 26 WCAG A/AA failures across the site that nothing
// else had noticed. 25 of them were colour contrast, and all 25 came from just two CSS custom
// properties — one line wrong in Gatecraft, one in Sandbit. Contrast bugs cluster in a token, so
// they are cheap to fix and invisible until something measures them.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Color from 'colorjs.io';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');
const AXE = readFileSync(join(ROOT, 'tools/node_modules/axe-core/axe.min.js'), 'utf8');

const args = process.argv.slice(2);
const LIVE = args.includes('--live');
const ONLY = args.includes('--page') ? args[args.indexOf('--page') + 1] : null;
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa'];

// Every directory under docs/ that has an index.html is a page, plus the site root.
//
// Twelve of those directories are only redirect stubs left behind when the casino tools moved to
// their own site. Checking them locally silently followed the redirect out onto the network and
// audited somebody else's deployed pages, then reported the result as if it were this repo's —
// 80 of the first run's 81 failures were not in this repo at all. So they are detected and skipped.
function isRedirectStub(file) {
  try {
    const html = readFileSync(file, 'utf8');
    return html.length < 2000 && /http-equiv=["']refresh["']|location\.replace\(/i.test(html);
  } catch { return false; }
}

function findPages() {
  const out = [['home', '/', false]];
  for (const name of readdirSync(DOCS)) {
    const dir = join(DOCS, name);
    try { if (!statSync(dir).isDirectory()) continue; } catch { continue; }
    const idx = join(dir, 'index.html');
    if (existsSync(idx)) out.push([name, `/${name}/`, isRedirectStub(idx)]);
  }
  return ONLY ? out.filter(([n]) => n === ONLY) : out;
}

// A plain static server for docs/, so the local check sees exactly what gets published.
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.task': 'application/octet-stream' };
function serve() {
  return new Promise((resolve) => {
    const srv = createServer((req, res) => {
      let p = join(DOCS, decodeURI(req.url.split('?')[0]));
      if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
      if (!existsSync(p)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': TYPES[extname(p)] || 'application/octet-stream' });
      res.end(readFileSync(p));
    }).listen(0, () => resolve({ srv, base: `http://127.0.0.1:${srv.address().port}` }));
  });
}

const pad = (s, n) => String(s).padEnd(n);

const { srv, base } = LIVE ? { srv: null, base: 'https://www.aedinlai.com' } : await serve();
const pages = findPages();
console.log(`checking ${pages.length} page${pages.length === 1 ? '' : 's'} against ${TAGS.join(', ')} — ${LIVE ? 'LIVE site' : 'docs/ served locally'}\n`);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
// bypassCSP because two pages send a Content-Security-Policy that blocks injected scripts. That is
// good posture for the real site; it just means the auditor has to opt out of it.
const ctx = await browser.newContext({ viewport: { width: 1340, height: 900 }, bypassCSP: true });

let failed = 0;
const tokenBlame = new Map();      // colour pair -> how many elements it breaks, across all pages
const needed = new Map();          // ...and the ratio that pair actually has to reach

// Both colour schemes. Checking only light mode missed a real failure: Gatecraft's dark `--faint`
// passed against the page background but failed 4.42:1 against `--wash`, the raised panel surface.
// A dark theme has more than one background, and the lightest one is the one that fails.
const SCHEMES = ['light', 'dark'];

const stubs = pages.filter((p) => p[2]).map((p) => p[0]);
for (const [name, path, stub] of pages) {
  if (stub) continue;                 // a redirect to another site; not this repo's to fix
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  try {
    await page.goto(base + path, { waitUntil: 'load', timeout: 40000 });
    await page.waitForTimeout(2500);

    const byScheme = [];
    for (const scheme of SCHEMES) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.waitForTimeout(500);
      await page.addScriptTag({ content: AXE });
      const r = await page.evaluate(async (tags) =>
        await window.axe.run(document, { runOnly: { type: 'tag', values: tags } }), TAGS);
      byScheme.push([scheme, r]);
    }

    const count = byScheme.reduce((a, [, r]) => a + r.violations.reduce((x, v) => x + v.nodes.length, 0), 0);
    if (!count) {
      console.log(`  ok   ${pad(name, 18)}${errs.length ? `  (${errs.length} page error${errs.length > 1 ? 's' : ''})` : ''}`);
    } else {
      failed += count;
      console.log(`  FAIL ${pad(name, 18)}${count} element${count === 1 ? '' : 's'}`);
    }
    for (const [scheme, res] of byScheme) {
      if (!res.violations.length) continue;
      console.log(`       ${scheme} mode:`);
      for (const v of res.violations) {
        console.log(`         ${pad(v.impact, 9)}${pad(v.id, 26)}x${v.nodes.length}  ${v.help}`);
        for (const n of v.nodes.slice(0, 3)) {
          if (v.id === 'color-contrast') {
            const d = n.any?.[0]?.data || {};
            const key = `${d.fgColor} on ${d.bgColor}`;
            tokenBlame.set(key, (tokenBlame.get(key) || 0) + 1);
            needed.set(key, Math.max(needed.get(key) || 0, parseFloat(d.expectedContrastRatio) || 4.5));
            console.log(`           ${d.contrastRatio}:1 needs ${d.expectedContrastRatio} — ${key} at ${d.fontSize}`);
          } else {
            console.log(`           ${String(n.html).replace(/\s+/g, ' ').slice(0, 72)}`);
          }
        }
      }
    }
  } catch (e) {
    console.log(`  ??   ${pad(name, 18)}${e.message.slice(0, 60)}`);
  }
  await page.close();
}

await browser.close();
if (srv) srv.close();

// Contrast failures cluster in one CSS custom property, so naming the pair points straight at the
// line to change rather than at the dozen elements that happen to use it.
if (tokenBlame.size) {
  console.log('\ncolour pairs to fix (each is usually one CSS variable):');
  for (const [pair, n] of [...tokenBlame].sort((a, b) => b[1] - a[1])) {
    const [fg, bg] = pair.split(' on ');
    let suggestion = '';
    try {
      // walk the same hue toward the needed contrast, so the fix keeps the original look
      const dark = new Color(bg).luminance < 0.5;
      let c = new Color(fg);
      const target = needed.get(pair) || 4.5;
      for (let i = 0; i < 60 && c.contrast(bg, 'WCAG21') < target; i++) {
        c = c.set('hsl.l', (l) => Math.max(0, Math.min(100, l + (dark ? 1.5 : -1.5))));
      }
      if (c.contrast(bg, 'WCAG21') >= target) suggestion = `  try ${c.to('srgb').toString({ format: 'hex' })} (${c.contrast(bg, 'WCAG21').toFixed(2)}:1, needs ${target})`;
    } catch {}
    console.log(`  ${pad(pair, 34)}breaks ${n} element${n === 1 ? '' : 's'}${suggestion}`);
  }
}

if (stubs.length) {
  console.log(`\nskipped ${stubs.length} redirect stub${stubs.length === 1 ? '' : 's'} (they live on another site): ${stubs.join(', ')}`);
}
console.log(failed ? `\n${failed} failing element${failed === 1 ? '' : 's'}` : '\nall clean');
process.exit(failed ? 1 : 0);
