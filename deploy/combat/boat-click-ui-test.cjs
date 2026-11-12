const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {resolve} = require("node:path");
const {test} = require("node:test");
const vm = require("node:vm");

const root = resolve(__dirname,"../..");
const core = readFileSync(resolve(root,"src/client/core/059-frame-loop-and-startup.js"),"utf8");
const village = readFileSync(resolve(root,"src/client/world/014-ritual-village.js"),"utf8");
const terrain = readFileSync(resolve(root,"src/client/world/017-region-terrain.js"),"utf8");
const pointer = readFileSync(resolve(root,"src/client/input/045-pointer-touch-and-dash.js"),"utf8");
const fishing = readFileSync(resolve(root,"src/client/world/029-fishing-and-resources.js"),"utf8");
const sailing = core.slice(0,core.indexOf("  // Cooldown labels"));
const picking = pointer.slice(0,pointer.indexOf('  ui.world.addEventListener("pointercancel"'));
const villageWater = village.slice(village.indexOf("  const villageWaterLevel"),village.indexOf("  const lanternPaper"));
const terrainCell = terrain.slice(terrain.indexOf("  function terrainCell"),terrain.indexOf("  // ---- Ground patches"));
const waterDepth = terrain.slice(terrain.indexOf("  function terrainHeight"),terrain.indexOf("  const waterPolygons"));

function fixture(raySlope=0) {
  const canvasEvents = {}, windowEvents = {}, packets = [], ghostOrders = [], buttons = new Map();
  const marker = {enabled:false,position:{set(x,y,z){Object.assign(this,{x,y,z});}},
    setEnabled(enabled){this.enabled=enabled;}};
  const player = {boatId:"boat",alive:true,x:0,z:51,combatState:"idle"};
  const boat = {mapId:"ritual_village",x:0,z:51,speed:0,heading:Math.PI/2,helmId:"local",anchored:true};
  const map = {id:"ritual_village",bounds:{minX:-60,maxX:60,minZ:-60,maxZ:60},
    waterLevel:.025,water:[{x:-80,z:48,width:160,length:40}],
    waterGates:[{id:"water_ritual_village_to_drowned_marsh",x:16,z:54,range:3.2}],
    terrain:{xs:[-60,60],zs:[-60,48,51,60],heights:[[0,0],[0,0],[-.66,-.66],[-1.45,-1.45]]},
    boatDock:{x:0,z:46,range:3,deck:{width:2.1,length:5.2,y:.88,helmZ:-1.2}}};
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
      if(!buttons.has(id))buttons.set(id,{hidden:true,dataset:{},children:[],setAttribute(name,value){this[name]=value;}});
      return buttons.get(id);
    },
    localId:"local",mode:"live",activeMapId:map.id,worldDefinitions:{[map.id]:map},
    room:{state:{boatsAvailable:true,boats:new Map([["boat",boat]]),players:new Map([["local",player]])},send:(type,payload)=>packets.push({type,...payload})},
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
  vm.runInNewContext([villageWater,terrainCell,waterDepth,sailing,picking].join("\n"),sandbox);
  sandbox.$("boatPanel").children = ["boatLaunch","boatHelm","boatAccess"].map(sandbox.$);
  sandbox.$("boatAccess").children = ["boatBoard","boatExit"].map(sandbox.$);
  const tick = value=>{now=value;sandbox.updateSailing(now,.02);return packets.at(-1);};
  tick(0);
  const pointerEvent = (kind,type,id=1) => canvasEvents[kind]({button:0,pointerType:type,pointerId:id,clientX:100,clientY:110});
  const tap = (type,x,z,hit=ground) => {
    point = {x,z};selected=hit;pointerEvent("pointerdown",type);pointerEvent("pointerup",type);
  };
  return {tick,tap,pointerEvent,marker,boat,enemy,windowEvents,ghostOrders,packets,map,player,buttons,
    helmPose:()=>sandbox.sailingHelmPose("local"),
    aimGhost:()=>{sandbox.targetedSkill="ghostAttack";},stats:()=>({rayCalls,attacks,walks})};
}

test("the pilot stays aft of the rendered bow during turns and reverse travel",()=>{
  const f=fixture();
  const assertStern=()=>{
    const pose=f.helmPose(),heading=pose.facing-Math.PI;
    assert.ok(Math.abs(pose.x+1.2*Math.sin(heading))<1e-6);
    assert.ok(Math.abs(pose.z-51+1.2*Math.cos(heading))<1e-6);
    assert.ok(Math.abs(pose.y-.905)<1e-6);
  };
  assertStern();
  f.boat.heading=0;f.boat.speed=-3;
  f.tick(100);assertStern();
  f.boat.heading=Math.PI;f.tick(200);assertStern();
  f.player.combatState="attacking";
  assert.equal(f.helmPose().facing,null,"combat retains its target facing");
  f.boat.helmId="";
  assert.equal(f.helmPose(),null);
});

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

test("pinching does not set a course and the helm responds only to taps",()=>{
  const f = fixture();
  f.pointerEvent("pointerdown","touch",1);
  f.pointerEvent("pointerdown","touch",2);
  f.pointerEvent("pointerup","touch",1);
  f.pointerEvent("pointerup","touch",2);
  assert.equal(f.stats().rayCalls,0);
  f.tap("touch",10,55);
  assert.equal(f.marker.enabled,true);
  assert.equal(f.windowEvents.keydown,undefined);
  assert.ok(f.tick(100).throttle>0);
  assert.equal(f.marker.enabled,true);
});

test("tapping the deck anchors the boat and another water tap resumes the course",()=>{
  const f = fixture();
  f.tap("touch",15,54);
  assert.equal(f.tick(100).anchor,false);
  f.boat.anchored = false;
  f.tap("touch",0,51,{isEnabled:()=>true,metadata:{sailingBoatId:"boat"}});
  assert.deepEqual(f.tick(200),{type:"boat_intent",action:"input",throttle:0,steer:0,anchor:true});
  assert.equal(f.marker.enabled,false);
  f.boat.anchored = true;
  f.tap("touch",12,53);
  assert.equal(f.tick(300).anchor,false);
  assert.equal(f.marker.enabled,true);
});

test("tapping a water gate steers toward it and requests passage once in range",()=>{
  const f=fixture(),gateId="water_ritual_village_to_drowned_marsh";
  f.boat.passage=0;
  f.tap("touch",16,54,{isEnabled:()=>true,metadata:{waterGateId:gateId}});
  assert.ok(f.tick(100).throttle>0);
  Object.assign(f.boat,{x:14,z:54,anchored:false});
  assert.deepEqual(f.tick(200),{type:"boat_intent",action:"warp",gateId});
  assert.equal(f.marker.enabled,false);
  f.boat.passage=1;
  assert.deepEqual(f.tick(300),{type:"boat_intent",action:"input",throttle:0,steer:0,passage:1});
});

test("port markers steer to the berth and anchor, and the launch control works at an alternate port",()=>{
  const f=fixture(),port={id:"river_east",name:"East landing",shore:{x:15,z:46},berth:{x:15,z:52}};
  f.map.boatPorts=[port];
  f.tap("touch",15,52,{isEnabled:()=>true,metadata:{boatPortId:port.id}});
  assert.ok(f.tick(100).throttle>0);
  Object.assign(f.boat,{x:14.4,z:52,anchored:false});
  assert.deepEqual(f.tick(200),{type:"boat_intent",action:"input",throttle:0,steer:0,anchor:true});
  assert.equal(f.marker.enabled,false);
  Object.assign(f.player,{boatId:"",x:port.shore.x,z:port.shore.z});
  f.tick(300);
  const launch=f.buttons.get("boatLaunch");
  assert.equal(launch.hidden,false);
  launch.onclick();
  assert.deepEqual(f.packets.at(-1),{type:"boat_intent",action:"launch"});
});

test("a river route aligns the hull before thrusting out of a berth",()=>{
  const f=fixture();
  f.map.boatLanes=[[{x:-25,z:54},{x:25,z:54}]];
  f.boat.heading=0;
  f.tap("touch",16,54,{isEnabled:()=>true,metadata:{waterGateId:"water_ritual_village_to_drowned_marsh"}});
  const turn=f.tick(100);
  assert.equal(turn.throttle,0);
  assert.equal(turn.steer,-1);
  f.boat.heading=Math.atan2(16,3)-.1;
  const correction=f.tick(200);
  assert.equal(correction.throttle,0);
  assert.ok(Math.abs(correction.steer+.5)<1e-6);
  f.boat.heading=Math.atan2(16,3);
  assert.ok(f.tick(300).throttle>0);
});

test("the boarding and paddle icons retain their commands and accessible helm states",()=>{
  const f=fixture();
  const helm=f.buttons.get("boatHelm");
  assert.equal(helm.hidden,false);
  assert.equal(helm.dataset.helmActive,"true");
  assert.equal(helm["aria-label"],"ปล่อยหางเสือ");
  helm.onclick();
  assert.deepEqual(f.packets.at(-1),{type:"boat_intent",action:"release"});
  f.boat.helmId="";
  f.tick(100);
  assert.equal(helm.dataset.helmActive,"false");
  assert.equal(helm["aria-label"],"จับหางเสือ");
  assert.equal(helm.textContent,undefined);
  helm.onclick();
  assert.deepEqual(f.packets.at(-1),{type:"boat_intent",action:"helm"});
  f.player.boatId="";
  f.tick(200);
  const board=f.buttons.get("boatBoard");
  assert.equal(board.hidden,false);
  board.onclick();
  assert.deepEqual(f.packets.at(-1),{type:"boat_intent",action:"board",boatId:"boat"});
});

test("the fishing icon keeps its image across casting, cancelling and collecting",()=>{
  const button={dataset:{},setAttribute(name,value){this[name]=value;}};
  const sandbox={
    $:()=>button,ownServerCharacter:()=>({alive:true}),economyReady:()=>true,fishingNearby:()=>true,
    fishingState:null,fishingSelect:false,fishSavedItem:null,fishingPending:false,
  };
  const update=fishing.slice(fishing.indexOf("  function updateFishing(now)"),fishing.indexOf("  function showFishingFloat"));
  vm.runInNewContext(update,sandbox);
  const check=(action,label)=>{
    sandbox.updateFishing(100);
    assert.equal(button.hidden,false);
    assert.equal(button.dataset.fishingAction,action);
    assert.equal(button["aria-label"],label);
    assert.equal(button.textContent,undefined);
  };
  check("cast","ตกปลา");
  sandbox.fishingSelect=true;
  check("cancel","ยกเลิกเลือกจุด");
  sandbox.fishSavedItem={};
  check("collect","รับปลาที่จับได้");
});

test("water actions reference distinct packaged WebP icons",()=>{
  const html=readFileSync(resolve(root,"index.html"),"utf8");
  assert.match(html, /<button id="boatLaunch"[^>]*aria-label="เรียกเรือ"[^>]*title="เรียกเรือ"/);
  const icons={boatLaunch:"boat-launch",boatBoard:"boat-board",boatHelm:"boat-paddle",fishButton:"fishing-rod"};
  for(const [id,name] of Object.entries(icons)){
    const asset="assets/ui/"+name+".webp";
    const markup=html.match(new RegExp('<button id="'+id+'"[^>]*>[^<]*<img src="([^"]+)"[^>]*></button>'));
    assert.equal(markup?.[1],"./"+asset);
    const image=readFileSync(resolve(root,asset));
    assert.equal(image.toString("ascii",0,4),"RIFF");
    assert.equal(image.toString("ascii",8,12),"WEBP");
  }
});

test("disembarking is available away from the docks once the boat stops",()=>{
  const f=fixture();
  const exit=f.buttons.get("boatExit");
  assert.equal(exit.hidden,false);
  f.boat.speed=3;
  const before=f.packets.length;
  exit.onclick();
  assert.equal(f.packets.length,before);
  f.boat.speed=0;
  exit.onclick();
  assert.deepEqual(f.packets.at(-1),{type:"boat_intent",action:"exit"});
});

test("boarding and disembarking alternate in one fixed-size slot",()=>{
  const html=readFileSync(resolve(root,"index.html"),"utf8");
  const accessMarkup=html.match(/<div id="boatAccess"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "";
  assert.match(accessMarkup, /<button id="boatBoard"/);
  assert.match(accessMarkup, /<button id="boatExit"/);
  const css=readFileSync(resolve(root,"src/styles/hud/016-field-layout-and-account.css"),"utf8");
  assert.match(css, /\.boat-access:not\(\[hidden\]\)\s*\{[^}]*width:44px; height:44px/);
  assert.match(css, /\.boat-access > \.warp-button\s*\{[^}]*grid-area:1 \/ 1/);

  const f=fixture();
  const access=f.buttons.get("boatAccess");
  const [board,exit]=access.children;
  const panel=f.buttons.get("boatPanel");
  assert.equal(access.hidden,false);
  assert.equal(panel.hidden,false);
  assert.equal(board.hidden,true);
  assert.equal(exit.hidden,false);
  f.player.boatId="";
  f.tick(100);
  assert.equal(access.hidden,false);
  assert.equal(panel.hidden,false);
  assert.equal(board.hidden,false);
  assert.equal(exit.hidden,true);
  f.player.x=59;
  f.tick(200);
  assert.equal(access.hidden,true);
  assert.equal(panel.hidden,true);
});

test("water icons reset the floating warp offsets in the boat and chat rows",()=>{
  const css=readFileSync(resolve(root,"styles.css"),"utf8");
  const rule=css.match(/\.field-prompts \.field-action-icon:not\(\[hidden\]\),\s*\.chat-harvest \.field-action-icon:not\(\[hidden\]\)\s*\{([^}]+)\}/)?.[1] ?? "";
  assert.match(rule,/position:relative/);
  assert.match(rule,/\binset:\s*auto\s*;/, "the old warp-button left and bottom offsets must not shift icons out of their rows");
});
