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

const exec = promisify(execFile), root = path.resolve(process.env.MONTRA_REPO_ROOT || '');
assert.ok(process.env.MONTRA_REPO_ROOT, 'explicit repository root required');
const output = path.resolve(process.env.MONTRA_FORGE_ARTIFACTS || path.join(os.tmpdir(), 'forge-evidence'));
const data = await mkdtemp(path.join(os.tmpdir(), 'montra-forge-test-'));
const fixturePath = path.join(data, 'fixture.json');
await mkdir(output, { recursive: true });
const report = { scope: 'Real NPC picking → real enhancement → rendered result → server restart/save', commit: process.env.GITHUB_SHA || 'local', checks: [], blockedOrigins: [], browserErrors: [], console: [], httpErrors: [] };
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
  if (!server || server.exitCode !== null) return;
  const exited = new Promise(resolve => server.once('exit', resolve));
  server.kill('SIGTERM');
  await Promise.race([exited, sleep(10000).then(() => { if (server.exitCode === null) server.kill('SIGKILL'); })]);
  await exited;
}
async function screenshot(name) { await page.screenshot({ path: path.join(output, name + '.png') }); }
async function enterAndTalk(fixture) {
  page = await context.newPage();
  page.setDefaultTimeout(45000);
  page.on('pageerror', error => report.browserErrors.push(clean(error.message)));
  page.on('console', message => {
    if (['warning', 'error'].includes(message.type()) && report.console.length < 100) report.console.push(clean(message.text()));
  });
  page.on('response', response => {
    if (response.status() >= 400) report.httpErrors.push({ status: response.status(), path: new URL(response.url()).pathname });
  });
  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.locator('.account-slot').filter({ hasText: fixture.characterName }).click();
  await page.waitForFunction(() => document.getElementById('modeBadge')?.textContent === 'LIVE' && document.getElementById('accountEntry')?.hidden, null, { timeout: 90000 });
  await page.waitForFunction(() => BABYLON.Engine.Instances[0]?.scenes[0]?.meshes.some(m => m.isEnabled() && m.metadata?.serviceNpc?.role === 'smith'));
  await sleep(1000);
  // Inspect projection only; NPC interaction still goes through actual pointer events/picking.
  const point = await page.evaluate(() => {
    const B = BABYLON, scene = B.Engine.Instances[0].scenes[0], camera = scene.activeCamera;
    const mesh = scene.meshes.find(m => m.isEnabled() && m.metadata?.serviceNpc?.role === 'smith');
    const canvas = document.getElementById('world'), rect = canvas.getBoundingClientRect();
    mesh.computeWorldMatrix(true);
    const center = mesh.getBoundingInfo().boundingBox.centerWorld;
    const p = B.Vector3.Project(center, B.Matrix.Identity(), scene.getTransformMatrix(), camera.viewport.toGlobal(rect.width, rect.height));
    return { x: rect.left + p.x, y: rect.top + p.y, width: innerWidth, height: innerHeight, npc: mesh.metadata.serviceNpc.name };
  });
  assert.equal(point.npc, 'ช่างอาคม');
  assert.ok(point.x > 0 && point.x < point.width && point.y > 0 && point.y < point.height, 'smith is onscreen');
  await screenshot('01-world-smith');
  await page.mouse.click(point.x, point.y);
  await page.locator('#serviceNpcSpeech').waitFor({ state: 'visible' });
  assert.match(await page.locator('#drawerTitle').innerText(), /ช่างอาคม/);
  await screenshot('02-npc-dialogue');
  await page.locator('#serviceNpcAction').click();
  await page.locator('#smithEnhance').click();
  await page.locator('#forgeGear').selectOption('bag:' + fixture.slot);
  await page.locator('#forgePanel').waitFor({ state: 'visible' });
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
  // Keep the allowed socket native: forwarding it through Playwright changes the
  // transport under test. Intercept only forbidden destinations and close them.
  await context.routeWebSocket(url => url.origin !== backend.replace('http:', 'ws:'), ws => {
    report.blockedOrigins.push(new URL(ws.url()).origin);
    ws.close({ code: 1008, reason: 'Nonlocal socket refused by isolated test' });
  });
  await context.addInitScript(({ session, guestKey, endpoint }) => {
    sessionStorage.setItem('montra_account_session_v1', session);
    localStorage.setItem('montra_guest_access_v1', guestKey);
    localStorage.setItem('montra_endpoint', endpoint);
    // Observe native socket lifecycle without changing messages or transport behavior.
    window.__forgeSocketObservation = [];
    const NativeSocket = window.WebSocket;
    window.WebSocket = new Proxy(NativeSocket, { construct(Target, args) {
      const socket = Reflect.construct(Target, args);
      const row = { path: new URL(args[0], location.href).pathname, opened: false, received: 0 };
      window.__forgeSocketObservation.push(row);
      socket.addEventListener('open', () => { row.opened = true; });
      socket.addEventListener('message', () => { row.received++; });
      socket.addEventListener('close', event => { row.closed = true; row.code = event.code; row.reason = event.reason; });
      socket.addEventListener('error', () => { row.error = true; });
      return socket;
    } });
  }, { session: fixture.session, guestKey: fixture.guestKey, endpoint: backend });
  await enterAndTalk(fixture);
  log('Actual canvas NPC click opens dialogue, workshop and dedicated enhancement page');
  report.babylonVersion = await page.evaluate(() => BABYLON.Engine.Version);
  assert.match(await page.locator('#forgeInfo').innerText(), /^\+0/);
  await page.locator('#forgeEnhance').scrollIntoViewIfNeeded();
  assert.equal(await page.locator('#forgeEnhance').isEnabled(), true);
  await screenshot('03-enhancement-before');
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
  assert.match(await page.locator('#toast').innerText(), /ตีบวกสำเร็จ \+1/);
  assert.match(await page.locator('#forgeInfo').innerText(), /^\+1/);
  assert.match(await page.locator('#forgeGear option:checked').innerText(), /\+1/);
  assert.match(await page.locator('#forgeEnhance').innerText(), /ตี \+2/);
  assert.equal((await page.locator('#forgeGold').innerText()).replace(/[^0-9]/g, ''), String(fixture.expected.gold));
  await screenshot('04-enhancement-success');
  log('Real server enhancement returns +1; toast, item selection, progress, next step and wallet render correctly');
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.locator('#forgeEnhance').scrollIntoViewIfNeeded();
    const layout = await page.locator('#drawer').evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth }));
    assert.ok(layout.scroll <= layout.width + 1, 'no horizontal overflow at ' + width);
    await screenshot('05-portrait-' + width);
  }
  log('Enhancement controls remain reachable without horizontal overflow at 320px and 390px portrait');
  await page.close();
  await sleep(700);
  await stopServer();
  const verified = await exec(process.execPath, ['--import', 'tsx', 'src/seed.ts', 'verify', fixturePath], { env });
  console.log(clean(verified.stdout));
  log('Durable SQLite state matches exact target identity, +1 rank, cost and copy consumption');
  await startServer();
  await enterAndTalk(fixture);
  await page.waitForFunction(() => document.getElementById('forgeProgress')?.value === 1);
  assert.match(await page.locator('#forgeInfo').innerText(), /^\+1/);
  assert.equal((await page.locator('#forgeGold').innerText()).replace(/[^0-9]/g, ''), String(fixture.expected.gold));
  await page.locator('#forgeEnhance').scrollIntoViewIfNeeded();
  await screenshot('06-persisted-after-server-restart');
  log('After real server restart, talking to the NPC shows the saved +1 item and correct wallet');
  assert.deepEqual(report.browserErrors, [], 'no uncaught browser errors');
  assert.ok(!report.blockedOrigins.some(origin => /sslip\.io/.test(origin)), 'no attempted production access');
  report.outcome = 'passed';
} catch (error) {
  report.outcome = 'failed'; report.error = clean(error.stack || error);
  if (page && !page.isClosed()) report.lastScreen = JSON.parse(clean(JSON.stringify(await page.evaluate(() => ({
    mode: document.getElementById('modeBadge')?.textContent,
    entryHidden: document.getElementById('accountEntry')?.hidden,
    entryError: document.querySelector('.account-error')?.textContent,
    online: document.getElementById('onlineCount')?.textContent,
    toast: document.getElementById('toast')?.textContent,
    sockets: window.__forgeSocketObservation,
  })).catch(() => ({})))));
  if (page && !page.isClosed()) await screenshot('failure').catch(() => {});
  console.error(report.error); process.exitCode = 1;
} finally {
  await browser?.close();
  await stopServer();
  await new Promise(resolve => staticServer.close(resolve));
  // Never upload fixture.json, storageState, account DBs, authorization headers or network traces.
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await writeFile(path.join(output, 'server.log'), clean(serverLog));
}
