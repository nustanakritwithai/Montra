/** Render the shipped client in DEMO only. All production backend traffic is blocked. */
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
 const root=path.resolve(__dirname,'../..'),out=path.join(root,'camera-browser-evidence');fs.mkdirSync(out,{recursive:true});
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
   const state=()=>page.evaluate(()=>{const c=BABYLON.EngineStore.LastCreatedScene.activeCamera;return {radius:c.radius,alpha:c.alpha,beta:c.beta,meshes:BABYLON.EngineStore.LastCreatedScene.meshes.length};});
   const initial=await state();assert.equal(initial.radius,55);assert.equal(initial.beta,.70);assert(initial.meshes>100);
   await page.screenshot({path:path.join(out,'camera-'+width+'x'+height+'.png')});
   const canvas=page.locator('#world');
   await canvas.dispatchEvent('wheel',{deltaY:100});await page.waitForTimeout(200);assert.equal((await state()).radius,57);
   for(const [pointerId,clientX] of [[1,100],[2,200]])await canvas.dispatchEvent('pointerdown',{pointerId,pointerType:'touch',clientX,clientY:100});
   await canvas.dispatchEvent('pointermove',{pointerId:2,pointerType:'touch',clientX:300,clientY:100});await page.waitForTimeout(200);assert.equal((await state()).radius,28.5);
   for(const pointerId of [1,2])await canvas.dispatchEvent('pointerup',{pointerId,pointerType:'touch',clientX:100,clientY:100});
   await canvas.dispatchEvent('pointerdown',{pointerId:3,pointerType:'mouse',button:0,clientX:100,clientY:100});
   await canvas.dispatchEvent('pointermove',{pointerId:3,pointerType:'mouse',clientX:150,clientY:120});
   await canvas.dispatchEvent('pointerup',{pointerId:3,pointerType:'mouse',clientX:150,clientY:120});
   const rotated=await state();assert.notEqual(rotated.alpha,initial.alpha);assert.notEqual(rotated.beta,initial.beta);
   await page.setViewportSize({width:height,height:width});await page.waitForTimeout(500);
   const afterResize=await state();assert.equal(afterResize.radius,28.5);assert.equal(afterResize.alpha,rotated.alpha);assert.equal(afterResize.beta,rotated.beta);
   report.screens.push({width,height,initial,afterResize,wheelAndPinch:true,rotationPreserved:true});await context.close();
  }
  assert.deepEqual(report.errors,[],'no browser runtime errors');console.log(JSON.stringify(report,null,2));
 }finally{for(const context of browser.contexts())for(const page of context.pages())await page.screenshot({path:path.join(out,'last-state-'+context.pages().indexOf(page)+'.png')}).catch(()=>{});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
