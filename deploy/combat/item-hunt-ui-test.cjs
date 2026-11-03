const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const source=fs.readFileSync("main.js","utf8");
const start=source.indexOf("  function travelRoute("),end=source.indexOf("  // The next useful step",start);
assert(start>=0 && end>start);
const run=source.slice(start,end);
const storage=new Map(),notices=[];
const player={characterId:"charA",level:12},mob={alive:true,x:18,z:3};
const gate=(targetMapId,x)=>({targetMapId,x,z:0});
const a=gate("b",5),b=gate("c",16),home={id:"shrine",x:11,z:7};
const target={id:"shrine",mapId:"c",monster:"ผู้พิทักษ์",open:true};
const ui={mode:"live",ownServerCharacter:()=>player,activeMapId:"a",drawerActive:null,territoryState:null,
  worldDefinitions:{a:{name:"หมู่บ้าน",portals:[gate("a",0),a]},b:{name:"ทางผ่าน",portals:[gate("a",1),b]},c:{name:"ศาล",portals:[],guardian:home}},
  personalItems:{fragment:{name:"เศษตรา",huntTarget:target},gear:{name:"สร้อย",huntTarget:target,forge:{},sourceBoss:"shrine",level:12},ore:{name:"แร่"}},
  room:{state:{monsters:new Map([["shrine",mob]])}},MONSTER_ID:"possessed-1",gearGuides:null,INVENTORY_SLOTS:12,
  inventoryState:{slots:[{itemId:"fragment",quantity:1},null],equipment:{}},toast:s=>notices.push(s),
  renderBag(){},closeDrawer(){},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}};
function load(){
  return vm.runInNewContext("let travelRoutes=null,itemHuntOwner='',itemHunt=null;\n"+run+"\n({guide:itemHuntGuide,bind:bindItemHuntButton,count:itemHuntCount,route:travelRoute,save:saveItemHunt})",{...ui, get activeMapId(){return ui.activeMapId;},get territoryState(){return ui.territoryState;}});
}
let tracker=load(),button={};
assert.equal(tracker.count(undefined),0);
tracker.bind(button,"fragment",3);assert(!button.hidden&&!button.disabled);button.onclick();
assert.equal(tracker.guide().to,a);assert.equal(tracker.guide().progress,"1/3");
tracker=load();assert.equal(tracker.guide().to,a); // reload on the same device
ui.activeMapId="b";assert.equal(tracker.guide().to,b);
ui.activeMapId="c";assert.equal(tracker.guide().to,mob);assert.match(tracker.guide().step,/ล่า/);
mob.alive=false;assert.equal(tracker.guide().to,home);assert.match(tracker.guide().step,/รอเกิด/);
player.characterId="charB";assert.equal(tracker.guide(),null);
player.characterId="charA";ui.territoryState={local:{inField:true}};assert.equal(tracker.guide(),null);
ui.territoryState=null;assert.equal(tracker.guide().to,home);
ui.inventoryState.slots[0].quantity=3;assert.equal(tracker.guide(),null);assert.equal(storage.size,0);assert.match(notices.at(-1),/ได้ครบแล้ว/);
tracker.bind(button,"ore",1);assert(button.hidden);
target.open=false;tracker.bind(button,"fragment",4);assert(button.disabled);target.open=true;
player.level=8;tracker.bind(button,"gear",1);assert(button.disabled);player.level=12;
tracker.bind(button,"gear",1);button.onclick();ui.inventoryState.equipment.neck="gear";assert.equal(tracker.guide(),null);
tracker.bind(button,"fragment",4);button.onclick();tracker.bind(button,"fragment",4);assert.match(button.textContent,/เลิกติดตาม/);button.onclick();assert.equal(tracker.guide(),null);
assert.deepEqual(Array.from(tracker.route(ui.worldDefinitions,"a","c")),["a","b","c"]);
assert.deepEqual(Array.from(tracker.route(ui.worldDefinitions,"c","a")),[]);
console.log("PASS item hunt routes, live target, boss respawn, saved character scope, progress and cancel");

const fieldSource=source.slice(source.indexOf("  function fieldRecipeProgress("),source.indexOf("  function hudGuide()"));
const drawerSource=source.slice(source.indexOf("  function renderFieldGoalDrawer("),source.indexOf('  ui.quest.addEventListener("click"'));
const camp={mapId:"forbidden_forest",name:"ชายป่ากระซิบ",mobs:["west1","west2"],x:10,z:10,goal:10,maxLevel:10,weapon:"wrap"};
const gear={name:"ผ้าพันหมัด",level:1,craftGold:4,recipe:[{item:"hide",qty:3},{item:"fiber",qty:2}]};
const docs={wrap:gear,hide:{name:"หนัง",huntTarget:{open:true}},fiber:{name:"ใย"},fragment:{name:"เศษตรา",bossGear:"amulet",sourceBoss:"boss",huntTarget:{mapId:camp.mapId}},
  amulet:{name:"สร้อย",level:12,sourceBoss:"boss",craftGold:24,recipe:[{item:"fragment",qty:3},{item:"hide",qty:2}]}};
const bag={slots:[{itemId:"wrap",quantity:1},{itemId:"hide",quantity:2}],starterHuntKills:4,forgeCopies:{}};
const controls={},get=id=>controls[id]??={scrollIntoView(){},click(){}};
const me={pathId:"muay_boran",level:3},context={mode:"live",ownServerCharacter:()=>me,inventoryState:bag,
  economyReady:()=>true,gearGuides:{path:me.pathId,starterHunt:camp},fieldTrainingTip:null,territoryState:null,activeMapId:camp.mapId,
  personalItems:docs,itemHuntCount:id=>bag.slots.reduce((n,s)=>n+(s.itemId===id?s.quantity:0),0),
  room:{state:{monsters:new Map([["west1",{x:9,z:8,alive:false}],["west2",{x:12,z:8,alive:true}]])}},
  getLocalAvatar:()=>({x:10,z:8}),worldDefinitions:{},$:get,ui:{drawerTitle:{}},openBag(){},selectBenchRecipe(...v){context.opened=v;},
  bindItemHuntButton(_,id,qty){context.tracked={id,qty};}};
const field=vm.runInNewContext(fieldSource+drawerSource+"\n({goal:fieldGearGoal,draw:renderFieldGoalDrawer})",context);
let g=field.goal();assert.equal(g.to.x,12);assert.match(g.progress,/4\/10/);field.draw(g);
assert.match(get("fieldGoalInputs").textContent,/หนัง 2\/3/);assert.equal(context.tracked.id,"hide");
bag.slots[1].quantity=3;bag.slots.push({itemId:"fiber",quantity:2});
g=field.goal();assert.match(g.step,/วัตถุดิบครบ/);field.draw(g);get("fieldGoalRecipe").onclick();assert.deepEqual(context.opened,["all","1","wrap"]);
bag.forgeCopies.wrap=1;g=field.goal();field.draw(g);assert.equal(get("fieldGoalForge").hidden,false);
bag.slots[0].forge={rank:1};bag.forgeCopies={};assert.equal(field.goal().nextRank,2);
bag.slots[0].forge.rank=3;assert.equal(field.goal(),null);
me.level=12;bag.slots=[{itemId:"fragment",quantity:1},{itemId:"hide",quantity:1}];
g=field.goal();assert.match(g.progress,/1\/3/);field.draw(g);assert.equal(context.tracked.id,"hide");
get("fieldGoalRecipe").onclick();assert.deepEqual(context.opened,["boss","12","amulet"]);
context.room.sessionId="hunter";context.fieldTrainingTip={session:"hunter",path:me.pathId,points:1,choices:[{name:"หมัด",rank:1}]};
bag.slots=[];g=field.goal();assert(g.trainingOnly);field.draw(g);assert.match(get("fieldTrainingNames").textContent,/ศาลหมู่บ้าน.*หมัด ขั้น 1/);
assert.equal(get("fieldTrainingBook").hidden,false);context.room.sessionId="other";assert.equal(field.goal(),null);
console.log("PASS starter camp HUD, recipe links, first forge, boss supplies and character-scoped training");

const journeyWorld={id:"belfry2",mobs:["belfry1","belfry2"],mapId:camp.mapId,map:"วัดร้าง",camp:"หอระฆัง",monster:"เงา",level:15,x:12,z:8,open:true};
const bossSite={...journeyWorld,id:"bell",mobs:["bell"],monster:"ระฆังผนึก",level:20};
const journey={weapon:"newWrap",camp:journeyWorld,practice:journeyWorld};
Object.assign(docs,{newWrap:{...gear,level:10,name:"หมัดเหล็ก",stats:{atk:6}},plate:{...gear,kind:"chest",level:20,stats:{def:7}},guard:{...gear,kind:"offHand",level:20,stats:{def:7}},socket:{stats:{atk:4}}});
Object.assign(docs.wrap,{stats:{atk:3},forge:{primary:"melee",enhanceRatings:[0,1,2,3]}});
Object.assign(me,{mapId:camp.mapId,characterId:"journeyA",x:11,z:8,level:10});Object.assign(bag,{slots:[{itemId:"wrap",quantity:1,forge:{rank:3},socket:"socket"}],equippedWeaponSlot:0,equipment:{}});
Object.assign(context,{drawerActive:null,localId:"hunter",localStorage:ui.localStorage,MONSTER_ID:"possessed-1",toast:s=>notices.push(s),WEAPON_META:{},
  statNames:{atk:"โจมตี",def:"ป้องกัน"},forgeNames:{melee:"ประชิด"},statLine:diff=>Object.entries(diff).filter(([,n])=>n).map(([k,n])=>k+" "+n).join(" · "),
  currentEquippedWeaponSlot:()=>bag.equippedWeaponSlot,bagMeta:id=>docs[id],fieldTrainingTip:null});
context.room.sessionId="hunter";context.room.state.monsters=new Map([["belfry2",{alive:true,x:12,z:8}],["wrong",{alive:true,x:11,z:7}],["bell",{alive:false,x:5,z:5}]]);
context.gearGuides={path:me.pathId,level:10,starterHunt:camp,journey,builds:[{style:"pressure",slots:[{id:"plate",position:"chest"},{id:"guard",position:"offHand"}]}]};
const comparisons=source.slice(source.indexOf("  function wornGearAt("),source.indexOf("  let demoWeaponSlot"));
const journeyApi=vm.runInNewContext("let journeyOwner='',journeyNotes={};\n"+fieldSource+drawerSource+comparisons+
  "\n({goal:fieldGearGoal,draw:renderFieldGoalDrawer,start:startJourneyPractice,cast:recordPracticeCast,kill:recordPracticePrey,notes:journeyNotesForPlayer,save:saveJourney})",context);
let step=journeyApi.goal();assert.equal(step.recipe,"newWrap");assert.equal(step.to,context.room.state.monsters.get("belfry2"));
journeyApi.draw(step);assert.match(get("fieldGearCompare").textContent,/เก็บ ผ้าพันหมัด \+3 ไว้ได้/);
get("fieldGearSkip").onclick();assert.equal(journeyApi.goal(),null);me.characterId="journeyB";assert.equal(journeyApi.goal().recipe,"newWrap");me.characterId="journeyA";assert.equal(journeyApi.goal(),null);
journeyApi.save({skipped:[]});bag.slots.push({itemId:"newWrap",quantity:1});step=journeyApi.goal();assert.equal(step.itemSlot,1);
journeyApi.draw(step);assert.equal(get("fieldGearView").hidden,false);
me.level=context.gearGuides.level=15;journeyApi.kill(journeyWorld);journeyApi.start({skillId:"punch",name:"หมัด"});
assert(journeyApi.goal().practiceOnly);journeyApi.cast({skillId:"punch",playerId:"other",targetId:"belfry2"});
journeyApi.cast({skillId:"wrongSkill",playerId:"hunter",targetId:"belfry2"});journeyApi.cast({skillId:"punch",playerId:"hunter",targetId:"wrong"});
assert.equal(journeyApi.notes().trial.used,false);journeyApi.cast({skillId:"punch",playerId:"hunter",targetId:"belfry2"});
assert(journeyApi.notes().trial.used);journeyApi.kill({...journeyWorld,id:"wrong"});assert(journeyApi.notes().trial);
journeyApi.kill(journeyWorld);assert.equal(journeyApi.notes().trial,null);
me.pathId="mender";journeyApi.start({skillId:"heal",name:"รักษา"});journeyApi.kill(journeyWorld);
journeyApi.cast({skillId:"heal",playerId:"hunter",targetId:"hunter"});assert.equal(journeyApi.notes().trial,null);
me.pathId="sentinel";journeyApi.start({skillId:"shock",name:"กระแทก"});
journeyApi.cast({skillId:"shock",playerId:"hunter",targetIds:["wrong"]});assert.equal(journeyApi.notes().trial.used,false);
journeyApi.cast({skillId:"shock",playerId:"hunter",targetIds:["belfry2"]});assert(journeyApi.notes().trial.used);
journeyApi.kill(journeyWorld);me.pathId=context.gearGuides.path;
me.level=context.gearGuides.level=20;journey.boss={camp:bossSite,gear:"amulet",fragment:"fragment",level:20};
bag.slots=[bag.slots[0],{itemId:"fragment",quantity:1}];journeyApi.draw(journeyApi.goal());get("fieldBossChoice").onclick();
step=journeyApi.goal();assert(step.bossChoice);assert.match(step.step,/ยังไม่เกิด/);assert.match(step.progress,/1\/3/);
journeyApi.draw(step);get("fieldGoalRecipe").onclick();assert.deepEqual(context.opened,["boss","12","amulet"]);get("fieldBossChoice").onclick();assert.equal(journeyApi.goal().recipe,"newWrap");
me.level=context.gearGuides.level=25;delete journey.boss;step=journeyApi.goal();assert.equal(step.recipe,"plate");
context.fieldTrainingTip={session:"hunter",path:me.pathId,points:1,choices:[{name:"หมัด",rank:2}]};assert(journeyApi.goal().trainingOnly);
console.log("PASS Lv10–25 equipment comparison and skip, actual skill and prey, optional boss and level 25 priority");
