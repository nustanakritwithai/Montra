/** Full shipped client, native browser input, real MyRoom and two disposable SQLite accounts. */
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
const exec=promisify(execFile),root=path.resolve(process.env.MONTRA_REPO_ROOT||'');
assert(process.env.MONTRA_REPO_ROOT,'explicit source root required');
const output=path.resolve(process.env.MONTRA_MARKET_ARTIFACTS||path.join(os.tmpdir(),'market-evidence'));
const data=await mkdtemp(path.join(os.tmpdir(),'montra-market-test-'));
await mkdir(output,{recursive:true});
const report={scope:'Real seller listing → buyer catalog/filter/confirmation → full stack transfer → restart/save',commit:process.env.GITHUB_SHA||'local',checks:[],blockedOrigins:[],browserErrors:[],httpErrors:[],policyViolations:[],snapshots:[]};
const clean=value=>String(value).replace(/(?:mt1|ms1|mg1|mr1)_[a-f0-9]{64}/g,'[redacted disposable credential]');
const log=value=>{report.checks.push(value);console.log('PASS:',value);};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
let server,browser,backend,serverLog='',contexts=[],pages=[];
const staticServer=http.createServer(async(req,res)=>{
  try{
    const name=new URL(req.url,'http://127.0.0.1').pathname,file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
    assert(file.startsWith(root+path.sep));let bytes=await readFile(file);
    if(name==='/account-entry.js'){
      const source=bytes.toString(),literal='const server = "https://montra.157-85-96-139.sslip.io";';
      assert.equal(source.split(literal).length,2,'endpoint isolation contract changed');
      bytes=Buffer.from(source.replace(literal,'const server = '+JSON.stringify(backend)+';'));
    }
    res.setHeader('Content-Security-Policy',"connect-src 'self' "+backend+' '+backend.replace('http:','ws:'));
    res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html; charset=utf-8','.glb':'model/gltf-binary'})[path.extname(file)]||'application/octet-stream');res.end(bytes);
  }catch{res.statusCode=404;res.end();}
});
await new Promise(resolve=>staticServer.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+staticServer.address().port;
const probe=http.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
backend='http://127.0.0.1:'+port;
const env={...process.env,NODE_ENV:'test',PORT:String(port),MONTRA_TEST_DIR:data,MONTRA_CHARACTER_DIR:path.join(data,'characters'),MONTRA_ECONOMY_ENABLED:'1',MONTRA_WORLD_EXPANSION:'1',MONTRA_ACCOUNT_ORIGINS:origin,MONTRA_ACCOUNTS_REQUIRED:'1',MONTRA_DIRECTOR_ENABLED:'0',MONTRA_HUNT_EVENTS:'0',MONTRA_DYNAMIC_BALANCE_FILE:''};
for(const key of Object.keys(env))if(key.includes('TYPHOON'))delete env[key];
for(const key of ['MONTRA_CASTLE_PILOT','MONTRA_RIDGE_TERRAIN','MONTRA_ORIGINAL_RELIEF','MONTRA_ATLAS_RELIEF'])delete env[key];
async function until(fn,label,timeout=30000){const end=Date.now()+timeout;while(Date.now()<end){const result=await fn();if(result)return result;await sleep(100);}throw Error('Timed out: '+label);}
async function startServer(){
  server=spawn(process.execPath,['--import','tsx','src/server.ts'],{env,stdio:['ignore','pipe','pipe']});
  for(const stream of [server.stdout,server.stderr])stream.on('data',bytes=>{serverLog+=clean(bytes);});
  await until(async()=>{if(server.exitCode!==null)throw Error('Server exited: '+serverLog.slice(-2000));return fetch(backend+'/health').then(r=>r.ok).catch(()=>false);},'isolated server ready');
}
async function stopServer(){
  const child=server;if(!child||child.exitCode!==null||child.signalCode!==null)return;
  const exited=new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});
  child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),10000);try{await exited;}finally{clearTimeout(timer);server=undefined;}
}
async function inspect(stage,verify=false){
  const result=await exec(process.execPath,['--import','tsx','src/seed.ts',verify?'verify':'inspect'],{env});
  const snapshot=JSON.parse(result.stdout.trim());report.snapshots.push({stage,...snapshot});return snapshot;
}
async function checkpoint(predicate,label){return until(async()=>{const result=await inspect(label);return predicate(result)?result:null;},label);}
const cards=(page,box='#marketListings')=>page.locator(box+' article.market-product');
const card=(page,id,box='#marketListings')=>page.locator(box+' [data-listing-id="'+id+'"]');
async function screenshot(page,name){await page.screenshot({path:path.join(output,name+'.png')});}
async function openMarket(page){
  if(await page.locator('#drawerClose').isVisible())await page.locator('#drawerClose').click();
  await page.locator('#fieldMenuButton').click();
  const fly=page.locator('.map-sub').filter({hasText:'ตลาด'});
  if(await fly.isVisible())await fly.click();
  else{await page.locator('[data-journal-tab="social"]').click();await page.locator('#marketButton').click();}
  await page.locator('#economyMarketTab').waitFor({state:'visible'});
}
async function wallet(page,amount){await page.waitForFunction(n=>document.getElementById('economyStatus')?.textContent.replace(/[^0-9]/g,'')===String(n),amount);}
async function filter(page,query,category){
  await page.locator('#marketQuery').fill(query);await page.locator('#marketCategory').selectOption(category);await page.locator('#marketSearch').click();await page.locator('#marketSearch:enabled').waitFor({state:'visible'});
}
async function enter(fixture,role,phase='initial'){
  const started=Date.now(),timing={role,phase,startedAt:new Date(started).toISOString(),stages:[]};(report.admissions||=[]).push(timing);
  const mark=stage=>timing.stages.push({stage,elapsedMs:Date.now()-started});
  const actor=fixture.actors[role],context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,serviceWorkers:'block',recordVideo:{dir:path.join(output,'browser-video'),size:{width:390,height:844}}});contexts.push(context);
  const libraries={'https://cdn.babylonjs.com/babylon.js':path.resolve('libs/babylon.js'),'https://cdn.babylonjs.com/loaders/babylonjs.loaders.min.js':path.resolve('libs/babylonjs.loaders.min.js'),'https://unpkg.com/@colyseus/sdk@0.18.1/dist/colyseus.js':path.resolve('node_modules/@colyseus/sdk/dist/colyseus.js')};
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());if([origin,backend].includes(url.origin))return route.continue();
    if(libraries[url.href])return route.fulfill({path:libraries[url.href],contentType:'text/javascript'});
    if(!report.blockedOrigins.includes(url.origin))report.blockedOrigins.push(url.origin);return route.abort();
  });
  // Browser CSP enforces the socket boundary; no WebSocket interception or mock.
  await context.addInitScript(({session,guestKey,endpoint})=>{
    sessionStorage.setItem('montra_account_session_v1',session);localStorage.setItem('montra_guest_access_v1',guestKey);localStorage.setItem('montra_endpoint',endpoint);
    window.__marketPolicyViolations=[];window.__marketTrustedClicks=[];
    addEventListener('securitypolicyviolation',event=>{let origin=event.blockedURI;try{origin=new URL(origin).origin;}catch{}window.__marketPolicyViolations.push({directive:event.effectiveDirective,origin});});
    document.addEventListener('click',event=>{const el=event.target.closest?.('#marketSell,.market-product-action');if(el)window.__marketTrustedClicks.push({trusted:event.isTrusted,text:el.textContent});},true);
  },{session:actor.session,guestKey:actor.guestKey,endpoint:backend});
  const page=await context.newPage();pages.push(page);page.setDefaultTimeout(45000);
  page.on('pageerror',error=>report.browserErrors.push({role,phase,error:clean(error.message)}));
  page.on('response',response=>{if(response.status()>=400)report.httpErrors.push({role,phase,status:response.status(),path:new URL(response.url()).pathname});});
  page.on('requestfailed',request=>report.httpErrors.push({role,phase,path:new URL(request.url()).pathname,error:clean(request.failure()?.errorText)}));
  const response=await page.goto(origin,{waitUntil:'domcontentloaded',timeout:120000});
  mark('document-loaded');
  assert.equal(response.headers()['content-security-policy'],"connect-src 'self' "+backend+' '+backend.replace('http:','ws:'));
  const choice=page.locator('.account-slot').filter({hasText:actor.characterName});await choice.waitFor({state:'visible',timeout:120000});mark('character-slot-visible');await choice.click();mark('character-selected');
  await page.waitForFunction(()=>document.getElementById('modeBadge')?.textContent==='LIVE'&&document.getElementById('accountEntry')?.hidden,null,{timeout:90000});
  mark('live-world');await openMarket(page);await wallet(page,phase==='initial'?1000:role==='seller'?1210:790);mark('market-wallet-ready');return page;
}
async function collect(page){
  if(page.isClosed())return;
  report.policyViolations.push(...await page.evaluate(()=>window.__marketPolicyViolations));
  const clicks=await page.evaluate(()=>window.__marketTrustedClicks);assert(clicks.every(x=>x.trusted),'all tested actions use native trusted input');
  (report.clicks||=[]).push(...clicks);
}
async function closeContexts(){for(const page of pages)await collect(page);for(const context of contexts)await context.close();contexts=[];pages=[];}
async function closeSessions(){
  const offset=serverLog.length;await closeContexts();
  // MyRoom emits this only after awaiting save and releasing the character lock.
  await until(()=>serverLog.slice(offset).includes('MONTRA S2 leave:'),'server completed character save and disconnect',15000);
}
async function layout(page,width,label){
  await page.setViewportSize({width,height:844});await page.locator('#economyMarketTab').scrollIntoViewIfNeeded();
  const info=await page.locator('#drawer').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,viewport:innerWidth,cards:[...el.querySelectorAll('#marketListings .market-product')].map(card=>{const b=card.getBoundingClientRect();return{x:b.x,width:b.width,right:b.right};})}));
  assert(info.scroll<=info.width+1,'drawer fits '+width+'px');assert(info.cards.every(c=>c.x>=-1&&c.right<=width+1),'cards fit viewport');
  (report.layouts||=[]).push({label,...info});await screenshot(page,label+'-'+width);
  if(await cards(page).count()){await cards(page).first().scrollIntoViewIfNeeded();await screenshot(page,label+'-products-'+width);}
}
try{
  const product=JSON.parse(await readFile('product.json','utf8'));assert(product.productCommit&&product.productCommit!=='PENDING','final product pin required');
  for(const [file,expected]of Object.entries(product.sha256))assert.equal(sha(await readFile(path.join(root,file))),expected,'reviewed file changed: '+file);
  report.productCommit=product.productCommit;report.source={...product.sha256,babylon:sha(await readFile('libs/babylon.js')),loaders:sha(await readFile('libs/babylonjs.loaders.min.js'))};
  await exec(process.execPath,['--import','tsx','src/seed.ts'],{env});const fixture=JSON.parse(await readFile(path.join(data,'fixture.json'),'utf8'));
  await startServer();
  for(const role of ['seller','buyer']){
    const actor=fixture.actors[role];const room=await Promise.race([new Client(backend).joinOrCreate('my_room',{accountSession:actor.session,characterSlot:1,worldVersion:1,templeVersion:1,atlasVersion:1,provinceVersion:1,warVersion:1,castleVersion:2,riverCityVersion:1,terrainVersion:1,atlasReliefVersion:1,originalReliefVersion:1,monsterAutoAttackVersion:1}),sleep(15000).then(()=>{throw Error('Admission timeout: '+role);})]);await room.leave();
  }
  await sleep(700);log('Both real persisted accounts pass isolated server admission; preflight performs no market actions');
  browser=await chromium.launch({args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
  const seller=await enter(fixture,'seller');assert.equal(await seller.locator('#marketSell').isVisible(),false,'buy page keeps seller form out of sight');
  await seller.locator('#economyShopTab').click();await seller.locator('#marketSellForm > summary').click();await seller.locator('#marketSell').waitFor({state:'visible'});
  for(const [index,order]of fixture.orders.entries()){
    await seller.locator('#marketItem').selectOption(String(order.slot));await seller.locator('#marketAmount').fill(String(order.amount));await seller.locator('#marketPrice').fill(String(order.price));
    await seller.locator('#marketSell:enabled').click();await checkpoint(s=>s.listings.length===index+1,'seller-listing-'+(index+1));
    await seller.waitForFunction(count=>document.querySelectorAll('#marketOwnListings [data-listing-id]').length===count,index+1);
  }
  let snapshot=await inspect('four-browser-listings');assert.equal(snapshot.accounts.seller.quantities.mat_raw_wood_1,3);assert.equal(snapshot.accounts.seller.gold,1000);
  const ids=Object.fromEntries(snapshot.listings.map(x=>[x.item.itemId,x.id]));report.listingIds=ids;
  log('Seller creates four genuine listings from My Shop; exact escrow quantities and unchanged wallet verified in SQLite');
  await seller.locator('#marketSellForm > summary').click();await screenshot(seller,'01-seller-shop');
  // Cancel first requires a confirmation; no item returns before the second click.
  const cancel=card(seller,ids.mat_raw_stone_1,'#marketOwnListings').locator('.market-product-action');await cancel.click();assert.match(await cancel.innerText(),/ยืนยัน/);
  snapshot=await inspect('cancel-not-yet-confirmed');assert.equal(snapshot.listings.find(x=>x.id===ids.mat_raw_stone_1).state,'open');assert.equal(snapshot.accounts.seller.quantities.mat_raw_stone_1,3);
  await cancel.click();await checkpoint(s=>s.listings.find(x=>x.id===ids.mat_raw_stone_1)?.state==='cancelled','cancel-committed');
  await card(seller,ids.mat_raw_stone_1,'#marketOwnListings').waitFor({state:'detached'});
  // Keep only one software-rendered 3D context active on the CI runner.
  // The genuine seller is offline during purchase; no market or wallet is mocked.
  await closeSessions();
  const buyer=await enter(fixture,'buyer');await buyer.waitForFunction(()=>document.querySelectorAll('#marketListings article.market-product').length===3);
  assert.equal(await buyer.locator('#marketSell').isVisible(),false);
  for(const id of [ids.health_potion,ids.mat_raw_wood_1,ids.arcane_sword])assert(await card(buyer,id).isVisible());
  const wood=card(buyer,ids.mat_raw_wood_1);assert.match(await wood.locator('.market-product-price').innerText(),/210/);assert.match(await wood.innerText(),/70/);assert.match(await wood.innerText(),/3/);
  assert.equal(await wood.locator('details').getAttribute('open'),null);await wood.locator('summary').click();assert.notEqual(await wood.locator('details').getAttribute('open'),null);assert.equal(await wood.locator('summary').evaluate(el=>el===document.activeElement),true);await buyer.keyboard.press('Enter');assert.equal(await wood.locator('details').getAttribute('open'),null);await buyer.keyboard.press('Space');assert.notEqual(await wood.locator('details').getAttribute('open'),null);await layout(buyer,320,'02-product-details');await wood.locator('summary').click();
  for(const width of [320,390,1280])await layout(buyer,width,'03-catalog');
  await buyer.setViewportSize({width:390,height:844});
  log('Buyer sees product cards with item details, total/per-item price, and reachable layouts at 320, 390 and 1280 pixels');
  await filter(buyer,'ยา','consumable');await buyer.waitForFunction(id=>document.querySelectorAll('#marketListings [data-listing-id]').length===1&&document.querySelector('#marketListings [data-listing-id]')?.dataset.listingId===id,ids.health_potion);
  await filter(buyer,'ยา','material');await buyer.waitForFunction(()=>!document.querySelector('#marketListings [data-listing-id]')&&document.getElementById('marketListings')?.textContent.trim().length>0);await screenshot(buyer,'04-filter-empty');
  await filter(buyer,'ไม้','material');await buyer.waitForFunction(id=>document.querySelectorAll('#marketListings [data-listing-id]').length===1&&document.querySelector('#marketListings [data-listing-id]')?.dataset.listingId===id,ids.mat_raw_wood_1);
  log('Actual server Thai search and category filters return the expected item and explicit empty state');
  let buy=card(buyer,ids.mat_raw_wood_1).locator('.market-product-action');await buy.click();assert.match(await buy.innerText(),/ยืนยัน/);await layout(buyer,320,'04b-buy-confirmation');await card(buyer,ids.mat_raw_wood_1).locator('.market-product-cancel').click();assert.doesNotMatch(await buy.innerText(),/ยืนยัน/);await buy.click();snapshot=await inspect('buy-not-yet-confirmed');assert.equal(snapshot.accounts.buyer.gold,1000);assert.equal(snapshot.accounts.buyer.quantities.mat_raw_wood_1,undefined);
  await buyer.locator('#economyShopTab').click();assert.equal(await buyer.locator('#marketOwnListings [data-listing-id]').count(),0);await buyer.locator('#economyMarketTab').click();
  await card(buyer,ids.mat_raw_wood_1).waitFor({state:'visible'});buy=card(buyer,ids.mat_raw_wood_1).locator('.market-product-action');assert.doesNotMatch(await buy.innerText(),/ยืนยัน/);
  await buy.click();await buyer.locator('#drawerClose').click();assert.equal(await buyer.locator('#drawer').isVisible(),false);await openMarket(buyer);await card(buyer,ids.mat_raw_wood_1).waitFor({state:'visible'});
  buy=card(buyer,ids.mat_raw_wood_1).locator('.market-product-action');assert.doesNotMatch(await buy.innerText(),/ยืนยัน/);snapshot=await inspect('dismissed-confirmation');assert.equal(snapshot.accounts.buyer.gold,1000);assert.equal(snapshot.receipts.filter(x=>x.kind==='buy').length,0);
  log('First buy click, switching to My Shop, and closing/reopening the market do not spend money or retain confirmation');
  await buy.click();await screenshot(buyer,'05-buy-confirmation');await buy.dblclick({delay:60});
  snapshot=await checkpoint(s=>s.accounts.buyer.gold===790&&s.accounts.seller.gold===1210,'full-stack-buy');
  assert.equal(snapshot.accounts.buyer.quantities.mat_raw_wood_1,3);assert.equal(snapshot.receipts.filter(x=>x.kind==='buy').length,1);
  await card(buyer,ids.mat_raw_wood_1).waitFor({state:'detached'});await wallet(buyer,790);await screenshot(buyer,'06-purchased-wallet');
  log('Confirmed rapid repeated pointer input commits exactly one 210-gold sale, transfers all three items, removes listing and pays seller');
  await buyer.locator('#drawerClose').click();await buyer.locator('#bag').click();const receivedSlot=snapshot.accounts.buyer.inventory.slots.findIndex(x=>x?.itemId==='mat_raw_wood_1');
  const tile=buyer.locator('#bagSlot'+receivedSlot);assert.match(await tile.innerText(),/3/);await tile.click();await buyer.locator('#itemDetailModal').waitFor({state:'visible'});assert.match(await buyer.locator('#itemDetailModal').innerText(),/ไม้/);await screenshot(buyer,'08-delivered-inventory');await buyer.locator('#itemModalClose').click();
  await closeSessions();
  const sellerPaid=await enter(fixture,'seller','paid');await sellerPaid.locator('#economyShopTab').click();await sellerPaid.locator('#shopRefresh:enabled').click();await wallet(sellerPaid,1210);await sellerPaid.waitForFunction(()=>document.querySelectorAll('#marketOwnListings [data-listing-id]').length===2);assert.equal(await card(sellerPaid,ids.mat_raw_wood_1,'#marketOwnListings').count(),0);await screenshot(sellerPaid,'07-seller-paid');
  log('Seller logs back in after the offline sale with exactly 1210 gold and two remaining listings');
  await closeSessions();await stopServer();await inspect('first-durable-verification',true);
  await startServer();const buyerAfter=await enter(fixture,'buyer','restart');
  await buyerAfter.waitForFunction(()=>document.querySelectorAll('#marketListings [data-listing-id]').length===2);
  assert.equal(await card(buyerAfter,ids.mat_raw_wood_1).count(),0);assert.equal(await card(buyerAfter,ids.mat_raw_stone_1).count(),0);
  await screenshot(buyerAfter,'09-persisted-buyer-catalog');
  await buyerAfter.locator('#drawerClose').click();await buyerAfter.locator('#bag').click();assert.match(await buyerAfter.locator('#bagSlot'+receivedSlot).innerText(),/3/);await screenshot(buyerAfter,'11-persisted-buyer-inventory');
  await closeSessions();const sellerAfter=await enter(fixture,'seller','restart');await sellerAfter.locator('#economyShopTab').click();await sellerAfter.waitForFunction(()=>document.querySelectorAll('#marketOwnListings [data-listing-id]').length===2);await screenshot(sellerAfter,'10-persisted-seller-shop');
  await closeSessions();await stopServer();await inspect('second-durable-verification',true);
  log('After actual process restart both accounts retain exact wallet, listings and transferred stack; second disk check confirms one buy receipt');
  // Separate catalog-only setup after the preceding exact transaction checks.
  // These 31 listings are explicitly seeded with native stores, not attributed to UI actions.
  await exec(process.execPath,['--import','tsx','src/seed.ts','pagination'],{env});
  await startServer();const pagedBuyer=await enter(fixture,'buyer','restart');
  await pagedBuyer.waitForFunction(()=>document.querySelectorAll('#marketListings [data-listing-id]').length===30);
  await pagedBuyer.locator('#marketMore:enabled').click();
  await pagedBuyer.waitForFunction(()=>document.querySelectorAll('#marketListings [data-listing-id]').length===33);
  const pageIds=await cards(pagedBuyer).evaluateAll(nodes=>nodes.map(x=>x.dataset.listingId));assert.equal(new Set(pageIds).size,33);assert.equal(await pagedBuyer.locator('#marketMore').isVisible(),false);
  await screenshot(pagedBuyer,'12-pagination-complete');
  await filter(pagedBuyer,'','equipment');await pagedBuyer.waitForFunction(id=>document.querySelectorAll('#marketListings [data-listing-id]').length===1&&document.querySelector('#marketListings [data-listing-id]')?.dataset.listingId===id,ids.arcane_sword);
  await pagedBuyer.locator('#marketQuery').fill('ยา');await pagedBuyer.locator('#marketCategory').selectOption('consumable');await pagedBuyer.locator('#marketSearch').click();
  await pagedBuyer.locator('#economyAuctionTab').click();await pagedBuyer.locator('#economyShopTab').click();
  await pagedBuyer.waitForFunction(()=>document.getElementById('economyShopTab')?.getAttribute('aria-pressed')==='true'&&!document.querySelector('#marketOwnListings [data-listing-id]')&&!document.getElementById('shopResultStatus')?.textContent.includes('กำลังโหลด'));
  await pagedBuyer.locator('#economyMarketTab').click();await pagedBuyer.waitForFunction(id=>document.querySelectorAll('#marketListings [data-listing-id]').length===1&&document.querySelector('#marketListings [data-listing-id]')?.dataset.listingId===id,ids.health_potion);
  assert.equal(await pagedBuyer.locator('#marketQuery').inputValue(),'ยา');assert.equal(await pagedBuyer.locator('#marketCategory').inputValue(),'consumable');
  await screenshot(pagedBuyer,'13-filter-retained-after-tabs');
  await closeSessions();await stopServer();
  log('Catalog-only fixture: real 30 + 3 cursor pages contain 33 unique products; filter resets pagination and rapid tab changes preserve the correct buyer filter');
  assert.deepEqual(report.policyViolations,[]);assert.deepEqual(report.browserErrors,[]);assert(!report.blockedOrigins.some(origin=>/sslip\.io/.test(origin)),'no production access attempted');
  report.outcome='passed';
}catch(error){
  report.outcome='failed';report.error=clean(error.stack||error);console.error(report.error);process.exitCode=1;
  for(const [index,page]of pages.entries())if(!page.isClosed()){
    (report.lastScreens||=[]).push(await page.evaluate(()=>({mode:document.getElementById('modeBadge')?.textContent,entryHidden:document.getElementById('accountEntry')?.hidden,slotLabels:[...document.querySelectorAll('.account-slot')].map(x=>x.textContent),entryError:document.querySelector('.account-error')?.textContent,drawerTitle:document.getElementById('drawerTitle')?.textContent})).catch(()=>({unavailable:true})));
    await screenshot(page,'failure-'+index).catch(()=>{});
  }
}finally{
  await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await writeFile(path.join(output,'server.log'),clean(serverLog));
  try{await closeContexts();await browser?.close();await stopServer();await new Promise(resolve=>staticServer.close(resolve));}catch(error){report.cleanupError=clean(error.stack||error);report.outcome='failed';process.exitCode=1;}
  await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await writeFile(path.join(output,'server.log'),clean(serverLog));
}
