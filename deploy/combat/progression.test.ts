import test from "node:test";
import assert from "node:assert/strict";
import { addExperience, calculateDamage, calculateStats, emptyAllocations, monsterExperience, pointsAvailable, validateAllocations, xpForNextLevel } from "./Progression.js";

test("Hybrid base values and damage match the document's level-one example", () => {
  const stats = calculateStats(1, emptyAllocations());
  assert.deepEqual(stats, { maxHp:240, atk:20, def:30, magicAtk:15, magicDef:20, maxStamina:100 });
  assert.equal(calculateDamage(20,30,1),15);
  assert.equal(xpForNextLevel(1),150);
  assert.equal(xpForNextLevel(2),300);
});
test("EXP carries across level boundaries, uses level difference, and stops at cap", () => {
  assert.deepEqual(addExperience(1,90,400), { level:3, experience:40 });
  assert.deepEqual(addExperience(100,0,100), { level:100, experience:0 });
  assert.deepEqual(addExperience(101,23,100), { level:101, experience:23 });
  assert.equal(monsterExperience(1,1),100);
  assert.equal(monsterExperience(2,1),95);
  assert.equal(monsterExperience(21,1),0);
  const allocated = { ...emptyAllocations(), atk:2, hp:1 };
  assert.equal(pointsAvailable(3,allocated),0);
  assert.ok(calculateStats(3,allocated).atk > calculateStats(3,emptyAllocations()).atk);
});
test("legacy persisted allocations reject invalid values and overspending", () => {
  assert.throws(() => validateAllocations({ ...emptyAllocations(), atk:4 },2), /invalid_stat_allocations/);
  assert.throws(() => validateAllocations({ ...emptyAllocations(), atk:-1 },2), /invalid_stat_allocations/);
});
