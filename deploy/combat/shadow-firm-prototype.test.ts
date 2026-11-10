import {test} from "node:test";
import assert from "node:assert/strict";
import {clearShadowCut,expireShadowCut,markShadowCut,newShadowCutState,returnShadowCut,SHADOW_CUT_TRIAL} from "./ShadowCutPrototype.js";
import {activateFirmGuard,clearFirmGuard,expireFirmGuard,firmGuardMultiplier,newFirmGuardState,updateFirmGuard,FIRM_GUARD_TRIAL,type FirmGuardResult} from "./FirmGuardPrototype.js";

const point=(x=0,z=0,y=0,mapId="forest")=>({x,y,z,mapId});
const blade=(p=point())=>({point:p,alive:true,eligible:true});
const guard=(id:string,p=point())=>({id,point:p,alive:true,eligible:true});
const clearPath=()=>true;
const factor=(result:FirmGuardResult):number=>{if(result.kind!=="pass" && result.kind!=="protected")throw Error(result.kind);return result.factor;};

test("shadow marks once, copies the position, returns once, and rejects replay",()=>{
  const s=newShadowCutState(),origin=point();
  assert.equal(markShadowCut(s,blade(origin),100,0),true);origin.x=99;
  assert.equal(markShadowCut(s,blade(),101,0),false);
  assert.equal(markShadowCut(s,blade(),101,1),false);
  assert.deepEqual(returnShadowCut(s,blade(point(2)),102,2,clearPath),point());
  assert.equal(returnShadowCut(s,blade(),103,2,clearPath),undefined);
  assert.equal(returnShadowCut(s,blade(),104,3,clearPath),undefined);
});
test("shadow expiry, range, height, collision, invalidation and cleanup",()=>{
  const s=newShadowCutState();assert.equal(markShadowCut(s,blade(),0,0),true);
  assert.equal(returnShadowCut(s,blade(point(9)),1,1,clearPath),undefined);
  assert.equal(returnShadowCut(s,blade(point(0,0,1.2)),2,2,clearPath),undefined);
  assert.equal(returnShadowCut(s,blade(point(2)),3,3,()=>false),undefined);
  assert.deepEqual(returnShadowCut(s,blade(point(2)),4,4,clearPath),point());
  assert.equal(markShadowCut(s,blade(),10,5),true);
  assert.equal(returnShadowCut(s,blade(),10+SHADOW_CUT_TRIAL.durationMs,6,clearPath),undefined);
  assert.equal(markShadowCut(s,blade(),20+SHADOW_CUT_TRIAL.durationMs,7),true);
  assert.equal(returnShadowCut(s,blade(point(0,0,0,"other")),30+SHADOW_CUT_TRIAL.durationMs,8,clearPath),undefined);
  assert.equal(s.mark,undefined);
  assert.equal(markShadowCut(s,{...blade(),alive:false},5000,9),false);
  assert.equal(markShadowCut(s,{...blade(),eligible:false},5000,10),false);
  assert.equal(markShadowCut(s,blade(),5000,11),true);clearShadowCut(s);
  assert.equal(markShadowCut(s,blade(),5000,11),false);
  assert.equal(markShadowCut(s,blade(),5000,12),true);expireShadowCut(s,8000);assert.equal(s.mark,undefined);
});

test("firm guard protects only positioned allies from front attacks and has a bounded hit budget",()=>{
  const s=newFirmGuardState(),g=guard("g"),a=guard("a",point(0,2)),e=guard("e",point(0,-3));
  assert.equal(activateFirmGuard(s,g,0,0,0),true);assert.equal(activateFirmGuard(s,g,0,0,0),false);
  let hit=0;const use=(ally=a,attacker=e,eligible=true,los=clearPath)=>factor(firmGuardMultiplier(s,10,hit++,g,0,ally,attacker,eligible,los));
  assert.equal(use(guard("a",point(0,-2))),1);assert.equal(use(a,guard("e",point(0,2))),1);
  assert.equal(use(guard("a",point(4,2))),1);assert.equal(use(guard("a",point(0,6))),1);
  assert.equal(use(guard("a",point(0,2,2))),1);assert.equal(use(guard("a",point(0,2,0,"other"))),1);
  assert.equal(use(a,e,false),1);assert.equal(use(a,e,true,()=>false),1);
  assert.equal(use(a,guard("a",point(0,-2))),1);
  assert.equal(use(),1-FIRM_GUARD_TRIAL.reduction);
  assert.deepEqual(firmGuardMultiplier(s,10,hit-1,g,0,a,e,true,clearPath),{kind:"duplicate"});
  assert.equal(use(),1-FIRM_GUARD_TRIAL.reduction);assert.equal(use(),1);assert.equal(s.guard,undefined);
  assert.equal(activateFirmGuard(s,g,20,1,0),true);
  assert.deepEqual(firmGuardMultiplier(s,20,hit-2,g,0,a,e,true,clearPath),{kind:"duplicate"});
});
test("firm guard handles expiry, eligibility, cleanup and cast replay",()=>{
  const s=newFirmGuardState(),g=guard("g"),a=guard("a",point(0,2)),e=guard("e",point(0,-2));
  assert.equal(activateFirmGuard(s,{...g,eligible:false},0,0,0),false);
  assert.equal(activateFirmGuard(s,g,0,1,0),true);expireFirmGuard(s,FIRM_GUARD_TRIAL.durationMs);assert.equal(s.guard,undefined);
  assert.equal(activateFirmGuard(s,g,3000,2,0),true);
  assert.equal(factor(firmGuardMultiplier(s,3001,0,{...g,alive:false},0,a,e,true,clearPath)),1);assert.equal(s.guard,undefined);
  assert.equal(activateFirmGuard(s,g,3002,3,0),true);clearFirmGuard(s);assert.equal(activateFirmGuard(s,g,3003,3,0),false);
});
test("guard geometry follows live facing and rejects forged non-finite coordinates",()=>{
  const s=newFirmGuardState(),g=guard("g"),a=guard("a",point(2,0)),e=guard("e",point(-2,0));
  assert.equal(activateFirmGuard(s,g,0,0,Math.PI/2),true);
  assert.equal(factor(firmGuardMultiplier(s,1,0,g,Math.PI/2,a,e,true,clearPath)),1-FIRM_GUARD_TRIAL.reduction);
  assert.equal(factor(firmGuardMultiplier(s,2,1,g,Math.PI/2,guard("a",point(NaN,0)),e,true,clearPath)),1);
  assert.equal(factor(firmGuardMultiplier(s,3,2,g,NaN,a,e,true,clearPath)),1);
});

test("self protection and exact distance and time boundaries",()=>{
  const s=newFirmGuardState(),g=guard("g"),e=guard("e",point(0,-2));
  assert.equal(activateFirmGuard(s,g,0,0,0),true);
  assert.equal(factor(firmGuardMultiplier(s,1,0,g,0,g,e,true,clearPath)),.7);
  assert.equal(factor(firmGuardMultiplier(s,2,1,g,0,guard("a",point(0,4)),e,true,clearPath)),.7);
  assert.equal(activateFirmGuard(s,g,3,1,0),true);
  assert.equal(factor(firmGuardMultiplier(s,3003,2,g,0,g,e,true,clearPath)),1);
  const sh=newShadowCutState();assert.equal(markShadowCut(sh,blade(),0,0),true);
  assert.deepEqual(returnShadowCut(sh,blade(point(5)),2999,1,clearPath),point());
  assert.equal(markShadowCut(sh,blade(),3000,2),true);
  assert.equal(returnShadowCut(sh,blade(point(5.001)),3001,3,clearPath),undefined);
});
test("movement or rotation cancels guard even before another hit",()=>{
  const s=newFirmGuardState(),g=guard("g"),e=guard("e",point(0,-2));
  assert.equal(activateFirmGuard(s,g,0,0,0),true);
  updateFirmGuard(s,guard("g",point(0.01)),0,1);assert.equal(s.guard,undefined);
  assert.equal(factor(firmGuardMultiplier(s,2,0,g,0,g,e,true,clearPath)),1);
  assert.equal(activateFirmGuard(s,g,3,1,0),true);
  updateFirmGuard(s,g,0.01,4);assert.equal(s.guard,undefined);
  assert.equal(activateFirmGuard(s,g,5,2,0),true);
  updateFirmGuard(s,g,Math.PI*2,6);assert.ok(s.guard);
});

test("damage boundary never reapplies a guard-observed duplicate",()=>{
  const s=newFirmGuardState(),g=guard("g"),e=guard("e",point(0,-2));
  assert.equal(activateFirmGuard(s,g,0,0,0),true);
  let hp=100;
  function damage(seq:number){
    const result=firmGuardMultiplier(s,1,seq,g,0,g,e,true,clearPath);
    if(result.kind==="pass" || result.kind==="protected")hp-=10*result.factor;
    return result.kind;
  }
  assert.equal(damage(0),"protected");assert.equal(hp,93);
  assert.equal(damage(0),"duplicate");assert.equal(hp,93);
  assert.equal(damage(1),"protected");assert.equal(hp,86);
  assert.equal(s.guard,undefined);
  assert.equal(damage(1),"duplicate");assert.equal(hp,86);
  assert.deepEqual(firmGuardMultiplier(s,1,-1,g,0,g,e,true,clearPath),{kind:"invalid"});
});
