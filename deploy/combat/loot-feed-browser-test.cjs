/** Full shipped HUD + production loot functions. Isolated snapshot fixtures, no
 * live login/account/game server. Test hooks exist only in this local response. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
async function main(){
 const root=path.resolve(__dirname,'../..'),out=path.join(root,'loot-feed-browser-evidence');fs.mkdirSync(out,{recursive:true});
 const read=p=>fs.readFileSync(path.join(root,p));
 const source=read('main.js').toString(),end=source.lastIndexOf('})();');assert(end>0);
 const patched=source.slice(0,end)+`\nwindow.__lootQA={snapshot:observeLootInventory,reset:resetLootFeed,history:()=>structuredClone(lootHistory),expire(){for(const x of lootHistory)x.at=Date.now()-9000;renderLootFeed();},setCatalog(){Object.assign(personalItems,{mat_raw_wood_1:{name:'ไม้ดิบ',kind:'material',family:'mat_raw_wood'},mat_metal_1:{name:'แร่เหล็ก',kind:'material',family:'mat_metal'},wp_twins_1:{name:'ดาบคู่เงาจันทร์ชื่อยาวสำหรับทดสอบบนมือถือ',kind:'mainHand',family:'wp_twins',path:'blade'}});}};\n`+source.slice(end);
 const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/main.js'){res.setHeader('content-type','text/javascript');return res.end(patched);}
  const file=path.resolve(root,pathname==='/'?'index.html':'.'+pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  fs.readFile(file,(e,data)=>{if(e){res.writeHead(404);return res.end();}res.setHeader('content-type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.glb':'model/gltf-binary'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const report={cases:[],errors:[],limits:'Full local HUD with production loot functions and synthetic inventory snapshots. No production login, save, game server or physical device.'};
 try{
  for(const [width,height]of [[320,568],[390,844],[844,390],[1366,768]]){
   const context=await browser.newContext({viewport:{width,height},isMobile:width<500,hasTouch:width<500,reducedMotion:'reduce',serviceWorkers:'block'});
   await context.route('**/*',r=>{const u=new URL(r.request().url());
    if(u.origin===origin&&u.pathname==='/account-entry.js')return r.fulfill({contentType:'text/javascript',body:'window.MontraEntry={start(){document.getElementById("accountEntry").hidden=true;}};'});
    if(u.href==='https://cdn.babylonjs.com/babylon.js')return r.fulfill({contentType:'text/javascript',body:fs.readFileSync(require.resolve('babylonjs'))});
    if(u.origin==='https://cdn.babylonjs.com'||u.origin==='https://unpkg.com')return r.fulfill({contentType:'text/javascript',body:''});
    if(u.origin===origin)return r.continue();return r.abort();});
   const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto(origin,{waitUntil:'domcontentloaded'});await page.locator('#loading').waitFor({state:'hidden',timeout:120000});
   await page.evaluate(()=>{__lootQA.setCatalog();const p={version:1,slots:Array(12).fill(null),equipment:{},forgeCopies:{}};__lootQA.snapshot(p);p.slots[0]={itemId:'mat_raw_wood_1',quantity:3};p.slots[1]={itemId:'mat_metal_1',quantity:2};p.forgeCopies.wp_twins_1=1;__lootQA.snapshot(p);__lootQA.snapshot(p);});
   assert.equal((await page.evaluate(()=>__lootQA.history())).length,3,'duplicate snapshots are quiet');await page.locator('#lootFeed').waitFor({state:'visible'});
   const bounds=await page.locator('#lootFeed').boundingBox();assert(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width&&bounds.y+bounds.height<=height,'feed stays in viewport');
   for(const selector of ['.field-dock','.chat-box','#quest','#characterProfile']){const b=await page.locator(selector).boundingBox();if(b)assert(bounds.x+bounds.width<=b.x||b.x+b.width<=bounds.x||bounds.y+bounds.height<=b.y||b.y+b.height<=bounds.y,'feed does not overlap '+selector+' at '+width+'x'+height);}
   assert.equal(await page.locator('#lootFeed').evaluate(el=>getComputedStyle(el).pointerEvents),'none');
   const art=await page.locator('#lootFeed .bag-symbol').evaluateAll(nodes=>Promise.all(nodes.map(el=>new Promise(resolve=>{const image=new Image();image.onload=()=>resolve(image.naturalWidth===256);image.onerror=()=>resolve(false);image.src=getComputedStyle(el).backgroundImage.slice(5,-2);})))) ;assert(art.every(Boolean),'canonical images decode');
   assert.match(await page.locator('#lootFeed').textContent(),/คลังช่าง/);await page.screenshot({path:path.join(out,width+'-hud.png')});
   await page.locator('#bag').click();await page.locator('#drawer').waitFor({state:'visible'});assert.equal(await page.locator('#lootFeed').isVisible(),false);await page.locator('.loot-history summary').click();
   assert.equal(await page.locator('#lootHistoryList .loot-row').count(),3);assert.match(await page.locator('#lootHistoryList').textContent(),/\+3/);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.screenshot({path:path.join(out,width+'-bag.png')});await page.locator('#drawerClose').click();assert.equal(await page.locator('#drawer').isVisible(),false);
   await page.evaluate(()=>__lootQA.expire());assert.equal(await page.locator('#lootFeed').isVisible(),false);await page.locator('#bag').click();await page.locator('.loot-history summary').click();assert.equal(await page.locator('#lootHistoryList .loot-row').count(),3,'history remains after fade/reopen');
   await page.evaluate(()=>__lootQA.reset());assert.equal(await page.locator('#lootHistoryList .loot-row').count(),0);assert.equal(await page.locator('#lootHistoryEmpty').isVisible(),true);
   report.cases.push({width,height,artworksDecoded:art.length,bounds,duplicateSuppressed:true,historyReopen:true,resetCleared:true});await context.close();
  }
  assert.deepEqual(report.errors,[]);console.log('PASS full HUD loot feed at 320,390,844,1366px; artwork, no control overlap, duplicate/reopen/reset');
 }catch(e){report.failure=e.stack;throw e;}finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
