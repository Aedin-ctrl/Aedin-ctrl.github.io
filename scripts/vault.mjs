#!/usr/bin/env node
// Moves secret content to the Pi, which is the only place it is allowed to exist.
//
// The panel used to be encrypted into docs/index.html. It no longer is: a public page
// cannot hold a secret, only a puzzle, and a puzzle an attacker can take home is a
// puzzle they will eventually solve. The plaintext now lives on the Pi and is served
// only after the Pi has checked the key itself.
//
//   node scripts/vault.mjs push          send secret/panel.html to the Pi
//   node scripts/vault.mjs status        is the gate up, and what has it seen lately
//
// The target host is NOT committed -- it reads .vault-target (gitignored) or $PI.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET_FILE = join(ROOT, '.vault-target');
const PANEL = join(ROOT, 'secret/panel.html');

const target = process.env.PI || (existsSync(TARGET_FILE) ? readFileSync(TARGET_FILE, 'utf8').trim() : '');
if (!target) {
  console.error('no target: put user@host in .vault-target (gitignored) or set $PI');
  process.exit(1);
}
const sh = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' });
const cap = args => execFileSync('ssh', [target, ...args], { encoding: 'utf8' });

const cmd = process.argv[2];

if (cmd === 'push') {
  if (!existsSync(PANEL)) { console.error(`missing ${PANEL}`); process.exit(1); }
  sh('scp', ['-q', PANEL, `${target}:~/.vault/panel.html`]);
  cap(['chmod', '600', '~/.vault/panel.html']);
  // No restart needed: the server re-reads a payload whenever its mtime changes.
  const titles = [...readFileSync(PANEL, 'utf8').matchAll(/class="proj-title">([^<]+)</g)].map(m => m[1].trim());
  console.log(`pushed ${titles.length} project(s) to the Pi: ${titles.join(', ')}`);
} else if (cmd === 'status') {
  console.log(cap(['systemctl', '--user', 'is-active', 'vault.service']).trim());
  console.log(cap(['tail', '-15', '~/.vault/attempts.log']));
} else {
  console.error('usage: node scripts/vault.mjs push | status');
  process.exit(1);
}
