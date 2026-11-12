import assert from "node:assert/strict";
import test from "node:test";
import {randomBytes} from "node:crypto";
import {mkdtemp} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {boatCanSail,BOAT_DECK,MontraBoats} from "./MontraBoats.js";
import {groundAt,isSafeWorldPoint,WORLD_MAPS} from "./WorldMaps.js";
import {waterDepthAt} from "./GroundTerrain.js";
import {CharacterStore} from "./CharacterStore.js";

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
  assert.equal(ids.size,Object.keys(WORLD_MAPS).length+13);
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
