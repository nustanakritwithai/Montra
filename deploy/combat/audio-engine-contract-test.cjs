// Exact-source executable contracts. Graph mocks prove routing, not physical acoustics.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'audio.js'), 'utf8');
function engine({ native = false, local = false, unlock = true } = {}) {
  const nodes = [], media = [], utterances = [], listeners = {}, timers = new Map(), timerDelays = new Map();
  let seq = 0, cancelled = 0;
  class Param {
    constructor(value = 1) { this.value = value; }
    setValueAtTime(v) { assert.ok(Number.isFinite(v)); this.value = v; }
    exponentialRampToValueAtTime(v) { assert.ok(Number.isFinite(v) && v > 0); this.value = v; }
    cancelScheduledValues() {}
  }
  class Node {
    constructor(type) {
      this.type = type; this.outputs = []; nodes.push(this);
      for (const k of ['gain', 'frequency', 'detune', 'playbackRate', 'Q', 'threshold', 'knee', 'ratio', 'attack', 'release', 'pan']) this[k] = new Param();
    }
    connect(n) { this.outputs.push(n); return n; }
    disconnect() { this.outputs = []; }
    start(t) { this.started = true; this.startTime = t; }
    stop(t) { this.stopTime = t; }
  }
  class Context {
    constructor() { this.state = 'running'; this.currentTime = 1; this.sampleRate = 100; this.destination = new Node('destination'); }
    createDynamicsCompressor() { return new Node('compressor'); }
    createGain() { return new Node('gain'); }
    createConvolver() { return new Node('reverb'); }
    createBuffer(c, l) { return { getChannelData: () => new Float32Array(l) }; }
    createBufferSource() { return new Node('source'); }
    createOscillator() { return new Node('oscillator'); }
    createBiquadFilter() { return new Node('filter'); }
    createStereoPanner() { return new Node('pan'); }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
  }
  const synth = {
    getVoices: () => native ? [{ lang: 'th-TH', name: 'Thai', localService: local }] : [],
    cancel() { cancelled++; utterances.at(-1)?.onerror({ error: 'canceled' }); },
    resume() {}, speak(u) { utterances.push(u); }
  };
  const window = { AudioContext: Context, addEventListener() {}, speechSynthesis: synth };
  class Audio {
    constructor(url) { this.url = url; this.paused = true; media.push(this); }
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
  }
  const document = { hidden: false, addEventListener(k, f) { listeners[k] = f; } };
  const marker = 'window.MontraAudio = {';
  assert.equal(source.split(marker).length, 2, 'single public API injection point');
  vm.runInNewContext(source.replace(marker, 'window.__test = {R,META,DUR,voice,musicLayer,startAmbience,graph:()=>({ctx,buses,reverb,master})};' + marker), {
    window, Audio, SpeechSynthesisUtterance: class {}, document,
    localStorage: { getItem: () => null, setItem() {} },
    setInterval() {}, setTimeout(f, delay) { timers.set(++seq, f); timerDelays.set(seq, delay); return seq; }, clearTimeout(id) { timers.delete(id); timerDelays.delete(id); }, performance: { now: () => 1000 }
  });
  if (unlock) window.MontraAudio.unlock();
  return { api: window.MontraAudio, test: window.__test, nodes, media, utterances, document, listeners, timers, timerDelays, cancelled: () => cancelled };
}

{
  const e = engine({ native: true, local: true });
  e.api.notify('  ลงเรือ   สำเร็จ  ');
  assert.equal(e.utterances.length, 1);
  assert.equal(e.utterances[0].lang, 'th-TH');
  assert.equal(e.utterances[0].voice.localService, true);
  assert.equal(e.api.voices, 0, 'speech replaces the chime');
  e.api.notify('another notice');
  assert.equal(e.utterances.length, 1, 'burst is throttled');
  assert.equal(e.api.voices, 0, 'burst adds no chime');
  e.utterances[0].onerror({ error: 'not-allowed' });
  assert.equal(e.api.voices, 1, 'failed local speech uses one chime');
  assert.equal(e.media.length, 0);
}
for (const native of [false, true]) {
  const e = engine({ native });
  e.api.notify('ข้อความแจ้งเตือน');
  assert.equal(e.utterances.length, 0, 'a nonlocal voice must not get a notice');
  assert.equal(e.media.length, 0, 'a notice never goes to the remote fallback');
  assert.equal(e.api.voices, 1, 'use a chime without local Thai speech');
}
{
  const e = engine({ native: true, local: true });
  e.api.speak('คำตอบจากผู้แนะนำ');
  e.api.notify('ข้อความแจ้งเตือน');
  assert.equal(e.cancelled(), 0, 'the notice must not interrupt existing speech');
  assert.equal(e.utterances.length, 1);
  assert.equal(e.api.voices, 1);
}
for (const key of ['master', 'muted', 'ui', 'hidden']) {
  const e = engine({ native: true, local: true });
  if (key === 'hidden') e.document.hidden = true;
  else e.api.set(key, key === 'muted');
  e.api.notify('ข้อความแจ้งเตือน');
  assert.equal(e.utterances.length + e.media.length + e.api.voices, 0, key);
}
{
  const e = engine({ native: true, local: true });
  e.api.notify('ข้อความแจ้งเตือน');
  e.api.set('ui', 0);
  assert.equal(e.api.isSpeaking(), false, 'muting notices stops an active spoken notice');
  assert.equal(e.api.voices, 0);
}

function paths(node, target, seen = new Set()) {
  if (node === target) return [[node]];
  if (seen.has(node)) return [];
  return node.outputs.flatMap(out => paths(out, target, new Set([...seen, node])).map(p => [node, ...p]));
}
function signal(paths) { return paths.reduce((n, p) => n + p.reduce((g, node) => g * (node.type === 'gain' ? node.gain.value : 1), 1), 0); }
for (const bus of ['sfx', 'ui', 'ambience', 'music']) {
  const e = engine(), { ctx, buses, reverb } = e.test.graph();
  e.api.set(bus, 1);
  const out = bus === 'music' ? e.test.musicLayer() : bus === 'ambience' ? e.test.startAmbience('ritual_village').out : e.test.voice(bus, { gain: 1, wet: .2, pan: .4, dur: 1 });
  const routes = paths(out, ctx.destination);
  assert.equal(routes.length, 2, `${bus}: dry + wet route`);
  assert.ok(routes.every(p => p.includes(buses[bus])), `${bus}: all routes cross category fader`);
  assert.ok(routes.some(p => p.includes(reverb[bus])), `${bus}: reverb retained`);
  for (const other of Object.keys(buses).filter(k => k !== bus)) {
    assert.ok(routes.every(p => !p.includes(buses[other]) && !p.includes(reverb[other])), `${bus}: no category cross bleed`);
  }
  const before = signal(routes);
  e.api.set(bus, .25); assert.equal(signal(routes), before * .25, `${bus}: running dry/wet scaled together`);
  e.api.set(bus, 0); assert.equal(signal(routes), 0, `${bus}: zero silences active dry/wet`);
  assert.equal(signal(paths(reverb[bus], ctx.destination)), 0, `${bus}: existing reverb tail silenced`);
  e.api.set(bus, 1); assert.equal(signal(routes), before);
  e.api.set('master', 0); assert.equal(signal(routes), 0);
  e.api.set('master', 1); e.api.set('muted', true); assert.equal(signal(routes), 0);
}
// Derive IDs from server-owned catalogs, not a manually duplicated list.
let coreCount = 0;
for (const [catalog, file] of [['SWORD_CORE', 'SkillCatalog'], ['MUAY_CORE', 'MuayRules'], ['BLADE_CORE', 'BladeRules'], ['SENTINEL_CORE', 'SentinelRules'], ['SEER_CORE', 'OccultRules'], ['MENDER_CORE', 'OccultRules']]) {
  const catalogSource = fs.readFileSync(path.join(__dirname, file + '.ts'), 'utf8');
  const body = catalogSource.match(new RegExp(`export const ${catalog}\\s*=\\s*\\{([\\s\\S]*?)\\} as const;`));
  assert.ok(body, `catalog ${catalog} located`);
  const ids = [...body[1].matchAll(/^  (\w+):/gm)].map(m => m[1]);
  assert.equal(ids.length, 4); coreCount += ids.length;
  for (const id of ids) {
    for (const delay of [0, .7]) {
      const e = engine();
      assert.equal(typeof e.test.R[id], 'function', id);
      assert.equal(e.test.META[id]?.[0], 'sfx', `${id}: explicit core bus`);
      assert.ok(e.test.DUR[id] > 0, `${id}: explicit lifetime`);
      const start = e.nodes.length, now = e.test.graph().ctx.currentTime;
      assert.equal(e.api.play(id, { delay }), true, `${id}: accepted through real API`);
      const sources = e.nodes.slice(start).filter(n => n.started);
      assert.ok(sources.length, `${id}: schedules actual sound`);
      assert.ok(sources.every(n => Number.isFinite(n.startTime) && Number.isFinite(n.stopTime)), `${id}: all sources have scheduled lifetimes`);
      assert.ok(sources.every(n => n.startTime >= now + delay), `${id}: sources respect requested delay`);
      assert.equal(e.timers.size, 1, `${id}: single voice cleanup`);
      const disconnectAt = now + [...e.timerDelays.values()][0] / 1000;
      assert.ok(sources.every(n => n.stopTime <= disconnectAt), `${id}: cleanup ${disconnectAt} must follow final source stop ${Math.max(...sources.map(n => n.stopTime))}`);
      [...e.timers.values()][0]();
      assert.equal(e.api.voices, 0, `${id}: cleanup releases voice budget`);
    }
  }
}
assert.equal(coreCount, 24);
const clientFiles = fs.readdirSync(path.join(root, 'src/client'), { recursive: true }).filter(f => f.endsWith('.js'));
const clientSource = clientFiles.map(f => fs.readFileSync(path.join(root, 'src/client', f), 'utf8')).join('\n');
const literalIds = [...new Set([...clientSource.matchAll(/(?:\bSFX|MontraAudio\??\.play(?:\?\.)?)\(\s*["']([a-z_]+)["']/g)].map(m => m[1]))];
for (const id of literalIds) {
  const e = engine(), start = e.nodes.length;
  assert.equal(e.api.play(id), true, `literal ${id} must play`);
  assert.ok(e.nodes.slice(start).some(n => n.started), `literal ${id} schedules sound`);
}
for (const id of ['bell', 'shock', 'equip']) assert.ok(literalIds.includes(id));
for (const native of [false, true]) {
  for (const started of [false, true]) {
    for (const [key, value] of [['muted', true], ['master', 0], ['voice', 0]]) {
      const e = engine({ native, unlock: false }), events = [];
      e.api.speak('ทดสอบ', { onStart: () => events.push('start'), onEnd: () => events.push('end'), onError: () => events.push('error') });
      const old = native ? e.utterances[0] : e.media[0];
      if (started) (native ? old.onstart : old.onplaying)();
      e.api.set(key, value);
      assert.equal(e.api.isSpeaking(), false, `${native}/${started}/${key}: stopped`);
      assert.equal(e.timers.size, 0);
      if (native) assert.equal(e.cancelled(), 1); else assert.equal(old.paused, true);
      (native ? old.onstart : old.onplaying)(); old.onerror({ error: 'late' }); (native ? old.onend : old.onended)();
      assert.deepEqual(events, started ? ['start', 'end'] : ['end']);
      e.api.set(key, key === 'muted' ? false : 1);
      assert.equal(e.api.isSpeaking(), false, 'restoring volume does not replay');
      e.api.speak('ใหม่');
      old.onerror({ error: 'late' }); (native ? old.onend : old.onended)();
      assert.equal(e.api.isSpeaking(), true, 'old callbacks cannot own new session');
    }
  }
  for (const key of ['master', 'voice']) {
    const e = engine({ native, unlock: false }); e.api.speak('ทดสอบ');
    const speech = native ? e.utterances[0] : e.media[0];
    (native ? speech.onstart : speech.onplaying)();
    e.api.set('sfx', .2); assert.equal(e.api.isSpeaking(), true, 'unrelated fader leaves speech alone');
    e.api.set(key, e.api.settings[key]); assert.equal(e.api.isSpeaking(), true, 'same setting leaves speech alone');
    e.api.set(key, .2);
    if (native) { assert.equal(e.api.isSpeaking(), false); assert.equal(e.cancelled(), 1); assert.equal(e.utterances.length, 1); }
    else { assert.equal(e.api.isSpeaking(), true); assert.equal(speech.volume, e.api.settings.master * e.api.settings.voice); }
  }
  for (const unlock of [false, true]) {
    const e = engine({ native, unlock }); e.api.speak('ทดสอบ');
    e.document.hidden = true; e.listeners.visibilitychange();
    assert.equal(e.api.isSpeaking(), false, 'hiding stops speech even without Web Audio');
    assert.equal(e.api.speak('background'), false, 'hidden game calls cannot restart speech');
    e.document.hidden = false; e.listeners.visibilitychange();
    assert.equal(e.api.isSpeaking(), false, 'reveal never restarts');
    assert.equal(e.utterances.length + e.media.length, 1, 'no second utterance or provider request');
  }
  const e = engine({ native, unlock: false }); e.api.stopSpeech();
  assert.equal(e.cancelled(), 0, 'no owned utterance means no global synthesis cancellation');
}
// Reentrant cancellation callbacks represent newer intent, never orphaned work.
for (const native of [false, true]) {
  for (const action of ['speak', 'speak-then-stop', 'stop']) {
    const e = engine({ native, unlock: false }), errors = [];
    e.api.speak('first', { onEnd() {
      if (action !== 'stop') e.api.speak('reentrant');
      if (action !== 'speak') e.api.stopSpeech();
    } });
    assert.equal(e.api.speak('replacement', { onError: err => errors.push(err.error) }), false);
    assert.deepEqual(errors, ['interrupted']);
    assert.equal(e.utterances.length + e.media.length, action === 'stop' ? 1 : 2, 'outer replacement creates no resources');
    assert.equal(e.api.isSpeaking(), action === 'speak', 'newest intent wins');
    assert.equal(e.timers.size, action === 'speak' ? 1 : 0, 'only owned pending speech has a timer');
    e.api.set('muted', true);
    assert.equal(e.api.isSpeaking(), false);
    assert.equal(e.timers.size, 0, 'no orphan startup timer after mute');
    assert.ok(e.media.every(a => a.paused), 'no orphan fallback playback after mute');
    if (native) assert.equal(e.cancelled(), e.utterances.length, 'every created native session is cancelled');
  }
  for (const setting of ['muted', 'master', 'voice', 'hidden']) {
    const e = engine({ native, unlock: false }), errors = [];
    e.api.speak('first', { onEnd() {
      assert.equal(e.api.speak('reentrant', { onError: err => errors.push(err.error) }), false);
    } });
    if (setting === 'hidden') { e.document.hidden = true; e.listeners.visibilitychange(); }
    else e.api.set(setting, setting === 'muted' ? true : 0);
    assert.deepEqual(errors, [setting === 'hidden' ? 'hidden' : 'muted']);
    assert.equal(e.utterances.length + e.media.length, 1, 'blocked reentry does not create provider or native work');
    assert.equal(e.api.isSpeaking(), false);
    assert.equal(e.timers.size, 0);
    assert.ok(e.media.every(a => a.paused));
    if (native) assert.equal(e.cancelled(), 1);
  }
}
console.log(`PASS: category dry/wet isolation, ${coreCount} executable core recipes, ${literalIds.length} literal calls, active native/fallback controls and visibility ownership`);
