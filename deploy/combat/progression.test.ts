import test from "node:test";
import assert from "node:assert/strict";
import { addExperience, calculateDamage, calculateStats, emptyAllocations, parseAllocateStat, pointsAvailable, validateAllocations, xpForNextLevel } from "./Progression.js";

test("Hybrid base values and damage match the document's level-one example", () => {
  const stats = calculateStats(1, emptyAllocations());
  assert.deepEqual(stats, { maxHp:240, atk:20, def:30, magicAtk:15, magicDef:20, maxStamina:100 });
  assert.equal(calculateDamage(20,30,1),15);
  assert.equal(xpForNextLevel(1),100);
});
test("EXP carries across level boundaries and grants earned points without resetting allocations", () => {
  assert.deepEqual(addExperience(1,90,200), { level:3, experience:40 });
  const allocated = { ...emptyAllocations(), atk:2, hp:1 };
  assert.equal(pointsAvailable(3,allocated),3);
  assert.ok(calculateStats(3,allocated).atk > calculateStats(3,emptyAllocations()).atk);
});
test("stat requests and persisted allocations reject forgery and overspending", () => {
  assert.equal(parseAllocateStat({stat:"atk"}),"atk");
  for(const value of [{stat:"atk",amount:999},{stat:"experience"},{stat:"atk",level:100},null]) assert.equal(parseAllocateStat(value),null);
  assert.throws(() => validateAllocations({ ...emptyAllocations(), atk:4 },2), /invalid_stat_allocations/);
  assert.throws(() => validateAllocations({ ...emptyAllocations(), atk:-1 },2), /invalid_stat_allocations/);
});
