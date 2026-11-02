import test from "node:test";
import assert from "node:assert/strict";
import { estimateSpawnCapacity, MONSTER_CONFIG, monsterProfile, monsterRespawnDelay, monsterReward } from "./MonsterProfiles.js";
import { calculateDamage, monsterExperience } from "./Progression.js";

test("normal profile provides a consistent baseline across the forest level range",()=>{
  assert.deepEqual(monsterProfile(1),{level:1,tier:"normal",maxHp:200,attack:8,defense:34});
  assert.deepEqual(monsterProfile(12),{level:12,tier:"normal",maxHp:420,attack:17,defense:78});
  assert.equal(MONSTER_CONFIG.respawnMs,25_000);
  assert.equal(monsterRespawnDelay(0),25_000);
  assert.equal(monsterRespawnDelay(2),23_500);
  assert.equal(monsterRespawnDelay(4),20_500);
  for (let players=5; players<=10; players++) assert.equal(monsterRespawnDelay(players),20_000);
  assert.throws(()=>monsterRespawnDelay(11),/invalid_nearby_population/);
});
test("tier multipliers and gap rewards stay server owned",()=>{
  assert.equal(monsterProfile(1,"weak").maxHp,100);
  assert.equal(monsterProfile(1,"elite").maxHp,600);
  assert.equal(monsterProfile(1,"boss").attack,80);
  assert.equal(monsterReward(1,1,"strong"),150);
  assert.equal(monsterReward(2,1),95);
  assert.equal(monsterReward(21,1),0);
  assert.equal(monsterReward(1,12),monsterExperience(1,12));
  assert.equal(monsterExperience(1,1),100);
  for(const player of [1,2,12,21,50,100]) for(const level of [1,2,12,50,100]) {
    assert.equal(monsterExperience(player,level),Math.floor(100*level*Math.max(0,1-0.05*(player-level))));
  }
});
test("simple equal-level forest encounters stay near the proposed 10–18 second target",()=>{
  const levelOne=monsterProfile(1), levelTwelve=monsterProfile(12);
  const hitsOne=Math.ceil(levelOne.maxHp/calculateDamage(24,levelOne.defense,1));
  const hitsTwelve=Math.ceil(levelTwelve.maxHp/calculateDamage(43,levelTwelve.defense,12));
  assert.ok(hitsOne>=10 && hitsOne<=18);
  assert.ok(hitsTwelve>=10 && hitsTwelve<=18);
});
test("invalid config is rejected and spawn estimates use seconds",()=>{
  assert.throws(()=>monsterProfile(0),/invalid_monster_level/);
  assert.throws(()=>monsterProfile(101),/invalid_monster_level/);
  assert.throws(()=>monsterProfile(1,"fake" as never),/invalid_monster_tier/);
  assert.throws(()=>monsterReward(-1,1),/invalid_player_level/);
  assert.equal(estimateSpawnCapacity(4,10,25),14);
  assert.throws(()=>estimateSpawnCapacity(1,0,25),/invalid_spawn_estimate/);
});
