import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createChatState } from '../src/modules/core/chat-state.mjs';
import { createWorldState } from '../src/modules/core/world-state.mjs';
import { createChatMessageHandler, createPartyStateHandler } from '../src/modules/network/social-handlers.mjs';
import { bundleClientModules } from './build-client.mjs';

function chatFixture() {
  const joined={}, state=createChatState(), feed=[];
  let room=joined, localId='self', map='village', pending=null, tab='all', composing=false, finished=0, badges=0;
  const box={input:{value:''},el:{classList:{contains:()=>composing}}};
  const handler=createChatMessageHandler({joined,getRoom:()=>room,getLocalId:()=>localId,getMapId:()=>map,state,
    pushChatFeed:(...args)=>feed.push(args),getPending:()=>pending,getBox:()=>box,getTab:()=>tab,
    finishPending:()=>{finished++;pending=null},updateBadge:()=>badges++});
  return {joined,state,feed,box,handler,setRoom:v=>room=v,setMap:v=>map=v,setPending:v=>pending=v,
    setTab:v=>tab=v,setComposing:v=>composing=v,counts:()=>({finished,badges})};
}
const message=(overrides={})=>({channel:'map',text:'hello',name:'friend',senderId:'other',mapId:'village',...overrides});

test('generated module prelude exports the social state and handlers',()=>{
  const modules=vm.runInNewContext(bundleClientModules().toString('utf8')+'\nMONTRA_CLIENT_MODULES');
  assert.equal(typeof modules.createChatState,'function');
  assert.equal(typeof modules.createWorldState,'function');
  assert.equal(typeof modules.createChatMessageHandler,'function');
  assert.equal(typeof modules.createPartyStateHandler,'function');
  assert.equal(modules.createChatState().draft.private,'');
});

test('world state gives each client an independent online player map',()=>{
  const first=createWorldState(),second=createWorldState();
  assert.equal(first.onlinePlayers.size,0);assert.equal(second.onlinePlayers.size,0);
  first.onlinePlayers.set('player',{x:4,z:8});
  assert.deepEqual(first.onlinePlayers.get('player'),{x:4,z:8});
  assert.equal(second.onlinePlayers.has('player'),false);
  first.onlinePlayers.clear();assert.equal(first.onlinePlayers.size,0);
});

test('chat state starts with separate history, unread and draft per channel and per client',()=>{
  const a=createChatState(),b=createChatState();
  assert.deepEqual(Object.keys(a.history),['map','world','party','private','bug']);
  assert.deepEqual(a.unread,{map:0,world:0,party:0,private:0,bug:0});
  assert.deepEqual(a.draft,{map:'',world:'',party:'',private:'',bug:''});
  a.history.map.push('x');a.draft.private='secret';
  assert.deepEqual(b.history.map,[]);assert.equal(b.draft.private,'');
});

test('chat ignores stale rooms, invalid payloads and messages from another map',()=>{
  const f=chatFixture();
  for(const m of [null,message({channel:'bug'}),message({text:1}),message({name:1}),message({senderId:null}),message({mapId:'forest'})])f.handler(m);
  f.setRoom({});f.handler(message());
  assert.deepEqual(f.state.history.map,[]);assert.deepEqual(f.feed,[]);assert.equal(f.counts().badges,0);
});

test('chat limits history and unread counts, preserves text truncation and composing rules',()=>{
  const f=chatFixture();f.state.unread.world=98;
  for(let i=0;i<102;i++)f.handler(message({channel:'world',text:'x'.repeat(401),name:'n'.repeat(81)}));
  assert.equal(f.state.history.world.length,100);assert.equal(f.state.unread.world,99);
  assert.equal(f.state.history.world[0].name.length,80);assert.equal(f.state.history.world[0].text.length,400);
  assert.deepEqual(f.feed[0],['world','n'.repeat(80),'x'.repeat(400),false]);
  f.setComposing(true);f.setTab('all');f.handler(message({channel:'party'}));assert.equal(f.state.unread.party,0);
  f.setTab('world');f.handler(message({channel:'party'}));assert.equal(f.state.unread.party,1);
});

test('private own message only clears the matching pending target and normalized draft',()=>{
  const f=chatFixture(), own=message({channel:'private',senderId:'self',targetId:'a',targetName:'Alice',text:'é'});
  f.state.draft.private=' e\u0301 ';f.box.input.value=' e\u0301 ';f.setTab('private');
  f.setPending({channel:'private',text:'é',targetId:'other'});f.handler(own);
  assert.equal(f.counts().finished,0);assert.equal(f.state.draft.private,' e\u0301 ');
  f.setPending({channel:'private',text:'é',targetId:'a'});f.handler(own);
  assert.equal(f.counts().finished,1);assert.equal(f.state.draft.private,'');assert.equal(f.box.input.value,'');
  assert.deepEqual(f.state.history.private.at(-1),{name:'ถึง Alice',text:'é',own:true});
});

test('party handler validates, filters members and never handles old-room messages',()=>{
  const joined={}, calls=[];let room=joined,party='previous';
  const handler=createPartyStateHandler({joined,getRoom:()=>room,setParty:value=>{party=value},
    clearInvitation:()=>calls.push('clear'),updateBadge:()=>calls.push('badge'),render:()=>calls.push('render')});
  handler({partyId:'p',members:Array(5).fill({sessionId:'x',name:'x'})});assert.equal(party,'previous');
  handler({partyId:'p',leaderId:'a',members:[{sessionId:'a',name:'Alice'},null,{sessionId:2,name:'bad'}]});
  assert.deepEqual(party,{partyId:'p',leaderId:'a',members:[{sessionId:'a',name:'Alice'}]});
  assert.deepEqual(calls,['clear','badge','render']);
  room={};handler({partyId:'other',members:[]});assert.equal(party.partyId,'p');
  room=joined;handler({members:[]});assert.equal(party,null);assert.equal(calls.at(-1),'render');
});
