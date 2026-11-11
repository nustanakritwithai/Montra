import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {existsSync} from 'node:fs';
import {DamageEventLedger,childDamageEvent,type DamageEventIdentity} from './DamageEventLedger.js';
const event=(overrides:Partial<DamageEventIdentity>={}):DamageEventIdentity=>({roomEpoch:'room-1',producerId:'monster-1',occurrence:1,targetId:'player-1',hitOrdinal:0,source:'direct',lineage:[],...overrides});
const exec=<T>(l:DamageEventLedger,id:DamageEventIdentity,op:()=>T,now=0,until=100)=>l.execute(id,'attack=8',now,until,op);
test('same logical hit executes once, including out-of-order distinct occurrences',()=>{
 const l=new DamageEventLedger(5);let hits=0;
 assert.deepEqual(exec(l,event({occurrence:9}),()=>++hits),{kind:'completed',value:1});
 assert.deepEqual(exec(l,event({occurrence:2}),()=>++hits),{kind:'completed',value:2});
 assert.deepEqual(exec(l,event({occurrence:9}),()=>++hits),{kind:'duplicate',status:'completed'});assert.equal(hits,2);
});
test('same occurrence with changed source or immutable details is a conflict',()=>{
 const l=new DamageEventLedger(3);assert.equal(exec(l,event(),()=>1).kind,'completed');
 assert.equal(exec(l,event({source:'damage_over_time'}),()=>2).kind,'conflict');
 assert.equal(l.reserve(event(),'attack=9',1,100).kind,'conflict');
 assert.equal(exec(l,event({targetId:'player-2'}),()=>3).kind,'completed');
 assert.equal(exec(l,event({hitOrdinal:1}),()=>4).kind,'completed');
});
test('capacity fails closed and does not silently evict retryable events',()=>{
 const l=new DamageEventLedger(1);let hits=0;assert.equal(exec(l,event(),()=>++hits).kind,'completed');
 assert.equal(exec(l,event({occurrence:2}),()=>++hits,1000,1100).kind,'capacity');
 assert.equal(exec(l,event(),()=>++hits,1000,1100).kind,'duplicate');assert.equal(hits,1);assert.equal(l.size,1);
});
test('retirement requires both lifetime closure and elapsed extended retry window',()=>{
 const l=new DamageEventLedger(1),id=event();const reservation=l.reserve(id,'attack=8',0,100);assert.equal(reservation.kind,'reserved');
 assert.equal(l.retire(id,'attack=8',100,true),false,'in-progress cannot retire');
 if(reservation.kind!=='reserved')throw Error('unexpected');assert.equal(l.complete(reservation.ticket),true);
 assert.equal(l.reserve(id,'attack=8',50,200).kind,'duplicate');
 assert.equal(l.retire(id,'attack=8',200,false),false);assert.equal(l.retire(id,'attack=8',199,true),false);assert.equal(l.retire(id,'different',200,true),false);
 assert.equal(l.retire(id,'attack=8',200,true),true);assert.equal(l.size,0);assert.equal(exec(l,event({occurrence:2}),()=>1,200,201).kind,'completed');
});
test('reentrancy sees in-progress and exception leaves uncertain without a second effect',()=>{
 const l=new DamageEventLedger(2),id=event();let hits=0;
 assert.throws(()=>exec(l,id,()=>{hits++;assert.deepEqual(exec(l,id,()=>++hits),{kind:'duplicate',status:'in_progress'});throw Error('partial effect');}),/partial effect/);
 assert.deepEqual(exec(l,id,()=>++hits),{kind:'duplicate',status:'uncertain'});assert.equal(hits,1);
});
test('parent, counter, interception and different hit ordinals have deterministic independent identities',()=>{
 const root=event(),counter=childDamageEvent(root,'counter','monster-1',0),again=childDamageEvent(root,'counter','monster-1',0),intercept=childDamageEvent(root,'intercept','guard-1',0),nextCounter=childDamageEvent(root,'counter','monster-1',1),nested=childDamageEvent(counter,'counter','player-1',0),l=new DamageEventLedger(8);
 assert.deepEqual(counter,again);assert.equal(counter.source,"direct");assert.equal(intercept.source,"transfer");assert.equal(intercept.lineage[0].parentSource,"direct");assert.notDeepEqual(root,counter);assert.notDeepEqual(counter,intercept);assert.notDeepEqual(counter,nextCounter);
 for(const id of [root,counter,intercept,nextCounter,nested])assert.equal(exec(l,id,()=>true).kind,'completed');
 assert.deepEqual(exec(l,again,()=>true),{kind:'duplicate',status:'completed'});
});
test('invalid identities, bad clocks, unsafe limits and async callbacks fail closed',()=>{
 assert.throws(()=>new DamageEventLedger(0));const l=new DamageEventLedger(3);
 assert.equal(l.reserve(event(),' ',0,10).kind,'reserved');assert.equal(l.reserve(event({occurrence:2}),'',0,10).kind,'invalid');
 assert.equal(l.reserve(event({occurrence:-1}),'x',0,10).kind,'invalid');assert.equal(l.reserve(event({source:'forged' as never}),'x',0,10).kind,'invalid');assert.equal(l.reserve(event(),'x',10,9).kind,'invalid');
 assert.deepEqual(l.execute(event({occurrence:2}),'x',0,10,async()=>1),{kind:'invalid'});
 assert.throws(()=>l.execute(event({occurrence:2}),'x',0,10,()=>Promise.resolve(1)),/async_damage_operation_not_supported/);
 assert.deepEqual(l.reserve(event({occurrence:2}),'x',1,10),{kind:'duplicate',status:'uncertain'});
});

test('a child cannot hide conflicting ancestry source',()=>{
 const l=new DamageEventLedger(2),direct=childDamageEvent(event(),'counter','monster-1',0);
 const poison=childDamageEvent(event({source:'damage_over_time'}),'counter','monster-1',0);
 assert.equal(exec(l,direct,()=>1).kind,'completed');assert.equal(exec(l,poison,()=>2).kind,'conflict');
});

test('room and producer boundaries are unambiguous and tickets finish only once',()=>{
 const l=new DamageEventLedger(3),a=event({roomEpoch:'ab',producerId:'c'}),b=event({roomEpoch:'a',producerId:'bc'});
 const reserved=l.reserve(a,'attack=8',0,100);assert.equal(reserved.kind,'reserved');
 assert.equal(exec(l,b,()=>1).kind,'completed');if(reserved.kind!=='reserved')throw Error('unexpected');
 assert.equal(l.complete(reserved.ticket),true);assert.equal(l.complete(reserved.ticket),false);assert.equal(l.markUncertain(reserved.ticket),false);
 assert.equal(exec(l,event({roomEpoch:'new-room'}),()=>2).kind,'completed');
});

test('declared generators and returned iterators cannot become completed',()=>{
 const l=new DamageEventLedger(5);let changes=0;
 function* generator(){changes++;yield 1;}
 async function* asyncGenerator(){changes++;yield 1;}
 assert.deepEqual(exec(l,event(),generator),{kind:'invalid'});
 assert.deepEqual(exec(l,event(),asyncGenerator),{kind:'invalid'});assert.equal(l.size,0);assert.equal(changes,0);
 assert.throws(()=>exec(l,event(),()=>generator()),/iterator_damage_operation_not_supported/);
 assert.deepEqual(l.reserve(event(),'attack=8',1,100),{kind:'duplicate',status:'uncertain'});assert.equal(changes,0);
 assert.throws(()=>exec(l,event({occurrence:2}),()=>asyncGenerator()),/iterator_damage_operation_not_supported/);
 assert.deepEqual(l.reserve(event({occurrence:2}),'attack=8',1,100),{kind:'duplicate',status:'uncertain'});assert.equal(changes,0);
 const custom={next(){changes++;return {done:true};},[Symbol.iterator](){return this;}};
 assert.throws(()=>exec(l,event({occurrence:3}),()=>custom),/iterator_damage_operation_not_supported/);assert.equal(changes,0);
 assert.equal(l.retire(event(),'attack=8',100,false),false,'caller must prove all deferred work and retries have ended');
});
test('rejected returned promise is observed under strict unhandled rejection mode',()=>{
 const candidates=[resolve(process.cwd(),'node_modules/tsx/dist/loader.mjs'),resolve(process.cwd(),'combat-verify/node_modules/tsx/dist/loader.mjs')];
 const loader=candidates.find(existsSync);assert.ok(loader,'verified local tsx loader is required');
 const moduleCandidates=[resolve(process.cwd(),'src/rooms/DamageEventLedger.ts'),resolve(process.cwd(),'deploy/combat/DamageEventLedger.ts')];
 const modulePath=moduleCandidates.find(existsSync);assert.ok(modulePath,'verified local ledger module is required');
 const script=`const assert=require('node:assert/strict');
 const {DamageEventLedger}=require(${JSON.stringify(modulePath)});
 const ledger=new DamageEventLedger(2),id={roomEpoch:'r',producerId:'p',occurrence:1,targetId:'t',hitOrdinal:0,source:'direct',lineage:[]};
 assert.throws(()=>ledger.execute(id,'f',0,100,()=>Promise.reject(new Error('background rejected'))),/async_damage_operation_not_supported/);
 assert.deepEqual(ledger.reserve(id,'f',1,100),{kind:'duplicate',status:'uncertain'});
 let changes=0;function* deferred(){changes++;yield 1;}const iterId={...id,occurrence:2};
 assert.deepEqual(ledger.execute(iterId,'f',0,100,deferred),{kind:'invalid'});
 assert.throws(()=>ledger.execute(iterId,'f',0,100,()=>deferred()),/iterator_damage_operation_not_supported/);
 assert.deepEqual(ledger.reserve(iterId,'f',1,100),{kind:'duplicate',status:'uncertain'});
 setTimeout(()=>{assert.equal(changes,0);console.log('observed');},50);`;
 const output=execFileSync(process.execPath,['--unhandled-rejections=strict','--import',pathToFileURL(loader).href,'-e',script],{cwd:process.cwd(),encoding:'utf8',timeout:10000});
 assert.match(output,/observed/);
});

test('first-seen child source and every nested source transition must be coherent',()=>{
 const l=new DamageEventLedger(4),counter=childDamageEvent(event(),'counter','monster-1',0),nested=childDamageEvent(counter,'intercept','guard-1',0);
 const wrongOutput={...counter,source:'transfer' as const};
 assert.equal(l.reserve(wrongOutput,'f',0,100).kind,'invalid');assert.equal(l.size,0);
 const wrongTransition={...nested,lineage:[nested.lineage[0],{...nested.lineage[1],parentSource:'transfer' as const}]};
 assert.equal(l.reserve(wrongTransition,'f',0,100).kind,'invalid');assert.equal(l.size,0);
 assert.equal(l.reserve(nested,'f',0,100).kind,'reserved');
});

test('a lazy synchronous iterable is rejected without being advanced',()=>{
 const l=new DamageEventLedger(3),id=event();let changes=0;
 const lazy={*[Symbol.iterator](){changes++;yield 1;}};
 assert.throws(()=>exec(l,id,()=>lazy),/iterator_damage_operation_not_supported/);
 assert.equal(changes,0);assert.deepEqual(l.reserve(id,'attack=8',1,100),{kind:'duplicate',status:'uncertain'});
 assert.throws(()=>exec(l,event({occurrence:2}),()=>[1,2]),/iterator_damage_operation_not_supported/);
 assert.deepEqual(exec(l,event({occurrence:3}),()=>'scalar'),{kind:'completed',value:'scalar'});
});
