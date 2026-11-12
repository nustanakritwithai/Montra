import test from "node:test";
import assert from "node:assert/strict";
import { MyRoomState, Player, type Monster } from "./schema/MyRoomState.js";
import { SHRINE_GUARDIAN, WORLD_MAPS, getWorldMap, groundAt, isRestArea, isSafeWorldPoint, type WorldMapDefinition } from "./WorldMaps.js";
import { parseAttackCommand } from "./GameRules.js";
import { grantRewardPotion, makeStarterInventory, INVENTORY_STACK_LIMIT } from "./ItemRules.js";
import { FOREST_RESPAWN_MS, ForestEncounters } from "./ForestEncounters.js";
import { ATLAS_SPAWNS, FRONTIER_SPAWNS, HIMMAPAN_REPLACEMENTS, HIMMAPAN_SPAWNS } from "./WorldAtlas.js";
import { waterDepthAt } from "./GroundTerrain.js";
import { advanceForestObjective } from "./ForestObjectives.js";

const waterMonsters=new Set<string>(HIMMAPAN_SPAWNS.filter(spawn=>"habitat" in spawn && spawn.habitat==="water").map(spawn=>spawn.id));
for(const id of ["atlas_drowned_marsh_2_1","atlas_drowned_marsh_2_2","atlas_drowned_marsh_3_1"])waterMonsters.add(id);
function isValidMonsterSurface(map:WorldMapDefinition, monster:Monster):boolean {
  if(waterMonsters.has(monster.id))return waterDepthAt(map,monster.x,monster.z)>0 && monster.y===map.waterLevel;
  return isSafeWorldPoint(map,monster);
}

const himmapan = [
  ["himmapan_matcha_naga", "lotus_basin", "มัจฉนาคา", 48],
  ["himmapan_garuda_scout", "twin_neck_pass", "ครุฑลาดตระเวน", 52],
  ["himmapan_stone_yaksha", "hex_ridge", "ยักษ์ศิลาด่าน", 45],
  ["himmapan_kochasri", "naga_cavern", "คชสีห์", 50],
  ["himmapan_hemaraj", "naga_cavern", "เหมราช", 54],
  ["himmapan_durong_paksin", "hex_ridge", "ดุรงค์ปักษิณ", 45],
  ["himmapan_kunchon_wari", "lotus_basin", "กุญชรวารี", 50],
  ["himmapan_karavek", "hex_ridge", "นกการเวก", 45],
] as const;

for(const [id,mapId,name,level] of [
  ["himmapan_karin_paksa","hex_ridge","กรินทรปักษา",45],
  ["himmapan_tinna_siha","bamboo_frontier","ติณสีหะ",31],
  ["himmapan_hera","naga_cavern","เหรา",52],
  ["himmapan_thanthi_ma","moon_cemetery","นกทัณฑิมา",32],
] as const){
  test(`${name} replaces one duplicate and uses its reference attack`,()=>{
    const map=getWorldMap(mapId)!;
    const state=new MyRoomState(),forest=new ForestEncounters(state.monsters);
    forest.initialize();
    const attacker=new Player({...map.spawn,mapId});
    const observer=new Player({...map.spawn,mapId});
    state.players.set("attacker",attacker);
    state.players.set("observer",observer);
    const hits:string[]=[];
    const tick=(now:number,dt=0)=>forest.update(now,dt,state.players,new Set(),
      (pid,monster)=>{if(monster.id===id)hits.push(pid);},()=>{});
    tick(0);
    const monster=state.monsters.get(id)!;
    assert.ok(monster?.alive && isValidMonsterSurface(map,monster));
    assert.deepEqual([monster.displayName,monster.level],[name,level]);
    const replaced=HIMMAPAN_REPLACEMENTS.get(id)!;
    assert.ok(!state.monsters.has(replaced));
    const objectiveId=replaced.slice(0,replaced.lastIndexOf("_"));
    assert.equal(advanceForestObjective({id:objectiveId,progress:0},id,mapId).active?.progress,1);
    const home={x:monster.x,z:monster.z};
    const place=(player:Player,dx:number,dz:number)=>{
      const x=home.x+dx,z=home.z+dz;
      Object.assign(player,{x,y:groundAt(mapId,x,z),z});
      assert.ok(isSafeWorldPoint(map,player));
    };
    if(id==="himmapan_tinna_siha"){
      place(attacker,0,-2);
      place(observer,0,2);
      tick(100);tick(2000);
      assert.equal(monster.aiState,"grazing");
      assert.deepEqual(hits,[]);
      assert.equal(forest.taunt(id,"attacker",2000,1500,0),"immune");
      forest.provoke(id,"attacker");
      tick(2100);
      assert.equal(monster.aiState,"windup");
      assert.equal(monster.specialHalfAngle,Math.PI/3);
      tick(2979);assert.deepEqual(hits,[]);
      tick(2980);assert.deepEqual(hits,["attacker"]);
      for(let now=3400;now<=5000;now+=200)tick(now,.2);
      assert.ok(monster.z>home.z+2,"retreat carries the lion away from its attacker");
      assert.equal(monster.aiState,"grazing");
      assert.equal(monster.targetId,"");
      assert.deepEqual(hits,["attacker"]);
      return;
    }
    const forward=id==="himmapan_hera" || id==="himmapan_karin_paksa"?1:-1;
    place(attacker,0,3*forward);
    tick(100);
    assert.equal(monster.aiState,"windup");
    assert.deepEqual(hits,[]);
    if(id==="himmapan_karin_paksa"){
      const landing={x:monster.specialOriginX,z:monster.specialOriginZ};
      assert.deepEqual(landing,{x:attacker.x,z:attacker.z});
      assert.deepEqual({x:monster.x,z:monster.z},home);
      place(attacker,3.5,3);
      place(observer,0,3);
      tick(1749);assert.deepEqual(hits,[]);
      tick(1750);
      assert.deepEqual(hits,["observer"]);
      assert.deepEqual({x:monster.x,z:monster.z},landing);
    }else if(id==="himmapan_hera"){
      assert.equal(monster.specialStage,1);
      tick(560);assert.deepEqual(hits,[]);
      assert.equal(monster.specialStage,2);
      assert.equal(monster.specialHalfWidth,.95);
      place(observer,2,3);
      tick(1429);assert.deepEqual(hits,[]);
      tick(1430);assert.deepEqual(hits,["attacker"]);
    }else{
      assert.equal(monster.specialHalfAngle,Math.PI/2);
      place(observer,2,-1);
      const behind=new Player({...map.spawn,mapId});
      place(behind,0,1.8);
      state.players.set("behind",behind);
      tick(1349);assert.deepEqual(hits,[]);
      tick(1350);assert.deepEqual(hits,["attacker","observer"]);
    }
    assert.equal(monster.aiState,"special_recovery");
  });
}

for (const [id,mapId,name,level,tier,phases,recovery] of [
  ["himmapan_phayak_nathi","drowned_marsh","พยัคฆนที",22,"normal",[[650,0],[750,1.25]],650],
  ["himmapan_hatsadiling","twin_neck_pass","นกหัสดีลิงค์",57,"normal",[[1250,1.25]],1700],
  ["himmapan_kraisorn","asura_peak","ไกรสรราชสีห์",80,"elite",[[950,.9],[800,1.1]],1750],
  ["himmapan_kilen","bamboo_frontier","กิเลน",33,"normal",[[950,1],[850,1],[850,1.15]],650],
] as const) {
  test(`${name} uses its server-marked area, timing and recovery`, t=>{
    const map=getWorldMap(mapId);
    if(!map)return t.skip("optional map disabled");
    const state=new MyRoomState(),forest=new ForestEncounters(state.monsters);
    const siege=new ForestEncounters(new MyRoomState().monsters);
    forest.initialize();siege.initialize(false);
    assert.equal(siege.profile(id),null);
    const replaced=HIMMAPAN_REPLACEMENTS.get(id)!;
    const base=[...ATLAS_SPAWNS,...FRONTIER_SPAWNS];
    const duplicate=base.find(spawn=>spawn.id===replaced)!;
    assert.equal(duplicate.mapId,mapId);
    assert.ok(base.some(spawn=>spawn.id!==replaced && spawn.mapId===mapId && spawn.name===duplicate.name));
    assert.equal(forest.profile(replaced),null);
    assert.ok(siege.profile(replaced));
    const objectiveId=replaced.slice(0,replaced.lastIndexOf("_"));
    assert.equal(advanceForestObjective({id:objectiveId,progress:0},id,mapId).active?.progress,1);
    const hunter=new Player({...map.spawn,mapId});
    const second=new Player({...map.spawn,mapId});
    const blocked=new Player({...map.spawn,mapId});
    state.players.set("hunter",hunter);
    state.players.set("second",second);
    state.players.set("blocked",blocked);
    const hits:[string,number,number][]=[];
    const tick=(now:number)=>forest.update(now,0,state.players,new Set(["blocked"]),
      (pid,monster,force)=>{if(monster.id===id)hits.push([pid,force??1,now]);},()=>{});
    tick(0);
    const m=state.monsters.get(id)!;
    assert.ok(m);
    assert.deepEqual([m.displayName,m.level,m.tier],[name,level,tier]);
    assert.ok(isValidMonsterSurface(map,m) && !isRestArea(mapId,m));
    const home={x:m.x,z:m.z};
    const place=(player:Player,x:number,z:number)=>{
      const onWater=waterDepthAt(map,x,z)>0;
      Object.assign(player,{x,z,y:onWater ? map.waterLevel! : groundAt(mapId,x,z),boatId:onWater ? "test-boat" : ""});
    };
    const resetHunter=()=>place(hunter,home.x,home.z-1.8);
    resetHunter();
    let now=100;
    tick(now);
    const centers=new Set<string>();
    const marks=[...m.specialMarks];
    assert.equal(marks.length,id==="himmapan_kilen"?9:0);
    for(const [index,[windup,force]] of phases.entries()){
      assert.equal(m.aiState,"windup");
      assert.equal(m.specialStage,phases.length===1?0:index+1);
      const origin=m.specialStage?{x:m.specialOriginX,z:m.specialOriginZ}:home;
      if(marks.length){
        assert.deepEqual([...m.specialMarks],marks);
        assert.deepEqual([origin.x,origin.z,m.specialRange],marks.slice(index*3,index*3+3));
      }
      centers.add(`${origin.x},${origin.z}`);
      const front=m.specialHalfAngle ? .75 : 0;
      for(const player of [hunter,second,blocked])place(player,origin.x,origin.z-front);
      const previous=hits.length;
      tick(now+windup-1);
      assert.equal(hits.length,previous);
      now+=windup;
      tick(now);
      assert.deepEqual(hits.slice(previous),force?[["hunter",force,now],["second",force,now]]:[]);
    }
    assert.equal(m.aiState,"special_recovery");
    if(id==="himmapan_phayak_nathi"){
      assert.equal(centers.size,2);
      assert.ok(Math.hypot(m.x-home.x,m.z-home.z)>1);
      assert.ok(isValidMonsterSurface(map,m));
    }
    if(id==="himmapan_kilen")assert.equal(centers.size,3);
    tick(now+recovery-1);
    assert.equal(m.aiState,"special_recovery");
    tick(now+recovery);
    assert.notEqual(m.aiState,"special_recovery");
    assert.equal(m.specialStage,0);
    assert.equal(m.specialMarks.length,0);
    if(id==="himmapan_kilen"){
      resetHunter();
      tick(8100);tick(9050);
      assert.equal(m.specialStage,2);
      assert.equal(forest.interrupt(id,9150,1500,0),"applied");
      const before=hits.length;
      tick(9900);
      assert.equal(m.aiState,"stagger");
      assert.equal(m.specialStage,0);
      assert.equal(m.specialMarks.length,0);
      assert.equal(hits.length,before);
    }
    if(tier==="elite")assert.equal(forest.interrupt(id,8100,1500,0),"immune");
  });
}

for (const [id, mapId, name, level] of himmapan) {
  test(`${id} spawns in the PvE map, winds up, can miss and respawns`, t => {
    const map = getWorldMap(mapId);
    if (!map) return t.skip("optional map disabled");
    const state = new MyRoomState(), forest = new ForestEncounters(state.monsters);
    const siege = new ForestEncounters(new MyRoomState().monsters);
    forest.initialize();
    siege.initialize(false);
    assert.equal(siege.profile(id), null);
    const player = new Player({ ...map.spawn, mapId });
    state.players.set("hunter", player);
    const hits: number[] = [];
    const blocked = new Set<string>();
    const tick = (now: number) => forest.update(now, 0, state.players, blocked,
      (target, attacker, force = 1) => { if (target === "hunter" && attacker.id === id) hits.push(force); }, () => {});
    tick(0);
    const monster = state.monsters.get(id);
    assert.ok(monster, id);
    assert.equal(monster.displayName, name);
    assert.equal(monster.level, level);
    assert.equal(monster.tier, "normal");
    assert.deepEqual(parseAttackCommand({ targetId: id }), { targetId: id });
    assert.ok(isValidMonsterSurface(map, monster));
    assert.ok(!isRestArea(mapId, monster));

    const place = (x: number, z: number) => Object.assign(player, { x, y: groundAt(mapId, x, z), z });
    place(monster.x, monster.z - 1.5);
    tick(100);
    assert.equal(monster.aiState, "windup");
    assert.deepEqual(hits, []);
    place(monster.x + 4, monster.z - 1.5);
    tick(1500);
    assert.deepEqual(hits, [], "stepping out of the warning avoids the attack");
    place(monster.x, monster.z - 1.5);
    tick(8100);
    assert.equal(monster.aiState, "windup");
    blocked.add("hunter");
    tick(9600);
    assert.deepEqual(hits, [], "a player in transit cannot be hit");
    blocked.clear();
    tick(16_100);
    assert.equal(monster.aiState, "windup");
    assert.equal(forest.interrupt(id, 16_200, 1500, 0), "applied");
    tick(17_600);
    assert.deepEqual(hits, [], "interrupt cancels the pending strike");
    tick(24_100);
    assert.equal(monster.aiState, "windup");
    tick(25_600);
    assert.deepEqual(hits, [1.25]);
    assert.equal(monster.aiState, "special_recovery");
    assert.ok(forest.kill(id, 26_000, state.players));
    tick(50_999);
    assert.equal(monster.alive, false);
    tick(51_000);
    assert.equal(monster.alive, true);
    assert.equal(monster.hp, monster.maxHp);
  });
}

for (const [id, mapId, hitOffset, safeOffset] of [
  ["himmapan_kochasri", "naga_cavern", [2.15, -3], [.95, -.65]],
  ["himmapan_kunchon_wari", "lotus_basin", [1.9, 0], [.5, 0]],
] as const) {
  test(`${id} hits only its reference attack area`, () => {
    const state = new MyRoomState(), forest = new ForestEncounters(state.monsters);
    forest.initialize();
    state.players.set("target", new Player({ ...getWorldMap(mapId)!.spawn, mapId }));
    const hitPlayers: string[] = [];
    const tick = (now: number) => forest.update(now, 0, state.players, new Set(),
      (targetId, attacker) => { if (attacker.id === id) hitPlayers.push(targetId); }, () => {});
    tick(0);
    const monster = state.monsters.get(id)!;
    const feetAt = (dx: number, dz: number) => {
      const x = monster.x + dx, z = monster.z + dz;
      return { x, y: groundAt(mapId, x, z), z, mapId };
    };
    Object.assign(state.players.get("target")!, feetAt(0, -1.5));
    tick(100);
    assert.equal(monster.aiState, "windup");
    state.players.set("inside", new Player(feetAt(hitOffset[0], hitOffset[1])));
    state.players.set("outside", new Player(feetAt(safeOffset[0], safeOffset[1])));
    tick(1500);
    assert.deepEqual(hitPlayers.sort(), ["inside", "target"]);
  });
}

test("forest monsters use the server profile and respawn independently with local population",()=>{
  const state=new MyRoomState(), forest=new ForestEncounters(state.monsters);
  forest.initialize(); assert.equal([...state.monsters.values()].filter(m=>m.mapId==="forbidden_forest").length,17);
  const monster=state.monsters.get("forest_west_1")!;
  assert.equal(monster.hp,200);assert.equal(monster.defense,34);
  assert.equal(forest.profile(monster.id)?.attack,8);
  for(const id of ["one","two"])state.players.set(id,new Player({x:monster.x,y:0,z:monster.z,alive:true,mapId:"forbidden_forest"}));
  state.players.set("outside",new Player({x:monster.x+50,y:0,z:monster.z,alive:true,mapId:"forbidden_forest"}));
  assert.equal(forest.kill(monster.id,100,state.players),true);
  assert.equal(forest.kill(monster.id,101,state.players),false);
  forest.update(23_599,.05,state.players,new Set(),()=>{},()=>{});
  assert.equal(monster.alive,false);
  forest.update(23_600,.05,state.players,new Set(),()=>{},()=>{});
  assert.equal(monster.alive,true);assert.equal(monster.hp,200);
});

test("wild encounters spawn, patrol and respawn in the intended habitat on every enabled map",()=>{
  const state=new MyRoomState(),forest=new ForestEncounters(state.monsters);
  forest.initialize();
  for(const map of Object.values(WORLD_MAPS))state.players.set(map.id,new Player({...map.spawn,mapId:map.id}));
  const blocked=new Set(state.players.keys());
  const tick=(now:number,dt:number)=>forest.update(now,dt,state.players,blocked,()=>{},()=>{});
  const check=()=>{
    for(const [id,monster] of state.monsters){
      const map=getWorldMap(monster.mapId)!;
      const wet=waterDepthAt(map,monster.x,monster.z)>0;
      assert.equal(wet,waterMonsters.has(id),id+" habitat");
      assert.equal(monster.y,wet ? map.waterLevel : groundAt(map.id,monster.x,monster.z),id+" surface");
    }
  };
  tick(0,0);
  assert.ok(state.monsters.size>100);
  for(const id of waterMonsters)assert.ok(state.monsters.get(id)?.alive,id);
  const initial=new Map([...state.monsters].map(([id,m])=>[id,{x:m.x,y:m.y,z:m.z}]));
  check();
  for(let frame=1;frame<=80;frame++){
    tick(frame*50,.05);
    check();
  }
  for(const id of waterMonsters)assert.ok(forest.kill(id,4000));
  tick(4000+FOREST_RESPAWN_MS,0);
  check();
  for(const id of waterMonsters){
    const monster=state.monsters.get(id)!;
    assert.equal(monster.alive,true);
    assert.deepEqual({x:monster.x,y:monster.y,z:monster.z},initial.get(id));
  }
});


test("land and water monsters stay in their habitats when chasing across a bank",()=>{
  const state=new MyRoomState(),forest=new ForestEncounters(state.monsters);
  forest.initialize();
  const fixtures=[
    {id:"frontier_river_watch_1_2",mapId:"river_watch",boatId:"test-boat"},
    {id:"himmapan_matcha_naga",mapId:"lotus_basin",boatId:""},
  ];
  for(const {id,mapId} of fixtures)state.players.set(id,new Player({...WORLD_MAPS[mapId].spawn,mapId}));
  const tick=(now:number,dt:number)=>forest.update(now,dt,state.players,new Set(),()=>{},()=>{});
  forest.update(0,0,state.players,new Set(state.players.keys()),()=>{},()=>{});
  for(const {id,mapId,boatId} of fixtures){
    const map=WORLD_MAPS[mapId], monster=state.monsters.get(id)!;
    // The shoreline shifts with optional terrain, so choose an opposite-bank point in aggro range.
    const points=[];
    for(let dx=-5;dx<=5;dx++)for(let dz=-5;dz<=5;dz++){
      const distance=Math.hypot(dx,dz);
      if(distance<3 || distance>5)continue;
      points.push({x:monster.x+dx,z:monster.z+dz});
    }
    const target=points.find(p=>!isRestArea(mapId,p) && (waterDepthAt(map,p.x,p.z)>0)===Boolean(boatId));
    assert.ok(target,id);
    Object.assign(state.players.get(id)!,target,{boatId,y:boatId ? map.waterLevel! : groundAt(mapId,target.x,target.z)});
    assert.equal(forest.canDisplace(id,target),false,id);
  }
  const matcha=state.monsters.get("himmapan_matcha_naga")!;
  assert.ok(forest.canDisplace(matcha.id,{x:matcha.x+1,z:matcha.z}));
  const chased=new Set<string>();
  for(let frame=1;frame<=120;frame++){
    tick(frame*50,.05);
    for(const {id,mapId} of fixtures){
      const monster=state.monsters.get(id)!;
      assert.equal(waterDepthAt(WORLD_MAPS[mapId],monster.x,monster.z)>0,waterMonsters.has(id),id);
      if(monster.targetId===id && monster.aiState==="chase")chased.add(id);
    }
  }
  for(const {id} of fixtures)assert.ok(chased.has(id),id);
});

test("the shrine strike is avoidable, server-timed and the guardian has its own respawn",()=>{
  const state=new MyRoomState(),forest=new ForestEncounters(state.monsters);
  forest.initialize();
  const id=SHRINE_GUARDIAN.id,keeper=state.monsters.get(id)!;
  const player=new Player({x:keeper.x,z:keeper.z,y:keeper.y,mapId:keeper.mapId});
  state.players.set("p",player);
  const hits:number[]=[];
  const update=(now:number)=>forest.update(now,.05,state.players,new Set(),(_id,_m,force=1)=>hits.push(force),()=>{});
  assert.equal(keeper.tier,"elite");
  update(1000);assert.equal(keeper.aiState,"windup");
  player.x+=4;player.y=groundAt(player.mapId,player.x,player.z);update(2400);assert.deepEqual(hits,[]);
  player.x=keeper.x;player.y=keeper.y;update(10000);update(11399);assert.deepEqual(hits,[]);
  update(11400);assert.deepEqual(hits,[1.6]);
  assert.ok(forest.kill(id,12000));assert.equal(forest.kill(id,12000),false);
  assert.equal(SHRINE_GUARDIAN.respawnMs,1_200_000);
  update(12_000+1_199_999);assert.equal(keeper.alive,false);
  update(12_000+1_200_000);assert.equal(keeper.alive,true);assert.equal(keeper.hp,keeper.maxHp);
});
test("entry routes are walkable and the Elite prize respects the real bag",()=>{
  const map=getWorldMap("forbidden_forest")!;
  for(const trail of map.paths!) for(let i=1;i<trail.length;i++){
    const a=trail[i-1],b=trail[i],length=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)*5);
    for(let j=0;j<=length;j++){
      const x=a.x+(b.x-a.x)*j/length,z=a.z+(b.z-a.z)*j/length;
      assert.ok(isSafeWorldPoint(map,{x,y:groundAt(map.id,x,z),z}));
    }
  }
  const bag=makeStarterInventory(),slot=bag.slots[0]!;
  slot.quantity=INVENTORY_STACK_LIMIT;
  assert.deepEqual(grantRewardPotion(bag)!.slots[4],{itemId:"health_potion",quantity:1});
  assert.equal(bag.slots[4],null);
  for(let i=4;i<bag.slots.length;i++)bag.slots[i]={itemId:"health_potion",quantity:INVENTORY_STACK_LIMIT};
  assert.equal(grantRewardPotion(bag),null);
});

test("per-spawn tiers are server configured and reject mistakes before spawning",()=>{
  const state=new MyRoomState(), forest=new ForestEncounters(state.monsters,{forest_west_1:"weak",forest_west_2:"strong"});
  forest.initialize();
  assert.equal(forest.profile("forest_west_1")?.tier,"weak");
  assert.equal(state.monsters.get("forest_west_1")?.maxHp,100);
  assert.equal(forest.profile("forest_west_2")?.tier,"strong");
  assert.equal(state.monsters.get("forest_west_2")?.maxHp,330);
  assert.equal(forest.profile("forest_west_3")?.tier,"normal");
  for(const config of [{forest_typo_1:"weak"},{forest_west_1:"unknown"}] as never[]){
    const invalid=new MyRoomState(),encounters=new ForestEncounters(invalid.monsters,config);
    assert.throws(()=>encounters.initialize(),/unknown_monster_spawn_tier|invalid_monster_tier/);
    assert.equal(invalid.monsters.size,0);
  }
});
