/** Real client guidance with synthetic inventory/room. No live account or save. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('main.js','utf8');
function slice(start,end){const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert(a>=0&&b>a);return source.slice(a,b);}
const storage=new Map(),notices=[];
const me={characterId:'early',pathId:'muay_boran',level:2,experience:20,xpToNext:300,x:0,z:0,mapId:'forbidden_forest'};
const gate={id:'forest_to_temple',x:10,z:0,targetMapId:'bound_temple'},back={id:'temple_to_forest',x:-10,z:0,targetMapId:'forbidden_forest'};
const forest={id:'forest2',mobs:['forest2','forest4'],mapId:'forbidden_forest',map:'ป่า',monster:'ผีป่า',level:2,open:true,x:3,z:0};
const temple={id:'temple6',mobs:['temple6'],mapId:'bound_temple',map:'วัดร้าง',monster:'ผีวัด',level:6,open:true,x:4,z:0};
const mons=new Map([['forest2',{alive:true,level:2,x:3,z:0}],['forest4',{alive:true,level:4,x:1,z:0}],['forest6',{alive:true,level:6,x:5,z:0}],['temple6',{alive:true,level:6,x:4,z:0}]]);
const docs={wrap:{name:'ผ้าพันหมัด',level:1,recipe:[{item:'hide',qty:3},{item:'fiber',qty:2}],forge:{}},
  next:{name:'หมัด Lv10',level:10,recipe:[{item:'hide',qty:3},{item:'fiber',qty:2}],forge:{}},
  hide:{name:'หนัง',huntTarget:forest},fiber:{name:'ใย',huntTarget:temple}};
const bag={slots:[{itemId:'wrap',quantity:1},{itemId:'hide',quantity:2}],equippedWeaponSlot:0,equipment:{},forgeCopies:{}};
const journey={weapon:'next',camp:{...temple,level:10},practice:forest,camps:[forest]};
const guides={path:me.pathId,level:me.level,starterHunt:{weapon:'wrap',mapId:'forbidden_forest',maxLevel:10},journey,builds:[]};
const context={mode:'live',me,ownServerCharacter:()=>me,inventoryState:bag,personalItems:docs,bagMeta:id=>docs[id],
  room:{state:{monsters:mons}},activeMapId:me.mapId,gearGuides:guides,fieldTrainingTip:null,territoryState:null,
  monsterForSpell:id=>mons.get(id),
  economyReady:()=>true,MONSTER_ID:'possessed-1',INVENTORY_SLOTS:12,drawerActive:null,toast:t=>notices.push(t),
  localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  worldDefinitions:{forbidden_forest:{id:'forbidden_forest',name:'ป่า',portals:[gate]},bound_temple:{id:'bound_temple',name:'วัดร้าง',portals:[back]}}};
vm.createContext(context);
const api=vm.runInContext(`let travelRoutes=null,itemHuntOwner='',itemHunt=null,journeyOwner='',journeyNotes={};\n`+
  slice('  function travelRoute(','  function hudGuide()')+
  slice('  function currentEquippedWeaponSlot(','  function sendBagCommand(')+
  slice('  function wornGearAt(','  function pieceStat(')+
  '\n({goal:fieldGearGoal,hunt:itemHuntGuide,pin:saveItemHunt,current:currentItemHunt,save:saveJourney,level:fieldLevelingGoal})',context);
const level=n=>{me.level=guides.level=n;const site={...forest,id:'forest6',mobs:['forest6'],level:Math.min(n,6)};journey.practice=site;journey.camps=[site];};
const map=id=>{me.mapId=context.activeMapId=id;};
let goal=api.goal();assert(goal.copyGoal);assert.equal(goal.to,mons.get('forest2'),'never guide Lv2 to a closer Lv4 monster');
bag.slots[1].quantity=3;
goal=api.goal();assert.equal(goal.missingMaterial.id,'fiber');assert.equal(goal.to,mons.get('forest2'),'farm before the harder material source');assert.match(goal.step,/Lv\.6/);
level(6);goal=api.goal();assert.equal(goal.to,gate,'move to the other material area once eligible');
map('bound_temple');goal=api.goal();assert(goal.copyGoal,'starter goal survives leaving the starting maps');assert.equal(goal.to,mons.get('temple6'));
mons.get('temple6').alive=false;goal=api.goal();assert.match(goal.step,/รอเกิด/);assert.equal(goal.to,mons.get('temple6'));mons.get('temple6').alive=true;
bag.slots.push({itemId:'fiber',quantity:2});goal=api.goal();assert.match(goal.step,/วัตถุดิบครบ/);assert.equal(goal.to,undefined);
bag.forgeCopies.wrap=1;assert(api.goal().copyReady,'spare copy changes goal to forging without a kill counter');
bag.forgeCopies={};bag.slots[0].forge={rank:3};goal=api.goal();assert(goal.levelGoal);assert.match(goal.progress,/Lv\.6 \/ 10.*EXP 20\/300/);assert.equal(goal.to,back,'return to safe farming before next gear unlock');
me.experience=40;assert.match(api.goal().progress,/EXP 40\/300/,'EXP receipt updates the same leveling objective');
level(10);bag.slots=[bag.slots[0]];goal=api.goal();assert.equal(goal.recipe,'next');assert.equal(goal.to,back,'equipment recipe follows missing hide, not the weapon camp');
map('forbidden_forest');assert.equal(api.goal().to,mons.get('forest4'));
bag.slots.push({itemId:'hide',quantity:3});goal=api.goal();assert.equal(goal.missingMaterial.id,'fiber');assert.equal(goal.to,gate,'next missing ingredient automatically changes the destination');
map('bound_temple');assert.equal(api.goal().to,mons.get('temple6'));
bag.slots.push({itemId:'fiber',quantity:2});goal=api.goal();assert.match(goal.step,/วัตถุดิบครบ/);assert.equal(goal.to,null);
bag.slots.push({itemId:'next',quantity:1});assert.equal(api.goal().itemSlot,3,'crafting changes goal to equip');bag.equippedWeaponSlot=3;
goal=api.goal();assert(goal.levelGoal);assert.match(goal.progress,/Lv\.10 \/ 20/,'equipping advances back to leveling');
level(2);map('forbidden_forest');bag.slots=[{itemId:'wrap',quantity:1}];bag.equippedWeaponSlot=0;api.pin({id:'fiber',need:2});
goal=api.hunt();assert(goal.levelGoal);assert.equal(api.current().id,'fiber','leveling keeps the requested material pinned');
level(6);assert.equal(api.hunt().to,gate,'pinned material resumes without another tap');
context.territoryState={local:{inField:true}};assert.equal(api.goal(),null);assert.equal(api.hunt(),null);context.territoryState=null;
const empty=api.level(me,{practice:{...forest,level:15},camps:[]},10);assert.equal(empty.to,undefined,'old server data cannot send a low-level player to Lv15');
// Real resource-tier rule: a camp spanning 9–12 is tier1, not tier2.
Object.assign(docs,{mat_metal_2:{name:'แร่ชั้น2',level:10},mat_raw_stone_2:{name:'หินดิบชั้น2',level:10},mat_raw_stone_3:{level:25}});
level(10);map('bound_temple');bag.slots=[];
context.resources={mapId:'bound_temple',nodes:[]};
context.worldDefinitions.forbidden_forest.camps=[{levels:[9,10,11,12]}];
context.worldDefinitions.bound_temple.camps=[];
context.worldDefinitions.drowned_marsh={id:'drowned_marsh',name:'บึงพราย',region:{},camps:[{levels:[10,11,12]}],portals:[]};
context.worldDefinitions.forbidden_forest.portals.push({id:'forest_to_marsh',targetMapId:'drowned_marsh',x:20,z:0});
api.pin({id:'mat_metal_2',need:1});assert.equal(api.hunt().to,back);
map('forbidden_forest');context.resources.mapId='forbidden_forest';
assert.equal(api.hunt().to.id,'forest_to_marsh','route through forest to actual tier2 nodes rather than looking for nonexistent forest tier2 nodes');
console.log('PASS early journey: safe leveling, cross-area supply switches, starter continuity, EXP, craft/equip/forge progression, respawn, pinned goal and legacy server fallback');
