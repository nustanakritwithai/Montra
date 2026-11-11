import test from "node:test";
import assert from "node:assert/strict";
import { MyRoomState, Player } from "./schema/MyRoomState.js";
import { SHRINE_GUARDIAN, getWorldMap, groundAt, isRestArea, isSafeWorldPoint } from "./WorldMaps.js";
import { parseAttackCommand } from "./GameRules.js";
import { grantRewardPotion, makeStarterInventory, INVENTORY_STACK_LIMIT } from "./ItemRules.js";
import { ForestEncounters } from "./ForestEncounters.js";

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
    assert.ok(isSafeWorldPoint(map, monster));
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
  assert.equal(SHRINE_GUARDIAN.respawnMs,1_200_000);
  update(12_000+1_199_999);assert.equal(keeper.alive,false);
  update(12_000+1_200_000);assert.equal(keeper.alive,true);assert.equal(keeper.hp,keeper.maxHp);
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
