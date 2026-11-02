import test from "node:test";
import assert from "node:assert/strict";
import {ATLAS_MAPS, ATLAS_SPAWNS, RIFT_WARDEN} from "./WorldAtlas.js";
import {WORLD_MAPS, isRestArea, isSafeWorldPoint, isWorldSegmentClear, getSafeMapSpawn, provinceShotClear} from "./WorldMaps.js";
import {crestCorners} from "./StrategicProvinces.js";
import {parseAttackCommand} from "./GameRules.js";
import {checkWarp} from "./WarpRules.js";
import {ForestEncounters} from "./ForestEncounters.js";
import {MyRoomState,Player} from "./schema/MyRoomState.js";
import {partyMonsterShares} from "./PartyMonsterRewards.js";

test("all fifteen maps connect to the village and every gate has a safe return",()=>{
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
  assert.equal(seen.size,15);assert.equal(Object.keys(WORLD_MAPS).length,15);
  assert.deepEqual(WORLD_MAPS.moon_cemetery.portals.map(p=>p.targetMapId).sort(),["bamboo_frontier","bound_temple","drowned_marsh","moon_pass"]);
});

test("every marked trail is walkable and all gates, camps and monsters are reachable on foot",()=>{
  assert.equal(ATLAS_SPAWNS.length,64);
  assert.equal(new Set(ATLAS_SPAWNS.map(s=>s.id)).size,64);
  for(const map of Object.values(WORLD_MAPS).filter(m=>m.region || m.strategic)){
    const safe=(x:number,z:number)=>isSafeWorldPoint(map,{x,y:0,z});
    for(const path of map.paths!)for(let i=1;i<path.length;i++){
      const a=path[i-1],b=path[i],steps=Math.ceil(Math.hypot(a.x-b.x,a.z-b.z)*5);
      for(let j=0;j<=steps;j++)assert.ok(safe(a.x+(b.x-a.x)*j/steps,a.z+(b.z-a.z)*j/steps),JSON.stringify({map:map.id,a,b,j,steps}));
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
    if(map.region)assert.deepEqual([Math.min(...guards.map(s=>s.level)),Math.max(...guards.map(s=>s.level))],map.region.range);
    else assert.equal(guards.length,0);
    for(const m of guards){assert.ok(!isRestArea(map.id,m));assert.deepEqual(parseAttackCommand({targetId:m.id}),{targetId:m.id});}
  }
  const cave=ATLAS_MAPS.naga_cavern;
  assert.deepEqual(getSafeMapSpawn(cave.id,{...cave.spawn,y:6}),cave.spawn);
  for(const id of ["drowned_marsh","spirit_rift"]){
    const m=ATLAS_MAPS[id];assert.ok(!isSafeWorldPoint(m,{x:0,y:0,z:-4}));
    for(const x of [-22,22])assert.ok(isSafeWorldPoint(m,{x,y:0,z:-4}));
  }
});

test("territories protect through traffic and have separate attack crossings and an exposed fort",()=>{
  for(const [id,water,shot] of [
    ["moon_pass",{x:12,z:-4},[{x:12,z:-46},{x:12,z:-39}]],
    ["river_watch",{x:-4,z:0},[{x:-17,z:-40},{x:-17,z:-34}]]
  ] as const){
    const map=WORLD_MAPS[id],province=map.strategic!;
    for(const index of province.safeRoads!){
      const path=map.paths![index];
      for(let i=1;i<path.length;i++){
        const a=path[i-1],b=path[i];
        for(let t=0;t<=1;t+=.05)assert.ok(isRestArea(id,{x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t}));
      }
    }
    const market=province.sites.find(s=>s.kind==="market")!,fort=province.sites.find(s=>s.kind==="fort")!;
    assert.ok(isRestArea(id,market));assert.ok(!isRestArea(id,fort));
    assert.equal(province.sites.filter(s=>s.kind==="bridge" && !isRestArea(id,s)).length,id==="moon_pass"?2:3);
    assert.ok(!isSafeWorldPoint(map,{...water,y:0}));assert.ok(!isSafeWorldPoint(map,{...fort,y:6}));
    assert.ok(!isWorldSegmentClear(id,shot[0],shot[1]));
    for(const path of [map.paths![2],map.paths![3]])assert.deepEqual(path[path.length-1],{x:fort.x,z:fort.z});
  }
  assert.ok(isRestArea("mantra_capital",{x:16,z:-20}));
});
test("the city and both forts have continuous crests, usable stair endpoints and overhead gate passages",()=>{
  for(const id of ["mantra_capital","moon_pass","river_watch"]){
    const map=WORLD_MAPS[id],r=map.strategic!.rampart!;
    assert.equal(r.stairs.length,id==="mantra_capital"?4:2);
    for(const stair of r.stairs){
      assert.ok(isSafeWorldPoint(map,{...stair.foot,y:0}));
      assert.ok(isSafeWorldPoint(map,{...stair.top,y:4}));
      assert.ok(!isSafeWorldPoint(map,{...stair.top,y:0}));
    }
    for(const from of [...r.corners,...r.stairs.map(s=>s.top)])for(const to of r.corners){
      const route=[from,...crestCorners(r,from,to),to];
      for(let i=1;i<route.length;i++)for(let j=0;j<=100;j++){
        const a=route[i-1],b=route[i],t=j/100;
        assert.ok(isSafeWorldPoint(map,{x:a.x+(b.x-a.x)*t,y:4,z:a.z+(b.z-a.z)*t}),id);
      }
    }
    const g=r.gates[0].box,x=g.x+g.width/2,z=g.z+g.length/2;
    assert.ok(isSafeWorldPoint(map,{x,y:0,z}));assert.ok(isSafeWorldPoint(map,{x,y:4,z}));
    const low={x,y:1.55,z:z+8},inside={x,y:1,z:z-6},top={x,y:5,z};
    assert.ok(provinceShotClear(map,low,inside));assert.ok(!provinceShotClear(map,low,inside,true));
    assert.ok(provinceShotClear(map,low,top,true));assert.ok(provinceShotClear(map,top,low,true));
  }
});
test("all occupied atlas zones replicate and the warden's respawn clock survives an empty zone",()=>{
  const state=new MyRoomState(),forest=new ForestEncounters(state.monsters);
  forest.initialize();assert.equal(state.monsters.size,33);
  const tick=(now:number)=>forest.update(now,0,state.players,new Set(),()=>{},()=>{});
  for(const mapId of ["drowned_marsh","moon_cemetery","asura_peak","spirit_rift"]) state.players.set(mapId,new Player({...ATLAS_MAPS[mapId].spawn,mapId,alive:true}));
  tick(100);assert.equal(state.monsters.size+1,63);
  assert.ok(!state.monsters.has("atlas_hex_ridge_1_1"));
  for (const map of Object.values(ATLAS_MAPS)) state.players.set(map.id,new Player({...map.spawn,mapId:map.id}));
  tick(100);assert.equal(state.monsters.size+1,98);
  const id=RIFT_WARDEN.id;assert.ok(forest.kill(id,100));state.players.delete("spirit_rift");tick(500);
  assert.ok(!state.monsters.has(id));state.players.set("spirit_rift",new Player({...ATLAS_MAPS.spirit_rift.spawn,mapId:"spirit_rift"}));
  tick(1100);assert.equal(state.monsters.get(id)?.alive,false);
  tick(100+RIFT_WARDEN.respawnMs);assert.equal(state.monsters.get(id)?.alive,true);
  assert.ok(state.monsters.has("atlas_hex_ridge_1_1"));
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
