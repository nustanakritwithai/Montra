import {assertTestChildRunning,stopTestChild,leaveTestRoom,joinTestRoom,armTestDeadline} from './prototype-test-process.mjs';
/** Synthetic loopback test only. No production process, credentials or player data. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';import {createHash,randomBytes} from 'node:crypto';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';import {Client} from '@colyseus/sdk';
armTestDeadline();
const delay=ms=>new Promise(r=>setTimeout(r,ms));const until=async(fn,label,ms=10000)=>{const end=Date.now()+ms;while(Date.now()<end){const x=fn();if(x)return x;await delay(20);}throw Error('timeout: '+label);};
const home=await mkdtemp(path.join(os.tmpdir(),'montra-prototype-shadow-'));const chars=path.join(home,'characters');await mkdir(chars);
const token='mt1_'+randomBytes(32).toString('hex'),id=createHash('sha256').update(token).digest('hex');
const book={learned:['cloak','hidden_edge','shadow_cut'],slots:['shadow_cut',null,null,null],practice:{ambush:15,mark:4,evade:0,combo:0},cooldowns:{}};
await writeFile(path.join(chars,id+'.json'),JSON.stringify({version:1,id,name:'Prototype blade',level:40,experience:0,pkKills:0,pkDeaths:0,x:1.1,y:0,z:8.5,hp:500,mapId:'ritual_village',build:{path:'blade',ancestry:'woodland'},bladeBook:book,inventory:{version:1,slots:[{itemId:'ritual_dagger',quantity:1},...new Array(11).fill(null)],equippedWeaponSlot:0},updatedAt:new Date().toISOString()}),{flag:'wx'});
async function seedDuelist(name,build,x,hp,weapon,skills) {
 const token='mt1_'+randomBytes(32).toString('hex');
 const id=createHash('sha256').update(token).digest('hex');
 const inventory={version:1,slots:[{itemId:weapon,quantity:1},...new Array(11).fill(null)],equippedWeaponSlot:0};
 await writeFile(path.join(chars,id+'.json'),JSON.stringify({version:1,id,name,level:40,experience:0,pkKills:0,pkDeaths:0,x,y:0,z:0,hp,mapId:'ritual_village',build,inventory,...skills,updatedAt:new Date().toISOString()}),{flag:'wx'});
 return {guestToken:token,prototypeProtocolVersion:1,prototypeGameplayVersion:1};
}
const bladeOptions=await seedDuelist('Duel blade',{path:'blade',ancestry:'woodland'},-12,1,'ritual_dagger',{bladeBook:book});
const swordOptions=await seedDuelist('Duel sword',{path:'phutthaisawan',ancestry:'woodland'},-13,500,'arcane_sword',{});
const env={NODE_ENV:'test',HOME:home,TMPDIR:home,MONTRA_TEST_SANDBOX:home,MONTRA_CHARACTER_DIR:chars,MONTRA_ACCOUNTS_REQUIRED:'0',MONTRA_ECONOMY_ENABLED:'0',MONTRA_WORLD_EXPANSION:'0',MONTRA_HUNT_EVENTS:'0',MONTRA_DIRECTOR_ENABLED:'0',MONTRA_DIRECTOR_PERSIST:'0',MONTRA_ISOLATED_STAGING:'1',MONTRA_PROTOTYPE_PROTOCOL_V1:'1',MONTRA_PROTOTYPE_GAMEPLAY:'1'};
const entry=fileURLToPath(new URL('./src/rooms/prototype-gameplay-test-server.ts',import.meta.url));let output='';const child=spawn(process.execPath,['--import',import.meta.resolve('tsx'),entry],{cwd:home,env,stdio:['ignore','pipe','pipe']});child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);let spawnError;child.on('error',error=>{spawnError=error;});let room,bladeRoom,swordRoom;
try{
 const port=await until(()=>{assertTestChildRunning(child,spawnError,output);return output.match(/PROTOTYPE_TEST_PORT=(\d+)/)?.[1];},'server',20000);const sdk=new Client('http://127.0.0.1:'+port);
 room=await joinTestRoom(()=>sdk.create('my_room',{guestToken:token,prototypeProtocolVersion:1,prototypeGameplayVersion:1}));room.reconnection.enabled=false;
 const events=[];room.onMessage('*',(type,data)=>events.push({type,data}));
 const ready=(await until(()=>events.find(e=>e.type==='prototype_protocol_v1_ready'),'ready')).data;assert.equal(ready.gameplayEnabled,true);
 room.send('prototype_protocol_v1',{action:'confirm_gameplay',nonce:ready.nonce});await until(()=>events.find(e=>e.type==='prototype_protocol_v1_confirmed'),'confirmed');
 await until(()=>room.state?.players?.get(room.sessionId)?.persistent,'player');
 const player=()=>room.state.players.get(room.sessionId),monster=()=>room.state.monster;const origin={x:1.1,y:0,z:8.5,mapId:"ritual_village"},before=player().mana;assert.ok(Math.abs(player().x-origin.x)<1e-5);
 room.send('prototype_protocol_v1',{seq:1,action:'shadow_cut',targetId:monster().id});const marked=(await until(()=>events.find(e=>e.type==='prototype_skill_v1'&&e.data.phase==='marked'),'marked')).data;const afterCast=player().mana;
 // The exact charge is covered by the room test. A WebSocket patch can also include regen ticks.
 assert.ok(afterCast>=before-22-1e-4 && afterCast<=before-21,'one 22-mana charge with bounded regeneration');assert.deepEqual(marked.origin,origin);assert.equal(marked.markSeq,1);assert.equal(marked.durationMs,3000);assert.equal(marked.expiresAtServerMs-marked.serverNowMs,3000);assert.equal(marked.startedAtServerMs,marked.serverNowMs);
 const hp=monster().hp;room.send('prototype_protocol_v1',{seq:1,action:'shadow_cut',targetId:monster().id});await delay(100);assert.equal(monster().hp,hp,'replay cannot strike');
 room.send('move',{x:origin.x+0.8,z:origin.z});await until(()=>Math.abs(player().x-origin.x)>.45,'move away',1800);
 const mana=player().mana;room.send('prototype_protocol_v1',{seq:2,action:'shadow_cut_return'});const returned=(await until(()=>events.find(e=>e.type==='prototype_skill_v1'&&e.data.phase==='return'),'return',1800)).data;assert.deepEqual(returned.origin,origin);assert.deepEqual(returned.destination,origin);assert.equal(returned.expiresAtServerMs,marked.expiresAtServerMs);assert.ok(returned.serverNowMs>=marked.serverNowMs && returned.serverNowMs<returned.expiresAtServerMs);
 await until(()=>Math.hypot(player().x-origin.x,player().z-origin.z)<.1,'returned position');assert.ok(player().mana>=mana-.1,'return does not charge');
 room.send('prototype_protocol_v1',{seq:2,action:'shadow_cut_return'});await delay(150);assert.equal(events.filter(e=>e.type==='prototype_skill_v1'&&e.data.phase==='return').length,1);assert.equal(returned.markSeq,marked.markSeq);
 await delay(1100);room.send('prototype_protocol_v1',{action:'shadow_state'});
 const snapshot=(await until(()=>events.find(e=>e.type==='prototype_shadow_v1_state'),'shadow state')).data;
 assert.deepEqual(snapshot.marks,[]);assert.ok(snapshot.serverNowMs>=returned.serverNowMs);
 console.log('PASS: isolated shadow hit, one cost, movement, return and replay');
 await leaveTestRoom(room);room=undefined;

 async function confirmDuelist(duelist){
  duelist.reconnection.enabled=false;
  const events=[];duelist.onMessage('*',(type,data)=>events.push({type,data}));
  const ready=(await until(()=>events.find(e=>e.type==='prototype_protocol_v1_ready'),'duel ready')).data;
  assert.equal(ready.gameplayEnabled,true);
  duelist.send('prototype_protocol_v1',{action:'confirm_gameplay',nonce:ready.nonce});
  await until(()=>events.find(e=>e.type==='prototype_protocol_v1_confirmed'),'duel confirmed');
  return events;
 }
 bladeRoom=await joinTestRoom(()=>sdk.create('my_room',bladeOptions));
 const bladeEvents=await confirmDuelist(bladeRoom);
 swordRoom=await joinTestRoom(()=>sdk.joinById(bladeRoom.roomId,swordOptions));
 const swordEvents=await confirmDuelist(swordRoom);
 const bladeId=bladeRoom.sessionId,swordId=swordRoom.sessionId;
 const duelists=[bladeRoom,swordRoom];
 await until(()=>duelists.every(r=>[bladeId,swordId].every(id=>r.state?.players?.get(id)?.persistent)),'both duelists loaded');
 assert.ok(Math.abs(bladeRoom.state.players.get(bladeId).x+12)<1e-5,'blade at fixture position');
 assert.ok(Math.abs(bladeRoom.state.players.get(swordId).x+13)<1e-5,'sword at fixture position');
 swordRoom.send('sword_core_skill',{skillId:'sritra_core'});
 await until(()=>swordEvents.find(e=>e.type==='sword_skill_used'&&e.data.skillId==='sritra_core'),'sword counter stance');
 bladeRoom.send('prototype_protocol_v1',{seq:1,action:'shadow_cut',targetId:swordId});
 await until(()=>duelists.every(r=>r.state.players.get(bladeId).alive===false && r.state.players.get(swordId).pkKills===1),'lethal sword counter');
 bladeRoom.send('prototype_protocol_v1',{seq:1,action:'shadow_cut',targetId:swordId});
 bladeRoom.send('prototype_protocol_v1',{action:'shadow_state'});
 await until(()=>[bladeEvents,swordEvents].every(events=>events.some(e=>e.type==='pvp_kill')),'kill notice to both clients');
 const duelState=(await until(()=>bladeEvents.find(e=>e.type==='prototype_shadow_v1_state'),'duel shadow state')).data;
 assert.deepEqual(duelState.marks,[]);
 for(const events of [bladeEvents,swordEvents]){
  const kills=events.filter(e=>e.type==='pvp_kill').map(e=>[e.data.winnerId,e.data.loserId]);
  assert.deepEqual(kills,[[swordId,bladeId]]);
  const hits=events.filter(e=>e.type==='pvp_hit').map(e=>[e.data.attackerId,e.data.targetId]);
  assert.deepEqual(hits,[[swordId,bladeId]]);
  assert.equal(events.filter(e=>e.type==='prototype_skill_v1'&&e.data.phase==='marked').length,0);
 }
 assert.equal(bladeRoom.state.players.get(bladeId).pkDeaths,1);
 assert.equal(bladeRoom.state.players.get(swordId).hitSeq,0);
 console.log('PASS: lethal sword counter cancels the original shadow hit and mark, with one kill visible to both clients');
}catch(e){throw Error(String(e)+'\nServer output:\n'+output);}finally{await Promise.all([room,bladeRoom,swordRoom].filter(Boolean).map(r=>leaveTestRoom(r).catch(()=>{})));try{await stopTestChild(child);}finally{await rm(home,{recursive:true,force:true});}}
