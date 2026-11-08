import assert from 'node:assert/strict';
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createConnectionLifecycle } from '../src/modules/core/connection-lifecycle.mjs';
import { allowedEndpoint, buildJoinOptions, joinWorld, verifyJoinedSlot } from '../src/modules/network/connection.mjs';
import { createChatState } from '../src/modules/core/chat-state.mjs';
import { createChatMessageHandler, createPartyStateHandler } from '../src/modules/network/social-handlers.mjs';
import { createEarlyMessageBuffer } from '../src/modules/network/early-messages.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const stage=path.join(root,'combat-verify');
const require=createRequire(path.join(stage,'package.json'));
const {Client}=require('@colyseus/sdk');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const probe=net.createServer();
await new Promise((resolve,reject)=>probe.once('error',reject).listen(0,'127.0.0.1',resolve));
const port=probe.address().port;
await new Promise(resolve=>probe.close(resolve));
assert.notEqual(port,4108,'Never use the production game port');
const testRoot=path.join(stage,'phase2-test-data');mkdirSync(testRoot,{recursive:true});
const dir=path.join(testRoot,'montra-account-test-'+randomBytes(8).toString('hex'));mkdirSync(dir);
assert.equal(path.dirname(dir),testRoot,'Temporary saves must remain in the isolated checkout');
const testEntry=path.join(stage,'src','phase2-server-'+randomBytes(8).toString('hex')+'.ts');
writeFileSync(testEntry,`import {defineServer,defineRoom} from 'colyseus';\nimport {MyRoom} from './rooms/MyRoom.js';\nimport {installAccountRoutes} from './rooms/AccountRoutes.js';\nconst server=defineServer({rooms:{my_room:defineRoom(MyRoom)},express:app=>installAccountRoutes(app)});\nserver.listen(Number(process.env.PORT),'127.0.0.1');\n`,{flag:'wx'});
const env={};for(const key of ['PATH','Path','SystemRoot','WINDIR','COMSPEC','TEMP','TMP'])if(process.env[key])env[key]=process.env[key];
Object.assign(env,{NODE_ENV:'test',PORT:String(port),MONTRA_CHARACTER_DIR:dir,MONTRA_ACCOUNTS_REQUIRED:'1',MONTRA_ECONOMY_ENABLED:'1',MONTRA_WORLD_EXPANSION:'1',MONTRA_HUNT_EVENTS:'0',MONTRA_DIRECTOR_ENABLED:'0',MONTRA_DIRECTOR_PERSIST:'0',MONTRA_DYNAMIC_BALANCE_FILE:''});
const server=spawn(process.execPath,['--import','tsx',testEntry],{cwd:stage,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
let stderr='';server.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-3000)});server.stdout.resume();
const base=`http://127.0.0.1:${port}`;
const api=async(route,body,session)=>{
  const response=await fetch(base+'/montra/account/'+route,{method:body?'POST':'GET',headers:{...(body?{'content-type':'application/json'}:{}),...(session?{authorization:'Bearer '+session}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
  return {status:response.status,body:await response.json()};
};
const username='test_'+randomBytes(6).toString('hex'),password='test-password-123456';
let room=null;
try{
  const deadline=Date.now()+60000;let ready=false;
  while(Date.now()<deadline){if(server.exitCode!==null)throw Error('isolated_server_exited');try{const r=await fetch(base+'/__healthcheck',{signal:AbortSignal.timeout(1000)});if(r.ok){ready=true;break}}catch{}await sleep(250)}
  assert(ready,'isolated_server_not_ready');
  assert.equal(allowedEndpoint(base,{protocol:'http:',hostname:'127.0.0.1'}),true);
  assert.equal((await api('register',{username,password})).status,200);
  const login=await api('login',{username,password});assert.equal(login.status,200);
  const session=login.body.session,client=new Client(base),seen=[];
  let active=null;const lifecycle=createConnectionLifecycle(()=>active);
  let lateState=null;
  for(const slot of [1,2,3]){
    assert.equal(lifecycle.begin(),true);assert.equal(lifecycle.begin(),false);
    const options=buildJoinOptions(session,slot,{name:'ทดสอบ '+slot,build:{path:'blade',ancestry:'shrine'}});
    const result=await joinWorld(client,options,null);room=result.joined;active=room;lifecycle.finish();
    const me=await verifyJoinedSlot(room,slot);assert.equal(Number(me.characterSlot),slot);assert.equal(me.pathId,'blade');
    seen.push(me.characterName);
    lateState=lifecycle.guard(room,()=>{throw Error('stale room state was applied')});
    room.reconnection.enabled=false;await room.leave();active=null;room=null;await sleep(350);lateState();
  }
  assert.equal(new Set(seen).size,3,'Each slot must retain a distinct character');
  const slots=await api('slots',null,session);assert.equal(slots.status,200);assert.equal(slots.body.slots.filter(s=>s.occupied).length,3);
  for(const slot of [1,2,3]){
    const result=await joinWorld(client,buildJoinOptions(session,slot,null),null);room=result.joined;active=room;
    const me=await verifyJoinedSlot(room,slot);assert.equal(me.characterName,seen[slot-1]);
    room.reconnection.enabled=false;await room.leave();active=null;room=null;await sleep(350);
  }
  assert.equal((await api('logout',{},session)).status,200);
  assert.equal((await api('slots',null,session)).status,401);
  const loginAgain=await api('login',{username,password});assert.equal(loginAgain.status,200);
  const result=await joinWorld(client,buildJoinOptions(loginAgain.body.session,2,null),null);room=result.joined;
  assert.equal((await verifyJoinedSlot(room,2)).characterName,seen[1]);
  const early=createEarlyMessageBuffer(room),earlyValues=[];let observed=false;
  room.onMessage('guild_state',()=>{observed=true});room.send('get_guild',{});
  const earlyDeadline=Date.now()+10000;
  while(!observed && Date.now()<earlyDeadline)await sleep(50);
  assert(observed,'guild snapshot received before handler is ready');
  const guildHandler=value=>earlyValues.push(value);
  room.onMessage('guild_state',guildHandler);early.setHandler('guild_state',guildHandler);early.replay();
  assert.deepEqual(earlyValues,[null],'buffer replays initial no-guild snapshot once');
  const chatState=createChatState(),joined=room;let party='unreceived',renders=0;
  joined.onMessage('chat_message',createChatMessageHandler({joined,getRoom:()=>room,getLocalId:()=>joined.sessionId,getMapId:()=>joined.state.players.get(joined.sessionId)?.mapId,
    state:chatState,pushChatFeed:()=>{},getPending:()=>null,getBox:()=>null,getTab:()=>'all',finishPending:()=>{},updateBadge:()=>{}}));
  joined.onMessage('party_state',createPartyStateHandler({joined,getRoom:()=>room,setParty:value=>{party=value},clearInvitation:()=>{},updateBadge:()=>{},render:()=>{renders++}}));
  joined.send('chat',{channel:'world',text:'phase2 isolated test'});
  joined.send('get_party',{});
  const socialDeadline=Date.now()+10000;
  while((!chatState.history.world.length || !renders) && Date.now()<socialDeadline)await sleep(50);
  assert.equal(chatState.history.world[0]?.text,'phase2 isolated test');
  assert.equal(chatState.history.world[0]?.own,true);
  assert.equal(party,null);assert.equal(renders,1);
  console.log('PASS isolated Colyseus: modular chat and party handlers processed server messages');
  console.log('PASS isolated Colyseus: login, 3 character slots, leave/rejoin, stale callbacks, logout and login again');
}finally{
  if(room)try{room.reconnection.enabled=false;await room.leave()}catch{}
  if(server.exitCode===null){server.kill();await Promise.race([new Promise(resolve=>server.once('exit',resolve)),sleep(5000)])}
  if(server.exitCode!==null)unlinkSync(testEntry);
}
