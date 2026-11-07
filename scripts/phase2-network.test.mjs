import test from 'node:test';
import assert from 'node:assert/strict';
import { createConnectionLifecycle } from '../src/modules/core/connection-lifecycle.mjs';
import { allowedEndpoint, buildJoinOptions, joinWorld, verifyJoinedSlot } from '../src/modules/network/connection.mjs';

test('connection lifecycle permits one attempt and releases it after failure', () => {
  let room=null;
  const lifecycle=createConnectionLifecycle(()=>room);
  assert.equal(lifecycle.begin(),true);
  assert.equal(lifecycle.begin(),false);
  lifecycle.finish();
  assert.equal(lifecycle.begin(),true);
  lifecycle.finish();
});

test('late state, leave, and error events from an old room cannot affect the current room', () => {
  let room=null;
  const events=[];
  const lifecycle=createConnectionLifecycle(()=>room);
  const old={},current={};
  const oldState=lifecycle.guard(old, state=>events.push(['state',state]));
  const oldLeave=lifecycle.guard(old, ()=>events.push(['leave']));
  const oldError=lifecycle.guard(old, code=>events.push(['error',code]));
  const newState=lifecycle.guard(current, state=>events.push(['state',state]));
  room=old;oldState('old-live');
  room=current;oldState('late');oldLeave();oldError(123);newState('new-live');
  assert.deepEqual(events,[['state','old-live'],['state','new-live']]);
});

test('only HTTPS or local HTTP in a local page can be used as server endpoint', () => {
  const local={protocol:'http:',hostname:'localhost'},remote={protocol:'https:',hostname:'example.test'};
  assert.equal(allowedEndpoint('https://game.example.com:443',remote),true);
  assert.equal(allowedEndpoint('http://localhost:4108',local),true);
  assert.equal(allowedEndpoint('http://127.0.0.1:4108',local),true);
  assert.equal(allowedEndpoint('http://localhost:4108',remote),false);
  assert.equal(allowedEndpoint('https://game.example.com/evil',remote),false);
  assert.equal(allowedEndpoint('javascript:alert(1)',remote),false);
});

test('join options retain the exact protocol and optional character setup', () => {
  const flags={worldVersion:1,templeVersion:1,atlasVersion:1,provinceVersion:1,warVersion:1,castleVersion:2,riverCityVersion:1,terrainVersion:1,atlasReliefVersion:1,originalReliefVersion:1,monsterAutoAttackVersion:1};
  for(const slot of [1,2,3]) assert.deepEqual(buildJoinOptions('session',slot,null),{accountSession:'session',characterSlot:slot,...flags});
  const setup={name:'test',build:{path:'blade'}};
  assert.deepEqual(buildJoinOptions('session',2,setup),{accountSession:'session',characterSlot:2,characterSetup:setup,...flags});
});

test('world join keeps transfer ticket and falls back once if admission fails', async () => {
  const calls=[],room={id:'room'},client={async joinById(id,opts){calls.push(['transfer',id,opts]);throw Error('rejected')},async joinOrCreate(name,opts){calls.push(['world',name,opts]);return room}};
  const warnings=[],opts={accountSession:'session',characterSlot:2};
  assert.deepEqual(await joinWorld(client,opts,{roomId:'battle',ticket:'ticket'},e=>warnings.push(e.message)),{joined:room,transferFailed:true});
  assert.deepEqual(calls,[['transfer','battle',{...opts,warTicket:'ticket'}],['world','my_room',opts]]);
  assert.deepEqual(warnings,['rejected']);
});

test('successful transfer never joins another room', async () => {
  const room={id:'battle'},client={async joinById(){return room},async joinOrCreate(){throw Error('unexpected world join')}};
  assert.deepEqual(await joinWorld(client,{}, {roomId:'battle',ticket:'ticket'}),{joined:room,transferFailed:false});
});

test('slot admission waits for the server and preserves all three slot checks', async () => {
  for(const slot of [1,2,3]) {
    let waits=0;const player={persistent:true,pathId:'blade',characterSlot:slot};
    const room={sessionId:'id',state:{players:{get:()=>waits===2?player:null}}};
    assert.equal(await verifyJoinedSlot(room,slot,async()=>{waits++}),player);
    assert.equal(waits,2);
  }
  const room={sessionId:'id',state:{players:{get:()=>({persistent:true,pathId:'blade',characterSlot:2})}}};
  await assert.rejects(verifyJoinedSlot(room,1,async()=>{}),/ช่องเซฟไม่ตรง/);
  room.state.players.get=()=>({persistent:false,pathId:'blade',characterSlot:1});
  await assert.rejects(verifyJoinedSlot(room,1,async()=>{}),/ไม่รองรับบัญชี/);
});

test('slot admission times out without accepting a missing player', async () => {
  let waits=0;const room={sessionId:'id',state:{players:{get:()=>null}}};
  await assert.rejects(verifyJoinedSlot(room,1,async()=>{waits++}),/ไม่ได้รับข้อมูลตัวละคร/);
  assert.equal(waits,75);
});
