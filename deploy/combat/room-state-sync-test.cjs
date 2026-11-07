'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const load=require('./fixtures/room-state-sync-loader.cjs');
const reference=fs.readFileSync(require.resolve('./fixtures/room-state-sync-reference.js'),'utf8');
const expectedHash='577dd42c3b8b1cbd36764a67e06b1c4ca41adcdc1ff38e5af77f256d878cccee';
assert.equal(crypto.createHash('sha256').update(reference).digest('hex'),expectedHash);
function harness(source, options={}) {
 const events=[],timers=new Map(),listeners=[];let next=options.zero?0:1;
 const cb={onAdd(name,fn){events.push(['add',name]);cb.add=fn;if(options.eagerPlayer)fn(options.eagerPlayer,'initial');if(options.addThrows)throw Error('add failed');},onRemove(name,fn){events.push(['remove',name]);cb.remove=fn;},listen(p,key,fn){events.push(['listen',key]);listeners.push({p,key,fn});if(options.listenThrows===key)throw Error('listen failed');}};
 if(options.noListen)delete cb.listen;
 const joined={state:{marker:'first'}};
 const context={room:joined,activeMapId:'ritual_village',window:{Colyseus:{Callbacks:options.noApi?null:{get(r){events.push(['get',r===joined]);if(options.getThrows)throw Error('get failed');return cb;}}}},
  setOnlinePlayer(...args){events.push(['player',...args]);if(options.playerThrows)throw Error('player failed');},removeOnlinePlayer(id){events.push(['delete',id]);},syncState(s){events.push(['sync',s]);},
  setInterval(fn,ms){events.push(['interval',ms]);if(options.timerThrows)throw Error('timer failed');const id=next++;timers.set(id,fn);return id;},clearInterval(id){events.push(['clear',id]);timers.delete(id);},console:{warn(...args){events.push(['warn',args[0],args[1].message]);}}};
 vm.createContext(context);const api=vm.runInContext(source,context);return {api,context,events,timers,cb,listeners,joined};
}
const cases=[];const test=(name,fn)=>cases.push([name,fn]);
const player=()=>({x:'2',z:'3',facing:'0.5',hp:'9',maxHp:'10',y:'1',equippedWeaponId:'staff',pathId:'seer'});
test('registration order, player coercion and all nested subscriptions',s=>{
 const h=harness(s);h.api.observePlayers(h.joined);
 assert.deepEqual(h.events,[['get',true],['add','players'],['remove','players'],['interval',350]]);
 const p=player();h.cb.add(p,'a');assert.deepEqual(h.events[4],['player','a',2,3,.5,9,10,1,'staff','seer']);
 assert.deepEqual(h.listeners.map(x=>x.key),['x','z','facing','hp','y','maxHp','equippedWeaponId','pathId','mapId']);
 p.x='7';h.listeners[0].fn();assert.equal(h.events.at(-1)[2],7);h.cb.remove(null,'a');assert.deepEqual(h.events.at(-1),['delete','a']);
});
test('live map and live room state reads preserve stale schema callbacks',s=>{
 const h=harness(s);h.api.observePlayers(h.joined);const p=player();h.cb.add(p,'a');
 h.context.activeMapId='other';h.listeners[0].fn();assert.deepEqual(h.events.at(-1),['delete','a']);
 p.mapId='other';h.context.room=null;h.listeners[0].fn();assert.equal(h.events.at(-1)[0],'player');
 h.joined.state={marker:'replacement'};h.listeners.at(-1).fn();assert.equal(h.events.at(-1)[1],h.joined.state);
 h.cb.remove(null,'late');assert.deepEqual(h.events.at(-1),['delete','late']);
});
test('poll guards room identity but reads changing state and retains late callback guard',s=>{
 const h=harness(s);h.api.observePlayers(h.joined);const tick=[...h.timers.values()][0];tick();assert.equal(h.events.at(-1)[1],h.joined.state);
 h.joined.state={marker:'new'};tick();assert.equal(h.events.at(-1)[1],h.joined.state);
 h.context.room={};const n=h.events.length;tick();assert.equal(h.events.length,n);
 h.api.clearSyncPoll();h.api.clearSyncPoll();assert.equal(h.timers.size,0);tick();assert.equal(h.events.at(-1)[0],'clear');
 h.context.room=h.joined;tick();assert.equal(h.events.at(-1)[0],'sync');
});
test('repeated joins replace only poll; independent factories own handles',s=>{
 const h=harness(s),other=harness(s);h.api.observePlayers(h.joined);other.api.observePlayers(other.joined);h.api.observePlayers(h.joined);
 assert.deepEqual(h.events.slice(-3),[['remove','players'],['clear',1],['interval',350]]);assert.equal(h.timers.size,1);
 h.api.clearSyncPoll();assert.equal(other.timers.size,1);
});
test('absent callback API and absent listen still poll',s=>{
 for(const option of [{noApi:true},{noListen:true}]){const h=harness(s,option);h.api.observePlayers(h.joined);assert.equal(h.timers.size,1);if(!option.noApi){h.cb.add(player(),'a');assert.equal(h.listeners.length,0);assert.equal(h.events.at(-1)[0],'player');}}
});
test('registration failure warns then starts fallback; retry registers again',s=>{
 for(const key of ['getThrows','addThrows']){const options={[key]:true};const h=harness(s,options);h.api.observePlayers(h.joined);assert.equal(h.events.at(-2)[0],'warn');assert.equal(h.timers.size,1);options[key]=false;h.api.observePlayers(h.joined);assert.equal(h.timers.size,1);assert.equal(h.events.at(-2)[0],'clear');}
});
test('deferred callback errors propagate without fallback; partial listeners stay registered',s=>{
 const h=harness(s,{listenThrows:'hp'});h.api.observePlayers(h.joined);assert.throws(()=>h.cb.add(player(),'a'),/listen failed/);assert.deepEqual(h.listeners.map(x=>x.key),['x','z','facing','hp']);assert(!h.events.some(e=>e[0]==='warn'));
 const bad=harness(s,{playerThrows:true});bad.api.observePlayers(bad.joined);assert.throws(()=>bad.cb.add(player(),'b'),/player failed/);assert.equal(bad.listeners.length,0);
});
test('timer errors remain outside callback fallback; zero timer handle keeps historical truthiness',s=>{
 const h=harness(s,{timerThrows:true});assert.throws(()=>h.api.observePlayers(h.joined),/timer failed/);assert(!h.events.some(e=>e[0]==='warn'));
 const zero=harness(s,{zero:true});zero.api.observePlayers(zero.joined);zero.api.clearSyncPoll();assert.equal(zero.timers.size,1);assert(!zero.events.some(e=>e[0]==='clear'));
});
test('eager SDK dispatch catches player/listener errors before fallback and retains partial registrations',s=>{
 const h=harness(s,{eagerPlayer:player(),listenThrows:'hp'});h.api.observePlayers(h.joined);
 assert.deepEqual(h.listeners.map(x=>x.key),['x','z','facing','hp']);assert.equal(h.events.at(-2)[0],'warn');assert.equal(h.events.at(-1)[0],'interval');assert.equal(h.cb.remove,undefined);
});
test('null player failures retain synchronous versus deferred exception boundaries',s=>{
 const h=harness(s);h.api.observePlayers(h.joined);assert.throws(()=>h.cb.add(null,'bad'),{name:'TypeError'});assert.equal(h.timers.size,1);
});
for(const [label,source]of[['frozen reference',load(reference)],['current implementation',load()]])for(const [name,fn]of cases){fn(source);console.log('PASS '+label+': '+name);}
console.log(`PASS ${cases.length*2} room-state synchronization scenarios`);
