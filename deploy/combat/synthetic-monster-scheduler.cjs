/* Deliberately standalone scheduling experiment. This one-dimensional model is
 * not MyRoom, does not invoke production rules, and makes no 50 ms interpolation
 * claim. Coordinates, HP, attack rules and event budgets below are test data. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const MAX_MONSTERS=4;
function world(limit=64){return {tick:0,hero:{x:0,hp:100},actors:new Map(),trap:null,log:[],limit,failed:false};}
function reserve(w,n){if(w.failed)return false;if(w.log.length+n>w.limit){w.failed=true;return false;}return true;}
function append(w,e){w.log.push(Object.freeze({order:w.log.length+1,tick:w.tick,...e}));}
function spawn(w,id,x,hp){if(w.failed||w.actors.has(id)||w.actors.size>=MAX_MONSTERS||!reserve(w,1))return false;w.actors.set(id,{id,x,hp,generation:1,lastSeq:0});append(w,{kind:'spawn',id,x,generation:1});return true;}
function transition(w,id,kind,x,hp){
 const actor=w.actors.get(id);if(!actor||!['teleport','respawn'].includes(kind)||!reserve(w,1))return false;
 if(kind==='respawn' && actor.hp>0)return false;
 actor.x=x;actor.generation++;if(kind==='respawn')actor.hp=hp;
 append(w,{kind,id,x,generation:actor.generation});return true;
}
function place(w,id,center,radius,armTick,expiryTick){
 if(w.failed||w.trap||armTick>=expiryTick||!reserve(w,1))return false;
 w.trap={id,center,radius,armTick,expiryTick};append(w,{kind:'placed',id,center,radius,armTick,expiryTick});return true;
}
function expireAtBoundary(w,tick){
 if(w.failed||!Number.isSafeInteger(tick)||tick<w.tick)return false;
 if(w.trap && tick>=w.trap.expiryTick){if(!reserve(w,1))return false;w.tick=tick;append(w,{kind:'expired',id:w.trap.id});w.trap=null;return true;}
 w.tick=tick;return true;
}
function crosses(from,to,trap){return Math.abs(from-trap.center)>trap.radius && Math.min(from,to)<=trap.center+trap.radius && Math.max(from,to)>=trap.center-trap.radius;}
function turn(w,{id,generation,seq,to,attack=false}){
 const a=w.actors.get(id);if(w.failed||!a||a.hp<=0||generation!==a.generation||!Number.isSafeInteger(seq)||seq<=a.lastSeq||!Number.isFinite(to))return false;
 // This model validates and reserves a complete turn before committing anything.
 // Production would require trusted, authoritative step events and equivalent
 // transactional boundaries; no such contract is claimed here.
 const moving=a.x!==to,trap=w.trap;
 const triggers=Boolean(moving&&trap&&w.tick>=trap.armTick&&w.tick<trap.expiryTick&&crosses(a.x,to,trap));
 const candidates=triggers?[...w.actors.values()].filter(b=>b.id!==id&&b.hp>0&&Math.abs(b.x-trap.center)<=trap.radius)
   .sort((l,r)=>Math.abs(l.x-trap.center)-Math.abs(r.x-trap.center)||(l.id<r.id?-1:l.id>r.id?1:0)).slice(0,2):[];
 const selected=triggers?[a,...candidates]:[];
 const actorAfter=triggers?Math.max(0,a.hp-20):a.hp;
 const strikes=attack&&actorAfter>0&&w.hero.hp>0&&Math.abs(to-w.hero.x)<=1;
 const needed=(moving?1:0)+(triggers?1+selected.length:0)+(strikes?1:0);
 if(!reserve(w,needed))return false;
 const before=a.x;if(moving){a.x=to;append(w,{kind:'move',id,from:before,to});}
 if(triggers){w.trap=null;append(w,{kind:'trigger',id:trap.id,by:id,targets:selected.map(v=>v.id)});
  for(const victim of selected){victim.hp=Math.max(0,victim.hp-20);append(w,{kind:'damage',id:victim.id,hp:victim.hp});}}
 if(strikes){w.hero.hp=Math.max(0,w.hero.hp-10);append(w,{kind:'attack',id,target:'hero',hp:w.hero.hp});}
 a.lastSeq=seq;return true;
}
/** One turn per actor per batch. Reject ambiguous duplicate identities before
 * applying any action, irrespective of sequence or generation; no partial batch. */
function runSorted(w,actions){
 if(w.failed)return false;
 if(!Array.isArray(actions)||actions.length>MAX_MONSTERS){w.failed=true;return false;}
 const ids=new Set();
 for(const action of actions){
  if(!action||typeof action.id!=='string'||!action.id||ids.has(action.id)){w.failed=true;return false;}
  ids.add(action.id);
 }
 for(const action of [...actions].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)){turn(w,action);if(w.failed)return false;}
 return true;
}
function kinds(w){return w.log.map(e=>e.kind);}

test('lethal crossing commits before and suppresses that monster’s later attack',()=>{
 const w=world();spawn(w,'a',-2,15);place(w,'trap',0,1,1,5);expireAtBoundary(w,1);
 assert.equal(turn(w,{id:'a',generation:1,seq:1,to:0,attack:true}),true);
 assert.equal(w.actors.get('a').hp,0);assert.equal(w.hero.hp,100);assert.deepEqual(kinds(w),['spawn','placed','move','trigger','damage']);
});
test('multi-entity order is stable and effects feed into a later actor turn',()=>{
 function sample(actions){const w=world();spawn(w,'a',-2,100);spawn(w,'b',.5,10);place(w,'trap',0,1,1,5);expireAtBoundary(w,1);runSorted(w,actions);return w;}
 const a={id:'a',generation:1,seq:1,to:0,attack:true},b={id:'b',generation:1,seq:1,to:0,attack:true};
 const x=sample([a,b]),y=sample([b,a]);assert.deepEqual(x.log,y.log);assert.equal(x.actors.get('b').hp,0);
 assert.equal(x.log.filter(e=>e.kind==='attack'&&e.id==='b').length,0);assert.equal(x.log.filter(e=>e.kind==='trigger').length,1);
});
test('triggering actor plus two nearest eligible actors are chosen deterministically',()=>{
 const w=world();spawn(w,'a',-2,100);spawn(w,'c',.5,100);spawn(w,'b',-.5,100);spawn(w,'d',.9,100);place(w,'trap',0,1,1,5);expireAtBoundary(w,1);
 turn(w,{id:'a',generation:1,seq:1,to:2});assert.deepEqual(w.log.find(e=>e.kind==='trigger').targets,['a','b','c']);assert.equal(w.actors.get('d').hp,100);
});
test('inside at arming does not trigger until leaving then re-entering',()=>{
 const w=world();spawn(w,'a',0,100);place(w,'trap',0,1,1,5);expireAtBoundary(w,1);
 turn(w,{id:'a',generation:1,seq:1,to:2});assert.ok(w.trap);turn(w,{id:'a',generation:1,seq:2,to:0});assert.equal(w.trap,null);assert.equal(w.actors.get('a').hp,80);
});
test('tick-boundary expiry precedes any action at the expiry tick',()=>{
 const w=world();spawn(w,'a',-2,100);place(w,'trap',0,1,1,5);expireAtBoundary(w,5);
 turn(w,{id:'a',generation:1,seq:1,to:0});assert.equal(w.actors.get('a').hp,100);assert.deepEqual(kinds(w),['spawn','placed','expired','move']);
});
test('spawn, teleport and respawn are discontinuities; stale generation and replay fail',()=>{
 const w=world();place(w,'trap',0,1,1,10);expireAtBoundary(w,1);spawn(w,'a',-2,100);transition(w,'a','teleport',0);
 assert.ok(w.trap);assert.equal(turn(w,{id:'a',generation:1,seq:1,to:2}),false);assert.equal(turn(w,{id:'a',generation:2,seq:1,to:2}),true);
 assert.equal(turn(w,{id:'a',generation:2,seq:1,to:0}),false);assert.ok(w.trap);turn(w,{id:'a',generation:2,seq:2,to:0});assert.equal(w.trap,null);
 const a=w.actors.get('a');a.hp=0;assert.equal(transition(w,'a','respawn',-2,100),true);assert.equal(turn(w,{id:'a',generation:2,seq:3,to:0}),false);assert.equal(a.generation,3);
});
test('event overflow stops before the turn mutates state; earlier committed events remain',()=>{
 const w=world(4);spawn(w,'a',-2,100);place(w,'trap',0,1,1,5);expireAtBoundary(w,1);const before=structuredClone({actor:w.actors.get('a'),trap:w.trap,hero:w.hero,log:w.log});
 assert.equal(turn(w,{id:'a',generation:1,seq:1,to:0,attack:true}),false);assert.equal(w.failed,true);
 assert.deepEqual({actor:w.actors.get('a'),trap:w.trap,hero:w.hero,log:w.log},before);assert.equal(turn(w,{id:'a',generation:1,seq:2,to:0}),false);
});
test('capacity failure also fails closed for spawn and expiry without silent eviction',()=>{
 const w=world(1);place(w,'trap',0,1,1,5);assert.equal(spawn(w,'a',0,100),false);assert.equal(w.failed,true);assert.equal(w.trap.id,'trap');assert.equal(w.actors.size,0);
 const v=world(1);place(v,'trap',0,1,1,5);assert.equal(expireAtBoundary(v,5),false);assert.equal(v.failed,true);assert.equal(v.trap.id,'trap');assert.equal(v.tick,0);
});
test('a pre-arm entry does not trigger and remains inside until the actor exits',()=>{
 const w=world();spawn(w,'a',-2,100);place(w,'trap',0,1,1,5);
 turn(w,{id:'a',generation:1,seq:1,to:0});assert.ok(w.trap);assert.equal(w.actors.get('a').hp,100);
 expireAtBoundary(w,1);turn(w,{id:'a',generation:1,seq:2,to:2});assert.ok(w.trap);
 turn(w,{id:'a',generation:1,seq:3,to:0});assert.equal(w.trap,null);assert.equal(w.actors.get('a').hp,80);
});

test('duplicate actor identities fail an entire batch before mutation, in every input order',()=>{
 const a1={id:'a',generation:1,seq:1,to:0,attack:true},a2={id:'a',generation:1,seq:2,to:2},b={id:'b',generation:1,seq:1,to:0,attack:true};
 for(const actions of [[a1,a2,b],[b,a2,a1],[a2,b,a1],[a1,b,a1],[a1,b,{...a2,generation:2}]]){
  const w=world();spawn(w,'a',-2,100);spawn(w,'b',-3,100);place(w,'trap',0,1,1,5);expireAtBoundary(w,1);
  const before=structuredClone({actors:[...w.actors],trap:w.trap,hero:w.hero,log:w.log});
  assert.equal(runSorted(w,actions),false);assert.equal(w.failed,true);
  assert.deepEqual({actors:[...w.actors],trap:w.trap,hero:w.hero,log:w.log},before);
 }
});
