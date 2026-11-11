/* In-process characterization of the real default-monster damage path.
 * No network or durable player data. Run with the verified combat-verify tsx loader. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'../..');
const copy=path.join(root,'combat-verify/src/rooms/MyRoom.ts');
async function fixture({hp=100,pathId='',def=0}={}){
 for(const name of ['MyRoom.ts','ForestEncounters.ts']){
  const sourceFile=path.join(root,'deploy/combat',name),copyFile=path.join(root,'combat-verify/src/rooms',name);
  assert.equal(fs.readFileSync(copyFile,'utf8'),fs.readFileSync(sourceFile,'utf8'),`verification copy must match ${name}`);
 }
 const {MyRoom}=await import(pathToFileURL(copy).href);
 const {Player}=await import(pathToFileURL(path.join(root,'combat-verify/src/rooms/schema/MyRoomState.ts')).href);
 const {RULES}=await import(pathToFileURL(path.join(root,'combat-verify/src/rooms/GameRules.ts')).href);
 const room=new MyRoom(),victim=new Player({x:-10,y:0,z:0,level:1,def,hp,maxHp:100,alive:true,pathId,facing:0,mapId:'ritual_village'});
 const monster=room.state.monster;Object.assign(monster,{id:RULES.monsterId,x:-10,y:0,z:-1,hp:100,maxHp:100,defense:0,level:1,alive:true,mapId:victim.mapId});
 room.state.players.set('victim',victim);room.simulatedMs=10000;
 const trace=[];
 const snapshot=()=>({victimHp:victim.hp,victimAlive:victim.alive,monsterHp:monster.hp,monsterAlive:monster.alive,victimHitSeq:victim.hitSeq});
 room.broadcast=(type,data)=>trace.push({type,data:structuredClone(data),...snapshot()});
 room.clients.push({sessionId:'victim',send:(type,data)=>trace.push({type,data:structuredClone(data),...snapshot()})});
 // Avoid disk IO; a volatile fixture has no persistent character to save or reward.
 room.saveCharacter=async()=>{};
 return {room,victim,monster,trace,Player,RULES};
}
for(const lethal of [false,true])test(`default monster ${lethal?'lethal':'ordinary'} attack commits HP before notices`,async()=>{
 const {room,victim,monster,trace,RULES}=await fixture({hp:lethal?5:100});room.monsterAttack('victim',victim);
 assert.equal(victim.hp,lethal?0:92);assert.equal(victim.alive,!lethal);assert.equal(victim.hitSeq,1);
 assert.deepEqual(trace.map(e=>e.type),lethal?['monster_hit','player_down']:['monster_hit']);
 assert.equal(trace[0].data.damage,8);assert.equal(trace[0].data.attackerId,RULES.monsterId);assert.equal(trace[0].victimHp,lethal?0:92);assert.equal(trace[0].victimAlive,true);
 if(lethal){assert.equal(trace[1].data.source,'monster');assert.equal(trace[1].data.attackerId,'');assert.equal(trace[1].victimAlive,false);}
 assert.equal(monster.alive,true);assert.equal(victim.pkDeaths,0);
});
test('sanctuary protection prevents damage, cast interruption and hit notification',async()=>{
 const {room,victim,trace}=await fixture({pathId:'mender'});
 room.priestSanctuaries.set('victim',{mapId:victim.mapId,x:victim.x,y:victim.y,z:victim.z,radius:5,until:11000});room.bladeWindups.set('victim',{targetId:'unused',until:11000,power:1,ambush:false});
 assert.equal(room.priestProtected('victim'),true);room.monsterAttack('victim',victim);
 assert.equal(victim.hp,100);assert.equal(victim.hitSeq,0);assert.ok(room.bladeWindups.has('victim'));assert.deepEqual(trace,[]);
});
test('direct guard interrupts windups before the monster hit and reduces front damage',async()=>{
 const {room,victim,trace}=await fixture();victim.combatState='attacking';room.bladeWindups.set('victim',{targetId:'unused',until:11000,power:1,ambush:false});room.swordGuards.set('victim',{until:11000,factor:.5,direction:true,counterUntil:0});
 room.monsterAttack('victim',victim);
 assert.deepEqual(trace.map(e=>e.type),['blade_windup','sword_guarded','monster_hit']);assert.equal(trace[0].data.result,'interrupted');assert.equal(trace[0].victimHp,100);assert.equal(victim.combatState,'idle');assert.equal(victim.hp,96);assert.equal(trace[2].data.damage,4);assert.equal(room.bladeWindups.has('victim'),false);assert.equal(room.swordGuards.get('victim').counterUntil,13000);
});
test('counter kills attacking monster but the already-started monster hit still resolves',async()=>{
 const {room,victim,monster,trace}=await fixture({pathId:'phutthaisawan'});monster.hp=1;
 room.inventories.set('victim',{version:1,slots:[{itemId:'arcane_sword',quantity:1}],equippedWeaponSlot:0});room.swordCoreStances.set('victim',{until:11000,rank:0,nextCounter:0});
 const award=room.awardMonsterExperience.bind(room);room.awardMonsterExperience=(winner,...rest)=>{trace.push({type:'reward_attempt',winner,monsterAlive:monster.alive,victimHp:victim.hp});return award(winner,...rest);};
 room.monsterAttack('victim',victim);
 assert.equal(monster.alive,false);assert.equal(monster.hp,0);assert.equal(victim.hp,94);
 assert.deepEqual(trace.map(e=>e.type),['combat_hit','reward_attempt','sword_core_counter','monster_hit']);
 assert.equal(trace[0].monsterHp,0);assert.equal(trace[0].monsterAlive,true);assert.equal(trace[1].winner,'victim');assert.equal(trace[1].monsterAlive,false);assert.equal(trace[2].victimHp,100);assert.equal(trace[3].monsterAlive,false);assert.equal(trace[3].data.damage,6);
});
for(const lethal of [false,true])test(`monster interception ${lethal?'kills':'damages'} ally before primary hit`,async()=>{
 const {room,victim,monster,trace,Player,RULES}=await fixture();
 const ally=new Player({x:victim.x,y:victim.y,z:victim.z,level:1,hp:lethal?3:100,maxHp:100,alive:true,pathId:'sentinel',mapId:victim.mapId});room.state.players.set('ally',ally);
 const invite=room.parties.invite('victim','ally',0);room.parties.accept('ally',invite.id,0);
 room.sentinelInterceptions.set('victim',{ownerId:'ally',until:11000,fraction:.5});room.monsterAttack('victim',victim);
 assert.equal(victim.hp,96);assert.equal(victim.hitSeq,1);assert.equal(ally.hp,lethal?0:96);assert.equal(ally.alive,!lethal);assert.equal(ally.hitSeq,1);
 assert.deepEqual(trace.map(e=>e.type),lethal?['sentinel_intercept','player_down','monster_hit']:['sentinel_intercept','monster_hit']);
 assert.equal(trace[0].data.damage,4);assert.equal(trace[0].data.attackerId,RULES.monsterId);assert.equal(trace[0].data.source,'monster');assert.equal(trace[0].victimHp,100);assert.equal(trace.at(-1).data.damage,4);
 if(lethal){assert.equal(trace[1].data.playerId,'ally');assert.equal(trace[1].data.attackerId,RULES.monsterId);assert.equal(trace[1].victimHp,100);assert.equal(ally.pkDeaths,0);}
 assert.equal(monster.alive,true);
});

test('a nested lethal notification cannot award the same life or steal its attribution',async()=>{
 const {room,monster,trace}=await fixture();
 let reentered=false;
 const broadcast=room.broadcast;
 const awards=[];
 room.awardMonsterExperience=(winner)=>awards.push(winner);
 room.broadcast=(type,data)=>{
  broadcast(type,data);
  if(type==='combat_hit' && !reentered){
   reentered=true;
   room.hitMonsterWithSpell('late attacker',monster,200,'muay');
  }
 };
 room.hitMonsterWithSpell('first attacker',monster,200,'sword');
 assert.equal(monster.hitSeq,1);
 assert.equal(monster.alive,false);
 assert.equal(trace.filter(e=>e.type==='combat_hit').length,1);
 assert.deepEqual(awards,['first attacker']);
 room.hitMonsterWithSpell('late attacker',monster,200,'muay');
 assert.equal(monster.hitSeq,1);
 assert.deepEqual(awards,['first attacker']);
});

test('a failed lethal hit notification still settles its death once and permits a new life',async()=>{
 const {room,monster}=await fixture();
 const awards=[];
 room.awardMonsterExperience=winner=>awards.push(winner);
 const settle=room.killMonster.bind(room);
 let firstDefeat;
 room.killMonster=defeat=>{firstDefeat??=defeat;settle(defeat);settle(defeat);};
 const publish=room.broadcast;
 room.broadcast=(type,data)=>{
  if(type==='combat_hit')throw Error('synthetic hit notification failure');
  publish(type,data);
 };
 assert.throws(()=>room.hitMonsterWithSpell('first attacker',monster,200,'sword'),/synthetic hit notification failure/);
 assert.equal(monster.alive,false);
 assert.deepEqual(awards,['first attacker']);
 room.broadcast=publish;
 room.simulatedMs=room.monsterRespawnAt;
 room.updateRespawns();
 assert.equal(monster.alive,true);
 settle(firstDefeat);
 assert.equal(monster.alive,true,'a receipt from the previous life cannot kill the respawn');
 room.hitMonsterWithSpell('second attacker',monster,200,'sword');
 assert.deepEqual(awards,['first attacker','second attacker']);
});

for(const [label,sequenceMap,update,hit] of [
 ['Muay','muayCoreSequences','updateMuayCore','muayCoreHit'],
 ['Sword','swordCoreSequences','updateSwordCore','swordCoreHit'],
])test(label+' sequence reserves a strike before a reentrant notification and drops a failed remainder',async()=>{
 const {room}=await fixture();
 room.simulatedMs=10000;
 const sequence={targetId:'target',next:0,remaining:3,rank:0,interval:350,power:1,skillId:'korat'};
 room[sequenceMap].set('victim',sequence);
 let strikes=0;
 room[hit]=()=>{
  strikes++;
  if(strikes===1)room[update]();
  return true;
 };
 room[update]();
 assert.equal(strikes,1);
 assert.equal(sequence.remaining,2);
 room[update]();
 assert.equal(strikes,1,'catch-up still cannot hit twice at the same simulation time');
 room.simulatedMs+=50;
 room[hit]=()=>{strikes++;throw Error('synthetic strike notification failure');};
 assert.throws(()=>room[update](),/synthetic strike notification failure/);
 assert.equal(room[sequenceMap].has('victim'),false);
 room[update]();
 assert.equal(strikes,2);
});

test('an overdue curse reserves its tick before calling the damage path',async()=>{
 const {room,monster,victim,Player,trace}=await fixture();
 const caster=new Player({pathId:'seer',x:victim.x,y:victim.y,z:victim.z,mapId:victim.mapId,alive:true});
 room.state.players.set('seer',caster);
 room.occultCurses.set(monster.id,{ownerId:'seer',until:14000,nextTick:0,damage:15});
 const publish=room.broadcast;let entered=false;
 room.broadcast=(type,data)=>{
  publish(type,data);
  if(type==='combat_hit' && !entered){entered=true;room.updateOccultEffects();}
 };
 room.updateOccultEffects();
 assert.equal(monster.hp,85);
 assert.equal(trace.filter(e=>e.type==='combat_hit').length,1);
 room.simulatedMs+=50;room.updateOccultEffects();
 assert.equal(monster.hp,70);
});
