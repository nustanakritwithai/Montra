const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {resolve} = require("node:path");
const {createHash} = require("node:crypto");
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

test("all three dugout LODs match the reviewed assets and expose the same animation nodes", () => {
  const assets = resolve(root, "assets/boats");
  const receipt = JSON.parse(readFileSync(resolve(assets, "validation.json"), "utf8"));
  assert.equal(receipt.files.length, 3);
  for (const [lod, entry] of receipt.files.entries()) {
    assert.equal(entry.filename, `MONTRA-ayutthaya-dugout-LOD${lod}.glb`);
    const bytes = readFileSync(resolve(assets, entry.filename));
    assert.equal(bytes.length, entry.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.sha256);
    const gltf = JSON.parse(bytes.toString("utf8", 20, 20 + bytes.readUInt32LE(12)));
    const names = new Set(gltf.nodes.map(node => node.name));
    for (const name of ["Dugout_Hull", "Paddle", "Seat", "Cargo"]) assert.ok(names.has(name), name);
  }
});

test("dugout LODs load once, preserve the deck and ignore a load after the boat despawns", async () => {
  const source = core.slice(core.indexOf("  const dugoutContainers"), core.indexOf("  function sendBoatIntent"));
  const deck = {width: 2.1, length: 5.2, y: .88};
  const loaded = [], requests = new Map(), instances = [];
  class Vector {
    constructor(x=0, y=0, z=0) { this.set(x,y,z); }
    set(x,y,z) { Object.assign(this,{x,y,z}); }
    clone() { return new Vector(this.x,this.y,this.z); }
  }
  class Transform {
    constructor(name) { this.name=name; this.position=new Vector(); this.scaling=new Vector(1,1,1); this.rotation=new Vector(); }
    dispose() { this.disposed=true; }
    isDisposed() { return this.disposed; }
    getChildMeshes() { return []; }
  }
  const container = {instantiateModelsToScene() {
    const root = new Transform("__root__"), hull = new Transform("Dugout_Hull");
    const seat = new Transform("Seat"), paddle = new Transform("Paddle");
    seat.position.set(0,.142,-.43); paddle.position.set(.219,.153,-.84);
    root.getDescendants = () => [seat,paddle,hull];
    instances.push(root);
    return {rootNodes:[root],dispose(){root.dispose();}};
  }};
  const sandbox = {
    $:()=>({}), LITE:false, scene:{}, performance:{now:()=>0}, console,
    B:{TransformNode:Transform, SceneLoader:{LoadAssetContainerAsync(path,file) {
      assert.equal(path,"./assets/boats/"); loaded.push(file);
      return new Promise(resolve=>requests.set(file,resolve));
    }}},
  };
  vm.runInNewContext(source,sandbox);
  const make = () => {
    const node = new Transform("boat");
    node.scaling.set(deck.width/.95,deck.y/.16,deck.length/5.1);
    node.metadata={sailingBoat:true,fallback:new Transform("fallback"),sternPaddle:new Transform("fallback paddle")};
    return node;
  };
  const boat = make(), peer = make();
  const fallback = boat.metadata.fallback;
  sandbox.updateDugoutModel(boat,deck,10,0);
  sandbox.updateDugoutModel(peer,deck,10,0);
  sandbox.updateDugoutModel(boat,deck,10,0);
  assert.equal(loaded.length,1);
  assert.equal(boat.metadata.fallback.disposed,undefined);
  peer.dispose();
  requests.get(loaded[0])(container);
  await new Promise(setImmediate);
  assert.equal(instances.length,1);
  assert.equal(fallback.disposed,true);
  const near = boat.metadata.dugout;
  assert.equal(near.lod,0);
  assert.ok(Math.abs((near.root.position.y+near.seat.position.y*near.root.scaling.y)*boat.scaling.y-deck.y)<1e-8);
  const moving={helmId:"local",speed:3,anchored:false};
  const original = near.stowed.clone();
  for (let i=0;i<30;i++) sandbox.animateDugout(near,moving,.10,i*16,.016);
  assert.ok(near.paddle.rotation.y>.8 && near.row>.9);
  moving.anchored=true;
  for (let i=0;i<55;i++) sandbox.animateDugout(near,moving,0,i*16,.016);
  assert.ok(Math.abs(near.paddle.position.z-original.z)<.001);
  sandbox.updateDugoutModel(boat,deck,25,500);
  assert.equal(loaded.length,1,"distance hysteresis holds the near model");
  sandbox.updateDugoutModel(boat,deck,34,500);
  assert.equal(boat.metadata.dugout,near,"old model remains during loading");
  requests.get(loaded[1])(container);
  await new Promise(setImmediate);
  assert.equal(boat.metadata.dugout.lod,1);
  assert.equal(near.root.disposed,true);
});

function fixture(raySlope=0,mapId="ritual_village") {
  const canvasEvents = {}, windowEvents = {}, packets = [], ghostOrders = [], buttons = new Map();
  const marker = {enabled:false,position:{set(x,y,z){Object.assign(this,{x,y,z});}},
    setEnabled(enabled){this.enabled=enabled;}};
  const player = {boatId:"boat",alive:true,x:0,z:51,combatState:"idle"};
  const boat = {mapId,x:0,z:51,speed:0,heading:Math.PI/2,helmId:"local",anchored:true};
  const map = {id:mapId,bounds:{minX:-60,maxX:60,minZ:-60,maxZ:60},
    waterLevel:.025,water:[{x:-80,z:48,width:160,length:40}],
    waterGates:[{id:"water_ritual_village_to_drowned_marsh",x:16,z:54,range:3.2}],
    terrain:{xs:[-60,60],zs:[-60,48,51,60],heights:[[0,0],[0,0],[-.66,-.66],[-1.45,-1.45]]},
    boatDock:{x:0,z:46,range:3,deck:{width:2.1,length:5.2,y:.88,helmZ:-1.2}}};
  const ground = {isEnabled:()=>true,metadata:{walkable:true}};
  const enemy = {isEnabled:()=>true};
  const foggedTargets = new Set();
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
  const vector=()=>({set(x,y,z){Object.assign(this,{x,y,z});}});
  const wake={position:vector(),rotation:{},scaling:vector(),setEnabled(value){this.enabled=value;},dispose(){this.disposed=true;}};
  const model={position:{x:boat.x,z:boat.z},rotation:{y:boat.heading},scaling:{set(){}},
    onDisposeObservable:{addOnce(fn){model.onDispose=fn;}},dispose(){model.onDispose?.();}};
  const sandbox = {
    $: id=>{
      if(!buttons.has(id))buttons.set(id,{hidden:true,dataset:{},children:[],setAttribute(name,value){this[name]=value;}});
      return buttons.get(id);
    },
    localId:"local",mode:"live",activeMapId:map.id,worldDefinitions:{[map.id]:map},LITE:false,
    room:{state:{boatsAvailable:true,boats:new Map([["boat",boat]]),players:new Map([["local",player]])},send:(type,payload)=>packets.push({type,...payload})},
    ownServerCharacter:()=>player,performance:{now:()=>now},toast(){},cancelQuestNavigation(){},
    fishingSelect:false,resourcePickers:new Map(),forestMonsters:new Map(),fortRoot:{isEnabled:()=>false},enemy,
    targetedSkill:null,MONSTER_ID:"possessed-1",orderGhostAttack:id=>ghostOrders.push(id),
    fieldTargetVisible:id=>!foggedTargets.has(id),
    requestMonsterAttack:()=>attacks++,pointMove:()=>walks++,marker:{clone:()=>marker},
    camera:{},scene,B:{Matrix:{Identity:()=>({})},MeshBuilder:{CreateBox:()=>({position:{}}),CreateGround:()=>wake}},
    longTailBoat:()=>model,paintTexture:()=>({}),mat:()=>({}),
    addEventListener:(event,handler)=>{windowEvents[event]=handler;},document:{addEventListener(){}},
    ui:{world:{addEventListener:(event,handler)=>{canvasEvents[event]=handler;},
      getBoundingClientRect:()=>({left:10,top:20,width:300,height:300}),setPointerCapture(){}}},
  };
  vm.runInNewContext([villageWater,terrainCell,waterDepth,sailing,picking].join("\n"),sandbox);
  sandbox.$("boatPanel").children = ["boatLaunch","boatHelm","boatAccess"].map(sandbox.$);
  sandbox.$("boatAccess").children = ["boatBoard","boatExit"].map(sandbox.$);
  const tick = value=>{now=value;sandbox.updateSailing(now,.02);return packets.at(-1);};
  const planning=()=>vm.runInNewContext('Boolean(sailingDestination?.planner)',sandbox);
  const plan=()=>{while(planning())sandbox.advanceSailingCourse(boat,now);};
  tick(0);
  const pointerEvent = (kind,type,id=1) => canvasEvents[kind]({button:0,pointerType:type,pointerId:id,clientX:100,clientY:110});
  const tap = (type,x,z,hit=ground,finishPlan=true) => {
    point = {x,z};selected=hit;pointerEvent("pointerdown",type);pointerEvent("pointerup",type);if(finishPlan)plan();
  };
  return {tick,tap,pointerEvent,marker,boat,model,wake,enemy,windowEvents,ghostOrders,packets,map,player,buttons,foggedTargets,
    helmPose:()=>sandbox.sailingHelmPose("local"),course:(start,end)=>{
      const search=sandbox.sailingCourse(map,start,end);
      let result;
      do result=search.next();while(!result.done);
      return Array.from(result.value);
    },plan,planning,
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

test("capital boats bob with the pilot and leave a wake behind their travel",()=>{
  const f=fixture(0,"mantra_capital");
  Object.assign(f.boat,{z:55,speed:4});
  f.tick(600);
  const forward=f.wake.position.x;
  assert.ok(f.wake.enabled && forward<f.model.position.x);
  assert.ok(Math.abs(f.model.position.y-f.map.waterLevel)>.005);
  assert.ok(Math.abs(f.helmPose().y-f.model.position.y-f.map.boatDock.deck.y)<1e-6);
  f.boat.speed=-4;
  f.tick(950);
  assert.ok(f.wake.enabled && f.wake.position.x>f.model.position.x);
  f.boat.speed=0;
  f.tick(1000);
  assert.equal(f.wake.enabled,false);
  f.boat.sunk=true;
  f.tick(1050);
  assert.equal(f.wake.disposed,true);
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
  assert.equal(f.marker.enabled,true,"one replan keeps the selected destination");
  f.plan();
  f.tick(6000);
  assert.equal(f.marker.enabled,false,"a second stall clears the blocked destination");
});

test("RRT finds a swept water route around a wall without authored river lanes",()=>{
  const f=fixture();
  f.map.bounds={minX:-30,maxX:30,minZ:-30,maxZ:30};
  f.map.water=[{x:-30,z:-30,width:60,length:60}];
  f.map.terrain={xs:[-30,30],zs:[-30,30],heights:[[-2,-2],[-2,-2]]};
  f.map.walls=[{x:-1,z:-24,width:2,length:32}];
  const start={x:-18,z:0}, end={x:18,z:0}, route=f.course(start,end);
  assert.ok(route.length>1,"must search beyond a straight course");
  assert.deepEqual(route.at(-1),end);
  assert.deepEqual(f.course(start,end),route,"the same endpoints reproduce the route");
  const points=[start,...route];
  for(let i=1;i<points.length;i++){
    const a=points[i-1], b=points[i];
    for(let j=0;j<=100;j++){
      const x=a.x+(b.x-a.x)*j/100,z=a.z+(b.z-a.z)*j/100;
      assert.ok(Math.hypot(Math.max(0,Math.abs(x)-1),Math.max(0,z-8,-24-z))>2.58,"hull clears the wall along each leg");
    }
  }
  f.map.walls[0].length=54;
  f.map.walls[0].z=-27;
  assert.equal(f.course(start,end).length,0,"a sealed waterway must not send thrust through the wall");
});

test("helm waits for a complete course and cancels pending planning when the window blurs",()=>{
  const f=fixture();
  f.tap("touch",48,54,null,false);
  assert.equal(f.planning(),true);
  assert.deepEqual(f.tick(100),{type:"boat_intent",action:"input",throttle:0,steer:0});
  f.windowEvents.blur();
  assert.equal(f.marker.enabled,false);
  assert.equal(f.planning(),false);
  assert.equal(f.tick(200).throttle,0);
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

test("fog hides attack picks without disabling navigation at the helm",()=>{
  const f = fixture();
  f.foggedTargets.add("possessed-1");
  f.tap("touch",9,54,f.enemy);
  assert.equal(f.stats().attacks,0);
  assert.equal(f.marker.enabled,true);
  f.aimGhost();
  f.tap("touch",9,54,f.enemy);
  assert.deepEqual(f.ghostOrders,[undefined]);
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

test("water actions reference packaged WebP icons and share the boat access artwork",()=>{
  const html=readFileSync(resolve(root,"index.html"),"utf8");
  assert.match(html, /<button id="boatLaunch"[^>]*aria-label="เรียกเรือ"[^>]*title="เรียกเรือ"/);
  const icons={boatLaunch:"boat-launch",boatBoard:"boat-board",boatExit:"boat-board",boatHelm:"boat-paddle",fishButton:"fishing-rod"};
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

test("boarding and disembarking alternate in one compact circular slot",()=>{
  const html=readFileSync(resolve(root,"index.html"),"utf8");
  const accessMarkup=html.match(/<div id="boatAccess"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "";
  assert.match(accessMarkup, /<button id="boatBoard"[^>]*aria-label="ขึ้นเรือ"/);
  assert.match(accessMarkup, /<button id="boatExit"[^>]*aria-label="ลงจากเรือ"/);
  const css=readFileSync(resolve(root,"src/styles/hud/016-field-layout-and-account.css"),"utf8");
  assert.match(css, /\.boat-access:not\(\[hidden\]\)\s*\{[^}]*width:44px; height:44px/);
  assert.match(css, /\.boat-access > \.warp-button\s*\{[^}]*grid-area:1 \/ 1/);
  assert.match(css, /\.boat-access > \.warp-button::before\s*\{[^}]*inset:6px;[^}]*border-radius:50%/);

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
