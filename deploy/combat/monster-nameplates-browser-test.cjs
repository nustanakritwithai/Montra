/** Shipped DEMO only. Production backend traffic is blocked. */
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
 const root=path.resolve(__dirname,'../..'),out=path.join(root,'monster-nameplates-browser-evidence');fs.mkdirSync(out,{recursive:true});
 const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost'),relative=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname),file=path.resolve(root,'.'+relative);if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}fs.readFile(file,(e,data)=>{if(e){res.writeHead(404);res.end();return;}res.setHeader('content-type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.glb':'model/gltf-binary'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
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
   await page.goto(origin,{waitUntil:'domcontentloaded',timeout:120000});await page.locator('#loading').waitFor({state:'hidden',timeout:120000});await page.locator('#accountEntry').waitFor({state:'hidden'});
   const label=page.locator('.monster-label:not([hidden])').first();await label.waitFor({state:'visible',timeout:20000});assert.match(await label.textContent(),/Lv 1/);assert.equal(await label.evaluate(el=>getComputedStyle(el).pointerEvents),'none');
   await page.screenshot({path:path.join(out,'nameplates-'+width+'x'+height+'.png')});report.screens.push({width,height,label:await label.textContent()});await context.close();
  }
  assert.deepEqual(report.errors,[],'no browser runtime errors');console.log(JSON.stringify(report,null,2));
 }finally{for(const context of browser.contexts())for(const page of context.pages())await page.screenshot({path:path.join(out,'last-state-'+context.pages().indexOf(page)+'.png')}).catch(()=>{});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
