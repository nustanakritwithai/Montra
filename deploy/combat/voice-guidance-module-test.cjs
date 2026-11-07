'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const moduleSource = read('src/client-modules/voice-guidance.js');
const shell = read('src/client/audio/002-voice-guidance.js');
const reference = read('deploy/combat/fixtures/voice-guidance-reference.js');
const names = ['triggerCombatCallout', 'isVoiceGuidanceEnabled', 'setVoiceGuidanceEnabled', 'ensureVoiceGuidanceHud', 'hideVoiceGuidanceHud', 'triggerVoiceGuidance'];
const globals = ['document', 'window', 'localStorage', 'performance', 'setTimeout', 'clearTimeout'];
const wiringEnd = shell.indexOf('  function triggerCombatCallout(');
assert(wiringEnd > 0);
const wiring = shell.slice(0, wiringEnd);
const suffix = '\n;globalThis.api = {' + names.join(',') + '};';
let groups = 0;
function test(name, fn) { fn(); groups++; console.log('PASS ' + name); }

test('classic module and factory are inert, frozen, isolated and expose exactly the original six functions', () => {
  const env = {};
  for (const name of globals) Object.defineProperty(env, name, { get() { assert.fail('Eager dependency: ' + name); } });
  vm.createContext(env);
  vm.runInContext(moduleSource + '\n' + wiring, env);
  const api = vm.runInContext('voiceGuidance', env);
  assert(Object.isFrozen(env.MontraVoiceGuidance));
  assert.deepEqual(Object.keys(env.MontraVoiceGuidance), ['create']);
  assert(Object.isFrozen(api)); assert.deepEqual(Object.keys(api), names);
  const original = vm.runInNewContext('"use strict";\n' + reference + '\n;({' + names.join(',') + '})');
  for (const name of names) { assert.equal(api[name].name, original[name].name); assert.equal(api[name].length, original[name].length); }
  assert.throws(() => vm.runInContext('"use strict"; voiceGuidance.triggerVoiceGuidance = null;', env), { name: 'TypeError' });
  const fresh = env.MontraVoiceGuidance.create({ getStorage: () => ({getItem: () => 'false'}) });
  assert.notEqual(fresh, api); assert.notEqual(fresh.triggerCombatCallout, api.triggerCombatCallout);
  assert.equal(fresh.isVoiceGuidanceEnabled(), false);
});

test('actual startup reaches the controller after the original UI reads with no early voice calls', () => {
  const manifest = JSON.parse(read('src/client/manifest.json'));
  const position = manifest.fragments.indexOf('audio/002-voice-guidance.js');
  assert.equal(position, 2);
  const prefix = manifest.fragments.slice(0, position).map(file => read('src/client/' + file)).join('');
  // Audit the actual executable prefix, not a recreated list of expected statements.
  assert.doesNotMatch(prefix, new RegExp('\\b(?:' + [...names, 'voiceGuidance'].join('|') + ')\\b'), 'No pre-controller voice reference, including nested callbacks');
  const prerequisites = ['character-slot-storage', 'world-math', 'item-presentation'].map(name => read('src/client-modules/' + name + '.js')).join('\n');
  const evaluate = (body, failLookup = Infinity, instrument = false) => {
    const trace = [], env = { URL }; let reads = 0;
    env.document = { getElementById(id) { assert.equal(this, env.document); trace.push(['lookup', id]); if (++reads === failLookup) throw Error('lookup failed'); return null; } };
    for (const name of globals.filter(x => x !== 'document')) Object.defineProperty(env, name, { get() { assert.fail('Premature dependency: ' + name); } });
    vm.createContext(env); vm.runInContext(prerequisites + '\n' + moduleSource, env);
    if (instrument) { const factory = env.MontraVoiceGuidance; env.MontraVoiceGuidance = { create(deps) { trace.push(['create']); return factory.create(deps); } }; }
    try { vm.runInContext(prefix + body + '\n})();', env); trace.push(['ready']); } catch (error) { assert.equal(error.message, 'lookup failed'); trace.push(['stopped']); }
    return trace;
  };
  assert.deepEqual(evaluate(shell), evaluate(reference));
  const trace = evaluate(shell, Infinity, true);
  assert.deepEqual(trace.slice(-2), [['create'], ['ready']]);
  const count = trace.filter(row => row[0] === 'lookup').length;
  assert(count > 10);
  for (let failAt = 1; failAt <= count; failAt++) {
    assert.deepEqual(evaluate(shell, failAt, true), evaluate(reference, failAt));
  }
});

test('forwarders remain hoisted after controller initialization; missing controllers fail before subsequent startup', () => {
  const trace = [], env = { localStorage: { getItem(key) { trace.push(['get',key]); return null; }, setItem(key,value) { trace.push(['set',key,value]); } } };
  vm.runInNewContext(moduleSource + '\n(() => {\n' + wiring + '\n' +
    'globalThis.enabled = isVoiceGuidanceEnabled(); setVoiceGuidanceEnabled(false);\n' + shell.slice(wiringEnd) + suffix + '\n})();', env);
  assert.equal(env.enabled, true);
  assert.deepEqual(trace, [['get','montra_voice_guidance'],['set','montra_voice_guidance','false']]);
  for (const name of names) assert.equal(env.api[name].name, name);
  for (const missing of [undefined, null, {}]) {
    const env = { MontraVoiceGuidance: missing };
    for (const name of globals) Object.defineProperty(env, name, { get() { assert.fail('Missing module must not read dependencies'); } });
    assert.throws(() => vm.runInNewContext(shell + '\nglobalThis.laterStartup = true;', env), { name: 'TypeError' });
    assert.equal(env.laterStartup, undefined);
  }
});

test('pre-fragment TDZ boundary is explicit, not claimed equivalent to the old stateless helpers', () => {
  const probe = (body, preload = '', disabled = false) => {
    const observed = [], env = { localStorage: {getItem: () => disabled ? 'false' : null, setItem(){}}, probe(name, fn) { try { observed.push([name,fn()]); } catch (error) { observed.push([name,error.name]); } } };
    const calls = names.map(name => `probe("${name}", () => ${name}(${name === 'triggerCombatCallout' ? '"low_hp"' : name === 'triggerVoiceGuidance' ? '"move"' : ''}));`).join('\n');
    vm.runInNewContext(preload + '\n(() => { "use strict";\n' + calls + body + '\n})();', env);
    return observed;
  };
  const old = probe(reference), current = probe(shell, moduleSource);
  assert.deepEqual(old, [
    ['triggerCombatCallout','ReferenceError'], ['isVoiceGuidanceEnabled',true], ['setVoiceGuidanceEnabled',undefined],
    ['ensureVoiceGuidanceHud','ReferenceError'], ['hideVoiceGuidanceHud','ReferenceError'], ['triggerVoiceGuidance','ReferenceError'],
  ]);
  assert(current.every(([,result]) => result === 'ReferenceError'));
  assert.deepEqual(probe(reference, '', true), [
    ['triggerCombatCallout',undefined], ['isVoiceGuidanceEnabled',false], ['setVoiceGuidanceEnabled',undefined],
    ['ensureVoiceGuidanceHud','ReferenceError'], ['hideVoiceGuidanceHud','ReferenceError'], ['triggerVoiceGuidance',undefined],
  ]);
  assert(probe(shell, moduleSource, true).every(([,result]) => result === 'ReferenceError'));
});

test('storage, clock, browser and timer getters remain live, preserve receivers and are not cached per operation', () => {
  const observe = source => {
    const trace = [], env = {}, store = new Map(); let reads = 0, time = 25000;
    const storage = { getItem(key) { assert.equal(this, storage); trace.push(['get',key]); return store.get(key); }, setItem(key,value) { assert.equal(this,storage); trace.push(['set',key,value]); store.set(key,value); } };
    Object.defineProperty(env,'localStorage',{configurable:true,get() { trace.push(['storage',++reads]); return storage; }});
    const doc = {createElement(tag) { trace.push(['create',tag]); return { append(){}, classList:{remove(){},toggle(){}} }; },getElementById(){return null;}};
    Object.defineProperty(env,'document',{configurable:true,get() { trace.push(['document']); return doc; }});
    const perf = {now() { assert.equal(this,perf); trace.push(['now',time]); return time; }};
    Object.defineProperty(env,'performance',{configurable:true,get() { trace.push(['performance']); return perf; }});
    let windowReads = 0;
    Object.defineProperty(env,'window',{configurable:true,get() { trace.push(['window',++windowReads]); return {MontraAudio: {speak(text){trace.push(['speak',text]);}}}; }});
    for (const name of ['setTimeout','clearTimeout']) Object.defineProperty(env,name,{configurable:true,get() { trace.push([name+'.get']); return function (...args) { assert.equal(this,undefined); trace.push([name,...args.map(arg => typeof arg === 'function' ? 'callback' : arg)]); return 9; }; }});
    vm.createContext(env); vm.runInContext('"use strict";\n' + source + suffix,env);
    assert.deepEqual(trace,[]);
    env.api.triggerVoiceGuidance('move'); env.api.triggerCombatCallout('low_hp');
    // Replacing a global after state creation must immediately affect later calls.
    Object.defineProperty(env,'localStorage',{get(){trace.push(['replacement storage']); return {getItem:()=>'false'};}});
    env.api.triggerVoiceGuidance('target'); time = 50000; env.api.triggerCombatCallout('low_hp');
    env.api.hideVoiceGuidanceHud();
    return trace;
  };
  assert.deepEqual(observe(moduleSource + '\n' + shell), observe(reference));
});

test('each instance owns its HUD, timers and per-callout cooldown map', () => {
  const env = {}; vm.runInNewContext(moduleSource,env);
  let creates = 0, timer = 0; const calls = [], timers = new Set();
  const document = { createElement() { creates++; return {append(){},classList:{remove(){},toggle(){}}}; },getElementById(){return null;} };
  const deps = {getDocument:()=>document,getWindow:()=>({MontraAudio:{speak(text){calls.push(text);}}}),getStorage:()=>({getItem(){return null;},setItem(){}}),getPerformance:()=>({now:()=>25000}),getSetTimeout:()=>function(){assert.equal(this,undefined);timers.add(++timer);return timer;},getClearTimeout:()=>function(id){assert.equal(this,undefined);timers.delete(id);}};
  const first = env.MontraVoiceGuidance.create(deps), second = env.MontraVoiceGuidance.create(deps);
  first.triggerCombatCallout('low_hp'); first.triggerCombatCallout('low_hp'); second.triggerCombatCallout('low_hp');
  assert.equal(calls.length,2); assert.equal(creates,16); assert.equal(timers.size,2);
  first.hideVoiceGuidanceHud(); assert.equal(timers.size,1); second.hideVoiceGuidanceHud(); assert.equal(timers.size,0);
});

test('all classic deferred scripts retain order and the existing onerror behavior', () => {
  const scripts = [...read('index.html').matchAll(/<script src="([^"]+)"([^>]*)>/g)]; let previous = -1;
  for (const file of ['character-slot-storage','world-math','item-presentation','voice-guidance','main']) {
    const prefix = file === 'main' ? './main.js?' : './src/client-modules/' + file + '.js?';
    const matches = scripts.map((value,index)=>({value,index})).filter(({value})=>value[1].startsWith(prefix));
    assert.equal(matches.length,1); const {value,index} = matches[0]; assert(index>previous); previous=index;
    assert.match(value[2],/\bdefer\b/i); assert.doesNotMatch(value[2],/\basync\b|\btype\s*=/i);
    const handler = value[2].match(/\bonerror="([^"]+)"/)[1], notices=[];
    vm.runInNewContext(handler,{window:{MontraEntry:{worldUnavailable:text=>notices.push(text)}}});
    assert.deepEqual(notices,['โหลดเกมไม่สำเร็จ กรุณาลองอีกครั้ง']);
    assert.doesNotThrow(()=>vm.runInNewContext(handler,{window:{}}));
  }
});
console.log(`PASS voice guidance module: ${groups} integration groups`);
