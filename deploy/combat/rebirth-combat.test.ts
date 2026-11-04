import {test} from "node:test";
import {strict as assert} from "node:assert";
import {newRebirthState,recordClassLevel,startNextLife} from "./Rebirth.js";
import {PATHS,type PathId} from "./CharacterBuilds.js";
import {masteryBonuses,masteryCapacity,scaleResource,encodeMasteryVitals,validateMasteryVitals} from "./RebirthCombat.js";

test("six masteries and cycle bonuses have bounded additive PvE and PvP effects",()=>{
  let state=newRebirthState();
  for(const path of Object.keys(PATHS) as PathId[])for(let rank=0;rank<2;rank++)state=startNextLife(state,path,100);
  for(let n=state.count;n<15;n++)state=startNextLife(state,"seer",100);
  const a=masteryBonuses(state,"pve",true),b=masteryBonuses(state,"pvp",true);
  assert.equal(a.hp,.2);assert.equal(a.atk,.2);assert.equal(a.magicAtk,.2);
  assert.equal(a.def,.05);assert.equal(a.magicDef,.05);assert.equal(a.mana,.05);assert.equal(a.regen,.05);assert.equal(a.movement,.02);
  assert.ok(Math.abs(b.hp-.07)<1e-12);assert.equal(b.mana,.025);assert.equal(b.movement,.01);
  assert.equal(masteryCapacity(320,a.mana),336);assert.equal(masteryCapacity(320,b.mana),328);
  assert.equal(masteryCapacity(10000,a.hp),12000);
  assert(Object.values(masteryBonuses(state,"pve",false)).every(n=>n===0));
  for(const path of Object.keys(PATHS) as PathId[]){
    const first=recordClassLevel(newRebirthState(),path,100);
    assert.deepEqual(recordClassLevel(first,path,100),first);
    assert(Object.values(masteryBonuses(first,"pve",true)).some(n=>n>0));
  }
});

test("1000 context switches and saves cannot create health or mana",()=>{
  let hp=137.125,mana=71.6;
  for(let n=0;n<1000;n++){
    hp=scaleResource(hp,1200,1070);mana=scaleResource(mana,336,328);
    hp=scaleResource(hp,1070,1200);mana=scaleResource(mana,328,336);
    const saved=encodeMasteryVitals(hp,mana,1.2,1.05,0);
    validateMasteryVitals(saved.masteryVitals,new Date().toISOString(),saved.hp);
    hp=(saved.hp+saved.masteryVitals.hpRemainder)*1.2;mana=saved.mana*1.05;
  }
  assert.ok(Math.abs(hp-137.125)<1e-8);assert.ok(Math.abs(mana-71.6)<1e-8);
  assert.equal(scaleResource(0,1200,1070),0);
  const tiny=encodeMasteryVitals(.5,336,1.2,1.05,0);
  assert(tiny.hp+tiny.masteryVitals.hpRemainder>0);assert.equal(tiny.mana,320);
});

test("hostile metadata, unknown versions and unbounded PvP persistence are rejected",()=>{
  const now=new Date().toISOString();
  const invalid:unknown[]=[null,[],{version:2,hpRemainder:0,pvpUntil:0},{version:1,hpRemainder:NaN,pvpUntil:0},
    {version:1,hpRemainder:1,pvpUntil:0},{version:1,hpRemainder:0,pvpUntil:Date.parse(now)+7000},
    {version:1,hpRemainder:0,pvpUntil:0,bonus:99}];
  for(const v of invalid)assert.throws(()=>validateMasteryVitals(v,now,240));
  assert.equal(validateMasteryVitals(undefined,now,240),undefined);
});
