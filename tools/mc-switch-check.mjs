// Checks the Minecraft switch on the Devices tab, against a stand-in for the Pi.
//
// It drives the real published page: docs/ is served exactly as it ships, and every
// call to the vault is intercepted, so nothing here touches the Pi or the real lock.
//
//   node tools/mc-switch-check.mjs
//   MC_REAL_CODE=XXXX node tools/mc-switch-check.mjs   # also prove the real code is absent
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// An arbitrary stand-in. The Pi is mocked below, so this is only ever compared
// against itself -- the real code must never be written down in a public repo,
// which is the entire point of the thing being tested.
const CODE = '5207';
const REAL_CODE = process.env.MC_REAL_CODE || '';

const TYPES = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.ico':'image/x-icon', '.woff2':'font/woff2' };

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
const pi = { running: false, token: null };

function vaultReply(route, request) {
  const url = new URL(request.url());
  const body = JSON.parse(request.postData() || '{}');
  const json = obj => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(obj) });
  if (url.pathname === '/mc/unlock') {
    if (body.code !== CODE) return route.fulfill({ status: 401, body: '' });
    pi.token = 'session-' + Math.random().toString(36).slice(2);
    return json({ token: pi.token, ttl: 600000, state: { running: pi.running, players: [] } });
  }
  // Read-only: deliberately answered without a token, and with nothing in it but
  // the boolean -- no player names, no unit state, no uptime.
  if (url.pathname === '/mc/state') return json({ running: pi.running });
  if (!body.token || body.token !== pi.token) return route.fulfill({ status: 401, body: '' });
  if (url.pathname === '/mc/start') pi.running = true;
  if (url.pathname === '/mc/stop') pi.running = false;
  return json({ ok: true, state: { running: pi.running, players: pi.running ? ['aedin'] : [] } });
}

const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok, detail });

const { srv, base } = await serve();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
await page.route('https://vault.aedinlai.com/**', (route, request) => vaultReply(route, request));
// The device list needs the pi-status Worker and a real key; this check is about the
// switch, so that call is stubbed rather than left to hang.
await page.route('https://pi-status.pizza-calc-api.workers.dev/**',
  route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"devices":[]}' }));

await page.goto(base + '/devices/#k=test-key', { waitUntil: 'domcontentloaded' });

const what    = page.locator('#mcWhat');
const padBtn  = page.locator('#mcPadBtn');
const lockBtn = page.locator('#mcLockBtn');
const toggle  = page.locator('#mcToggle');
const pad     = page.locator('#mcPad');

check('the switch is on the Devices page', await page.locator('#mcCard').count() === 1);
check('it sits beside the Trend Scout switch', await page.locator('#swCard').count() === 1);

// --- locked: a keypad icon, and nothing else ---
// The state is readable without the code; only changing it needs one.
await page.waitForFunction(() => /off|up/i.test(document.getElementById('mcWhat').textContent),
  null, { timeout: 10000 }).catch(() => {});
check('shows it is off while still locked', /off/i.test(await what.textContent()));
check('status dot is grey while off', (await page.locator('#mcDot').getAttribute('class')) === 'dot');
check('keypad icon is the only control', await padBtn.isVisible());
check('lock icon hidden while locked', await lockBtn.isHidden());
check('switch hidden while locked', await toggle.isHidden());
check('keypad itself hidden until asked', await pad.isHidden());

await padBtn.click();
check('keypad opens from the icon', await pad.isVisible());
check('keypad shows six slots', await page.locator('#mcPad .mc-slot').count() === 6);

const type = async digits => { for (const d of digits) await page.locator(`#mcPad [data-mc-key="${d}"]`).click(); };
const filled = () => page.locator('#mcPad .mc-slot[data-filled]').count();

// --- a wrong code must not open it ---
await type('999999');
check('six digits fill six slots', await filled() === 6);
await page.locator('#mcEnter').click();
await page.waitForTimeout(400);
check('wrong code is refused', await toggle.isHidden());
check('wrong code clears the slots', await filled() === 0);
check('wrong code does not reach the Pi state', pi.running === false && pi.token === null);

// --- the real code: four digits of a six-slot pad ---
await type(CODE);
check('four digits fill four of six slots', await filled() === 4);
await page.locator('#mcEnter').click();
await page.waitForTimeout(600);
check('right code reveals the switch', await toggle.isVisible());
check('right code reveals the lock', await lockBtn.isVisible());
check('keypad icon goes away once unlocked', await padBtn.isHidden());
check('keypad closes after unlocking', await pad.isHidden());
check('switch reads off', (await toggle.getAttribute('aria-checked')) === 'false');
check('label says it is off', /off/i.test(await what.textContent()));

// --- flipping it on ---
await toggle.click();
await page.waitForFunction(() => document.getElementById('mcToggle').getAttribute('aria-checked') === 'true'
  && !/starting/i.test(document.getElementById('mcWhat').textContent), null, { timeout: 15000 }).catch(() => {});
check('flipping on reaches the Pi', pi.running === true);
check('switch reads on', (await toggle.getAttribute('aria-checked')) === 'true');
check('label says the server is up', /up/i.test(await what.textContent()));

// --- flipping it off ---
await toggle.click();
await page.waitForFunction(() => document.getElementById('mcToggle').getAttribute('aria-checked') === 'false'
  && !/stopping/i.test(document.getElementById('mcWhat').textContent), null, { timeout: 15000 }).catch(() => {});
check('flipping off reaches the Pi', pi.running === false);

// --- the lock puts it back, and costs the code again ---
await lockBtn.click();
await page.waitForTimeout(200);
check('lock hides the controls again', await padBtn.isVisible());
check('state is still readable after re-locking', /off|up|locked/i.test(await what.textContent()));
check('lock hides the switch', await toggle.isHidden());
check('lock brings the keypad icon back', await padBtn.isVisible());

// A re-lock must drop the session, not just hide the control. Proven by clearing the
// stand-in Pi's token: if the page had kept one, the next status call would succeed.
pi.token = null;
await padBtn.click();
await type(CODE);
await page.locator('#mcEnter').click();
await page.waitForTimeout(600);
check('the code opens it again after locking', await toggle.isVisible());

// --- no code is written down in anything the browser is given ---
const devicesSrc = readFileSync(join(ROOT, 'docs/devices/index.html'), 'utf8');
const panelSrc = readFileSync(join(ROOT, 'docs/index.html'), 'utf8');
check('the test code is not in the devices page', !devicesSrc.includes(CODE));
if (REAL_CODE) {
  check('the real code is not in the devices page', !devicesSrc.includes(REAL_CODE));
  check('the real code is not in the panel page', !panelSrc.includes(REAL_CODE));
} else {
  console.log('note: set MC_REAL_CODE to also check the real code is absent');
}
// It moved off the secret panel; nothing of it should be left behind there.
check('no switch left on the secret panel', !panelSrc.includes('wireMinecraftSwitch'));

await browser.close();
srv.close();

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed++;
  console.log(`${c.ok ? 'ok  ' : 'FAIL'}  ${c.name}${c.detail && !c.ok ? `  (${c.detail})` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
