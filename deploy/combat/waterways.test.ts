import assert from "node:assert/strict";
import test from "node:test";
import {randomBytes} from "node:crypto";
import {mkdtemp} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {boatCanSail} from "./MontraBoats.js";
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
