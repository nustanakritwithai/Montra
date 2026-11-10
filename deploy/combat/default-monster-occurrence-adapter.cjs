/* Test-only adapter and real-method differential tests. No MyRoom edits, live
 * server, persistent users, or deployment. The three-slot parent/counter/
 * interception bound is an assumption for these fixtures, not a game-wide proof. */
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'../..'),staged=path.join(root,'combat-verify/src/rooms');
// The imported room can never point at an existing character store.
const sandbox=fs.mkdtempSync(path.join(os.tmpdir(),'montra-damage-adapter-'));
process.env.NODE_ENV='test';process.env.MONTRA_CHARACTER_DIR=path.join(sandbox,'characters');
process.env.MONTRA_ECONOMY_ENABLED='0';process.env.MONTRA_HUNT_EVENTS='0';process.env.MONTRA_DIRECTOR_PERSIST='0';
process.env.MONTRA_WORLD_EXPANSION='0';process.env.MONTRA_ISOLATED_STAGING='0';process.env.MONTRA_PROTOTYPE_PROTOCOL_V1='0';
after(()=>fs.rmSync(sandbox,{recursive:true,force:true}));
const ts=require(path.join(root,'combat-verify/node_modules/typescript'));
function assertSourceGraph(){
 // Compare the transitive relative TS import graph, not merely the room file.
 // External packages, non-TS data and reflective/dynamic loads remain outside this check.
 const pending=[path.join(staged,'MyRoom.ts'),path.join(staged,'DamageEventLedger.ts')],seen=new Set();
 while(pending.length){
  const file=pending.pop();if(seen.has(file))continue;seen.add(file);
  const text=fs.readFileSync(file,'utf8'),original=path.join(root,'deploy/combat',path.basename(file));
  assert.equal(text,fs.readFileSync(original,'utf8'),`${path.relative(staged,file)} verification copy must match`);
  for(const imported of ts.preProcessFile(text,true,true).importedFiles){
   if(!imported.fileName.startsWith('.'))continue;
   const resolved=path.resolve(path.dirname(file),imported.fileName.replace(/\.js$/,'.ts'));
   assert.ok(fs.existsSync(resolved),`unresolved local import: ${file} -> ${imported.fileName}`);pending.push(resolved);
  }
 }
 return seen.size;
}
async function modules(){
 assert.ok(assertSourceGraph()>0);
 return {...await import(pathToFileURL(path.join(staged,'MyRoom.ts')).href),...await import(pathToFileURL(path.join(staged,'schema/MyRoomState.ts')).href),...await import(pathToFileURL(path.join(staged,'GameRules.ts')).href),...await import(pathToFileURL(path.join(staged,'DamageEventLedger.ts')).href)};
}
async function fixture(s={}){
 const {MyRoom,Player,RULES,DamageEventLedger,childDamageEvent}=await modules();
 const room=new MyRoom(),victim=new Player({x:-10,y:0,z:0,level:1,def:0,hp:s.victimHp??100,maxHp:100,alive:true,pathId:s.counter?'phutthaisawan':s.sanctuary?'mender':'',facing:0,mapId:'ritual_village'});
 const monster=room.state.monster;Object.assign(monster,{id:RULES.monsterId,x:-10,y:0,z:-1,hp:s.counter?1:100,maxHp:100,defense:0,level:1,alive:true,mapId:victim.mapId});
 room.state.players.set('victim',victim);room.simulatedMs=10000;
 let ally;
 if(s.intercept){
  ally=new Player({x:victim.x,y:0,z:victim.z,level:1,hp:s.allyHp??100,maxHp:100,alive:true,pathId:'sentinel',mapId:victim.mapId});room.state.players.set('ally',ally);
  const invite=room.parties.invite('victim','ally',0);room.parties.accept('ally',invite.id,0);room.sentinelInterceptions.set('victim',{ownerId:'ally',until:11000,fraction:.5});
 }
 if(s.counter){room.inventories.set('victim',{version:1,slots:[{itemId:'arcane_sword',quantity:1}],equippedWeaponSlot:0});room.swordCoreStances.set('victim',{until:11000,rank:0,nextCounter:0});}
 if(s.sanctuary)room.priestSanctuaries.set('victim',{mapId:victim.mapId,x:victim.x,y:victim.y,z:victim.z,radius:5,until:11000});
 if(s.guard)room.swordGuards.set('victim',{until:11000,factor:.5,direction:true,counterUntil:0});
 if(s.interrupt){victim.combatState='attacking';room.bladeWindups.set('victim',{targetId:'unused',until:11000,power:1,ambush:false});}
 const trace=[];let onEvent=()=>{};
 const snapshot=()=>({victimHp:victim.hp,victimAlive:victim.alive,victimHitSeq:victim.hitSeq,victimPkDeaths:victim.pkDeaths,victimPkKills:victim.pkKills,victimExperience:victim.experience,victimCombatState:victim.combatState,victimTargetId:victim.targetId,
  monsterHp:monster.hp,monsterAlive:monster.alive,monsterHitSeq:monster.hitSeq,monsterTargetId:monster.targetId,
  allyHp:ally?.hp??null,allyAlive:ally?.alive??null,allyHitSeq:ally?.hitSeq??null,allyPkDeaths:ally?.pkDeaths??null,allyCombatState:ally?.combatState??null,
  lastAttack:room.lastMonsterAttackMs,lastCombat:room.lastCombatMs.get('victim')??null,allyLastCombat:room.lastCombatMs.get('ally')??null,
  bladeWindup:structuredClone(room.bladeWindups.get('victim')??null),swordGuard:structuredClone(room.swordGuards.get('victim')??null),swordStance:structuredClone(room.swordCoreStances.get('victim')??null),interception:structuredClone(room.sentinelInterceptions.get('victim')??null)});
 const record=(type,data)=>{trace.push({type,data:structuredClone(data),...snapshot()});onEvent(type);};
 room.broadcast=record;room.clients.push({sessionId:'victim',send:record});room.saveCharacter=async id=>{record('save_attempt',{id});};
 const award=room.awardMonsterExperience.bind(room);room.awardMonsterExperience=(winner,...rest)=>{record('reward_attempt',{winner});return award(winner,...rest);};
 return {room,victim,monster,ally,trace,snapshot,DamageEventLedger,childDamageEvent,setHook:fn=>{onEvent=fn;}};
}
/** This adapter owns test-only occurrence contexts. Child wrappers are
 * instrumentation: they invoke the real room methods, preserve their return
 * values and restore methods after each synchronous delivery. */
class OccurrenceAdapter{
 constructor(f,capacity=3){this.f=f;this.ledger=new f.DamageEventLedger(capacity);this.next=0;this.active=new Map();}
 start(now=0){
  if(this.active.size || this.ledger.capacity-this.ledger.size<3)return;
  const parent=Object.freeze({roomEpoch:'synthetic-room',producerId:this.f.monster.id,occurrence:++this.next,targetId:'victim',hitOrdinal:0,source:'direct',lineage:Object.freeze([])});
  const children=[this.f.childDamageEvent(parent,'counter',this.f.monster.id,0),this.f.childDamageEvent(parent,'intercept','ally',0)];
  const until=now+100,tickets=[];
  for(const identity of [parent,...children]){const result=this.ledger.reserve(identity,'synthetic-default-hit',now,until);if(result.kind!=='reserved')throw Error('unexpected_preflight_failure');tickets.push(result.ticket);}
  const token=Symbol('test-only-producer-delivery');this.active.set(token,{parent,children,tickets,until,status:'ready'});return token;
 }
 deliver(token,now){
  const entry=this.active.get(token);if(!entry)return 'stale';if(entry.status==='uncertain')return 'uncertain';
  if(entry.status!=='ready'){
   const duplicate=this.ledger.reserve(entry.parent,'synthetic-default-hit',now,Math.max(now,entry.until));assert.equal(duplicate.kind,'duplicate');entry.until=Math.max(now,entry.until);return 'duplicate';
  }
  entry.status='executing';const room=this.f.room,originalCounter=room.swordCoreHit,originalShare=room.sentinelShareDamage;
  let counterCalls=0,shareCalls=0;
  const child=(index,method,args)=>{
   try{const result=Reflect.apply(method,room,args);this.ledger.complete(entry.tickets[index]);return result;}
   catch(error){this.ledger.markUncertain(entry.tickets[index]);throw error;}
  };
  // Scope deliberately limited to this default-monster/sword-counter fixture.
  room.swordCoreHit=(...args)=>{const expected=entry.children[0].lineage.at(-1).targetId;if(++counterCalls>1 || args[1]!==expected)throw Error('unproven_counter_scope');return child(1,originalCounter,args);};
  room.sentinelShareDamage=(...args)=>{const link=room.sentinelInterceptions.get('victim'),expected=entry.children[1].lineage.at(-1).targetId;if(++shareCalls>1 || (link && link.ownerId!==expected))throw Error('unproven_intercept_scope');return child(2,originalShare,args);};
  try{
   room.monsterAttack('victim',this.f.victim);
   this.ledger.complete(entry.tickets[1]);this.ledger.complete(entry.tickets[2]);this.ledger.complete(entry.tickets[0]);entry.status='completed';return 'delivered';
  }catch(error){for(const ticket of entry.tickets)this.ledger.markUncertain(ticket);entry.status='uncertain';throw error;}
  finally{room.swordCoreHit=originalCounter;room.sentinelShareDamage=originalShare;}
 }
 close(token,now,producerClosed){
  const entry=this.active.get(token);if(!entry || !producerClosed || now<entry.until || entry.status==='ready' || entry.status==='executing')return false;
  for(const identity of [entry.parent,...entry.children])if(!this.ledger.retire(identity,'synthetic-default-hit',now,true))throw Error('unclosed_child');
  this.active.delete(token);return true;
 }
}
for(const [name,scenario] of [
 ['normal',{}],['protected no-op',{sanctuary:true}],['lethal victim',{victimHp:5}],['guard and interruption',{guard:true,interrupt:true}],
 ['counter',{counter:true}],['interception',{intercept:true}],['lethal interception',{intercept:true,allyHp:3}],
 ['counter plus lethal interception',{counter:true,intercept:true,allyHp:2}],
])test(`actual-room differential: ${name}`,async()=>{
 const baseline=await fixture(scenario),experimental=await fixture(scenario);
 baseline.room.monsterAttack('victim',baseline.victim);
 const adapter=new OccurrenceAdapter(experimental),token=adapter.start();assert.ok(token);assert.equal(adapter.ledger.size,3);assert.deepEqual(experimental.trace,[]);
 assert.equal(adapter.deliver(token,0),'delivered');assert.deepEqual(experimental.trace,baseline.trace);assert.deepEqual(experimental.snapshot(),baseline.snapshot());
 if(scenario.sanctuary)assert.equal(experimental.trace.some(e=>e.type==='monster_hit'),false,'protection prevents hit');
 else assert.ok(experimental.trace.some(e=>e.type==='monster_hit'),'the real attack was executed');
 if(scenario.counter)assert.ok(experimental.trace.some(e=>e.type==='combat_hit'),'real counter executed');
 if(scenario.intercept)assert.ok(experimental.trace.some(e=>e.type==='sentinel_intercept'),'real interception executed');
 const before=structuredClone(experimental.trace),state=experimental.snapshot();
 experimental.room.simulatedMs+=2000;assert.equal(adapter.deliver(token,2000),'duplicate');assert.deepEqual(experimental.trace,before);assert.deepEqual(experimental.snapshot(),state);
 assert.equal(adapter.close(token,2000,true),true);assert.equal(adapter.deliver(token,2001),'stale');assert.deepEqual(experimental.trace,before);
});
test('real nested counter and interception reject reentrant delivery without changing actual trace',async()=>{
 const scenario={counter:true,intercept:true,allyHp:2},baseline=await fixture(scenario),experimental=await fixture(scenario);
 baseline.room.monsterAttack('victim',baseline.victim);
 const adapter=new OccurrenceAdapter(experimental),token=adapter.start();let retries=0;
 experimental.setHook(type=>{if(type==='combat_hit' || type==='sentinel_intercept'){retries++;assert.equal(adapter.deliver(token,0),'duplicate');}});
 assert.equal(adapter.deliver(token,0),'delivered');assert.equal(retries,2);assert.deepEqual(experimental.trace,baseline.trace);assert.deepEqual(experimental.snapshot(),baseline.snapshot());
});
test('full preflight capacity failure leaves the real room untouched',async()=>{
 const f=await fixture({counter:true,intercept:true}),adapter=new OccurrenceAdapter(f,2),before=f.snapshot();
 assert.equal(adapter.start(),undefined);assert.equal(adapter.ledger.size,0);assert.deepEqual(f.trace,[]);assert.deepEqual(f.snapshot(),before);
});
test('real path exception leaves occurrence uncertain and never repeats prior effects',async()=>{
 const f=await fixture({counter:true}),adapter=new OccurrenceAdapter(f),token=adapter.start();
 f.setHook(type=>{if(type==='combat_hit')throw Error('synthetic notification failure');});
 assert.throws(()=>adapter.deliver(token,0),/synthetic notification failure/);const trace=structuredClone(f.trace),state=f.snapshot();
 f.setHook(()=>{});assert.equal(adapter.deliver(token,1),'uncertain');assert.deepEqual(f.trace,trace);assert.deepEqual(f.snapshot(),state);assert.equal(adapter.close(token,100,false),false);
});

test('room-owned hit delivery never repeats an uncertain nested counter',async()=>{
 const f=await fixture({counter:true}),room=f.room;
 const resolve=room.resolveDefaultMonsterHit.bind(room);
 let occurrence,reentered=0;
 room.resolveDefaultMonsterHit=hit=>{occurrence=hit;resolve(hit);};
 f.setHook(type=>{
  if(type!=='combat_hit')return;
  reentered++;
  resolve(occurrence);
  throw Error('synthetic counter notification failure');
 });
 assert.throws(()=>room.monsterAttack('victim',f.victim),/synthetic counter notification failure/);
 assert.equal(reentered,1);
 assert.equal(f.monster.hitSeq,1);
 const state=f.snapshot(),trace=structuredClone(f.trace);
 room.simulatedMs+=2000;
 f.setHook(()=>{});
 resolve(occurrence);
 assert.deepEqual(f.snapshot(),state);
 assert.deepEqual(f.trace,trace);
});
