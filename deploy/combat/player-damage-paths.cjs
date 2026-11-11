/* Synthetic MyRoom method characterization, not a WebSocket or balance test.
 * Guard, LOS, combat bookkeeping and persistence are controlled stubs. */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'../..'),rooms=path.join(root,'combat-verify/src/rooms');
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function fixture(school,hp=100){
 for(const [source,copy] of [['MyRoom.ts','MyRoom.ts'],['MyRoomState.ts','schema/MyRoomState.ts'],['GameRules.ts','GameRules.ts'],['ItemRules.ts','ItemRules.ts'],['HeightRules.ts','HeightRules.ts']])
  assert.equal(hash(path.join(root,'deploy/combat',source)),hash(path.join(rooms,copy)),`${source} source and staged copy differ`);
 const [{MyRoom},{Player,SummonedGuardian}]=await Promise.all(['MyRoom.ts','schema/MyRoomState.ts'].map(f=>import(pathToFileURL(path.join(rooms,f)).href)));
 const room=new MyRoom(),trace=[];
 const actor=new Player({pathId:school,x:1.1,y:0,z:10.4,mapId:'ritual_village',alive:true,hp:100,maxHp:100,level:1});
 const victim=new Player({x:2.1,y:0,z:10.4,mapId:actor.mapId,alive:true,hp,maxHp:100,level:1});
 room.state.players.set('attacker1',actor);room.state.players.set('victim1',victim);
 const weapon=school==='muay_boran'?'muay_wraps':'arcane_sword';room.inventories.set('attacker1',{version:1,slots:[{itemId:weapon,quantity:1}],equippedWeaponSlot:0});
 room.sameCombatMap=()=>true;room.bodyPathClear=()=>true;room.combatSegmentClear=()=>true;room.endBladeCloak=()=>{};room.masteryPower=()=>10;
 room.recordCombat=(id,target)=>trace.push({type:'combat',id,target,hp:victim.hp,alive:victim.alive});
 room.directGuardDamage=(_id,_attacker,_amount,_pierce,summonOwner)=>{trace.push({type:'guard',hp:victim.hp,alive:victim.alive,summonOwner});return 25;};
 room.saveCharacter=async id=>{trace.push({type:'save',id,hp:victim.hp,alive:victim.alive});};
 room.broadcast=(type,data)=>trace.push({type,hp:victim.hp,alive:victim.alive,data:structuredClone(data)});
 room.simulatedMs=100000;
 return {room,actor,victim,trace,SummonedGuardian,client:{sessionId:'attacker1',send:(type,data)=>trace.push({type,data})}};
}
const cases=[
 {name:'sword core',school:'phutthaisawan',source:'sword',invoke:({room})=>room.swordCoreHit('attacker1','victim1',1)},
 {name:'Muay core',school:'muay_boran',source:'muay',invoke:({room})=>room.muayCoreHit('attacker1','victim1',1)},
 {name:'Blade',school:'blade',source:'blade',invoke:({room})=>room.bladeDamage('attacker1','victim1',1)},
 {name:'Sentinel',school:'sentinel',source:'sentinel',invoke:({room})=>room.sentinelDamage('attacker1','victim1',1,false)},
 {name:'blessed rice projectile',school:'seer',source:'ranged',invoke:f=>{f.room.spellCaster=()=>f.actor;f.room.legacyCombatRoom=()=>true;f.room.castBlessedRice(f.client,{targetId:'victim1'});}},
 {name:'summon',school:'seer',source:'summon',invoke:f=>{const g=new f.SummonedGuardian({ownerId:'attacker1',kind:'guardian',x:f.actor.x,y:0,z:f.actor.z});f.room.state.summons.set('attacker1',g);f.guardian=g;f.room.trySummonAttack('attacker1',g,'victim1');}},
];
for(const c of cases)for(const lethal of [false,true])test(`${c.name}: ${lethal?'lethal':'nonlethal'} committed damage and side-effect order`,async()=>{
 const f=await fixture(c.school,lethal?10:100);c.invoke(f);
 assert.equal(f.victim.hp,lethal?0:75);assert.equal(f.victim.alive,!lethal);assert.equal(f.victim.hitSeq,1);
 const names=f.trace.map(x=>x.type);assert.deepEqual(names.slice(0,3),['combat','guard','pvp_hit']);
 assert.equal(f.trace[1].hp,lethal?10:100,'guard runs before the victim HP write');
 const hit=f.trace[2];assert.equal(hit.hp,lethal?0:75);assert.equal(hit.alive,true);assert.equal(hit.data.source,c.source);assert.equal(hit.data.damage,25);
 if(lethal){
  const down=names.indexOf('player_down'),kill=names.indexOf('pvp_kill');assert.ok(down>2&&kill>down);assert.equal(f.trace[down].alive,false);
  assert.ok(names.indexOf('save')>2&&names.indexOf('save')<down,'victim save called before down event');assert.equal(f.actor.pkKills,1);assert.equal(f.victim.pkDeaths,1);
 } else {assert.equal(names.includes('player_down'),false);assert.equal(names.includes('pvp_kill'),false);}
 if(c.source==='ranged')assert.ok(names.indexOf('ranged_hit')>names.indexOf(lethal?'pvp_kill':'pvp_hit'),'ranged animation follows hit/death events');
 if(c.source==='summon'){assert.equal(f.guardian.hitSeq,1);assert.equal(hit.data.summonOwnerId,'attacker1');assert.equal(f.trace[1].summonOwner,'attacker1');}
});
for(const c of cases)test(`${c.name}: simulated guard-side attacker defeat cancels the original hit`,async()=>{
 const f=await fixture(c.school,100);f.room.directGuardDamage=()=>{f.trace.push({type:'guard-counter'});f.actor.hp=0;f.actor.alive=false;return 25;};
 const result=c.invoke(f);
 if(typeof result==='boolean')assert.equal(result,false);
 assert.equal(f.victim.hp,100);assert.equal(f.victim.hitSeq,0);
 assert.equal(f.trace.some(e=>e.type==='pvp_hit'||e.type==='pvp_kill'||e.type==='ranged_hit'),false);
});

test('a real sword counter defeats the Muay attacker before its original hit',async()=>{
 const f=await fixture('muay_boran');
 f.actor.hp=1;f.victim.pathId='phutthaisawan';
 f.room.inventories.set('victim1',{version:1,slots:[{itemId:'arcane_sword',quantity:1}],equippedWeaponSlot:0});
 f.room.swordCoreStances.set('victim1',{until:101000,rank:0,nextCounter:0});
 const ally=new f.actor.constructor({pathId:'sentinel',x:f.victim.x,y:f.victim.y,z:f.victim.z,mapId:f.victim.mapId,alive:true,hp:100,maxHp:100});
 f.room.state.players.set('ally',ally);
 const invite=f.room.parties.invite('victim1','ally',0);f.room.parties.accept('ally',invite.id,0);
 f.room.sentinelInterceptions.set('victim1',{ownerId:'ally',until:101000,fraction:.5});
 f.room.directGuardDamage=Object.getPrototypeOf(f.room).directGuardDamage.bind(f.room);
 assert.equal(f.room.muayCoreHit('attacker1','victim1',1),false);
 assert.equal(f.victim.hp,100);assert.equal(ally.hp,100);
 assert.equal(f.trace.some(e=>e.type==='sentinel_intercept'),false);
 assert.equal(f.actor.alive,false);
 assert.equal(f.actor.pkDeaths,1);
 assert.equal(f.victim.pkKills,1);
 assert.deepEqual(f.trace.filter(e=>e.type==='pvp_hit').map(e=>e.data.attackerId),['victim1']);
});

test('a reentrant lethal PvP notice preserves the first hit and one kill credit',async()=>{
 const f=await fixture('phutthaisawan',10);
 const later=new f.actor.constructor({pathId:'phutthaisawan',x:f.actor.x,y:f.actor.y,z:f.actor.z,mapId:f.actor.mapId,alive:true,hp:100,maxHp:100});
 f.room.state.players.set('later1',later);
 f.room.inventories.set('later1',f.room.inventories.get('attacker1'));
 const publish=f.room.broadcast;
 let reentered=false;
 f.room.broadcast=(type,data)=>{
  publish(type,data);
  if(type==='pvp_hit' && !reentered){reentered=true;f.room.swordCoreHit('later1','victim1',1);}
 };
 assert.equal(f.room.swordCoreHit('attacker1','victim1',1),true);
 assert.equal(f.victim.hitSeq,1);
 assert.equal(f.victim.pkDeaths,1);
 assert.equal(f.actor.pkKills,1);
 assert.equal(later.pkKills,0);
 assert.deepEqual(f.trace.filter(e=>e.type==='pvp_kill').map(e=>e.data.winnerId),['attacker1']);
});

test('a failed lethal PvP notice still schedules respawn and preserves one credit',async()=>{
 const f=await fixture('phutthaisawan',10),publish=f.room.broadcast;
 f.room.broadcast=(type,data)=>{
  if(type==='pvp_hit')throw Error('synthetic pvp notice failure');
  publish(type,data);
 };
 assert.throws(()=>f.room.swordCoreHit('attacker1','victim1',1),/synthetic pvp notice failure/);
 assert.equal(f.victim.alive,false);
 assert.equal(f.victim.pkDeaths,1);
 assert.equal(f.actor.pkKills,1);
 assert.equal(f.room.playerRespawnAt.has('victim1'),true);
 assert.equal(f.room.swordCoreHit('attacker1','victim1',1),false);
 assert.equal(f.actor.pkKills,1);
});
