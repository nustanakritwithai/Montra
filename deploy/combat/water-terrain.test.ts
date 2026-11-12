import assert from "node:assert/strict";
import test from "node:test";
import {groundSample,waterDepthAt} from "./GroundTerrain.js";
import {WORLD_MAPS,groundAt,isSafeWorldPoint,provinceShotClear} from "./WorldMaps.js";
import {boatCanSail,BOAT_SHORES} from "./MontraBoats.js";
import {BOAT_DOCK_SPAWNS} from "./PirateBoatRules.js";

test("all mapped water has a walkable bed, with existing pads and slopes preserved",()=>{
  const maps=Object.values(WORLD_MAPS).filter(map=>map.water?.length);
  assert.ok(maps.length>=8);
  for(const map of maps){
    assert.ok(map.terrain && map.waterLevel!==undefined,map.id);
    const t=map.terrain;
    for(const area of map.water!){
      const wet=t.zs.some(z=>z>area.z && z<area.z+area.length && t.xs.some(x=>{
        if(x<=area.x || x>=area.x+area.width || waterDepthAt(map,x,z)<=.15)return false;
        return isSafeWorldPoint(map,{x,y:groundAt(map.id,x,z),z});
      }));
      assert.ok(wet,`${map.id} ${area.x},${area.z} has a walkable bed`);
    }
    for(let j=0;j<t.zs.length-1;j++)for(let i=0;i<t.xs.length-1;i++){
      const x=t.xs[i],z=t.zs[j],dx=t.xs[i+1]-x,dz=t.zs[j+1]-z;
      for(const [u,v] of [[.25,.75],[.75,.25]]){
        assert.ok(groundSample(t,x+dx*u,z+dz*v).grade<=t.maxGrade+1e-6,map.id+" slope");
      }
    }
    for(const p of [map.spawn,...map.portals,...map.bridges??[]]){
      assert.equal(groundAt(map.id,p.x,p.z),0,map.id+" transfer or bridge pad");
    }
  }
});

test("shared banks do not create a seam, and docks admit boats only over the bed",()=>{
  const harbor=WORLD_MAPS.river_watch;
  assert.ok(waterDepthAt(harbor,-94,-56)>.45,"adjoining harbor rectangles are deep at their join");
  for(const [id,dock] of Object.entries(BOAT_DOCK_SPAWNS)){
    assert.ok(boatCanSail(id,dock.x,dock.z,2.6),id+" dock");
    const shore=BOAT_SHORES[id];
    assert.equal(boatCanSail(id,shore.x,shore.z,2.6),false,id+" dry shore");
  }
});

test("lower beds cannot bypass closed city gates",()=>{
  const map=WORLD_MAPS.sam_lan_estuary;
  const from={x:0,y:groundAt(map.id,0,100.5)+1,z:100.5};
  const to={x:0,y:groundAt(map.id,0,92)+1,z:92};
  assert.ok(provinceShotClear(map,from,to));
  assert.equal(provinceShotClear(map,from,to,new Set(["G11"])),false);
});
