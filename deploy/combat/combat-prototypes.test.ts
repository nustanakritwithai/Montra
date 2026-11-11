import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newFlowingState,useFlowing,advanceFlowing,clearFlowing,cancelFlowing,consumeFlowingGuard,FLOWING_GUARD_DAMAGE_FACTOR} from './FlowingBladesPrototype.js';
import {newCounterCursor,recordChaiyaBlock,validChaiyaOpportunity,consumeChaiyaOpportunity,grantChaiyaDebuff,consumeChaiyaDebuff,activeChaiyaDebuff,clearChaiyaDebuff} from './ChaiyaCounterPrototype.js';

test('flowing first hit, one paid activation and server-timed follow-up',()=>{
  let r=useFlowing(newFlowingState(),100,1,'m1',true);assert.equal(r.action,'first');
  r=useFlowing(r.state,400,1,'m1',true);assert.equal(r.reason,'replay');
  r=useFlowing(r.state,399,2,'m1',true);assert.equal(r.reason,'invalid_time');
  r=useFlowing(r.state,400,2,'m2',true);assert.equal(r.reason,'wrong_target');
  r=useFlowing(r.state,401,3,'m1',false);assert.equal(r.reason,'invalid_target_or_caster');
  r=useFlowing(r.state,401,4,'m1',true);assert.equal(r.action,'followup');
  assert.equal(r.state.pending,undefined);
  assert.equal(useFlowing(r.state,402,4,'m1',true).reason,'replay');
  // The room must now apply its existing cooldown to reject a new activation.
  assert.equal(useFlowing(r.state,402,5,'m1',false).action,'none');
});

test('flowing distinguishes rapid presses and expiry; guard cannot extend on a late tick',()=>{
  let r=useFlowing(newFlowingState(),100,10,'m1',true);
  r=useFlowing(r.state,399,11,'m1',true);assert.equal(r.reason,'too_early');
  r=useFlowing(r.state,1300,12,'m1',true);assert.equal(r.reason,'guard_active');
  assert.deepEqual(r.state.guard,{until:2300});
  assert.equal(FLOWING_GUARD_DAMAGE_FACTOR,.7);
  assert.equal(advanceFlowing(r.state,2299).guard?.until,2300);
  assert.equal(advanceFlowing(r.state,2300).guard,undefined);
  const first=useFlowing(newFlowingState(),100,1,'m1',true);
  assert.equal(advanceFlowing(first.state,9999).guard,undefined);
});

test('flowing state is bounded, isolated, and clearable for lifecycle events',()=>{
  const a=useFlowing(newFlowingState(),1,1,'a',true).state;
  const b=useFlowing(newFlowingState(),1,1,'b',true).state;
  assert.equal(a.pending?.targetId,'a');assert.equal(b.pending?.targetId,'b');
  for(const event of ['death','map','class','school','leave','reconnect']) {
    assert.deepEqual(clearFlowing(a),{lastSeq:1,lastNow:1},event);
    assert.equal(useFlowing(clearFlowing(a),2,1,'a',true).reason,'replay');
  }
  assert.equal(useFlowing(a,2,2,'a',false).action,'none');
});

test('Chaiya only marks normal monsters on an authorized live counter; no stacks or refresh',()=>{
  let cursor=newCounterCursor();
  let r=grantChaiyaDebuff(cursor,undefined,100,1,'p','m','normal_monster',false,true,recordChaiyaBlock('m',100));
  assert.equal(r.applied,false);cursor=r.cursor;
  r=grantChaiyaDebuff(cursor,undefined,100,2,'p','m','normal_monster',true,false,recordChaiyaBlock('m',100));assert.equal(r.applied,false);cursor=r.cursor;
  for(const kind of (['boss','player'] as const)) {r=grantChaiyaDebuff(cursor,undefined,100,cursor.lastSeq+1,'p','m',kind,true,true,recordChaiyaBlock('m',100));assert.equal(r.applied,false);cursor=r.cursor;}
  r=grantChaiyaDebuff(cursor,undefined,100,5,'p','m','normal_monster',true,true,recordChaiyaBlock('m',100));assert.equal(r.applied,true);
  const mark=r.debuff;assert.deepEqual(mark,{monsterId:'m',sourceId:'p',until:3100});
  r=grantChaiyaDebuff(r.cursor,mark,200,5,'p','m','normal_monster',true,true,recordChaiyaBlock('m',100));assert.equal(r.applied,false);assert.deepEqual(r.debuff,mark);
  r=grantChaiyaDebuff(r.cursor,mark,200,6,'p2','m','normal_monster',true,true,recordChaiyaBlock('m',100));assert.equal(r.applied,false);assert.deepEqual(r.debuff,mark);
});

test('Chaiya reduces exactly one positive direct physical attack by marked monster',()=>{
  const mark={monsterId:'m',sourceId:'p',until:3100};
  for(const [who,kind,damage] of ([['other','direct_physical',10],['m','other',10],['m','direct_physical',0]] as const)) {
    const r=consumeChaiyaDebuff(mark,3099,who,kind,damage);assert.equal(r.factor,1);assert.deepEqual(r.debuff,mark);
  }
  let r=consumeChaiyaDebuff(mark,3099,'m','direct_physical',10);assert.equal(r.factor,.75);assert.equal(r.debuff,undefined);
  r=consumeChaiyaDebuff(r.debuff,3099,'m','direct_physical',10);assert.equal(r.factor,1);
  assert.equal(consumeChaiyaDebuff(mark,3100,'m','direct_physical',10).factor,1);
  assert.equal(activeChaiyaDebuff(mark,3100),undefined);
});

test('Chaiya cleanup removes affected caster or monster state without affecting others',()=>{
  const mark={monsterId:'m',sourceId:'p',until:3100};
  assert.equal(clearChaiyaDebuff(mark,'p'),undefined);
  assert.equal(clearChaiyaDebuff(mark,'m'),undefined);
  assert.deepEqual(clearChaiyaDebuff(mark,'other'),mark);
  assert.deepEqual(newCounterCursor(),{lastSeq:-1});
});


test('prototype inputs remain bounded and reject unsafe timestamps',()=>{
  assert.equal(useFlowing(newFlowingState(),Number.MAX_SAFE_INTEGER,1,'m',true).reason,'invalid_time');
  assert.equal(useFlowing(newFlowingState(),1,1,'m'.repeat(257),true).action,'none');
  assert.equal(grantChaiyaDebuff(newCounterCursor(),undefined,Number.MAX_SAFE_INTEGER,1,'p','m','normal_monster',true,true,recordChaiyaBlock('m',100)).applied,false);
  assert.equal(grantChaiyaDebuff(newCounterCursor(),undefined,1,1,'p','m'.repeat(257),'normal_monster',true,true,recordChaiyaBlock('m',100)).applied,false);
});


test('accepted different skill cancels pending or guard while preserving replay watermark',()=>{
  const pending=useFlowing(newFlowingState(),100,10,'m',true).state;
  const cancelled=cancelFlowing(pending,200,11);
  assert.equal(cancelled.pending,undefined);
  assert.equal(useFlowing(cancelled,201,10,'m',true).reason,'replay');
  assert.deepEqual(cancelFlowing(pending,200,10),pending);
  const guard=advanceFlowing(pending,1300);
  assert.equal(cancelFlowing(guard,1301,12).guard,undefined);
});


test('flowing guard consumes only the first positive frontal hit and expires',()=>{
  const pending=useFlowing(newFlowingState(),100,1,'m',true).state;
  let r=consumeFlowingGuard(pending,1300,false,10);assert.equal(r.factor,1);assert.ok(r.state.guard);
  r=consumeFlowingGuard(r.state,1301,true,0);assert.equal(r.factor,1);assert.ok(r.state.guard);
  r=consumeFlowingGuard(r.state,1302,true,10);assert.equal(r.factor,.7);assert.equal(r.state.guard,undefined);
  r=consumeFlowingGuard(r.state,1303,true,10);assert.equal(r.factor,1);
  assert.equal(consumeFlowingGuard(pending,2300,true,10).factor,1);
});

test('Chaiya debuff requires the server-recorded attacker and an unexpired counter window',()=>{
  const chance=recordChaiyaBlock('m1',100);assert.deepEqual(chance,{attackerId:'m1',openedAt:100,until:3100});
  assert.equal(validChaiyaOpportunity(chance,'m2',200),false);assert.equal(validChaiyaOpportunity(chance,'m1',99),false);assert.equal(validChaiyaOpportunity(chance,'m1',200),true);
  assert.equal(consumeChaiyaOpportunity(chance,'m2',200).accepted,false);
  const used=consumeChaiyaOpportunity(chance,'m1',200);assert.equal(used.accepted,true);assert.equal(used.opportunity,undefined);assert.equal(consumeChaiyaOpportunity(used.opportunity,'m1',200).accepted,false);
  let r=grantChaiyaDebuff(newCounterCursor(),undefined,200,1,'p','m2','normal_monster',true,true,chance);assert.equal(r.applied,false);
  r=grantChaiyaDebuff(r.cursor,undefined,3100,2,'p','m1','normal_monster',true,true,chance);assert.equal(r.applied,false);
  r=grantChaiyaDebuff(r.cursor,undefined,200,3,'p','m1','normal_monster',true,true,undefined);assert.equal(r.applied,false);
  r=grantChaiyaDebuff(r.cursor,undefined,200,4,'p','m1','normal_monster',true,true,chance);assert.equal(r.applied,true);
  assert.equal(recordChaiyaBlock('m',Number.MAX_SAFE_INTEGER),undefined);
});
