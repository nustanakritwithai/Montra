import test from "node:test";
import assert from "node:assert/strict";
import {getWorldMap,getSafeMapSpawn,isRestArea,isWorldSegmentClear,isSafeWorldPoint} from "./WorldMaps.js";
import {TEMPLE_ID,TEMPLE_MAP,TEMPLE_SPAWNS} from "./TempleMap.js";
import {MyRoomState} from "./schema/MyRoomState.js";
import {ForestEncounters} from "./ForestEncounters.js";
import {parseAttackCommand} from "./GameRules.js";
import {checkWarp} from "./WarpRules.js";
test("forest and temple gates land in the destination rest areas",()=>{
  const forest=getWorldMap("forbidden_forest")!,gate=forest.portals.find(p=>p.targetMapId===TEMPLE_ID)!;
  for(const [map,portal] of [[forest,gate],[TEMPLE_MAP,TEMPLE_MAP.portals[0]]] as const){
    const result=checkWarp({portalId:portal.id},{mapId:map.id,position:{x:portal.x,z:portal.z,y:0},alive:true,flying:false,climbing:false,dashing:false,changingHeight:false,lastCombatMs:-Infinity,lastWarpMs:-Infinity,nowMs:5000});
    assert.equal(result.ok,true);assert.ok(isRestArea(portal.targetMapId,portal.targetSpawn));
    assert.ok(isSafeWorldPoint(getWorldMap(portal.targetMapId)!,portal.targetSpawn));
  }
});
test("all signed paths, camp spawns and courtyard detours are walkable",()=>{
  for(const trail of TEMPLE_MAP.paths!)for(let i=1;i<trail.length;i++){
    const a=trail[i-1],b=trail[i],N=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)*5);
    for(let j=0;j<=N;j++)assert.ok(isSafeWorldPoint(TEMPLE_MAP,{x:a.x+(b.x-a.x)*j/N,y:0,z:a.z+(b.z-a.z)*j/N}),JSON.stringify({a,b,j}));
  }
  const s=new MyRoomState();new ForestEncounters(s.monsters).initialize();
  const guards=[...s.monsters.values()].filter(m=>m.mapId===TEMPLE_ID);
  assert.equal(guards.length,17);assert.equal(s.monsters.size,34);
  assert.deepEqual([Math.min(...guards.map(m=>m.level)),Math.max(...guards.map(m=>m.level))],[8,20]);
  for(const m of guards){
    assert.ok(isSafeWorldPoint(TEMPLE_MAP,m));assert.ok(!isRestArea(TEMPLE_ID,m));
    assert.deepEqual(parseAttackCommand({targetId:m.id}),{targetId:m.id});
  }
  assert.equal(new Set(TEMPLE_SPAWNS.map(m=>m.id)).size,16);
  assert.equal(parseAttackCommand({targetId:"temple_sanctum_22"}),null);
});
test("tall walls block walking, flight, saved positions and shots; the gate gap is open",()=>{
  for(const y of [0,6])assert.equal(isSafeWorldPoint(TEMPLE_MAP,{x:-3,y,z:-12}),false);
  assert.deepEqual(getSafeMapSpawn(TEMPLE_ID,{x:-3,y:0,z:-12}),TEMPLE_MAP.spawn);
  assert.equal(isWorldSegmentClear(TEMPLE_ID,{x:-3,z:-9},{x:-3,z:-16}),false);
  assert.equal(isWorldSegmentClear(TEMPLE_ID,{x:4.5,z:-9},{x:4.5,z:-16}),true);
});
