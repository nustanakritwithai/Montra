const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../main.js'),'utf8');
const slice=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a,`missing source boundary: ${start}`);return source.slice(a,b);};
const plain=value=>JSON.parse(JSON.stringify(value));
let groups=0;
function test(name,body){try{body();groups++;console.log('PASS '+name);}catch(error){error.message=name+': '+error.message;throw error;}}

// Execute the shipped wallet helper, sender, renderers and message handlers. The
// sender really re-enters renderBag; a stubbed sender would miss infinite recursion.
function fixture(drawer='crafting'){
  const elements=new Map(),wire=[],callbacks={},timers=new Map(),toasts=[];
  let now=100000,depth=0,maxDepth=0,renderCount=0,timerId=0,sendHook=null;
  const player={alive:true,persistent:true,level:1},slots=[];
  for(const id of ['personalBench','benchRecipe','craftPageResult','craftPageStatus','craftGold','craftActionStatus','benchGroup',
    ...['all','food','medicine','weapons','armor','materials','furniture'].map(c=>'ckCategory-'+c),
    'forgeTargetButton','forgePageStatus','forgeGold','forgeTargetLocation','forgeEmpty',
    'forgeEnhanceSection','forgeRerollSection','forgeItemName','forgeInfo','forgeCopyItem','forgeSealItem','forgePanel']){
    elements.set(id,{textContent:'',hidden:false,disabled:false,dataset:{},attributes:{},children:[],setAttribute(k,v){this.attributes[k]=String(v);}});
  }
  function makeRoom(name){return {name,state:{economyAvailable:true,forgeCatalog:'{}'},send(command,payload){
    wire.push({room:name,command,payload:plain(payload)});sendHook?.(command,payload);
  }};}
  const room=makeRoom('initial');
  const ctx={$:id=>elements.get(id)||null,Date:{now:()=>now},mode:'live',questNavigation:null,room,joined:room,localId:'me',drawerActive:drawer,
    forgeAnimation:null,forgeAnimationBusy:()=>false,cancelForgeAnimation(){},renderForgeAnimation(){},failForgeAnimation(){},economyPendingRequest:null,economyGold:null,economyPending:false,economyTimer:null,itemUsePending:false,centralMarketVersion:0,
    craftPageRoom:room,craftPagePosition:null,craftRecipeTarget:null,benchTrail:[],cardDrill:{},craftResultRoom:null,craftResultMessage:'',
    forgePageRoom:room,forgePageTarget:null,forgePageIdentity:null,forgePageAction:'enhance',
    warpPending:false,fishingPending:false,ownServerCharacter:()=>player,currentBagSlots:()=>slots,
    renderWorkbench(){},renderCraft(){},renderForge(){},renderForgeStock(){},renderForgePicker(){},renderItemTile(){},
    personalItems:{},closeCraftRecipePopup(){},openCraftRecipePopup(){},closeForgePicker(){},selectForgeTarget(){ctx.forgePageTarget=null;ctx.forgePageIdentity=null;},forgeTargetItem:()=>null,forgeTargetChoices:()=>[],bagMeta:()=>null,
    renderEconomy(){},toast:message=>toasts.push(message),
    setTimeout(fn,ms){timers.set(++timerId,{fn,ms});return timerId;},clearTimeout:id=>timers.delete(id),
    renderBag(){
      renderCount++;depth++;maxDepth=Math.max(maxDepth,depth);assert(depth<5,'wallet refresh recursively re-entered without a throttle');
      try{if(ctx.drawerActive==='crafting')ctx.renderCraftingPage();else if(ctx.drawerActive==='forge')ctx.renderForgePage();}finally{depth--;}
    },
  };
  room.onMessage=(name,handler)=>{callbacks[name]=handler;};
  vm.createContext(ctx);
  vm.runInContext(slice('  function finishEconomyPending(','  function economyItemName(')+
    slice('  function economySend(','  function economyRequestId()')+
    'function renderCraftQueue(){} function applyCraftCapabilities(){} function showCombatFeatureError(){return false;}\n'+slice('  const craftCategories=','  function openCraftingPage(')+slice('  function renderCraftingPage()','  function submitCraft(')+
    slice('  function renderForgePage()','  function submitForge(')+
    slice('      joined.onMessage("economy_state",','      joined.onMessage("market_state",')+
    slice('      joined.onMessage("command_rejected",','      joined.onMessage("warp_complete",')+
    slice('      joined.onMessage("player_respawn",','      joined.onMessage("character_slots",'),ctx);
  const bindPage=()=>{ctx.craftPageRoom=ctx.room;ctx.forgePageRoom=ctx.room;};
  return {ctx,player,wire,callbacks,elements,timers,toasts,makeRoom,bindPage,
    render:()=>ctx.renderBag(),advance:ms=>{now+=ms;},clock:value=>{now=value;},
    hook:fn=>{sendHook=fn;},get maxDepth(){return maxDepth;},get renderCount(){return renderCount;},
    gold:()=>elements.get(ctx.drawerActive==='forge'?'forgeGold':'craftGold').textContent};
}
function assertReads(f,number){
  assert.equal(f.wire.length,number);
  for(const request of f.wire){assert.equal(request.command,'get_economy');assert.deepEqual(request.payload,{});}
  assert.equal(f.ctx.economyPending,false,'wallet reads must not mark a mutation pending');
  assert.equal(f.timers.size,0,'wallet reads must not create mutation timeouts');
}

for(const drawer of ['crafting','forge']){
  test(drawer+': dead admission recovers on alive render with one nonmutating request',()=>{
    const f=fixture(drawer);f.player.alive=false;f.render();assertReads(f,0);assert.equal(f.gold(),'…');
    f.player.alive=true;f.callbacks.player_respawn({playerId:'me'});f.render();assertReads(f,1);
    assert.equal(f.maxDepth,2,'the actual sender refreshes the drawer exactly once');
    f.callbacks.economy_state({gold:996});assert.equal(f.gold(),'996 ทอง');
    f.advance(60000);for(let i=0;i<10;i++)f.render();assertReads(f,1);
  });
  test(drawer+': a rejected read retries after recovery without reopening or replaying a mutation',()=>{
    const f=fixture(drawer);f.render();assertReads(f,1);
    f.player.alive=false;f.callbacks.command_rejected({reason:'economy_unavailable'});
    f.advance(2000);f.render();assertReads(f,1);
    f.player.alive=true;f.callbacks.player_respawn({playerId:'me'});f.render();assertReads(f,2);
    f.callbacks.economy_state({gold:996});assert.equal(f.gold(),'996 ทอง');assertReads(f,2);
  });
}

test('read throttle is shared by both artisan pages and permits exactly one retry at 2000ms',()=>{
  const f=fixture();f.clock(0);f.render();assertReads(f,1);
  for(let i=0;i<20;i++)f.render();assertReads(f,1);
  f.ctx.drawerActive='forge';f.render();assertReads(f,1);
  f.advance(1999);f.render();assertReads(f,1);
  f.advance(1);f.render();assertReads(f,2);
  f.ctx.drawerActive='crafting';f.render();assertReads(f,2);
  assert.equal(f.maxDepth,2,'throttle is recorded before economySend re-enters rendering');
});

test('a synchronous wallet response cannot recurse or cause a second read',()=>{
  const f=fixture();f.hook(()=>f.callbacks.economy_state({gold:996}));f.render();
  assertReads(f,1);assert.equal(f.gold(),'996 ทอง');assert.equal(f.maxDepth,2);
});

test('valid zero gold stops recovery; invalid wallet data does not stop retries',()=>{
  for(const drawer of ['crafting','forge']){
    const f=fixture(drawer);f.render();
    for(const gold of [-1,1.5,'996',NaN,Infinity])f.callbacks.economy_state({gold});
    assert.equal(f.ctx.economyGold,null);f.advance(2000);f.render();assertReads(f,2);
    f.callbacks.economy_state({gold:0});assert.equal(f.gold(),'0 ทอง');
    f.advance(60000);f.render();assertReads(f,2);
  }
});

test('closed or unrelated drawers and missing artisan DOM never request a wallet',()=>{
  for(const drawer of [null,'bag','smith','economy','character']){
    const f=fixture(drawer);f.ctx.refreshArtisanWallet();assertReads(f,0);
  }
  for(const [drawer,id] of [['crafting','personalBench'],['forge','forgeTargetButton']]){
    const f=fixture(drawer);f.elements.delete(id);f.render();assertReads(f,0);
  }
});

test('disconnect, unsupported economy, absent character and transient account guard every read',()=>{
  for(const drawer of ['crafting','forge'])for(const [name,change] of [
    ['demo',f=>{f.ctx.mode='demo';}],['disconnected',f=>{f.ctx.room=null;}],
    ['economy disabled',f=>{f.ctx.room.state.economyAvailable=false;}],
    ['not persistent',f=>{f.player.persistent=false;}],['missing character',f=>{f.ctx.ownServerCharacter=()=>null;}],
  ]){
    const f=fixture(drawer);change(f);f.render();assert.equal(f.wire.length,0,drawer+': '+name);
  }
});

test('pending craft or item use blocks recovery without altering pending state',()=>{
  for(const drawer of ['crafting','forge'])for(const flag of ['economyPending','itemUsePending']){
    const f=fixture(drawer);f.ctx[flag]=true;f.render();f.advance(4000);f.render();
    assert.equal(f.wire.length,0);assert.equal(f.ctx[flag],true);assert.equal(f.timers.size,0);
    f.ctx[flag]=false;f.render();assertReads(f,1);
  }
});

test('a new room resets the cooldown only after its artisan page is bound',()=>{
  for(const drawer of ['crafting','forge']){
    const f=fixture(drawer);f.render();assertReads(f,1);
    const original=f.ctx.room;f.ctx.room=f.makeRoom('replacement');
    f.ctx.refreshArtisanWallet();assertReads(f,1,'stale page must not read the new room');
    f.callbacks.economy_state({gold:999});assert.equal(f.ctx.economyGold,null,'old-room event cannot supply the new wallet');
    f.bindPage();f.render();assertReads(f,2);
    assert.equal(f.wire[0].room,original.name);assert.equal(f.wire[1].room,'replacement');
    f.advance(1999);f.render();assertReads(f,2);
  }
});

test('a send failure remains throttled and can recover with another read',()=>{
  const f=fixture();f.hook(()=>{throw Error('test transport unavailable');});f.render();assertReads(f,1);
  for(let i=0;i<10;i++)f.render();assertReads(f,1);
  f.hook(null);f.advance(2000);f.render();assertReads(f,2);
  f.callbacks.economy_state({gold:996});assert.equal(f.gold(),'996 ทอง');
});

console.log('PASS artisan wallet recovery: '+groups+' focused regression groups');
