'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {fixture,scenario}=require('./fixtures/chat-controller-harness.cjs');
const root=path.resolve(__dirname,'../..');
const bytes=fs.readFileSync(path.join(root,'deploy/combat/fixtures/chat-controller-reference.json'));
assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),'4a8d3d4d6e10329d507486279ca714f28ded0ff530b25895abfafa1226e8d6bb');
const original=JSON.parse(bytes);
const f=fixture(original);
assert.deepEqual(f.listeners.map(({id,type,capture})=>[id,type,!!capture]),[
 ['cb-input','input',false],['cb-input','focus',false],['cb-input','keydown',false],['wide','change',false],['window','keydown',false],['viewport','resize',false],['viewport','scroll',false],['document','pointerdown',true]]);
assert.equal(f.nodes.get('game').children[0].id,'chatBox');
f.nodes.get('drawer').hidden=false;f.nodes.get('cb-input').inert=true;f.call('openChat');
assert.equal(f.env.document.activeElement,f.nodes.get('cb-input'));assert.equal(f.nodes.get('drawer').hidden,true);assert.equal(f.nodes.get('cb-open').attrs['aria-expanded'],'true');
f.input('map draft');f.tab('private');f.input('private draft');f.nodes.get('cb-target').value='other';f.nodes.get('cb-target').onchange();f.tab('map');assert.equal(f.nodes.get('cb-input').value,'map draft');f.tab('private');assert.equal(f.nodes.get('cb-input').value,'private draft');
f.call('closeChatComposer');assert.equal(f.env.document.activeElement,null);assert.equal(f.nodes.get('cb-open').attrs['aria-expanded'],'false');
f.receive(f.message({name:'<img onerror=x>',text:'<script>bad()</script>'}));
assert.equal(f.state().chatUnread.map,1);assert.equal(f.state().chatBoxUnread.map,1);assert.equal(f.state().chatBoxUnread.all,1);
f.tab('all');assert.equal(f.log()[0].text[1],'<img onerror=x>: ');assert.equal(f.log()[0].text[2],'<script>bad()</script>');
const kept=f.state().chatFeed.length;for(const override of [{channel:'invalid'},{mapId:'other-map'},{name:3},{text:3},{senderId:3}])f.receive(f.message(override));assert.equal(f.state().chatFeed.length,kept);
f.env.room={};f.receive(f.message());assert.equal(f.state().chatFeed.length,kept);f.env.room=f.env.joined;
// A full rerender scrolls unconditionally; incoming messages preserve a reader's position unless strictly nearer than 30px.
f.nodes.get('cb-log').scrollHeight=300;f.nodes.get('cb-log').clientHeight=100;f.nodes.get('cb-log').scrollTop=170;f.receive(f.message());assert.equal(f.nodes.get('cb-log').scrollTop,170);
f.nodes.get('cb-log').scrollTop=171;f.receive(f.message());assert.equal(f.nodes.get('cb-log').scrollTop,300);
for(let i=0;i<205;i++)f.receive(f.message({text:String(i)}));assert.equal(f.state().chatFeed.length,200);assert.equal(f.state().chatHistory.map.length,100);assert.equal(f.log().length,60);assert.equal(f.state().chatHistory.map.at(-1).text,'204');
f.tick(8000);assert.equal(f.nodes.get('cb-input').parentElement.classes.has('fresh'),false);
// Submit timing: blank input blurs, validation retains draft, synchronous own acknowledgement runs before timeout creation.
const s=fixture(original);s.call('openChat');s.input('  ');s.submit();assert.equal(s.env.document.activeElement,null);assert.equal(s.state().chatPending,null);
s.input('e\u0301');s.sendHook((type,command)=>s.receive(s.message({...command,senderId:'self'})));s.submit();assert.equal(s.state().chatPending,null);assert.equal(s.nodes.get('cb-input').value,'');assert.equal(s.state().chatTimer,2);assert.equal([...s.timers.values()].some(t=>t.ms===5000),true);s.tick(5000);assert(s.trace.some(x=>x[0]==='toast'&&x[1]==='ยังไม่ได้รับการยืนยันข้อความ'));
const p=fixture(original);p.input('sent');p.submit();const sent=p.trace.filter(x=>x[0]==='send').length;p.input('new draft');p.submit();assert.equal(p.trace.filter(x=>x[0]==='send').length,sent);p.receive(p.message({text:'sent',senderId:'self'}));assert.equal(p.nodes.get('cb-input').value,'new draft');assert.equal(p.state().chatPending,null);
p.sendHook(()=>{throw Error('send failed');});p.submit();assert.equal(p.state().chatPending,null);assert.equal(p.state().chatTimer,null);assert(p.trace.some(x=>x[0]==='toast'&&x[1]==='ส่งข้อความไม่สำเร็จ'));
for(const [setup,expected] of [[x=>x.env.mode='demo','เข้าออนไลน์เพื่อใช้แชท'],[x=>x.env.room.state.chatAvailable=false,'เซิร์ฟเวอร์ยังไม่รองรับช่องนี้'],[x=>x.input('x'.repeat(201)),'พิมพ์ข้อความไม่เกิน 200 ตัวอักษร'],[x=>x.tab('private'),'เลือกผู้รับก่อนส่ง']]){const x=fixture(original);x.input('hello');setup(x);if(x.nodes.get('cb-input').value==='')x.input('hello');x.submit();assert(x.trace.some(t=>t[0]==='toast'&&t[1]===expected));assert.equal(x.trace.some(t=>t[0]==='send'),false);}
const b=fixture(original);b.tab('bug');b.input('bug');b.submit();b.handlers.get('chat_report_result')({ok:true});assert.equal(b.state().chatPending,null);assert.equal(b.nodes.get('cb-input').value,'');assert.equal(b.state().chatHistory.bug.length,1);
// Map resets retain identity-bound world/private drafts; full identity resets clear them and pending timer.
const c=fixture(original);c.receive(c.message());c.receive(c.message({channel:'private',text:'secret'}));c.tab('private');c.input('private draft');c.nodes.get('cb-target').value='other';c.nodes.get('cb-target').onchange();c.submit();c.call('clearChatHistory',false);assert.deepEqual(c.state().chatFeed.map(x=>x.channel),['private']);assert.equal(c.state().chatDraft.private,'private draft');assert(c.state().chatPending);c.call('clearChatHistory',true);assert.equal(c.state().chatFeed.length,0);assert.equal(c.state().chatHistory.private.length,0);assert.equal(c.state().chatTargetId,'');assert.equal(c.state().chatBoxTab,'all');assert.equal(c.nodes.get('cb-input').value,'');assert.equal(c.state().chatPending,null);assert.equal(c.state().chatTimer,null);
// Input key handling is intentionally broader than Escape: all keys stop propagation.
const k=fixture(original);k.call('openChat');k.dispatch('cb-input','keydown',k.event({key:'x'}));assert.equal(k.trace.at(-1)[0],'stop');k.dispatch('cb-input','keydown',k.event({key:'Escape'}));assert.equal(k.nodes.get('cb-open').attrs['aria-expanded'],'false');k.dispatch('window','keydown',k.event({key:'Enter',target:{tagName:'DIV'}}));assert.equal(k.env.document.activeElement,k.nodes.get('cb-input'));k.dispatch('document','pointerdown',{target:k.nodes.get('game')});assert.equal(k.env.document.activeElement,null);
// Reentry from drawer-close focus must not lose composing state or final input focus.
const r=fixture(original);r.nodes.get('drawer').hidden=false;r.drawerHook(()=>r.call('openChat'));r.call('openChat');assert.equal(r.env.document.activeElement,r.nodes.get('cb-input'));assert.equal(r.nodes.get('cb-open').attrs['aria-expanded'],'true');
const missing=fixture(original,{noGame:true});missing.call('openChat');missing.call('closeChatComposer');missing.call('pushChatFeed','world','n','t',false);assert.equal(missing.state().chatFeed.length,1);
// Focused recipient selection suppresses option rebuild, including when that player leaves.
const t=fixture(original);t.tab('private');t.nodes.get('cb-target').value='other';t.nodes.get('cb-target').onchange();t.nodes.get('cb-target').focus();t.env.room.state.players.delete('other');t.call('renderChatBox',false);assert.equal(t.nodes.get('cb-target').value,'other');t.nodes.get('cb-target').blur();t.call('renderChatBox',false);assert.equal(t.nodes.get('cb-target').value,'');assert.equal(t.state().chatTargetId,'');
const ex=fixture(original);ex.tab('party');ex.input('party');ex.env.room.state.extendedChatAvailable=false;ex.submit();assert.equal(ex.state().chatPending,null);assert(ex.trace.some(x=>x[0]==='toast'&&x[1]==='เซิร์ฟเวอร์ยังไม่รองรับช่องนี้'));
const unicode=fixture(original);unicode.input('😀'.repeat(200));unicode.submit();assert.equal(unicode.trace.filter(x=>x[0]==='send').length,1,'code points, not UTF-16 units, determine limit');
const targetAck=fixture(original);targetAck.tab('private');targetAck.nodes.get('cb-target').value='other';targetAck.nodes.get('cb-target').onchange();targetAck.input('secret');targetAck.submit();targetAck.receive(targetAck.message({channel:'private',senderId:'self',text:'secret',targetId:'wrong'}));assert(targetAck.state().chatPending);targetAck.receive(targetAck.message({channel:'private',senderId:'self',text:'secret',targetId:'other'}));assert.equal(targetAck.state().chatPending,null);
const ignored=fixture(original);ignored.handlers.get('chat_report_result')({ok:true});assert.equal(ignored.state().chatHistory.bug.length,0);ignored.tab('bug');ignored.input('bug');ignored.submit();ignored.env.room={};ignored.handlers.get('chat_report_result')({ok:true});assert(ignored.state().chatPending);assert.equal(ignored.state().chatHistory.bug.length,0);
// Width/viewport listeners persist for page lifetime; reset does not remove them or cancel the fade timer.
const life=fixture(original);life.receive(life.message());const count=life.listeners.length;life.call('clearChatHistory',true);assert.equal(life.listeners.length,count);assert([...life.timers.values()].some(t=>t.ms===8000));life.wide.matches=false;life.dispatch('wide','change');assert.equal(life.nodes.get('cb-input').parentElement.classes.has('wide'),false);life.viewport.offsetTop=20;life.viewport.height=600;life.dispatch('viewport','resize');assert.equal(life.nodes.get('cb-input').parentElement.style['--chat-keyboard-offset'],'224px');
console.log('PASS chat original characterization: ordered listeners, DOM text, tabs/drafts/targets, scope, scrolling/caps, send/ack/timers, reset, keyboard, no-game, and drawer-focus reentry');
assert.deepEqual(scenario(fixture(original)),scenario(fixture(original)), 'Original scenario is deterministic');
module.exports={original,fixture,scenario};

// Compare the real module and exact production bindings, never an adapter that
// reimplements the candidate. State stays private; observations use DOM and ports.
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
function section(file,first,last){const s=read(file),a=s.indexOf(first),b=s.indexOf(last,a);assert(a>=0&&b>a,file+': '+first);return s.slice(a,b);}
const moduleSource=read('src/client-modules/chat-controller.js');
const bindings={
 state004:section('src/client/render/004-scene-camera-lights.js','  const chatController =','  const scene ='),
 view042:section('src/client/ui/042-vitals-chat-and-status.js','  // ---- One chat box','  // ---- Layout moves:'),
 controls046:section('src/client/ui/046-drawers-and-chat.js','  function finishChatPending(){return','  drawerController.installBackdrop();'),
 message044:section('src/client/network/044-state-sync-and-connection.js','      joined.onMessage("chat_message"','      const onTerritoryState='),
 report044:section('src/client/network/044-state-sync-and-connection.js','      joined.onMessage("chat_report_result"','      const onGuildState='),
};
const candidate={...bindings,state004:moduleSource+'\n'+bindings.state004};
assert.deepEqual(scenario(fixture(candidate)),scenario(fixture(original)));
const traceLength=scenario(fixture(original)).trace.length;
for(let at=1;at<=traceLength;at++){
 const a=fixture(original),b=fixture(candidate);a.interrupt(at);b.interrupt(at);
 assert.deepEqual(scenario(b),scenario(a),'interruption '+at);
}
// Nested close/open can run synchronously during drawer focus restoration or DOM
// callbacks. Exercise every operation of the regular scenario once in each direction.
function reenter(parts,at,method){const f=fixture(parts);let n=0,fired=false;f.observe(()=>{if(!fired&&++n===at){fired=true;f.act(()=>f.call(method));}});return scenario(f);}
for(const method of ['openChat','closeChatComposer'])for(let at=1;at<=traceLength;at++)assert.deepEqual(reenter(candidate,at,method),reenter(original,at,method),'reentry '+method+' '+at);
function edges(parts){
 const f=fixture(parts),out=[];
 const snap=()=>out.push(f.snapshot());
 f.receive(f.message({channel:'world',text:'old retained'}));for(let i=0;i<199;i++)f.receive(f.message());f.tab('world');snap();f.tab('all');
 f.nodes.get('cb-log').scrollHeight=300;f.nodes.get('cb-log').clientHeight=100;f.nodes.get('cb-log').scrollTop=170;f.receive(f.message({name:'<img>',text:'<script>x</script>'}));snap();
 f.nodes.get('cb-log').scrollTop=171;f.receive(f.message());snap();
 for(let i=0;i<205;i++)f.receive(f.message({text:String(i)}));snap();f.tab('world');f.tab('all');snap();
 for(const override of [{channel:'invalid'},{mapId:'other-map'},{name:3},{text:3},{senderId:3}])f.receive(f.message(override));snap();
 f.env.room={};f.receive(f.message());snap();f.env.room=f.env.joined;
 for(const setup of [()=>f.env.mode='demo',()=>{f.env.mode='live';f.env.room=null;},()=>{f.env.room=f.env.joined;f.env.room.state.chatAvailable=false;},()=>{f.env.room.state.chatAvailable=true;f.input('x'.repeat(201));}]){f.input('text');setup();f.submit();snap();}
 f.input('  ');f.submit();f.input('e\u0301');f.sendHook((type,command)=>f.receive(f.message({...command,senderId:'self'})));f.submit();snap();f.tick(5000);snap();
 f.sendHook(null);f.input('old');f.submit();f.input('new');f.submit();f.tab('world');f.receive(f.message({text:'old',senderId:'self'}));snap();f.tab('world');f.tab('map');snap();
 f.sendHook(()=>{throw Error('send failure');});f.submit();snap();
 f.tab('private');f.input('missing recipient');f.submit();snap();f.nodes.get('cb-target').value='other';f.nodes.get('cb-target').onchange();f.input('secret');f.call('clearChatHistory',false);snap();f.call('clearChatHistory',true);snap();f.tab('private');snap();f.sendHook(null);f.tab('map');f.input('pending reset');f.submit();f.call('clearChatHistory',true);snap();
 return {trace:f.trace,out};
}
assert.deepEqual(edges(candidate),edges(original));
// Listener installation occurs in the original two phases, including failures.
for(let at=1;at<=fixture(original).trace.length;at++){
 const run=parts=>{const f=fixture(parts,{initialize:false});f.interrupt(at);f.act(()=>f.evaluate(parts.state004+parts.view042+parts.controls046));return f.trace;};
 assert.deepEqual(run(candidate),run(original),'installation interruption '+at);
}
const noGameA=fixture(original,{noGame:true}),noGameB=fixture(candidate,{noGame:true});
for(const f of [noGameA,noGameB]){f.receive(f.message());f.call('openChat');f.call('clearChatHistory',true);}
assert.deepEqual(noGameB.trace,noGameA.trace);
console.log(`PASS chat differential: ${traceLength} interruption boundaries, ${traceLength*2} open/close reentries, initialization, missing-game, scopes/caps/send/ack/reset edges`);
const expected={scenario:scenario(fixture(original)),edges:edges(original)};
const mutations=[
 ['scroll boundary','< 30','<= 30'],
 ['feed retention','chatFeed.length > 200','chatFeed.length > 199'],
 ['log retention','childElementCount > 60','childElementCount > 59'],
 ['draft preservation','chatDraft[channel].normalize("NFC").trim() === message.text','true'],
 ['ack deadline','}, 5000)','}, 5001)'],
 ['fade deadline','), 8000)', '), 8001)'],
 ['capture order','},true);','},false);'],
 ['private target guard','if (channel === "private" && !target.value)','if (false)'],
 ['text escaping','body.textContent = item.text','body.textContent = ""'],
 ['reset private draft','chatDraft[channel]=""','chatDraft[channel]="retained"'],
 ['full reset timer','      finishChatPending();\n    }','      // dropped pending cleanup\n    }'],
];
for(const [name,from,to] of mutations){assert(moduleSource.includes(from),'mutation target '+name);const mutant={...candidate,state004:moduleSource.replace(from,to)+'\n'+bindings.state004};assert.notDeepEqual({scenario:scenario(fixture(mutant)),edges:edges(mutant)},expected,'reject '+name);}
// The shipping loader is fail closed, with no inline fallback or undeclared asset.
assert.throws(()=>fixture({...bindings,state004:bindings.state004}),/MontraChatController|undefined/);
const tag=read('index.html').split('\n').find(line=>line.includes('./src/client-modules/chat-controller.js?'));
assert(tag&&/\bdefer\b/.test(tag));assert(read('index.html').indexOf(tag)<read('index.html').indexOf('src="./main.js?'));
console.log(`PASS chat negative controls: ${mutations.length} mutants rejected; deferred/load-failure wiring verified`);
const lazyEnv={};for(const key of ['document','window','room'])Object.defineProperty(lazyEnv,key,{get(){assert.fail('eager global '+key);}});
require('node:vm').runInNewContext(moduleSource,lazyEnv);
assert(Object.isFrozen(lazyEnv.MontraChatController));assert.deepEqual(Object.keys(lazyEnv.MontraChatController),['create']);
const privateApi=fixture(candidate);
assert.equal(privateApi.evaluate('Object.isFrozen(chatController) && Object.isFrozen(chatView)'),true);
assert.deepEqual(Array.from(privateApi.evaluate('Object.keys(chatController)')),['initialize','finishChatPending']);
assert.deepEqual(Array.from(privateApi.evaluate('Object.keys(chatView)')),['openChat','closeChatComposer','clearChatHistory','receive','report','installViewport']);
