/** Isolated local WebSocket integration. Never targets an existing service. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {assertTestChildRunning,stopTestChild,leaveTestRoom,joinTestRoom,armTestDeadline} from './prototype-test-process.mjs';
import {mkdtemp, mkdir, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Client} from '@colyseus/sdk';

armTestDeadline();
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const until=async(fn,label,timeout=10000)=>{const end=Date.now()+timeout;while(Date.now()<end){const result=fn();if(result)return result;await delay(20);}throw Error('Timed out: '+label);};
const home=await mkdtemp(path.join(os.tmpdir(),'montra-protocol-test-'));
const chars=path.join(home,'characters');await mkdir(chars);
const entry=fileURLToPath(new URL('./src/rooms/prototype-protocol-test-server.ts',import.meta.url));
const loader=import.meta.resolve('tsx');
let child;let output='';let spawnError;const rooms=[];
async function stop(){
  if(!child)return;
  const current=child;child=undefined;
  await stopTestChild(current);
}
async function start(enabled){
  output='';spawnError=undefined;
  // Do not inherit dotenv, account/API secrets, or any caller-provided endpoint.
  const env={NODE_ENV:'test',HOME:home,TMPDIR:home,MONTRA_TEST_SANDBOX:home,
    MONTRA_CHARACTER_DIR:chars,MONTRA_ACCOUNTS_REQUIRED:'0',MONTRA_ECONOMY_ENABLED:'0',
    MONTRA_WORLD_EXPANSION:'0',MONTRA_HUNT_EVENTS:'0',MONTRA_DIRECTOR_ENABLED:'0',
    MONTRA_DIRECTOR_PERSIST:'0',MONTRA_ISOLATED_STAGING:'1',MONTRA_PROTOTYPE_PROTOCOL_V1:enabled?'1':'0'};
  child=spawn(process.execPath,['--import',loader,entry],{cwd:home,env,stdio:['ignore','pipe','pipe'],windowsHide:true});
  child.stdout.on('data',data=>{output+=data;});child.stderr.on('data',data=>{output+=data;});
  child.on('error',error=>{spawnError=error;output+='\n'+String(error);});
  const match=await until(()=>{assertTestChildRunning(child,spawnError,output);return output.match(/PROTOTYPE_TEST_PORT=(\d+)/);},'loopback server',20000);
  const port=Number(match[1]);assert.ok(port>0 && port<65536);
  return `http://127.0.0.1:${port}`;
}
async function connect(endpoint,options,roomId){
  const sdk=new Client(endpoint);
  const room=await joinTestRoom(()=>roomId ? sdk.joinById(roomId,options) : sdk.create('my_room',options));
  room.reconnection.enabled=false;rooms.push(room);
  const ready=[],results=[];
  // This is intentionally installed immediately after the SDK resolves join.
  room.onMessage('prototype_protocol_v1_ready',value=>ready.push(value));
  room.onMessage('prototype_protocol_v1_result',value=>results.push(value));
  return {room,ready,results};
}
async function leave(actor){await leaveTestRoom(actor.room);const index=rooms.indexOf(actor.room);if(index>=0)rooms.splice(index,1);}
try{
  let endpoint=await start(true);
  const a=await connect(endpoint,{prototypeProtocolVersion:1});
  await until(()=>a.ready.length===1,'opted-in join ready after SDK join resolves');
  assert.deepEqual(a.ready[0],{version:1,gameplayEnabled:false});
  const legacy=await connect(endpoint,{},a.room.roomId);
  await delay(200);assert.equal(legacy.ready.length,0);
  legacy.room.send('prototype_protocol_v1',{seq:1,action:'probe'});
  a.room.send('prototype_protocol_v1',{seq:1,action:'probe'});
  await until(()=>a.results.length===1,'first probe');
  assert.deepEqual(a.results[0],{version:1,seq:1,status:'reserved_no_effect'});
  a.room.send('prototype_protocol_v1',{seq:1,action:'probe'});
  a.room.send('prototype_protocol_v1',{seq:3,action:'probe'});
  a.room.send('prototype_protocol_v1',{seq:2,action:'probe'});
  await until(()=>a.results.length===2,'higher sequence accepted');await delay(200);
  assert.deepEqual(a.results.map(x=>x.seq),[1,3]);assert.equal(legacy.results.length,0);
  const oldSession=a.room.sessionId;await leave(a);
  const renewed=await connect(endpoint,{prototypeProtocolVersion:1},legacy.room.roomId);
  await until(()=>renewed.ready.length===1,'new session ready');
  assert.notEqual(renewed.room.sessionId,oldSession);
  renewed.room.send('prototype_protocol_v1',{seq:1,action:'probe'});
  await until(()=>renewed.results.length===1,'fresh session sequence');
  assert.equal(renewed.results[0].seq,1);
  await leave(renewed);await leave(legacy);await stop();
  endpoint=await start(false);
  const disabled=await connect(endpoint,{prototypeProtocolVersion:1});
  await delay(250);disabled.room.send('prototype_protocol_v1',{seq:1,action:'probe'});await delay(300);
  assert.deepEqual(disabled.ready,[]);assert.deepEqual(disabled.results,[]);
  await leave(disabled);console.log('PASS: loopback join acknowledgement, legacy and disabled isolation, replay and new-session reset');
} catch(error){throw Error(String(error)+'\nTest server output:\n'+output);}
finally{await Promise.allSettled(rooms.map(room=>leaveTestRoom(room)));try{await stop();}finally{await rm(home,{recursive:true,force:true});}}
