import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAshTrap,createRescueTalisman,observeTrapBatch,observeRescue,expirePrototype,clearPrototype,selectTrapTargets} from './OccultPrototypeRules.js';
const trapInput={castId:'c1',ownerId:'seer',mapId:'map',position:{x:0,y:0,z:0},now:1000,armDelayMs:1000,durationMs:5000,radius:3};
const talismanInput={castId:'c2',ownerId:'mender',targetId:'ally',mapId:'map',now:1000,durationMs:5000,healFraction:.17};
const crossing={now:2100,previousAt:2000,monsterId:'monster',mapId:'map',previous:{x:4,y:0,z:0},current:{x:3,y:0,z:0},eligible:true,ownerValid:true};
const observeTrap=(state:Parameters<typeof observeTrapBatch>[0], input:typeof crossing)=> { const {now,ownerValid,...movement}=input; return observeTrapBatch(state,{now,ownerValid,movements:[movement]}); };
const rescue={now:2000,targetId:'ally',mapId:'map',alive:true,eligible:true,ownerValid:true,hp:30,maxHp:100};

test('creation validates bounded configuration, refuses replacement and copies location',()=>{
 const trap=createAshTrap(null,trapInput)!; const talisman=createRescueTalisman(null,talismanInput)!;
 assert.equal(createAshTrap(trap,trapInput),null); assert.equal(createRescueTalisman(talisman,talismanInput),null);
 assert.equal(createAshTrap(null,{...trapInput,radius:Infinity}),null);
 assert.equal(createAshTrap(null,{...trapInput,durationMs:1000}),null);
 assert.equal(createRescueTalisman(null,{...talismanInput,healFraction:NaN}),null);
 assert.equal(createRescueTalisman(null,{...talismanInput,healFraction:1.1}),null);
 assert.notEqual(trap.position,trapInput.position);
});
test('trap requires post-arming eligible entry in its map and triggers once',()=>{
 const trap=createAshTrap(null,trapInput)!;
 for(const delta of [{mapId:'elsewhere'},{eligible:false},{ownerValid:false},{current:{x:0,y:5,z:0}},{previous:{x:2,y:0,z:0}},{monsterId:''}])
   assert.equal(observeTrap(trap,{...crossing,...delta}).event,null);
 const result=observeTrap(trap,crossing); assert.equal(result.event?.type,'trap_triggered'); assert.equal(result.state,null);
 assert.equal(observeTrap(result.state,crossing).event,null);
});
test('trap detects swept 3D crossings, including a tangent, but not a near miss',()=>{
 const trap=createAshTrap(null,trapInput)!;
 const through={...crossing,previous:{x:-4,y:0,z:0},current:{x:4,y:0,z:0}};
 const result=observeTrap(trap,through);
 assert.equal(result.event?.type,'trap_triggered');
 assert.equal(observeTrap(result.state,through).event,null);
 assert.equal(observeTrap(trap,{...through,mapId:'other'}).event,null);
 assert.equal(observeTrap(trap,{...through,previous:{x:-4,y:3,z:0},current:{x:4,y:3,z:0}}).event?.type,'trap_triggered');
 assert.equal(observeTrap(trap,{...through,previous:{x:-4,y:3.01,z:0},current:{x:4,y:3.01,z:0}}).event,null);
 assert.equal(observeTrap(trap,{...through,previous:{x:-4,y:0,z:0},current:{x:-3.1,y:0,z:0}}).event,null);
 assert.equal(observeTrap(trap,{...through,previous:{x:0,y:0,z:0},current:{x:4,y:0,z:0}}).event,null);
 assert.equal(observeTrap(trap,{...through,previousAt:1900}).event,null); // already inside at arming
 // A monster present when armed must leave before a later, post-arm return counts.
 assert.equal(observeTrap(trap,{...through,previous:{x:0,y:0,z:0},current:{x:4,y:0,z:0}}).event,null);
 assert.equal(observeTrap(trap,{...through,previous:{x:4,y:0,z:0},current:{x:0,y:0,z:0}}).event?.type,'trap_triggered');
});
test('movement spanning arming is clipped and boundary contact at arming does not trigger',()=>{
 const trap=createAshTrap(null,trapInput)!;
 const step={...crossing,previousAt:1900,now:2100};
 // At 2000 the interpolated x is outside, on the boundary, then inside, respectively.
 assert.equal(observeTrap(trap,{...step,previous:{x:5,y:0,z:0},current:{x:2,y:0,z:0}}).event?.type,'trap_triggered');
 assert.equal(observeTrap(trap,{...step,previous:{x:4,y:0,z:0},current:{x:2,y:0,z:0}}).event,null);
 assert.equal(observeTrap(trap,{...step,previous:{x:3.5,y:0,z:0},current:{x:1,y:0,z:0}}).event,null);
 assert.equal(observeTrap(trap,{...step,now:2000,previous:{x:4,y:0,z:0},current:{x:3,y:0,z:0}}).event,null);
 assert.equal(observeTrap(trap,{...step,previous:{x:5,y:0,z:0},current:{x:2,y:0,z:0},mapId:'other'}).event,null);
});
test('pre-expiry segment crossings beat expiry, but exact or later contact expires',()=>{
 const trap=createAshTrap(null,trapInput)!;
 const step={...crossing,previousAt:5998,now:6000,previous:{x:4,y:0,z:0}};
 assert.equal(observeTrap(trap,{...step,current:{x:2,y:0,z:0}}).event?.type,'trap_triggered');
 assert.equal(observeTrap(trap,{...step,current:{x:3,y:0,z:0}}).event?.type,'expired');
 assert.equal(observeTrap(trap,{...step,now:6002,current:{x:2,y:0,z:0}}).event?.type,'expired');
 assert.equal(observeTrap(trap,{...step,previousAt:6000,now:6001,current:{x:2,y:0,z:0}}).event?.type,'expired');
});
test('same-tick batch chooses earliest entry before expiry, regardless of sample order',()=>{
 const trap=createAshTrap(null,trapInput)!;
 const miss={previousAt:5998,monsterId:'miss',mapId:'map',previous:{x:5,y:0,z:0},current:{x:4,y:0,z:0},eligible:true};
 const hit={...miss,monsterId:'hit',previous:{x:4,y:0,z:0},current:{x:2,y:0,z:0}};
 const late={...hit,monsterId:'late',previous:{x:4,y:0,z:0},current:{x:2.5,y:0,z:0}};
 for(const movements of [[miss,late,hit],[hit,miss,late],[late,hit,miss]]) {
   const result=observeTrapBatch(trap,{now:6000,ownerValid:true,movements});
   assert.equal(result.event?.type,'trap_triggered');
   if(result.event?.type==='trap_triggered') assert.equal(result.event.targetId,'hit');
   assert.equal(observeTrapBatch(result.state,{now:6000,ownerValid:true,movements}).event,null);
 }
 const tie={...hit,monsterId:'aaa'};
 for(const movements of [[hit,tie],[tie,hit]]) {
   const event=observeTrapBatch(trap,{now:6000,ownerValid:true,movements}).event;
   if(event?.type==='trap_triggered') assert.equal(event.targetId,'aaa'); else assert.fail();
 }
 assert.equal(observeTrapBatch(trap,{now:6000,ownerValid:true,movements:[miss,{...hit,mapId:'other'}]}).event?.type,'expired');
 assert.equal(observeTrapBatch(trap,{now:6000,ownerValid:true,movements:[hit,hit]}).event?.type,'expired');
 assert.equal(observeTrapBatch(trap,{now:6000,ownerValid:true,movements:[hit,{...hit,monsterId:''}]}).event?.type,'expired');
 assert.equal(observeTrapBatch(trap,{now:6000,ownerValid:true,movements:Array.from({length:1025},(_,i)=>({...hit,monsterId:String(i)}))}).event?.type,'expired');
});
test('trap event preserves copied geometry and selects a bounded deterministic set',()=>{
 const trap=createAshTrap(null,trapInput)!;
 const triggered=observeTrap(trap,{...crossing,previous:{x:-4,y:0,z:0},current:{x:4,y:0,z:0}}).event;
 if(triggered?.type!=='trap_triggered') assert.fail();
 assert.equal(triggered.radius,3); assert.equal(triggered.targetCap,3); assert.notEqual(triggered.center,trap.position);
 assert.ok(Object.isFrozen(triggered)); assert.ok(Object.isFrozen(triggered.center));
 (trap.position as {x:number}).x=100; assert.equal(triggered.center.x,0);
 const candidates=[
  {id:'monster',mapId:'map',alive:true,position:{x:4,y:0,z:0}},
  {id:'z',mapId:'map',alive:true,position:{x:1,y:0,z:0}},
  {id:'a',mapId:'map',alive:true,position:{x:-1,y:0,z:0}},
  {id:'close-blocked',mapId:'map',alive:true,position:{x:0,y:0,z:0}},
  {id:'wrong-map',mapId:'other',alive:true,position:{x:0,y:0,z:0}},
  {id:'dead',mapId:'map',alive:false,position:{x:0,y:0,z:0}},
  {id:'far',mapId:'map',alive:true,position:{x:4,y:0,z:0}},
 ];
 const canHit=(candidate:{id:string})=>candidate.id!=='close-blocked';
 assert.deepEqual(selectTrapTargets(triggered,candidates,canHit),['monster','a','z']);
 assert.deepEqual(selectTrapTargets(triggered,[...candidates].reverse(),canHit),['monster','a','z']);
 assert.deepEqual(selectTrapTargets(triggered,candidates,candidate=>candidate.id!=='monster'),[]);
 assert.deepEqual(selectTrapTargets(triggered,[...candidates,candidates[0]],canHit),[]);
});
test('rescue is single use, bounded, needs living authorized same-map target',()=>{
 const talisman=createRescueTalisman(null,talismanInput)!;
 for(const delta of [{targetId:'other'},{mapId:'elsewhere'},{eligible:false},{ownerValid:false},{alive:false},{hp:0},{hp:40},{hp:NaN},{maxHp:0}])
   assert.equal(observeRescue(talisman,{...rescue,...delta}).event,null);
 const result=observeRescue(talisman,rescue); assert.equal(result.event?.type,'rescue_triggered');
 if(result.event?.type==='rescue_triggered') assert.equal(result.event.amount,17);
 assert.equal(result.state,null); assert.equal(observeRescue(result.state,rescue).event,null);
 const bounded=createRescueTalisman(null,{...talismanInput,healFraction:1})!;
 const capped=observeRescue(bounded,{...rescue,hp:39});
 if(capped.event?.type==='rescue_triggered') assert.equal(capped.event.amount,61); else assert.fail();
});
test('expiry wins at boundary and heals an eligible living target only once',()=>{
 const trap=createAshTrap(null,trapInput)!, talisman=createRescueTalisman(null,talismanInput)!;
 assert.equal(expirePrototype(trap,5999).event,null);
 for(const state of [trap,talisman]) { const expired=expirePrototype(state,6000); assert.equal(expired.event?.type,'expired'); assert.equal(expired.state,null); assert.equal(expirePrototype(expired.state,6000).event,null); }
 assert.equal(observeTrap(trap,{...crossing,now:6000}).event?.type,'expired');
 const expiry=observeRescue(talisman,{...rescue,now:6000}); assert.equal(expiry.event?.type,'rescue_expired');
 if(expiry.event?.type==='rescue_expired') assert.equal(expiry.event.amount,6);
 assert.equal(observeRescue(expiry.state,{...rescue,now:6000}).event,null);
 for(const delta of [{alive:false},{eligible:false},{ownerValid:false},{hp:0},{hp:100},{mapId:'elsewhere'},{targetId:'other'}])
   assert.equal(observeRescue(talisman,{...rescue,...delta,now:6000}).event?.type,'expired');
});
test('owner and target lifecycle cleanup is silent and idempotent',()=>{
 const trap=createAshTrap(null,trapInput)!, talisman=createRescueTalisman(null,talismanInput)!;
 assert.equal(clearPrototype(trap,'seer'),null); assert.equal(clearPrototype(talisman,'mender'),null); assert.equal(clearPrototype(talisman,'ally'),null);
 assert.equal(clearPrototype(talisman,'unrelated'),talisman); assert.equal(clearPrototype(null,'ally'),null);
});
