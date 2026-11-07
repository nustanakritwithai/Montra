const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = p => fs.readFileSync(p, 'utf8');
const reference = read('deploy/combat/fixtures/join-message-bootstrap-reference.js');
const source = read('src/client/network/044-state-sync-and-connection.js');
const original = reference + '\n globalThis.api={markHandler,replay};';
const modulePath = 'src/client-modules/join-message-bootstrap.js';
const moduleSource = fs.existsSync(modulePath) ? read(modulePath) : null;
const candidate = moduleSource ? moduleSource+'\n globalThis.api=MontraJoinMessageBootstrap.create(joined);' : original;
if (!moduleSource) {
  assert(source.includes(reference.slice(0, reference.indexOf('      function markHandler'))));
  assert(source.includes('for(const [type,message] of earlyMessages)earlyHandlers.get(type)?.(message);\n      earlyMessages.clear();'));
}
function harness(code, onRegister) {
  const events=[], callbacks=new Map();
  const joined={onMessage(type,fn){events.push(['register',type]);callbacks.set(type,fn);onRegister?.(type,fn);}};
  const context={joined};vm.runInNewContext(code,context);
  return {api:context.api,events,emit:(type,value)=>callbacks.get(type)(value)};
}
function scenario(code) {
  const h=harness(code,(type,fn)=>fn('sync:'+type));
  const {api,events,emit}=h;
  emit('guild_state','first');emit('guild_state','last');
  api.markHandler('guild_state',v=>events.push(['old',v]));
  api.markHandler('guild_state',v=>{events.push(['guild',v]);emit('guild_state','ignored');api.replayNested=true;});
  api.markHandler('guild_recruitment',v=>events.push(['recruitment',v]));
  api.markHandler('territory_state',v=>events.push(['territory',v]));
  api.replay();api.replay();emit('guild_state','late');api.replay();
  return events;
}
const expected=[['register','guild_state'],['register','guild_recruitment'],['register','territory_state'],['guild','last'],['recruitment','sync:guild_recruitment'],['territory','sync:territory_state']];
assert.deepEqual(scenario(original),expected);assert.deepEqual(scenario(candidate),expected);
function edges(code) {
  const {api,events,emit}=harness(code);
  emit('territory_state','T');emit('guild_state','G');
  let entered=false;
  api.markHandler('territory_state',function(v){events.push(['T',v,arguments.length,this===undefined]);if(!entered){entered=true;emit('guild_recruitment','R');api.markHandler('guild_recruitment',v=>events.push(['R',v]));api.replay();}});
  api.markHandler('guild_state',v=>events.push(['G',v]));
  api.replay();api.replay();
  return events;
}
assert.deepEqual(edges(candidate),edges(original));
function failures(code) {
  const {api,events,emit}=harness(code);const error=new Error('handler');
  emit('guild_state',1);emit('territory_state',2);
  api.markHandler('guild_state',()=>{events.push('throw');throw error;});
  assert.throws(()=>api.replay(),e=>e===error);
  api.markHandler('guild_state',v=>events.push(v));api.markHandler('territory_state',v=>events.push(v));
  api.replay();api.replay();return events;
}
assert.deepEqual(failures(candidate),failures(original));
for(const code of [original,candidate]) {
  const error=new Error('register');let calls=0;
  assert.throws(()=>harness(code,()=>{if(++calls===2)throw error;}),e=>e===error);assert.equal(calls,2);
  const h=harness(code);h.emit('guild_state',1);h.api.replay();h.api.markHandler('guild_state',()=>assert.fail('cleared missing handler'));h.api.replay();
}
// Negative controls: changed replacement and premature clearing are observable.
assert.notDeepEqual(scenario(original.replace('if(!earlyHandlers.has(type))','if(!earlyMessages.has(type))')),expected);
assert.notDeepEqual(failures(original.replace('for(const [type,message] of earlyMessages)','for(const [type,message] of (Array.from(earlyMessages).map(x=>(earlyMessages.clear(),x))))')),failures(original));
console.log('Join-message bootstrap: original, candidate, exceptions, reentry and negative controls passed');

if (moduleSource) {
  const context={};vm.runInNewContext(moduleSource,context);
  assert(Object.isFrozen(context.MontraJoinMessageBootstrap));
  const api=context.MontraJoinMessageBootstrap.create({onMessage(){}});
  assert(Object.isFrozen(api));assert.deepEqual(Object.keys(api),['markHandler','replay']);
  assert.equal((source.match(/joinMessageBootstrap.markHandler\(/g)||[]).length,3);
  assert.equal((source.match(/joinMessageBootstrap.replay\(/g)||[]).length,1);
  assert(!source.includes('earlyMessages') && !source.includes('earlyHandlers'));
  const binding=source.split('\n').find(line=>line.includes('const joinMessageBootstrap ='));
  assert.throws(()=>vm.runInNewContext(binding,{joined:{}}),/MontraJoinMessageBootstrap|undefined/);
  const html=read('index.html');
  const tag=html.split('\n').find(line=>line.includes('./src/client-modules/join-message-bootstrap.js?'));
  assert(tag.includes(' defer '));assert(html.indexOf(tag)<html.indexOf('<script src="./main.js?'));
  const handler=tag.match(/onerror="([^"]+)"/)[1], notices=[];
  vm.runInNewContext(handler,{window:{MontraEntry:{worldUnavailable:value=>notices.push(value)}}});
  assert.equal(notices.length,1);assert.equal(notices[0],'โหลดเกมไม่สำเร็จ กรุณาลองอีกครั้ง');
  vm.runInNewContext(handler,{window:{}});
}
