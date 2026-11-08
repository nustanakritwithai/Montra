import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionState } from '../src/modules/core/session-state.mjs';
import { createEarlyMessageBuffer } from '../src/modules/network/early-messages.mjs';

test('sessions start detached and keep separate slot and timer state',()=>{
  const a=createSessionState(),b=createSessionState();
  assert.deepEqual(a,{activeCharacterSlot:null,syncPoll:null});
  a.activeCharacterSlot=2;a.syncPoll={id:1};
  assert.deepEqual(b,{activeCharacterSlot:null,syncPoll:null});
});

test('early messages keep the latest value per type and replay in arrival order',()=>{
  const subscriptions=new Map(),joined={onMessage(type,handler){subscriptions.set(type,handler)}};
  const buffer=createEarlyMessageBuffer(joined),received=[];
  assert.deepEqual([...subscriptions.keys()],['guild_state','guild_recruitment','territory_state']);
  subscriptions.get('territory_state')({n:1});subscriptions.get('guild_state')({n:2});
  subscriptions.get('territory_state')({n:3});subscriptions.get('guild_recruitment')(null);
  for(const type of subscriptions.keys())buffer.setHandler(type,value=>received.push([type,value]));
  buffer.replay();buffer.replay();
  assert.deepEqual(received,[['territory_state',{n:3}],['guild_state',{n:2}],['guild_recruitment',null]]);
});

test('buffer stops capturing when a handler is ready and clears unhandled entries',()=>{
  const subscriptions=new Map(),joined={onMessage(type,handler){subscriptions.set(type,handler)}};
  const buffer=createEarlyMessageBuffer(joined),received=[];
  subscriptions.get('guild_state')({n:1});subscriptions.get('territory_state')({n:4});
  buffer.setHandler('guild_state',value=>received.push(value));
  subscriptions.get('guild_state')({n:2});buffer.replay();
  buffer.setHandler('territory_state',value=>received.push(value));buffer.replay();
  assert.deepEqual(received,[{n:1}]);
});
