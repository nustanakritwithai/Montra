/* Synthetic in-process characterization only. No inference of sub-tick event
 * timestamps, interpolation, network delivery or production movement guarantees. */
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'../..'), rooms=path.join(root,'combat-verify/src/rooms');
async function load(){
 for(const file of ['MyRoom.ts','ForestEncounters.ts'])assert.equal(fs.readFileSync(path.join(rooms,file),'utf8'),fs.readFileSync(path.join(root,'deploy/combat',file),'utf8'),`${file} verification copy must match source`);
 assert.equal(process.env.MONTRA_WORLD_EXPANSION,'1','world expansion must be set before import');
 const [{MyRoom},{ForestEncounters},{MyRoomState,Player},{RULES}]=await Promise.all(['MyRoom.ts','ForestEncounters.ts','schema/MyRoomState.ts','GameRules.ts'].map(p=>import(pathToFileURL(path.join(rooms,p)).href)));
 return {MyRoom,ForestEncounters,MyRoomState,Player,RULES};
}
const pos=m=>({x:m.x,y:m.y,z:m.z});
async function forestFixture(){
 const {ForestEncounters,MyRoomState,Player}=await load(),state=new MyRoomState(),forest=new ForestEncounters(state.monsters);
 forest.initialize(false);const a=state.monsters.get('forest_west_1'),b=state.monsters.get('forest_west_2');assert.ok(a&&b);
 for(const id of [...state.monsters.keys()])if(id!==a.id&&id!==b.id)state.monsters.delete(id);
 const player=(id,m,dx)=>state.players.set(id,new Player({x:m.x+dx,y:m.y,z:m.z,mapId:m.mapId,alive:true,hp:100,maxHp:100}));
 return {state,forest,a,b,player};
}
test('forest update moves one monster before invoking another monster attack callback',async()=>{
 const {state,forest,a,b,player}=await forestFixture();player('moving-target',a,3);player('hit-target',b,.5);
 const a0=pos(a),b0=pos(b),events=[];
 forest.update(1000,.05,state.players,new Set(),(target,m)=>events.push({type:'hit',target,id:m.id,a:pos(a),b:pos(b)}),id=>events.push({type:'respawn',id}));
 assert.equal(events.length,1);assert.equal(events[0].id,b.id);assert.equal(events[0].target,'hit-target');
 assert.notDeepEqual(events[0].a,a0);assert.deepEqual(events[0].b,b0);assert.deepEqual(pos(a),events[0].a);assert.equal(a.aiState,'chase');assert.equal(b.aiState,'attack');
});
test('forest callback order follows life iteration, not public monster-map insertion order',async()=>{
 const {state,forest,a,b,player}=await forestFixture();player('a-target',a,.5);player('b-target',b,.5);
 state.monsters.delete(a.id);state.monsters.delete(b.id);state.monsters.set(b.id,b);state.monsters.set(a.id,a);
 const hits=[];forest.update(1000,.05,state.players,new Set(),(target,m)=>hits.push([m.id,target]),()=>{});
 assert.deepEqual(hits,[[a.id,'a-target'],[b.id,'b-target']]);
});
test('forest attack callback may occur before a later monster moves in the same update',async()=>{
 const {state,forest,a,b,player}=await forestFixture();player('hit-target',a,.5);player('moving-target',b,3);
 const b0=pos(b),observed=[];forest.update(1000,.05,state.players,new Set(),(_target,m)=>observed.push({id:m.id,b:pos(b)}),()=>{});
 assert.deepEqual(observed,[{id:a.id,b:b0}]);assert.notDeepEqual(pos(b),b0);assert.equal(b.aiState,'chase');
});
test('forest respawn callback follows discontinuous restoration, and update does not move that monster again',async()=>{
 const {state,forest,a}=await forestFixture(),spawn=pos(a),events=[];
 assert.equal(forest.kill(a.id,100),true);a.x+=4;const deadPosition=pos(a);assert.notDeepEqual(deadPosition,spawn);
 const update=now=>forest.update(now,.05,state.players,new Set(),(target,m)=>events.push({type:'hit',target,id:m.id}),id=>events.push({type:'respawn',id,position:pos(a),alive:a.alive,hp:a.hp}));
 update(25099);assert.equal(a.alive,false);assert.deepEqual(pos(a),deadPosition);assert.deepEqual(events,[]);
 update(25100);assert.deepEqual(events,[{type:'respawn',id:a.id,position:spawn,alive:true,hp:a.maxHp}]);assert.deepEqual(pos(a),spawn);
});
test('default monster chooses either chase movement or an attack callback in each AI update',async()=>{
 const {MyRoom,Player,RULES}=await load(),room=new MyRoom(),m=room.state.monster;
 Object.assign(m,{id:RULES.monsterId,x:RULES.monsterSpawnX,y:0,z:RULES.monsterSpawnZ,mapId:'ritual_village',alive:true});
 const p=new Player({x:m.x+3,y:0,z:m.z,mapId:m.mapId,alive:true,hp:100,maxHp:100,level:1});room.state.players.set('target',p);
 const trace=[],move=room.moveMonster.bind(room),attack=room.monsterAttack.bind(room);
 room.moveMonster=(...args)=>{const before=pos(m);move(...args);trace.push({type:'move',before,after:pos(m)});};
 room.monsterAttack=(...args)=>{trace.push({type:'attack-call',position:pos(m)});attack(...args);};
 room.priestProtected=()=>false;room.endBladeCloak=()=>{};room.masteryPower=()=>0;room.directGuardDamage=()=>7;
 room.broadcast=(type,data)=>trace.push({type,hp:p.hp,data});room.simulatedMs=1000;room.updateMonsterAI(.05);
 assert.deepEqual(trace.map(x=>x.type),['move']);assert.notDeepEqual(trace[0].before,trace[0].after);
 trace.length=0;p.x=m.x+.5;p.z=m.z;room.simulatedMs=1050;const before=pos(m);room.updateMonsterAI(.05);
 assert.deepEqual(trace.map(x=>x.type),['attack-call','monster_hit']);assert.deepEqual(pos(m),before);assert.equal(p.hp,93);
 trace.length=0;room.simulatedMs=1100;room.updateMonsterAI(.05);assert.deepEqual(trace.map(x=>x.type),['attack-call']);assert.equal(p.hp,93,'cooldown suppresses hit');
});
test('default monster respawn restores location and alive state before its notice',async()=>{
 const {MyRoom,RULES}=await load(),room=new MyRoom(),m=room.state.monster,events=[];
 Object.assign(m,{id:RULES.monsterId,x:RULES.monsterSpawnX+4,y:0,z:RULES.monsterSpawnZ,alive:false,hp:0,maxHp:200});
 room.monsterRespawnAt=1000;room.broadcast=(type,data)=>events.push({type,data,position:pos(m),alive:m.alive,hp:m.hp});
 room.simulatedMs=999;room.updateRespawns();assert.equal(m.alive,false);assert.equal(events.length,0);
 room.simulatedMs=1000;room.updateRespawns();assert.equal(events.length,1);assert.equal(events[0].type,'monster_respawn');assert.deepEqual(events[0].position,{x:RULES.monsterSpawnX,y:m.y,z:RULES.monsterSpawnZ});assert.equal(events[0].alive,true);assert.equal(events[0].hp,200);
});
test('room tick calls default AI before forest update and then player attacks and summons',async()=>{
 const {MyRoom}=await load(),room=new MyRoom(),trace=[];
 for(const name of ['updateBladeEffects','updateTerritory','updateWorldDirector','updateOccultEffects','updateMuayGrapples','updatePrototypeEffects','updateMuayDefense','updateMuayCore','updateSwordCore','updateRespawns','updateClimbs','updateFlights','updatePlayerMovement','updateForestDefenses','updateForestEscorts','updateResources'])room[name]=()=>{};
 room.updateMonsterAI=()=>trace.push('default');room.forest.update=()=>trace.push('forest');room.updatePlayerAttacks=()=>trace.push('players');room.updateSummons=()=>trace.push('summons');
 room.tick(.05);assert.deepEqual(trace,['default','forest','players','summons']);
});

test('real forest schedule applies Firm Guard once when an attack callback is delivered twice',async()=>{
 const {Player}=await load();
 const staged=file=>import(pathToFileURL(path.join(rooms,file)).href);
 const [{PrototypeTestRoom},{newSentinelBook}]=await Promise.all([staged('PrototypeTestRoom.ts'),staged('SentinelRules.ts')]);
 const flags={NODE_ENV:'test',MONTRA_ISOLATED_STAGING:'1',MONTRA_PROTOTYPE_PROTOCOL_V1:'1',MONTRA_PROTOTYPE_GAMEPLAY:'1'};
 const old=Object.fromEntries(Object.keys(flags).map(key=>[key,process.env[key]]));
 Object.assign(process.env,flags);
 try{
  const room=new PrototypeTestRoom(true),events=[];
  room.forest.initialize(false);
  const monster=room.state.monsters.get('forest_west_2');
  assert.ok(monster);
  for(const id of room.state.monsters.keys())if(id!==monster.id)room.state.monsters.delete(id);
  const player=new Player({pathId:'sentinel',x:monster.x+.5,y:monster.y,z:monster.z,mapId:monster.mapId,
   alive:true,hp:1000,maxHp:1000,mana:100,maxMana:100,facing:Math.PI/2,level:40});
  const client={sessionId:'sentinel',send:(type,data)=>events.push({type,data})};
  room.state.players.set(client.sessionId,player);room.clients.push(client);
  room.persistentCharacters.set(client.sessionId,'synthetic');
  const book=newSentinelBook();book.learned=['guard','fortitude','firm_guard'];book.slots[0]='firm_guard';
  room.sentinelBooks.set(client.sessionId,book);
  room.spellCaster=()=>player;room.saveCharacter=async()=>{};
  room.broadcast=(type,data)=>events.push({type,data});
  room.simulatedMs=10000;
  room.acknowledgePrototypeProtocol(client,{prototypeProtocolVersion:1,prototypeGameplayVersion:1});
  room.messages.prototype_protocol_v1(client,{action:'confirm_gameplay',nonce:events[0].data.nonce});
  room.messages.prototype_protocol_v1(client,{action:'firm_guard',seq:1});
  let hit;
  const update=()=>room.forest.update(room.simulatedMs,.05,room.state.players,new Set(),(id,m,force,attackAt)=>{
   hit=[id,m,force??1,attackAt];
   assert.equal(attackAt,room.simulatedMs);
   room.resolveForestMonsterHit(...hit);
   room.resolveForestMonsterHit(...hit);
  },()=>{});
  update();
  const hp=player.hp,first=hit;
  assert.ok(hp<1000);
  assert.equal(player.hitSeq,1);
  assert.equal(book.practice.guard,1);
  assert.equal(room.prototypeFirmGuards.get(client.sessionId).guard.remainingHits,1);
  room.simulatedMs+=1500;
  room.resolveForestMonsterHit(...first);
  assert.equal(player.hp,hp);
  update();
  assert.equal(player.hitSeq,2);
  assert.equal(book.practice.guard,2);
  assert.deepEqual(events.filter(e=>e.type==='monster_hit'||e.data?.phase==='protected').map(e=>e.type),
   ['monster_hit','prototype_skill_v1','monster_hit','prototype_skill_v1']);
 }finally{
  for(const [key,value] of Object.entries(old))if(value===undefined)delete process.env[key];else process.env[key]=value;
 }
});

test('a forest strike damages each eligible target once on the same tick',async()=>{
 const {MyRoom,Player}=await load(),room=new MyRoom(),mapId='asura_peak',events=[];
 room.forest.initialize();
 const add=(id,x,z)=>{const p=new Player({x,y:0,z,mapId,hp:100,maxHp:100,level:80,alive:true});room.state.players.set(id,p);return p;};
 const a=add('a',-84,-62),b=add('b',-83.6,-62),outside=add('outside',-84,-57);
 room.priestProtected=()=>false;room.endBladeCloak=()=>{};room.masteryPower=()=>0;room.directGuardDamage=()=>7;
 room.broadcast=(type,data)=>events.push({type,data});
 const tick=now=>{
  room.simulatedMs=now;
  room.forest.update(now,0,room.state.players,new Set(),(id,m,force,at)=>{
   if(m.id!=='himmapan_kraisorn')return;
   room.resolveForestMonsterHit(id,m,force,at);
   room.resolveForestMonsterHit(id,m,force,at);
  },()=>{});
 };
 tick(100);tick(1050);
 assert.deepEqual([a.hp,b.hp,outside.hp],[93,93,100]);
 assert.deepEqual(events.filter(e=>e.type==='monster_hit').map(e=>e.data.targetId),['a','b']);
 tick(1850);
 assert.deepEqual([a.hp,b.hp,outside.hp],[86,86,100]);
});

test('Ash Rice resolves a real walk before a different forest monster can deliver its queued hit',async()=>{
 const {Player}=await load();
 const staged=file=>import(pathToFileURL(path.join(rooms,file)).href);
 const [{PrototypeTestRoom},{newOccultBook},{createAshTrap}]=await Promise.all([
  staged('PrototypeTestRoom.ts'),staged('OccultRules.ts'),staged('OccultPrototypeRules.ts')]);
 const flags={NODE_ENV:'test',MONTRA_ISOLATED_STAGING:'1',MONTRA_PROTOTYPE_PROTOCOL_V1:'1',MONTRA_PROTOTYPE_GAMEPLAY:'1'};
 const old=Object.fromEntries(Object.keys(flags).map(key=>[key,process.env[key]]));
 Object.assign(process.env,flags);
 try{
  const room=new PrototypeTestRoom(true),events=[];
  room.forest.initialize(false);
  const a=room.state.monsters.get('forest_west_1'),b=room.state.monsters.get('forest_west_2');
  for(const id of room.state.monsters.keys())if(id!==a.id&&id!==b.id)room.state.monsters.delete(id);
  Object.assign(a,{x:-27.5,y:0,z:-17,hp:1000,maxHp:1000});
  Object.assign(b,{x:-27.4,y:0,z:-17,hp:1});
  const player=new Player({pathId:'seer',x:-25.8,y:0,z:-17,mapId:a.mapId,alive:true,hp:1000,maxHp:1000,mana:100,maxMana:100,level:40});
  const client={sessionId:'seer',send:(type,data)=>events.push({type,data})};
  room.state.players.set(client.sessionId,player);room.clients.push(client);
  room.persistentCharacters.set(client.sessionId,'synthetic');
  const book=newOccultBook();book.learned.seer=['seer_mark','seer_rice','seer_ash_rice'];book.loadouts.seer[0]='seer_ash_rice';
  room.occultBooks.set(client.sessionId,book);room.spellCaster=()=>player;room.saveCharacter=async()=>{};
  room.awardMonsterExperience=()=>{};
  room.broadcast=(type,data)=>events.push({type,data});
  room.simulatedMs=10000;
  room.acknowledgePrototypeProtocol(client,{prototypeProtocolVersion:1,prototypeGameplayVersion:1});
  room.messages.prototype_protocol_v1(client,{action:'confirm_gameplay',nonce:events[0].data.nonce});
  room.messages.occult_skill(client,{skillId:'seer_ash_rice',targetId:b.id});
  assert.equal(player.mana,100);
  room.messages.prototype_protocol_v1(client,{action:'seer_ash_rice',targetId:b.id,seq:1});
  room.messages.prototype_protocol_v1(client,{action:'seer_ash_rice',targetId:b.id,seq:1});
  assert.equal(player.mana,82);
  assert.equal(b.hp,1,'placement has no immediate hit');
  assert.equal(events.filter(e=>e.data?.phase==='placed').length,1);
  const trap=createAshTrap(null,{castId:'synthetic',ownerId:client.sessionId,mapId:a.mapId,position:{x:-25.47,y:0,z:-17},
   now:9000,armDelayMs:1000,durationMs:5000,radius:2});
  room.prototypeAshTraps.set(client.sessionId,trap);
  room.simulatedMs=10050;
  const queued=[],resolve=room.resolveForestMonsterHit.bind(room);
  room.resolveForestMonsterHit=(...args)=>{queued.push(args[1].id);resolve(...args);};
  room.tick(.05);
  assert.ok(a.x>-27.5,'real walking update crossed the trap boundary');
  assert.ok(queued.includes(b.id),'another monster scheduled an attack in the same tick');
  assert.equal(b.alive,false);
  assert.equal(player.hitSeq,0,'dead attacker cannot deliver its queued hit');
  assert.equal(room.prototypeAshTraps.size,0);
  assert.equal(events.filter(e=>e.data?.phase==='triggered').length,1);
  const hits=a.hitSeq;
  room.updateAshTraps([{previousAt:10000,monsterId:a.id,mapId:a.mapId,previous:{x:-27.5,y:0,z:-17},current:a,eligible:true}]);
  assert.equal(a.hitSeq,hits,'consumed trap cannot damage twice');
  room.prototypeAshTraps.set(client.sessionId,trap);
  room.pendingWarps.add(client.sessionId);
  room.updateAshTraps([]);
  assert.equal(room.prototypeAshTraps.size,0);
 }finally{
  for(const [key,value] of Object.entries(old))if(value===undefined)delete process.env[key];else process.env[key]=value;
 }
});
