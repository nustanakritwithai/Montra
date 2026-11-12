import assert from "node:assert/strict";
import test from "node:test";
import {randomBytes} from "node:crypto";
import {mkdtemp} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {boatCanSail,BOAT_DECK,MontraBoats} from "./MontraBoats.js";
import {groundAt,isSafeWorldPoint,provinceShotClear,segmentIntersectsExpandedWall,walkBridgeTransitionClear,WORLD_MAPS} from "./WorldMaps.js";
import {playerWaterDepth,WATER_EXPOSURE,wadingSpeedScale,waterDepthAt} from "./GroundTerrain.js";
import {BOAT_BOARD_RANGE} from "./PirateBoatRules.js";
import {CAPITAL_SIEGE} from "./StrategicProvinces.js";
import {CharacterStore} from "./CharacterStore.js";

test("the capital moat has four walkable bridges and a connected dry outer road",()=>{
  const map=WORLD_MAPS.mantra_capital;
  const bridges=map.walkBridges!;
  const feet=(x:number,z:number)=>({x,z,y:groundAt(map.id,x,z)});
  assert.equal(bridges.length,4);
  assert.deepEqual(CAPITAL_SIEGE.moat,{minX:-53,maxX:53,minZ:-79,maxZ:47});
  for(const [x,z] of [[-37,-36],[37,-36],[18,-63],[18,31]]){
    assert.equal(waterDepthAt(map,x,z),0,"new dry bank at "+x+","+z);
    assert.ok(isSafeWorldPoint(map,feet(x,z)),"walkable bank at "+x+","+z);
  }
  const deep=feet(7,-72),shallows=feet(7,-65.6);
  assert.ok(Math.abs(wadingSpeedScale(playerWaterDepth(map,deep))-.65)<1e-8);
  assert.equal(wadingSpeedScale(playerWaterDepth(map,shallows)),.85);
  assert.equal(playerWaterDepth(map,{...deep,boatId:"boat"}),0,"riders stay above the water resistance");
  for(const [from,to] of map.boatLanes!){
    const centerDepth=waterDepthAt(map,(from.x+to.x)/2,(from.z+to.z)/2);
    assert.ok(centerDepth>=2.9 && centerDepth<=3.05,"the middle of the moat is three metres deep");
    const steps=Math.ceil(Math.hypot(to.x-from.x,to.z-from.z));
    for(let i=0;i<=steps;i++){
      const x=from.x+(to.x-from.x)*i/steps,z=from.z+(to.z-from.z)*i/steps;
      assert.ok(waterDepthAt(map,x,z)>.4,"wet moat at "+x+","+z);
    }
  }
  for(const b of bridges){
    const vertical=b.axis==="z",point=(along:number,across=b.z)=>vertical?feet(across,along):feet(along,across);
    const [start,left,right,end]=b.x,mid=(left+right)/2;
    const lane=map.boatLanes!.find(([from,to])=>vertical?from.z===mid && to.z===mid:from.x===mid && to.x===mid);
    assert.ok(lane,b.id+" deck is centered on its water lane");
    for(const p of [point(start),point(end)])assert.equal(waterDepthAt(map,p.x,p.z),0,b.id+" ramp meets dry ground");
    for(const p of [point(left),point(mid),point(right)])assert.ok(waterDepthAt(map,p.x,p.z)>.4,b.id+" deck spans water");
    assert.equal(point(mid).y,b.height,b.id+" deck height");
    assert.equal(playerWaterDepth(map,point(mid)),0,b.id+" keeps full walking speed");
    for(let along=start;along<end;along+=.25){
      const from=point(along),to=point(Math.min(end,along+.25));
      assert.ok(isSafeWorldPoint(map,from),b.id+" unsafe ramp at "+along);
      assert.ok(walkBridgeTransitionClear(map,from,to.x,to.z),b.id);
    }
    const beside=point(mid,b.z+b.width);
    assert.equal(walkBridgeTransitionClear(map,point(mid),beside.x,beside.z),false,b.id+" side rail");
    const edge=b.z-b.width/2;
    const footprint=vertical?{x:edge,z:start,width:b.width,length:end-start}:
      {x:start,z:edge,width:end-start,length:b.width};
    for(const {id,shore,berth} of map.boatPorts!){
      // The pier and pavilion fit within five metres of shore; boarding has a larger radius.
      assert.equal(segmentIntersectsExpandedWall(shore,shore,footprint,5),false,id+" pier vs "+b.id);
      assert.equal(segmentIntersectsExpandedWall(berth,berth,footprint,BOAT_BOARD_RANGE),false,id+" berth vs "+b.id);
    }
  }
  const moat=CAPITAL_SIEGE.moat;
  const outside=(p:{x:number;z:number})=>p.x<moat.minX || p.x>moat.maxX || p.z<moat.minZ || p.z>moat.maxZ;
  const routes=map.paths!.filter(route=>route.every(outside));
  assert.ok(routes.some(route=>route.length>=7 && route[0].x===route.at(-1)!.x && route[0].z===route.at(-1)!.z));
  for(const route of routes)for(let i=1;i<route.length;i++){
    const a=route[i-1],b=route[i],steps=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)*2);
    for(let step=0;step<=steps;step++){
      const t=step/steps,p=feet(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t);
      assert.ok(outside(p));
      assert.equal(waterDepthAt(map,p.x,p.z),0);
      assert.ok(isSafeWorldPoint(map,p),"unsafe outer road at "+p.x+","+p.z);
    }
  }
  for(const gate of map.portals)assert.ok(isSafeWorldPoint(map,feet(gate.x,gate.z)),gate.id);
});

test("all enabled maps have a river across their terrain and separated two-way water gates",()=>{
  const queue=["ritual_village"],seen=new Set(queue);
  for(let i=0;i<queue.length;i++){
    const map=WORLD_MAPS[queue[i]],harbor=map.boatHarbor;
    assert.ok(harbor && map.waterGates?.length && map.boatLanes?.length,map.id);
    const shore={...harbor.shore,y:groundAt(map.id,harbor.shore.x,harbor.shore.z)};
    assert.ok(isSafeWorldPoint(map,shore) && waterDepthAt(map,shore.x,shore.z)<=.14,map.id+" bank");
    assert.ok(boatCanSail(map.id,harbor.berth.x,harbor.berth.z,2.6),map.id+" berth");
    const points=map.boatLanes.flat();
    const xs=points.map(p=>p.x),zs=points.map(p=>p.z);
    const width=map.bounds.maxX-map.bounds.minX,length=map.bounds.maxZ-map.bounds.minZ;
    assert.ok(Math.max((Math.max(...xs)-Math.min(...xs))/width,(Math.max(...zs)-Math.min(...zs))/length)>.65,
      map.id+" navigable water spans the map");
    for(const [from,to] of map.boatLanes){
      const dx=to.x-from.x,dz=to.z-from.z,steps=Math.ceil(Math.hypot(dx,dz));
      for(let j=0;j<=steps;j++)
        assert.ok(boatCanSail(map.id,from.x+dx*j/steps,from.z+dz*j/steps,2.6),map.id+" navigable river");
    }
    for(const [j,gate] of map.waterGates.entries()){
      const other=WORLD_MAPS[gate.targetMapId];
      assert.ok(other.waterGates?.some(entry=>entry.targetMapId===map.id),gate.id);
      assert.ok(boatCanSail(map.id,gate.x,gate.z,2.6),gate.id+" berth");
      for(const previous of map.waterGates.slice(0,j))
        assert.ok(Math.hypot(gate.x-previous.x,gate.z-previous.z)>.24*Math.min(width,length),gate.id+" separated exits");
      if(map.waterGates.length===1)
        assert.ok(Math.hypot(gate.x-harbor.berth.x,gate.z-harbor.berth.z)>.6*Math.min(width,length),gate.id+" across from dock");
      if(!seen.has(other.id)){seen.add(other.id);queue.push(other.id);}
    }
  }
  assert.deepEqual([...seen].sort(),Object.keys(WORLD_MAPS).sort());
});

test("the village bend has room to turn and approach gates, with a dry path to its new port",()=>{
  const map=WORLD_MAPS.ritual_village;
  const canSail=(x:number,z:number)=>boatCanSail(map.id,x,z,2.6);
  assert.deepEqual(map.bounds,{minX:-94,maxX:94,minZ:-76,maxZ:116});
  // Sample both banks of the turning basin and keep two parallel passing lines clear.
  for(let i=0;i<32;i++){
    const angle=i*Math.PI/16;
    assert.ok(canSail(Math.cos(angle)*13,92+Math.sin(angle)*13),"26-unit turning basin");
  }
  for(let x=-58;x<=58;x++)for(const z of [84,98])assert.ok(canSail(x,z),`passing lane ${x},${z}`);
  for(const gate of map.waterGates!){
    if(gate.targetMapId==="forbidden_forest"){
      for(let x=13;x<=31;x++)assert.ok(canSail(x,gate.z),"wide forest mouth");
    }else{
      for(let n=0;n<=12;n++)assert.ok(canSail(gate.x+Math.sign(gate.x)*n,gate.z),gate.id+" outside maneuvering room");
    }
  }
  const path=map.paths!.at(-1)!;
  const port=map.boatPorts!.find(p=>p.id==="village_south_bend")!;
  assert.deepEqual(path.at(-1),port.shore);
  for(const [i,a] of path.slice(0,-1).entries()){
    const b:{x:number;z:number}=path[i+1];
    const steps=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z));
    for(let j=0;j<=steps;j++){
      const x=a.x+(b.x-a.x)*j/steps,z=a.z+(b.z-a.z)*j/steps;
      assert.equal(waterDepthAt(map,x,z),0,`dry path ${x},${z}`);
      assert.ok(isSafeWorldPoint(map,{x,y:groundAt(map.id,x,z),z}),`walkable path ${x},${z}`);
    }
  }
});

test("every port launches a boardable boat and returns both riders to its bank",()=>{
  const ids=new Set<string>();
  for(const map of Object.values(WORLD_MAPS))for(const port of map.boatPorts??[]){
    assert.ok(!ids.has(port.id),port.id);
    ids.add(port.id);
    const boats=new MontraBoats(),id="pilot";
    const shore={...port.shore,y:groundAt(map.id,port.shore.x,port.shore.z)};
    const actor=()=>({...shore,mapId:map.id,boatId:"",facing:0,combatState:"idle"});
    const pilot=actor(),passenger=actor();
    assert.ok(isSafeWorldPoint(map,shore) && waterDepthAt(map,shore.x,shore.z)<=.14,port.id+" dry bank");
    assert.ok(boats.act(id,pilot,{action:"launch"},0),port.id+" launch");
    const [boat]=boats.snapshot();
    assert.deepEqual({x:boat.x,z:boat.z},{x:port.berth.x,z:port.berth.z});
    assert.ok(!boats.act("another_owner",passenger,{action:"launch"},0),port.id+" occupied berth");
    for(const [rider,player] of [[id,pilot],["passenger",passenger]] as const)
      assert.ok(boats.act(rider,player,{action:"board",boatId:boat.entityId},100),port.id+" board");
    assert.ok(boats.act(id,pilot,{action:"helm"},200),port.id+" helm");
    for(const [rider,player] of [[id,pilot],["passenger",passenger]] as const){
      assert.ok(boats.act(rider,player,{action:"exit"},300),port.id+" disembark");
      assert.deepEqual({x:player.x,y:player.y,z:player.z},shore,port.id+" landing");
    }
  }
  assert.equal(ids.size,Object.keys(WORLD_MAPS).length+15);
});

test("the marsh is mostly low wading ground with an open river and an east landing",()=>{
  const map=WORLD_MAPS.drowned_marsh;
  const {minX,maxX,minZ,maxZ}=map.bounds;
  assert.deepEqual(map.bounds,{minX:-156,maxX:90,minZ:-112,maxZ:72});
  let area=0,low=0,shallow=0;
  for(let z=minZ+1.5;z<maxZ;z+=3)for(let x=minX+1.5;x<maxX;x+=3){
    area++;
    const y=groundAt(map.id,x,z),depth=waterDepthAt(map,x,z);
    if(y<.5)low++;
    if(depth>.1 && depth<.45 && isSafeWorldPoint(map,{x,y,z}))shallow++;
  }
  assert.ok(low/area>.9 && shallow/area>.5);
  for(const camp of map.camps!)assert.ok(groundAt(map.id,camp.x,camp.z)<.5,camp.id+" low hunting ground");
  assert.ok(waterDepthAt(map,30,-20)>.25 && !boatCanSail(map.id,30,-20,2.6),"shallow monster pool is for wading");
  const canSail=(x:number,z:number)=>boatCanSail(map.id,x,z,2.6);
  for(let offset=0;offset<=12;offset++){
    assert.ok(canSail(-112,-83-offset),"space beyond the village gate");
    assert.ok(canSail(64+offset,-34),"space beyond the Lotus gate");
  }
  const port=map.boatPorts!.find(p=>p.id==="marsh_east_bend")!;
  const path=map.paths!.find(points=>points.at(-1)?.x===port.shore.x && points.at(-1)?.z===port.shore.z);
  assert.ok(path);
  for(const [i,a] of path.slice(0,-1).entries()){
    const b:{x:number;z:number}=path[i+1];
    const steps=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z));
    for(let j=0;j<=steps;j++){
      const x=a.x+(b.x-a.x)*j/steps,z=a.z+(b.z-a.z)*j/steps;
      assert.equal(waterDepthAt(map,x,z),0,`dry east path at ${x},${z}`);
      assert.ok(isSafeWorldPoint(map,{x,y:groundAt(map.id,x,z),z}));
    }
  }
});

test("marsh water resistance uses the player's height and leaves a wading escape from the deep pool",()=>{
  const map=WORLD_MAPS.drowned_marsh;
  const foot=(x:number,z:number)=>({x,y:groundAt(map.id,x,z),z});
  const pool=foot(-96,28),shelf=foot(-78,28);
  assert.ok(playerWaterDepth(map,pool)>WATER_EXPOSURE.mouthHeight);
  assert.ok(Math.abs(wadingSpeedScale(playerWaterDepth(map,pool))-.65)<1e-8);
  assert.equal(wadingSpeedScale(playerWaterDepth(map,shelf)),.85);
  assert.equal(wadingSpeedScale(playerWaterDepth(map,foot(19,26))),1);
  assert.equal(playerWaterDepth(map,{...pool,y:map.waterLevel!+.5}),0,"above the water");
  assert.equal(playerWaterDepth(map,{...pool,boatId:"boat"}),0,"aboard");
  assert.equal(playerWaterDepth(WORLD_MAPS.ritual_village,{x:0,y:-3,z:0}),0,"other waterways keep their movement rules");
  for(let x=pool.x;x<=shelf.x;x+=.5)assert.ok(isSafeWorldPoint(map,foot(x,pool.z)),x+" walkable exit");
});

test("market bridge joins dry approaches above a navigable canal",()=>{
  const map=WORLD_MAPS.ritual_village,bridge=map.walkBridges![0],z=bridge.z;
  const feet=(x:number,z:number)=>({x,y:groundAt(map.id,x,z),z});
  for(let x=bridge.x[0];x<=bridge.x[3];x+=.25){
    assert.ok(isSafeWorldPoint(map,feet(x,z)),`bridge walking surface at ${x}`);
    assert.ok(walkBridgeTransitionClear(map,feet(x,z),x+.25,z));
  }
  assert.ok(walkBridgeTransitionClear(map,feet(0,0),0,z),"walk into the west approach");
  assert.ok(!walkBridgeTransitionClear(map,feet(22,z),22,z+bridge.width),"rails stop a sudden drop");
  assert.ok(!walkBridgeTransitionClear(map,feet(22,z-4),22,z+4),"no snap from the riverbed to the deck");
  assert.equal(feet(22,z).y,bridge.height);
  assert.ok(waterDepthAt(map,22,z)>1,"the bed remains below the bridge");
  for(let offset=-6;offset<=6;offset++)assert.ok(boatCanSail(map.id,22,z+offset,2.6));
  const riderHead=map.waterLevel!+BOAT_DECK.y+1.8;
  assert.ok(riderHead<bridge.height-bridge.thickness);
  assert.ok(provinceShotClear(map,{x:22,y:riderHead,z:z-5},{x:22,y:riderHead,z:z+5}),"clearance stays open below");
  assert.ok(!provinceShotClear(map,{x:22,y:riderHead,z},{x:22,y:bridge.height+1,z}),"deck blocks shots through its floor");
  for(const path of map.paths!){
    for(const [i,a] of path.slice(0,-1).entries()){
      const b=path[i+1],steps=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z));
      for(let j=0;j<=steps;j++){
        const x=a.x+(b.x-a.x)*j/steps,z=a.z+(b.z-a.z)*j/steps;
        assert.equal(waterDepthAt(map,x,z),0,`dry road at ${x},${z}`);
        assert.ok(isSafeWorldPoint(map,feet(x,z)),`road clears obstacles at ${x},${z}`);
      }
    }
  }
});

test("a stopped boat can turn 180 degrees in under three seconds without drifting",()=>{
  const map=WORLD_MAPS.ritual_village,harbor=map.boatHarbor!;
  const id="pilot",boats=new MontraBoats();
  const pilot={...harbor.shore,y:0,mapId:map.id,boatId:"",facing:0,combatState:"idle"};
  const crew=new Map([[id,pilot]]);
  assert.ok(boats.act(id,pilot,{action:"launch"},0));
  const [start]=boats.snapshot();
  assert.ok(boats.act(id,pilot,{action:"board",boatId:start.entityId},0));
  assert.ok(boats.act(id,pilot,{action:"helm"},0));
  assert.ok(!boats.act(id,pilot,{action:"walk",x:0,z:1},0));
  const assertStern=()=>{
    const [ship]=boats.snapshot();
    assert.ok(Math.abs(pilot.x-ship.x-BOAT_DECK.helmZ*Math.sin(ship.heading))<1e-7);
    assert.ok(Math.abs(pilot.z-ship.z-BOAT_DECK.helmZ*Math.cos(ship.heading))<1e-7);
    assert.ok(Math.cos(pilot.facing-ship.heading)<-.999999,"avatar forward faces the bow");
  };
  assertStern();
  let quarterTurn=0,halfTurn=0;
  for(let now=50;now<3000;now+=50){
    if(now%100===0)assert.ok(boats.act(id,pilot,{action:"input",throttle:0,steer:1},now));
    boats.tick(now,.05,crew,()=>true);
    assertStern();
    const [ship]=boats.snapshot();
    const turn=start.heading-ship.heading;
    if(!quarterTurn && turn>=Math.PI/2)quarterTurn=now;
    if(turn>=Math.PI){halfTurn=now;break;}
  }
  assert.ok(quarterTurn>0 && quarterTurn<=1500);
  assert.ok(halfTurn>0);
  const [ship]=boats.snapshot();
  assert.deepEqual({x:ship.x,z:ship.z,hp:ship.hp},{x:start.x,z:start.z,hp:start.hp});
  assert.ok(boats.act(id,pilot,{action:"input",throttle:-1,steer:0},3100));
  boats.tick(3150,.05,crew,()=>true);
  assert.ok(boats.snapshot()[0].speed<0);
  assertStern();
});

test("one failed crew save rolls back the whole SQLite arrival",async()=>{
  const store=new CharacterStore(await mkdtemp(join(tmpdir(),"montra-crew-save-")),true);
  try {
    const village=WORLD_MAPS.ritual_village,marsh=WORLD_MAPS.drowned_marsh;
    const token=()=>"mt1_"+randomBytes(32).toString("hex");
    const [{character:a},{character:b}]=await Promise.all([
      store.loadOrCreate(token(),village.spawn),store.loadOrCreate(token(),village.spawn),
    ]);
    const shore=marsh.boatHarbor!.shore;
    const arrival=(character:typeof a)=>({...character,mapId:marsh.id,...shore,y:0});
    store.economy.stageMonsterReward(b.id,b);
    assert.throws(()=>store.saveTravelGroup([arrival(a),arrival(b)]),/monster_reward_pending/);
    assert.equal((store.economy.getCharacter(a.id) as typeof a).mapId,village.id);
    assert.equal((store.economy.getCharacter(b.id) as typeof b).mapId,village.id);
  } finally {store.close();}
});
