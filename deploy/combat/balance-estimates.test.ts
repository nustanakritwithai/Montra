import test from "node:test";
import assert from "node:assert/strict";
import { estimateEncounter } from "./BalanceEstimates.js";

test("estimate uses live attack, weapon and cooldown rules with explicit assumptions",()=>{
  const plain=estimateEncounter(1,"ritual_dagger",false),buff=estimateEncounter(1,"ritual_dagger",true);
  assert.equal(plain.playerHp,240);assert.equal(plain.monsterHp,200);
  assert.equal(plain.damagePerHit,18);assert.equal(plain.hitsToDefeat,12);
  assert.equal(plain.secondsBetweenFirstAndLastHit,11);
  assert.ok(buff.damagePerHit>plain.damagePerHit);assert.equal(buff.playerHp,plain.playerHp);
  assert.throws(()=>estimateEncounter(101,"ritual_dagger",false),/invalid_estimate_level/);
});
