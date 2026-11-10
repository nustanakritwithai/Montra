/** Test-only synthetic model, not imported by MyRoom or gameplay.
 * The two-child bound is an assumption for this model, not a proven combat bound. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DamageEventLedger,childDamageEvent,type DamageEventIdentity} from './DamageEventLedger.js';

type Scenario={victimHp?:number;counter?:boolean;intercept?:boolean;allyHp?:number;guard?:boolean;interrupt?:boolean;debuff?:boolean};
type State={victimHp:number;victimAlive:boolean;victimHitSeq:number;monsterHp:number;monsterAlive:boolean;allyHp:number;allyAlive:boolean;allyHitSeq:number;cooldown:number;combatAt:number;debuffConsumed:boolean;windupActive:boolean;steps:string[];events:string[]};
type Status='ready'|'executing'|'completed'|'uncertain';
type RecordEntry={status:Status;parent:DamageEventIdentity;children:DamageEventIdentity[];tickets:symbol[];until:number;scenario:Scenario};
type Delivery={kind:'applied'|'duplicate'|'uncertain'|'stale'};
const initial=(s:Scenario):State=>({victimHp:s.victimHp??100,victimAlive:true,victimHitSeq:0,monsterHp:s.counter?1:100,monsterAlive:true,allyHp:s.allyHp??100,allyAlive:true,allyHitSeq:0,cooldown:-1,combatAt:-1,debuffConsumed:false,windupActive:!!s.interrupt,steps:[],events:[]});

/** Producer controls the only delivery handle. Retire is legal only after its
 * owner proves no deferred work or callback can survive closure. */
class SyntheticProducer {
 readonly ledger:DamageEventLedger;readonly state:State;
 private sequence=0;private readonly pending=new Map<symbol,RecordEntry>();
 constructor(capacity:number,scenario:Scenario){this.ledger=new DamageEventLedger(capacity);this.state=initial(scenario);}
 start(scenario:Scenario,now=0):symbol|undefined {
  if(this.pending.size || this.ledger.capacity-this.ledger.size<3)return;
  const parent:DamageEventIdentity={roomEpoch:'synthetic-room',producerId:'default-monster',occurrence:++this.sequence,targetId:'victim',hitOrdinal:0,source:'direct',lineage:[]};
  const children=[childDamageEvent(parent,'counter','default-monster',0),childDamageEvent(parent,'intercept','ally',0)];
  const identities=[parent,...children],tickets:symbol[]=[],until=now+100;
  // No asynchronous yield exists between this check and all three reservations.
  for(const id of identities){const r=this.ledger.reserve(id,'immutable-synthetic-hit',now,until);if(r.kind!=='reserved')throw Error('unexpected_preflight_reservation_failure');tickets.push(r.ticket);}
  const delivery=Symbol('producer-owned-delivery');this.pending.set(delivery,{status:'ready',parent,children,tickets,until,scenario:{...scenario}});return delivery;
 }
 deliver(delivery:symbol,now:number,hook?:(step:string)=>void):Delivery {
  const entry=this.pending.get(delivery);if(!entry)return {kind:'stale'};
  if(entry.status==='uncertain')return {kind:'uncertain'};
  if(entry.status!=='ready'){
   const seen=this.ledger.reserve(entry.parent,'immutable-synthetic-hit',now,Math.max(now,entry.until));
   if(seen.kind!=='duplicate')throw Error('lost_duplicate_reservation');
   entry.until=Math.max(now,entry.until);return {kind:'duplicate'};
  }
  entry.status='executing';const s=entry.scenario,p=this.state;
  const effect=(name:string,apply:()=>void)=>{p.steps.push(name);apply();hook?.(name);};
  const emit=(name:string)=>effect(name,()=>{p.events.push(name);});
  try{
   effect('cooldown',()=>{p.cooldown=now;});effect('combat',()=>{p.combatAt=now;});let damage=8;effect('debuff_check',()=>{if(s.debuff){p.debuffConsumed=true;damage=Math.max(1,Math.round(damage*.75));}});
   if(s.interrupt){effect('interrupt',()=>{p.windupActive=false;});emit('blade_windup');}
   if(s.counter){
    effect('counter_damage',()=>{p.monsterHp=0;});emit('combat_hit');effect('monster_dead',()=>{p.monsterAlive=false;});emit('reward_attempt');emit('sword_core_counter');
    this.ledger.complete(entry.tickets[1]);damage=Math.max(1,Math.round(damage*.7));
   }else if(s.guard){damage=Math.max(1,Math.round(damage*.5));emit('sword_guarded');}
   if(s.intercept){
    const shared=Math.min(damage-1,Math.floor(damage*.5));
    effect('intercept_damage',()=>{p.allyHp=Math.max(0,p.allyHp-shared);p.allyHitSeq++;});emit('sentinel_intercept');
    if(p.allyHp===0){effect('ally_down',()=>{p.allyAlive=false;});emit('player_down:ally');}
    this.ledger.complete(entry.tickets[2]);damage-=shared;
   }
   effect('cloak',()=>{});effect('victim_damage',()=>{p.victimHp=Math.max(0,p.victimHp-damage);p.victimHitSeq++;});emit('monster_hit');
   if(p.victimHp===0){effect('victim_down',()=>{p.victimAlive=false;});emit('player_down:victim');}
   this.ledger.complete(entry.tickets[1]);this.ledger.complete(entry.tickets[2]);this.ledger.complete(entry.tickets[0]);entry.status='completed';return {kind:'applied'};
  }catch(error){for(const ticket of entry.tickets)this.ledger.markUncertain(ticket);entry.status='uncertain';throw error;}
 }
 close(delivery:symbol,now:number,occurrenceClosed:boolean):boolean{
  const entry=this.pending.get(delivery);if(!entry || !occurrenceClosed || now<entry.until || entry.status==='ready' || entry.status==='executing')return false;
  for(const id of [entry.parent,...entry.children])if(!this.ledger.retire(id,'immutable-synthetic-hit',now,true))throw Error('incomplete_retirement');
  this.pending.delete(delivery);return true;
 }
}

/** Manually specified expectations informed by separate room characterization.
 * No differential comparison to real-room traces occurs and no parity is established. */
const cases:Array<{name:string;s:Scenario;victim:number;monster:number;ally:number;events:string[];steps:string[]}>= [
 {name:'normal',s:{},victim:92,monster:100,ally:100,events:['monster_hit'],steps:['cooldown','combat','debuff_check','cloak','victim_damage','monster_hit']},
 {name:'experimental debuff consumed once',s:{debuff:true},victim:94,monster:100,ally:100,events:['monster_hit'],steps:['cooldown','combat','debuff_check','cloak','victim_damage','monster_hit']},
 {name:'lethal victim',s:{victimHp:5},victim:0,monster:100,ally:100,events:['monster_hit','player_down:victim'],steps:['cooldown','combat','debuff_check','cloak','victim_damage','monster_hit','victim_down','player_down:victim']},
 {name:'guard and interrupt',s:{guard:true,interrupt:true},victim:96,monster:100,ally:100,events:['blade_windup','sword_guarded','monster_hit'],steps:['cooldown','combat','debuff_check','interrupt','blade_windup','sword_guarded','cloak','victim_damage','monster_hit']},
 {name:'counter kills monster before hit',s:{counter:true},victim:94,monster:0,ally:100,events:['combat_hit','reward_attempt','sword_core_counter','monster_hit'],steps:['cooldown','combat','debuff_check','counter_damage','combat_hit','monster_dead','reward_attempt','sword_core_counter','cloak','victim_damage','monster_hit']},
 {name:'interception before primary hit',s:{intercept:true},victim:96,monster:100,ally:96,events:['sentinel_intercept','monster_hit'],steps:['cooldown','combat','debuff_check','intercept_damage','sentinel_intercept','cloak','victim_damage','monster_hit']},
 {name:'counter and lethal interception',s:{counter:true,intercept:true,allyHp:2},victim:97,monster:0,ally:0,events:['combat_hit','reward_attempt','sword_core_counter','sentinel_intercept','player_down:ally','monster_hit'],steps:['cooldown','combat','debuff_check','counter_damage','combat_hit','monster_dead','reward_attempt','sword_core_counter','intercept_damage','sentinel_intercept','ally_down','player_down:ally','cloak','victim_damage','monster_hit']},
];
for(const c of cases)test(`synthetic expectation: ${c.name}`,()=>{
 const p=new SyntheticProducer(3,c.s),delivery=p.start(c.s);assert.ok(delivery);assert.equal(p.ledger.size,3);assert.deepEqual(p.state.steps,[]);
 assert.deepEqual(p.deliver(delivery,0),{kind:'applied'});assert.deepEqual(p.state.events,c.events);assert.deepEqual(p.state.steps,c.steps);
 assert.equal(p.state.victimHp,c.victim);assert.equal(p.state.monsterHp,c.monster);assert.equal(p.state.allyHp,c.ally);
 assert.equal(p.state.victimHitSeq,1);assert.equal(p.state.allyHitSeq,c.s.intercept?1:0);assert.equal(p.state.windupActive,false);assert.equal(p.state.debuffConsumed,!!c.s.debuff);
 const snapshot=structuredClone(p.state);assert.deepEqual(p.deliver(delivery,1000),{kind:'duplicate'});assert.deepEqual(p.state,snapshot);
 assert.equal(p.close(delivery,1000,false),false);assert.equal(p.close(delivery,1000,true),true);assert.equal(p.ledger.size,0);
 assert.deepEqual(p.deliver(delivery,1001),{kind:'stale'});assert.deepEqual(p.state,snapshot);
});
test('reentrant delivery cannot repeat parent or child side effects',()=>{
 const s={counter:true,intercept:true},p=new SyntheticProducer(3,s),delivery=p.start(s);assert.ok(delivery);let attempts=0;
 assert.deepEqual(p.deliver(delivery,0,step=>{if(step==='counter_damage' || step==='intercept_damage'){attempts++;assert.deepEqual(p.deliver(delivery,0),{kind:'duplicate'});}}),{kind:'applied'});
 assert.equal(attempts,2);assert.equal(p.state.events.filter(e=>e==='combat_hit').length,1);assert.equal(p.state.events.filter(e=>e==='sentinel_intercept').length,1);assert.equal(p.state.victimHitSeq,1);
});
test('insufficient full parent-plus-child capacity fails before any effects',()=>{
 const s={counter:true,intercept:true},p=new SyntheticProducer(2,s),snapshot=structuredClone(p.state);
 assert.equal(p.start(s),undefined);assert.equal(p.ledger.size,0);assert.deepEqual(p.state,snapshot);
});
test('exception after partial effect is uncertain; no retry until proven safe closure',()=>{
 const s={counter:true},p=new SyntheticProducer(3,s),delivery=p.start(s);assert.ok(delivery);
 assert.throws(()=>p.deliver(delivery,0,step=>{if(step==='counter_damage')throw Error('partial');}),/partial/);
 const snapshot=structuredClone(p.state);assert.deepEqual(p.deliver(delivery,1),{kind:'uncertain'});assert.deepEqual(p.state,snapshot);
 assert.equal(p.close(delivery,100,false),false);assert.deepEqual(p.deliver(delivery,101),{kind:'uncertain'});
 assert.equal(p.close(delivery,101,true),true);assert.deepEqual(p.deliver(delivery,102),{kind:'stale'});assert.deepEqual(p.state,snapshot);
});
test('closed delivery stays stale while a new occurrence proceeds',()=>{
 const s={},p=new SyntheticProducer(3,s),first=p.start(s);assert.ok(first);
 assert.deepEqual(p.deliver(first,0,step=>{if(step==='cooldown')assert.equal(p.close(first,100,true),false,'in-flight work cannot close');}),{kind:'applied'});
 assert.equal(p.close(first,99,true),false,'retry window remains open');assert.equal(p.close(first,100,true),true);
 const second=p.start(s,101);assert.ok(second);assert.notEqual(second,first);
 assert.deepEqual(p.deliver(first,101),{kind:'stale'});assert.equal(p.state.victimHp,92);
 assert.deepEqual(p.deliver(second,101),{kind:'applied'});assert.equal(p.state.victimHp,84);assert.equal(p.state.victimHitSeq,2);
});
