/** Shipped field controls, sync functions, class IDs and arc layout in Chromium.
 * Server catalog names/costs come from source; character snapshots are synthetic.
 * No production account, backend or physical mobile device is used. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const ids={phutthaisawan:['phuttha_core','sritra_core','atamat_core','chumphon_core'],muay_boran:['chaiya','korat','lopburi','thasao'],blade:['blade_vanish','blade_heavy','blade_withdraw','blade_fury'],sentinel:['shock','bulwark','riposte','protect'],seer:['seer_pot','seer_binding','seer_poison','seer_buffalo'],mender:['mender_core_heal','mender_core_circle','mender_core_ward','mender_core_cleanse']};
const barIds={phutthaisawan:'swordHotbar',muay_boran:'muayHotbar',blade:'bladeHotbar',sentinel:'sentinelHotbar',seer:'occultHotbar',mender:'occultHotbar'};
function slice(source,start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a,start);return source.slice(a,b);}
function fixture(){
 const f=require('./class-skills-browser-test.cjs').fixture(),index=read('index.html');
 const dock=slice(index,'    <div class="field-dock">','    <section id="fishingPanel"');
 f.html=f.html.replace('<main id="game">','<main id="game">'+dock+'<div id="toast"></div>');
 const files=['SkillCatalog.ts','MuayRules.ts','BladeRules.ts','SentinelRules.ts','OccultRules.ts'].map(f=>read('deploy/combat/'+f)).join('\n');
 const nodes={};for(const id of Object.values(ids).flat()){
  const match=files.match(new RegExp('\\b'+id+':\\s*(\\{[^}]+\\})'));assert(match,'server core '+id);
  // Only a checked-in literal object, never remote content or a live player snapshot.
  nodes[id]=Function('return ('+match[1]+')')();assert(nodes[id].name&&nodes[id].stamina>0);
 }
 f.script+=`\nlet occultRequestKey='',occultHotbarKey='',occultCurseUntil=0,seerBoundTarget='',seerPoisoned=false,selectedOccultSkill='';
let bladeRequestKey='',bladeHotbarKey='',bladeCloakUntil=0,bladeMarkUntil=0,bladeMarkedTarget='',bladeOpeningUntil=0,bladeCounterUntil=0,selectedBladeSkill='';
let sentinelRequestKey='',sentinelHotbarKey='',sentinelCounterUntil=0,sentinelCoreStanceUntil=0,sentinelChallengeUntil=0;
let spellTargetId='',activeMapId='ritual_village',partyState=null;
const weaponModelFor=(id,path)=>path==='muay_boran'?'muay_wraps':'thai_dual';
const monsterForSpell=()=>null,castAtTarget=()=>{};
ui.toast=$('toast');
${read('src/client/core/001-storage-and-dom.js').slice(read('src/client/core/001-storage-and-dom.js').indexOf('  function positionSwordToast()'))}
${slice(read('src/client/ui/042-vitals-chat-and-status.js'),'  const ORB_SEGS','  // ---- Resource strip')}
const hotbarIds=${JSON.stringify(barIds)},serverNodes=${JSON.stringify(nodes)};
fixture.syncHotbars=()=>{const me=ownServerCharacter();syncSwordHotbar();syncMuayHotbar();syncBladeUI(me);syncSentinelUI(me);syncOccultUI(me);layoutOrbArc();};
fixture.hotbarSnapshot=(path,state='ready')=>{
 mode='live';const me=snapshot(path);Object.assign(me,{mana:state==='no-mana'?0:300,alive:state!=='dead',stunned:false,muayData:'{}'});
 const catalogFor=p=>{const c=catalog(p);for(const id of classIds[p])c.core[id]=serverNodes[id];return c;};
 const book={coreRanks:{},menderCoreRanks:{},cooldowns:{},learned:[],training:{}};
 if(state==='cooldown')for(const id of classIds[path])book.cooldowns[id]=Date.now()+30000;
 if(state==='ranked')for(const id of classIds[path])book.coreRanks[id]=book.menderCoreRanks[id]=1;
 me.swordTreeData=JSON.stringify(book);me.muayBookData=JSON.stringify(book);me.muayData=JSON.stringify(book.cooldowns);
 room.state.swordTreeCatalog=JSON.stringify(catalogFor('phutthaisawan'));room.state.muayBookCatalog=JSON.stringify(catalogFor('muay_boran'));
 bladeBookState={...catalogFor('blade'),book:structuredClone(book)};
 sentinelBookState={...catalogFor('sentinel'),book:structuredClone(book)};
 occultBookState={...catalogFor(path==='mender'?'mender':'seer'),path,book:structuredClone(book)};
 swordHotbarKey=muayHotbarKey=bladeHotbarKey=sentinelHotbarKey=occultHotbarKey='';
 fixture.syncHotbars();return hotbarIds[path];
};`;
 return f;
}
async function main(){
 const {chromium}=require('playwright'),f=fixture(),out=process.env.MONTRA_HOTBAR_EVIDENCE||path.join(root,'class-skills-browser-evidence','hotbar');fs.mkdirSync(out,{recursive:true});
 const css=process.env.MONTRA_HOTBAR_CSS?fs.readFileSync(process.env.MONTRA_HOTBAR_CSS,'utf8'):read('styles.css');
 const report={cases:[],errors:[],limits:'Shipped DOM, sync functions and layout; source catalog and synthetic character snapshots. Chromium desktop/mobile emulation only; no physical phone or production player login.'};
 const server=http.createServer((req,res)=>{res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src data:; connect-src 'none'");res.setHeader('Content-Type',(req.url==='/fixture.js'?'text/javascript':req.url==='/styles.css'?'text/css':'text/html')+'; charset=utf-8');res.end(req.url==='/fixture.js'?f.script:req.url==='/styles.css'?css:f.html);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true});
 try{for(const [width,height,mobile] of [[1366,768,false],[390,844,true],[320,640,true],[844,390,true]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce'}),page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(origin);await page.waitForFunction(()=>window.fixture?.hotbarSnapshot);
  for(const [job,skills] of Object.entries(ids))for(const state of ['ready','ranked','cooldown','no-mana','dead']){
   const bar=await page.evaluate(({job,state})=>fixture.hotbarSnapshot(job,state),{job,state});
   await page.evaluate(()=>new Promise(requestAnimationFrame));
   const rows=await page.locator('#'+bar+' button').evaluateAll(buttons=>Promise.all(buttons.map(async b=>{
    const g=b.querySelector('.glyph'),s=getComputedStyle(g),r=g.getBoundingClientRect();
    const reference=document.createElement('span');reference.className='skill-book-icon';reference.dataset.skillGlyph=b.dataset.skillId;document.body.append(reference);const canonical=getComputedStyle(reference).backgroundImage;reference.remove();
    let decoded=false;if(s.backgroundImage.startsWith('url("data:image/svg+xml,'))decoded=await new Promise(resolve=>{const i=new Image();i.onload=()=>resolve(i.naturalWidth>0&&i.naturalHeight>0);i.onerror=()=>resolve(false);i.src=s.backgroundImage.slice(5,-2);});
    return {id:b.dataset.skillId,glyph:g.dataset.skillGlyph,decoded,matchesBook:s.backgroundImage===canonical,image:s.backgroundImage.slice(0,60),disabled:b.disabled,name:b.querySelector('.field-skill-name').textContent,area:r.width*r.height,inside:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,timer:!!g.querySelector('.slot-timer')};
   })));
   report.cases.push({width,height,job,state,rows});
   if(state==='ready')await page.screenshot({animations:'disabled',path:path.join(out,width+'-'+job+'.png')});
   assert.deepEqual(rows.map(r=>r.id),skills,job+' actual buttons');
   if(!process.env.MONTRA_HOTBAR_AUDIT_ONLY)for(const r of rows){assert(r.decoded,job+' '+r.id+' actual hotbar must decode artwork, not a gradient');assert.equal(r.glyph,r.id);assert(r.matchesBook,job+' same artwork as book');assert(r.area>=1600&&r.inside,job+' visible hit artwork');assert.equal(r.disabled,state==='cooldown'||state==='no-mana'||state==='dead');assert.equal(r.timer,state==='cooldown');assert(r.name,'skill name retained');}
   if(state==='ready'){const choices={phutthaisawan:['sritra_core','sword_core_skill'],muay_boran:['chaiya','muay_core_skill'],blade:['blade_vanish','blade_core_skill'],sentinel:['shock','sentinel_core_skill'],seer:['seer_pot','seer_core_skill'],mender:['mender_core_circle','mender_core_skill']};const [id,command]=choices[job];await page.evaluate(()=>fixture.wire.length=0);await page.locator('#'+bar+' [data-skill-id="'+id+'"]').click();assert.deepEqual(await page.evaluate(()=>fixture.wire),[{command,payload:{skillId:id}}],'actual button retains skill dispatch');}
   const before=await page.locator('#'+bar).innerHTML();await page.evaluate(()=>fixture.syncHotbars());assert.equal(await page.locator('#'+bar).innerHTML(),before,'repeat sync stable');
  }
  await page.evaluate(()=>{fixture.setMode('demo');fixture.syncHotbars();});assert.equal(await page.locator('.learned-bar .sword-hotbar:not([hidden])').count(),0,'demo has no live skill controls');
  await context.close();
 }
 assert.deepEqual(report.errors,[]);console.log((process.env.MONTRA_HOTBAR_AUDIT_ONLY?'AUDIT hotbar browser (artwork assertions skipped): ':'PASS hotbar browser: ')+report.cases.length+' states / '+report.cases.reduce((s,c)=>s+c.rows.length,0)+' actual buttons');
 }catch(e){report.failure=e.stack;throw e;}finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();await new Promise(r=>server.close(r));}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={fixture};
