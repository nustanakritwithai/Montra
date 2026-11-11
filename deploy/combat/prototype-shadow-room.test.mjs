import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PrototypeTestRoom} from './src/rooms/PrototypeTestRoom.js';
import {Player} from './src/rooms/schema/MyRoomState.js';
import {newBladeBook} from './src/rooms/BladeRules.js';
const keys=['NODE_ENV','MONTRA_ISOLATED_STAGING','MONTRA_PROTOTYPE_PROTOCOL_V1','MONTRA_PROTOTYPE_GAMEPLAY'];
const wrap=fn=>async()=>{const old=keys.map(k=>process.env[k]);Object.assign(process.env,{NODE_ENV:'test',MONTRA_ISOLATED_STAGING:'1',MONTRA_PROTOTYPE_PROTOCOL_V1:'1',MONTRA_PROTOTYPE_GAMEPLAY:'1'});try{await fn();}finally{keys.forEach((k,i)=>old[i]===undefined?delete process.env[k]:process.env[k]=old[i]);}};
function fixture(){
 const r=new PrototypeTestRoom(true),events=[],client={sessionId:'a',send:(type,data)=>events.push({type,data})};r.clients.push(client);r.broadcast=(type,data)=>events.push({type,data});r.saveCharacter=()=>Promise.resolve();r.sendBladeBook=()=>{};
 const p=new Player({pathId:'blade',x:-20,z:-20,y:0,hp:1000,maxHp:1000,mana:100,maxMana:100,alive:true});r.state.players.set('a',p);r.persistentCharacters.set('a','fixture');
 const m=r.state.monster;Object.assign(m,{x:-20,z:-21,y:0,hp:100000,maxHp:100000,alive:true,tier:'normal',mapId:p.mapId});
 const book=newBladeBook();book.learned=['cloak','hidden_edge','shadow_cut'];book.slots=['shadow_cut',null,null,null];r.bladeBooks.set('a',book);
 r.blockMounted=()=>false;r.hotbarCastAllowed=()=>true;r.spellCaster=()=>p;r.sameCombatMap=()=>true;r.bodyPathClear=()=>true;r.combatSegmentClear=()=>true;r.canOccupy=()=>true;
 r.acknowledgePrototypeProtocol(client,{prototypeProtocolVersion:1,prototypeGameplayVersion:1});r.prototypeBuckets.set('a',{consume:()=>true});
 r.messages.prototype_protocol_v1(client,{action:'confirm_gameplay',nonce:events[0].data.nonce});
 return {r,p,m,book,client,events,send:(action,seq,targetId)=>r.messages.prototype_protocol_v1(client,targetId===undefined?{action,seq}:{action,seq,targetId})};
}
test('shadow hit commits one cost, locks legacy route, and returns exactly once',wrap(()=>{
 const {r,p,m,book,events,client,send}=fixture();const start={x:p.x,z:p.z};send('shadow_cut',1,m.id);assert.equal(p.mana,78);assert.ok(book.cooldowns.shadow_cut>Date.now());assert.ok(events.some(e=>e.type==='prototype_skill_v1'&&e.data.phase==='marked'));const hp=m.hp;
 send('shadow_cut',1,m.id);assert.equal(m.hp,hp);assert.equal(p.mana,78);r.messages.blade_skill(client,{skillId:'shadow_cut',targetId:m.id});assert.ok(events.some(e=>e.type==='command_rejected'&&e.data.reason==='prototype_protocol_required'));
 p.x+=1;send('shadow_cut_return',2);assert.deepEqual({x:p.x,z:p.z},start);assert.equal(p.mana,78);assert.equal(events.filter(e=>e.type==='prototype_skill_v1'&&e.data.phase==='return').length,1);
 send('shadow_cut_return',2);send('shadow_cut_return',3);assert.equal(events.filter(e=>e.type==='prototype_skill_v1'&&e.data.phase==='return').length,1);
}));
test('miss, invalid target, forged position, and unavailable skill never create a mark',wrap(()=>{
 for(const scenario of ['miss','range','forged','locked']){
  const {r,p,m,book,events,client,send}=fixture();
  if(scenario==='miss')r.bladeDamage=()=>false;
  if(scenario==='range')m.x+=10;
  if(scenario==='locked')book.learned=[];
  if(scenario==='forged')r.messages.prototype_protocol_v1(client,{action:'shadow_cut',seq:1,targetId:m.id,x:999});else send('shadow_cut',1,m.id);
  assert.ok(!r.prototypeShadows.get('a')?.mark);assert.equal(events.some(e=>e.type==='prototype_skill_v1'),false);
  assert.equal(p.mana,scenario==='miss'?78:100);
 }
}));
test('blocked path, expiry and lifecycle invalidate safely without moving or charging again',wrap(()=>{
 const {r,p,m,events,send}=fixture();send('shadow_cut',1,m.id);p.x+=1;
 r.canOccupy=x=>x!==-20;send('shadow_cut_return',2);assert.equal(p.x,-19);assert.ok(r.prototypeShadows.get('a').mark);
 r.canOccupy=()=>true;r.simulatedMs=3000;send('shadow_cut_return',3);assert.equal(p.x,-19);assert.equal(r.prototypeShadows.get('a').mark,undefined);assert.equal(p.mana,78);
 r.prototypeShadows.get('a').mark={point:{x:-20,y:0,z:-20,mapId:p.mapId},until:9999,sequence:1};r.clearPrototypeTransient('a');assert.equal(r.prototypeShadows.get('a').mark,undefined);assert.equal(events.some(e=>e.type==='prototype_skill_v1'&&e.data.phase==='return'),false);
}));
test('original server position remains the mark and unsafe map/height return fails',wrap(()=>{
 const {r,p,m,send}=fixture(),original=r.bladeDamage.bind(r);r.bladeDamage=(...args)=>{const result=original(...args);p.x+=1;return result;};send('shadow_cut',1,m.id);assert.equal(r.prototypeShadows.get('a').mark.point.x,-20);
 p.y=2;send('shadow_cut_return',2);assert.equal(p.x,-19);p.y=0;p.mapId='other';send('shadow_cut_return',3);assert.equal(r.prototypeShadows.get('a').mark,undefined);
}));
test('range sweep checks beyond one dash length and rejects a mid-path obstacle',wrap(()=>{
 const {r,p,m,send}=fixture();send('shadow_cut',1,m.id);p.x=-15.2;
 let samples=0;r.canOccupy=x=>{samples++;return !(x<-17.5 && x>-17.7);};send('shadow_cut_return',2);assert.equal(p.x,-15.2);assert.ok(samples>10);
 r.canOccupy=()=>true;send('shadow_cut_return',3);assert.ok(Math.abs(p.x+20)<0.001);
}));
test('resource, authority and target failures do not charge or deal damage',wrap(()=>{
 for(const scenario of ['mana','class','ally','dead']){
  const {r,p,m,book,send}=fixture(),hp=m.hp;
  if(scenario==='mana')p.mana=0;if(scenario==='class')p.pathId='sentinel';if(scenario==='ally')r.sameCombatMap=()=>false;if(scenario==='dead')m.alive=false;
  send('shadow_cut',1,m.id);assert.equal(m.hp,hp);assert.equal(p.mana,scenario==='mana'?0:100);assert.equal(book.cooldowns.shadow_cut,undefined);assert.equal(r.prototypeShadows.get('a')?.mark,undefined);
 }
}));
test('failed hit after paid attempt does not announce or place a mark',wrap(()=>{
 const {r,p,m,events,send}=fixture();r.bladeDamage=()=>{p.alive=false;return false;};send('shadow_cut',1,m.id);
 assert.equal(p.mana,78);assert.equal(r.prototypeShadows.get('a')?.mark,undefined);assert.equal(events.some(e=>e.type==='prototype_skill_v1'),false);
}));
test('shadow events retain server-captured position and simulation deadlines across delayed delivery',wrap(()=>{
 const {r,p,m,events,send}=fixture(),original=r.bladeDamage.bind(r);r.simulatedMs=1250;
 r.bladeDamage=(...args)=>{const hit=original(...args);p.x+=1;return hit;};send('shadow_cut',1,m.id);
 const marked=events.find(e=>e.type==='prototype_skill_v1'&&e.data.phase==='marked').data;
 const origin={x:-20,y:0,z:-20,mapId:p.mapId};
 assert.deepEqual(marked,{version:1,phase:'marked',playerId:'a',targetId:m.id,skillId:'shadow_cut',seq:1,markSeq:1,origin,serverNowMs:1250,startedAtServerMs:1250,expiresAtServerMs:4250,durationMs:3000});
 // Fake a queued event arriving after the actor and the in-memory mark have changed.
 r.prototypeShadows.get('a').mark.point.x=-20.5;assert.equal(marked.origin.x,-20);
 r.prototypeShadows.get('a').mark.point.x=-20;r.simulatedMs=4000;
 assert.equal(marked.expiresAtServerMs-r.simulatedMs,250);
 send('shadow_cut_return',2);const returned=events.find(e=>e.type==='prototype_skill_v1'&&e.data.phase==='return').data;
 assert.deepEqual(returned,{version:1,phase:'return',playerId:'a',targetId:'',skillId:'shadow_cut',seq:2,markSeq:1,origin,serverNowMs:4000,startedAtServerMs:1250,expiresAtServerMs:4250,durationMs:3000,destination:origin});
 p.x=10;assert.equal(returned.destination.x,-20);assert.equal(returned.origin.x,-20);
}));

test('shadow state can be reconciled and an expired mark closes exactly once',wrap(()=>{
 const {r,p,m,events,client,send}=fixture();
 send('shadow_cut',1,m.id);
 const read=()=>{r.messages.prototype_protocol_v1(client,{action:'shadow_state'});return events.findLast(e=>e.type==='prototype_shadow_v1_state')?.data;};
 const initial=read();
 assert.deepEqual(initial.marks.map(x=>[x.playerId,x.markSeq,x.expiresAtServerMs]),[['a',1,3000]]);
 r.simulatedMs=3000;r.updatePrototypeEffects();r.updatePrototypeEffects();
 const terminal=events.filter(e=>e.type==='prototype_skill_v1'&&e.data.phase==='cleared');
 assert.equal(terminal.length,1);assert.equal(terminal[0].data.markSeq,1);assert.equal(terminal[0].data.reason,'expired');
 assert.deepEqual(read(),{version:1,serverNowMs:3000,marks:[]});
 assert.equal(p.mana,78);
}));

test('real PvP counter defeats Shadow Cut without a hit or return mark',wrap(()=>{
 const {r,p,events,book,send}=fixture();
 p.hp=1;
 const defender=new Player({pathId:'phutthaisawan',x:p.x,y:p.y,z:p.z-1,mapId:p.mapId,hp:1000,maxHp:1000,alive:true});
 r.state.players.set('victim1',defender);
 const observer={sessionId:'victim1',send:(type,data)=>events.push({type,data})};
 r.clients.push(observer);
 r.acknowledgePrototypeProtocol(observer,{prototypeProtocolVersion:1,prototypeGameplayVersion:1});
 const ready=events.findLast(e=>e.type==='prototype_protocol_v1_ready');
 r.messages.prototype_protocol_v1(observer,{action:'confirm_gameplay',nonce:ready.data.nonce});
 r.inventories.set('victim1',{version:1,slots:[{itemId:'arcane_sword',quantity:1}],equippedWeaponSlot:0});
 r.swordCoreStances.set('victim1',{until:1000,rank:0,nextCounter:0});
 send('shadow_cut',1,'victim1');send('shadow_cut',1,'victim1');
 assert.equal(p.alive,false);assert.equal(p.mana,78);assert.ok(book.cooldowns.shadow_cut>Date.now());
 assert.equal(p.pkDeaths,1);assert.equal(defender.pkKills,1);assert.equal(defender.hp,1000);
 assert.equal(r.prototypeShadows.get('a')?.mark,undefined);
 assert.equal(events.some(e=>e.type==='prototype_skill_v1'),false);
 assert.deepEqual(events.filter(e=>e.type==='pvp_hit').map(e=>e.data.attackerId),['victim1']);
}));
