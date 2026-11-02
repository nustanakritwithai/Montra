import test from "node:test";
import assert from "node:assert/strict";
import { MyRoomState, Player } from "./schema/MyRoomState.js";
import { SHRINE_GUARDIAN, getWorldMap, isSafeWorldPoint } from "./WorldMaps.js";
import { grantRewardPotion, makeStarterInventory, INVENTORY_STACK_LIMIT } from "./ItemRules.js";
import { ForestEncounters } from "./ForestEncounters.js";

test("forest monsters use the server profile and respawn independently with local population",()=>{
  const state=new MyRoomState(), forest=new ForestEncounters(state.monsters);
  forest.initialize(); assert.equal(state.monsters.size,17);
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


test("the shrine strike is avoidable, server-timed and the guardian has its own respawn",()=>{
  const state=new MyRoomState(),forest=new ForestEncounters(state.monsters);
  forest.initialize();
  const id=SHRINE_GUARDIAN.id,keeper=state.monsters.get(id)!;
  const player=new Player({x:keeper.x,z:keeper.z,y:0,mapId:keeper.mapId});
  state.players.set("p",player);
  const hits:number[]=[];
  const update=(now:number)=>forest.update(now,.05,state.players,new Set(),(_id,_m,force=1)=>hits.push(force),()=>{});
  assert.equal(keeper.tier,"elite");
  update(1000);assert.equal(keeper.aiState,"windup");
  player.x+=4;update(2400);assert.deepEqual(hits,[]);
  player.x=keeper.x;update(10000);update(11399);assert.deepEqual(hits,[]);
  update(11400);assert.deepEqual(hits,[1.6]);
  assert.ok(forest.kill(id,12000));assert.equal(forest.kill(id,12000),false);
  update(131999);assert.equal(keeper.alive,false);
  update(132000);assert.equal(keeper.alive,true);assert.equal(keeper.hp,keeper.maxHp);
});
test("entry routes are walkable and the Elite prize respects the real bag",()=>{
  const map=getWorldMap("forbidden_forest")!;
  for(const trail of map.paths!) for(let i=1;i<trail.length;i++){
    const a=trail[i-1],b=trail[i],length=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)*5);
    for(let j=0;j<=length;j++)assert.ok(isSafeWorldPoint(map,{x:a.x+(b.x-a.x)*j/length,y:0,z:a.z+(b.z-a.z)*j/length}));
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
