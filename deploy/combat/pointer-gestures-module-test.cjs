'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const moduleSource = read('src/client-modules/pointer-gestures.js');
const shell = read('src/client/input/045-pointer-touch-and-dash.js');
const reference = read('deploy/combat/fixtures/pointer-gestures-reference.js');
const oldFragment = reference.slice(reference.indexOf("  // Do not attach Babylon's default camera controls"));
const original = '  let pointer = null;\n' + oldFragment;
const wiring = shell.slice(0, shell.indexOf('  function handleWorldTap('));
let groups = 0;
function test(name, fn) { fn(); groups++; console.log('PASS ' + name); }

test('classic module and factory have no dependency effects and expose only a frozen install API', () => {
  const env = {};
  for (const name of ['document', 'window', 'performance', 'ui', 'camera']) Object.defineProperty(env, name, {get(){assert.fail('Eager browser global: ' + name);}});
  vm.createContext(env); vm.runInContext(moduleSource, env);
  assert.deepEqual(Object.keys(env.MontraPointerGestures), ['create']);
  assert(Object.isFrozen(env.MontraPointerGestures));
  const fail = () => assert.fail('Factory must not use a dependency');
  const api = env.MontraPointerGestures.create({camera: {}, getWorld: fail, getDocument: fail, getWindow: fail, getPerformance: fail, setCameraZoom: fail, onWorldTap: fail, onSwipeDash: fail});
  assert(Object.isFrozen(api)); assert.deepEqual(Object.keys(api), ['install']);
  assert.equal(api.install.length, 0); assert.equal(api.install.name, 'install');
  const other = env.MontraPointerGestures.create({});
  assert.notEqual(other, api); assert.notEqual(other.install, api.install);
  assert.throws(() => {api.install = null;}, TypeError);
});

function observe(source, failAt = Infinity) {
  const trace = [], listeners = [], env = {camera: {alpha:1,beta:.7,radius:55,lowerBetaLimit:.2,upperBetaLimit:1.4}};
  let operation = 0;
  const step = (...row) => { trace.push(row); if (++operation === failAt) throw Error('injected operation'); };
  const targets = {};
  for (const name of ['world', 'replacement', 'controls', 'window']) targets[name] = {
    addEventListener(type, fn, options) { assert.equal(this, targets[name]); step('listen',name,type,options === true ? true : options?.passive === false ? 'passive:false' : undefined); listeners.push({name,type,fn}); },
    setPointerCapture(id) { assert.equal(this,targets[name]); step('capture',name,id); },
  };
  let world = targets.world, clock = 0;
  env.ui = {}; Object.defineProperty(env.ui,'world',{get(){step('get','world');return world;}});
  const document = {querySelector(selector){assert.equal(this,document);step('query',selector);return targets.controls;}};
  const performance = {now(){assert.equal(this,performance);step('now',clock);return clock;}};
  for (const [name,value] of [['document',document],['window',targets.window],['performance',performance]]) Object.defineProperty(env,name,{get(){step('get',name);return value;}});
  env.setCameraZoom = function(radius){assert.equal(this,undefined);step('zoom',radius);env.camera.radius = radius;};
  vm.createContext(env);
  try {vm.runInContext('"use strict";\n'+source,env);trace.push(['ready']);} catch (error) { assert.equal(operation,failAt,'Failure must be the injected operation');trace.push(['failed',error.name,error.message]); }
  return {trace,listeners,env,replaceWorld(){world=targets.replacement;},setClock(time){clock=time;},call(name,type,event){const entry=listeners.find(x=>x.name===name&&x.type===type);assert(entry);entry.fn.call(targets[name],event);}};
}

test('actual shell installs in original order and preserves every partial-registration failure', () => {
  const old = observe(original), current = observe(moduleSource+'\n'+shell);
  assert.deepEqual(current.trace,old.trace);
  assert.deepEqual(current.listeners.map(({name,type})=>[name,type]),[
    ['world','pointerdown'],['world','pointermove'],['world','pointerup'],['world','pointercancel'],['world','wheel'],
    ['controls','pointerdown'],['window','pointerdown'],['window','pointerup'],['window','pointercancel'],['controls','click'],
  ]);
  const operations = old.trace.length - 1;
  assert(operations > 15);
  for (let index=1;index<=operations;index++) {
    const a=observe(original,index), b=observe(moduleSource+'\n'+shell,index);
    assert.deepEqual(b.trace,a.trace,'same failure boundary at '+index);
    assert.deepEqual(b.listeners.map(({name,type})=>[name,type]),a.listeners.map(({name,type})=>[name,type]));
  }
  // Failure during controls lookup must leave all five canvas listeners operational.
  const at = old.trace.findIndex(row=>row[0]==='query')+1;
  const partial = observe(moduleSource+'\n'+shell,at);
  assert.equal(partial.listeners.length,5);
  partial.call('world','wheel',{deltaY:1,preventDefault(){}});
  assert.equal(partial.env.camera.radius,57);
});

test('world and performance reads stay lazy and live with original method and bare-call receivers', () => {
  const run = source => {
    const harness=observe(source); const {env}=harness;
    harness.replaceWorld();
    harness.call('world','pointerdown',{pointerType:'touch',pointerId:1,button:0,clientX:0,clientY:0});
    harness.call('world','pointerdown',{pointerType:'touch',pointerId:2,button:0,clientX:20,clientY:0});
    harness.call('world','pointermove',{pointerType:'touch',pointerId:2,clientX:40,clientY:0});
    harness.call('world','wheel',{deltaY:-1,preventDefault(){harness.trace.push(['preventDefault']);}});
    harness.setClock(120);
    harness.call('controls','pointerdown',{pointerType:'touch',pointerId:3,isPrimary:true,clientX:5,clientY:6});
    return {trace:harness.trace,camera:env.camera};
  };
  assert.deepEqual(run(moduleSource+'\n'+shell),run(original));
});

test('pointer capture is retained for one, two and three touches, with loss detected', () => {
  const verify = source => {
    const harness = observe(source);
    for (const pointerId of [1,2,3]) harness.call('world','pointerdown',{pointerType:'touch',pointerId,button:0,clientX:pointerId*20,clientY:0});
    assert.deepEqual(harness.trace.filter(row=>row[0]==='capture'),[['capture','world',1],['capture','world',2],['capture','world',3]]);
  };
  verify(original); verify(moduleSource+'\n'+shell);
  const mutant=moduleSource.replaceAll('getWorld().setPointerCapture(event.pointerId);','void event.pointerId;');
  assert.notEqual(mutant,moduleSource);
  assert.throws(()=>verify(mutant+'\n'+shell),{name:'AssertionError'});
});

test('rejected or throwing dash callbacks leave the next click suppressed and can retry', () => {
  const load = require('./fixtures/pointer-gestures-loader.cjs');
  for (const source of [load(reference),load()]) for (const throws of [false,true]) {
    const listeners={}, callbackError=Error('dash callback');let calls=0,now=1000;
    const target=name=>({addEventListener(type,fn){listeners[name+':'+type]=fn;}});
    const world=target('world'), controls=target('controls'), window=target('window');
    const context={ui:{world},camera:{},document:{querySelector:()=>controls},window,performance:{now:()=>now},setCameraZoom(){},onWorldTap(){},requestSwipeDash(dx,dy){assert.equal(this,undefined);assert.deepEqual([dx,dy],[30,40]);calls++;if(throws)throw callbackError;return false;}};
    vm.runInNewContext('"use strict";\n'+source.gestures,context);
    const down=()=>listeners['controls:pointerdown']({pointerType:'touch',pointerId:1,isPrimary:true,clientX:0,clientY:0});
    const up=()=>listeners['window:pointerup']({pointerType:'touch',pointerId:1,clientX:30,clientY:40});
    const click=()=>{const trace=[];listeners['controls:click']({preventDefault(){trace.push('prevent');},stopImmediatePropagation(){trace.push('stop');}});return trace;};
    for (let index=0;index<2;index++) {
      down();now+=850;
      if(throws)assert.throws(up,error=>error===callbackError);else up();
      assert.equal(calls,index+1);up();assert.equal(calls,index+1);
      assert.deepEqual(click(),['prevent','stop']);assert.deepEqual(click(),[]);
    }
  }
});

test('shell retains exact picking/action and hoisted dash bodies, with no controller gameplay dependencies', () => {
  const actionStart=oldFragment.indexOf('    const rect = ui.world.getBoundingClientRect();');
  const actionEnd=oldFragment.indexOf('  });\n  ui.world.addEventListener("pointercancel"',actionStart);
  const worldStart=shell.indexOf('  function handleWorldTap(event) {\n')+'  function handleWorldTap(event) {\n'.length;
  const worldEnd=shell.indexOf('  }\n\n  // Direction is relative to the CURRENT camera',worldStart);
  assert.equal(shell.slice(worldStart,worldEnd),oldFragment.slice(actionStart,actionEnd));
  const dashStart=oldFragment.indexOf('  // Direction is relative to the CURRENT camera');
  const dashEnd=oldFragment.indexOf('  // The invisible gesture area extends ABOVE');
  assert.equal(shell.slice(shell.indexOf('  // Direction is relative to the CURRENT camera'),shell.indexOf('  let drawerActive = null;')),oldFragment.slice(dashStart,dashEnd));
  assert.doesNotMatch(moduleSource,/\b(?:room|mode|scene|fishingSelect|pointMove|requestForestAttack|requestMonsterAttack|demoDash|localStorage)\b/);
  assert.doesNotMatch(moduleSource,/removeEventListener|pagehide|visibilitychange|reset|dispose/);
  const main=read('main.js');
  assert.equal(main.split('pointerGestures.install()').length,2);
  assert.equal(main.split('MontraPointerGestures.create').length,2);
  for (const state of ['touchPoints','pinchStart','ignoreTapUntilTouchesLift','dashSwipe','suppressMenuClick','dashZone']) assert.doesNotMatch(main,new RegExp('\\b'+state+'\\b'));
  assert.doesNotMatch(read('src/client/network/044-state-sync-and-connection.js'),/\blet pointer\b/);
  const manifest=JSON.parse(read('src/client/manifest.json'));
  assert.equal(manifest.fragments.indexOf('input/045-pointer-touch-and-dash.js'),45);
  const prefix=manifest.fragments.slice(0,45).map(file=>read('src/client/'+file)).join('');
  assert.doesNotMatch(prefix,/\b(?:pointerGestures|handleWorldTap|touchSeparation|dashDirectionFromSwipe|requestSwipeDash)\b/);
  const env={camera:{},setCameraZoom(){},ui:{world:{addEventListener(){}}},document:{querySelector(){return null;}},probe(...args){this.result=args;}};
  // Calls before the textual function declarations still work after the install boundary.
  vm.runInNewContext(moduleSource+'\n'+wiring+'\nglobalThis.hoisted = [typeof handleWorldTap, typeof dashDirectionFromSwipe, typeof requestSwipeDash];\n'+shell.slice(wiring.length),env);
  assert.deepEqual(Array.from(env.hoisted),['function','function','function']);
});

test('missing module fails before listeners, while deferred classic scripts preserve order and load-failure behavior', () => {
  for (const missing of [undefined,null,{}]) {
    const env={MontraPointerGestures:missing,camera:{},setCameraZoom(){}};
    for (const name of ['ui','document','window','performance']) Object.defineProperty(env,name,{get(){assert.fail('Missing module must fail before DOM dependencies');}});
    assert.throws(()=>vm.runInNewContext(shell,env),{name:'TypeError'});
  }
  const scripts=[...read('index.html').matchAll(/<script src="([^"]+)"([^>]*)>/g)];let previous=-1;
  for (const name of ['character-slot-storage','world-math','item-presentation','voice-guidance','pointer-gestures','main']) {
    const prefix=name==='main'?'./main.js?':'./src/client-modules/'+name+'.js?';
    const matches=scripts.map((value,index)=>({value,index})).filter(({value})=>value[1].startsWith(prefix));
    assert.equal(matches.length,1);const {value,index}=matches[0];assert(index>previous);previous=index;
    assert.match(value[2],/\bdefer\b/i);assert.doesNotMatch(value[2],/\basync\b|\btype\s*=/i);
    const handler=value[2].match(/\bonerror="([^"]+)"/)[1],notices=[];
    vm.runInNewContext(handler,{window:{MontraEntry:{worldUnavailable:text=>notices.push(text)}}});
    assert.deepEqual(notices,['โหลดเกมไม่สำเร็จ กรุณาลองอีกครั้ง']);
    assert.doesNotThrow(()=>vm.runInNewContext(handler,{window:{}}));
  }
});
console.log(`PASS pointer gestures module: ${groups} integration groups`);
