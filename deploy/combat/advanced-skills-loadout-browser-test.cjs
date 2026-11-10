/** Production mixed config, hotbar, targeting and CSS with authoritative catalog snapshots.
 * No production characters or backend writes. Server integration is separate. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const classes=['phutthaisawan','muay_boran','blade','sentinel','seer','mender'];
const examples={phutthaisawan:'flowing_blades',muay_boran:'punch',blade:'shadow_cut',sentinel:'firm_guard',seer:'seer_ash_rice',mender:'mender_deep_heal'};
const commands={phutthaisawan:'sword_skill',muay_boran:'muay_skill',blade:'blade_skill',sentinel:'sentinel_skill',seer:'occult_skill',mender:'occult_skill'};
const barIds={phutthaisawan:'swordHotbar',muay_boran:'muayHotbar',blade:'bladeHotbar',sentinel:'sentinelHotbar',seer:'occultHotbar',mender:'occultHotbar'};
const coreCommands={phutthaisawan:'sword_core_skill',muay_boran:'muay_core_skill',blade:'blade_core_skill',sentinel:'sentinel_core_skill',seer:'seer_core_skill',mender:'mender_core_skill'};
function fixture(){
 const base=require('./class-skills-entry-browser-test.cjs').fixture();
 base.html=base.html.replace('<div id="toast"></div>','<div id="toast" class="toast"></div>');
 const input=read('src/client/input/039-movement-flight-and-climbing.js'),cast=input.slice(input.indexOf('  function castAtTarget('),input.indexOf('  function updateFlightButton('));
 base.script=base.script.replace('const monsterForSpell=()=>null,castAtTarget=()=>{};',`const monsterForSpell=id=>id==='monster-test'?room.state.monster:null;let selectedSentinelSkill='',selectedPkTargetId='';const syncPKHud=()=>{};${cast}`);
 const ackLine=read('src/client/network/044-state-sync-and-connection.js').split('\n').find(line=>line.includes('joined.onMessage("skill_hotbar_changed"'));
 assert(ackLine,'production mixed acknowledgment callback');
 base.script+=`\nconst ackCallbacks={};{const joined=room;joined.onMessage=(type,callback)=>{ackCallbacks[type]=callback;};${ackLine}}
const originalSync=fixture.syncHotbars;fixture.syncHotbars=()=>{originalSync();syncAdvancedSkillUI();layoutOrbArc();};
function applyAdvancedBook(book){const me=ownServerCharacter();if(me.pathId==='phutthaisawan')me.swordTreeData=JSON.stringify(book);else if(me.pathId==='muay_boran')me.muayBookData=JSON.stringify(book);else (me.pathId==='blade'?bladeBookState:me.pathId==='sentinel'?sentinelBookState:occultBookState).book=book;skillLoadoutKey='';fixture.syncHotbars();}
function applyMixedSlots(slots){const me=ownServerCharacter(),data=advancedSkillData();me.skillHotbarVersion=1;me.skillHotbarData=JSON.stringify({version:1,pathId:me.pathId,school:['sword','muay'].includes(data.kind)?data.book.school:'',slots});fixture.syncHotbars();}
Object.assign(fixture,{
 setup(path,id){fixture.close();fixture.setMode('live');fixture.fullSnapshot(path,100);const me=ownServerCharacter();Object.assign(me,{alive:true,stunned:false,mana:300,x:0,y:0,z:0,targetId:'monster-test',mapId:'ritual_village'});room.state.monster={id:'monster-test',alive:true,mapId:'ritual_village',x:1,y:0,z:0};room.state.summons=new Map([[localId,{kind:'pot_spirit'}]]);partyState=null;room.state.players.delete('ally-test');fixture.learnSnapshot(id);applyMixedSlots(coreSkillGraphData().ids.map(id=>({kind:'core',id})));wire.length=0;},
 acknowledge:()=>ackCallbacks.skill_hotbar_changed(),
 tickLoadout:()=>{syncClassSkillBookContext();syncAdvancedSkillUI();layoutOrbArc();},openLoadout:openSkillLoadout,
 applySlots:applyMixedSlots,mixed:mixedSkillData,coreIds:()=>coreSkillGraphData().ids,bar:()=>mixedSkillBar()?.id,
 technique(path,id){fixture.setup(path,id);const data=advancedSkillData(),book=structuredClone(data.book),node=data.lessons[id];if(data.kind==='sword' && node.school!=='common')book.school=node.school;if(data.kind==='muay')book.school=advancedData.catalogs.muay_boran.lessons[id].school;ownServerCharacter().possessionActive=node.effect==='trance';room.state.players.set('ally-test',{alive:true,mapId:'ritual_village',x:1,y:0,z:0,characterName:'Party friend'});partyState={members:[{sessionId:localId},{sessionId:'ally-test'}]};applyAdvancedBook(book);applyMixedSlots([{kind:'advanced',id},...coreSkillGraphData().ids.slice(0,3).map(id=>({kind:'core',id}))]);wire.length=0;},
 fullSlots(path,ids){fixture.setup(path,ids[0]);const data=advancedSkillData(),book=structuredClone(data.book);if(data.kind==='occult')book.learned[path]=ids;else book.learned=ids;applyAdvancedBook(book);applyMixedSlots([...ids.map(id=>({kind:'advanced',id})),...coreSkillGraphData().ids.map(id=>({kind:'core',id}))].slice(0,4));},
 cooldown(id,until){const data=advancedSkillData(),b=structuredClone(data.book);if(data.kind==='muay')ownServerCharacter().muayData=JSON.stringify({[id]:until});else{b.cooldowns[id]=until;applyAdvancedBook(b);}fixture.syncHotbars();},
 own:ownServerCharacter,advanced:advancedSkillData,
 prepareCore(){room.state.summons=new Map();room.state.players.set('ally-test',{alive:true,mapId:'ritual_village',x:1,y:0,z:0,characterName:'Party friend'});partyState={members:[{sessionId:localId},{sessionId:'ally-test'}]};fixture.syncHotbars();},
 rankedHeal(){fixture.setup('mender','mender_deep_heal');const b=structuredClone(advancedSkillData().book);b.menderCoreRanks={mender_core_heal:2};applyAdvancedBook(b);room.state.players.set('ally-test',{alive:true,mapId:'ritual_village',x:12.3,y:0,z:0,characterName:'Distant ally'});partyState={members:[{sessionId:localId},{sessionId:'ally-test'}]};fixture.syncHotbars();wire.length=0;},
 school(school){const b=structuredClone(advancedSkillData().book);b.school=school;applyAdvancedBook(b);},
 stale(){window.staleClick=mixedSkillBar().querySelector('[data-skill-id]')?.onclick;const s=$('skillLoadoutBody')?.querySelector('select');window.staleSelect=s?.onchange;},
 invokeStale(){window.staleClick?.();window.staleSelect?.();},
 expirePending(){if(skillLoadoutPending)skillLoadoutPending.until=0;fixture.tickLoadout();},
 legacy(){delete ownServerCharacter().skillHotbarVersion;delete ownServerCharacter().skillHotbarData;fixture.tickLoadout();},
 spiritState(active,summoned){ownServerCharacter().possessionActive=active;room.state.summons=new Map(summoned?[[localId,{kind:'pot_spirit'}]]:[]);fixture.tickLoadout();wire.length=0;}
});`;
 return base;
}
async function inside(page,selector){const r=await page.locator(selector).evaluate(e=>{e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button,select')===e};});assert(r.w>=40&&r.h>=40,selector+' touch size '+JSON.stringify(r));assert(r.x>=0&&r.right<=page.viewportSize().width+1&&r.y>=0&&r.bottom<=page.viewportSize().height+1,selector+' viewport '+JSON.stringify(r));assert(r.hit,selector+' not occluded '+JSON.stringify(r));}
async function main(){
 const {chromium}=require('playwright'),f=fixture(),out=process.env.MONTRA_ADVANCED_EVIDENCE||'/tmp/montra-mixed-browser-evidence';fs.mkdirSync(out,{recursive:true});
 const report={cases:[],catalogRoutes:[],coreRoutes:[],errors:[],limits:'Production DOM/functions/CSS with synthetic authoritative snapshots. Chromium emulation, not a physical phone or live production character. Network/save acknowledgment durability is verified separately by mixed-hotbar-integration.mjs.'};
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',(req.url==='/fixture.js'?'text/javascript':req.url==='/styles.css'?'text/css':'text/html')+'; charset=utf-8');res.end(req.url==='/fixture.js'?f.script:req.url==='/styles.css'?read('styles.css'):f.html);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.MONTRA_CHROMIUM_PATH?{executablePath:process.env.MONTRA_CHROMIUM_PATH}:{})});
 try{for(const [width,height,mobile] of [[390,844,true],[320,640,true],[844,390,true],[1366,768,false]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile}),page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.fixture?.setup);
  for(const job of classes){
   const id=examples[job],bar='#'+barIds[job],button=bar+' [data-skill-id="'+id+'"]';await page.evaluate(({job,id})=>fixture.setup(job,id),{job,id});
   assert.equal(await page.locator('#advancedHotbar,#skillBankToggle').count(),0,'no new bank or bar');
   assert.equal(await page.locator(bar+' button').count(),4,'existing four buttons');
   await inside(page,'#skillLoadoutButton');await page.locator('#skillLoadoutButton').click();
   assert.equal(await page.locator('[data-loadout-slot]').count(),4,'one mixed four-slot configuration');
   await inside(page,'[data-loadout-slot="0"]');
   const initial=await page.evaluate(()=>structuredClone(fixture.mixed()));const book=await page.evaluate(()=>structuredClone(fixture.advanced().book));
   await page.locator('[data-loadout-slot="1"]').selectOption('advanced:'+id);
   const equip=await page.evaluate(()=>fixture.wire.at(-1));const desired=structuredClone(initial);desired.slots[1]={kind:'advanced',id};
   assert.deepEqual(equip,{command:'skill_hotbar_set',payload:desired});
   assert(await page.locator('[data-loadout-slot="1"]').isDisabled(),'pending until schema');
   assert.deepEqual(await page.evaluate(()=>fixture.mixed()),initial,'no optimistic slot changes');
   assert.deepEqual(await page.evaluate(()=>fixture.advanced().book),book,'selection leaves learned ranks/books intact');
   await page.evaluate(()=>fixture.acknowledge());assert(await page.locator('[data-loadout-slot="1"]').isDisabled(),'ack alone cannot release pending before schema');
   await page.evaluate(slots=>fixture.applySlots(slots),desired.slots);
   assert.equal(await page.locator('[data-loadout-slot="1"]').inputValue(),'advanced:'+id);assert.equal(await page.locator('[data-loadout-slot="1"]').isDisabled(),false);
   // Selecting an equipped technique moves it rather than duplicating it.
   await page.locator('[data-loadout-slot="2"]').selectOption('advanced:'+id);
   const moved=await page.evaluate(()=>fixture.wire.at(-1));assert.equal(moved.payload.slots[1],null);assert.deepEqual(moved.payload.slots[2],{kind:'advanced',id});
   await page.evaluate(slots=>fixture.applySlots(slots),moved.payload.slots);
   await page.locator('[data-loadout-slot="3"]').selectOption('');
   assert.equal(await page.evaluate(()=>fixture.wire.at(-1).payload.slots[3]),null);
   await page.evaluate(()=>fixture.expirePending());assert.equal(await page.locator('[data-loadout-slot="3"]').isDisabled(),false,'timeout releases controls');
   assert.deepEqual(await page.evaluate(()=>fixture.mixed().slots),moved.payload.slots,'timeout never mutates authority');
   await page.locator('#loadoutPlay').click();await inside(page,button);
   await page.evaluate(()=>fixture.wire.length=0);if(mobile)await page.locator(button).tap();else await page.locator(button).click();
   const sent=await page.evaluate(()=>fixture.wire.at(-1));assert.equal(sent?.command,commands[job],job+' advanced command');assert.equal(sent.payload.skillId,id);
   await page.evaluate(()=>fixture.wire.length=0);await page.keyboard.press('3');assert.equal(await page.evaluate(()=>fixture.wire.at(-1)?.command),commands[job],'number key uses mixed slot');
   await page.evaluate(id=>fixture.cooldown(id,Date.now()+30000),id);assert(await page.locator(button).isDisabled(),'cooldown');
   await page.evaluate(id=>{fixture.cooldown(id,0);fixture.own().mana=0;fixture.tickLoadout();},id);assert(await page.locator(button).isDisabled(),'mana');
   await page.evaluate(()=>{fixture.own().mana=300;fixture.own().stunned=true;fixture.tickLoadout();});assert(await page.locator(button).isDisabled(),'stun');
   await page.evaluate(()=>{fixture.own().stunned=false;fixture.tickLoadout();});
   await page.screenshot({path:path.join(out,width+'-'+job+'-mixed.png')});await page.locator('#skillLoadoutButton').click();await page.screenshot({path:path.join(out,width+'-'+job+'-config.png')});
   await page.evaluate(()=>{fixture.stale();fixture.setMode('demo');fixture.tickLoadout();fixture.wire.length=0;fixture.invokeStale();});assert.deepEqual(await page.evaluate(()=>fixture.wire),[],'stale owner callbacks cannot send');
   await page.evaluate(({job,id})=>{fixture.setup(job,id);fixture.legacy();},{job,id});assert.equal(await page.locator(bar+' [data-skill-id]').count(),4,'old server retains four core buttons');assert.equal(await page.locator('#skillLoadoutButton').isVisible(),false,'old server hides mixed config');
   report.cases.push({width,height,job,command:sent.command});
  }
  if(width===390){
   const catalogs=require('./class-skills-advanced-fixture.cjs').catalogs;
   for(const job of classes){const c=catalogs[job],nodes=c.nodes||c.skills||c.lessons,bar='#'+barIds[job];
    for(const [id,node] of Object.entries(nodes)){if(node.effect==='passive'||(node.path&&node.path!==job))continue;
     await page.evaluate(({job,id})=>fixture.technique(job,id),{job,id});await page.locator(bar+' [data-skill-id="'+id+'"]').click();if(await page.locator('#advancedTargetList').isVisible())await page.locator('#advancedTargetList button').first().click();
     const sent=await page.evaluate(()=>fixture.wire.at(-1));assert.equal(sent?.command,commands[job],job+' '+id+' advanced routing');assert.equal(sent.payload.skillId,id);report.catalogRoutes.push({job,id,command:sent.command});
    }
    await page.evaluate(({job,id})=>fixture.setup(job,id),{job,id:examples[job]});
    await page.evaluate(()=>fixture.prepareCore());
    for(const id of await page.evaluate(()=>fixture.coreIds())){await page.evaluate(()=>fixture.wire.length=0);await page.locator(bar+' [data-skill-id="'+id+'"]').click();if(await page.locator('#advancedTargetList').isVisible())await page.locator('#advancedTargetList button').first().click();const sent=await page.evaluate(()=>fixture.wire.at(-1));assert.equal(sent?.command,coreCommands[job],job+' '+id+' core route');assert.equal(sent.payload.skillId,id);report.coreRoutes.push({job,id});}
   }
   await page.evaluate(()=>fixture.rankedHeal());await page.locator('#occultHotbar [data-skill-id="mender_core_heal"]').click();
   const distant=page.locator('#advancedTargetList button').filter({hasText:'Distant ally'});assert.equal(await distant.count(),1,'rank-2 healing includes ally at 12.3 range');await distant.click();
   assert.deepEqual(await page.evaluate(()=>fixture.wire.at(-1)),{command:'mender_core_skill',payload:{skillId:'mender_core_heal',targetId:'ally-test'}});
   for(const [job,school] of [['phutthaisawan','sritrairat'],['muay_boran','korat']]){
    await page.evaluate(({job,id})=>{fixture.technique(job,id);fixture.openLoadout();fixture.stale();},{job,id:examples[job]});
    await page.evaluate(school=>{fixture.school(school);fixture.wire.length=0;fixture.invokeStale();},school);assert.deepEqual(await page.evaluate(()=>fixture.wire),[],'stale school cannot cast or equip');
   }
   await page.evaluate(()=>{fixture.fullSlots('phutthaisawan',['flowing_blades','open_circle','steady_guard','final_counter']);fixture.applySlots([{kind:'advanced',id:'flowing_blades'},{kind:'advanced',id:'open_circle'},{kind:'advanced',id:'steady_guard'},{kind:'core',id:'sritra_core'}]);fixture.openLoadout();fixture.wire.length=0;});
   const fourth=page.locator('[data-loadout-slot="3"] option[value="advanced:final_counter"]');
   if(await fourth.count() && !(await fourth.isDisabled()))await page.locator('[data-loadout-slot="3"]').selectOption('advanced:final_counter');
   assert.deepEqual(await page.evaluate(()=>fixture.wire),[],'fourth advanced sword rejected locally');
   await page.evaluate(()=>fixture.technique('seer','seer_spirit'));await page.evaluate(()=>fixture.spiritState(true,false));await page.locator('#occultHotbar [data-skill-id="seer_spirit"]').click();assert.deepEqual(await page.evaluate(()=>fixture.wire),[{command:'possess',payload:{}}]);
   await page.evaluate(()=>fixture.spiritState(false,false));await page.locator('#occultHotbar [data-skill-id="seer_spirit"]').click();assert.deepEqual(await page.evaluate(()=>fixture.wire),[{command:'pot_summon',payload:{}}]);
   await page.evaluate(()=>fixture.spiritState(false,true));await page.locator('#occultHotbar [data-skill-id="seer_spirit"]').click();assert.equal(await page.evaluate(()=>fixture.wire.at(-1)?.command),'occult_skill');
  }
  await context.close();
 }
 assert.equal(report.cases.length,24);assert.equal(report.catalogRoutes.length,116);assert.equal(report.coreRoutes.length,24);assert.deepEqual(report.errors,[]);
 console.log('PASS mixed hotbar: 24 class/viewport flows, 116 advanced routes, 24 core routes; move/empty/cap, replication/timeout, stale owner/school, keyboard/touch, cooldown/mana/stun, legacy fallback');
 }catch(e){report.failure=e.stack;throw e;}finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();await new Promise(r=>server.close(r));}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});module.exports={fixture};
