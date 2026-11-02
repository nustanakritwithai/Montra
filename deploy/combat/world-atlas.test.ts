import test from "node:test";
import assert from "node:assert/strict";
import {ATLAS_MAPS, ATLAS_SPAWNS, RIFT_WARDEN} from "./WorldAtlas.js";
import {WORLD_MAPS, isRestArea, isSafeWorldPoint, getSafeMapSpawn} from "./WorldMaps.js";
import {parseAttackCommand} from "./GameRules.js";
import {checkWarp} from "./WarpRules.js";
import {ForestEncounters} from "./ForestEncounters.js";
import {MyRoomState,Player} from "./schema/MyRoomState.js";
import {partyMonsterShares} from "./PartyMonsterRewards.js";

test("all ten maps connect to the village and every gate has a safe return",()=>{
  const seen=new Set<string>(),queue=["ritual_village"];
  while(queue.length){
    const id=queue.pop()!;
    if(seen.has(id))continue;
    seen.add(id);
    for(const gate of WORLD_MAPS[id].portals){
      const dest=WORLD_MAPS[gate.targetMapId],back=dest.portals.find(p=>p.targetMapId===id);
      assert.ok(back,gate.id);assert.ok(isSafeWorldPoint(dest,gate.targetSpawn),gate.id);
      assert.ok(Math.hypot(gate.targetSpawn.x-back.x,gate.targetSpawn.z-back.z)<=2);
      assert.ok(checkWarp({portalId:gate.id},{mapId:id,position:{...gate,y:0},alive:true,flying:false,
        climbing:false,dashing:false,changingHeight:false,lastCombatMs:-Infinity,lastWarpMs:-Infinity,nowMs:5000}).ok,gate.id);
      queue.push(dest.id);
    }
  }
  assert.equal(seen.size,10);assert.equal(Object.keys(WORLD_MAPS).length,10);
  assert.deepEqual(WORLD_MAPS.moon_cemetery.portals.map(p=>p.targetMapId).sort(),["bound_temple","drowned_marsh","hex_ridge"]);
});

test("every marked trail is walkable and all gates, camps and monsters are reachable on foot",()=>{
  assert.equal(ATLAS_SPAWNS.length,50);
  assert.equal(new Set(ATLAS_SPAWNS.map(s=>s.id)).size,50);
  for(const map of Object.values(ATLAS_MAPS)){
    const safe=(x:number,z:number)=>isSafeWorldPoint(map,{x,y:0,z});
    for(const path of map.paths!)for(let i=1;i<path.length;i++){
      const a=path[i-1],b=path[i],steps=Math.ceil(Math.hypot(a.x-b.x,a.z-b.z)*5);
      for(let j=0;j<=steps;j++)assert.ok(safe(a.x+(b.x-a.x)*j/steps,a.z+(b.z-a.z)*j/steps),map.id+" trail "+i);
    }
    const reached=new Set<string>(),queue=[[Math.round(map.spawn.x),Math.round(map.spawn.z)]];
    while(queue.length){
      const [x,z]=queue.pop()!,key=x+","+z;
      if(reached.has(key)||!safe(x,z))continue;
      reached.add(key);
      for(const [dx,dz] of [[-1,0],[1,0],[0,-1],[0,1]])queue.push([x+dx,z+dz]);
    }
    const guards=ATLAS_SPAWNS.filter(s=>s.mapId===map.id);
    for(const p of [...map.camps!,...map.portals,...guards])assert.ok(reached.has(p.x+","+p.z),map.id+" "+p.x+","+p.z);
    assert.deepEqual([Math.min(...guards.map(s=>s.level)),Math.max(...guards.map(s=>s.level))],map.region!.range);
    for(const m of guards){assert.ok(!isRestArea(map.id,m));assert.deepEqual(parseAttackCommand({targetId:m.id}),{targetId:m.id});}
  }
  const cave=ATLAS_MAPS.naga_cavern;
  assert.deepEqual(getSafeMapSpawn(cave.id,{...cave.spawn,y:6}),cave.spawn);
  for(const id of ["drowned_marsh","spirit_rift"]){
    const m=ATLAS_MAPS[id];assert.ok(!isSafeWorldPoint(m,{x:0,y:0,z:-4}));
    for(const x of [-22,22])assert.ok(isSafeWorldPoint(m,{x,y:0,z:-4}));
  }
});

test("at most four late zones replicate and the warden's respawn clock survives an empty zone",()=>{
  const state=new MyRoomState(),forest=new ForestEncounters(state.monsters);
  forest.initialize();assert.equal(state.monsters.size,33);
  const tick=(now:number)=>forest.update(now,0,state.players,new Set(),()=>{},()=>{});
  ["drowned_marsh","moon_cemetery","asura_peak","spirit_rift"].forEach((mapId,i)=>state.players.set(String(i),new Player({...ATLAS_MAPS[mapId].spawn,mapId,alive:true})));
  tick(100);assert.equal(state.monsters.size+1,63);
  const id=RIFT_WARDEN.id;assert.ok(forest.kill(id,100));state.players.delete("3");tick(500);
  assert.ok(!state.monsters.has(id));state.players.set("3",new Player({...ATLAS_MAPS.spirit_rift.spawn,mapId:"spirit_rift"}));
  tick(1100);assert.equal(state.monsters.get(id)?.alive,false);
  tick(100+RIFT_WARDEN.respawnMs);assert.equal(state.monsters.get(id)?.alive,true);
  assert.ok(!state.monsters.has("atlas_hex_ridge_1_1"));
});

test("rift victory keeps capped participants eligible for loot without diluting XP",()=>{
  const m={...RIFT_WARDEN,mapId:"spirit_rift",tier:"boss" as const,y:0};
  const base={...m,sessionId:"hunter",alive:true,persistent:true,inTransit:false,level:99};
  const solo=partyMonsterShares(99,m,[base]);
  assert.ok(solo[0].amount>0);
  assert.deepEqual(partyMonsterShares(99,m,[base,{...base,sessionId:"veteran",level:100},
    {...base,sessionId:"away",mapId:"asura_peak"},{...base,sessionId:"fallen",alive:false}]),
    [...solo,{sessionId:"veteran",amount:0}]);
});
