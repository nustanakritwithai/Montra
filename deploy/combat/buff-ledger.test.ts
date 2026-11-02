import test from "node:test";
import assert from "node:assert/strict";
import { BuffLedger } from "./BuffLedger.js";
import { calculateModifiedStats, type StatModifier } from "./StatModifiers.js";
import { calculateStats, emptyAllocations } from "./Progression.js";

test("tracks separate sources and expiry without cross-player leakage",()=>{
  const ledger=new BuffLedger(), base=calculateStats(1,emptyAllocations());
  const effect:StatModifier={id:"power",sourceId:"a",group:"skill",bonuses:{atk:.2}};
  ledger.grant("one",effect,1000);ledger.grant("one",{...effect,sourceId:"b"},2000);
  ledger.grant("two",effect,3000);
  assert.equal(calculateModifiedStats({...base,atk:100},ledger.modifiers("one")).atk,130);
  assert.deepEqual(ledger.expire(999),[]);assert.deepEqual(ledger.expire(1000),["one"]);
  assert.equal(calculateModifiedStats({...base,atk:100},ledger.modifiers("one")).atk,120);
  assert.equal(ledger.modifiers("two").length,1);ledger.forget("one");assert.equal(ledger.modifiers("one").length,0);
  ledger.clear();assert.equal(ledger.modifiers("two").length,0);
});
test("refreshing the same source replaces its effect, and config cannot be mutated",()=>{
  const ledger=new BuffLedger(),effect={id:"power",sourceId:"a",group:"skill",bonuses:{atk:.2}};
  ledger.grant("one",effect,1000);effect.bonuses.atk=.9;
  assert.equal(ledger.modifiers("one")[0].bonuses.atk,.2);
  ledger.grant("one",effect,2000);assert.equal(ledger.modifiers("one").length,1);
  assert.deepEqual(ledger.expire(1000),[]);assert.deepEqual(ledger.expire(2000),["one"]);
  assert.throws(()=>ledger.grant("",effect,2000),/invalid_buff_instance/);
});
