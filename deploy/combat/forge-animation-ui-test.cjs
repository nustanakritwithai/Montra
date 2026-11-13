// Exercises extracted production forge presentation, request, and response paths.
// No duplicated animation state machine and no server mutations are simulated here.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../main.js'),'utf8');
const styles=fs.readFileSync(path.join(__dirname,'../../styles.css'),'utf8');
function slice(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a,`production boundaries: ${start} / ${end}`);return source.slice(a,b);}
function fakeClock(){let now=0,sequence=0;const timers=new Map();return {now:()=>now,timers,setTimeout(fn,delay=0){const id=++sequence;timers.set(id,{at:now+Number(delay),fn});return id;},clearTimeout(id){timers.delete(id);},advance(ms){const end=now+ms;let runs=0;while(true){const next=[...timers].filter(([,timer])=>timer.at<=end).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];if(!next)break;assert(++runs<10000,'finite timer queue');now=next[1].at;timers.delete(next[0]);next[1].fn();}now=end;}};}
function element(){const classes=new Set();return {hidden:false,disabled:false,textContent:'',value:'',dataset:{},attributes:{},open:false,children:[],style:{},classList:{add(...names){names.forEach(name=>classes.add(name));},remove(...names){names.forEach(name=>classes.delete(name));},toggle(name,on){if(on??!classes.has(name))classes.add(name);else classes.delete(name);},contains:name=>classes.has(name)},setAttribute(name,value){this.attributes[name]=String(value);},removeAttribute(name){delete this.attributes[name];},getAttribute(name){return this.attributes[name];},scrollIntoView(){this.scrolled=true;},close(){this.open=false;},focus(){this.focused=true;},getClientRects(){return this.hidden?[]:[{}];}};}
function harness({reduced=false,confirm=true,throwSend=false,animationEnd=true}={}){
  const clock=fakeClock(),elements=new Map(),sent=[],toasts=[],callbacks={},renders=[],effects=[];
  const $=id=>{if(!elements.has(id)){
    const node=element();elements.set(id,node);
    if(id==='forgeHammerMotion'){
      const toggle=node.classList.toggle;
      node.classList.toggle=(name,on)=>{const prior=node.classList.contains(name);toggle(name,on);
        // Model only the browser's finite CSS end event; product owns all state.
        if(animationEnd && name==='is-striking' && on && !prior)clock.setTimeout(()=>{if(node.classList.contains(name))$('forgeHammer').onanimationend?.({animationName:'forge-hammer-strike'});},360);
      };
    }
  }return elements.get(id);};
  const item={itemId:'test_sword',quantity:1,forge:{instanceId:'sword',revision:2,rank:5}};
  const inventory={slots:[item],forgeCopies:{test_sword:3}};
  const meta={name:'ดาบทดสอบ',kind:'mainHand',level:1,forge:{primary:'melee',enhanceRatings:{6:42}},recipe:[{item:'metal',qty:1}]};
  const room={state:{forgeCatalog:JSON.stringify({enhanceSteps:Array.from({length:10},()=>({copies:2,gold:100,chance:75,breakOnFailure:true,downgradeChance:20}))})},send(command,payload){if(throwSend)throw Error('offline');sent.push({command,payload});},onMessage(name,callback){callbacks[name]=callback;}};
  const ctx={clearCombatVfx(){},$,room,joined:room,window:{confirm:()=>confirm,matchMedia:()=>({matches:reduced})},document:{hidden:false},performance:{now:clock.now},Date:class extends Date{static now(){return clock.now();}},setTimeout:clock.setTimeout,clearTimeout:clock.clearTimeout,requestAnimationFrame:fn=>clock.setTimeout(fn,16),cancelAnimationFrame:clock.clearTimeout,
    // Presentation boundaries record feedback without playing audio or creating 3D effects.
    getLocalAvatar:()=>({x:2,y:3,z:4}),localId:'hero',
    ...Object.fromEntries(['SFX','shakeCamera','sparks','floatAtPlayer','triggerCombatCallout'].map(name=>[name,(...args)=>effects.push({name,args})])),
    inventoryState:inventory,economyGold:1000,economyPending:false,economyTimer:null,itemUsePending:false,drawerActive:'forge',forgePageAction:'enhance',forgePageTarget:0,forgePageIdentity:{itemId:item.itemId,instanceId:'sword'},forgePageRoom:room,
    economyReady:()=>true,forgeTargetItem:()=>inventory.slots[0],bagMeta:value=>value?meta:null,gearStamp:value=>value.forge.instanceId+'.'+value.forge.revision,forgeRiskText:()=> 'เสี่ยงแตก',economyRequestId:()=>`request_${sent.length+1}`,
    renderForgePage:()=>renders.push('forge'),renderBag:()=>renders.push('bag'),renderEconomy:()=>renders.push('economy'),renderForgeStock:()=>renders.push('stock'),forgeNames:{melee:'โจมตี'},centralMarketVersion:0,toast:message=>toasts.push(message),fishingPending:false};
  $('forgePanel').hidden=false;
  const run=code=>vm.runInContext(code,ctx);vm.createContext(ctx);
  return {clock,elements,$,sent,toasts,callbacks,renders,effects,ctx,run,item,inventory,meta,room,authority:()=>JSON.stringify({gold:ctx.economyGold,inventory:ctx.inventoryState})};
}
function setup(options){const h=harness(options);
  Object.assign(h.ctx,{refreshArtisanWallet(){},currentBagSlots:()=>h.inventory.slots,closeForgePicker(){},selectForgeTarget(){h.ctx.forgePageTarget=null;h.ctx.forgePageIdentity=null;},forgeTargetChoices:()=>h.inventory.slots[0]?[{target:0,key:'bag:0',location:'bag'}]:[],forgeLabel:item=>' +'+item.forge.rank,
    renderItemTile(id,item){h.$(id).textContent=item?.forge?'+'+item.forge.rank:'';},renderForge(item){h.$('forgePanel').hidden=!item;h.$('forgeEnhance').disabled=h.ctx.economyPending;h.$('forgeReroll').disabled=h.ctx.economyPending;},renderForgePicker(){}});
  h.ctx.renderBag=()=>{h.renders.push('bag');h.ctx.renderForgePage();};
  h.run(slice('  function renderForgePage()', '  function submitForge('));h.run(slice('  function gearStamp(', '  function accessoryStamp('));
  h.run(slice('  function forgeGearLevel(', '  function forgeSupplyCount('));
h.run(slice('  let forgeAnimation=', '  function forgeTargetItem('));h.run(slice('  function submitForge(', '  function openBag()'));h.run(slice('  let economyPendingRequest=', '  function economyReady()'));h.run(slice('  function economySend(', '  function economyRequestId()'));h.ctx.finishCraftMutation=()=>false;h.run(slice('      joined.onMessage("craft_result",', '      joined.onMessage("market_result",'));h.run(slice('      joined.onMessage("economy_error",', '      joined.onMessage("trade_update",'));h.ctx.renderForgePage();return h;}
function installLifecycle(h){
  Object.assign(h.ctx,{ui:{drawer:element(),shade:element(),drawerBody:element(),drawerTitle:element()},drawerOpener:null,fieldTrainingTip:null,SFX(){},closeForgePicker(){},closeEquipPopup(){},closeItemDetailModal(){},gateFieldInput(){},ownServerCharacter:()=>({level:25})});
  h.run(slice('  function closeDrawer()', '  const journalOrigins='));
}
function result(h,overrides={}){return {requestId:h.sent.find(x=>x.command==='forge_weapon')?.payload.requestId,action:'enhance',itemId:'test_sword',success:true,downgraded:false,broken:false,forge:{...h.item.forge,rank:6},...overrides};}
function start(h){h.run('submitForge("enhance")');assert.equal(h.sent.filter(x=>x.command==='forge_weapon').length,1);assert.equal(h.ctx.economyPending,true);assert.equal(h.run('forgeAnimationBusy()'),true);}
function wire(h,value){h.callbacks.forge_result(value);}
function reveal(h){h.clock.advance(1260);}
// Cancellation before confirmation produces neither animation nor mutation.
{
  const h=setup({confirm:false});const before=h.authority();h.run('submitForge("enhance")');assert.equal(h.sent.length,0);assert.equal(h.run('forgeAnimationBusy()'),false);assert.equal(h.authority(),before);
}
// A fast response releases the network lock but not the presentation lock.
{
  const h=setup();const before=h.authority();start(h);h.run('submitForge("enhance")');assert.equal(h.sent.length,1,'double click is ignored');
  h.clock.advance(100);wire(h,result(h));assert.equal(h.ctx.economyPending,false);assert.equal(h.run('forgeAnimationBusy()'),true);assert.equal(h.toasts.length,0,'no early success toast');assert.equal(h.effects.length,0,'no feedback before the confirmed reveal');
  h.run('submitForge("enhance")');assert.equal(h.sent.length,1,'early response must not permit second submit before reveal');h.clock.advance(1159);assert.equal(h.toasts.length,0);h.clock.advance(1);assert.equal(h.run('forgeAnimationBusy()'),false);assert.match(h.toasts.join(' '),/สำเร็จ/);assert.equal(h.authority(),before,'presentation never mutates gold or inventory');
  assert.deepEqual(h.effects.map(e=>e.name),['SFX','shakeCamera','sparks','floatAtPlayer','triggerCombatCallout']);
  assert.equal(h.effects[0].args[0],'bell');assert.deepEqual(h.effects[2].args.slice(0,4),['gold',2,4.2,4]);
  assert.equal(h.effects[3].args[0],'hero');assert.equal(h.effects[4].args[0],'forge_success');
}
// An elapsed animation cannot manufacture an outcome while the server is pending.
{
  const h=setup();start(h);reveal(h);assert.equal(h.toasts.length,0);assert.equal(h.ctx.economyPending,true);assert.equal(h.run('forgeAnimationBusy()'),true);wire(h,result(h));assert.equal(h.ctx.economyPending,false);assert.equal(h.run('forgeAnimationBusy()'),false);assert.equal(h.toasts.length,1);
}
// Every outcome comes from the server, including failure, downgrade, and destruction.
for(const [payload,word,kind] of [[{success:false},/ไม่สำเร็จ/,'failed'],[{success:false,downgraded:true,forge:{rank:4}},/ลด/,'downgraded'],[{success:false,broken:true,forge:{rank:5}},/แตก/,'broken']]){
  const h=setup();const before=h.authority();start(h);wire(h,result(h,payload));assert.equal(h.toasts.length,0);reveal(h);assert.match(h.toasts.join(' '),word);assert.equal(h.$('forgeOutcome').dataset.kind,kind);assert.equal(h.authority(),before);assert.equal(h.effects[0].args[0],'hurt');assert.equal(h.effects.at(-1).args[0],'forge_fail');
}
// Server pushes immediately change authority, but production render preserves visible pre-strike data.
for(const broken of [false,true]){
  const h=setup();const originalRank=h.$('forgeItemSymbol').textContent,originalGold=h.$('forgeGold').textContent;start(h);
  const answer=result(h,broken?{success:false,broken:true,forge:{rank:5}}:{});
  h.ctx.economyGold=900;if(broken)h.inventory.slots[0]=null;else h.inventory.slots[0].forge={...h.item.forge,rank:6,revision:3};
  const authoritative=h.authority();h.ctx.renderForgePage();assert.equal(h.ctx.economyGold,900);assert.equal(h.$('forgeItemSymbol').textContent,originalRank);assert.equal(h.$('forgeGold').textContent,originalGold);assert.equal(h.$('forgePanel').hidden,false,'broken item is not disclosed before result reveal');
  wire(h,answer);assert.equal(h.$('forgeItemSymbol').textContent,originalRank);assert.equal(h.toasts.length,0);reveal(h);
  assert.equal(h.$('forgeGold').textContent,'900 ทอง');assert.equal(h.$('forgePanel').hidden,broken);assert.equal(h.$('forgeItemSymbol').textContent,broken?'':'+6');assert.equal(h.$('forgeOutcome').hidden,false);assert.match(h.$('forgeOutcome').textContent,broken?/แตก/:/สำเร็จ/);assert.equal(h.authority(),authoritative,'reveal preserves already received authority');
}
// Revalidate the actual target after the native confirmation returns.
{
  const h=setup();h.ctx.window.confirm=()=>{h.inventory.slots[0]=null;return true;};
  assert.doesNotThrow(()=>h.run('submitForge("enhance")'));assert.equal(h.sent.length,0);assert.equal(h.run('forgeAnimationBusy()'),false);
}
// Stale request, wrong action, old room, duplicate result cannot release a pending action.
{
  const h=setup();start(h);const valid=result(h);wire(h,{...valid,requestId:'stale'});wire(h,{...valid,action:'reroll'});wire(h,{...valid,itemId:'another_item'});wire(h,{...valid,forge:{rank:11}});wire(h,{...valid,forge:{rank:1.5}});wire(h,{...valid,requestId:undefined});assert.equal(h.ctx.economyPending,true);assert.equal(h.toasts.length,0);
  assert.equal(h.ctx.receiveForgeResult(valid,{}),false);assert.equal(h.ctx.economyPending,true);wire(h,valid);reveal(h);wire(h,valid);assert.equal(h.toasts.length,1,'duplicate outcome not announced twice');assert.equal(h.effects.length,5,'duplicate outcome cannot replay feedback');
  h.run('submitForge("enhance")');assert.equal(h.sent.length,2);wire(h,valid);assert.equal(h.ctx.economyPending,true,'old response cannot clear a newer request');
}
// Rejection, send errors and timeout reset presentation without replaying mutation.
{
  const h=setup();start(h);h.callbacks.economy_error({reason:'insufficient_gold'});assert.equal(h.ctx.economyPending,false);assert.equal(h.run('forgeAnimationBusy()'),false);h.clock.advance(10000);assert.equal(h.sent.filter(x=>x.command==='forge_weapon').length,1);assert(!h.toasts.some(text=>text.includes('ตีบวกสำเร็จ')));
}
{
  const h=setup({throwSend:true});h.run('submitForge("enhance")');assert.equal(h.ctx.economyPending,false);assert.equal(h.run('forgeAnimationBusy()'),false);h.clock.advance(10000);assert.match(h.toasts.join(' '),/ส่งคำขอไม่สำเร็จ/);
}
{
  const h=setup();start(h);h.clock.advance(6000);assert.equal(h.ctx.economyPending,false);assert.equal(h.run('forgeAnimationBusy()'),false);assert.deepEqual(h.sent.map(x=>x.command),['forge_weapon','get_economy','market_list']);assert.match(h.toasts.join(' '),/ยังไม่ได้รับผล/);wire(h,result(h));assert(h.toasts.some(text=>text.includes('ตีบวกสำเร็จ')),'a confirmed late outcome is announced without replaying mutation');assert.equal(h.sent.filter(x=>x.command==='forge_weapon').length,1);
}
// After a timeout, a late matched outcome is useful, but it cannot own a new lock.
{
  const h=setup();start(h);const late=result(h);h.clock.advance(6000);
  h.run('economySend("claim_forge_copy",{requestId:"new_claim"},true)');
  const newerTimer=h.ctx.economyTimer;assert.equal(h.ctx.economyPending,true);
  wire(h,late);assert.equal(h.ctx.economyPending,true,'late forge result must not unlock a newer unrelated mutation');assert.equal(h.ctx.economyTimer,newerTimer);assert(h.clock.timers.has(newerTimer),'new mutation timeout remains armed');
  assert.equal(h.toasts.filter(text=>text.includes('ตีบวกสำเร็จ')).length,1);wire(h,late);assert.equal(h.toasts.filter(text=>text.includes('ตีบวกสำเร็จ')).length,1,'late confirmed result is announced once');assert.equal(h.ctx.economyPending,true);
  assert.equal(h.sent.filter(x=>x.command==='forge_weapon').length,1);
}
// Older confirmed results may announce once, but cannot replace a newer presentation.
{
  const h=setup();start(h);const late=result(h);h.clock.advance(6000);h.run('submitForge("enhance")');
  const newerTimer=h.ctx.economyTimer;wire(h,late);assert.equal(h.ctx.economyPending,true);assert.equal(h.ctx.economyTimer,newerTimer);assert.equal(h.run('forgeAnimationBusy()'),true);assert.equal(h.toasts.filter(text=>text.includes('ผลรายการก่อนหน้า')).length,1);wire(h,late);assert.equal(h.toasts.filter(text=>text.includes('ผลรายการก่อนหน้า')).length,1);
  const newOrder=h.sent.filter(x=>x.command==='forge_weapon').at(-1);assert.notEqual(newOrder.payload.requestId,late.requestId);
  wire(h,{...late,requestId:newOrder.payload.requestId});assert.equal(h.ctx.economyPending,false);reveal(h);assert.equal(h.toasts.filter(text=>text.includes('ตีบวกสำเร็จ')&&!text.includes('ผลรายการก่อนหน้า')).length,1);
}
// Cross-command late replies cannot release the active forge ticket before its own failure.
for(const reply of ['craft_result','forge_copy_claimed'])for(const failure of ['economy_error','admission']){
  const h=setup();start(h);const timer=h.ctx.economyTimer;
  h.inventory.slots[1]={itemId:'test_sword',quantity:1,forge:{instanceId:'older_instance',revision:1,rank:0}};
  const target=h.ctx.forgePageTarget;
  h.callbacks[reply](reply==='craft_result'?{requestId:'older_craft',itemId:'test_sword',spentGold:20}:{requestId:'older_claim',gear:'test_sword',instanceId:'older_instance',remaining:2});
  assert.equal(h.ctx.forgePageTarget,target,reply+' must not redirect active forge target');
  assert.equal(h.ctx.economyPending,true,reply+' must preserve forge lock');assert.equal(h.ctx.economyTimer,timer);assert(h.clock.timers.has(timer));assert.equal(h.run('forgeAnimationBusy()'),true);
  if(failure==='economy_error')h.callbacks.economy_error({reason:'insufficient_gold'});
  else{h.run('function rejectForgeFixture(info){'+slice('        if (["economy_unavailable","economy_rate_limited"','        if (info?.reason === "character_busy")')+'}');h.ctx.rejectForgeFixture({reason:'economy_rate_limited'});}
  assert.equal(h.ctx.economyPending,false,failure+' must release forge lock');assert.equal(h.run('forgeAnimationBusy()'),false);assert(!h.clock.timers.has(timer));assert.equal(h.sent.filter(x=>x.command==='forge_weapon').length,1);
}
// A late confirmed receipt replaces an unknown outcome only while its page remains selected.
{
  const h=setup();start(h);const late=result(h);h.clock.advance(6000);assert.match(h.$('forgeOutcome').textContent,/ยังไม่ได้รับผล|ยังไม่ทราบผล/);wire(h,late);assert.match(h.$('forgeOutcome').textContent,/ตีบวกสำเร็จ/);assert.equal(h.$('forgeOutcome').hidden,false);
}
{
  const h=setup();start(h);const late=result(h);h.clock.advance(6000);
  h.inventory.slots[1]={itemId:'test_sword',quantity:1,forge:{instanceId:'other',revision:1,rank:1}};
  h.ctx.forgeTargetItem=target=>h.inventory.slots[target];h.ctx.selectForgeTarget=target=>{h.ctx.forgePageTarget=target;h.ctx.forgePageIdentity={itemId:'test_sword',instanceId:'other'};};
  h.run(slice('  function chooseForgeTarget(', '  function renderForgePicker('));h.$('forgePicker').open=true;h.ctx.chooseForgeTarget(1,'test_sword','other.1');h.ctx.renderForgePage();
  assert.equal(h.ctx.forgePageTarget,1);wire(h,late);assert.equal(h.ctx.forgePageTarget,1);assert.equal(h.$('forgeOutcome').hidden,true,'old receipt must not attach to newly selected gear');assert.match(h.toasts.at(-1),/ตีบวกสำเร็จ/);
}
// A claim selected after timeout dismisses the prior outcome exactly like manual selection.
{
  const h=setup();start(h);const late=result(h);h.clock.advance(6000);
  h.inventory.slots[1]={itemId:'test_sword',quantity:1,forge:{instanceId:'claimed_after_timeout',revision:1,rank:0}};
  h.run(slice('  function forgeTargetItem(', '  function forgeTargetChoices('));
  h.callbacks.forge_copy_claimed({requestId:'new_claim',gear:'test_sword',instanceId:'claimed_after_timeout',remaining:2});
  assert.equal(h.ctx.forgePageTarget,1);assert.equal(h.$('forgeOutcome').hidden,true);
  wire(h,late);assert.equal(h.ctx.forgePageTarget,1);assert.equal(h.$('forgeOutcome').hidden,true,'late receipt must not attach to the claimed +0 item');assert.match(h.toasts.at(-1),/ตีบวกสำเร็จ/);
}
// Navigation dismisses animation only: correlation and the actual mutation survive.
{
  const h=setup();installLifecycle(h);start(h);h.ctx.openDrawer('bag','Bag','');assert.equal(h.ctx.economyPending,true);assert.equal(h.ctx.drawerActive,'bag');wire(h,result(h));assert.equal(h.ctx.economyPending,false);assert.equal(h.toasts.length,1);h.clock.advance(10000);assert.equal(h.toasts.length,1);assert.equal(h.sent.length,1);
}
{
  const h=setup();installLifecycle(h);start(h);wire(h,result(h));h.ctx.closeDrawer();assert.equal(h.ctx.drawerActive,null);assert.equal(h.toasts.length,1);h.clock.advance(10000);assert.equal(h.toasts.length,1);
}
// Disconnect / room replacement forgets visual ownership and old results.
{
  const h=setup();start(h);h.ctx.room={state:{}};h.ctx.renderForgePage();wire(h,result(h));h.clock.advance(10000);assert.equal(h.run('forgeAnimationBusy()'),false);assert.equal(h.toasts.length,0);
}
// Slow/missing compositor completion never reveals early; bounded fallback cannot trap the result.
{
  const h=setup({animationEnd:false});start(h);wire(h,result(h));h.clock.advance(1260);
  assert.equal(h.run('forgeAnimationBusy()'),true);assert.equal(h.toasts.length,0);assert.equal(h.$('forgeHammerMotion').hidden,false);
  h.clock.advance(700);for(let hit=0;hit<3;hit++){h.$('forgeHammer').onanimationend({animationName:'forge-hammer-strike'});assert.equal(h.toasts.length,0);h.clock.advance(32);}
  assert.equal(h.run('forgeAnimationBusy()'),false);assert.match(h.toasts.at(-1),/ตีบวกสำเร็จ/);
}
{
  const h=setup({animationEnd:false});start(h);wire(h,result(h));h.clock.advance(9999);assert.equal(h.toasts.length,0);h.clock.advance(1);assert.match(h.toasts.at(-1),/ตีบวกสำเร็จ/);assert.equal(h.run('forgeAnimationBusy()'),false);
}
// Each native strike completes once, with a painted impact gap before the next.
{
  const h=setup({animationEnd:false});start(h);wire(h,result(h));h.clock.advance(1260);
  const end=h.$('forgeHammer').onanimationend;
  end({animationName:'other'});assert.equal(h.run('forgeAnimation.strikesCompleted'),0);
  for(let hit=1;hit<=3;hit++){
    end({animationName:'forge-hammer-strike'});
    assert.equal(h.run('forgeAnimation.strikesCompleted'),hit);
    assert.equal(h.$('forgeHammerMotion').classList.contains('is-striking'),false);
    assert.equal(h.$('forgeHammerMotion').classList.contains('is-impact'),true,'impact VFX is synchronized with held hammer impact');
    assert.equal(h.$('forgeOutcome').dataset.kind,'notice','impact VFX cannot claim an unconfirmed result');
    end({animationName:'forge-hammer-strike'});assert.equal(h.run('forgeAnimation.strikesCompleted'),hit,'duplicate end cannot count another hit');
    h.clock.advance(16);assert.equal(h.toasts.length,0,'first rAF leaves an impact frame');
    h.clock.advance(15);assert.equal(h.toasts.length,0,'result waits through final impact hold');
    h.clock.advance(1);
    assert.equal(h.$('forgeHammerMotion').classList.contains('is-striking'),hit<3);
    assert.equal(h.$('forgeHammerMotion').classList.contains('is-impact'),false,'impact VFX clears before next strike or after reveal');
  }
  assert.equal(h.toasts.length,1);assert.equal(h.run('forgeAnimationBusy()'),false);
}
// Dismissal cancels a pending restart; even an already queued old callback is inert.
{
  const h=setup({animationEnd:false});start(h);const end=h.$('forgeHammer').onanimationend;
  end({animationName:'forge-hammer-strike'});
  const saved=h.clock.timers.get(h.run('forgeAnimation.motionFrame')).fn;
  h.run('cancelForgeAnimation(false)');saved();
  assert.equal(h.run('forgeAnimation.motionFrame'),null);assert.equal(h.run('forgeAnimation.strikesCompleted'),1);
  assert.equal(h.ctx.economyPending,true,'dismissing animation cannot cancel committed mutation');
  wire(h,result(h));assert.equal(h.toasts.length,1);
  h.run('submitForge("enhance")');saved();end({animationName:'forge-hammer-strike'});
  assert.equal(h.run('forgeAnimation.strikesCompleted'),0,'old frame/end cannot progress newer animation');
}
// Result effects are selected only from an authoritative receipt, never from the swing.
{
  const h=setup();start(h);assert.equal(h.$('forgeOutcome').dataset.kind,'notice');wire(h,result(h));
  assert.equal(h.$('forgeOutcome').dataset.kind,'notice');assert.equal(h.$('forgeOutcome').hidden,true);
  reveal(h);assert.equal(h.$('forgeOutcome').dataset.kind,'success');assert.equal(h.$('forgeOutcome').hidden,false);
}
{
  const h=setup();h.ctx.forgePageAction='reroll';h.run('submitForge("reroll")');
  wire(h,result(h,{action:'reroll'}));assert.equal(h.$('forgeOutcome').dataset.kind,'reroll');
  assert.equal(h.$('forgeHammerMotion').hidden,true);
}
{
  const h=setup();start(h);h.clock.advance(6000);assert.equal(h.$('forgeOutcome').dataset.kind,'notice');
  assert.equal(h.$('forgeHammerMotion').classList.contains('is-impact'),false);
}
// Reduced motion has no forced delay, but still waits for the server.
{
  const h=setup({reduced:true});start(h);assert.equal(h.$('forgeHammerMotion').hidden,true);assert.equal(h.$('forgeHammerMotion').classList.contains('is-striking'),false);assert.equal(h.$('forgeHammerMotion').classList.contains('is-impact'),false);h.clock.advance(0);assert.equal(h.toasts.length,0);wire(h,result(h));assert.equal(h.toasts.length,1);assert.equal(h.run('forgeAnimationBusy()'),false);
}
// Execute the exact production rejection branch without the unrelated combat reasons.
{
  const h=setup();start(h);
  h.run('function rejectForgeFixture(info){'+slice('        if (["economy_unavailable","economy_rate_limited"', '        if (info?.reason === "character_busy")')+'}');
  h.ctx.rejectForgeFixture({reason:'economy_rate_limited'});assert.equal(h.ctx.economyPending,false);assert.equal(h.run('forgeAnimationBusy()'),false);assert.match(h.toasts.join(' '),/เร็วเกินไป/);assert.equal(h.sent.length,1);
}
// Run actual showDemo cleanup prefix; the rest resets unrelated scene objects.
{
  const h=setup();installLifecycle(h);start(h);
  h.run(slice('  function showDemo() {','    clearFishing(false);fishSavedItem=null;')+'}');h.ctx.showDemo();
  assert.equal(h.ctx.economyPending,false);assert.equal(h.run('forgeAnimationRuns.size'),0);assert.equal(h.run('forgeAnimationBusy()'),false);wire(h,result(h));h.clock.advance(10000);assert.equal(h.toasts.length,0);
}
assert.match(styles,/@media \(prefers-reduced-motion:reduce\)\s*\{[^}]*\.forge-hammer-motion\s*\{\s*display:none!important/);
assert.match(styles,/\.forge-hammer,\.forge-sparks\s*\{\s*animation:none!important/);
console.log('PASS forge animation: actual production request/result handling, early/late responses, authoritative state, failure/downgrade/break, stale messages, duplicates, cancel, rejection, timeout, disconnect, reduced motion');

assert.match(styles,/\.forge-impact-ring,\.forge-outcome\s*\{\s*animation:none!important/);
assert.match(source,/class="forge-impact-ring"/);
