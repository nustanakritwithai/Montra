import {assertTestChildRunning,stopTestChild,leaveTestRoom,joinTestRoom,armTestDeadline,isPrototypeAdmissionRejection} from './prototype-test-process.mjs';
/** Isolated loopback only. This does not establish client presentation or release readiness. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';import {createHash,randomBytes} from 'node:crypto';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';import {Client} from '@colyseus/sdk';
armTestDeadline();
const delay=ms=>new Promise(r=>setTimeout(r,ms));const until=async(fn,label,ms=10000)=>{const end=Date.now()+ms;while(Date.now()<end){const x=fn();if(x)return x;await delay(20);}throw Error('timeout: '+label);};
const home=await mkdtemp(path.join(os.tmpdir(),'montra-prototype-gameplay-'));const chars=path.join(home,'characters');await mkdir(chars);
const token='mt1_'+randomBytes(32).toString('hex'),id=createHash('sha256').update(token).digest('hex');
await writeFile(path.join(chars,id+'.json'),JSON.stringify({version:1,id,name:'Prototype sword',level:40,experience:0,pkKills:0,pkDeaths:0,x:1.1,y:0,z:8.5,hp:500,mapId:'ritual_village',build:{path:'phutthaisawan',ancestry:'woodland'},swordTree:{school:'phutthaisawan',learned:['footwork','guard','sweep','rhythm','flowing_blades'],cooldowns:{},training:{strikes:50,blocks:3,finishes:0},loadouts:{phutthaisawan:['flowing_blades',null,null],sritrairat:[null,null,null],atamat:[null,null,null],chumphon:[null,null,null]}},inventory:{version:1,slots:[{itemId:'arcane_sword',quantity:1},...new Array(11).fill(null)],equippedWeaponSlot:0},updatedAt:new Date().toISOString()}),{flag:'wx'});
const sentinelToken='mt1_'+randomBytes(32).toString('hex'),sentinelId=createHash('sha256').update(sentinelToken).digest('hex');
const sentinelBook={learned:['guard','fortitude','firm_guard'],slots:['firm_guard',null,null,null],practice:{guard:15,stun:0,assist:0},cooldowns:{}};
await writeFile(path.join(chars,sentinelId+'.json'),JSON.stringify({version:1,id:sentinelId,name:'Prototype Sentinel',
 level:40,experience:0,pkKills:0,pkDeaths:0,x:1.1,y:0,z:11.6,hp:500,mapId:'ritual_village',
 build:{path:'sentinel',ancestry:'woodland'},sentinelBook,updatedAt:new Date().toISOString()}),{flag:'wx'});
const seerToken='mt1_'+randomBytes(32).toString('hex'),seerId=createHash('sha256').update(seerToken).digest('hex');
const seerBook={learned:{seer:['seer_mark','seer_rice','seer_ash_rice'],mender:[]},
 loadouts:{seer:['seer_ash_rice',null,null,null],mender:[null,null,null,null]},training:{seer:40,mender:0},cooldowns:{}};
await writeFile(path.join(chars,seerId+'.json'),JSON.stringify({version:1,id:seerId,name:'Prototype Seer',
 level:40,experience:0,pkKills:0,pkDeaths:0,x:1.1,y:0,z:11.6,hp:500,mapId:'ritual_village',
 build:{path:'seer',ancestry:'woodland'},occultBook:seerBook,updatedAt:new Date().toISOString()}),{flag:'wx'});
const rainToken='mt1_'+randomBytes(32).toString('hex'),rainId=createHash('sha256').update(rainToken).digest('hex');
const rainBook={learned:{seer:['seer_mark','seer_rice','seer_scatter','seer_burst','seer_curse','seer_ash_rice','seer_deep_curse','seer_ward_break','seer_spirit_rain'],mender:[]},
 loadouts:{seer:['seer_mark','seer_spirit_rain',null,null],mender:[null,null,null,null]},training:{seer:135,mender:0},cooldowns:{}};
await writeFile(path.join(chars,rainId+'.json'),JSON.stringify({version:1,id:rainId,name:'Spirit Rain Seer',
 level:95,experience:0,pkKills:0,pkDeaths:0,x:1.1,y:0,z:11.6,hp:500,mapId:'ritual_village',
 build:{path:'seer',ancestry:'woodland'},occultBook:rainBook,updatedAt:new Date().toISOString()}),{flag:'wx'});
const menderToken='mt1_'+randomBytes(32).toString('hex'),menderId=createHash('sha256').update(menderToken).digest('hex');
const menderBook={learned:{seer:[],mender:['mender_heal','mender_deep_heal']},
 loadouts:{seer:[null,null,null,null],mender:['mender_deep_heal',null,null,null]},training:{seer:0,mender:40},cooldowns:{}};
await writeFile(path.join(chars,menderId+'.json'),JSON.stringify({version:1,id:menderId,name:'Prototype Mender',
 level:40,experience:0,pkKills:0,pkDeaths:0,x:1.1,y:0,z:11.6,hp:100,mapId:'ritual_village',
 build:{path:'mender',ancestry:'woodland'},occultBook:menderBook,updatedAt:new Date().toISOString()}),{flag:'wx'});
const circleToken='mt1_'+randomBytes(32).toString('hex'),circleId=createHash('sha256').update(circleToken).digest('hex');
const circleBook={learned:{seer:[],mender:['mender_heal','mender_ward','mender_area','mender_shelter','mender_deep_circle']},
 loadouts:{seer:[null,null,null,null],mender:['mender_deep_circle',null,null,null]},training:{seer:0,mender:100},cooldowns:{}};
await writeFile(path.join(chars,circleId+'.json'),JSON.stringify({version:1,id:circleId,name:'Moving Circle',
 level:75,experience:0,pkKills:0,pkDeaths:0,x:-12,y:0,z:0,hp:100,mapId:'ritual_village',
 build:{path:'mender',ancestry:'woodland'},occultBook:circleBook,updatedAt:new Date().toISOString()}),{flag:'wx'});
const chaiyaToken='mt1_'+randomBytes(32).toString('hex'),chaiyaId=createHash('sha256').update(chaiyaToken).digest('hex');
const chaiyaSlots=['chaiya_cover','chaiya_advanced_counter',null,null];
const chaiyaBook={school:'chaiya',learned:['chaiya_elbow','chaiya_knee','chaiya_cover','chaiya_advanced_counter'],
 slots:chaiyaSlots,loadouts:{chaiya:chaiyaSlots,korat:[null,null,null,null],lopburi:[null,null,null,null],thasao:[null,null,null,null]},
 training:{strikes:90,blocks:12}};
await writeFile(path.join(chars,chaiyaId+'.json'),JSON.stringify({version:1,id:chaiyaId,name:'Prototype Chaiya',
 level:40,experience:0,pkKills:0,pkDeaths:0,x:1.1,y:0,z:11.6,hp:500,mapId:'ritual_village',
 build:{path:'muay_boran',ancestry:'woodland'},muayBook:chaiyaBook,
 inventory:{version:1,slots:[{itemId:'muay_wraps',quantity:1},...new Array(11).fill(null)],equippedWeaponSlot:0},
 updatedAt:new Date().toISOString()}),{flag:'wx'});
const env={NODE_ENV:'test',HOME:home,TMPDIR:home,MONTRA_TEST_SANDBOX:home,MONTRA_CHARACTER_DIR:chars,MONTRA_ACCOUNTS_REQUIRED:'0',MONTRA_ECONOMY_ENABLED:'0',MONTRA_WORLD_EXPANSION:'0',MONTRA_HUNT_EVENTS:'0',MONTRA_DIRECTOR_ENABLED:'0',MONTRA_DIRECTOR_PERSIST:'0',MONTRA_ISOLATED_STAGING:'1',MONTRA_PROTOTYPE_PROTOCOL_V1:'1',MONTRA_PROTOTYPE_GAMEPLAY:'1'};
const entry=fileURLToPath(new URL('./src/rooms/prototype-gameplay-test-server.ts',import.meta.url));let output='';const child=spawn(process.execPath,['--import',import.meta.resolve('tsx'),entry],{cwd:home,env,stdio:['ignore','pipe','pipe']});child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);let spawnError;child.on('error',error=>{spawnError=error;});let room,observer;
try{
 const port=await until(()=>{assertTestChildRunning(child,spawnError,output);return output.match(/PROTOTYPE_TEST_PORT=(\d+)/)?.[1];},'server',20000);const sdk=new Client('http://127.0.0.1:'+port);
 room=await joinTestRoom(()=>sdk.create('my_room',{guestToken:token,prototypeProtocolVersion:1,prototypeGameplayVersion:1}));room.reconnection.enabled=false;
 const events=[];room.onMessage('*',(type,data)=>events.push({type,data}));
 const ready=(await until(()=>events.find(e=>e.type==='prototype_protocol_v1_ready'),'ready')).data;assert.equal(ready.gameplayEnabled,true);
 room.send('prototype_protocol_v1',{action:'confirm_gameplay',nonce:ready.nonce});
 await until(()=>events.find(e=>e.type==='prototype_protocol_v1_confirmed'),'confirmed');
 await until(()=>room.state?.players?.get(room.sessionId)?.persistent,'player');const player=()=>room.state.players.get(room.sessionId),monster=()=>room.state.monster;
 observer=await joinTestRoom(()=>sdk.joinById(room.roomId,{prototypeProtocolVersion:1,prototypeGameplayVersion:1}));observer.reconnection.enabled=false;
 const observed=[];observer.onMessage('*',(type,data)=>observed.push({type,data}));
 const observerReady=(await until(()=>observed.find(e=>e.type==='prototype_protocol_v1_ready'),'observer ready')).data;
 const waitingMana=player().mana, waitingHp=monster().hp;
 room.send('prototype_protocol_v1',{seq:1,action:'flowing_blades',targetId:monster().id});await delay(150);
 assert.equal(player().mana,waitingMana);assert.equal(monster().hp,waitingHp);assert.ok(!events.some(e=>e.type==='prototype_skill_v1'));
 observer.send('prototype_protocol_v1',{action:'confirm_gameplay',nonce:observerReady.nonce});
 await until(()=>observed.find(e=>e.type==='prototype_protocol_v1_confirmed'),'observer confirmed');
 await delay(1100); // Refill the command bucket after the denied cast.
 assert.equal(player().equippedWeaponId,'arcane_sword');const before=player().mana;
 room.send('prototype_protocol_v1',{seq:1,action:'flowing_blades',targetId:monster().id});await until(()=>events.find(e=>e.type==='prototype_skill_v1'&&e.data.phase==='first'),'first strike');
 assert.ok(player().mana>=before-24-1e-4 && player().mana<=before-23,'one 24-mana charge with bounded regeneration');const hp=monster().hp,cd=JSON.parse(player().swordTreeData).cooldowns.flowing_blades;assert.ok(cd>Date.now());
 await assert.rejects(joinTestRoom(()=>sdk.joinById(room.roomId,{})),isPrototypeAdmissionRejection);
 await delay(400);room.send('prototype_protocol_v1',{seq:1,action:'flowing_blades',targetId:monster().id});await delay(100);assert.equal(monster().hp,hp,'duplicate has no damage');
 const manaBeforeFollowup=player().mana;room.send('prototype_protocol_v1',{seq:2,action:'flowing_blades',targetId:monster().id});await until(()=>events.find(e=>e.type==='prototype_skill_v1'&&e.data.phase==='followup'),'followup');assert.ok(monster().hp<hp);assert.ok(player().mana>=manaBeforeFollowup-0.1,'follow-up does not spend mana');assert.equal(JSON.parse(player().swordTreeData).cooldowns.flowing_blades,cd);
 console.log('PASS: isolated admission, observer confirmation, replay, two strikes and one charge');

 await leaveTestRoom(observer);observer=undefined;
 await leaveTestRoom(room);room=undefined;

 room=await joinTestRoom(()=>sdk.create('my_room',{guestToken:sentinelToken,prototypeProtocolVersion:1,prototypeGameplayVersion:1}));
 room.reconnection.enabled=false;
 const sentinelEvents=[];room.onMessage('*',(type,data)=>sentinelEvents.push({type,data}));
 const sentinelReady=(await until(()=>sentinelEvents.find(e=>e.type==='prototype_protocol_v1_ready'),'sentinel ready')).data;
 room.send('prototype_protocol_v1',{action:'confirm_gameplay',nonce:sentinelReady.nonce});
 await until(()=>sentinelEvents.find(e=>e.type==='prototype_protocol_v1_confirmed'),'sentinel confirmed');
 const hitForSentinel=e=>e.type==='monster_hit' && e.data.targetId===room.sessionId;
 const baseline=(await until(()=>sentinelEvents.find(hitForSentinel),'unprotected monster hit')).data;
 room.send('prototype_protocol_v1',{seq:1,action:'firm_guard'});
 await until(()=>sentinelEvents.find(e=>e.type==='prototype_skill_v1'&&e.data.skillId==='firm_guard'&&e.data.phase==='braced'),'Firm Guard braced');
 room.send('prototype_protocol_v1',{seq:1,action:'firm_guard'});
 const protectedHit=await until(()=>{
   const i=sentinelEvents.findIndex(e=>e.type==='prototype_skill_v1'&&e.data.skillId==='firm_guard'&&e.data.phase==='protected');
   return i>=0 && sentinelEvents.slice(0,i).filter(hitForSentinel).at(-1);
 },'Firm Guard protected the next hit',5000);
 assert.ok(protectedHit.data.hitSeq>baseline.hitSeq);
 assert.equal(protectedHit.data.damage,Math.max(1,Math.round(baseline.damage*.7)));
 assert.equal(sentinelEvents.filter(e=>e.type==='prototype_skill_v1'&&e.data.skillId==='firm_guard'&&e.data.phase==='braced').length,1);
 console.log('PASS: isolated Firm Guard cast, replay rejection and authoritative monster hit');

 await leaveTestRoom(room);room=undefined;
 room=await joinTestRoom(()=>sdk.create('my_room',{guestToken:seerToken,prototypeProtocolVersion:1,prototypeGameplayVersion:1}));
 room.reconnection.enabled=false;
 const seerEvents=[];room.onMessage('*',(type,data)=>seerEvents.push({type,data}));
 const seerReady=(await until(()=>seerEvents.find(e=>e.type==='prototype_protocol_v1_ready'),'seer ready')).data;
 room.send('prototype_protocol_v1',{action:'confirm_gameplay',nonce:seerReady.nonce});
 await until(()=>seerEvents.find(e=>e.type==='prototype_protocol_v1_confirmed'),'seer confirmed');
 await until(()=>room.state?.monster?.alive,'seer monster');
 const trapEvent=phase=>seerEvents.find(e=>e.type==='prototype_skill_v1'&&e.data.skillId==='seer_ash_rice'&&e.data.phase===phase);
 const monsterId=room.state.monster.id,monsterHp=room.state.monster.hp;
 room.send('prototype_protocol_v1',{seq:1,action:'seer_ash_rice',targetId:monsterId});
 const placed=(await until(()=>trapEvent('placed'),'Ash Rice placed')).data;
 assert.equal(placed.armedAtServerMs-placed.serverNowMs,1000);
 assert.equal(placed.expiresAtServerMs-placed.serverNowMs,5000);
 room.send('prototype_protocol_v1',{seq:1,action:'seer_ash_rice',targetId:monsterId});
 room.send('prototype_protocol_v1',{action:'occult_state'});
 const active=(await until(()=>seerEvents.find(e=>e.type==='prototype_occult_v1_state'),'active Ash Rice snapshot')).data;
 assert.equal(active.ash[0].castId,placed.castId);
 assert.deepEqual(active.rescues,[]);
 const expired=(await until(()=>trapEvent('expired'),'Ash Rice expired')).data;
 assert.equal(expired.castId,placed.castId);
 room.send('prototype_protocol_v1',{action:'occult_state'});
 const ended=(await until(()=>seerEvents.filter(e=>e.type==='prototype_occult_v1_state')[1],'expired Ash Rice snapshot')).data;
 assert.deepEqual(ended.ash,[]);
 assert.equal(room.state.monster.hp,monsterHp,'the stationary monster never enters the trap');
 assert.equal(seerEvents.filter(e=>e.type==='prototype_skill_v1'&&e.data.phase==='placed').length,1);
 console.log('PASS: isolated Ash Rice placement, replay rejection and authoritative expiry');

 await leaveTestRoom(room);room=undefined;
 room=await joinTestRoom(()=>sdk.create('my_room',{guestToken:rainToken,prototypeProtocolVersion:1,prototypeGameplayVersion:1}));
 room.reconnection.enabled=false;
 const rainEvents=[];room.onMessage('*',(type,data)=>rainEvents.push({type,data}));
 const rainReady=(await until(()=>rainEvents.find(e=>e.type==='prototype_protocol_v1_ready'),'rain ready')).data;
 room.send('prototype_protocol_v1',{action:'confirm_gameplay',nonce:rainReady.nonce});
 await until(()=>rainEvents.find(e=>e.type==='prototype_protocol_v1_confirmed'),'rain confirmed');
 const rainPlayer=await until(()=>room.state?.players?.get(room.sessionId)?.persistent&&room.state.players.get(room.sessionId),'rain player');
 const rainTarget=room.state.monster.id,initialHitSeq=room.state.monster.hitSeq;
 const rainCast=seq=>room.send('prototype_protocol_v1',{action:'seer_spirit_rain',seq,targetId:rainTarget});
 rainCast(1);
 await until(()=>rainEvents.find(e=>e.type==='command_rejected'&&e.data.reason==='occult_mark_required'),'rain requires a mark');
 assert.equal(room.state.monster.hitSeq,initialHitSeq);
 room.send('occult_skill',{skillId:'seer_mark',targetId:rainTarget});
 await until(()=>rainEvents.find(e=>e.type==='occult_skill_used'&&e.data.skillId==='seer_mark'),'mark applied');
 assert.equal(room.state.monster.alive,true);
 const beforeRain=room.state.monster.hitSeq,beforeRainMana=rainPlayer.mana;
 rainCast(2);
 const rain=(await until(()=>rainEvents.find(e=>e.type==='prototype_skill_v1'&&e.data.skillId==='seer_spirit_rain'),'rain confirmed hit')).data;
 assert.equal(rain.phase,'chained');
 assert.equal(rain.seq,2);assert.deepEqual(rain.targetIds,[rainTarget]);
 assert.equal(room.state.monster.hitSeq,beforeRain+1);
 assert.ok(rainPlayer.mana>=beforeRainMana-34-.01 && rainPlayer.mana<=beforeRainMana-33);
 rainCast(2);await delay(180);
 assert.equal(room.state.monster.hitSeq,beforeRain+1);
 assert.equal(rainEvents.filter(e=>e.type==='prototype_skill_v1'&&e.data.skillId==='seer_spirit_rain').length,1);
 console.log('PASS: Spirit Rain uses a server-owned mark, lands once and rejects replay');
await leaveTestRoom(room);room=undefined;
 room=await joinTestRoom(()=>sdk.create('my_room',{guestToken:menderToken,prototypeProtocolVersion:1,prototypeGameplayVersion:1}));
 room.reconnection.enabled=false;
 const menderEvents=[];room.onMessage('*',(type,data)=>menderEvents.push({type,data}));
 const menderReady=(await until(()=>menderEvents.find(e=>e.type==='prototype_protocol_v1_ready'),'mender ready')).data;
 room.send('prototype_protocol_v1',{action:'confirm_gameplay',nonce:menderReady.nonce});
 await until(()=>menderEvents.find(e=>e.type==='prototype_protocol_v1_confirmed'),'mender confirmed');
 const mender=await until(()=>room.state?.players?.get(room.sessionId)?.persistent&&room.state.players.get(room.sessionId),'mender player');
 assert.ok(mender.hp/mender.maxHp<0.4);
 const wardEvent=phase=>menderEvents.find(e=>e.type==='prototype_skill_v1'&&e.data.skillId==='mender_deep_heal'&&e.data.phase===phase);
 room.send('prototype_protocol_v1',{seq:1,action:'mender_deep_heal',targetId:room.sessionId});
 const ward=(await until(()=>wardEvent('placed'),'Deep Heal placed')).data;
 room.send('prototype_protocol_v1',{seq:1,action:'mender_deep_heal',targetId:room.sessionId});
 const healed=await until(()=>wardEvent('triggered'),'Deep Heal triggered',5000);
 const preceding=menderEvents.slice(0,menderEvents.indexOf(healed)).filter(e=>e.type==='monster_hit').at(-1);
 assert.ok(preceding);assert.equal(healed.data.castId,ward.castId);assert.ok(healed.data.amount>0);
 assert.ok(mender.hp>=preceding.data.hp+healed.data.amount-0.01);
 assert.equal(menderEvents.filter(e=>e.type==='prototype_skill_v1'&&e.data.skillId==='mender_deep_heal'&&e.data.phase==='placed').length,1);
 room.send('prototype_protocol_v1',{action:'occult_state'});
 const wardSnapshot=(await until(()=>menderEvents.find(e=>e.type==='prototype_occult_v1_state'),'consumed Deep Heal snapshot')).data;
 assert.deepEqual(wardSnapshot.rescues,[]);
 console.log('PASS: isolated Deep Heal cast, replay rejection and heal after authoritative damage');

 await leaveTestRoom(room);room=undefined;
 room=await joinTestRoom(()=>sdk.create('my_room',{guestToken:circleToken,prototypeProtocolVersion:1,prototypeGameplayVersion:1}));
 room.reconnection.enabled=false;
 const circleEvents=[];room.onMessage('*',(type,data)=>circleEvents.push({type,data}));
 const circleReady=(await until(()=>circleEvents.find(e=>e.type==='prototype_protocol_v1_ready'),'circle ready')).data;
 room.send('prototype_protocol_v1',{action:'confirm_gameplay',nonce:circleReady.nonce});
 await until(()=>circleEvents.find(e=>e.type==='prototype_protocol_v1_confirmed'),'circle confirmed');
 const circlePlayer=await until(()=>room.state?.players?.get(room.sessionId)?.persistent&&room.state.players.get(room.sessionId),'circle player');
 const startingX=circlePlayer.x;
 assert.ok(Math.abs(startingX+12)<.01,'circle fixture position');
 room.send('occult_skill',{skillId:'mender_deep_circle'});
 await until(()=>circleEvents.find(e=>e.type==='command_rejected'&&e.data.reason==='prototype_protocol_required'),'circle legacy command denied');
 const circleEvent=phase=>circleEvents.find(e=>e.type==='prototype_skill_v1'&&e.data.skillId==='mender_deep_circle'&&e.data.phase===phase);
 room.send('prototype_protocol_v1',{action:'mender_deep_circle',seq:1});
 const circle=(await until(()=>circleEvent('placed'),'moving circle placed')).data;
 assert.equal(circle.expiresAtServerMs-circle.startedAtServerMs,6500);
 room.send('prototype_protocol_v1',{action:'mender_deep_circle',seq:1});
 room.send('move',{x:startingX+.85,z:circlePlayer.z});
 await until(()=>Math.abs(circlePlayer.x-startingX)>.4,'circle caster moves');
 room.send('prototype_protocol_v1',{action:'occult_state'});
 const circleState=(await until(()=>circleEvents.find(e=>e.type==='prototype_occult_v1_state'),'circle snapshot')).data;
 assert.equal(circleState.circles.length,1);
 assert.equal(circleState.circles[0].castId,circle.castId);
 assert.ok(Math.abs(circleState.circles[0].position.x-startingX)>.4);
 const pulse=(await until(()=>circleEvent('pulse'),'moving circle pulse',5500)).data;
 assert.equal(pulse.castId,circle.castId);
 assert.ok(pulse.serverNowMs-circle.startedAtServerMs>=2000);
 assert.deepEqual(pulse.targetIds,[room.sessionId]);assert.ok(pulse.amount>0);
 const expiredCircle=(await until(()=>circleEvent('expired'),'moving circle expired',8500)).data;
 assert.equal(expiredCircle.castId,circle.castId);
 assert.equal(circleEvents.filter(e=>e.type==='prototype_skill_v1'&&e.data.skillId==='mender_deep_circle'&&e.data.phase==='placed').length,1);
 assert.ok(circleEvents.filter(e=>e.type==='prototype_skill_v1'&&e.data.skillId==='mender_deep_circle'&&e.data.phase==='pulse').length<=3);
 console.log('PASS: moving Deep Circle replaces the legacy cast, follows the caster and expires once');

 await leaveTestRoom(room);room=undefined;
 room=await joinTestRoom(()=>sdk.create('my_room',{guestToken:chaiyaToken,prototypeProtocolVersion:1,prototypeGameplayVersion:1}));
 room.reconnection.enabled=false;
 const chaiyaEvents=[];room.onMessage('*',(type,data)=>chaiyaEvents.push({type,data}));
 const chaiyaReady=(await until(()=>chaiyaEvents.find(e=>e.type==='prototype_protocol_v1_ready'),'Chaiya ready')).data;
 room.send('prototype_protocol_v1',{action:'confirm_gameplay',nonce:chaiyaReady.nonce});
 await until(()=>chaiyaEvents.find(e=>e.type==='prototype_protocol_v1_confirmed'),'Chaiya confirmed');
 await until(()=>chaiyaEvents.find(e=>e.type==='monster_hit'),'baseline Chaiya monster hit');
 room.send('muay_skill',{skillId:'chaiya_cover'});
 await until(()=>chaiyaEvents.find(e=>e.type==='muay_guarded'),'Chaiya blocked a monster hit');
 const enemy=room.state.monster.id;
 room.send('prototype_protocol_v1',{seq:1,action:'chaiya_advanced_counter',targetId:enemy});
 const counter=await until(()=>chaiyaEvents.find(e=>e.type==='prototype_skill_v1'&&e.data.skillId==='chaiya_advanced_counter'&&e.data.phase==='counter'),'Chaiya counter');
 const counterHits=()=>chaiyaEvents.filter(e=>e.type==='combat_hit'&&e.data.targetId===enemy);
 assert.equal(counter.data.targetId,enemy);
 assert.equal(counterHits().length,1);
 room.send('prototype_protocol_v1',{seq:1,action:'chaiya_advanced_counter',targetId:enemy});
 await delay(120);
 assert.equal(counterHits().length,1);
 console.log('PASS: isolated Chaiya guard, counter and replay rejection');
}catch(e){throw Error(String(e)+'\nServer output:\n'+output);}finally{if(observer)await leaveTestRoom(observer).catch(()=>{});if(room)await leaveTestRoom(room).catch(()=>{});try{await stopTestChild(child);}finally{await rm(home,{recursive:true,force:true});}}
