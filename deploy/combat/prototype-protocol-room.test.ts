import test from 'node:test';
import assert from 'node:assert/strict';
import type {Client, CloseCode} from 'colyseus';
import {MyRoom} from './MyRoom.js';
import {PrototypeTestRoom} from './PrototypeTestRoom.js';
import type {PrototypeCommandGate} from './PrototypeCommandGate.js';

type Internal = {
  prototypeSessions: Map<string, PrototypeCommandGate>;
  prototypeBuckets: Map<string, unknown>;
  simulatedMs: number;
  acknowledgePrototypeProtocol(client: Client, fields: Record<string, unknown>): void;
  messages: Record<string, (client: Client, message: unknown) => void>;
};
function fakeClient(id: string) {
  const sent: Array<{type:string; data:unknown}> = [];
  let failResult = false;
  const client = {sessionId:id, send(type:string, data:unknown) {
    if (failResult && type === 'prototype_protocol_v1_result') throw new Error('uncertain delivery');
    sent.push({type,data});
  }} as unknown as Client;
  return {client,sent,fail:()=>{failResult=true;}};
}
const envNames = ['NODE_ENV','MONTRA_ISOLATED_STAGING','MONTRA_PROTOTYPE_PROTOCOL_V1'] as const;
function withEnv(fn:()=>Promise<void>|void) {
  return async () => {
    const before = envNames.map(k=>process.env[k]);
    try { await fn(); }
    finally { envNames.forEach((k,i)=>{if(before[i]===undefined) delete process.env[k]; else process.env[k]=before[i];}); }
  };
}
function enable() {process.env.NODE_ENV='test';process.env.MONTRA_ISOLATED_STAGING='1';process.env.MONTRA_PROTOTYPE_PROTOCOL_V1='1';}

test('feature defaults off, requires both staging flags, non-production and explicit join version', withEnv(()=>{
  const r = new PrototypeTestRoom() as unknown as Internal, c=fakeClient('a');
  delete process.env.MONTRA_ISOLATED_STAGING;delete process.env.MONTRA_PROTOTYPE_PROTOCOL_V1;
  r.acknowledgePrototypeProtocol(c.client,{prototypeProtocolVersion:1});
  process.env.MONTRA_PROTOTYPE_PROTOCOL_V1='1';r.acknowledgePrototypeProtocol(c.client,{prototypeProtocolVersion:1});
  process.env.MONTRA_ISOLATED_STAGING='1';delete process.env.NODE_ENV;r.acknowledgePrototypeProtocol(c.client,{prototypeProtocolVersion:1});
  process.env.NODE_ENV='production';r.acknowledgePrototypeProtocol(c.client,{prototypeProtocolVersion:1});
  process.env.NODE_ENV='test';for (const v of [undefined, true, '1', 2]) r.acknowledgePrototypeProtocol(c.client,{prototypeProtocolVersion:v});
  r.messages.prototype_protocol_v1(c.client,{seq:1,action:'probe'});
  assert.deepEqual(c.sent,[]);assert.equal(r.prototypeSessions.size,0);
  r.acknowledgePrototypeProtocol(c.client,{prototypeProtocolVersion:1});
  assert.deepEqual(c.sent,[{type:'prototype_protocol_v1_ready',data:{version:1,gameplayEnabled:false}}]);
  process.env.NODE_ENV='production';r.messages.prototype_protocol_v1(c.client,{seq:1,action:'probe'});
  assert.equal(c.sent.length,1);
}));

test('strict validation and per-session sequence reservation reject duplicates and late commands', withEnv(()=>{
  enable();const room=new PrototypeTestRoom(), r=room as unknown as Internal, a=fakeClient('a'), b=fakeClient('b'), outsider=fakeClient('outsider');
  r.acknowledgePrototypeProtocol(a.client,{prototypeProtocolVersion:1});r.acknowledgePrototypeProtocol(b.client,{prototypeProtocolVersion:1});
  const send=(c:Client,p:unknown)=>{r.simulatedMs+=1000;r.messages.prototype_protocol_v1(c,p);};
  for(const p of [null,[],{}, {seq:1}, {seq:1,action:'probe',extra:0}, {seq:'1',action:'probe'}, {seq:0,action:'probe'}, {seq:1.5,action:'probe'}, {seq:Number.MAX_SAFE_INTEGER+1,action:'probe'}, {seq:1,action:'skill'}, Object.assign(Object.create({inherited:1}),{seq:1,action:'probe'})]) send(a.client,p);
  const accessor={get seq(){throw new Error('getter should not execute');},action:'probe'};
  assert.doesNotThrow(()=>send(a.client,accessor));
  send(a.client,{seq:1,action:'probe',[Symbol('extra')]:true});
  send(outsider.client,{seq:1,action:'probe'});assert.equal(a.sent.length,1);assert.equal(outsider.sent.length,0);
  send(a.client,{seq:1,action:'probe'});send(a.client,{seq:1,action:'probe'});send(a.client,{seq:3,action:'probe'});send(a.client,{seq:2,action:'probe'});send(b.client,{seq:1,action:'probe'});
  assert.deepEqual(a.sent.slice(1),[{type:'prototype_protocol_v1_result',data:{version:1,seq:1,status:'reserved_no_effect'}},{type:'prototype_protocol_v1_result',data:{version:1,seq:3,status:'reserved_no_effect'}}]);
  assert.equal(b.sent.length,2);assert.equal(room.state.players.size,0);
  a.fail();send(a.client,{seq:4,action:'probe'});send(a.client,{seq:4,action:'probe'});
  assert.equal(r.prototypeSessions.get('a')?.reserve(4),'replayed');
}));

test('capability is not installed when acknowledgement fails and sessions are cleared on leave and dispose', withEnv(async()=>{
  enable();const room=new PrototypeTestRoom(),r=room as unknown as Internal,a=fakeClient('a'),b=fakeClient('b');
  const broken={sessionId:'broken',send(){throw new Error('disconnected');}} as unknown as Client;
  r.acknowledgePrototypeProtocol(broken,{prototypeProtocolVersion:1});assert.equal(r.prototypeSessions.has('broken'),false);
  r.acknowledgePrototypeProtocol(a.client,{prototypeProtocolVersion:1});r.acknowledgePrototypeProtocol(b.client,{prototypeProtocolVersion:1});
  await room.onLeave(a.client, 1000 as CloseCode);assert.equal(r.prototypeSessions.has('a'),false);assert.equal(r.prototypeBuckets.has('a'),false);assert.equal(r.prototypeSessions.has('b'),true);
  await room.onDispose();assert.equal(r.prototypeSessions.size,0);assert.equal(r.prototypeBuckets.size,0);
}));


test('per-session bucket counts malformed messages and refills without consuming a throttled sequence', withEnv(()=>{
  enable();const r=new PrototypeTestRoom() as unknown as Internal,a=fakeClient('a'),b=fakeClient('b');
  r.acknowledgePrototypeProtocol(a.client,{prototypeProtocolVersion:1});r.acknowledgePrototypeProtocol(b.client,{prototypeProtocolVersion:1});
  for (let i=0;i<4;i++) r.messages.prototype_protocol_v1(a.client,{bad:true});
  r.messages.prototype_protocol_v1(a.client,{seq:1,action:'probe'});
  assert.equal(a.sent.length,1);
  r.messages.prototype_protocol_v1(b.client,{seq:1,action:'probe'});
  assert.equal(b.sent.length,2,'rate limits are session-local');
  r.simulatedMs+=999;r.messages.prototype_protocol_v1(a.client,{seq:1,action:'probe'});assert.equal(a.sent.length,1);
  r.simulatedMs+=1;r.messages.prototype_protocol_v1(a.client,{seq:1,action:'probe'});assert.equal(a.sent.length,2);
  r.simulatedMs+=1000;r.messages.prototype_protocol_v1(a.client,{seq:1,action:'probe'});assert.equal(a.sent.length,2,'replay remains rejected');
}));

test('the shipped room exposes no prototype transport even with the test flags set', withEnv(()=>{
  enable();
  const room=new MyRoom() as unknown as Internal, c=fakeClient('a');
  assert.equal(Object.hasOwn(room.messages,'prototype_protocol_v1'),false);
  room.acknowledgePrototypeProtocol(c.client,{prototypeProtocolVersion:1,prototypeGameplayVersion:1});
  assert.deepEqual(c.sent,[]);
  assert.equal(room.prototypeSessions.size,0);
}));
