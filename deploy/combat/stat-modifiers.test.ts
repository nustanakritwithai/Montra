import test from "node:test";
import assert from "node:assert/strict";
import { calculateModifiedStats, type StatModifier } from "./StatModifiers.js";
import { calculateStats, emptyAllocations } from "./Progression.js";
import { applyBuffs } from "./Buffs.js";
const base=calculateStats(1,emptyAllocations());
const effect=(id:string,sourceId:string,group:string,atk:number):StatModifier=>({id,sourceId,group,bonuses:{atk}});

test("base and existing possession preserve the game's current numbers",()=>{
  assert.deepEqual(calculateModifiedStats(base,[]),base);
  assert.deepEqual(applyBuffs(base,["possession"]),{...base,atk:24,def:36,magicAtk:18,magicDef:24});
  assert.deepEqual(applyBuffs(base,["possession","possession"]),applyBuffs(base,["possession"]));
});
test("same-group effects diminish while independent groups multiply",()=>{
  const e=[effect("a","caster1","spirit",.2),effect("a","caster2","spirit",.2),effect("c","self","skill",.1)];
  const stats={...base,atk:100};
  assert.equal(calculateModifiedStats(stats,e).atk,143); // 100 * (1+.20+.10) * 1.10
  assert.equal(calculateModifiedStats(stats,[...e].reverse()).atk,143);
  assert.equal(calculateModifiedStats(stats,e).def,stats.def);
  assert.equal(calculateModifiedStats(stats,e).maxHp,stats.maxHp);
});
test("same-group ranking uses the strongest modifier first and caps runaway bonuses",()=>{
  const stats={...base,atk:100},e=[effect("a","x","g",.1),effect("b","y","g",.4)];
  assert.equal(calculateModifiedStats(stats,e).atk,145);
  const many=Array.from({length:8},(_,i)=>effect("a","s"+i,"g"+i,1));
  assert.equal(calculateModifiedStats(stats,many).atk,400);
});
test("rejects duplicate sources, invalid bonuses and malformed state",()=>{
  const e=effect("a","x","g",.2);
  assert.throws(()=>calculateModifiedStats(base,[e,e]),/duplicate_modifier_source/);
  assert.throws(()=>calculateModifiedStats(base,[effect("a","x","g",-1)]),/invalid_modifier_bonus/);
  assert.throws(()=>calculateModifiedStats(base,[{...e,bonuses:{maxHp:1} as never}]),/invalid_modifier_bonus/);
  assert.throws(()=>calculateModifiedStats({...base,atk:NaN},[]),/invalid_base_stats/);
});
