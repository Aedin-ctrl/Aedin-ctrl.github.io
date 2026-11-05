// Checks the Minecraft switch in the secret panel, against a stand-in for the Pi.
//
// The point is to exercise the real published page and the real panel markup: the page
// is served from docs/ exactly as it ships, the panel fragment is the one the vault
// sends, and every call to the vault is intercepted so nothing here touches the Pi.
//
//   node tools/mc-switch-check.mjs
//
// It fails loudly if the keypad stops gating the switch, which is the only thing about
// it that really matters.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PANEL = join(ROOT, 'secret/panel.html');

// An arbitrary stand-in. The Pi is mocked below, so this is only ever compared against
// itself — and the real code must never be written down in a public repo, which is the
// entire point of the thing being tested.
const CODE = '5207';
// Optionally prove the real one is absent from what ships:
//   MC_REAL_CODE=XXXX node tools/mc-switch-check.mjs
const REAL_CODE = process.env.MC_REAL_CODE || '';

if (!existsSync(PANEL)) {
  console.error(`missing ${PANEL} — this check needs the real panel fragment`);
  process.exit(2);
}

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

function serve() {
  return new Promise(resolve => {
    const srv = createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const file = join(ROOT, 'docs', p);
      if (!file.startsWith(join(ROOT, 'docs')) || !existsSync(file)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
      res.end(readFileSync(file));
    }).listen(0, () => resolve({ srv, base: `http://127.0.0.1:${srv.address().port}` }));
  });
}

// ---- the stand-in Pi ----
// Mirrors the vault's contract: a wrong code is an empty 401, a right one mints a
// session, and every action needs that session back.
const pi = { running: false, token: null, calls: [] };

function vaultReply(route, request) {
  const url = new URL(request.url());
  const body = JSON.parse(request.postData() || '{}');
  pi.calls.push(url.pathname);
  const json = obj => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(obj) });
  const denied = () => route.fulfill({ status: 401, body: '' });

  if (url.pathname === '/mc/unlock') {
    if (body.code !== CODE) return denied();
    pi.token = 'session-' + Math.random().toString(36).slice(2);
    return json({ token: pi.token, ttl: 600000, state: { running: pi.running, players: [] } });
  }
  if (!body.token || body.token !== pi.token) return denied();
  if (url.pathname === '/mc/start') { pi.running = true; }
  if (url.pathname === '/mc/stop') { pi.running = false; }
  return json({ ok: true, state: { running: pi.running, players: pi.running ? ['aedin'] : [] } });
}

const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok, detail }); };

const { srv, base } = await serve();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
await page.route('https://vault.aedinlai.com/**', (route, request) => vaultReply(route, request));

await page.goto(base + '/', { waitUntil: 'domcontentloaded' });

// Inject the panel the way the page does after a correct unlock, then wire it.
const panelHtml = readFileSync(PANEL, 'utf8');
const wired = await page.evaluate(html => {
  const panel = document.getElementById('secret-projects');
  if (!panel) return 'no #secret-projects';
  panel.innerHTML = html;
  if (typeof wireMinecraftSwitch !== 'function') return 'wireMinecraftSwitch is not reachable';
  wireMinecraftSwitch(panel);
  // The panel lives in a tab viewport that is slid off screen until its tab is picked.
  // Driving the whole tab machinery here would be testing the tabs, not the switch, so
  // the wired panel is lifted out and shown on its own.
  document.body.appendChild(panel);
  panel.style.cssText = 'display:block; position:static; transform:none; opacity:1; visibility:visible;';
  return 'ok';
}, panelHtml);
check('panel injects and wires', wired === 'ok', wired);

const root = page.locator('[data-mc-root]');
await root.waitFor({ state: 'attached' });
// The item is inside a <details>; open it so the controls are really visible.
await page.locator('[data-mc-item]').evaluate(d => { d.open = true; });

check('starts locked', (await page.locator('[data-mc-state]').textContent()).trim() === 'Locked');
check('keypad hidden until asked', await page.locator('[data-mc-pad]').isHidden());

await page.locator('[data-mc-open]').click();
check('keypad opens on click', await page.locator('[data-mc-pad]').isVisible());
check('keypad shows six slots', await page.locator('.mc-slot').count() === 6, `${await page.locator('.mc-slot').count()} slots`);

const type = async digits => {
  for (const d of digits) await page.locator(`[data-mc-key="${d}"]`).click();
};
const filled = () => page.locator('.mc-slot[data-filled]').count();

// --- a wrong code must not open it ---
await type('999999');
check('six digits fill six slots', await filled() === 6, `${await filled()} filled`);
await page.locator('[data-mc-enter]').click();
await page.waitForTimeout(400);
check('wrong code is refused', await page.locator('[data-mc-live]').isHidden());
check('wrong code says so', /did not open/i.test(await page.locator('[data-mc-msg]').textContent()));
check('wrong code clears the slots', await filled() === 0);
check('wrong code does not reach the Pi state', pi.running === false && pi.token === null);

// --- a prefix of the real code must not open it either ---
await type('231');
await page.locator('[data-mc-enter]').click();
await page.waitForTimeout(400);
check('short code is refused', await page.locator('[data-mc-live]').isHidden());

// --- the real code, four digits of a six-slot pad ---
await type(CODE);
check('four digits fill four of six slots', await filled() === 4, `${await filled()} filled`);
await page.locator('[data-mc-enter]').click();
await page.waitForTimeout(600);
check('right code opens the switch', await page.locator('[data-mc-live]').isVisible());
check('keypad closes after unlocking', await page.locator('[data-mc-pad]').isHidden());
check('shows the server is off', (await page.locator('[data-mc-state]').textContent()).trim() === 'Off');

// --- turning it on ---
await page.locator('[data-mc-action="start"]').click();
await page.waitForFunction(() => document.querySelector('[data-mc-state]').textContent.trim() === 'Running', null, { timeout: 15000 }).catch(() => {});
check('turning it on reaches the Pi', pi.running === true);
check('shows it is running', (await page.locator('[data-mc-state]').textContent()).trim() === 'Running');
check('"turn on" disables once it is on', await page.locator('[data-mc-action="start"]').isDisabled());

// --- turning it off ---
await page.locator('[data-mc-action="stop"]').click();
await page.waitForFunction(() => document.querySelector('[data-mc-state]').textContent.trim() === 'Off', null, { timeout: 15000 }).catch(() => {});
check('turning it off reaches the Pi', pi.running === false);

// --- no code is written down in what the browser is given ---
const pageSrc = readFileSync(join(ROOT, 'docs/index.html'), 'utf8');
check('the test code is not in the public page', !pageSrc.includes(CODE), 'docs/index.html');
check('the test code is not in the panel fragment', !panelHtml.includes(CODE), 'secret/panel.html');
if (REAL_CODE) {
  check('the real code is not in the public page', !pageSrc.includes(REAL_CODE), 'docs/index.html');
  check('the real code is not in the panel fragment', !panelHtml.includes(REAL_CODE), 'secret/panel.html');
} else {
  console.log('note: set MC_REAL_CODE to also check the real code is absent from both files');
}

await browser.close();
srv.close();

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed++;
  console.log(`${c.ok ? 'ok  ' : 'FAIL'}  ${c.name}${c.detail && !c.ok ? `  (${c.detail})` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
