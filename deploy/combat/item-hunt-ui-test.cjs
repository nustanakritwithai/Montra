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
