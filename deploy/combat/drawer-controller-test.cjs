'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const reference = read('deploy/combat/fixtures/drawer-controller-reference.js');
assert.equal(crypto.createHash('sha256').update(reference).digest('hex'), '6a02aacaad97c499e3ebca7bdf147796703857840c93ce18fea43f662bd4c9e3');
function sections(source) {
  if(source.startsWith('  const drawerController =')) return source.slice(0,source.indexOf('  const journalOrigins='))+'  document.addEventListener("keydown",drawerController.handleKey);\n  drawerController.installBackdrop();\n';
  return source.slice(0,source.indexOf('  const journalOrigins=')) +
    source.slice(source.indexOf('  document.addEventListener("keydown",event=>{\n    if (ui.drawer.hidden'), source.indexOf('  function updateChatBadge()')) +
    source.slice(source.indexOf('  $("drawerClose").addEventListener'));
}
function fixture(source, failAt=Infinity, failInstall=false) {
  let count=0, armed=false, observer=null;
  const trace=[], listeners=[], nodes={};
  function step(...row) { trace.push(row); if(armed && ++count===failAt){armed=false;throw Error('interrupted');} observer?.(row); }
  const document={activeElement:null,addEventListener(type,fn,capture){step('listen','document',type,!!capture);listeners.push(['document',type,fn]);}};
  function node(id) {
    const data={id,hidden:true,inert:false,isConnected:true,scrollTop:10,visible:true};
    const api={getClientRects(){step('rects',id);return data.visible?[1]:[];},focus(options){step('focus',id,options?.preventScroll);document.activeElement=nodes[id];},querySelector(){step('query',id);return nodes.tab;},querySelectorAll(){step('queryAll',id);return [nodes.first,nodes.last];},addEventListener(type,fn){step('listen',id,type);listeners.push([id,type,fn]);}};
    nodes[id]=new Proxy(data,{get(target,key){if(key in api)return api[key];step('get',id,String(key));return target[key];},set(target,key,value){step('set',id,String(key),value);target[key]=value;return true;}});
    return nodes[id];
  }
  ['drawer','shade','body','title','game','world','fieldMenu','drawerMenuBack','fieldMenuButton','drawerClose','accountEntry','itemDetailModal','equipPopup','itemModalBackdrop','equipPopupBackdrop','tab','first','last','opener'].forEach(node);
  nodes.game.children=[nodes.world,nodes.drawer,nodes.shade,nodes.itemDetailModal,nodes.equipPopup,nodes.itemModalBackdrop,nodes.equipPopupBackdrop];
  document.activeElement=nodes.opener;
  let forgeHandles=false,itemHandles=false;
  const env={document,ui:{drawer:nodes.drawer,shade:nodes.shade,drawerBody:nodes.body,drawerTitle:nodes.title},$:id=>{step('lookup',id);return nodes[id];},drawerActive:null,drawerOpener:null,fieldTrainingTip:true,ownServerCharacter(){step('character');return {level:1};},window:{MontraAudio:{stopSpeech(){step('speech');}}},SFX:name=>step('sound',name),cancelForgeAnimation:value=>step('cancelForge',value),closeForgePicker:value=>step('closePicker',value),closeEquipPopup:()=>step('closeEquip'),closeItemDetailModal:value=>step('closeItem',value),handleForgePickerKey:()=>{step('forgeKey');return forgeHandles;},handleItemDetailKey:()=>{step('itemKey');return itemHandles;}};
  vm.createContext(env); trace.length=0; count=0;
  armed=failInstall;
  try { vm.runInContext(source,env); } catch(error) { assert.equal(error.message,'interrupted'); trace.push(['interrupted']); }
  const installation=trace.slice();
  trace.length=0;count=0;armed=true;
  const act=(fn)=>{try{fn();}catch(error){assert.equal(error.message,'interrupted');trace.push(['interrupted']);}};
  return {env,nodes,trace,installation,listeners,act,observe(fn){observer=fn;},dispatch(id,type,event={}){for(const [target,kind,fn] of listeners)if(target===id&&kind===type)fn(event);},key(key,shiftKey=false){this.dispatch('document','keydown',{key,shiftKey,preventDefault(){step('prevent',key);}});},priority(forge,item){forgeHandles=forge;itemHandles=item;},disarm(){armed=false;}};
}
const original=sections(reference);
const baseline=fixture(original);
baseline.env.openDrawer('bag','Bag','items');
assert.equal(baseline.env.drawerActive,'bag');assert.equal(baseline.nodes.world.inert,true);assert.equal(baseline.nodes.itemDetailModal.inert,false);assert.equal(baseline.env.document.activeElement,baseline.nodes.drawerMenuBack);
baseline.env.openDrawer('fieldMenu','Menu','');baseline.env.closeDrawer();
assert.equal(baseline.env.document.activeElement,baseline.nodes.opener);assert.equal(baseline.env.drawerActive,null);assert.equal(baseline.nodes.world.inert,false);
assert.deepEqual(baseline.trace.filter(row=>row[0]==='sound'),[['sound','open'],['sound','close']]);
const hidden=fixture(original);hidden.env.closeDrawer();assert.deepEqual(hidden.trace.slice(0,3),[['speech'],['cancelForge',true],['closePicker',false]]);assert.equal(hidden.trace.some(row=>row[0]==='sound'),false);
const shade=fixture(original);shade.env.openDrawer('bag','','');shade.dispatch('shade','click');assert.equal(shade.env.drawerActive,'bag');shade.dispatch('shade','pointerdown');shade.dispatch('shade','pointercancel');shade.dispatch('shade','click');assert.equal(shade.env.drawerActive,'bag');shade.dispatch('shade','pointerdown');shade.dispatch('shade','click');assert.equal(shade.env.drawerActive,null);
const keys=fixture(original);keys.env.openDrawer('bag','','');keys.priority(true,false);keys.key('Escape');assert.equal(keys.env.drawerActive,'bag');keys.priority(false,true);keys.key('Escape');assert.equal(keys.env.drawerActive,'bag');keys.priority(false,false);keys.env.document.activeElement=keys.nodes.last;keys.key('Tab');assert.equal(keys.env.document.activeElement,keys.nodes.first);keys.key('Tab',true);assert.equal(keys.env.document.activeElement,keys.nodes.last);keys.key('Escape');assert.equal(keys.env.drawerActive,null);
// Differential candidate is the actual shell binding, not a rewritten approximation.
const modulePath=path.join(root,'src/client-modules/drawer-controller.js');
const candidate=fs.existsSync(modulePath)?read('src/client-modules/drawer-controller.js')+'\n'+sections(read('src/client/ui/046-drawers-and-chat.js')):original;
function scenario(f) {
  const {env,nodes}=f;
  for(const action of [()=>env.openDrawer('muayBook','Training','one'),()=>env.openDrawer('bag','Bag','two'),()=>{env.document.activeElement=nodes.last;f.key('Tab');},()=>{nodes.opener.isConnected=false;env.closeDrawer();},()=>env.closeDrawer(),()=>env.openDrawer('fieldMenu','Journal',''),()=>f.dispatch('shade','click'),()=>{f.dispatch('shade','pointerdown');f.dispatch('document','pointerdown');f.dispatch('shade','click');},()=>{f.dispatch('shade','pointerdown');f.dispatch('shade','click');},()=>env.openDrawer('bag','',''),()=>{nodes.itemDetailModal.hidden=false;f.key('Escape');},()=>{nodes.itemDetailModal.hidden=true;nodes.equipPopup.hidden=false;f.key('Escape');},()=>{nodes.equipPopup.hidden=true;f.key('Escape');}]) f.act(action);
  return {trace:f.trace,active:env.drawerActive,tip:env.fieldTrainingTip};
}
const normal=scenario(fixture(original));assert.deepEqual(scenario(fixture(candidate)),normal);
for(let fail=1;fail<=normal.trace.length;fail++)assert.deepEqual(scenario(fixture(candidate,fail)),scenario(fixture(original,fail)),'interruption '+fail);
console.log('PASS drawer characterization: route/focus/inert, modal priority, touch retargeting, repeated operations and '+normal.trace.length+' differential interruption boundaries');

// DOM focus and policy callbacks can synchronously re-enter navigation. Inject
// one reentrant open/close at every observable operation, then continue routing.
function reenter(source, at, action) {
  const f=fixture(source);let calls=0, fired=false;
  f.observe(()=>{if(!fired && ++calls===at){fired=true;f.act(()=>action==='open'?f.env.openDrawer('help','Help','nested'):f.env.closeDrawer());}});
  const result=scenario(f);f.observe(null);f.act(()=>f.env.closeDrawer());return result;
}
for(const action of ['open','close'])for(let at=1;at<=normal.trace.length;at++)assert.deepEqual(reenter(candidate,at,action),reenter(original,at,action),'reentrant '+action+' '+at);
console.log('PASS drawer reentry: '+(normal.trace.length*2)+' operation boundaries');

// Corrupt one behavior at a time in memory. Each mutant must disagree with the
// independently frozen implementation, demonstrating that the oracle detects it.
if(fs.existsSync(modulePath)) {
  const mutations=[
    ['lost route clear','onActiveChange(null);','onActiveChange("bag");'],
    ['wrong open sound','playSound("open")','playSound("close")'],
    ['early opener clear','    target.focus({preventScroll:true});\n    drawerOpener=null;','    drawerOpener=null;\n    target.focus({preventScroll:true});'],
    ['inert modal exemption','child.id !== "itemDetailModal"','child.id !== "incorrectModal"'],
    ['training hook omitted','    beforeOpen(name);',''],
    ['nested keyboard priority','if (handleNestedKey(event)) return;','if (false) return;'],
    ['opener overwritten on repeat','    const menu=name===','    drawerOpener=getDocument().activeElement;\n    const menu=name==='],
    ['shade retarget guard','if(!shadePressStarted)return;',''],
    ['modal escape priority','if (dismissNestedModal()) return;','if (false) return;'],
  ];
  function allTraces(source) {
    const traces=[scenario(fixture(source))];
    for(let fail=1;fail<=normal.trace.length;fail++)traces.push(scenario(fixture(source,fail)));
    const f=fixture(source);f.env.openDrawer('bag','','');f.priority(true,false);f.key('Escape');f.priority(false,true);f.key('Escape');traces.push(f.trace);
    for(let at=1;at<=normal.trace.length;at++)traces.push(reenter(source,at,'open'));
    return traces;
  }
  const expected=allTraces(original);
  for(const [name,from,to] of mutations){assert(candidate.includes(from),'mutation target '+name);assert.notDeepEqual(allTraces(candidate.replace(from,to)),expected,'detect '+name);}
  console.log('PASS drawer negative controls: '+mutations.length+' behavioral mutants rejected');
}

if(fs.existsSync(modulePath)) {
  for(let at=1;at<=7;at++) {
    const a=fixture(original,at,true),b=fixture(candidate,at,true);
    assert.deepEqual(b.installation,a.installation,'registration interruption '+at);
    assert.deepEqual(b.listeners.map(x=>x.slice(0,2)),a.listeners.map(x=>x.slice(0,2)));
    a.disarm();b.disarm();assert.deepEqual(scenario(b),scenario(a));
  }
  const shell=read('src/client/ui/046-drawers-and-chat.js');
  assert(shell.indexOf('drawerController.handleKey') < shell.indexOf('chatView.installViewport()'));
  assert(shell.indexOf('chatView.installViewport()') < shell.indexOf('drawerController.installBackdrop()'));
  assert(read('src/client-modules/chat-controller.js').includes('getDocument().addEventListener("pointerdown",event=>{'));
  const env={};for(const key of ['window','document'])Object.defineProperty(env,key,{get(){assert.fail('eager '+key);}});
  vm.runInNewContext(read('src/client-modules/drawer-controller.js'),env);
  assert(Object.isFrozen(env.MontraDrawerController));assert.deepEqual(Object.keys(env.MontraDrawerController),['create']);
  const api=env.MontraDrawerController.create({});assert(Object.isFrozen(api));assert.deepEqual(Object.keys(api),['openDrawer','closeDrawer','handleKey','installBackdrop']);
  const f=fixture(candidate);f.env.openDrawer('bag','','');f.nodes.opener.visible=false;f.env.closeDrawer();assert.equal(f.env.document.activeElement,f.nodes.fieldMenuButton);
  f.env.openDrawer('bag','','');f.nodes.accountEntry.hidden=false;f.key('Escape');assert.equal(f.env.drawerActive,'bag');
  console.log('PASS drawer installation failures, listener order, private factory API, hidden opener and account priority');
}
