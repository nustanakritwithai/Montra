/** Full shipped client + real MyRoom + disposable account/SQLite. No live endpoints. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { Client } from '@colyseus/sdk';

const exec = promisify(execFile), root = path.resolve(process.env.MONTRA_REPO_ROOT || '');
assert.ok(process.env.MONTRA_REPO_ROOT, 'explicit repository root required');
const output = path.resolve(process.env.MONTRA_FORGE_ARTIFACTS || path.join(os.tmpdir(), 'forge-evidence'));
const data = await mkdtemp(path.join(os.tmpdir(), 'montra-forge-test-'));
const fixturePath = path.join(data, 'fixture.json');
await mkdir(output, { recursive: true });
const report = { scope: 'Real NPC picking → real enhancement → rendered result → server restart/save', commit: process.env.GITHUB_SHA || 'local', checks: [], blockedOrigins: [], browserErrors: [], console: [], httpErrors: [], socketNetwork: [], policyViolations: [] };
const secretPattern = /(?:mt1|ms1|mg1|mr1)_[a-f0-9]{64}/g;
const clean = value => String(value).replace(secretPattern, '[redacted disposable credential]');
const log = value => { report.checks.push(value); console.log('PASS:', value); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
let server, browser, context, page, serverLog = '', backend;
const staticServer = http.createServer(async (req, res) => {
  try {
    const name = new URL(req.url, 'http://127.0.0.1').pathname;
    const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
    assert.ok(file.startsWith(root + path.sep), 'outside repository');
    let bytes = await readFile(file);
    // Endpoint substitution is the only source transformation. Game/forge code is untouched.
    if (name === '/account-entry.js') {
      const source = bytes.toString(), literal = 'const server = "https://montra.157-85-96-139.sslip.io";';
      assert.equal(source.split(literal).length, 2, 'account endpoint changed; review isolation');
      bytes = Buffer.from(source.replace(literal, 'const server = ' + JSON.stringify(backend) + ';'));
    }
    // Browser-enforced network boundary leaves the allowed WebSocket fully native.
    res.setHeader('Content-Security-Policy', "connect-src 'self' " + backend + ' ' + backend.replace('http:', 'ws:'));
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.glb': 'model/gltf-binary' })[path.extname(file)] || 'application/octet-stream');
    res.end(bytes);
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(resolve => staticServer.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + staticServer.address().port;
// Reserve a free local port, then release it immediately before starting the test server.
const portProbe = http.createServer();
await new Promise(resolve => portProbe.listen(0, '127.0.0.1', resolve));
const port = portProbe.address().port;
await new Promise(resolve => portProbe.close(resolve));
backend = 'http://127.0.0.1:' + port;
const env = { ...process.env, NODE_ENV: 'test', PORT: String(port), MONTRA_TEST_DIR: data, MONTRA_CHARACTER_DIR: path.join(data, 'characters'), MONTRA_ECONOMY_ENABLED: '1', MONTRA_WORLD_EXPANSION: '1', MONTRA_ACCOUNT_ORIGINS: origin, MONTRA_ACCOUNTS_REQUIRED: '1' };
env.MONTRA_DIRECTOR_ENABLED = '0';
env.MONTRA_HUNT_EVENTS = '0';
for (const key of Object.keys(env)) if (key.includes('TYPHOON')) delete env[key];
// Optional world switches are not needed to test the village smith. Never enable castle tests.
for (const key of ['MONTRA_CASTLE_PILOT', 'MONTRA_RIDGE_TERRAIN', 'MONTRA_ORIGINAL_RELIEF', 'MONTRA_ATLAS_RELIEF']) delete env[key];
async function startServer() {
  server = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [server.stdout, server.stderr]) stream.on('data', bytes => { serverLog += clean(bytes); });
  for (let n = 0; n < 300; n++) {
    if (server.exitCode !== null) throw Error('Local server exited: ' + serverLog.slice(-4000));
    if (await fetch(backend + '/health').then(r => r.ok).catch(() => false)) return;
    await sleep(100);
  }
  throw Error('Local server did not become ready');
}
async function stopServer() {
  const child = server;
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    if (server === child) server = undefined;
    return;
  }
  let killTimer;
  const exited = new Promise((resolve, reject) => {
    child.once('exit', resolve);
    child.once('error', reject);
  });
  try {
    child.kill('SIGTERM');
    killTimer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }, 10000);
    await exited;
  } finally {
    clearTimeout(killTimer);
    if (server === child) server = undefined;
  }
}
async function writeEvidence() {
  // Persist diagnostics before cleanup, too, so teardown cannot hide a failure.
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await writeFile(path.join(output, 'server.log'), clean(serverLog));
}
async function screenshot(name) { await page.screenshot({ path: path.join(output, name + '.png') }); }
async function enterAndTalk(fixture, expectedGold, phase = 'initial') {
  page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  cdp.on('Network.webSocketCreated', event => {
    const url = new URL(event.url);
    report.socketNetwork.push({ phase: 'created', origin: url.origin, path: url.pathname });
  });
  cdp.on('Network.webSocketWillSendHandshakeRequest', () => report.socketNetwork.push({ phase: 'handshake-sent' }));
  cdp.on('Network.webSocketHandshakeResponseReceived', event => report.socketNetwork.push({ phase: 'handshake-response', status: event.response.status }));
  cdp.on('Network.webSocketFrameError', event => report.socketNetwork.push({ phase: 'frame-error', error: clean(event.errorMessage) }));
  cdp.on('Network.webSocketClosed', () => report.socketNetwork.push({ phase: 'closed' }));
  page.setDefaultTimeout(45000);
  page.on('pageerror', error => report.browserErrors.push(clean(error.message)));
  page.on('console', message => {
    if (['warning', 'error'].includes(message.type()) && report.console.length < 100) report.console.push(clean(message.text()));
  });
  page.on('response', response => {
    if (response.status() >= 400) report.httpErrors.push({ status: response.status(), path: new URL(response.url()).pathname });
  });
  page.on('requestfailed', request => report.httpErrors.push({ path: new URL(request.url()).pathname, failure: clean(request.failure()?.errorText) }));
  const documentResponse = await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 120000 });
  assert.equal(documentResponse.headers()['content-security-policy'], "connect-src 'self' " + backend + ' ' + backend.replace('http:', 'ws:'), 'exact local network policy is active');
  await page.locator('.account-slot').filter({ hasText: fixture.characterName }).click();
  await page.waitForFunction(() => document.getElementById('modeBadge')?.textContent === 'LIVE' && document.getElementById('accountEntry')?.hidden, null, { timeout: 90000 });
  await page.waitForFunction(() => BABYLON.Engine.Instances[0]?.scenes[0]?.meshes.some(m => m.isEnabled() && m.metadata?.serviceNpc?.role === 'smith'));
  await sleep(1000);
  await screenshot(phase + '-01-world-smith');
  // Aim after the screenshot: the live follow-camera may move during capture.
  // Read picking/projection only; every interaction still uses a real mouse click.
  for (let attempt = 0; attempt < 3; attempt++) {
    const point = await page.evaluate(() => {
      const B = BABYLON, scene = B.Engine.Instances[0].scenes[0], camera = scene.activeCamera;
      const mesh = scene.meshes.find(m => m.isEnabled() && m.metadata?.serviceNpc?.role === 'smith');
      const canvas = document.getElementById('world'), rect = canvas.getBoundingClientRect();
      mesh.computeWorldMatrix(true);
      const center = mesh.getBoundingInfo().boundingBox.centerWorld;
      const p = B.Vector3.Project(center, B.Matrix.Identity(), scene.getTransformMatrix(), camera.viewport.toGlobal(rect.width, rect.height));
      const picked = scene.pick(p.x, p.y, m => m.isEnabled() && (m.metadata?.serviceNpc || m.metadata?.walkable || m.metadata?.portalId || m.metadata?.swordMentor || m.metadata?.questRanger || m.metadata?.questDefense || m.metadata?.warQuartermaster || m.metadata?.climbableWall));
      return { x: rect.left + p.x, y: rect.top + p.y, width: innerWidth, height: innerHeight,
        npc: mesh.metadata.serviceNpc.name, npcId: mesh.metadata.serviceNpc.id,
        pickedNpcId: picked?.pickedMesh?.metadata?.serviceNpc?.id || null,
        pickedMesh: picked?.pickedMesh?.name || null, element: document.elementFromPoint(rect.left + p.x, rect.top + p.y)?.id };
    });
    (report.npcClicks ||= []).push(point);
    assert.equal(point.npc, 'ช่างอาคม');
    assert.ok(point.x > 0 && point.x < point.width && point.y > 0 && point.y < point.height, 'smith is onscreen');
    assert.equal(point.element, 'world', 'actual canvas receives the NPC tap');
    assert.equal(point.pickedNpcId, point.npcId, 'fresh projected point hits the actual smith');
    await page.mouse.click(point.x, point.y, { delay: 30 });
    if (await page.locator('#serviceNpcSpeech').isVisible()) break;
    await page.locator('#serviceNpcSpeech').waitFor({ state: 'visible', timeout: 2500 }).catch(() => {});
    if (await page.locator('#serviceNpcSpeech').isVisible()) break;
  }
  assert.equal(await page.locator('#serviceNpcSpeech').isVisible(), true, 'real NPC tap opens dialogue');
  assert.match(await page.locator('#drawerTitle').innerText(), /ช่างอาคม/);
  await screenshot(phase + '-02-npc-dialogue');
  await page.locator('#serviceNpcAction').click();
  await page.locator('#smithEnhance').click();
  await page.locator('#forgeTargetButton').click();
  await page.locator('#forgePicker').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#forgePicker').evaluate(el => el.matches(':modal')), true, 'native modal isolates the background');
  const targetKey = 'bag:' + fixture.slot;
  const choices = page.locator('#forgePickerGrid [data-forge-target]');
  assert.equal(await choices.count(), 1, 'the real starter inventory exposes only its eligible weapon, not potions');
  assert.equal(await choices.first().getAttribute('data-forge-target'), targetKey);
  if (phase === 'initial') {
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('#forgePickerClose').evaluate(el => el === document.activeElement), true, 'Tab wraps to popup close');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await choices.first().evaluate(el => el === document.activeElement), true, 'Shift+Tab wraps to last item');
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      const layout = await page.locator('#forgePicker').evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth }));
      assert.ok(layout.scroll <= layout.width + 1, 'popup has no horizontal overflow at ' + width);
      await screenshot('02b-equipment-picker-' + width);
    }
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#forgePicker').isVisible(), false);
    assert.equal(await page.locator('#forgeTargetButton').evaluate(el => el === document.activeElement), true, 'Escape restores slot focus without closing forge');
    await page.locator('#forgeTargetButton').click();
  }
  await page.locator('#forgePickerGrid [data-forge-target="' + targetKey + '"]').click();
  assert.equal(await page.locator('#forgePicker').isVisible(), false);
  assert.equal(await page.locator('#forgeTargetButton').getAttribute('data-target'), targetKey);
  assert.equal(await page.locator('#forgeTargetButton').evaluate(el => el === document.activeElement), true, 'selection restores slot focus');
  await page.locator('#forgePanel').waitFor({ state: 'visible' });
  // Inventory and wallet arrive in independent real server messages after join.
  await page.waitForFunction(expected => document.getElementById('forgeGold')?.textContent.replace(/[^0-9]/g, '') === String(expected), expectedGold);
}
try {
  const product = JSON.parse(await readFile('product.json', 'utf8'));
  for (const [file, expected] of Object.entries(product.sha256)) {
    assert.equal(sha(await readFile(path.join(root, file))), expected, 'reviewed product file changed: ' + file);
  }
  report.productCommit = product.productCommit;
  await exec(process.execPath, ['--import', 'tsx', 'src/seed.ts', fixturePath], { env });
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
  report.source = { main: sha(await readFile(path.join(root, 'main.js'))), styles: sha(await readFile(path.join(root, 'styles.css'))), babylon: sha(await readFile('libs/babylon.js')), loaders: sha(await readFile('libs/babylonjs.loaders.min.js')) };
  await startServer();
  // Admission preflight distinguishes a server/fixture problem from browser transport.
  // It performs no inventory mutation and cannot satisfy the browser forge assertions.
  const probe = await Promise.race([
    new Client(backend).joinOrCreate('my_room', { accountSession: fixture.session, characterSlot: fixture.characterSlot,
      worldVersion: 1, templeVersion: 1, atlasVersion: 1, provinceVersion: 1, warVersion: 1,
      castleVersion: 2, riverCityVersion: 1, terrainVersion: 1, atlasReliefVersion: 1, originalReliefVersion: 1, monsterAutoAttackVersion: 1 }),
    sleep(15000).then(() => { throw Error('Real SDK admission preflight timed out'); }),
  ]);
  await probe.leave();
  await sleep(700);
  log('Real server accepts and releases the disposable account before browser-only forge actions');
  browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const libraries = {
    'https://cdn.babylonjs.com/babylon.js': path.resolve('libs/babylon.js'),
    'https://cdn.babylonjs.com/loaders/babylonjs.loaders.min.js': path.resolve('libs/babylonjs.loaders.min.js'),
    'https://unpkg.com/@colyseus/sdk@0.18.1/dist/colyseus.js': path.resolve('node_modules/@colyseus/sdk/dist/colyseus.js')
  };
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if ([origin, backend].includes(url.origin)) return route.continue();
    if (libraries[url.href]) return route.fulfill({ path: libraries[url.href], contentType: 'text/javascript' });
    if (!report.blockedOrigins.includes(url.origin)) report.blockedOrigins.push(url.origin);
    return route.abort();
  });
  // Do not use routeWebSocket: it injects a socket mock even for passthrough.
  // The served document's connect-src policy blocks every nonlocal socket.
  await context.addInitScript(({ session, guestKey, endpoint }) => {
    sessionStorage.setItem('montra_account_session_v1', session);
    localStorage.setItem('montra_guest_access_v1', guestKey);
    localStorage.setItem('montra_endpoint', endpoint);
    window.__forgePolicyViolations = [];
    addEventListener('securitypolicyviolation', event => {
      let origin = event.blockedURI;
      try { origin = new URL(event.blockedURI).origin; } catch {}
      window.__forgePolicyViolations.push({ directive: event.effectiveDirective, origin });
    });
  }, { session: fixture.session, guestKey: fixture.guestKey, endpoint: backend });
  await enterAndTalk(fixture, fixture.before.gold);
  log('Actual canvas NPC click opens dialogue, workshop and dedicated enhancement page');
  report.babylonVersion = await page.evaluate(() => BABYLON.Engine.Version);
  assert.match(await page.locator('#forgeInfo').innerText(), /^\+0/);
  assert.equal(await page.locator('#forgeCopyItem').isVisible(), true, 'enhancement shows the required matching equipment');
  assert.equal(await page.locator('#forgeSealItem').isVisible(), false, 'enhancement must not show reroll material');
  await page.locator('#forgeTabReroll').click();
  assert.equal(await page.locator('#forgeCopyItem').isVisible(), false, 'reroll must not show enhancement copies');
  assert.equal(await page.locator('#forgeSealItem').isVisible(), true, 'reroll shows its own seal material');
  assert.equal(await page.locator('#forgeTargetButton').getAttribute('data-target'), 'bag:' + fixture.slot);
  await page.locator('#forgeTabEnhance').click();
  assert.equal(await page.locator('#forgeSealItem').isVisible(), false);
  assert.equal(await page.locator('#forgeCopyItem').isVisible(), true);
  assert.equal(await page.locator('#forgeTargetButton').getAttribute('data-target'), 'bag:' + fixture.slot);
  log('Enhance and reroll show only their own material while preserving the selected equipment');

  await page.locator('#forgeEnhance').scrollIntoViewIfNeeded();
  await page.locator('#forgeEnhance:enabled').waitFor({ state: 'visible' });
  await page.locator('#forgeItemName').scrollIntoViewIfNeeded();
  await screenshot('03-selected-equipment-slot');
  await page.locator('#forgeEnhance').scrollIntoViewIfNeeded();
  await screenshot('03-enhancement-before');
  // Capture the real status mutation before sending: combat messages can replace
  // the short success toast while the persistent forge result remains visible.
  await page.evaluate(() => {
    const element = document.getElementById('toast');
    window.__forgeToastEvents = [];
    window.__forgeToastObserver = new MutationObserver(() => {
      const style = getComputedStyle(element);
      if (window.__forgeToastEvents.length < 100) window.__forgeToastEvents.push({
        text: element.textContent, shown: element.classList.contains('show'),
        hidden: element.hidden || style.display === 'none' || style.visibility === 'hidden',
      });
    });
    window.__forgeToastObserver.observe(element, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'hidden'] });
  });
  let confirmed = false;
  page.once('dialog', async dialog => {
    assert.equal(dialog.type(), 'confirm');
    assert.match(dialog.message(), /\+0 เป็น \+1/);
    confirmed = true;
    await dialog.accept();
  });
  await page.locator('#forgeEnhance').click();
  await page.waitForFunction(() => document.getElementById('forgeProgress')?.value === 1);
  assert.equal(confirmed, true, 'actual enhancement confirmation appeared');
  await page.waitForFunction(() => window.__forgeToastEvents.some(event => /ตีบวกสำเร็จ \+1/.test(event.text) && event.shown && !event.hidden));
  report.toasts = await page.evaluate(() => { window.__forgeToastObserver.disconnect(); return window.__forgeToastEvents; });
  assert.match(await page.locator('#forgeInfo').innerText(), /^\+1/);
  assert.equal(await page.locator('#forgeTargetButton').getAttribute('data-target'), 'bag:' + fixture.slot);
  assert.match(await page.locator('#forgeItemSymbol .bag-quantity').innerText(), /\+1/);
  assert.match(await page.locator('#forgeEnhance').innerText(), /ตี \+2/);
  assert.equal((await page.locator('#forgeGold').innerText()).replace(/[^0-9]/g, ''), String(fixture.expected.gold));
  await screenshot('04-enhancement-success');
  log('Real server enhancement returns +1; success status, item selection, progress, next step and wallet render correctly');
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.locator('#forgeEnhance').scrollIntoViewIfNeeded();
    const layout = await page.locator('#drawer').evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth }));
    assert.ok(layout.scroll <= layout.width + 1, 'no horizontal overflow at ' + width);
    await screenshot('05-portrait-' + width);
  }
  log('Enhancement controls remain reachable without horizontal overflow at 320px and 390px portrait');
  report.policyViolations.push(...await page.evaluate(() => window.__forgePolicyViolations));
  await page.close();
  await sleep(700);
  await stopServer();
  const verified = await exec(process.execPath, ['--import', 'tsx', 'src/seed.ts', 'verify', fixturePath], { env });
  console.log(clean(verified.stdout));
  log('Durable SQLite state matches exact target identity, +1 rank, cost and copy consumption');
  await startServer();
  await enterAndTalk(fixture, fixture.expected.gold, 'restart');
  await page.waitForFunction(() => document.getElementById('forgeProgress')?.value === 1);
  assert.match(await page.locator('#forgeInfo').innerText(), /^\+1/);
  assert.equal((await page.locator('#forgeGold').innerText()).replace(/[^0-9]/g, ''), String(fixture.expected.gold));
  await page.locator('#forgeEnhance').scrollIntoViewIfNeeded();
  await screenshot('06-persisted-after-server-restart');
  log('After real server restart, talking to the NPC shows the saved +1 item and correct wallet');
  report.policyViolations.push(...await page.evaluate(() => window.__forgePolicyViolations));
  assert.deepEqual(report.policyViolations, [], 'no attempted connection outside the local network policy');
  assert.deepEqual(report.browserErrors, [], 'no uncaught browser errors');
  assert.ok(!report.blockedOrigins.some(origin => /sslip\.io/.test(origin)), 'no attempted production access');
  await page.close();
  await stopServer();
  const restored = await exec(process.execPath, ['--import', 'tsx', 'src/seed.ts', 'verify', fixturePath], { env });
  console.log(clean(restored.stdout));
  log('Second disk verification confirms the same enhanced instance and receipt after restart');
  report.outcome = 'passed';
} catch (error) {
  report.outcome = 'failed'; report.error = clean(error.stack || error);
  if (page && !page.isClosed()) report.lastScreen = JSON.parse(clean(JSON.stringify(await page.evaluate(() => ({
    mode: document.getElementById('modeBadge')?.textContent,
    entryHidden: document.getElementById('accountEntry')?.hidden,
    entryError: document.querySelector('.account-error')?.textContent,
    online: document.getElementById('onlineCount')?.textContent,
    toast: document.getElementById('toast')?.textContent,
    observedToasts: window.__forgeToastEvents,
    policyViolations: window.__forgePolicyViolations,
  })).catch(() => ({})))));
  if (page && !page.isClosed()) await screenshot('failure').catch(() => {});
  console.error(report.error); process.exitCode = 1;
} finally {
  // Never upload fixture.json, storageState, account DBs, authorization headers or network traces.
  await writeEvidence();
  try {
    await browser?.close();
    await stopServer();
    await new Promise(resolve => staticServer.close(resolve));
  } catch (error) {
    report.outcome = 'failed'; report.cleanupError = clean(error.stack || error);
    process.exitCode = 1;
  }
  await writeEvidence();
}
