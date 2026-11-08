/** Real DOM/touch/keyboard on production HUD, CSS and attack helpers. Captured
 * protocol only: isolated synthetic room, no account/server or production traffic. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright'),{fixtureScript}=require('./basic-attack-ui-test.cjs');
(async()=>{
 const root=path.resolve(__dirname,'../..'),out=path.join(root,'basic-attack-browser-evidence');fs.mkdirSync(out,{recursive:true});
 const html=fs.readFileSync(root+'/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace('</body>','<script src="/fixture.js"></script></body>');
 const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/'){res.setHeader('content-type','text/html');return res.end(html);}if(url.pathname==='/fixture.js'){res.setHeader('content-type','text/javascript');return res.end(fixtureScript());}if(url.pathname==='/styles.css'){res.setHeader('content-type','text/css');return res.end(fs.readFileSync(root+'/styles.css'));}res.writeHead(404);res.end();});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true}),report=[];
 try{
 for(const [width,height] of [[320,640],[390,844],[1366,768]]){
  const ctx=await browser.newContext({viewport:{width,height},hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block'});
  await ctx.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
  await page.evaluate(()=>{document.getElementById('loading').hidden=true;document.getElementById('accountEntry').hidden=true;});
  const orb=page.locator('.vital-orb');await orb.waitFor({state:'visible'});
  assert.equal(await orb.evaluate(e=>e.tagName),'BUTTON');assert.equal(await orb.getAttribute('type'),'button');
  assert.match(await orb.getAttribute('aria-label'),/โจมตีปกติ.*ระยะ 8 เมตร.*เลือด 73\/100.*มานา 20\/60.*กำลัง 35\/100/);
  assert.equal(await page.locator('.location-area .map-shortcuts').count(),1,'production relocation removes the obsolete bottom navigation');
  const box=await orb.boundingBox();assert(box.width>=44&&box.height>=44&&box.x>=0&&box.x+box.width<=width&&box.y+box.height<=height);
  await orb.tap();assert.deepEqual(await page.evaluate(()=>fixture.wire),[{type:'attack',data:{targetId:'possessed-1'}}]);
  assert.equal(await page.evaluate(()=>fixture.counts().profiles),0);assert.equal(await page.locator('#drawer').isVisible(),false);
  await orb.focus();await page.keyboard.down('Enter');await page.keyboard.down('Enter');await page.keyboard.up('Enter');
  assert.equal(await page.evaluate(()=>fixture.wire.length),2,'held Enter must not repeat');
  await page.keyboard.press('Space');assert.equal(await page.evaluate(()=>fixture.wire.length),3);
  await page.waitForTimeout(1100);assert.equal(await page.evaluate(()=>fixture.wire.length),3,'no client auto-repeat timer');
  await orb.tap();await orb.tap();assert.equal(await page.evaluate(()=>fixture.wire.length),5,'one order per deliberate tap');
  const beforeSwipe=await page.evaluate(()=>fixture.wire.length),cx=box.x+box.width/2,cy=box.y+box.height/2;
  await page.mouse.move(cx,cy);await page.mouse.down();await page.mouse.move(cx-60,cy,{steps:4});await page.mouse.up();
  assert.equal(await page.evaluate(()=>fixture.wire.length),beforeSwipe,'swipe dash suppresses attack click');
  assert.equal(await page.evaluate(()=>fixture.counts().dashes),1);
  await page.evaluate(()=>fixture.forest());await orb.tap();assert.deepEqual(await page.evaluate(()=>fixture.wire.at(-1)),{type:'attack',data:{targetId:'near'}});
  await page.evaluate(()=>fixture.selected('far'));await orb.tap();assert.deepEqual(await page.evaluate(()=>fixture.wire.at(-1)),{type:'attack',data:{targetId:'far'}});
  const count=await page.evaluate(()=>fixture.wire.length);await page.evaluate(()=>fixture.empty());await orb.tap();assert.equal(await page.evaluate(()=>fixture.wire.length),count);
  await page.evaluate(()=>fixture.setRanges({ranged:11,melee:2.8,pk:2.8}));assert.match(await orb.getAttribute('aria-label'),/ระยะ 11 เมตร/);
  await page.evaluate(()=>fixture.setPath('blade'));assert.match(await orb.getAttribute('aria-label'),/ระยะ 2.8 เมตร/);
  await page.evaluate(()=>fixture.setRanges(undefined));assert.doesNotMatch(await orb.getAttribute('aria-label'),/ระยะ/);
  await page.locator('#characterProfile').click();assert.equal(await page.evaluate(()=>fixture.counts().profiles),1,'profile still has its separate entry');
  await page.screenshot({path:path.join(out,`orb-${width}.png`)});assert.deepEqual(errors,[]);
  report.push({width,height,nativeButton:true,singleTapWire:true,keyboardNoRepeat:true,rangeFromServer:true,profileSeparate:true});await ctx.close();
 }
 console.log(JSON.stringify(report,null,2));
 }finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
