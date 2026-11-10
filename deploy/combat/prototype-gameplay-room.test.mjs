import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MyRoom} from './src/rooms/MyRoom.js';
import {PrototypeTestRoom} from './src/rooms/PrototypeTestRoom.js';
import {Player,Monster} from './src/rooms/schema/MyRoomState.js';
import {newSwordTree} from './src/rooms/SkillCatalog.js';
import {newMuayBook} from './src/rooms/MuayRules.js';
import {newSentinelBook} from './src/rooms/SentinelRules.js';
import {newOccultBook} from './src/rooms/OccultRules.js';
const keys=['NODE_ENV','MONTRA_ISOLATED_STAGING','MONTRA_PROTOTYPE_PROTOCOL_V1','MONTRA_PROTOTYPE_GAMEPLAY'];
const wrap=fn=>async()=>{const old=keys.map(k=>process.env[k]);Object.assign(process.env,{NODE_ENV:'test',MONTRA_ISOLATED_STAGING:'1',MONTRA_PROTOTYPE_PROTOCOL_V1:'1',MONTRA_PROTOTYPE_GAMEPLAY:'1'});try{await fn();}finally{keys.forEach((k,i)=>old[i]===undefined?delete process.env[k]:process.env[k]=old[i]);}};
function fixture(path,confirm=true){
 const r=new PrototypeTestRoom(true),events=[],client={sessionId:'a',send:(type,data)=>events.push({type,data})};
 r.clients.push(client);r.broadcast=(type,data)=>events.push({type,data});r.saveCharacter=()=>Promise.resolve();
 const p=new Player({pathId:path,x:-20,z:-20,y:0,hp:1000,maxHp:1000,mana:100,maxMana:100,alive:true});r.state.players.set('a',p);
 const m=r.state.monster;Object.assign(m,{x:-20,z:-21,y:0,hp:100000,maxHp:100000,alive:true,tier:'normal',mapId:p.mapId});
 r.blockMounted=()=>false;r.hotbarCastAllowed=()=>true;r.spellCaster=()=>p;r.sameCombatMap=()=>true;r.bodyPathClear=()=>true;
 r.inventories.set('a',{version:1,slots:[{itemId:path==='muay_boran'?'muay_wraps':'arcane_sword',quantity:1}],equippedWeaponSlot:0});
 r.acknowledgePrototypeProtocol(client,{prototypeProtocolVersion:1,prototypeGameplayVersion:1});
 if(confirm)r.messages.prototype_protocol_v1(client,{action:"confirm_gameplay",nonce:events[0].data.nonce});
 return {r,p,m,client,events,send:(action,seq,targetId=m.id)=>r.messages.prototype_protocol_v1(client,{action,seq,targetId})};
}
test('stage first and follow-up charge once, replay is rejected, legacy command denied',wrap(()=>{
 const {r,p,m,client,events,send}=fixture('phutthaisawan');const tree=newSwordTree();tree.learned=['rhythm','flowing_blades'];tree.loadouts.phutthaisawan[0]='flowing_blades';r.swordTrees.set('a',tree);
 assert.equal(events[0].data.gameplayEnabled,true);send('flowing_blades',1);assert.equal(p.mana,76);assert.equal(m.hitSeq,1);const first=m.hp,cd=tree.cooldowns.flowing_blades;assert.ok(cd>Date.now());
 r.simulatedMs=350;send('flowing_blades',1);assert.equal(m.hp,first);send('flowing_blades',2);assert.ok(m.hp<first);assert.equal(p.mana,76);assert.equal(tree.cooldowns.flowing_blades,cd);assert.equal(m.hitSeq,2);
 assert.equal(events.some(e=>e.type==='sword_skill_used'),false);
 r.messages.sword_skill(client,{skillId:'flowing_blades',targetId:m.id});assert.ok(events.some(e=>e.type==='command_rejected' && e.data.reason==='prototype_protocol_required'));
}));
test('counter records blocked monster, rejects another, one physical mark and cleanup',wrap(()=>{
 const {r,p,m,events,send}=fixture('muay_boran');const book=newMuayBook();book.learned=['chaiya_advanced_counter'];book.slots[0]='chaiya_advanced_counter';r.muayBooks.set('a',book);r.muayCooldowns.set('a',{});
 const other=new Monster({id:'forest_west_1',x:-19,z:-21,y:0,hp:10000,maxHp:10000,alive:true,tier:'normal',mapId:p.mapId});r.state.monsters.set(other.id,other);
 r.swordGuards.set('a',{until:1200,factor:.5,direction:true,counterUntil:0});r.directGuardDamage('a',m,100);assert.equal(r.prototypeOpportunities.get('a').attackerId,m.id);
 send('chaiya_advanced_counter',1,other.id);assert.equal(p.mana,100);assert.equal(other.hp,10000);
 send('chaiya_advanced_counter',2,m.id);assert.equal(p.mana,76);assert.equal(r.prototypeOpportunities.has('a'),false);assert.ok(r.prototypeDebuffs.has(m.id));
 assert.equal(r.prototypeMonsterDamage(m,100),75);assert.equal(r.prototypeMonsterDamage(m,100),100);
 r.prototypeDebuffs.set(m.id,{sourceId:'a',monsterId:m.id,until:1000});r.clearPrototypeTransient(m.id);assert.equal(r.prototypeDebuffs.size,0);
}));
test('disabled transition clears combat state and one-hit frontal guard stays single-use',wrap(()=>{
 const {r,p,m}=fixture('phutthaisawan');p.facing=0;r.prototypeFlowing.set('a',{lastSeq:1,lastNow:0,guard:{until:1000}});
 assert.equal(r.directGuardDamage('a',m,100),70);assert.equal(r.directGuardDamage('a',m,100),100);
 r.prototypeDebuffs.set(m.id,{sourceId:'a',monsterId:m.id,until:1000});process.env.MONTRA_PROTOTYPE_GAMEPLAY='0';assert.equal(r.prototypeMonsterDamage(m,100),100);r.updatePrototypeEffects();assert.equal(r.prototypeDebuffs.size,0);
}));

test('shipped gameplay is hard blocked even if every environment flag is set',wrap(()=>{
 const r=new MyRoom();assert.equal(r.prototypeGameplayEnabled(),false);
}));


test('poison and curse ticks preserve experimental guard and do not open new Chaiya opportunity',wrap(()=>{
 for(const kind of ['poison','curse'])for(const path of ['phutthaisawan','muay_boran']){
  const {r,p,m}=fixture(path);const owner=new Player({pathId:'seer',x:-20,z:-21,y:0,hp:100,maxHp:100,alive:true,mapId:p.mapId});r.state.players.set('owner1',owner);
  if(path==='phutthaisawan')r.prototypeFlowing.set('a',{lastSeq:1,lastNow:0,guard:{until:1000}});
  else r.swordGuards.set('a',{until:1000,factor:.5,direction:true,counterUntil:0});
  if(kind==='poison')r.seerPoisons.set('a',{ownerId:'owner1',nextTick:0,fraction:.05});
  else r.occultCurses.set('a',{ownerId:'owner1',until:3000,nextTick:0,damage:40});
  const hp=p.hp;r.updateOccultEffects();assert.ok(p.hp<hp,`${kind} dealt damage`);
  if(path==='phutthaisawan')assert.ok(r.prototypeFlowing.get('a').guard,`${kind} did not consume flow guard`);
  else {assert.equal(r.prototypeOpportunities.has('a'),false,`${kind} did not open prototype counter`);assert.equal(r.swordGuards.get('a').counterUntil,3000,'legacy behavior retained');}
 }
}));

test('Korat pierce PvP attack preserves existing guard-pierce math against Flowing',wrap(()=>{
 function attack(guarded){
  const r=new PrototypeTestRoom(true),events=[],client={sessionId:'attacker1',send:(type,data)=>events.push({type,data})},defenderClient={sessionId:'victim1',send(){}};
  r.clients.push(client,defenderClient);r.prototypeGameplaySessions.add('attacker1');r.prototypeGameplaySessions.add('victim1');r.broadcast=(type,data)=>events.push({type,data});r.saveCharacter=()=>Promise.resolve();
  const actor=new Player({pathId:'muay_boran',x:-20,z:-21,y:0,hp:1000,maxHp:1000,mana:100,maxMana:100,alive:true});
  const target=new Player({pathId:'phutthaisawan',x:-20,z:-20,y:0,hp:1000,maxHp:1000,alive:true,facing:0,mapId:actor.mapId});
  r.state.players.set('attacker1',actor);r.state.players.set('victim1',target);
  r.blockMounted=()=>false;r.hotbarCastAllowed=()=>true;r.spellCaster=()=>actor;r.sameCombatMap=()=>true;r.bodyPathClear=()=>true;
  r.inventories.set('attacker1',{version:1,slots:[{itemId:'muay_wraps',quantity:1}],equippedWeaponSlot:0});
  const book=newMuayBook();book.school='korat';book.learned=['korat_pierce'];book.slots[0]='korat_pierce';r.muayBooks.set('attacker1',book);r.muayCooldowns.set('attacker1',{});
  if(guarded)r.prototypeFlowing.set('victim1',{lastSeq:1,lastNow:0,guard:{until:1000}});
  r.messages.muay_skill(client,{skillId:'korat_pierce',targetId:'victim1'});
  return {damage:events.find(e=>e.type==='pvp_hit')?.data.damage,r};
 }
 const baseline=attack(false).damage,guarded=attack(true);assert.ok(baseline>0);assert.equal(guarded.damage,Math.max(1,Math.round(baseline*(.7+(1-.7)*.25))));
 assert.equal(guarded.r.prototypeFlowing.get('victim1').guard,undefined);
}));

test('accepted paid attempt can be counter-killed without a false success notice',wrap(()=>{
 const {r,p,events,send}=fixture('phutthaisawan');const tree=newSwordTree();tree.learned=['rhythm','flowing_blades'];tree.loadouts.phutthaisawan[0]='flowing_blades';r.swordTrees.set('a',tree);
 const defender=new Player({pathId:'phutthaisawan',x:-20,z:-21,y:0,hp:1000,maxHp:1000,alive:true,mapId:p.mapId});r.state.players.set('victim1',defender);
 r.inventories.set('victim1',{version:1,slots:[{itemId:'arcane_sword',quantity:1}],equippedWeaponSlot:0});r.swordCoreStances.set('victim1',{until:1000,rank:0,nextCounter:0});p.hp=1;send('flowing_blades',1,'victim1');
 assert.equal(p.mana,76);assert.ok(tree.cooldowns.flowing_blades>Date.now());assert.equal(defender.hp,1000);
 assert.equal(p.alive,false);assert.equal(events.some(e=>e.type==='prototype_skill_v1'),false);assert.equal(events.some(e=>e.type==='pvp_hit' && e.data.attackerId==='a'),false);assert.ok(events.some(e=>e.type==='pvp_hit' && e.data.attackerId==='victim1'));
}));

test('Chaiya paid counter attempt defeated by real sword stance leaves no mark or false success',wrap(()=>{
 const {r,p,events,send}=fixture('muay_boran');
 const book=newMuayBook();book.learned=['chaiya_advanced_counter'];book.slots[0]='chaiya_advanced_counter';r.muayBooks.set('a',book);r.muayCooldowns.set('a',{});
 const defender=new Player({pathId:'phutthaisawan',x:-20,z:-21,y:0,hp:1000,maxHp:1000,alive:true,mapId:p.mapId});r.state.players.set('victim1',defender);
 r.inventories.set('victim1',{version:1,slots:[{itemId:'arcane_sword',quantity:1}],equippedWeaponSlot:0});
 r.swordGuards.set('a',{until:1000,factor:.5,direction:true,counterUntil:0});
 r.directGuardDamage('a',defender,10);assert.equal(r.prototypeOpportunities.get('a')?.attackerId,'victim1');
 r.swordCoreStances.set('victim1',{until:1000,rank:0,nextCounter:0});p.hp=1;
 send('chaiya_advanced_counter',1,'victim1');
 assert.equal(p.mana,76);assert.ok(r.muayCooldowns.get('a').chaiya_advanced_counter>Date.now());
 assert.equal(p.alive,false);assert.equal(defender.hp,1000);assert.equal(r.prototypeOpportunities.has('a'),false);assert.equal(r.prototypeDebuffs.size,0);
 assert.equal(events.some(e=>e.type==='prototype_skill_v1'),false);assert.equal(events.some(e=>e.type==='pvp_hit' && e.data.attackerId==='a'),false);
 assert.ok(events.some(e=>e.type==='pvp_hit' && e.data.attackerId==='victim1'));
}));

test('gameplay requires a connection-bound acknowledgement from the caster and every observer',wrap(()=>{
 const {r,p,m,events,client,send}=fixture('phutthaisawan',false);
 const tree=newSwordTree();tree.learned=['rhythm','flowing_blades'];tree.loadouts.phutthaisawan[0]='flowing_blades';r.swordTrees.set('a',tree);
 assert.equal(r.prototypeGameplayAllowed('a'),false,'a ready send is not an acknowledgement');
 const ownNonce=events[0].data.nonce;
 assert.equal(typeof ownNonce,'string');
 const received=[];
 const observer={sessionId:'observer',send:(type,data)=>received.push({type,data})};
 r.clients.push(observer);
 r.acknowledgePrototypeProtocol(observer,{prototypeProtocolVersion:1,prototypeGameplayVersion:1});
 const observerNonce=received[0].data.nonce;
 const confirm=(peer,nonce)=>r.messages.prototype_protocol_v1(peer,{action:'confirm_gameplay',nonce});
 assert.notEqual(ownNonce,observerNonce);
 confirm(client,observerNonce);
 assert.equal(r.prototypeGameplaySessions.has('a'),false);
 confirm(client,ownNonce);
 assert.equal(r.prototypeGameplaySessions.has('a'),true);
 send('flowing_blades',1);assert.equal(p.mana,100);assert.equal(m.hp,100000);
 confirm(observer,observerNonce);
 assert.equal(r.prototypeGameplayAllowed('a'),true);
 send('flowing_blades',1);assert.equal(p.mana,76);assert.ok(m.hp<100000);
}));

test('unconfirmed observers cannot receive a monster hit changed by an earlier Chaiya cast',wrap(()=>{
 const {r,p,m}=fixture('muay_boran');
 r.prototypeDebuffs.set(m.id,{sourceId:'a',monsterId:m.id,until:1000});
 const events=[];
 const observer={sessionId:'observer',send:(type,data)=>events.push({type,data})};
 r.clients.push(observer);
 r.state.players.set('observer',new Player({pathId:'blade',x:p.x,y:p.y,z:p.z,mapId:p.mapId,hp:1000,maxHp:1000,alive:true}));
 r.acknowledgePrototypeProtocol(observer,{prototypeProtocolVersion:1,prototypeGameplayVersion:1});
 assert.equal(r.prototypeMonsterDamage(m,100),100);
 assert.equal(r.prototypeDebuffs.has(m.id),false);
 r.messages.prototype_protocol_v1(observer,{action:'confirm_gameplay',nonce:events[0].data.nonce});
 assert.equal(r.prototypeGameplayAllowed('a'),true);
 assert.equal(r.prototypeMonsterDamage(m,100),100,'the suppressed mark cannot reappear after confirmation');
}));

function firmGuardFixture(){
 const setup=fixture('sentinel'),{r,p,m,client}=setup;
 const book=newSentinelBook();book.learned=['guard','fortitude','firm_guard'];book.slots[0]='firm_guard';
 r.sentinelBooks.set('a',book);r.persistentCharacters.set('a','test-only');
 r.simulatedMs=10000;
 const cast=seq=>r.messages.prototype_protocol_v1(client,{action:'firm_guard',seq});
 return {...setup,book,cast};
}

test('Firm Guard commits one cast and one complete default-monster hit per server occurrence',wrap(()=>{
 const {r,p,m,client,book,cast,events}=firmGuardFixture();
 r.messages.sentinel_skill(client,{skillId:'firm_guard'});
 assert.equal(p.mana,100,'legacy packet cannot bypass the test sequence');
 cast(1);cast(1);
 assert.equal(p.mana,78);
 assert.ok(book.cooldowns.firm_guard>Date.now());
 assert.equal(r.swordGuards.has('a'),false);
 assert.equal(events.filter(e=>e.type==='prototype_skill_v1' && e.data.phase==='braced').length,1);
 assert.equal(events.some(e=>e.type==='sentinel_skill_used'),false);
 let hit;
 const resolve=r.resolveDefaultMonsterHit.bind(r);
 r.resolveDefaultMonsterHit=event=>{hit=event;resolve(event);};
 const broadcast=r.broadcast;
 r.broadcast=(type,data)=>{
  if(type==='monster_hit')resolve(hit);
  broadcast(type,data);
 };
 r.monsterAttack('a',p);
 const hp=p.hp;
 assert.equal(p.hitSeq,1);
 assert.equal(r.prototypeFirmGuards.get('a').guard.remainingHits,1);
 assert.equal(book.practice.guard,1);
 assert.equal(events.filter(e=>e.type==='prototype_skill_v1' && e.data.phase==='protected').length,1);
 r.simulatedMs+=1500;
 resolve(hit);
 assert.equal(p.hp,hp);assert.equal(p.hitSeq,1);
 assert.equal(r.prototypeFirmGuards.get('a').guard.remainingHits,1);
 r.monsterAttack('a',p);
 assert.equal(p.hitSeq,2);assert.ok(p.hp<hp);
 assert.equal(r.prototypeFirmGuards.get('a').guard,undefined);
 assert.equal(book.practice.guard,2);
 assert.equal(events.filter(e=>e.type==='monster_hit').length,2);
}));

test('Firm Guard protects a party member behind the guardian and breaks on movement',wrap(()=>{
 const {r,p,m,book,cast,events}=firmGuardFixture();
 const ally=new Player({x:p.x,y:p.y,z:p.z+0.25,hp:1000,maxHp:1000,alive:true,mapId:p.mapId,level:1});
 r.state.players.set('ally',ally);
 r.clients.push({sessionId:'ally',send(){}});
 r.prototypeGameplaySessions.add('ally');
 const invite=r.parties.invite('a','ally',0);r.parties.accept('ally',invite.id,0);
 m.z=p.z-0.25;
 cast(1);r.monsterAttack('ally',ally);
 const first=events.find(e=>e.type==='monster_hit').data.damage;
 assert.ok(events.some(e=>e.type==='prototype_skill_v1' && e.data.phase==='protected' && e.data.targetId==='ally'));
 p.x+=0.1;
 r.updatePrototypeEffects();
 r.simulatedMs+=1500;r.monsterAttack('ally',ally);
 const second=events.filter(e=>e.type==='monster_hit').at(-1).data.damage;
 assert.ok(second>first);
 assert.equal(book.practice.guard,1);
}));

test('normal room keeps the existing Sentinel Firm Guard command',wrap(()=>{
 const {r,p,client,book}=firmGuardFixture();
 process.env.MONTRA_PROTOTYPE_GAMEPLAY='0';
 r.messages.sentinel_skill(client,{skillId:'firm_guard'});
 assert.equal(p.mana,78);
 assert.ok(book.cooldowns.firm_guard>Date.now());
 assert.equal(r.swordGuards.get('a').factor,.35);
}));

function deepHealFixture(hp=65.5){
 const setup=fixture('mender'),{r,p,client}=setup;
 const book=newOccultBook();book.learned.mender=['mender_heal','mender_deep_heal'];book.loadouts.mender[0]='mender_deep_heal';
 r.occultBooks.set('a',book);r.persistentCharacters.set('a','synthetic');
 p.hp=hp;p.maxHp=100;r.simulatedMs=10000;
 const attacker=new Player({pathId:'seer',x:p.x,y:p.y,z:p.z-1,mapId:p.mapId,hp:100,maxHp:100,alive:true});
 r.state.players.set('attacker',attacker);
 const cast=seq=>r.messages.prototype_protocol_v1(client,{action:'mender_deep_heal',targetId:'a',seq});
 return {...setup,book,cast};
}

test('Deep Heal observes real damage-over-time and consumes before healing once',wrap(()=>{
 const {r,p,client,events,book,cast}=deepHealFixture();
 r.messages.occult_skill(client,{skillId:'mender_deep_heal',targetId:'a'});assert.equal(p.mana,100);
 cast(1);cast(1);assert.equal(p.mana,82);assert.equal(p.hp,65.5);
 r.occultDamage('attacker','a',30,false,'dot');
 assert.equal(p.hp,52.5);assert.equal(book.mastery.mender.healing,1);
 const hit=events.findIndex(e=>e.type==='pvp_hit');
 const heal=events.findIndex(e=>e.data?.phase==='triggered');
 assert.ok(hit>=0 && heal>hit);assert.equal(events[hit].data.hp,35.5);
 assert.equal(events[heal].data.amount,17);
 assert.equal(r.prototypeRescues.size,0);
 r.occultDamage('attacker','a',30,false,'dot');assert.equal(p.hp,22.5);
 assert.equal(events.filter(e=>e.data?.phase==='triggered').length,1);
}));

test('Deep Heal expiry is capped, lethal damage cannot revive, and a warp invalidates the ward',wrap(()=>{
 const expiry=deepHealFixture(96.5);expiry.cast(1);
 expiry.r.simulatedMs+=5000;expiry.r.updateRescues();expiry.r.updateRescues();
 assert.equal(expiry.p.hp,100);assert.equal(expiry.events.find(e=>e.data?.phase==='expired').data.amount,3.5);
 const lethal=deepHealFixture(20);lethal.cast(1);
 lethal.r.occultDamage('attacker','a',120,false,'dot');
 assert.equal(lethal.p.hp,0);assert.equal(lethal.p.alive,false);assert.equal(lethal.r.prototypeRescues.size,0);
 assert.ok(!lethal.events.some(e=>e.data?.phase==='triggered'));
 const warp=deepHealFixture(30);warp.cast(1);warp.r.pendingWarps.add('a');warp.r.updateRescues();
 assert.equal(warp.p.hp,30);assert.equal(warp.r.prototypeRescues.size,0);
}));

test('Deep Heal follows the actual recipient of Sentinel interception',wrap(()=>{
 const {r,p,m,client,events}=deepHealFixture();
 const ally=new Player({pathId:'sentinel',x:p.x,y:p.y,z:p.z,mapId:p.mapId,alive:true,hp:50,maxHp:100});
 const protectedPlayer=new Player({x:p.x,y:p.y,z:p.z,mapId:p.mapId,alive:true,hp:100,maxHp:100});
 r.state.players.set('ally',ally);r.state.players.set('protected',protectedPlayer);
 for(const id of ['ally','protected']){
  r.clients.push({sessionId:id,send(){}});
  r.prototypeGameplaySessions.add(id);
 }
 let invite=r.parties.invite('a','ally',0);r.parties.accept('ally',invite.id,0);
 invite=r.parties.invite('a','protected',0);r.parties.accept('protected',invite.id,0);
 r.messages.prototype_protocol_v1(client,{action:'mender_deep_heal',targetId:'ally',seq:1});
 assert.equal(p.mana,82);assert.equal(ally.hp,50);
 r.sentinelInterceptions.set('protected',{ownerId:'ally',until:11000,fraction:.5});
 assert.equal(r.sentinelShareDamage('protected',m,40),20);
 assert.equal(ally.hp,47);assert.equal(protectedPlayer.hp,100);
 const intercept=events.find(e=>e.type==='sentinel_intercept');
 const heal=events.find(e=>e.data?.phase==='triggered');
 assert.equal(intercept.data.hp,30);assert.equal(heal.data.targetId,'ally');
 assert.ok(events.indexOf(intercept)<events.indexOf(heal));
}));

test('unconfirmed participants cannot bypass prototype admission with legacy commands',wrap(()=>{
 const {r,client,events,m}=fixture('phutthaisawan',false);
 const calls=[['sword_skill','flowing_blades'],['muay_skill','chaiya_advanced_counter'],['blade_skill','shadow_cut'],
  ['sentinel_skill','firm_guard'],['occult_skill','seer_ash_rice'],['occult_skill','mender_deep_heal']];
 for(const [command,skillId] of calls){
  r.simulatedMs+=1000;
  r.messages[command](client,{skillId,targetId:m.id});
 }
 assert.equal(events.filter(e=>e.type==='command_rejected'&&e.data.reason==='prototype_protocol_required').length,calls.length);
}));

test('a legacy Chaiya counter consumes the same block opportunity as the replacement',wrap(()=>{
 const {r,p,m,client,events,send}=fixture('muay_boran');
 const book=newMuayBook();book.learned=['counter','chaiya_advanced_counter'];book.slots[0]='counter';book.slots[1]='chaiya_advanced_counter';
 r.muayBooks.set('a',book);r.muayCooldowns.set('a',{});
 r.swordGuards.set('a',{until:1200,factor:.5,direction:true,counterUntil:0});
 r.directGuardDamage('a',m,100);
 assert.equal(r.prototypeOpportunities.get('a')?.attackerId,m.id);
 r.messages.muay_skill(client,{skillId:'counter',targetId:m.id});
 assert.ok(events.some(e=>e.type==='muay_skill_used'&&e.data.skillId==='counter'));
 const mana=p.mana,hp=m.hp;
 r.swordGuardDamage('a',m,100,0,undefined,false,'dot');
 send('chaiya_advanced_counter',1);
 assert.equal(p.mana,mana);
 assert.equal(m.hp,hp);
 assert.equal(r.prototypeDebuffs.has(m.id),false);
 r.simulatedMs=20;r.directGuardDamage('a',m,100);
 send('chaiya_advanced_counter',2);
 assert.equal(p.mana,mana-24);assert.ok(m.hp<hp);assert.ok(r.prototypeDebuffs.has(m.id));
}));

test('each replacement ID routes to exactly one version, while other IDs keep their normal command',wrap(()=>{
 const {r,client,events,m}=fixture('phutthaisawan');
 r.prototypeBuckets.set('a',{consume:()=>true});
 const families=[
  ['sword','castSwordSkill','flowing_blades'],['muay','castMuaySkill','chaiya_advanced_counter'],
  ['blade','castBladeSkill','shadow_cut'],['sentinel','castSentinelSkill','firm_guard'],
  ['occult','castOccultSkill','seer_ash_rice'],['occult','castOccultSkill','mender_deep_heal'],['occult','castOccultSkill','mender_deep_circle'],['occult','castOccultSkill','seer_spirit_rain']
 ];
 const routed=[];
 for(const [,method] of families)r[method]=(_client,message,sequence)=>routed.push({method,message,sequence});
 let seq=0;
 for(const [family,method,skillId] of families){
  r.simulatedMs+=1000;
  const targets=['firm_guard','mender_deep_circle'].includes(skillId)?{}:{targetId:m.id};
  const message={skillId,...targets};
  r.messages[family+'_skill'](client,message);
  assert.equal(routed.length,seq);
  r.messages.prototype_protocol_v1(client,{action:skillId,seq:++seq,...targets});
  assert.deepEqual(routed.at(-1),{method,message,sequence:seq});
  assert.equal(routed.length,seq);
 }
 assert.equal(events.filter(e=>e.type==='command_rejected'&&e.data.reason==='prototype_protocol_required').length,families.length);
 const twinCut={skillId:'twin_cut',targetId:m.id};
 r.messages.prototype_protocol_v1(client,{action:'twin_cut',seq:++seq,targetId:m.id});
 assert.equal(routed.length,families.length);
 r.messages.sword_skill(client,twinCut);
 assert.deepEqual(routed.at(-1),{method:'castSwordSkill',message:twinCut,sequence:undefined});
 process.env.MONTRA_PROTOTYPE_GAMEPLAY='0';
 for(const [family,method,skillId] of families){
  const message={skillId,targetId:m.id};
  r.messages[family+'_skill'](client,message);
  assert.deepEqual(routed.at(-1),{method,message,sequence:undefined});
 }
 assert.equal(routed.length,2*families.length+1);
}));

function movingCircleFixture(){
 const setup=fixture('mender'),{r,p,client}=setup;
 const book=newOccultBook();
 book.learned.mender=['mender_heal','mender_ward','mender_area','mender_shelter','mender_deep_circle'];
 book.loadouts.mender=['mender_area','mender_deep_circle',null,null];
 r.occultBooks.set('a',book);r.persistentCharacters.set('a','synthetic');
 r.prototypeBuckets.set('a',{consume:()=>true});
 p.hp=75;p.maxHp=100;r.simulatedMs=10000;
 const cast=seq=>r.messages.prototype_protocol_v1(client,{action:'mender_deep_circle',seq});
 return {...setup,book,cast};
}

test('Deep Circle replaces its immediate heal with one moving, prioritized pulse',wrap(()=>{
 const {r,p,client,events,book,cast}=movingCircleFixture();
 const add=(id,hp,inParty=true)=>{
  const member=new Player({pathId:'mender',x:p.x+12,y:p.y,z:p.z,mapId:p.mapId,hp,maxHp:100,alive:true});
  r.state.players.set(id,member);
  if(inParty){
   const invite=r.parties.invite('a',id,r.simulatedMs);
   r.parties.accept(id,invite.id,r.simulatedMs);
  }
  return member;
 };
 const critical=add('critical',20),injured=add('injured',35),hurt=add('hurt',55),outsider=add('outsider',10,false);
 r.messages.occult_skill(client,{skillId:'mender_deep_circle'});
 assert.equal(p.mana,100);
 r.messages.prototype_protocol_v1(client,{action:'mender_deep_circle',seq:1,targetId:'critical'});
 assert.equal(p.mana,100,'the replacement does not accept a target');
 cast(1);cast(1);
 assert.equal(p.mana,70);assert.equal(p.hp,75);assert.ok(book.cooldowns.mender_deep_circle>Date.now());
 assert.equal(events.filter(e=>e.type==='occult_skill_used').length,0);
 p.x+=12;
 r.simulatedMs=11999;r.updateOccultEffects();
 assert.equal(critical.hp,20);
 r.simulatedMs=12000;r.updateOccultEffects();r.updateOccultEffects();
 assert.deepEqual([critical.hp,injured.hp,hurt.hp,p.hp,outsider.hp],[26,41,61,75,10]);
 const pulse=events.filter(e=>e.type==='prototype_skill_v1'&&e.data.phase==='pulse');
 assert.equal(pulse.length,1);
 assert.deepEqual(pulse[0].data.targetIds,['critical','injured','hurt']);
 assert.equal(pulse[0].data.amount,18);
 r.messages.prototype_protocol_v1(client,{action:'occult_state'});
 const snapshot=events.find(e=>e.type==='prototype_occult_v1_state').data;
 assert.equal(snapshot.circles[0].position.x,p.x);
 assert.equal(snapshot.circles[0].castId,pulse[0].data.castId);
}));

test('Deep Circle shares the caster field slot and keeps the basic stationary heal',wrap(()=>{
 const {r,p,client,events,cast}=movingCircleFixture();
 cast(1);assert.equal(r.occultHealingFields.get('a').kind,'moving');
 r.messages.occult_skill(client,{skillId:'mender_area'});
 assert.equal(p.mana,50);assert.equal(p.hp,84);
 assert.equal(r.occultHealingFields.get('a').kind,'fixed');
 assert.equal(events.filter(e=>e.type==='prototype_skill_v1' && e.data.phase==='cleared').length,1);
 r.simulatedMs=12000;r.updateOccultEffects();
 assert.equal(p.hp,87);
 assert.equal(events.some(e=>e.type==='prototype_skill_v1' && e.data.phase==='pulse'),false);
}));

test('Deep Circle skips missed pulses and stops when the caster starts a warp',wrap(()=>{
 const {r,p,events,cast}=movingCircleFixture();
 cast(1);
 r.simulatedMs=14500;r.updateOccultEffects();r.updateOccultEffects();
 assert.equal(p.hp,81,'one late pulse, no catch-up');
 r.pendingWarps.add('a');
 r.simulatedMs=16500;r.updateOccultEffects();r.updateOccultEffects();
 assert.equal(p.hp,81);assert.equal(r.occultHealingFields.has('a'),false);
 assert.equal(events.filter(e=>e.type==='prototype_skill_v1' && e.data.phase==='cleared').length,1);
}));

test('normal rooms retain the old Deep Circle under the same saved ID',wrap(()=>{
 const {r,p,client,events,book,cast}=movingCircleFixture();
 process.env.MONTRA_PROTOTYPE_GAMEPLAY='0';
 cast(1);assert.equal(p.mana,100);
 r.messages.occult_skill(client,{skillId:'mender_deep_circle'});
 assert.equal(p.mana,70);assert.equal(p.hp,85);
 assert.ok(book.cooldowns.mender_deep_circle>Date.now());
 assert.equal(r.occultHealingFields.get('a').kind,'fixed');
 assert.ok(events.some(e=>e.type==='occult_skill_used' && e.data.skillId==='mender_deep_circle'));
}));

function spiritRainFixture(){
 const setup=fixture('seer'),{r,m,p,client}=setup;
 const book=newOccultBook();
 book.learned.seer=['seer_mark','seer_rice','seer_scatter','seer_spirit_rain'];
 book.loadouts.seer=['seer_mark','seer_scatter','seer_spirit_rain',null];
 r.occultBooks.set('a',book);r.persistentCharacters.set('a','synthetic');
 r.prototypeBuckets.set('a',{consume:()=>true});
 r.simulatedMs=10000;
 p.magicAtk=100;
 Object.assign(m,{defense:0,level:1});
 const add=(id,dx,options={})=>{
  const monster=new Monster({id,x:m.x+dx,y:m.y,z:m.z,mapId:m.mapId,hp:10000,maxHp:10000,defense:0,level:1,alive:true,...options});
  r.state.monsters.set(id,monster);return monster;
 };
 const mark=(target=m,until=r.simulatedMs+8000)=>r.occultMarks.set('a',{targetId:target.id,until});
 return {...setup,book,add,mark};
}

test('Spirit Rain spends one valid mark and chains from each previous monster once',wrap(()=>{
 const {r,p,m,client,events,book,add,mark,send}=spiritRainFixture();
 const bridge=add('forest_west_1',4),far=add('forest_west_2',8),blocked=add('forest_west_3',2);
 const otherMap=add('forest_west_4',1,{mapId:'other'});
 r.bodyPathClear=(_map,from,to)=>from===p || to!==blocked;
 r.messages.occult_skill(client,{skillId:'seer_spirit_rain',targetId:m.id});
 assert.equal(p.mana,100,'legacy packet cannot bypass replacement');
 send('seer_spirit_rain',1);assert.equal(p.mana,100);
 mark(bridge);send('seer_spirit_rain',2);assert.equal(p.mana,100);
 mark(m,r.simulatedMs);send('seer_spirit_rain',3);assert.equal(p.mana,100);
 assert.equal(book.cooldowns.seer_spirit_rain,undefined);
 mark();const before=[m.hp,bridge.hp,far.hp];
 send('seer_spirit_rain',4);send('seer_spirit_rain',4);
 assert.equal(p.mana,66);assert.equal(r.occultMarks.has('a'),false);
 assert.ok(book.cooldowns.seer_spirit_rain>Date.now());
 assert.deepEqual([m.hitSeq,bridge.hitSeq,far.hitSeq,blocked.hitSeq,otherMap.hitSeq],[1,1,1,0,0]);
 const [first,second,third]=[m,bridge,far].map((monster,index)=>before[index]-monster.hp);
 assert.ok(first>second && second>third && third>0);
 const cast=events.filter(e=>e.type==='prototype_skill_v1' && e.data.skillId==='seer_spirit_rain');
 assert.equal(cast.length,1);assert.equal(cast[0].data.phase,'chained');
 assert.deepEqual(cast[0].data.targetIds,[m.id,bridge.id,far.id]);
 assert.equal(events.some(e=>e.type==='occult_skill_used' && e.data.skillId==='seer_spirit_rain'),false);
}));

test('Scatter keeps its original nearby-target behavior and normal rooms keep legacy Spirit Rain',wrap(()=>{
 const {r,p,m,client,events,add,send}=spiritRainFixture();
 const nearby=add('forest_west_1',2),far=add('forest_west_2',5);
 r.messages.occult_skill(client,{skillId:'seer_scatter',targetId:m.id});
 assert.equal(p.mana,76);assert.deepEqual([m.hitSeq,nearby.hitSeq,far.hitSeq],[1,1,0]);
 assert.equal(r.occultMarks.has('a'),false);

 process.env.MONTRA_PROTOTYPE_GAMEPLAY='0';
 send('seer_spirit_rain',1);assert.equal(p.mana,76);
 r.messages.occult_skill(client,{skillId:'seer_spirit_rain',targetId:m.id});
 assert.equal(p.mana,42);assert.deepEqual([m.hitSeq,nearby.hitSeq,far.hitSeq],[2,2,0]);
 assert.ok(events.some(e=>e.type==='occult_skill_used'&&e.data.skillId==='seer_spirit_rain'));
 assert.equal(events.some(e=>e.type==='prototype_skill_v1'),false);
}));
