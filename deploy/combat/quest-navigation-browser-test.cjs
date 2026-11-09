/** Mobile/keyboard quest interactions on real production HTML and CSS.
 * Synthetic room only; every external request is blocked. */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require('playwright');
const { fixtureScript } = require('./quest-navigation-test.cjs');
const { swipeFixtureScript } = require('./quest-navigation-swipe-test.cjs');
(async () => {
  const root = path.resolve(__dirname, '../..');
  const out = process.env.QUEST_NAV_EVIDENCE || path.join(root, 'quest-navigation-browser-evidence');
  fs.mkdirSync(out, { recursive: true });
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace('</body>', '<script src="/fixture.js"></script></body>');
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/') { res.setHeader('content-type', 'text/html'); return res.end(html); }
    if (url.pathname === '/fixture.js') { res.setHeader('content-type', 'text/javascript'); return res.end(fixtureScript(true)+swipeFixtureScript()); }
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
      await page.evaluate(() => {
        document.getElementById('loading').hidden = true; document.getElementById('accountEntry').hidden = true;
        // Synthetic learned skill gives the production controls their in-game width.
        const hotbar=document.getElementById('swordHotbar');hotbar.hidden=false;
        hotbar.innerHTML='<button type="button" class="sword-hotkey">Fixture skill</button>';
      });
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
      // Native touchscreen input starts in the invisible, non-button dash area.
      // A generated click cannot hide a missing cancellation in requestSwipeDash.
      const cdp=await context.newCDPSession(page);
      const swipePoint=await page.evaluate(()=>{
        const zone=document.querySelector('.controls'),r=zone.getBoundingClientRect();
        for(let y=Math.max(0,r.top)+3;y<Math.min(innerHeight,r.bottom);y+=3)
          for(let x=Math.max(0,r.left)+3;x<Math.min(innerWidth,r.right);x+=3)
            if(document.elementFromPoint(x,y)===zone)return {x,y};
        throw new Error('No non-button controls hit area');
      });
      const swipe=async distance=>{
        const point={x:swipePoint.x,y:swipePoint.y,id:1};
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...point,y:point.y-distance}]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      };
      await page.evaluate(()=>{
        fixture.world({fixture:{id:'fixture',bounds:{minX:-20,maxX:20,minZ:-20,maxZ:20},walls:[],obstacles:[],portals:[]}});
        fixture.guide({title:'Fixture hunt',to:{x:12,z:0}});
      });
      await quest.click();
      const beforeShort=await page.evaluate(()=>fixture.wire.length);
      await swipe(20);
      assert.equal(await page.evaluate(()=>fixture.active()),true,'short non-button gesture preserves navigation');
      assert.equal(await page.evaluate(()=>fixture.wire.length),beforeShort,'short gesture emits no command');
      for(const reason of ['dash_cooldown','insufficient_stamina','dismount_required']){
        if(!await page.evaluate(()=>fixture.active()))await quest.click();
        assert.equal(await page.evaluate(()=>fixture.active()),true,'navigation active before native swipe');
        const before=await page.evaluate(()=>fixture.wire.length);
        await swipe(80);
        assert.equal(await page.evaluate(()=>fixture.active()),false,'native swipe cancels before '+reason);
        assert.equal(await quest.getAttribute('aria-pressed'),'false');
        assert.deepEqual(await page.evaluate(n=>fixture.wire.slice(n).map(order=>order.type),before),['move','dash'],'native swipe sends stop then dash');
        assert.deepEqual(await page.evaluate(n=>fixture.wire[n].data,before),{x:0,z:0},'stop uses authoritative position');
        const after=await page.evaluate(()=>fixture.wire.length);
        await page.evaluate(reason=>{fixture.reject({reason});fixture.tick(performance.now()+1000);},reason);
        assert.equal(await page.evaluate(()=>fixture.wire.length),after,'rejected dash never resumes navigation');
      }
      await quest.click();await page.evaluate(()=>fixture.dashAvailable(false));await swipe(80);
      assert.equal(await page.evaluate(()=>fixture.active()),false,'unsupported dash still cancels native navigation');
      await page.evaluate(()=>fixture.dashAvailable(true));
      await cdp.detach();
      assert.deepEqual(errors, []);
      await page.screenshot({ path: path.join(out, `quest-${width}.png`) });
      report.push({ width, height, questTap: true, secondTapCancel: true, keyboard: true, manualCancel: true, moveOnly: true, nativeSwipeCancel:true, rejectedDashCancel:true, shortSwipeIgnored:true, unsupportedDashCancel:true, incrementalPlanning:true, responsiveTimer:true, planningCancel:true, errors });
      await context.close();
    }
    console.log(JSON.stringify(report, null, 2));
  } finally {
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    await browser.close(); await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
