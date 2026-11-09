/** Production config, hotbar, targeting and CSS with authoritative catalog snapshots.
 * No production characters or backend writes. Server integration is separate. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const classes=['phutthaisawan','muay_boran','blade','sentinel','seer','mender'];
const examples={phutthaisawan:'flowing_blades',muay_boran:'punch',blade:'shadow_cut',sentinel:'firm_guard',seer:'seer_ash_rice',mender:'mender_deep_heal'};
const commands={phutthaisawan:'sword_skill',muay_boran:'muay_skill',blade:'blade_skill',sentinel:'sentinel_skill',seer:'occult_skill',mender:'occult_skill'};
function fixture(){
 const base=require('./class-skills-entry-browser-test.cjs').fixture();
 base.html=base.html.replace('<div id="toast"></div>','<div id="toast" class="toast"></div>');
 const input=read('src/client/input/039-movement-flight-and-climbing.js'),cast=input.slice(input.indexOf('  function castAtTarget('),input.indexOf('  function updateFlightButton('));
 base.script=base.script.replace('const monsterForSpell=()=>null,castAtTarget=()=>{};',`const monsterForSpell=id=>id==='monster-test'?room.state.monster:null;let selectedSentinelSkill='',selectedPkTargetId='';const syncPKHud=()=>{};${cast}`);
 base.script+=`\nconst originalSync=fixture.syncHotbars;fixture.syncHotbars=()=>{originalSync();syncAdvancedSkillUI();layoutOrbArc();};
function applyAdvancedBook(book){const me=ownServerCharacter();if(me.pathId==='phutthaisawan')me.swordTreeData=JSON.stringify(book);else if(me.pathId==='muay_boran')me.muayBookData=JSON.stringify(book);else (me.pathId==='blade'?bladeBookState:me.pathId==='sentinel'?sentinelBookState:occultBookState).book=book;skillLoadoutKey='';fixture.syncHotbars();}
Object.assign(fixture,{
 setup(path,id){fixture.setMode('live');fixture.fullSnapshot(path,100);const me=ownServerCharacter();Object.assign(me,{alive:true,stunned:false,mana:300,x:0,y:0,z:0,targetId:'monster-test',mapId:'ritual_village'});room.state.monster={id:'monster-test',alive:true,mapId:'ritual_village',x:1,y:0,z:0};room.state.summons=new Map([[localId,{kind:'pot_spirit'}]]);fixture.learnSnapshot(id);fixture.syncHotbars();wire.length=0;},
 showToast(){ui.toast.textContent='เลือกเป้าหมายที่ใช้วิชานี้ได้';ui.toast.classList.add('show');positionSwordToast();},
 tickLoadout:()=>{syncClassSkillBookContext();syncAdvancedSkillUI();layoutOrbArc();},openLoadout:openSkillLoadout,setBank:setFieldSkillBank,
 technique(path,id){fixture.setup(path,id);const data=advancedSkillData(),book=structuredClone(data.book),node=data.lessons[id];if(data.kind==='sword' && node.school!=='common')book.school=node.school;if(data.kind==='muay')book.school=advancedData.catalogs.muay_boran.lessons[id].school;const slots=Array(data.slots.length).fill(null);slots[0]=id;if(data.kind==='sword')book.loadouts[book.school]=slots;else if(data.kind==='occult')book.loadouts[path]=slots;else book.slots=slots;ownServerCharacter().possessionActive=node.effect==='trance';room.state.players.set('ally-test',{alive:true,mapId:'ritual_village',x:1,y:0,z:0,characterName:'Party friend'});partyState={members:[{sessionId:localId},{sessionId:'ally-test'}]};applyAdvancedBook(book);setFieldSkillBank('advanced');wire.length=0;},
 fullSlots(path,ids){fixture.setup(path,ids[0]);const data=advancedSkillData(),book=structuredClone(data.book);if(data.kind==='occult'){book.learned[path]=ids;book.loadouts[path]=ids;}else{book.learned=ids;if(data.kind==='sword')book.loadouts[book.school]=ids;else book.slots=ids;}applyAdvancedBook(book);setFieldSkillBank('advanced');},
 applySlots(ids){const data=advancedSkillData(),b=structuredClone(data.book);if(data.kind==='sword')b.loadouts[b.school]=ids;else if(data.kind==='occult')b.loadouts[data.path]=ids;else b.slots=ids;applyAdvancedBook(b);},
 cooldown(id,until){const data=advancedSkillData(),b=structuredClone(data.book);if(data.kind==='muay')ownServerCharacter().muayData=JSON.stringify({[id]:until});else{b.cooldowns[id]=until;applyAdvancedBook(b);}fixture.syncHotbars();},
 setTarget:castAtTarget,own:ownServerCharacter,advanced:advancedSkillData,
 stale(){const b=$('advancedHotbar').querySelector('[data-skill-id]');window.staleClick=b.onclick;const s=$('skillLoadoutBody')?.querySelector('select');window.staleSelect=s?.onchange;},
 invokeStale(){window.staleClick?.();window.staleSelect?.();}
});`;
 return base;
}
async function inside(page,selector){const r=await page.locator(selector).evaluate(e=>{e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button,select')===e};});assert(r.w>=40&&r.h>=40,selector+' touch size '+JSON.stringify(r));assert(r.x>=0&&r.right<=page.viewportSize().width+1&&r.y>=0&&r.bottom<=page.viewportSize().height+1,selector+' viewport '+JSON.stringify(r));assert(r.hit,selector+' not occluded '+JSON.stringify(r));}
async function main(){
 const {chromium}=require('playwright'),f=fixture(),out=process.env.MONTRA_ADVANCED_EVIDENCE||'/tmp/montra-advanced-browser-evidence';fs.mkdirSync(out,{recursive:true});
 const report={cases:[],errors:[],limits:'Production DOM/functions/CSS and checked-in catalogs with synthetic snapshots. Chromium mobile emulation, not a physical phone or live production character.'};
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',(req.url==='/fixture.js'?'text/javascript':req.url==='/styles.css'?'text/css':'text/html')+'; charset=utf-8');res.end(req.url==='/fixture.js'?f.script:req.url==='/styles.css'?read('styles.css'):f.html);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{for(const [width,height,mobile] of [[390,844,true],[320,640,true],[844,390,true],[1366,768,false]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile}),page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>fixture.setup);
  for(const job of classes){const id=examples[job];await page.evaluate(({job,id})=>fixture.setup(job,id),{job,id});
   await inside(page,'#skillBankToggle');await inside(page,'#skillLoadoutButton');
   await page.locator('#skillLoadoutButton').click();assert.equal(await page.locator('#drawerTitle').textContent(),'ปรับแต่งสกิล');
   assert.equal(await page.locator('.loadout-core span').count(),4);assert.equal(await page.locator('[data-loadout-slot]').count(),job==='phutthaisawan'?3:4);
   await inside(page,'[data-loadout-slot="0"]');
   await page.locator('[data-loadout-slot="1"]').selectOption(id);
   const equip=await page.evaluate(()=>fixture.wire.at(-1));assert.deepEqual(equip,{command:job==='phutthaisawan'?'sword_tree_equip':job==='muay_boran'?'muay_book':job==='blade'?'blade_book':job==='sentinel'?'sentinel_book':'occult_book',payload:job==='phutthaisawan'?{skillId:id,slot:1}:{action:'equip',skillId:id,slot:1}});
   assert.equal(await page.locator('[data-loadout-slot="1"]').isDisabled(),true,'wait for server');
   assert.equal(await page.evaluate(()=>fixture.advanced().slots[0]),id,'no optimistic book mutation');
   await page.evaluate(()=>{const ids=fixture.advanced().slots;ids[1]=ids[0];ids[0]=null;fixture.applySlots(ids);});
   assert.equal(await page.locator('[data-loadout-slot="1"]').inputValue(),id,'accepted server slots render');
   await page.locator('[data-loadout-bank="advanced"]').click();await page.locator('#loadoutPlay').click();
   await inside(page,'#advancedHotbar [data-skill-id="'+id+'"]');
   await page.evaluate(()=>fixture.showToast());const toastBox=await page.locator('#toast').boundingBox();assert(toastBox && toastBox.y>=0 && toastBox.y+toastBox.height<=height,'advanced help/rejection toast stays visible');
   assert.equal(await page.locator('.learned-bar > .sword-hotbar:not(#advancedHotbar):visible button').count(),0,'only one bank visible');
   await page.evaluate(()=>fixture.wire.length=0);await page.locator('#advancedHotbar [data-skill-id="'+id+'"]').click();
   const sent=await page.evaluate(()=>fixture.wire.at(-1));assert.equal(sent?.command,commands[job],job+' advanced command');assert.equal(sent.payload.skillId,id);
   if(job!=='sentinel')assert.equal(sent.payload.targetId,job==='mender'?'fixture':'monster-test');
   await page.evaluate(()=>fixture.wire.length=0);await page.keyboard.press('2');assert.equal(await page.evaluate(()=>fixture.wire.at(-1)?.command),commands[job],'number key uses advanced bank');
   await page.evaluate(id=>fixture.cooldown(id,Date.now()+30000),id);assert.equal(await page.locator('#advancedHotbar [data-skill-id="'+id+'"]').isDisabled(),true,'cooldown');
   await page.evaluate(id=>{fixture.cooldown(id,0);fixture.own().mana=0;fixture.tickLoadout();},id);assert.equal(await page.locator('#advancedHotbar [data-skill-id="'+id+'"]').isDisabled(),true,'mana');
   await page.evaluate(()=>{fixture.own().mana=300;fixture.own().stunned=true;fixture.tickLoadout();});assert.equal(await page.locator('#advancedHotbar [data-skill-id="'+id+'"]').isDisabled(),true,'stun');
   await page.evaluate(()=>{fixture.own().stunned=false;fixture.tickLoadout();});
   await page.locator('#skillBankToggle').click();assert.equal(await page.locator('.learned-bar > .sword-hotbar:not(#advancedHotbar):visible [data-skill-id]').count(),4,'core still accessible');
   await page.locator('#skillBankToggle').click();await page.screenshot({path:path.join(out,width+'-'+job+'-hotbar.png')});
   await page.locator('#skillLoadoutButton').click();await page.screenshot({path:path.join(out,width+'-'+job+'-config.png')});
   await page.evaluate(()=>{fixture.stale();fixture.setMode('demo');fixture.tickLoadout();fixture.wire.length=0;fixture.invokeStale();});assert.equal(await page.locator('#drawer').isVisible(),false);assert.deepEqual(await page.evaluate(()=>fixture.wire),[],'stale callbacks cannot send');assert.equal(await page.locator('#advancedHotbar').isVisible(),false);
   report.cases.push({width,height,job,learned:id,command:sent.command});
  }
  const filled={phutthaisawan:['flowing_blades','open_circle','steady_guard'],muay_boran:['punch','guard','teep','grapple'],blade:['shadow_cut','rune_break','shadow_counter','sealed_finale'],sentinel:['firm_guard','line_sweep','steadfast_counter','enduring_ward'],seer:['seer_ash_rice','seer_deep_curse','seer_ward_break','seer_spirit_rain'],mender:['mender_deep_heal','mender_shelter','mender_deep_circle','mender_spirit_rice']};
  for(const job of classes){await page.evaluate(({job,ids})=>fixture.fullSlots(job,ids),{job,ids:filled[job]});const labels=await page.locator('#advancedHotbar .field-skill-name').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};}));for(let i=0;i<labels.length;i++){assert(labels[i].width>0 && labels[i].height>0,'filled skill label visible');for(let j=0;j<i;j++)assert(Math.min(labels[i].right,labels[j].right)<=Math.max(labels[i].x,labels[j].x) || Math.min(labels[i].bottom,labels[j].bottom)<=Math.max(labels[i].y,labels[j].y),'filled labels do not overlap');}for(const id of filled[job])await inside(page,'#advancedHotbar [data-skill-id=\"'+id+'\"]');await page.screenshot({path:path.join(out,width+'-'+job+'-filled.png')});}
  if(width===390){const catalogs=require('./class-skills-advanced-fixture.cjs').catalogs;report.catalogRoutes=[];for(const job of classes){const c=catalogs[job],nodes=c.nodes || c.skills || c.lessons;for(const [id,node] of Object.entries(nodes)){if(node.effect==='passive' || (node.path && node.path!==job))continue;await page.evaluate(({job,id})=>fixture.technique(job,id),{job,id});await page.locator('#advancedHotbar [data-skill-id=\"'+id+'\"]').click();if(await page.locator('#advancedTargetList').isVisible())await page.locator('#advancedTargetList button').first().click();const sent=await page.evaluate(()=>fixture.wire.at(-1));assert.equal(sent?.command,commands[job],job+' '+id+' uses authoritative advanced command');assert.equal(sent.payload.skillId,id);report.catalogRoutes.push({job,id,effect:node.effect,command:sent.command,target:sent.payload.targetId || 'self/area'});}}}
  await context.close();
 }assert.deepEqual(report.errors,[]);console.log('PASS advanced mobile loadout: '+report.cases.length+' class/viewport flows / '+report.catalogRoutes.length+' catalog cast routes, equip acknowledgement, casts, cooldown/mana/stun, core return and stale-owner guards');
 }catch(e){report.failure=e.stack;throw e;}finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();await new Promise(r=>server.close(r));}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});module.exports={fixture};
