// Real pinned-hunt drawer and network receipts, without a live account or browser.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=p=>fs.readFileSync(p,'utf8'),journey=read('src/client/ui/041-character-hud-and-journey.js'),drawer=read('src/client/ui/057-npcs-and-objectives.js'),network=read('src/client/network/044-state-sync-and-connection.js');
function slice(source,start,end){const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert(a>=0&&b>a);return source.slice(a,b);}
function fixture(){
  const nodes={},fixedNodes={muayBookButton:{}},messages=[],callbacks={},storage=new Map(),opened=[],harvests=[];let previews=0,body='';
  const me={characterId:'guardian',pathId:'blade',level:10,x:0,y:0,z:0,experience:0,xpToNext:5100,mapId:'bound_temple',alive:true};
  const joined={sessionId:'me',state:{players:new Map([['me',me]]),monsters:new Map([['temple_forecourt_3',{alive:true,level:10,x:5,z:0}]])},onMessage:(name,fn)=>callbacks[name]=fn};
  const source={id:'temple_forecourt_3',mobs:['temple_forecourt_3'],monster:'ภูตทวารบาล',map:'วัดร้าง',mapId:'bound_temple',level:10,open:true};
  const context={console,performance:{now:()=>1000},mode:'live',room:joined,joined,localId:'me',activeMapId:me.mapId,drawerActive:null,spellTargetId:null,
    inventoryState:{slots:Array(12).fill(null)},catalogRevision:0,resources:{mapId:'forbidden_forest',nodes:[]},fieldTrainingTip:null,forestObjectiveState:null,territoryState:null,
    gearGuides:{path:'blade',level:10,builds:[],journey:{practice:{...source,level:9},camps:[]}},
    personalItems:{mat_fiber_2:{kind:'material',name:'ใยป่านชั้น2',level:10,huntTarget:source},mat_metal_2:{kind:'material',name:'แร่ชั้น2',level:10},
      mat_raw_stone_2:{kind:'material',name:'หินดิบชั้น2',level:10},mat_raw_stone_3:{kind:'material',level:25},
      mat_raw_wood_2:{kind:'material',name:'ไม้ดิบชั้น2',level:10},mat_raw_wood_3:{kind:'material',level:25}},
    worldDefinitions:{bound_temple:{id:'bound_temple',name:'วัดร้าง',camps:[{levels:[11,12,13,14]}],portals:[{id:'temple_to_forest',targetMapId:'forbidden_forest',x:-10,z:0}]},
      forbidden_forest:{id:'forbidden_forest',name:'ป่า',camps:[{levels:[9,10,11,12]}],portals:[{id:'forest_to_marsh',targetMapId:'drowned_marsh',x:20,z:0}]},
      drowned_marsh:{id:'drowned_marsh',name:'บึง',region:{},camps:[{levels:[10,11,12]}],portals:[]}},
    MONSTER_ID:'possessed-1',INVENTORY_SLOTS:12,POTION_ITEM_ID:'health_potion',SHRINE_SHARD:'shard',shardName:'เศษตรา',itemUsePending:false,
    onlinePlayers:new Map(),avatars:new Map(),camera:{target:{x:0,z:0}},economyReady:()=>true,
    $:id=>nodes[id]||fixedNodes[id]||null,ownServerCharacter:()=>me,monsterForSpell:()=>null,bagMeta:id=>context.personalItems[id],wearPositions:()=>[],
    localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},toast:s=>messages.push(s),
    ui:{quest:{classList:{contains:()=>false}},drawerTitle:{},drawerBody:{set textContent(v){body=v;for(const key of Object.keys(nodes))delete nodes[key];},get textContent(){return body;}}},
    playRemoteHarvest(node){harvests.push({id:node.id,stock:node.stock});},renderItemPreview(){previews++;},openMap(){opened.push('map');},openBag(){opened.push('bag');nodes.bagSlot0={click(){opened.push('slot0');}};},
    openDrawer(name,title,html){for(const key of Object.keys(nodes))delete nodes[key];for(const [,id] of html.matchAll(/id="([^"]+)"/g))nodes[id]={};context.drawerActive=name;context.ui.drawerTitle.textContent=title;},
    closeDrawer(){context.drawerActive=null;},currentEquippedWeaponSlot:()=>0,wornGearAt:()=>null};
  for(const name of ['syncWorldDefinition','syncMonsterState','syncSummons','syncFortification','setOnlinePlayer','noteAvatarState','setAvatarGear','removeOnlinePlayer','updateCharacterHud','syncPKHud','syncForestMonsters','syncClimbButton','updateFlightButton','syncMountButton','syncPossessionButton','syncOccultUI','syncBladeUI','syncSentinelUI','syncSwordTreeButton','syncSwordHotbar','syncMuayHotbar','syncMuayComboStatus','syncSwordStatus','renderSwordTree','renderMuayBook','renderBag','renderProgressionProfile','renderParty','renderGuild','renderEconomy','observeLootInventory','floatAtPlayer','recordPracticePrey','renderResourceNodes','updateResourceHud'])context[name]=()=>{};
  vm.createContext(context);
  vm.runInContext("let travelRoutes=null,itemHuntOwner='',itemHunt=null,journeyOwner='',journeyNotes={};\n"+
    slice(journey,'  function travelRoute(','  function hudGuide()')+
    slice(drawer,'  function renderItemHuntDrawer(','  function renderFieldGoalDrawer(')+
    slice(network,'  let fieldQuestProgressKey = null;','  let syncPoll = null;')+
    slice(network,'      joined.onMessage("inventory_state",','      joined.onMessage("weapon_equipped",')+
    slice(network,'      let resourcePage=null;','      joined.onMessage("resource_result",')+
    '\nglobalThis.api={pin:saveItemHunt,open:openCurrentQuest,hunt:itemHuntGuide,current:currentItemHunt,sync:()=>syncState(joined.state)};',context);
  return {context,me,nodes,callbacks,messages,storage,opened,harvests,api:context.api,previews:()=>previews};
}
function inventory(item,quantity){const slots=Array(12).fill(null);if(quantity)slots[0]={itemId:item,quantity};return {version:1,slots,equippedWeaponSlot:null};}
let f=fixture();f.callbacks.inventory_state(inventory('mat_fiber_2',1));f.api.pin({id:'mat_fiber_2',need:3});f.api.open();
assert.match(f.nodes.huntStep.textContent,/ภูตทวารบาล.*1\/3/);f.callbacks.inventory_state(inventory('mat_fiber_2',2));
assert.match(f.nodes.huntStep.textContent,/ภูตทวารบาล.*2\/3/,'guardian loot refreshes open pinned progress immediately');
const after=f.previews();for(let i=0;i<5;i++)f.api.sync();assert.equal(f.previews(),after,'unchanged polls retain controls');
f.nodes.huntMap.onclick();assert.equal(f.opened.at(-1),'map');
f.context.closeDrawer();f.api.open();const reopened=f.previews();f.api.sync();assert.equal(f.previews(),reopened+1,'new detail node refreshes even when reopened between polls with unchanged inputs');
f.context.closeDrawer();f.callbacks.inventory_state(inventory('mat_fiber_2',1));assert.equal(f.previews(),reopened+1,'closed details not touched');
f.api.open();assert.match(f.nodes.huntStep.textContent,/1\/3/,'reopen uses latest inventory');
f.context.room={sessionId:'replacement'};f.callbacks.inventory_state(inventory('mat_fiber_2',2));assert.match(f.nodes.huntStep.textContent,/1\/3/,'old room cannot update details');f.context.room=f.context.joined;
f.callbacks.inventory_state(inventory('mat_fiber_2',3));assert.equal(f.api.current(),null);assert.equal(f.nodes.huntStep,undefined);assert.match(f.context.ui.drawerBody.textContent,/ได้ครบแล้ว/);
for(let i=0;i<3;i++)f.api.sync();assert.equal(f.messages.filter(s=>s.includes('ได้ครบแล้ว')).length,1,'completion is preserved and announced once');

f=fixture();f.api.pin({id:'mat_metal_2',need:2});f.api.open();assert.equal(f.nodes.huntRefine.hidden,true);
f.callbacks.inventory_state(inventory('mat_raw_stone_2',2));assert.equal(f.nodes.huntRefine.hidden,false);assert.match(f.nodes.huntStep.textContent,/แปรรูป/);f.nodes.huntRefine.onclick();assert.deepEqual(f.opened,['bag','slot0']);
f.callbacks.inventory_state(inventory('mat_metal_2',1));assert.equal(f.nodes.huntRefine.hidden,true,'refining away raw inputs removes outdated action');
f.nodes.endItemHunt.onclick();assert.equal(f.api.current(),null);assert.equal(f.context.drawerActive,null);

f=fixture();f.api.pin({id:'mat_raw_wood_2',need:3});f.api.open();assert.match(f.nodes.huntStep.textContent,/ไปประตู/);
f.callbacks.world_resources({mapId:'bound_temple',nodes:[{id:'wood2',kind:'wood',tier:2,x:4,z:0,stock:3}]});
assert.match(f.nodes.huntStep.textContent,/เดินไปต้นไม้/,'late local resource snapshot replaces stale cross-map route');
f.callbacks.world_resource_delta({mapId:'bound_temple',nodes:[{id:'wood2',stock:0,nextIn:1000}]});assert.match(f.nodes.huntStep.textContent,/กำลังฟื้น/,'mutable resource delta refreshes stock hint');
assert.deepEqual(f.harvests,[{id:'wood2',stock:3}],'stock decrease preserves harvest effect before mutation');
const delta=f.previews();f.api.sync();assert.equal(f.previews(),delta,'delta refresh deduplicates subsequent polls');
f.context.room={sessionId:'replacement'};f.callbacks.world_resources({mapId:'bound_temple',nodes:[]});assert.match(f.nodes.huntStep.textContent,/กำลังฟื้น/);

// The resource refresh also applies to an equipment recipe drawer.
f=fixture();f.context.gearGuides.journey.weapon='weapon10';f.context.personalItems.weapon10={name:'อาวุธ Lv10',level:10,recipe:[{item:'mat_raw_wood_2',qty:3}]};
f.context.drawerActive='quest';f.nodes.fieldGoalProgress={};const goals=[];f.context.renderFieldGoalDrawer=g=>goals.push(g);
f.api.sync();assert.equal(goals.at(-1).to.id,'temple_to_forest');
f.callbacks.world_resources({mapId:'bound_temple',nodes:[{id:'wood2',kind:'wood',tier:2,x:4,z:0,stock:3}]});assert.equal(goals.at(-1).to.id,'wood2');
f.callbacks.world_resource_delta({mapId:'bound_temple',nodes:[{id:'wood2',stock:0,nextIn:1000}]});assert.match(goals.at(-1).step,/กำลังฟื้น/);
assert.deepEqual(f.harvests,[{id:'wood2',stock:3}],'equipment resource refresh preserves harvest effect too');
console.log('PASS pinned guardian receipt progress, dedup, reopen, cancellation, completion, refine action, late resources, deltas and stale-room guards');
