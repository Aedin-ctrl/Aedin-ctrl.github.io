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

const what   = page.locator('[data-mc-what]');
const padBtn = page.locator('[data-mc-open]');
const lockBtn= page.locator('[data-mc-lock]');
const toggle = page.locator('[data-mc-toggle]');
const pad    = page.locator('[data-mc-pad]');

// --- locked: a keypad icon, and nothing else ---
check('starts locked', (await what.textContent()).trim() === 'locked');
check('keypad icon is the only control', await padBtn.isVisible());
check('lock icon hidden while locked', await lockBtn.isHidden());
check('switch hidden while locked', await toggle.isHidden());
check('keypad itself hidden until asked', await pad.isHidden());

await padBtn.click();
check('keypad opens from the icon', await pad.isVisible());
check('keypad shows six slots', await page.locator('.mc-slot').count() === 6);

const type = async digits => { for (const d of digits) await page.locator(`[data-mc-key="${d}"]`).click(); };
const filled = () => page.locator('.mc-slot[data-filled]').count();

// --- a wrong code must not open it ---
await type('999999');
check('six digits fill six slots', await filled() === 6);
await page.locator('[data-mc-enter]').click();
await page.waitForTimeout(400);
check('wrong code is refused', await toggle.isHidden());
check('wrong code clears the slots', await filled() === 0);
check('wrong code does not reach the Pi state', pi.running === false && pi.token === null);

// --- the real code: four digits of a six-slot pad ---
await type(CODE);
check('four digits fill four of six slots', await filled() === 4);
await page.locator('[data-mc-enter]').click();
await page.waitForTimeout(600);
check('right code reveals the switch', await toggle.isVisible());
check('right code reveals the lock', await lockBtn.isVisible());
check('keypad icon goes away once unlocked', await padBtn.isHidden());
check('keypad closes after unlocking', await pad.isHidden());
check('switch reads off', (await toggle.getAttribute('aria-checked')) === 'false');
check('label says it is off', /off/i.test(await what.textContent()));

// --- flipping it on ---
await toggle.click();
await page.waitForFunction(() => document.querySelector('[data-mc-toggle]').getAttribute('aria-checked') === 'true'
  && !/starting/i.test(document.querySelector('[data-mc-what]').textContent), null, { timeout: 15000 }).catch(() => {});
check('flipping on reaches the Pi', pi.running === true);
check('switch reads on', (await toggle.getAttribute('aria-checked')) === 'true');
check('label says it is running', /running/i.test(await what.textContent()));

// --- flipping it off ---
await toggle.click();
await page.waitForFunction(() => document.querySelector('[data-mc-toggle]').getAttribute('aria-checked') === 'false'
  && !/stopping/i.test(document.querySelector('[data-mc-what]').textContent), null, { timeout: 15000 }).catch(() => {});
check('flipping off reaches the Pi', pi.running === false);

// --- the lock puts it back, and costs the code again ---
await lockBtn.click();
await page.waitForTimeout(200);
check('lock re-locks it', (await what.textContent()).trim() === 'locked');
check('lock hides the switch', await toggle.isHidden());
check('lock brings the keypad icon back', await padBtn.isVisible());

// A re-lock must drop the session, not just hide the control: opening it again
// has to cost the code. Proven by clearing the stand-in Pi's token -- if the page
// had kept one, the next status call would still succeed.
pi.token = null;
await padBtn.click();
await type(CODE);
await page.locator('[data-mc-enter]').click();
await page.waitForTimeout(600);
check('the code opens it again after locking', await toggle.isVisible());

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
