const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {resolve} = require("node:path");
const {test} = require("node:test");
const vm = require("node:vm");

const root = resolve(__dirname,"../..");
const core = readFileSync(resolve(root,"src/client/core/059-frame-loop-and-startup.js"),"utf8");
const village = readFileSync(resolve(root,"src/client/world/014-ritual-village.js"),"utf8");
const pointer = readFileSync(resolve(root,"src/client/input/045-pointer-touch-and-dash.js"),"utf8");
const sailing = core.slice(0,core.indexOf("  // Cooldown labels"));
const picking = pointer.slice(0,pointer.indexOf('  ui.world.addEventListener("pointercancel"'));
const villageWater = village.slice(village.indexOf("  const villageWaterLevel"),village.indexOf("  const lanternPaper"));

function fixture(raySlope=0) {
  const canvasEvents = {}, windowEvents = {}, packets = [], ghostOrders = [], buttons = new Map();
  const marker = {enabled:false,position:{set(x,y,z){Object.assign(this,{x,y,z});}},
    setEnabled(enabled){this.enabled=enabled;}};
  const player = {boatId:"boat",alive:true,x:0,z:51};
  const boat = {mapId:"ritual_village",x:0,z:51,speed:0,heading:Math.PI/2,helmId:"local",anchored:true};
  const map = {id:"ritual_village",bounds:{minX:-60,maxX:60,minZ:-60,maxZ:60},
    boatDock:{x:0,z:46,range:3,deck:{width:2.1,length:5.2,y:.88}}};
  const ground = {isEnabled:()=>true,metadata:{walkable:true}};
  const enemy = {isEnabled:()=>true};
  let now = 0, point = {x:15,z:54}, selected = ground, rayCalls = 0, attacks = 0, walks = 0;
  const scene = {
    pick(_x,_y,predicate){return selected && predicate(selected) ? {hit:true,pickedMesh:selected,pickedPoint:point} : null;},
    createPickingRay(x,y){
      assert.equal(x,90,"pick uses canvas-relative CSS pixels");
      assert.equal(y,90,"touch uses the same canvas coordinates");
      rayCalls++;
      return {origin:{x:point.x-raySlope*5,y:5,z:point.z},direction:{x:raySlope,y:-1,z:0}};
    },
  };
  const sandbox = {
    $: id=>{
      if(!buttons.has(id))buttons.set(id,{hidden:true,dataset:{},children:[],querySelectorAll:()=>[]});
      return buttons.get(id);
    },
    localId:"local",mode:"live",activeMapId:map.id,worldDefinitions:{[map.id]:map},
    room:{state:{boatsAvailable:true,boats:new Map([["boat",boat]])},send:(type,payload)=>packets.push({type,...payload})},
    ownServerCharacter:()=>player,performance:{now:()=>now},toast(){},cancelQuestNavigation(){},
    fishingSelect:false,resourcePickers:new Map(),forestMonsters:new Map(),fortRoot:{isEnabled:()=>false},enemy,
    targetedSkill:null,MONSTER_ID:"possessed-1",orderGhostAttack:id=>ghostOrders.push(id),
    requestMonsterAttack:()=>attacks++,pointMove:()=>walks++,marker:{clone:()=>marker},
    camera:{},scene,B:{Matrix:{Identity:()=>({})},MeshBuilder:{CreateBox:()=>({position:{}})}},
    longTailBoat:(x,z,heading)=>({position:{x,z},rotation:{y:heading},scaling:{set(){}},dispose(){}}),
    addEventListener:(event,handler)=>{windowEvents[event]=handler;},document:{addEventListener(){}},
    ui:{world:{addEventListener:(event,handler)=>{canvasEvents[event]=handler;},
      getBoundingClientRect:()=>({left:10,top:20,width:300,height:300}),setPointerCapture(){}}},
  };
  vm.runInNewContext(villageWater+"\n"+sailing+"\n"+picking,sandbox);
  const tick = value=>{now=value;sandbox.updateSailing(now,.02);return packets.at(-1);};
  tick(0);
  const pointerEvent = (kind,type,id=1) => canvasEvents[kind]({button:0,pointerType:type,pointerId:id,clientX:100,clientY:110});
  const tap = (type,x,z,hit=ground) => {
    point = {x,z};selected=hit;pointerEvent("pointerdown",type);pointerEvent("pointerup",type);
  };
  return {tick,tap,pointerEvent,marker,boat,enemy,windowEvents,ghostOrders,packets,
    aimGhost:()=>{sandbox.targetedSkill="ghostAttack";},stats:()=>({rayCalls,attacks,walks})};
}

test("mouse clicks sail toward water, turn, and stop at the marker",()=>{
  const f = fixture();
  f.tap("mouse",15,54);
  assert.equal(f.marker.enabled,true);
  assert.equal(f.marker.position.x,15);
  const steer = f.tick(100);
  assert.equal(steer.type,"boat_intent");
  assert.equal(steer.action,"input");
  assert.equal(steer.anchor,false);
  assert.ok(steer.throttle>0 && steer.steer>0);
  Object.assign(f.boat,{x:15,z:54,anchored:false});
  const stopped=f.tick(200);
  assert.equal(stopped.throttle,0);
  assert.equal(stopped.steer,0);
  assert.equal(f.marker.enabled,false);
});

test("a touch on open water uses the same input, even without a ground mesh",()=>{
  const f = fixture();
  f.tap("touch",-15,54,null);
  assert.equal(f.stats().rayCalls,1);
  assert.ok(f.tick(100).throttle<0,"the existing helm can reverse toward a target behind it");
  f.tick(3100);
  assert.equal(f.marker.enabled,false,"no motion or turn clears a blocked destination");
});

test("a tilted ray intersects the visible village river surface",()=>{
  const f = fixture(2);
  f.tap("touch",15,54);
  assert.equal(f.marker.enabled,true);
  assert.ok(Math.abs(f.marker.position.x-14.95)<1e-6);
  assert.ok(Math.abs(f.marker.position.y-.175)<1e-6);
});

test("taps on land and attack targets stay distinct from sailing",()=>{
  const f = fixture();
  f.tap("touch",9,30);
  assert.equal(f.marker.enabled,false);
  f.tap("touch",9,54,f.enemy);
  assert.equal(f.stats().attacks,1);
  assert.equal(f.stats().rayCalls,1);
  assert.equal(f.stats().walks,0);
  f.boat.helmId = "";
  f.tick(100);
  f.tap("mouse",6,48);
  assert.equal(f.stats().walks,1);
});

test("aiming a ghost order redirects taps on monsters and players to the ghost",()=>{
  const f = fixture();
  const player = {isEnabled:()=>true,metadata:{pkPlayerId:"opponent"}};
  f.aimGhost();
  f.tap("touch",9,54,f.enemy);
  f.tap("mouse",9,54,player);
  assert.deepEqual(f.ghostOrders,["possessed-1","opponent"]);
  assert.deepEqual(f.stats(),{rayCalls:0,attacks:0,walks:0});
});

test("tapping an opposing captured ghost sends its server-issued attack target",()=>{
  const f = fixture();
  const targetId = "ghost:opponent:01234567-89ab-4cde-8f01-23456789abcd";
  const ghost = {isEnabled:()=>true,metadata:{ghostCombatTargetId:targetId}};
  f.tap("touch",9,54,ghost);
  assert.deepEqual(f.packets.at(-1),{type:"attack",targetId});
  assert.deepEqual(f.stats(),{rayCalls:0,attacks:0,walks:0});
});

test("pinching does not set a course and manual steering can take over",()=>{
  const f = fixture();
  f.pointerEvent("pointerdown","touch",1);
  f.pointerEvent("pointerdown","touch",2);
  f.pointerEvent("pointerup","touch",1);
  f.pointerEvent("pointerup","touch",2);
  assert.equal(f.stats().rayCalls,0);
  f.tap("touch",10,55);
  assert.equal(f.marker.enabled,true);
  f.windowEvents.keydown({code:"KeyW",preventDefault(){}});
  assert.equal(f.tick(100).throttle,1);
  assert.equal(f.marker.enabled,false);
});
