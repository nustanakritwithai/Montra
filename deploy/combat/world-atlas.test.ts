import test from "node:test";
import assert from "node:assert/strict";
import {ATLAS_MAPS, ATLAS_SPAWNS, HIMMAPAN_SPAWNS, RIFT_WARDEN} from "./WorldAtlas.js";
import {WORLD_MAPS, isRestArea, isSafeWorldPoint, isWorldSegmentClear, getSafeMapSpawn, provinceShotClear, walkBridgeAt, walkBridgeTransitionClear} from "./WorldMaps.js";
import {crestCorners} from "./StrategicProvinces.js";
import {parseAttackCommand} from "./GameRules.js";
import {checkWarp} from "./WarpRules.js";
import {ForestEncounters} from "./ForestEncounters.js";
import {MyRoomState,Player} from "./schema/MyRoomState.js";
import {partyMonsterShares} from "./PartyMonsterRewards.js";
import {REGIONAL_BOSSES,TITAN_BOSS} from "./RegionalBosses.js";
import {groundAt} from "./WorldMaps.js";
import {waterDepthAt} from "./GroundTerrain.js";

test("capital warps and both ends of their approach are on dry ground outside the wall",()=>{
  const city=WORLD_MAPS.mantra_capital,deck=city.strategic!.rampart!.deck;
  const oldGates:Record<string,{x:number;z:number}>={
    ritual_village:{x:0,z:26},bamboo_frontier:{x:-34,z:-14},moon_pass:{x:0,z:-58},lotus_basin:{x:34,z:-14},
  };
  const minX=Math.min(...deck.map(w=>w.x)),maxX=Math.max(...deck.map(w=>w.x+w.width));
  const minZ=Math.min(...deck.map(w=>w.z)),maxZ=Math.max(...deck.map(w=>w.z+w.length));
  const onBank=(p:{x:number;z:number})=>(p.x<minX||p.x>maxX||p.z<minZ||p.z>maxZ) &&
    waterDepthAt(city,p.x,p.z)===0 && !walkBridgeAt(city,p.x,p.z);
  const check=(mapId:string,p:{x:number;z:number},portalId:string)=>checkWarp({portalId},{
    mapId,position:{...p,y:groundAt(mapId,p.x,p.z)},alive:true,flying:false,climbing:false,dashing:false,
    changingHeight:false,lastCombatMs:-Infinity,lastWarpMs:-Infinity,nowMs:6000,
  });
  assert.equal(city.portals.length,4);
  for(const portal of city.portals){
    const other=WORLD_MAPS[portal.targetMapId],incoming=other.portals.find(p=>p.targetMapId===city.id)!;
    assert.ok(incoming,portal.id);
    for(const p of [portal,incoming.targetSpawn]){
      assert.ok(onBank(p),portal.id);
      assert.ok(isSafeWorldPoint(city,{...p,y:groundAt(city.id,p.x,p.z)}),portal.id);
    }
    const fromOld=check(city.id,oldGates[other.id],portal.id);
    assert.deepEqual(fromOld,{ok:false,reason:"portal_too_far"},portal.id);
    assert.ok(check(other.id,incoming,incoming.id).ok,incoming.id);
    assert.ok(check(city.id,incoming.targetSpawn,portal.id).ok,portal.id);
    const approach=city.paths!.find(path=>path.at(-1)!.x===portal.x&&path.at(-1)!.z===portal.z)!;
    assert.ok(approach,portal.id);
    for(let i=1;i<approach.length;i++){
      const a=approach[i-1],b=approach[i],steps=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)*5);
      assert.ok(walkBridgeTransitionClear(city,a,b.x,b.z),portal.id);
      for(let j=0;j<=steps;j++){
        const t=j/steps,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
        assert.equal(waterDepthAt(city,x,z),0,portal.id);
        assert.ok(isSafeWorldPoint(city,{x,y:groundAt(city.id,x,z),z}),portal.id);
      }
    }
  }
});

test("all sixteen maps connect to the village and every gate has a safe return",()=>{
  const seen=new Set<string>(),queue=["ritual_village"];
  while(queue.length){
    const id=queue.pop()!;
    if(seen.has(id))continue;
    seen.add(id);
    for(const gate of WORLD_MAPS[id].portals){
      const dest=WORLD_MAPS[gate.targetMapId],back=dest.portals.find(p=>p.targetMapId===id && Math.hypot(gate.targetSpawn.x-p.x,gate.targetSpawn.z-p.z)<=2);
      assert.ok(back,gate.id);assert.ok(isSafeWorldPoint(dest,gate.targetSpawn),gate.id);
      assert.ok(Math.hypot(gate.targetSpawn.x-back.x,gate.targetSpawn.z-back.z)<=2);
      assert.ok(checkWarp({portalId:gate.id},{mapId:id,position:{...gate,y:0},alive:true,flying:false,
        climbing:false,dashing:false,changingHeight:false,lastCombatMs:-Infinity,lastWarpMs:-Infinity,nowMs:5000}).ok,gate.id);
      queue.push(dest.id);
    }
  }
  assert.equal(seen.size,16);assert.equal(Object.keys(WORLD_MAPS).length,16);
  assert.deepEqual(WORLD_MAPS.moon_cemetery.portals.map(p=>p.targetMapId).sort(),["bamboo_frontier","bound_temple","drowned_marsh","moon_pass"]);
});

test("every marked trail is walkable and all gates, camps and monsters are reachable on foot",()=>{
  assert.equal(ATLAS_SPAWNS.length,91);
  assert.equal(new Set(ATLAS_SPAWNS.map(s=>s.id)).size,91);
  for(const map of Object.values(WORLD_MAPS).filter(m=>m.region || m.strategic)){
    const safe=(x:number,z:number)=>isSafeWorldPoint(map,{x,y:groundAt(map.id,x,z),z});
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
    const relay=map.strategic?.relay;
    const himmapan=HIMMAPAN_SPAWNS.filter(s=>s.mapId===map.id);
    for(const p of [...map.camps!,...map.portals,...guards,...himmapan,...(map.boss?[map.boss]:[]),...(relay?[relay]:[])])assert.ok(reached.has(p.x+","+p.z),map.id+" "+p.x+","+p.z);
    if(relay){
      assert.ok(!isRestArea(map.id,relay));assert.equal(map.portals.filter(p=>p.targetMapId===map.id).length,2);
      assert.ok((map.bounds.maxX-map.bounds.minX)*(map.bounds.maxZ-map.bounds.minZ)>3.5*84*97);
    }
    if(map.region)assert.deepEqual([Math.min(...guards.map(s=>s.level)),Math.max(...guards.map(s=>s.level))],map.region.range);
    else assert.equal(guards.length,0);
    for(const m of guards){assert.ok(!isRestArea(map.id,m));assert.deepEqual(parseAttackCommand({targetId:m.id}),{targetId:m.id});}
  }
  const cave=ATLAS_MAPS.naga_cavern;
  assert.deepEqual(getSafeMapSpawn(cave.id,{...cave.spawn,y:6}),cave.spawn);
  for(const id of ["drowned_marsh","spirit_rift"]){
    const m=WORLD_MAPS[id], y=groundAt(id,0,-4);
    assert.ok(y<0 && isSafeWorldPoint(m,{x:0,y,z:-4}));
    assert.ok(!isSafeWorldPoint(m,{x:0,y:0,z:-4}));
    for(const x of [-22,22])assert.ok(isSafeWorldPoint(m,{x,y:0,z:-4}));
  }
});

test("each outer hunt trail connects its gates, shelter and two new courts",()=>{
  for(const [id,c4,c5] of [["bamboo_frontier",32,35],["lotus_basin",48,52],["drowned_marsh",18,22],["moon_cemetery",26,32],["hex_ridge",39,45],["naga_cavern",52,58],["fallen_city",67,72],["asura_peak",80,85],["spirit_rift",94,98]] as const){
    const map=WORLD_MAPS[id],trail=(map.huntTrail??map.strategic?.huntTrail)!,route=map.paths![trail.path];
    const touches=(p:{x:number;z:number})=>route.some(v=>v.x===p.x && v.z===p.z);
    assert.equal(map.portals.length,id==="moon_cemetery"?4:id==="spirit_rift"?1:2);
    const gateAt=(p:{x:number;z:number})=>map.portals.find(g=>g.x===p.x && g.z===p.z);
    const start=gateAt(route[0]),end=gateAt(route.at(-1)!);
    assert.ok(start && end);assert.equal(start===end,id==="spirit_rift");
    assert.equal(map.camps!.length,5);assert.ok(map.camps!.slice(3).every(touches));
    assert.ok(map.restAreas!.some(a=>touches(a) && !map.portals.some(p=>p.x===a.x && p.z===a.z) && isRestArea(id,a)));
    assert.deepEqual(map.camps!.slice(3).map(c=>Math.max(...c.levels)),[c4,c5]);assert.equal(map.camps![4].tier,"strong");
    assert.ok(map.paths!.slice(trail.path+1).some(path=>path.some(touches)));
    const population=ATLAS_SPAWNS.filter(s=>s.mapId===id);assert.equal(population.length,id==="spirit_rift"?11:10);
    assert.equal(population.filter(s=>s.tier==="strong").length,id==="asura_peak"?3:1);
  }
  const lake=WORLD_MAPS.lotus_basin;
  for(const bridge of lake.strategic!.sites.filter(s=>s.kind==="bridge")){
    assert.ok(isSafeWorldPoint(lake,{...bridge,y:0}));assert.ok(!isSafeWorldPoint(lake,{x:bridge.x+5,z:bridge.z,y:0}));
  }
  assert.ok(!isWorldSegmentClear("bamboo_frontier",{x:-71,z:-18},{x:-71,z:-11}));
  const marsh=WORLD_MAPS.drowned_marsh;assert.equal(marsh.bridges!.length,8);
  for(const bridge of marsh.bridges!){
    assert.ok(isSafeWorldPoint(marsh,{...bridge,y:0}));assert.ok(!isSafeWorldPoint(marsh,{x:bridge.x+5,z:bridge.z,y:0}));
  }
  assert.ok(!isWorldSegmentClear("moon_cemetery",{x:75,z:-30},{x:75,z:-20}));
  assert.ok(!isWorldSegmentClear("hex_ridge",{x:70,z:-22},{x:79,z:-22}));
  const cave=WORLD_MAPS.naga_cavern;
  assert.equal(cave.region!.noFlight,true);
  assert.deepEqual(cave.bridges,[{x:-83,z:-11}]);
  assert.ok(isWorldSegmentClear(cave.id,{x:-83,z:-7},{x:-83,z:-16}));
  for(const x of [-89,-77])assert.ok(!isSafeWorldPoint(cave,{x,y:0,z:-11}));
  assert.ok(!isWorldSegmentClear(cave.id,{x:-62,z:-42},{x:-62,z:-33}));
  assert.ok(!isWorldSegmentClear("fallen_city",{x:45,z:6},{x:45,z:22}));
  assert.ok(!isWorldSegmentClear("asura_peak",{x:-85,z:-27},{x:-78,z:-27}));
  const rift=WORLD_MAPS.spirit_rift,loop=rift.paths![rift.huntTrail!.path];
  assert.equal(rift.bridges!.length,6);
  for(const b of rift.bridges!){
    assert.ok(isSafeWorldPoint(rift,{...b,y:0}));assert.ok(!isSafeWorldPoint(rift,{x:b.x+5,z:b.z,y:0}));
  }
  assert.ok(loop.every(p=>Math.hypot(p.x-RIFT_WARDEN.x,p.z-RIFT_WARDEN.z)>20));
  assert.ok(rift.paths!.slice(rift.huntTrail!.path+1).some(path=>path.at(-1)?.x===RIFT_WARDEN.x && path.at(-1)?.z===RIFT_WARDEN.z));
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
    assert.equal(province.sites.filter(s=>s.kind==="bridge" && !isRestArea(id,s)).length,id==="moon_pass"?3:5);
    if(province.railPath!==undefined){
      const rail=map.paths![province.railPath],stops=map.portals.filter(p=>p.targetMapId===id);
      assert.deepEqual([rail[0],rail.at(-1)],stops.map(({x,z})=>({x,z})));
    }
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
test("Titan spawns beside the existing Asura boss, strikes nearby players and respawns on its own clock",()=>{
  const map = WORLD_MAPS[TITAN_BOSS.mapId];
  const state = new MyRoomState(), forest = new ForestEncounters(state.monsters);
  for (const id of ["first","second"]) state.players.set(id,new Player({...map.spawn,mapId:map.id,alive:true}));
  const hits: string[] = [], respawned: string[] = [];
  const tick = (at: number) => forest.update(at,0,state.players,new Set(),
    (id, monster) => { if (monster.id === TITAN_BOSS.id) hits.push(id); }, id => respawned.push(id));
  forest.initialize();
  tick(0);
  const titan = state.monsters.get(TITAN_BOSS.id)!;
  const point = {x:titan.x,y:titan.y,z:titan.z};
  assert.ok(isSafeWorldPoint(map,point));
  assert.ok(Math.hypot(point.x-TITAN_BOSS.x,point.z-TITAN_BOSS.z)<8);
  for(const player of state.players.values())Object.assign(player,point);
  tick(100);
  assert.equal(titan.tier,"boss");
  assert.ok(state.monsters.has("boss_asura_peak"));
  assert.equal(titan.aiState,"windup");
  tick(1499);
  assert.deepEqual(hits,[]);
  tick(1500);
  assert.deepEqual(hits,["first","second"]);
  assert.equal(forest.kill(titan.id,1600),true);
  assert.equal(forest.kill(titan.id,1601),false);
  tick(1600+TITAN_BOSS.respawnMs-1);
  assert.equal(titan.alive,false);
  tick(1600+TITAN_BOSS.respawnMs);
  assert.equal(titan.hp,titan.maxHp);
  assert.ok(respawned.includes(titan.id));
});

test("all occupied atlas zones replicate and the warden's respawn clock survives an empty zone",()=>{
  const state=new MyRoomState(),forest=new ForestEncounters(state.monsters);
  forest.initialize();assert.equal(state.monsters.size,34);
  const tick=(now:number)=>forest.update(now,0,state.players,new Set(),()=>{},()=>{});
  for(const mapId of ["drowned_marsh","moon_cemetery","asura_peak","spirit_rift"]) state.players.set(mapId,new Player({...ATLAS_MAPS[mapId].spawn,mapId,alive:true}));
  tick(100);assert.equal(state.monsters.size+1,80);
  assert.ok(!state.monsters.has("atlas_hex_ridge_1_1"));
  for (const map of Object.values(ATLAS_MAPS)) state.players.set(map.id,new Player({...map.spawn,mapId:map.id}));
  tick(100);assert.equal(state.monsters.size+1,142);
  const id=RIFT_WARDEN.id;assert.ok(forest.kill(id,100));state.players.delete("spirit_rift");tick(500);
  assert.ok(!state.monsters.has(id));state.players.set("spirit_rift",new Player({...ATLAS_MAPS.spirit_rift.spawn,mapId:"spirit_rift"}));
  tick(1100);assert.equal(state.monsters.get(id)?.alive,false);
  assert.equal(RIFT_WARDEN.respawnMs,1_200_000);
  tick(100+1_199_999);assert.equal(state.monsters.get(id)?.alive,false);
  tick(100+1_200_000);assert.equal(state.monsters.get(id)?.alive,true);
  assert.ok(state.monsters.has("atlas_hex_ridge_1_1"));
});

test("each enabled hunt has its own reachable boss, drops and twenty-minute clock",()=>{
  const state=new MyRoomState(),forest=new ForestEncounters(state.monsters);forest.initialize();
  const battlefield=new ForestEncounters(new MyRoomState().monsters);battlefield.initialize(false);
  const occupied=Object.values(WORLD_MAPS).filter(map=>map.camps?.length || REGIONAL_BOSSES.some(b=>b.mapId===map.id));
  for(const map of occupied)assert(map.guardian || map.boss,map.id);
  const tick=(now:number)=>forest.update(now,0,state.players,new Set(),()=>{},()=>{});
  for(const [i,boss] of REGIONAL_BOSSES.entries()){
    const map=WORLD_MAPS[boss.mapId];
    assert.equal(battlefield.profile(boss.id),null);
    if(!map){assert.equal(forest.profile(boss.id),null);assert.equal(parseAttackCommand({targetId:boss.id}),null);continue;}
    if (boss.id !== TITAN_BOSS.id) assert.equal(map.boss?.id,boss.id);
    assert.equal(boss.respawnMs,1_200_000);
    assert.deepEqual(parseAttackCommand({targetId:boss.id}),{targetId:boss.id});
    const home={x:boss.x,z:boss.z,y:groundAt(map.id,boss.x,boss.z)};
    assert(isSafeWorldPoint(map,home,.7) && !isRestArea(map.id,home),map.id);
    assert([...map.portals,map.spawn,...map.restAreas??[]].every(p=>Math.hypot(boss.x-p.x,boss.z-p.z)>18),map.id);
    assert(map.paths?.some(path=>path.some(p=>p.x===boss.x && p.z===boss.z)),map.id);
    state.players.set(map.id,new Player({...map.spawn,mapId:map.id}));
    tick(100+i);
    const actor=state.monsters.get(boss.id)!;
    assert.equal(actor.displayName,boss.name);assert.equal(actor.tier,"boss");assert.equal(actor.level,boss.level);
    assert(forest.kill(boss.id,100+i,state.players));assert(!forest.kill(boss.id,101+i,state.players));
  }
  for(const [i,boss] of REGIONAL_BOSSES.entries()){
    if(!WORLD_MAPS[boss.mapId])continue;
    tick(100+i+1_199_999);assert.equal(state.monsters.get(boss.id)?.alive,false,boss.id);
    tick(100+i+1_200_000);assert.equal(state.monsters.get(boss.id)?.alive,true,boss.id);
  }
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


test("river-watch defender base is inside the fort and reaches its flag with gates closed",()=>{
  const map=WORLD_MAPS.river_watch,base=map.strategic!.defenderSpawn!;
  const flag=map.strategic!.sites.find(s=>s.kind==="fort")!;
  assert.deepEqual(base,{x:-22,z:-36});
  assert.ok(isSafeWorldPoint(map,{...base,y:groundAt(map.id,base.x,base.z)}));
  const gates=new Set(map.strategic!.rampart!.gates.map(g=>g.id));
  assert.ok(isWorldSegmentClear(map.id,base,flag,gates));
  assert.ok(Math.hypot(base.x-flag.x,base.z-flag.z)>5,"do not spawn on capture point");
  assert.ok(Math.hypot(base.x-flag.x,base.z-flag.z)<10,"defenders can reach flag promptly");
  // Travel portals and attacker entry are not moved along with the war-only base.
  assert.ok(map.portals.some(p=>p.x===0 && p.z===-58));
  assert.ok(map.portals.some(p=>p.x===0 && p.z===26));
  assert.deepEqual(JSON.parse(JSON.stringify(map)).strategic.defenderSpawn,base);
});
