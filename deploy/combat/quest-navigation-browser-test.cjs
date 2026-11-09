/** Mobile/keyboard quest interactions on real production HTML and CSS.
 * Synthetic room only; every external request is blocked. */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require('playwright');
const { fixtureScript } = require('./quest-navigation-test.cjs');
(async () => {
  const root = path.resolve(__dirname, '../..');
  const out = process.env.QUEST_NAV_EVIDENCE || path.join(root, 'quest-navigation-browser-evidence');
  fs.mkdirSync(out, { recursive: true });
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace('</body>', '<script src="/fixture.js"></script></body>');
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/') { res.setHeader('content-type', 'text/html'); return res.end(html); }
    if (url.pathname === '/fixture.js') { res.setHeader('content-type', 'text/javascript'); return res.end(fixtureScript(true)); }
    if (url.pathname === '/styles.css') { res.setHeader('content-type', 'text/css'); return res.end(fs.readFileSync(path.join(root, 'styles.css'))); }
    res.writeHead(404); res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try { browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) }); } catch (error) { server.close(); throw error; }
  const report = [];
  try {
    for (const [width, height] of [[320, 640], [390, 844], [1366, 768]]) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, reducedMotion: 'reduce', serviceWorkers: 'block' });
      await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(origin);
      await page.evaluate(() => { document.getElementById('loading').hidden = true; document.getElementById('accountEntry').hidden = true; });
      const quest = page.locator('#quest');
      await quest.waitFor({ state: 'visible' });
      assert.equal(await quest.evaluate(el => el.tagName), 'BUTTON');
      await quest.tap();
      assert.equal(await page.evaluate(() => fixture.wire[0]?.type), 'move', 'quest tap issues ordinary movement');
      assert.equal(await page.evaluate(() => fixture.active()), true);
      assert.equal(await quest.getAttribute('aria-pressed'), 'true');
      await quest.tap();
      assert.equal(await page.evaluate(() => fixture.active()), false, 'second tap cancels');
      assert.equal(await quest.getAttribute('aria-pressed'), 'false');
      await quest.focus(); await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => fixture.active()), true, 'keyboard activates native quest button');
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => fixture.active()), false, 'second keyboard activation cancels');
      await quest.tap();
      await page.evaluate(() => fixture.manual(2, 3));
      assert.equal(await page.evaluate(() => fixture.active()), false, 'manual move cancels navigation');
      assert.deepEqual(await page.evaluate(() => fixture.wire.at(-1)), { type: 'move', data: { x: 2, z: 3 } });
      await quest.tap(); await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(() => fixture.active()), false, 'Escape cancels');
      assert.equal(await page.evaluate(() => fixture.wire.every(order => order.type === 'move')), true, 'no attack, warp, or quest acceptance');
      await page.evaluate(() => {
        fixture.change({x:0,y:0,z:0});
        fixture.world({fixture:{id:'fixture',bounds:{minX:-200,maxX:200,minZ:-200,maxZ:200},walls:[{x:20,z:-60,width:5,length:120}],obstacles:[],portals:[]}});
        fixture.guide({title:'Long detour',to:{id:'A',x:100,z:0}});
      });
      const beforePlanning=await page.evaluate(()=>fixture.wire.length);
      await quest.tap();
      assert.equal(await page.evaluate(()=>!!fixture.state()?.planner),true,'hard route yields after real tap');
      const responsive=await page.evaluate(()=>new Promise(resolve=>{
        setTimeout(()=>{fixture.tick(performance.now());resolve({timer:true,planning:!!fixture.state()?.planner});},0);
      }));
      assert.deepEqual(responsive,{timer:true,planning:true},'browser timer runs between planner slices');
      assert.equal(await page.evaluate(()=>fixture.wire.length),beforePlanning,'no premature move during route planning');
      await quest.tap();assert.equal(await page.evaluate(()=>fixture.active()),false,'real tap cancels pending planner');
      const afterPlanningCancel=await page.evaluate(()=>fixture.wire.length);
      await page.evaluate(()=>{for(let i=0;i<100;i++)fixture.tick(performance.now()+i*16);});
      assert.equal(await page.evaluate(()=>fixture.wire.length),afterPlanningCancel,'cancelled planning cannot send late moves');
      assert.deepEqual(errors, []);
      await page.screenshot({ path: path.join(out, `quest-${width}.png`) });
      report.push({ width, height, questTap: true, secondTapCancel: true, keyboard: true, manualCancel: true, moveOnly: true, incrementalPlanning:true, responsiveTimer:true, planningCancel:true, errors });
      await context.close();
    }
    console.log(JSON.stringify(report, null, 2));
  } finally {
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    await browser.close(); await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
