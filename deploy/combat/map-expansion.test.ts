import test from "node:test";
import assert from "node:assert/strict";
import { getWorldMap, getSafeMapSpawn, isSafeWorldPoint, isRestArea } from "./WorldMaps.js";
import { MyRoomState, Player } from "./schema/MyRoomState.js";
import { ForestEncounters } from "./ForestEncounters.js";
import { parseMoveCommand } from "./GameRules.js";
import { advanceDash } from "./DashRules.js";

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
test("16 independent enemies have valid spawn points outside rest zones", () => {
  const state=new MyRoomState(),forest=new ForestEncounters(state.monsters);forest.initialize();
  assert.equal(state.monsters.size,16);
  const map=getWorldMap("forbidden_forest")!;
  for(const m of state.monsters.values()){
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
