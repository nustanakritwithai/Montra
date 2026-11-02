import test from "node:test";
import assert from "node:assert/strict";
import { applyBuffs, BuffBook, POSSESSION_BUFF, possessionCoolingDown, rememberPossessionCooldown } from "./Buffs.js";
import { calculateStats, emptyAllocations } from "./Progression.js";

test("possession recalculates combat stats once and never changes HP or stamina",()=>{
  const base=calculateStats(1,emptyAllocations()), buffed=applyBuffs(base,["possession"]);
  assert.equal(buffed.atk,24); assert.equal(buffed.def,36);
  assert.equal(buffed.magicAtk,18); assert.equal(buffed.magicDef,24);
  assert.equal(buffed.maxHp,base.maxHp);assert.equal(buffed.maxStamina,base.maxStamina);
  assert.deepEqual(applyBuffs(base,["possession","possession"]),buffed);
  assert.deepEqual(applyBuffs(base,[]),base);
  const next=calculateStats(2,emptyAllocations());
  assert.equal(applyBuffs(next,["possession"]).atk,Math.round(next.atk*1.2));
});

test("server time controls expiration, cancellation and cooldown",()=>{
  const b=new BuffBook();assert.equal(b.activate("a",100),"ok");assert.equal(b.activate("a",100),"active");
  assert.deepEqual(b.expired(100+POSSESSION_BUFF.durationMs-1),[]);
  assert.deepEqual(b.expired(100+POSSESSION_BUFF.durationMs),["a"]);
  assert.equal(b.end("a",60_100),true);assert.equal(b.end("a",60_100),false);
  assert.equal(b.activate("a",90_099),"cooldown");assert.equal(b.activate("a",90_100),"ok");
  b.forget("a");assert.equal(b.activate("a",90_101),"ok");b.clear();assert.deepEqual(b.expired(1_000_000),[]);
});


test("persistent-character cooldown is shared across rooms until expiry",()=>{
  const id="test-buff-character";rememberPossessionCooldown(id,100);
  assert.equal(possessionCoolingDown(id,30_099),true);
  assert.equal(possessionCoolingDown(id,30_100),false);
});
