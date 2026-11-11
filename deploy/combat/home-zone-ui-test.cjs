const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname,"../../src/client/ui/054-forge-feedback-and-pages.js"),"utf8");
const start = source.indexOf("  const homeRecipeIds =");
assert(start >= 0);
const messages=[], elements=new Map();
const document = {activeElement:null, createElement:tag=>new Element(tag)};
class Element {
  constructor(tag) {
    this.tag=tag;this.children=[];this.dataset={};this.attributes={};
    this.style={setProperty:()=>{}};
  }
  append(...children){this.children.push(...children);}
  replaceChildren(){this.children=[];}
  setAttribute(key,value){this.attributes[key]=value;}
  focus(){document.activeElement=this;}
  querySelectorAll(tag){return this.children.flatMap(child=>[
    ...(child.tag===tag?[child]:[]),...child.querySelectorAll(tag),
  ]);}
}
const own={mapId:"ritual_village",x:0,z:0};
const room={send:(command,payload)=>messages.push([command,JSON.parse(JSON.stringify(payload))])};
let now=10_000, sequence=0, timer=0;
const itemIds={furniture_stool:{name:"ม้านั่ง",furniture:true,recipe:[{item:"wood",qty:2}]},
  food_spirit_stew:{name:"แกงวิญญาณ",food:true,cookingLevel:3,recipe:[{item:"fish",qty:1}]},
  drink_clean_water:{name:"น้ำสะอาด",nutrition:{water:35}},
  furniture_wood_wall:{name:"ผนังไม้",furniture:true,homeLayer:"structure",recipe:[{item:"wood",qty:2}]},
  furniture_plank_floor:{name:"พื้นไม้กระดาน",furniture:true,homeLayer:"floor",recipe:[{item:"wood",qty:1}]}};
const ctx=vm.createContext({
  document, room, ownServerCharacter:()=>own, economyReady:()=>true,
  homeMapTemplate:{id:"personal_home"}, economyPending:false, itemUsePending:false,
  activeMapId:"ritual_village", drawerActive:null,
  inventoryState:{slots:[{itemId:"furniture_stool",quantity:1},{itemId:"drink_clean_water",quantity:1}]},
  personalItems:itemIds,
  economyRequestId:()=>("home-test-request-"+(++sequence)), Date:{now:()=>now},
  setTimeout:()=>++timer, clearTimeout:()=>{},
  $:id=>elements.get(id),
  openDrawer:()=>{ctx.drawerActive="home";for(const id of ["homeSummary","homeNotice","homeControls"])elements.set(id,new Element("div"));},
});
const api=vm.runInContext(source.slice(start)+
  "\n({openHomePanel, applyHomeState, renderHomePanel, finishHomeAction, homeCommandError, isPrivateHomeMap})",ctx);
const state=(props={})=>({level:1,width:4,stride:8,plotCount:2,furniture:[],garden:[],serverNow:10_000,
  cooking:{level:1,xp:0,kitchen:false},...props});
const buttons=()=>elements.get("homeControls").querySelectorAll("button");
const find=(label)=>buttons().find(btn=>btn.textContent===label);
const press=(label)=>{
  const element=find(label);
  assert(element && !element.disabled,label);
  element.onclick();
  return messages.at(-1);
};
api.openHomePanel();
assert.deepEqual(messages.map(([command])=>command),["get_home","get_needs","get_inventory"]);
api.applyHomeState(state({level:0}));
assert.deepEqual(press("ซื้อเรือน · 100 ทอง"),["home_action",{action:"buy",requestId:"home-test-request-1"}]);
api.applyHomeState(state({level:0}));
assert.equal(find("ซื้อเรือน · 100 ทอง").disabled,true);
api.applyHomeState(state({requestId:"home-test-request-1"}));
assert.equal(find("เข้าเรือน").disabled,false);
assert.deepEqual(press("เข้าเรือน"),["enter_home",{}]);
assert.equal(api.finishHomeAction(null,"enter_home",""),true);
own.mapId="personal_home_"+"a".repeat(32);
assert.equal(api.isPrivateHomeMap(own.mapId),true);
assert.equal(api.isPrivateHomeMap("personal_home"),false);
api.renderHomePanel();
buttons().find(b=>b.dataset.homeFocus==="cell-9").onclick();
assert.deepEqual(press("วาง ม้านั่ง"),["home_action",{action:"place",itemId:"furniture_stool",cell:9,requestId:"home-test-request-2"}]);
api.applyHomeState(state({furniture:[{cell:9,itemId:"furniture_stool"}],requestId:"home-test-request-2"}));
press("ย้ายไปช่องว่าง");
buttons().find(b=>b.dataset.homeFocus==="cell-10").onclick();
assert.deepEqual(messages.at(-1),["home_action",{action:"move",from:9,cell:10,requestId:"home-test-request-3"}]);
api.applyHomeState(state({furniture:[{cell:10,itemId:"furniture_stool"}],garden:[{plot:0,readyAt:11_000}],requestId:"home-test-request-3"}));
assert.equal(find("แปลง 1 · กำลังโต").disabled,true);
now=11_001;
api.renderHomePanel();
assert.deepEqual(press("แปลง 1 · เก็บเกี่ยว"),["home_action",{action:"harvest",plot:0,requestId:"home-test-request-4"}]);
api.applyHomeState(state({requestId:"home-test-request-4"}));
assert.equal(find("ทำ แกงวิญญาณ · ต้องการระดับ 3 และเตาครัว").disabled,true);
assert.deepEqual(press("ดื่ม น้ำสะอาด × 1"),["use_item",{slot:1}]);
assert.equal(api.homeCommandError("needs_full"),true);
assert.match(elements.get("homeNotice").textContent,/อิ่ม/);
console.log("PASS private home UI purchase, entry, placement, movement, harvest, recipe lock and drinking");

ctx.inventoryState.slots.push({itemId:"furniture_wood_wall",quantity:1},{itemId:"furniture_plank_floor",quantity:1});
api.applyHomeState(state({parts:[]}));
press("ผนังและประตู");
buttons().find(b=>b.dataset.homeFocus==="cell-9").onclick();
press("แนวนอน");
assert.deepEqual(press("วาง ผนังไม้"),["home_action",{action:"place_part",itemId:"furniture_wood_wall",cell:9,rotation:1,requestId:"home-test-request-5"}]);
api.applyHomeState(state({parts:[{cell:9,itemId:"furniture_wood_wall",layer:"structure",rotation:1}],requestId:"home-test-request-5"}));
assert.deepEqual(press("หมุนชิ้นส่วน"),["home_action",{action:"move_part",layer:"structure",from:9,cell:9,rotation:0,requestId:"home-test-request-6"}]);
api.applyHomeState(state({parts:[{cell:9,itemId:"furniture_wood_wall",layer:"structure",rotation:0}],requestId:"home-test-request-6"}));
press("พื้น");
buttons().find(b=>b.dataset.homeFocus==="cell-9").onclick();
assert.deepEqual(press("วาง พื้นไม้กระดาน"),["home_action",{action:"place_part",itemId:"furniture_plank_floor",cell:9,rotation:0,requestId:"home-test-request-7"}]);
console.log("PASS home UI layer selection, wall rotation and shared floor cell");
