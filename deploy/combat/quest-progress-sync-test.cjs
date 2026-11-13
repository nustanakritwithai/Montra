// Execute production state sync and reward handlers. No live account or graphics required.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../../src/client/network/044-state-sync-and-connection.js'),'utf8');
const hotbar=fs.readFileSync(path.join(__dirname,'../../src/client/ui/048-class-books-and-hotbars.js'),'utf8');
const swordStart=hotbar.indexOf('  function syncSwordHotbar()');
const swordEnd=hotbar.indexOf('  // One server-owned',swordStart);
assert(swordStart>=0 && swordEnd>swordStart);
function slice(start,end){const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert(a>=0&&b>a);return source.slice(a,b);}
function fixture(){
  const nodes={fieldGoalProgress:{},muayBookButton:{},swordHotbar:{hidden:false}},renders=[],callbacks={},notices=[];
  const me={characterId:'fixture-10',pathId:'blade',level:10,experience:5000,xpToNext:5100,mapId:'bound_temple',alive:true,x:0,y:0,z:0};
  const joined={sessionId:'me',state:{players:new Map([['me',me]]),monsters:new Map([['temple_forecourt_3',{id:'temple_forecourt_3',mapId:'bound_temple',level:10,alive:false}]])},onMessage:(name,fn)=>callbacks[name]=fn};
  const context={console,room:joined,joined,localId:'me',activeMapId:'bound_temple',spellTargetId:null,mode:'live',drawerActive:'quest',
    gearGuides:{path:'blade',level:10,builds:[],journey:{}},inventoryState:{slots:Array(12).fill(null)},catalogRevision:0,resources:null,
    fieldTrainingTip:null,personalItems:{},INVENTORY_SLOTS:12,POTION_ITEM_ID:'health_potion',SHRINE_SHARD:'shard',shardName:'เศษตรา',
    onlinePlayers:new Map(),avatars:new Map(),camera:{target:{x:0,z:0}},ui:{},itemUsePending:false,
    $:id=>nodes[id]||null,ownServerCharacter:()=>me,monsterForSpell:()=>null,bagMeta:()=>null,wearPositions:()=>[],
    swordData:()=>null,swordHotbarKey:'',
    fieldGearGoal:()=>({level:me.level,experience:me.experience,map:me.mapId,guideLevel:context.gearGuides.level,slots:context.inventoryState.slots}),
    renderFieldGoalDrawer:goal=>renders.push(goal),toast:text=>notices.push(text)};
  for(const name of ['syncWorldDefinition','syncMonsterState','syncSummons','syncFortification','setOnlinePlayer','noteAvatarState','setAvatarGear','removeOnlinePlayer','updateCharacterHud','syncPKHud','syncForestMonsters','syncClimbButton','updateFlightButton','syncMountButton','syncPossessionButton','syncOccultUI','syncBladeUI','syncSentinelUI','syncSwordTreeButton','syncMuayHotbar','syncMuayComboStatus','syncSwordStatus','renderSwordTree','renderMuayBook','renderBag','renderProgressionProfile','renderParty','renderGuild','renderEconomy','observeLootInventory','floatAtPlayer','recordPracticePrey'])context[name]=()=>{};
  vm.createContext(context);
  const helper=source.includes('  let fieldQuestProgressKey = null;')?slice('  let fieldQuestProgressKey = null;','  function syncState(state) {'):'';
  vm.runInContext(hotbar.slice(swordStart,swordEnd)+helper+slice('  function syncState(state) {','  let syncPoll = null;')+
    slice('      joined.onMessage("experience_gained",','      joined.onMessage("forest_objective_state",')+
    slice('      joined.onMessage("gear_guides",','      joined.onMessage("material_sold",')+
    slice('      joined.onMessage("inventory_state",','      joined.onMessage("weapon_equipped",')+
    '\nglobalThis.sync=()=>syncState(joined.state);',context);
  return {context,me,joined,nodes,renders,callbacks,notices,sync:context.sync};
}
function bag(){return {version:1,slots:Array(12).fill(null),equippedWeaponSlot:null};}
function guide(level){return {path:'blade',level,builds:[],journey:{}};}

// Real server ordering after a Lv10 temple_forecourt_3 kill that raises player Lv10 -> Lv11:
// gear_guides, inventory_state (when loot exists), experience_gained, then the schema patch.
let f=fixture();
f.callbacks.gear_guides(guide(11));f.callbacks.inventory_state(bag());
f.callbacks.experience_gained({amount:1250,level:11,experience:1150});
assert.equal(f.me.level,10,'receipts do not mutate authoritative schema locally');
const before=f.renders.length;f.me.level=11;f.me.experience=1150;f.me.xpToNext=6150;f.sync();
assert.equal(f.nodes.swordHotbar.hidden,true,'initial sync can hide a stale class hotbar');
assert.equal(f.renders.length,before+1,'schema patch redraws open quest after early reward receipts');
assert.equal(f.renders.at(-1).level,11);assert.equal(f.renders.at(-1).guideLevel,11);
for(let i=0;i<8;i++)f.sync();assert.equal(f.renders.length,before+1,'unchanged polls do not repeatedly rebuild the drawer');

// If transport order reverses, the later guide message still refreshes the new-level route.
f=fixture();f.me.level=11;f.me.experience=1150;f.sync();assert.equal(f.renders.at(-1).guideLevel,10);
f.callbacks.gear_guides(guide(11));assert.equal(f.renders.at(-1).guideLevel,11);

// Ordinary guardian kills can grant EXP without loot or a level-up.
f=fixture();f.me.experience=0;f.sync();const first=f.renders.length;
f.callbacks.experience_gained({amount:1250,level:10,experience:1250});
assert.equal(f.renders.length,first+1,'receipt refreshes changing monster/practice state even without inventory');
f.me.experience=1250;f.sync();assert.equal(f.renders.at(-1).experience,1250);
const caughtUp=f.renders.length;f.sync();assert.equal(f.renders.length,caughtUp);
f.me.mapId='forbidden_forest';f.context.activeMapId=f.me.mapId;f.sync();assert.equal(f.renders.at(-1).map,'forbidden_forest');

// Inventory refresh is deduplicated against the next state poll.
f=fixture();f.sync();f.callbacks.inventory_state(bag());const inventoryRender=f.renders.length;f.sync();assert.equal(f.renders.length,inventoryRender);
// Closed drawers and the distinct NPC-objective drawer are not rebuilt by this helper.
f.context.drawerActive='bag';f.me.level=12;f.sync();f.callbacks.gear_guides(guide(12));assert.equal(f.renders.length,inventoryRender);
f.context.drawerActive='quest';delete f.nodes.fieldGoalProgress;f.sync();assert.equal(f.renders.length,inventoryRender);
// Old-room receipts must not alter guidance or redraw a replacement room.
f.context.room={sessionId:'replacement'};f.callbacks.gear_guides(guide(99));f.callbacks.inventory_state(bag());f.callbacks.experience_gained({amount:1,level:99});
assert.equal(f.context.gearGuides.level,12);assert.equal(f.renders.length,inventoryRender);
console.log('PASS quest progress sync: Lv10 temple guardian, both message orders, no-loot EXP, deduplicated polls, map/closed/stale-room guards');
