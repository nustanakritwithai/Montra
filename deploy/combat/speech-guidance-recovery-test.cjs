const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const guidance = fs.readFileSync('src/client/audio/002-voice-guidance.js', 'utf8');
const settingsCode = fs.readFileSync('src/client/audio/051-sound-settings-and-speech.js', 'utf8');
function fixture(seed = {}, { storageFails = false, missingAudio = false, now = 100000 } = {}) {
  const nodes = [], storage = new Map(Object.entries(seed)), calls = [], timers = new Map();
  let pending, sequence = 0;
  const element = tag => {
    const classes = new Set();
    const node = { tag, hidden: false, children: [], textContent: '', events: {},
      append(...items) { this.children.push(...items); },
      after() {}, setAttribute() {},
      addEventListener(event, listener) { this.events[event] = listener; },
      classList: { remove: (...values) => values.forEach(value => classes.delete(value)), add: value => classes.add(value), contains: value => classes.has(value), toggle: (value, on) => on ? classes.add(value) : classes.delete(value) }
    };
    nodes.push(node); return node;
  };
  const game = element('main');
  const api = { settings: { master: .8, voice: .85 },
    speak(text, options) { api.stopSpeech(); pending = options; calls.push({ text, options }); return true; },
    stopSpeech() { const previous = pending; pending = null; previous?.onEnd?.(); }, play() {} };
  const context = vm.createContext({ window: { MontraAudio: missingAudio ? undefined : api },
    localStorage: {
      getItem(key) { if (storageFails) throw Error('private'); return storage.get(key); },
      setItem(key, value) { if (storageFails) throw Error('private'); storage.set(key, value); },
      removeItem(key) { if (storageFails) throw Error('private'); storage.delete(key); }
    },
    document: { createElement: element, getElementById: () => game, addEventListener() {} },
    performance: { now: () => now },
    setTimeout(fn) { timers.set(++sequence, fn); return sequence; }, clearTimeout(id) { timers.delete(id); }
  });
  vm.runInContext(guidance + '\n' + settingsCode, context);
  const run = code => vm.runInContext(code, context);
  return { run, storage, calls, timers, api, element,
    noPanel: () => { assert.equal(game.children.length, 0, 'guidance never appends an overlay'); assert.equal(nodes.length, 1, 'guidance creates no DOM nodes'); },
    fail(error) { const current = pending; pending = null; current.onError({ error }); },
    start() { pending.onStart(); }, end() { const current = pending; pending = null; current.onEnd(); }
  };
}
for (const error of ['not-allowed', 'muted', 'network', 'synthesis-failed', 'start-timeout']) {
  const f = fixture();
  f.run('triggerVoiceGuidance("move")');
  assert.equal(f.storage.has('montra_vg_played_move'), false, 'pending is not audible');
  f.run('triggerVoiceGuidance("move")');
  assert.equal(f.calls.length, 1, 'repeated gameplay events do not cancel pending speech');
  f.fail(error);
  assert.equal(f.storage.has('montra_vg_played_move'), false, `${error} must not consume the milestone`);
  f.noPanel();
  f.run('triggerVoiceGuidance("move")');
  assert.equal(f.calls.length, 1, 'failure does not create an automatic retry loop');
  f.run('replayVoiceGuidance()');
  assert.equal(f.calls.length, 2, 'explicit retry calls speak synchronously');
  f.start();
  assert.equal(f.storage.get('montra_vg_played_move'), '1', 'real start consumes milestone');
  f.end(); f.noPanel();
}
{
  const f = fixture();
  f.run('triggerVoiceGuidance("move")'); const old = f.calls[0].options;
  f.run('triggerVoiceGuidance("target")');
  assert.equal(f.run('voiceGuidancePlayback.active'), true, 'old synchronous cancel cannot clear newer guidance');
  old.onStart(); old.onError({ error: 'network' }); old.onEnd();
  assert.equal(f.storage.has('montra_vg_played_move'), false, 'stale start cannot consume old milestone');
  assert.equal(f.run('voiceGuidancePlayback.active'), true, 'stale error cannot deactivate newer speech');
  assert.match(f.calls.at(-1).text, /วิญญาณหลงทิศ/);
  f.noPanel();
  f.start(); assert.equal(f.storage.get('montra_vg_played_target'), '1');
}
{
  const f = fixture({ montra_vg_played_move: '1', montra_vg_played_target: '1', montra_guest_token: 'disposable-fixture', montra_character_slot: '2', 'montra-audio-v1': '{"voice":0.4}' });
  f.run('triggerVoiceGuidance("move")'); assert.equal(f.calls.length, 0);
  f.run('replayVoiceGuidance()'); assert.equal(f.calls.length, 1);
  assert.equal(f.storage.has('montra_vg_played_target'), false);
  assert.equal(f.storage.get('montra_guest_token'), 'disposable-fixture');
  assert.equal(f.storage.get('montra_character_slot'), '2');
  assert.equal(f.storage.get('montra-audio-v1'), '{"voice":0.4}');
  f.start(); assert.equal(f.storage.get('montra_vg_played_move'), '1');
}
{
  const f = fixture({ montra_voice_guidance: 'false', montra_vg_played_move: '1' });
  f.run('triggerVoiceGuidance("move");triggerCombatCallout("boss_telegraph");replayVoiceGuidance()');
  assert.equal(f.calls.length, 0); assert.equal(f.storage.get('montra_vg_played_move'), '1');
  assert.match(f.run('soundSettingsHtml()'), /id="replayVoiceGuidanceBtn"[^>]*disabled/);
}
{
  const f = fixture({}, { storageFails: true });
  f.run('triggerVoiceGuidance("move")'); f.start(); f.end();
  f.run('triggerVoiceGuidance("move")'); assert.equal(f.calls.length, 1, 'private-mode session still deduplicates');
  f.run('replayVoiceGuidance()'); assert.equal(f.calls.length, 2);
}
{
  const f = fixture({}, { missingAudio: true }); f.run('triggerVoiceGuidance("move")');
  f.noPanel(); assert.equal(f.storage.has('montra_vg_played_move'), false);
  assert.equal(f.run('voiceGuidancePlayback.active'), false);
}
{
  const f = fixture(); f.run('triggerCombatCallout("boss_telegraph")'); f.fail('not-allowed');
  f.noPanel(); f.run('triggerCombatCallout("boss_telegraph")');
  assert.equal(f.calls.length, 1, 'failed tactical warning retains its cooldown');
  assert.equal(f.storage.size, 0, 'tactical callout never creates new-player milestones');
}
{
  const f = fixture(); const toggle = f.element('input'), replay = f.element('button'); toggle.checked = true;
  // Exercise the exact settings binding without parsing synthetic HTML.
  // Functions cross the VM only here, with ordinary DOM-shaped test elements.
  const bind = f.run('bindSoundSettings');
  bind({ querySelectorAll: () => [], querySelector: id => id === '#toggleVoiceGuidance' ? toggle : id === '#replayVoiceGuidanceBtn' ? replay : null });
  replay.onclick(); assert.equal(f.calls.length, 1);
  toggle.checked = false; toggle.events.change(); assert.equal(replay.disabled, true);
  toggle.checked = true; toggle.events.change(); assert.equal(replay.disabled, false);
}
{
  const f = fixture(); f.run('triggerVoiceGuidance("move")'); f.start(); f.fail('network');
  f.noPanel();
  assert.equal(f.storage.get('montra_vg_played_move'), '1', 'post-start failure retains actual start evidence');
  assert.equal(f.timers.size, 0, 'no overlay dismissal timers');
  f.run('replayVoiceGuidance();replayVoiceGuidance()');
  assert.equal(f.calls.length, 3); f.noPanel();
  f.calls[1].options.onStart(); assert.equal(f.storage.has('montra_vg_played_move'), false);
  f.start(); assert.equal(f.storage.get('montra_vg_played_move'), '1');
}
{
  const f = fixture(); f.run('triggerVoiceGuidance("move")'); const old = f.calls[0].options;
  f.run('setVoiceGuidanceEnabled(false)'); old.onStart(); old.onError({error:'not-allowed'});
  assert.equal(f.storage.has('montra_vg_played_move'), false);
  assert.equal(f.run('voiceGuidancePlayback'), null, 'disabling guidance releases pending playback');
  f.noPanel();
}
{
  const f = fixture(); f.run('triggerVoiceGuidance("move")'); f.fail('network');
  let unrelatedEnds = 0;
  f.api.speak('unrelated NPC speech', { onEnd: () => unrelatedEnds++ });
  f.run('setVoiceGuidanceEnabled(false)');
  assert.equal(unrelatedEnds, 0, 'disable must not stop unrelated speech after a guidance failure');
  f.noPanel();
}
{
  const f = fixture({}, { now: 100 });
  f.run('triggerCombatCallout("mount_summon")');
  assert.equal(f.calls.length, 1, 'first tactical callout is not suppressed during initial page uptime');
  f.run('triggerCombatCallout("mount_summon")');
  assert.equal(f.calls.length, 1, 'subsequent tactical callout still respects its cooldown');
}
for (const [persona, pitch, rate] of [['elder', .82, .88], ['warrior', .95, 1.08], ['spirit', 1.16, .92]]) {
  const f = fixture({ montra_voice_persona: persona });
  f.run('triggerVoiceGuidance("move")');
  assert.equal(f.calls[0].options.persona, persona);
  assert.equal(f.calls[0].options.pitch, pitch); assert.equal(f.calls[0].options.rate, rate);
  f.fail('not-allowed'); f.run('replayVoiceGuidance()');
  assert.equal(f.calls[1].options.persona, persona, 'retry preserves latest-release persona selection');
  f.run('triggerWhisper("เสียงกระซิบทดสอบ", {persona:"spirit",title:"ทดสอบวิญญาณ"})');
  const whisper = f.calls.at(-1);
  assert.equal(whisper.options.persona, 'spirit'); assert.equal(whisper.options.pitch, 1.16);
  f.noPanel();
  f.fail('network'); f.run('triggerWhisper("เสียงกระซิบทดสอบ", {persona:"spirit"})');
  assert.equal(f.calls.at(-1).options.persona, 'spirit');
  f.noPanel();
  f.run('triggerCombatCallout("flight_takeoff")');
  assert.equal(f.calls.at(-1).options.persona, persona);
  f.noPanel();
  assert.equal(f.storage.get('montra_voice_persona'), persona);
  f.run('replayVoiceGuidance()'); assert.equal(f.storage.get('montra_voice_persona'), persona);
}
{
  const f = fixture(); const button = f.element('button'), selector = f.element('select');
  f.run('bindSoundSettings')({ querySelectorAll: () => [], querySelector: id => id === '#testVoiceBtn' ? button : id === '#voicePersonaSelect' ? selector : null });
  button.onclick(); assert.equal(f.calls.at(-1).options.persona, 'elder'); f.end();
  f.run('setVoicePersona("spirit")'); f.end();
  button.onclick(); assert.equal(f.calls.at(-1).options.persona, 'spirit', 'test button reads current selection without reopening settings');
  assert.equal(f.calls.at(-1).options.pitch, 1.16); f.end();
  selector.value = 'warrior'; selector.events.change(); f.end();
  button.onclick(); assert.equal(f.calls.at(-1).options.persona, 'warrior');
  assert.equal(f.calls.at(-1).options.pitch, .95, 'native test preview matches selected guidance pitch');
  assert.equal(f.calls.at(-1).options.rate, 1.08);
}
for (const key of ['boss_titan_spawn', 'boss_titan_stagger']) {
  const f = fixture({ montra_voice_persona: 'warrior' }, { now: 100 });
  f.run(`triggerCombatCallout("${key}")`);
  assert.equal(f.calls.length, 1, `${key} remains available in the latest release`);
  assert.match(f.calls[0].text, /ท้าวเวสสุวรรณ/);
  f.start();
  assert.equal(f.calls.at(-1).options.persona, 'warrior');
  assert.equal(f.calls.at(-1).options.pitch, .95);
  f.noPanel();
  f.end();
  f.run(`triggerCombatCallout("${key}")`);
  assert.equal(f.calls.length, 1, 'boss playback does not reset its original cooldown');
  assert.equal(f.storage.has('montra_vg_played_' + key), false, 'boss callouts are not beginner milestones');
}
console.log('PASS: guidance failure/retry, start-only consumption, no auto-retry storm, stale ownership, no overlay, replay-only voice flags, private mode, settings and tactical recovery');
