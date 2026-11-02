import test from "node:test";
import assert from "node:assert/strict";
import { getWorldMap, getSafeMapSpawn, isSafeWorldPoint, isRestArea, isWorldSegmentClear } from "./WorldMaps.js";
import { MyRoomState, Player } from "./schema/MyRoomState.js";
import { ForestEncounters } from "./ForestEncounters.js";
import { parseMoveCommand } from "./GameRules.js";
import { advanceDash } from "./DashRules.js";
import { MyRoom } from "./MyRoom.js";
import { CharacterStore } from "./CharacterStore.js";
import { monsterExperience } from "./Progression.js";
import type { PartyManager } from "./PartyManager.js";
import type { Monster } from "./schema/MyRoomState.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("forest expands to 120 by 120 and preserves its original entrance", () => {
  const map = getWorldMap("forbidden_forest")!;
  assert.equal(map.bounds.maxX - map.bounds.minX, 120);
  assert.equal(map.bounds.maxZ - map.bounds.minZ, 120);
  assert.deepEqual(map.spawn, {x:0,y:0,z:12});
});
test("movement uses the selected map bounds and rejects injected fields", () => {
  const forest = getWorldMap("forbidden_forest")!;
  assert.deepEqual(parseMoveCommand({x:30,z:-45}, forest.bounds), {x:30,z:-45});
  assert.equal(parseMoveCommand({x:30,z:-45}), null);
  assert.equal(parseMoveCommand({x:61,z:-45}, forest.bounds), null);
  assert.equal(parseMoveCommand({x:30,z:-45,speed:999}, forest.bounds), null);
});
test("dash works beyond old bounds and still stops at the real forest edge", () => {
  const map = getWorldMap("forbidden_forest")!;
  const free = (x:number,z:number) => isSafeWorldPoint(map,{x,y:0,z});
  const step = advanceDash({x:30,z:-40},{dx:1,dz:0},.675,free,map.bounds);
  assert.ok(step.x > 30.6 && !step.blocked);
  const edge = advanceDash({x:59.5,z:-40},{dx:1,dz:0},4.5,free,map.bounds);
  assert.ok(edge.blocked && edge.x <= 59.6 + 1e-8);
});
test("saved locations beyond the old boundary remain in the same map", () => {
  const point = {x:30,y:0,z:-45};
  assert.deepEqual(getSafeMapSpawn("forbidden_forest",point),point);
  assert.deepEqual(getSafeMapSpawn("forbidden_forest",{x:500,y:0,z:0}),{x:0,y:0,z:12});
});
test("17 independent enemies have valid spawn points outside rest zones", () => {
  const state=new MyRoomState(),forest=new ForestEncounters(state.monsters);forest.initialize();
  assert.equal([...state.monsters.values()].filter(m=>m.mapId==="forbidden_forest").length,17);
  const map=getWorldMap("forbidden_forest")!;
  for(const m of state.monsters.values()){
    if(m.mapId!==map.id)continue;
    assert.ok(isSafeWorldPoint(map,m));assert.equal(isRestArea(m.mapId,m),false);
    assert.ok(m.level>=1&&m.level<=12);
  }
  const id="forest_west_1";assert.equal(forest.kill(id,100),true);assert.equal(forest.kill(id,101),false);
  const notices:string[]=[];
  forest.update(25099,.05,state.players,new Set(),()=>assert.fail("no players"),id=>notices.push(id));
  assert.equal(state.monsters.get(id)!.alive,false);
  forest.update(25100,.05,state.players,new Set(),()=>assert.fail("no players"),id=>notices.push(id));
  assert.deepEqual(notices,[id]);assert.equal(state.monsters.get(id)!.hp,state.monsters.get(id)!.maxHp);
});
test("forest AI does not attack another map, flying players or actors saving", () => {
  const state=new MyRoomState(),forest=new ForestEncounters(state.monsters);forest.initialize();
  const m=state.monsters.get("forest_west_1")!;
  const p=new Player({x:m.x,z:m.z,y:0,mapId:"ritual_village"});state.players.set("p",p);
  let hits=0;const hit=()=>{hits++};
  forest.update(1000,.05,state.players,new Set(),hit,()=>{});assert.equal(hits,0);
  p.mapId="forbidden_forest";p.y=6;
  forest.update(2000,.05,state.players,new Set(),hit,()=>{});assert.equal(hits,0);
  p.y=0;forest.update(3000,.05,state.players,new Set(["p"]),hit,()=>{});assert.equal(hits,0);
  forest.update(4000,.05,state.players,new Set(),hit,()=>{});assert.equal(hits,1);
});
test("rest areas protect both the village hub and the forest entrance",()=>{
  assert.equal(isRestArea("ritual_village",{x:0,z:0}),true);
  assert.equal(isRestArea("forbidden_forest",{x:0,z:12}),true);
  assert.equal(isRestArea("forbidden_forest",{x:30,z:-45}),false);
});

test("combat checks both ends of rest zones and respects forest obstacles",()=>{
  const room=new MyRoom();
  const a=new Player({x:0,z:12,mapId:"forbidden_forest"}),b=new Player({x:0,z:4,mapId:"forbidden_forest"});
  room.state.players.set("a",a);room.state.players.set("b",b);
  const combat=room as unknown as {sameCombatMap:(a:string,b:string)=>boolean};
  assert.equal(combat.sameCombatMap("a","b"),false);
  assert.equal(combat.sameCombatMap("b","a"),false);
  a.z=3;assert.equal(combat.sameCombatMap("a","b"),true);
  assert.equal(isWorldSegmentClear("forbidden_forest",{x:3,z:-9},{x:7,z:-9}),false);
  assert.equal(isWorldSegmentClear("forbidden_forest",{x:3,z:-14},{x:7,z:-14}),true);
});

test("forest party EXP uses the defeated enemy's level, map and position",()=>{
  const room=new MyRoom(),forest=new ForestEncounters(room.state.monsters);forest.initialize();
  const monster=room.state.monsters.get("forest_deep_east_2")!;
  const internal=room as unknown as {parties:PartyManager;persistentCharacters:Map<string,string>;awardMonsterExperience:(id:string,m:Monster)=>void;grantMonsterExperience:(id:string,amount?:number)=>void};
  for(const [id,mapId,x] of [["a","forbidden_forest",monster.x],["b","forbidden_forest",monster.x+2],["far","forbidden_forest",monster.x+22],["other","ritual_village",monster.x]] as const){
    room.state.players.set(id,new Player({x,y:0,z:monster.z,mapId,level:1,alive:true}));internal.persistentCharacters.set(id,id);
  }
  for(const id of ["b","far","other"]){const invite=internal.parties.invite("a",id,0);internal.parties.accept(id,invite.id,1);}
  const awarded:Array<[string,number|undefined]>=[];
  internal.grantMonsterExperience=(id,amount)=>{awarded.push([id,amount]);};
  internal.awardMonsterExperience("a",monster);
  const amount=Math.floor(monsterExperience(1,monster.level)/2);
  assert.deepEqual(awarded,[["a",amount],["b",amount]]);
});

test("SQLite economy preserves expanded positions, EXP and inventory across reopen",async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),"montra-world-test-sqlite-"));
  const store=new CharacterStore(dir,true);let reopened:CharacterStore|undefined;
  try{
    const token="mt1_"+"ab".repeat(32),saved=(await store.loadOrCreate(token,{x:0,z:0})).character;
    saved.mapId="forbidden_forest";saved.x=30;saved.z=-45;saved.level=3;saved.experience=123;saved.inventory!.slots[0]!.quantity=2;
    await store.save(saved);store.close();reopened=new CharacterStore(dir,true);
    const restored=(await reopened.loadOrCreate(token,{x:0,z:0})).character;
    assert.equal(restored.mapId,"forbidden_forest");assert.equal(restored.x,30);assert.equal(restored.z,-45);
    assert.equal(restored.level,3);assert.equal(restored.experience,123);assert.equal(restored.inventory!.slots[0]!.quantity,2);
  }finally{store.close();reopened?.close();await rm(dir,{recursive:true,force:true});}
});
