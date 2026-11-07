'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const loadSource = require('./fixtures/voice-guidance-loader.cjs');
const reference = fs.readFileSync(require.resolve('./fixtures/voice-guidance-reference.js'), 'utf8');
assert.equal(crypto.createHash('sha256').update(reference).digest('hex'), 'db78ed5266b84de0546b19779614c51399880714325e27e1e99cd19f83be3b75');
const names = ['triggerCombatCallout', 'isVoiceGuidanceEnabled', 'setVoiceGuidanceEnabled', 'ensureVoiceGuidanceHud', 'hideVoiceGuidanceHud', 'triggerVoiceGuidance'];
const suffix = '\n;globalThis.api = {' + names.join(',') + '};';
const catalogs = vm.runInNewContext(reference + '\n;({guidance:TYPHOON_VOICE_GUIDANCE,combat:TYPHOON_COMBAT_CALLOUTS})');
function harness(source, options = {}) {
  const log = [], nodes = [], timers = new Map(), storage = new Map(Object.entries(options.storage || {}));
  let tick = options.tick ?? 100000, operation = 0, failAt = options.failAt, timerId = 0;
  const record = (...entry) => {
    log.push(entry);
    if (++operation === failAt) throw Error('injected:' + entry[0]);
  };
  const node = tag => {
    const id = nodes.length;
    const raw = { id, tag, children: [] };
    const classes = {
      remove(...args) { assert.equal(this, classes); record('remove', id, ...args); },
      toggle(...args) { assert.equal(this, classes); record('toggle', id, ...args); }
    };
    raw.classList = classes;
    let proxy;
    raw.append = function (...children) { assert.equal(this, proxy); record('append', id, children.map(x => x.id)); raw.children.push(...children); };
    proxy = new Proxy(raw, {
      get(target, key) { if (key === 'classList' || key === 'append') record('get', id, key); return target[key]; },
      set(target, key, value) { record('set', id, key, typeof value === 'function' ? 'function' : value); target[key] = value; return true; }
    });
    nodes.push(proxy);
    return proxy;
  };
  const game = { append(child) { assert.equal(this, game); record('game.append', child.id); } };
  const document = {
    createElement(tag) { assert.equal(this, document); record('create', tag); return node(tag); },
    getElementById(id) { assert.equal(this, document); record('lookup', id); return options.noGame ? null : game; }
  };
  const localStorage = {
    getItem(key) { assert.equal(this, localStorage); record('storage.get', key); if (options.getThrows) throw Error('get'); return storage.get(key) ?? null; },
    setItem(key, value) { assert.equal(this, localStorage); record('storage.set', key, value); if (options.setThrows) throw Error('set'); storage.set(key, value); }
  };
  const performance = { now() { assert.equal(this, performance); record('now'); if (options.clockThrows) throw Error('clock'); return tick; } };
  const audio = {
    speak(text, opts) {
      assert.equal(this, audio); record('speak', text, opts.persona, typeof opts.onEnd, typeof opts.onError);
      h.callbacks.push(opts);
      if (options.syncEnd) opts.onEnd();
      if (options.syncError) opts.onError();
      if (options.speakThrows) throw Error('speech');
    },
    stopSpeech() { assert.equal(this, audio); record('stopSpeech'); if (options.stopThrows) throw Error('stop'); }
  };
  const window = {};
  Object.defineProperty(window, 'MontraAudio', { configurable:true, get() { record('audio.get'); if (options.audioThrows) throw Error('audio'); return options.noAudio ? undefined : audio; } });
  if (options.noSpeak) delete audio.speak;
  if (options.noStop) delete audio.stopSpeech;
  const globals = { document, window, performance,
    setTimeout: function (fn, delay) { assert.equal(this, undefined, 'setTimeout must be called bare'); record('timeout', delay); const id = ++timerId; timers.set(id, fn); return id; },
    clearTimeout: function (id) { assert.equal(this, undefined, 'clearTimeout must be called bare'); record('clear', id); timers.delete(id); }
  };
  Object.defineProperty(globals, 'localStorage', { configurable:true, get() { record('storage.global'); if (options.storageThrows) throw Error('storage'); return localStorage; } });
  const context = vm.createContext(globals);
  const h = { log, nodes, timers, storage, callbacks: [], context, options,
    call(name, ...args) { try { const result = h.api[name](...args); log.push(['return', name, result === undefined ? 'undefined' : result]); return result; } catch (error) { log.push(['throw', name, error.name, error.message]); return error; } },
    time(value) { tick = value; },
    disarm() { failAt = undefined; },
    event(name, fn) { try { fn(); log.push(['event', name]); } catch (e) { log.push(['event.throw', name, e.name, e.message]); } },
    fire() { const first = timers.entries().next().value; if (first) { timers.delete(first[0]); h.event('timer', first[1]); } },
    skip() { const button = nodes.find(n => n.tag === 'button'); if (button?.onclick) h.event('skip', button.onclick); }
  };
  vm.runInContext('"use strict";\n' + source + suffix, context);
  h.api = context.api;
  return h;
}
function compare(source, options, run) {
  const a = harness(reference, { ...options }), b = harness(source, { ...options });
  run(a); run(b);
  assert.deepEqual(b.log, a.log);
  assert.deepEqual([...b.storage], [...a.storage]);
  assert.deepEqual([...b.timers.keys()], [...a.timers.keys()]);
  return b;
}
function suite(source) {
  const baseline = harness(reference), candidate = harness(source);
  assert.equal(Object.keys(catalogs.guidance).length, 7);
  assert.equal(Object.keys(catalogs.combat).length, 12);
  for (const name of names) {
    assert.equal(candidate.api[name].name, name);
    assert.equal(candidate.api[name].length, baseline.api[name].length);
  }
  for (const key of Object.keys(catalogs.guidance)) compare(source, {}, h => {
    h.call('triggerVoiceGuidance', key); h.call('triggerVoiceGuidance', key);
    h.event('error', h.callbacks[0].onError); h.event('end', h.callbacks[0].onEnd); h.fire(); h.skip();
  });
  for (const [key, item] of Object.entries(catalogs.combat)) compare(source, { tick: 0 }, h => {
    for (const time of [0, item.cooldown-1, item.cooldown, item.cooldown*2-1, item.cooldown*2]) {
      h.time(time); h.call('triggerCombatCallout', key);
    }
    h.fire(); h.call('hideVoiceGuidanceHud');
  });
  compare(source, {}, h => {
    h.call('hideVoiceGuidanceHud'); h.call('triggerCombatCallout', 'absent'); h.call('triggerVoiceGuidance', 'absent');
    h.call('triggerVoiceGuidance', 'move'); h.call('triggerCombatCallout', 'boss_telegraph');
    h.call('triggerCombatCallout', 'low_hp'); h.call('triggerVoiceGuidance', 'gear');
    h.skip(); h.fire();
  });
  for (const options of [{noGame:true}, {getThrows:true}, {setThrows:true}, {storageThrows:true}, {noAudio:true}, {noSpeak:true}, {noStop:true}, {speakThrows:true}, {audioThrows:true}, {stopThrows:true}, {syncEnd:true}, {syncError:true}, {syncEnd:true,speakThrows:true}, {clockThrows:true}]) {
    compare(source, options, h => {
      h.call('isVoiceGuidanceEnabled'); h.call('setVoiceGuidanceEnabled', true);
      h.call('triggerVoiceGuidance', 'move'); h.call('triggerVoiceGuidance', 'move');
      h.call('triggerCombatCallout', 'low_hp'); h.skip(); h.fire();
    });
  }
  for (const value of ['', '0', 'false', 'true', '1']) {
    compare(source, {storage:{montra_vg_played_move:value}}, h => h.call('triggerVoiceGuidance','move'));
    compare(source, {storage:{montra_voice_guidance:value}}, h => { h.call('triggerVoiceGuidance','move'); h.call('triggerCombatCallout','low_hp'); });
  }
  compare(source, {}, h => { for (const value of [true,false,0,1,'', 'false',null,undefined,{},[]]) { h.call('setVoiceGuidanceEnabled',value); h.call('isVoiceGuidanceEnabled'); } });
  // Inject a one-shot failure at EVERY observable operation, not only creation.
  // Retry at the same and a later timestamp captures partial initialization and consumed cooldowns.
  for (const [name,key] of [['ensureVoiceGuidanceHud',undefined],['triggerVoiceGuidance','move'],['triggerCombatCallout','low_hp']]) {
    const probe = harness(reference); probe.call(name,key);
    const count = probe.log.length;
    for (let failAt = 1; failAt <= count; failAt++) compare(source,{failAt},h => {
      h.call(name,key); h.disarm(); h.call(name,key); h.time(200000); h.call(name,key);
      h.call('triggerVoiceGuidance','gear'); h.call('hideVoiceGuidanceHud'); h.skip(); h.fire();
    });
  }
  for (const globalName of ['document','window','performance','setTimeout','clearTimeout']) {
    for (const initialized of [false,true]) compare(source,{},h => {
      if (initialized) h.call('triggerVoiceGuidance','move');
      Object.defineProperty(h.context,globalName,{configurable:true,get() { h.log.push(['global.throw',globalName]); throw Error('global:'+globalName); }});
      h.call('triggerVoiceGuidance','target');
      h.call('triggerCombatCallout','low_hp');
      h.skip(); h.fire(); h.call('hideVoiceGuidanceHud');
    });
  }
  // Changes after initialization must be observed, including getter failures.
  compare(source,{},h => {
    h.call('triggerVoiceGuidance','move');
    h.options.noAudio = true; h.call('triggerVoiceGuidance','target');
    h.options.noAudio = false; h.options.audioThrows = true; h.call('triggerVoiceGuidance','combo');
    h.options.audioThrows = false; h.options.storageThrows = true; h.call('triggerVoiceGuidance','combo');
    h.options.storageThrows = false; h.storage.set('montra_voice_guidance','false'); h.call('triggerCombatCallout','low_hp');
  });
}
// Explicit independent anchors complement differential traces.
{
  const h = harness(loadSource(), {tick:24999});
  h.call('triggerCombatCallout','low_hp');
  assert.equal(h.nodes.length,0, 'first call is suppressed until the cooldown threshold');
  h.time(25000); h.call('triggerCombatCallout','low_hp');
  assert.equal(h.nodes.length,8);
  assert.equal(h.nodes[0].hidden,false);
  assert.equal(h.callbacks.length,1);
  assert.equal(h.timers.size,1);
  h.event('error',h.callbacks[0].onError);
  assert.equal(h.nodes[0].hidden,false);
  h.skip();
  assert.equal(h.nodes[0].hidden,true);
  assert.equal(h.timers.size,0);
}
suite(loadSource());
// These are actual source mutants. Each must be rejected by the behavior suite.
const mutants = [
  ['copy', 'พราหมณ์เฒ่าผู้ชี้แนะ', 'changed title'],
  ['icon', 'icon: "🔥"', 'icon: "X"'],
  ['cooldown inclusive', 'now - last < item.cooldown', 'now - last <= item.cooldown'],
  ['storage truthiness', 'if (localStorage.getItem(key)) return;', 'if (localStorage.getItem(key) === "1") return;'],
  ['timer cancel', 'clearTimeout(voiceHudTimer);', 'void voiceHudTimer;'],
  ['partial DOM', 'if (voiceGuidanceHud) return;', 'if (voiceGuidanceHud && voiceHudText) return;'],
  ['speech error callback', 'onError: () => {}', 'onError: () => hideVoiceGuidanceHud()'],
  ['timer receiver', 'voiceHudTimer = setTimeout(', 'voiceHudTimer = globalThis.setTimeout('],
  ['storage receiver', 'localStorage.getItem("montra_voice_guidance")', '(0, localStorage.getItem)("montra_voice_guidance")'],
];
for (const [label, before, after] of mutants) {
  assert.ok(reference.includes(before), label);
  assert.throws(() => suite(reference.replace(before,after)), undefined, 'negative control escaped: '+label);
}
console.log('Voice guidance characterization passed: pinned catalogs, traces, fault injection, cooldowns, storage, timers, callbacks, receivers, live globals; 9 negative controls rejected.');
