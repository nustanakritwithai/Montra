/** Actual production click/rejection/toast paths, synthetic catalogs, no live writes. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const cases=[['phutthaisawan','sword_tree_needs_shrine'],['muay_boran','muay_book_needs_shrine'],['blade','blade_book_needs_shrine'],['sentinel','sentinel_book_needs_shrine'],['seer','occult_book_needs_shrine'],['mender','occult_book_needs_shrine']];
function between(source,a,b){const start=source.indexOf(a),end=source.indexOf(b,start);assert(start>=0&&end>start,a);return source.slice(start,end);}
function fixture(){
 const f=require('./class-skills-entry-browser-test.cjs').fixture();
 f.html=f.html.replace('<div id="toast"></div>',read('index.html').match(/<div id="toast"[^>]*><\/div>/)[0]);
 f.script=f.script.replace('toast=message=>notices.push(message), ','');
 f.script+='\nlet toastTimer;\n'+between(read('src/client/ui/003-toast-and-mode.js'),'  function toast(','  function setModeBadge(');
 // The production rejection handler now checks combat-feature errors first.
 // Load that real helper and its data, retaining the class-rejection assertions.
 const combat=read('src/client/combat/008-weapon-party-boss-feedback.js');
 f.script+='\nlet warBannerPendingUntil=0;\n'+between(combat,'  const METEOR_LEADER_REQUIRED_TEXT=', '  function isGuildPartyLeader(');
 f.script+=between(combat,'  function showCombatFeatureError(', '  function toggleCelestialFlight(');
 const network=read('src/client/network/044-state-sync-and-connection.js');
 f.script+='\nfunction showCombatFeatureError(){return false;}';
 f.script+='\nconst responses={},joined=room;let questNavigation=null,economyPending=false;room.onMessage=(name,callback)=>responses[name]=callback;\n'+between(network,'      joined.onMessage("command_rejected",','      joined.onMessage("warp_complete",');
 f.script+=between(network,'      joined.onMessage("sword_tree_changed",','      joined.onMessage("sword_counter_cleared",');
 f.script+='\nObject.assign(fixture,{reject:reason=>responses.command_rejected({reason}),accept:()=>responses.sword_tree_changed({action:"upgrade"}),notice:toast});';
 return f;
}
async function inspectNotice(page){await page.waitForFunction(()=>{const e=document.getElementById('toast');return e.classList.contains('show')&&Number(getComputedStyle(e).opacity)>.95;});return page.locator('#toast').evaluate(e=>{const r=e.getBoundingClientRect(),old=e.style.pointerEvents;e.style.pointerEvents='auto';const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);e.style.pointerEvents=old;return{text:e.textContent,parent:e.parentElement.id||e.parentElement.tagName,inert:!!e.closest('[inert]'),topmost:hit===e,coveredBy:hit?.id||hit?.className,x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,pointerEvents:getComputedStyle(e).pointerEvents,role:e.getAttribute('role')};});}
async function main(){
 const {chromium}=require('playwright'),f=fixture(),out=process.env.MONTRA_FEEDBACK_EVIDENCE||path.join(root,'class-skills-browser-evidence','feedback'),audit=process.argv.includes('--audit');fs.mkdirSync(out,{recursive:true});
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',(req.url==='/fixture.js'?'text/javascript':req.url==='/styles.css'?'text/css':'text/html')+'; charset=utf-8');res.end(req.url==='/fixture.js'?f.script:req.url==='/styles.css'?read('styles.css'):f.html);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true});const report={cases:[],errors:[]};
 try{for(const [width,height] of audit?[[390,844]]:[[390,844],[320,640],[844,390],[1366,768]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:width!==1366,hasTouch:width!==1366,reducedMotion:'reduce'}),page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>fixture.reject);
  for(const [job,reason] of audit?cases.slice(0,1):cases){
   await page.evaluate(job=>{fixture.fullSnapshot(job,25);fixture.openAdvanced();},job);
   await page.locator('[data-sg-core]').first().click();await page.locator('#skillModalUpgradeBtn').click();
   assert.equal(await page.evaluate(()=>fixture.wire.at(-1)?.payload.action),job==='phutthaisawan'?'upgrade':'core_upgrade');
   await page.evaluate(reason=>fixture.reject(reason),reason);
   const notice=await inspectNotice(page);report.cases.push({width,height,job,kind:'core',notice});
   if(!audit){assert(notice.topmost&&!notice.inert,'Core rejection must be visible above modal: '+JSON.stringify(notice));assert.equal(notice.pointerEvents,'none');assert.equal(notice.role,'status');assert(notice.x>=0&&notice.y>=0&&notice.right<=width+1&&notice.bottom<=height+1);assert.match(notice.text,/กลางหมู่บ้าน/);}
   await page.screenshot({path:path.join(out,width+'-'+job+'-core.png')});
   if(job==='phutthaisawan'){
    await page.evaluate(()=>{fixture.setRanks({phuttha_core:1});fixture.accept();});assert.match(await page.locator('#skillModalBadge').textContent(),/1\/8/);const accepted=await inspectNotice(page);if(!audit)assert(accepted.topmost&&!accepted.inert,'Saved confirmation visible');
    const sendsBefore=await page.evaluate(()=>fixture.wire.length);await page.locator('#skillModalUpgradeBtn').click();assert.equal(await page.evaluate(()=>fixture.wire.length),sendsBefore+1,'feedback does not intercept repeated button');assert.equal(await page.evaluate(()=>fixture.wire.at(-1)?.payload.action),'upgrade');
   }
   await page.locator('#skillModalCloseBtn').click();
   const ready=await page.evaluate(()=>fixture.advancedModel().nodes.find(n=>!n.learned&&n.checks.every(c=>c.ok)).id);await page.evaluate(id=>fixture.select(id),ready);await page.locator('[data-sg-learn]').click();
   assert.equal(await page.evaluate(()=>fixture.wire.at(-1)?.payload.skillId),ready);await page.evaluate(reason=>fixture.reject(reason),reason);const advanced=await inspectNotice(page);report.cases.push({width,height,job,kind:'advanced',notice:advanced});
   if(!audit)assert(advanced.topmost&&!advanced.inert,'Advanced rejection must be visible above drawer: '+JSON.stringify(advanced));
   await page.screenshot({path:path.join(out,width+'-'+job+'-advanced.png')});await page.locator('#drawerClose').click();
   if(!audit){await page.evaluate(()=>fixture.notice('ปิดตำราแล้ว'));assert((await inspectNotice(page)).topmost,'notice remains visible after close');}
  }await context.close();
 }assert.deepEqual(report.errors,[]);console.log((audit?'AUDIT ':'PASS ')+JSON.stringify(report));
 }catch(error){report.failure=error.stack;throw error;}finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();await new Promise(r=>server.close(r));}
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});module.exports={fixture};
