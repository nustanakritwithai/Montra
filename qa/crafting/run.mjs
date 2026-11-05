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
const output = path.resolve(process.env.MONTRA_CRAFT_ARTIFACTS || path.join(os.tmpdir(), 'craft-evidence'));
const data = await mkdtemp(path.join(os.tmpdir(), 'montra-craft-test-'));
const fixturePath = path.join(data, 'fixture.json');
await mkdir(output, { recursive: true });
const report = { scope: 'Real NPC picking → real crafting → visible item → server restart/save', commit: process.env.GITHUB_SHA || 'local', checks: [], blockedOrigins: [], browserErrors: [], console: [], httpErrors: [], socketNetwork: [], policyViolations: [] };
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
    // Endpoint substitution is the only source transformation. Game/crafting code is untouched.
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
async function enterAndTalk(fixture, expectedGold, phase="initial") {
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
  await page.locator('#smithCraft').click();
  await selectRecipe(fixture, expectedGold);
}
async function selectRecipe(fixture, expectedGold) {
  await page.locator('#personalBench').waitFor({ state: 'visible' });
  await page.locator('#benchGroup').selectOption('all');
  await page.locator('#benchLevel').selectOption('1');
  await page.locator('#benchRecipe').selectOption(fixture.recipeId);
  // Catalog, inventory and wallet are independent real server messages.
  await page.waitForFunction(expected => document.getElementById('craftGold')?.textContent.replace(/[^0-9]/g, '') === String(expected), expectedGold);

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
  // It performs no inventory mutation and cannot satisfy the browser crafting assertions.
  const probe = await Promise.race([
    new Client(backend).joinOrCreate('my_room', { accountSession: fixture.session, characterSlot: fixture.characterSlot,
      worldVersion: 1, templeVersion: 1, atlasVersion: 1, provinceVersion: 1, warVersion: 1,
      castleVersion: 2, riverCityVersion: 1, terrainVersion: 1, atlasReliefVersion: 1, originalReliefVersion: 1, monsterAutoAttackVersion: 1 }),
    sleep(15000).then(() => { throw Error('Real SDK admission preflight timed out'); }),
  ]);
  await probe.leave();
  await sleep(700);
  log('Real server accepts and releases the disposable account before browser-only crafting actions');
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
    window.__craftPolicyViolations = [];
    addEventListener('securitypolicyviolation', event => {
      let origin = event.blockedURI;
      try { origin = new URL(event.blockedURI).origin; } catch {}
      window.__craftPolicyViolations.push({ directive: event.effectiveDirective, origin });
    });
  }, { session: fixture.session, guestKey: fixture.guestKey, endpoint: backend });
  await enterAndTalk(fixture, fixture.before.gold);
  log('Actual canvas NPC click opens dialogue, workshop and dedicated crafting page');
  report.babylonVersion = await page.evaluate(() => BABYLON.Engine.Version);
  assert.equal(await page.locator('#benchOutput').innerText(), fixture.itemName);
  assert.equal((await page.locator('#benchCost').innerText()).replace(/[^0-9]/g, ''), String(fixture.expected.cost));
  assert.match(await page.locator('#benchOwned').innerText(), /มีแล้ว 0 ชิ้น/);
  for (const input of fixture.before.materials) {
    const row = page.locator('#benchIngredients li').filter({ hasText: input.name });
    assert.match(await row.innerText(), new RegExp(input.quantity + ' / ' + input.quantity));
  }
  await page.locator('#benchCraft').scrollIntoViewIfNeeded();
  await page.locator('#benchCraft:enabled').waitFor({ state: 'visible' });
  const readControlTheme = async selector => page.locator(selector).evaluate(element => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, borderColor: style.borderColor, borderStyle: style.borderStyle, color: style.color };
  });
  const drawerTheme = { primary: await readControlTheme('#benchCraft'), secondary: await readControlTheme('#craftBag'), select: await readControlTheme('#benchRecipe') };
  await screenshot('03-crafting-before');
  await page.locator('#benchCraft').click();
  await page.waitForFunction(({ name, gold }) => {
    const status = document.getElementById('craftActionStatus')?.textContent || '';
    return status.includes(name) && status.includes('สำเร็จ') &&
      document.getElementById('benchOwned')?.textContent.includes('มีแล้ว 1 ชิ้น') &&
      document.getElementById('craftGold')?.textContent.replace(/[^0-9]/g, '') === String(gold);
  }, { name: fixture.itemName, gold: fixture.expected.gold });
  for (const input of fixture.before.materials) {
    const row = page.locator('#benchIngredients li').filter({ hasText: input.name });
    assert.match(await row.innerText(), new RegExp('0 / ' + input.quantity));
  }
  assert.equal(await page.locator('#benchCraft').isDisabled(), true, 'spent inputs prevent a second craft');
  report.craftingResult = { item: await page.locator('#benchOutput').innerText(),
    status: await page.locator('#craftActionStatus').innerText(), owned: await page.locator('#benchOwned').innerText(),
    gold: await page.locator('#craftGold').innerText(), ingredients: await page.locator('#benchIngredients').innerText() };
  await page.locator('#craftActionStatus').scrollIntoViewIfNeeded();
  await screenshot('04-crafting-success');
  log('Real server crafts one ring; persistent result, owned count, materials and wallet render correctly');
  await page.locator('#craftBag').click();
  const readTileStyle = async selector => page.locator(selector).evaluate(element => {
    // Compare the final CSS skin rather than an in-flight 150ms UI transition.
    // Only finite transitions on this thumbnail are finished; no game state changes.
    for (const animation of element.getAnimations()) {
      if (animation instanceof CSSTransition && Number.isFinite(animation.effect?.getComputedTiming().endTime)) animation.finish();
    }
    const style = getComputedStyle(element), symbol = getComputedStyle(element.querySelector('.bag-symbol'));
    return { width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height,
      radius: style.borderRadius, border: style.borderColor, background: style.backgroundImage,
      shadow: style.boxShadow, symbolSize: symbol.fontSize, symbolColor: symbol.color, symbol: element.querySelector('.bag-symbol').textContent };
  });
  // Compare the shared filled-item skin, not the intentional selected-slot highlight.
  if (await page.locator('#bagSlot' + fixture.slot).evaluate(el => el.classList.contains('bag-selected'))) {
    await page.locator('#bagSlot0').click();
    await page.locator('#itemModalClose').click();
  }
  await page.locator('#bagSlot' + fixture.slot).scrollIntoViewIfNeeded();
  await page.mouse.move(5, 5);
  await sleep(200); // Existing inventory hover/selection transition is 150ms.
  assert.equal(await page.locator('#bagSlot' + fixture.slot).evaluate(el => el.classList.contains('bag-selected')), false);
  const inventoryStyle = await readTileStyle('#bagSlot' + fixture.slot);
  await page.locator('#bagSlot' + fixture.slot).click();
  assert.equal(await page.locator('#itemDetailModal').evaluate(el => !el.hidden && !el.inert), true, 'centered item modal is visible and interactive');
  assert.equal(await page.locator('#drawer').evaluate(el => el.inert), true, 'underlying bag is inert during item inspection');
  assert.equal(await page.locator('#itemModalClose').evaluate(el => el === document.activeElement), true);
  assert.deepEqual(await readControlTheme('#useBagItem'), drawerTheme.primary, 'modal primary action keeps the game theme');
  for (const selector of ['#itemModalCloseBtn', '#bagForge', '#bagCraft', '#cardSocketAction']) {
    assert.deepEqual(await readControlTheme(selector), drawerTheme.secondary, 'modal secondary action keeps the game theme: ' + selector);
  }
  assert.deepEqual(await readControlTheme('#socketCardChoice'), drawerTheme.select, 'modal card selector keeps the game theme');
  report.modalControlTheme = drawerTheme;

  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.locator('#bagCraft').evaluate(el => el === document.activeElement), true, 'item modal focus wraps to last action');
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('#itemModalClose').evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#itemDetailModal').isVisible(), false);
  assert.equal(await page.locator('#itemModalBackdrop').isVisible(), false);
  assert.equal(await page.locator('#bagSlot' + fixture.slot).evaluate(el => el === document.activeElement), true, 'closing returns focus to the actual item slot');
  await page.locator('#bagSlot' + fixture.slot).click();
  assert.match(await page.locator('#bagItemName').innerText(), new RegExp(fixture.itemName));
  await page.locator('#bagItemName').scrollIntoViewIfNeeded();
  assert.equal(await page.locator('#itemDetailModal').evaluate(el => getComputedStyle(el).visibility), 'visible');
  await screenshot('05-crafted-item-in-bag');
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const modalLayout = await page.locator('#itemDetailModal').evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth }));
    assert.ok(modalLayout.scroll <= modalLayout.width + 1, 'centered item modal has no horizontal overflow at ' + width);
    await page.locator('#bagCraft').scrollIntoViewIfNeeded();
    await screenshot('05a-item-modal-actions-' + width);
    await page.locator('#bagItemName').scrollIntoViewIfNeeded();
    await screenshot('05a-item-modal-stats-' + width);
  }
  log('The actual newly crafted item is visible and selectable in the inventory');
  assert.deepEqual(await readTileStyle('#bagDetailItem .item-slot'), inventoryStyle, 'selected detail matches the real inventory item slot');
  await page.locator('#bagForge').click();
  assert.equal(await page.locator('#itemDetailModal').isVisible(), false, 'navigation dismisses the sibling item modal');
  assert.equal(await page.locator('#itemModalBackdrop').isVisible(), false);
  assert.equal(await page.locator('#drawer').evaluate(el => el.inert), false);
  assert.deepEqual(await readTileStyle('#forgeItemSymbol .item-slot'), inventoryStyle, 'forge preview matches the real inventory item slot');
  await page.locator('#forgeItemName').scrollIntoViewIfNeeded();
  await screenshot('05b-forge-item-style-read-only');
  // Only navigation: never submit an enhancement or another economy action.
  await page.locator('#forgeBag').click();
  await page.locator('#bagCraft').click();
  assert.equal(await page.locator('#itemDetailModal').isVisible(), false, 'craft shortcut dismisses the item modal');
  assert.equal(await page.locator('#itemModalBackdrop').isVisible(), false);
  await selectRecipe(fixture, fixture.expected.gold);
  assert.deepEqual(await readTileStyle('#benchOutputItem .item-slot'), inventoryStyle, 'craft output matches the real inventory item slot');
  report.itemStyle = { comparison: 'Settled finite thumbnail CSS transitions only', inventory: inventoryStyle, surfaces: ['bag detail', 'forge preview', 'craft output'] };
  log('Rendered bag detail, forge and crafting thumbnails match the actual inventory slot style and size');
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.locator('#benchCraft').scrollIntoViewIfNeeded();
    const layout = await page.locator('#drawer').evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth }));
    assert.ok(layout.scroll <= layout.width + 1, 'no horizontal overflow at ' + width);
    await screenshot('06-portrait-' + width);
  }
  log('Crafting controls remain reachable without horizontal overflow at 320px and 390px portrait');
  report.policyViolations.push(...await page.evaluate(() => window.__craftPolicyViolations));
  await page.close();
  await sleep(700);
  await stopServer();
  const verified = await exec(process.execPath, ['--import', 'tsx', 'src/seed.ts', 'verify', fixturePath], { env });
  console.log(clean(verified.stdout));
  log('Durable SQLite verifies one craft receipt, new item identity, binding, exact materials and gold');
  await startServer();
  await enterAndTalk(fixture, fixture.expected.gold, 'restart');
  assert.match(await page.locator('#benchOwned').innerText(), /มีแล้ว 1 ชิ้น/);
  assert.equal((await page.locator('#craftGold').innerText()).replace(/[^0-9]/g, ''), String(fixture.expected.gold));
  await page.locator('#benchOwned').scrollIntoViewIfNeeded();
  await screenshot('07-persisted-after-server-restart');
  log('After real server restart, the NPC crafting page shows the saved item count and correct wallet');
  report.policyViolations.push(...await page.evaluate(() => window.__craftPolicyViolations));
  assert.deepEqual(report.policyViolations, [], 'no attempted connection outside the local network policy');
  assert.deepEqual(report.browserErrors, [], 'no uncaught browser errors');
  assert.ok(!report.blockedOrigins.some(origin => /sslip\.io/.test(origin)), 'no attempted production access');
  await page.close();
  await stopServer();
  const restored = await exec(process.execPath, ['--import', 'tsx', 'src/seed.ts', 'verify', fixturePath], { env });
  console.log(clean(restored.stdout));
  log('Second disk verification confirms the identical crafted instance and receipt after restart');
  report.outcome = 'passed';
} catch (error) {
  report.outcome = 'failed'; report.error = clean(error.stack || error);
  if (page && !page.isClosed()) report.lastScreen = JSON.parse(clean(JSON.stringify(await page.evaluate(() => ({
    mode: document.getElementById('modeBadge')?.textContent,
    entryHidden: document.getElementById('accountEntry')?.hidden,
    entryError: document.querySelector('.account-error')?.textContent,
    online: document.getElementById('onlineCount')?.textContent,
    toast: document.getElementById('toast')?.textContent,
    policyViolations: window.__craftPolicyViolations,
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
