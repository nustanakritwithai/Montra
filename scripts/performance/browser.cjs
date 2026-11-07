/** Isolated DEMO comparison. No production accounts, WebSockets, or backend requests. */
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {chromium}=require('playwright');
const {allowedCDNURL,assertReadyState,sampleFrames}=require('./browser-support.cjs');
(async()=>{
 const [base,candidate,output]=process.argv.slice(2);assert(output,'Usage: browser.cjs BASELINE_ROOT CANDIDATE_ROOT OUTPUT_DIR');
 const roots={baseline:path.resolve(base),candidate:path.resolve(candidate)},out=path.resolve(output);fs.mkdirSync(out,{recursive:true});
 let root=roots.baseline,browser;
 const external=new Map(),report={kind:'headless SwiftShader DEMO observation, not physical mobile/GPU or multiplayer',scenario:{viewports:[[390,844],[1366,768]],rounds:4,drawerCycles:20,frames:120,reducedMotion:'reduce',network:'localhost; shared frozen CDN responses; all WebSockets blocked',seed:'uncontrolled game randomness; no deterministic end-to-end claim',cache:'fresh context per observation, one unmeasured warm-up per variant'},runs:[],external:[],status:'incomplete'};
 report.revisions=Object.fromEntries(Object.entries(roots).map(([label,directory])=>[label,{commit:execFileSync('git',['-C',directory,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),tree:execFileSync('git',['-C',directory,'rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim()}]));
 const checkpoint=()=>{const file=path.join(out,'browser.json');fs.writeFileSync(file+'.tmp',JSON.stringify(report,null,2));fs.renameSync(file+'.tmp',file);};
 checkpoint();
 const server=http.createServer((req,res)=>{try{const u=new URL(req.url,'http://localhost'),f=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));if(!f.startsWith(root+path.sep)){res.writeHead(403);return res.end();}fs.readFile(f,(e,data)=>{res.writeHead(e?404:200,{'content-type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.glb':'model/gltf-binary'})[path.extname(f)]||'application/octet-stream','cache-control':'no-store'});res.end(e?'':data);});}catch{res.writeHead(400);res.end();}});
 await new Promise((resolve,reject)=>{server.on('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const origin='http://127.0.0.1:'+server.address().port;
 try{
  browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});report.browser=browser.version();
  for(const [width,height] of report.scenario.viewports)for(let round=-1;round<4;round++)for(const label of round%2?['candidate','baseline']:['baseline','candidate']){
   root=roots[label];const run={label,width,height,round,status:'incomplete',errors:[],blocked:[],snapshots:[]};report.runs.push(run);checkpoint();
   const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce',serviceWorkers:'block'});
   try{
    await context.routeWebSocket('**/*',ws=>{run.blocked.push(ws.url());ws.close();});
    await context.route('**/*',async route=>{
     try{
     const u=new URL(route.request().url());
     if(u.origin===origin&&u.pathname==='/account-entry.js')return route.fulfill({contentType:'text/javascript',body:'window.MontraEntry={start(){window.__entryStarted=true;document.getElementById("accountEntry").hidden=true;},worldUnavailable(message){window.__worldUnavailable=message;}};'});
     if(u.origin===origin)return route.continue();
     if(allowedCDNURL(u.href,route.request().method())){
      // A promise is cached before fetch to prevent concurrent duplicate downloads.
      if(!external.has(u.href))external.set(u.href,(async()=>{const response=await route.fetch({maxRedirects:0});assert(response.ok(),`CDN failed: ${u.href}`);const body=await response.body();report.external.push({url:u.href,bytes:body.length,sha256:crypto.createHash('sha256').update(body).digest('hex')});checkpoint();return {body,contentType:response.headers()['content-type']||'application/octet-stream'};})());
      const entry=await external.get(u.href);return route.fulfill({status:200,...entry});
     }
     run.blocked.push(u.href);return route.abort();
     }catch(error){run.errors.push('Resource route: '+String(error));checkpoint();await route.abort().catch(()=>{});}
    });
    const page=await context.newPage();page.on('pageerror',e=>{run.errors.push(e.message);checkpoint();});
    page.on('response',response=>{if(response.status()>=400){run.errors.push(`HTTP ${response.status()}: ${response.url()}`);checkpoint();}});
    const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
    await page.goto(origin,{waitUntil:'domcontentloaded',timeout:120000});
    await page.locator('#loading').waitFor({state:'hidden',timeout:120000});await page.locator('#characterProfile').waitFor({state:'visible'});
    run.observedReadyMs=await page.evaluate(()=>performance.now());
    run.scene=await page.evaluate(()=>{const s=BABYLON.EngineStore.LastCreatedScene;return {entryStarted:window.__entryStarted===true,unavailable:window.__worldUnavailable??null,mode:document.getElementById('modeBadge').textContent.trim(),drawerHidden:document.getElementById('drawer').hidden,meshes:s.meshes.length,camera:s.activeCamera?.getClassName()};});assertReadyState(run.scene);
    async function snapshot(stage){
     const counters=await cdp.send('Memory.getDOMCounters');const {metrics}=await cdp.send('Performance.getMetrics');
     const heap=metrics.find(x=>x.name==='JSHeapUsedSize')?.value;
     assert(Number.isFinite(heap),'Missing JS heap metric');
     const intervals=await page.evaluate(sampleFrames);
     run.snapshots.push({stage,...counters,heapBytes:heap,rafIntervalsMs:intervals});checkpoint();
    }
    await snapshot('ready');
    for(let i=1;i<=20;i++){
     await page.locator('#characterProfile').click();await page.locator('#drawer').waitFor({state:'visible'});
     await page.locator('#drawerClose').click();await page.locator('#drawer').waitFor({state:'hidden'});
     if(i%5===0)await snapshot('drawer-cycle-'+i);
    }
    assert.deepEqual(run.errors,[],'browser runtime/resource errors');run.status='complete';checkpoint();
   }finally{await context.close();}
  }
  report.status='observations complete; timing and retention require review, no performance pass claim';
 }catch(error){report.error=String(error.stack||error);throw error;}
 finally{
  checkpoint();if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
