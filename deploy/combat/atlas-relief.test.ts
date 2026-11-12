import test from "node:test";
import assert from "node:assert/strict";
import {ATLAS_MAPS,ATLAS_SPAWNS,HIMMAPAN_SPAWNS,HIMMAPAN_REPLACED_TARGETS} from "./WorldAtlas.js";
import {WORLD_MAPS,isSafeWorldPoint,groundAt,provinceShotClear} from "./WorldMaps.js";
import {groundSample,waterDepthAt} from "./GroundTerrain.js";
import {ForestEncounters} from "./ForestEncounters.js";
import {MyRoomState,Player} from "./schema/MyRoomState.js";

test("nine existing hunts keep the same walkable routes, wet crossings and flat transfer pads",()=>{
  assert.equal(Object.keys(ATLAS_MAPS).length,9);
  for(const id of Object.keys(ATLAS_MAPS)){
    const map=WORLD_MAPS[id];
    const t=map.terrain!,flat={...map,terrain:undefined};
    assert.ok(map.reliefLabels && t,map.id);
    assert.ok(Math.max(...t.heights.flat())-Math.min(...t.heights.flat())>=2,map.id);
    for(let i=1;i<t.xs.length;i++)for(let j=1;j<t.zs.length;j++)for(const [u,v] of [[.75,.25],[.25,.75]]){
      const x=t.xs[i-1]+u*(t.xs[i]-t.xs[i-1]),z=t.zs[j-1]+v*(t.zs[j]-t.zs[j-1]);
      assert.ok(groundSample(t,x,z).grade<=t.maxGrade,map.id+" navigation grade");
    }
    for(const route of map.paths!)for(let i=1;i<route.length;i++){
      const a=route[i-1],b=route[i],steps=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z));
      for(let k=0;k<=steps;k++){
        const x=a.x+(b.x-a.x)*k/steps,z=a.z+(b.z-a.z)*k/steps;
        assert.equal(isSafeWorldPoint(map,{x,z,y:groundAt(map.id,x,z)}),isSafeWorldPoint(flat,{x,z,y:0}),map.id+" trail footprint");
      }
    }
    for(const p of [map.spawn,...map.bridges??[],...map.portals])assert.equal(groundAt(map.id,p.x,p.z),0,map.id+" level pad");
    for(const p of map.portals)assert.ok(isSafeWorldPoint(WORLD_MAPS[p.targetMapId],p.targetSpawn),p.id);
    for(const w of map.water??[])assert.ok(waterDepthAt(map,w.x+w.width/2,w.z+w.length/2)>0,map.id+" water");
  }
});
for(const includeWorldEncounters of [true,false])test(`${includeWorldEncounters?"world":"siege"} hunting monsters spawn, chase on raised ground and respawn on the same surface`,()=>{
  const state=new MyRoomState(),enc=new ForestEncounters(state.monsters);enc.initialize(includeWorldEncounters);
  for(const map of Object.values(ATLAS_MAPS))state.players.set(map.id,new Player({...map.spawn,mapId:map.id,alive:true}));
  enc.update(0,.05,state.players,new Set(),()=>{},()=>{});
  for(const s of ATLAS_SPAWNS){
    if(includeWorldEncounters && HIMMAPAN_REPLACED_TARGETS.has(s.id)){
      assert.equal(state.monsters.has(s.id),false,s.id+" replaced in world encounters");
      continue;
    }
    const m=state.monsters.get(s.id);
    assert.ok(m,s.id+" active atlas spawn");
    assert.ok(Math.abs(m.y-groundAt(s.mapId,m.x,m.z))<.02,s.id);
  }
  for(const s of HIMMAPAN_SPAWNS.filter(s=>Object.hasOwn(ATLAS_MAPS,s.mapId))){
    if(!includeWorldEncounters){
      assert.equal(state.monsters.has(s.id),false,s.id+" excluded from siege encounters");
      continue;
    }
    const m=state.monsters.get(s.id);
    assert.ok(m,s.id+" active Himmapan spawn");
    assert.ok(Math.abs(m.y-groundAt(s.mapId,m.x,m.z))<.02,s.id);
  }
  const m=state.monsters.get("atlas_hex_ridge_5_1")!,p=state.players.get("hex_ridge")!;
  const start={x:m.x,z:m.z};
  p.x=m.x+3;p.z=m.z;p.y=groundAt(m.mapId,p.x,p.z);
  for(let i=1;i<14;i++)enc.update(i*100,.1,state.players,new Set(),()=>{},()=>{});
  assert.ok(Math.hypot(m.x-start.x,m.z-start.z)>0,"monster chases on raised ground");
  assert.equal(m.targetId,"hex_ridge");assert.ok(m.y>2);assert.ok(Math.abs(m.y-groundAt(m.mapId,m.x,m.z))<.02);
  assert.equal(enc.kill(m.id,2000),true);assert.equal(m.alive,false);
  enc.update(202000,.05,state.players,new Set(),()=>{},()=>{});
  assert.ok(m.alive);assert.ok(Math.abs(m.y-groundAt(m.mapId,m.x,m.z))<.02);
});
test("a hill between two old hunting camps occludes a ray",()=>{
  const map=ATLAS_MAPS.asura_peak,a={x:-117,y:3,z:-76},b={x:-60,y:3,z:-76};
  assert.ok(groundAt(map.id,a.x,a.z)<3 && groundAt(map.id,b.x,b.z)<3);
  assert.equal(provinceShotClear(map,a,b),false);
});
