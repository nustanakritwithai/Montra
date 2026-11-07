import { checkClient } from './build-client.mjs';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { root } from './build-site.mjs';

// Browser tests have their own workflows; this command needs no browser or live server.
const tests = readdirSync(join(root, 'deploy/combat')).filter(file => file.endsWith('test.cjs') && !file.includes('-browser-')).sort();
checkClient();
let failed = 0;
for (const file of ['main.js', 'audio.js', 'account-entry.js']) {
  const result = spawnSync(process.execPath, ['--check', file], { cwd: root, stdio: 'inherit', timeout: 30_000 });
  if (result.status !== 0) failed++;
}
for (const file of tests) {
  console.log(`\n=== ${file} ===`);
  const result = spawnSync(process.execPath, [join('deploy/combat', file)], { cwd: root, stdio: 'inherit', timeout: 30_000 });
  if (result.status !== 0) { console.error(`FAIL ${file}: ${result.error?.message || result.signal || result.status}`); failed++; }
}
console.log(`\nClient checks: ${tests.length} fixtures + 3 syntax checks; ${failed} failures`);
process.exitCode = failed ? 1 : 0;
