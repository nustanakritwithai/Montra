/** Render the shipped client in DEMO only. All production backend traffic is blocked. */
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
 const root=path.resolve(__dirname,'../..'),out=path.join(root,'hud-browser-evidence');fs.mkdirSync(out,{recursive:true});
 const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost'),relative=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname),file=path.resolve(root,'.'+relative);if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}fs.readFile(file,(e,data)=>{if(e){res.writeHead(404);res.end();return;}const ext=path.extname(file);res.setHeader('content-type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.glb':'model/gltf-binary'})[ext]||'application/octet-stream');res.end(data);});});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const report={screens:[],errors:[],blocked:[]};
 try{
  for(const [width,height] of [[320,640],[390,844],[844,390],[1366,768]]){
   const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce',serviceWorkers:'block'});
   await context.route('**/*',route=>{const u=new URL(route.request().url());
    if(u.origin===origin&&u.pathname==='/account-entry.js')return route.fulfill({contentType:'text/javascript',body:'window.MontraEntry={start(){document.getElementById("accountEntry").hidden=true;},worldUnavailable(message){window.__worldUnavailable=message;}};'});
    if(u.origin===origin||['https://cdn.babylonjs.com','https://unpkg.com'].includes(u.origin))return route.continue();
    report.blocked.push(u.origin);return route.abort();
   });
   const page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));
   await page.goto(origin,{waitUntil:'domcontentloaded',timeout:120000});
   await page.locator('#loading').waitFor({state:'hidden',timeout:120000});await page.locator('#accountEntry').waitFor({state:'hidden'});
   const card=page.locator('#characterProfile');await card.waitFor({state:'visible'});
   const box=await page.locator('.profile-card').boundingBox(),map=await page.locator('.location-area').boundingBox(),quest=await page.locator('#quest').boundingBox();
   const minimap=await page.locator('.mini-map').boundingBox();
   assert(map.x>=0&&map.x+map.width<=width&&minimap.x+minimap.width<=width,'location and minimap inside viewport');
   assert(box.x>=0&&box.y>=0&&box.x+box.width<=width,'card inside viewport');assert(box.height<=80,'compact card height');
   assert(box.x+box.width<=map.x||box.y+box.height<=map.y||map.y+map.height<=box.y,'card and minimap do not overlap');
   if(quest)assert(quest.y>=box.y+box.height,'quest stays below card');
   const chat=await page.locator('.chat-box').boundingBox();
   if(quest&&chat)assert(quest.x+quest.width<=chat.x||chat.x+chat.width<=quest.x||quest.y+quest.height<=chat.y||chat.y+chat.height<=quest.y,'quest and chat do not overlap');
   assert.equal(await page.locator('.identity .hud-meter:visible').count(),0);
   assert.equal(await page.locator('.exp-base').count(),1);
   await card.click();await page.locator('#drawer').waitFor({state:'visible'});assert(await page.locator('#drawerTitle').textContent());
   await page.locator('#drawerClose').click();await page.locator('#drawer').waitFor({state:'hidden'});
   await card.focus();await page.keyboard.press('Enter');await page.locator('#drawer').waitFor({state:'visible'});
   await page.keyboard.press('Escape');await page.locator('#drawer').waitFor({state:'hidden'});
   const orb=page.locator('.vital-orb');
   assert.equal(await orb.evaluate(el=>el.tagName),'BUTTON');
   await orb.click();assert.equal(await page.locator('#drawer').isVisible(),false,'orb attacks without opening profile');
   await orb.focus();await page.keyboard.press('Enter');await page.keyboard.press('Space');
   assert.equal(await page.locator('#drawer').isVisible(),false,'native orb keyboard activation never opens profile');
   assert.match(await orb.getAttribute('aria-label'),/โจมตีปกติ.*เลือด/);
   await page.screenshot({path:path.join(out,'hud-'+width+'x'+height+'.png')});
   // Static DOM clone freezes gameplay updates; these are explicitly stress fixtures, not gameplay.
   const stress=await context.newPage();
   await stress.setContent('<base href="'+origin+'/">'+(await page.content()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{waitUntil:'load'});
   await stress.evaluate(()=>{document.getElementById('characterName').textContent='นักรบผู้พิทักษ์แห่งอาณาจักรชื่อยาวมาก';document.getElementById('levelBadge').textContent='100';document.getElementById('characterClass').textContent='สำนักพุทธไธสวรรย์ระดับสูง';document.getElementById('classGlyph').classList.add('low-hp');});
   const warning=await stress.locator('#classGlyph').evaluate(el=>({color:getComputedStyle(el).borderTopColor,animation:getComputedStyle(el).animationName}));
   assert.equal(warning.color,'rgb(255, 106, 90)');assert.equal(warning.animation,'none');
   const stressBox=await stress.locator('.profile-card').boundingBox();
   assert(stressBox.x>=0&&stressBox.x+stressBox.width<=width&&stressBox.height<=80,'stress card remains compact and inside viewport');
   assert.equal(await stress.locator('#characterName').evaluate(el=>getComputedStyle(el).textOverflow),'ellipsis');
   await stress.screenshot({path:path.join(out,'stress-'+width+'x'+height+'.png')});
   report.screens.push({width,height,card:box,warning,profileMouseAndKeyboard:true});await context.close();
  }
  assert.deepEqual(report.errors,[],'no browser runtime errors');console.log(JSON.stringify(report,null,2));
 }finally{for(const context of browser.contexts())for(const page of context.pages())await page.screenshot({path:path.join(out,'last-state-'+context.pages().indexOf(page)+'.png')}).catch(()=>{});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
