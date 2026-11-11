const fs = require('node:fs');
const assert = require('node:assert/strict');

console.log('[TEST] Verifying Typhoon Voice Guidance System for New Players...');

const mainSrc = fs.readFileSync('main.js', 'utf8');
const cssSrc = fs.readFileSync('styles.css', 'utf8');

// 1. Guidance no longer creates or styles a floating information panel.
assert(!mainSrc.includes('function ensureVoiceGuidanceHud('), 'no guidance overlay factory');
assert(!mainSrc.includes('TYPHOON AI'), 'no Typhoon information badge');
assert(!cssSrc.includes('.voice-guidance-'), 'no obsolete overlay styles');

// 2. Verify Typhoon Voice Guidance 7 Milestones
assert(mainSrc.includes('const TYPHOON_VOICE_GUIDANCE = {'), 'defines TYPHOON_VOICE_GUIDANCE table');
for (const key of ['move', 'target', 'combo', 'execute', 'levelup', 'gear', 'forest']) {
  assert(mainSrc.includes(`${key}: {`), `TYPHOON_VOICE_GUIDANCE includes ${key} milestone`);
}
assert(mainSrc.includes('ยินดีต้อนรับสู่แดนมนตรา'), 'move milestone contains welcome lore');
assert(mainSrc.includes('วิชากำหนดจิตเล็งเป้า'), 'target milestone contains lock-on title');
assert(mainSrc.includes('ตราราหูประหาร'), 'execute milestone contains finisher lore');
assert(mainSrc.includes('เขตแดนป่าต้องห้าม'), 'forest milestone contains danger warning');

// 3. Verify Voice Guidance Engine & Persistence
assert(mainSrc.includes('function isVoiceGuidanceEnabled()'), 'defines isVoiceGuidanceEnabled');
assert(mainSrc.includes('function setVoiceGuidanceEnabled(enabled)'), 'defines setVoiceGuidanceEnabled');
assert(mainSrc.includes('function triggerVoiceGuidance(stepKey)'), 'defines triggerVoiceGuidance');
assert(mainSrc.includes('montra_vg_played_'), 'uses localStorage to guard against repeated plays');

// 4. Verify Settings UI Integration
assert(mainSrc.includes('id="toggleVoiceGuidance"'), 'settings includes toggleVoiceGuidance checkbox');
assert(mainSrc.includes('setVoiceGuidanceEnabled(vGuideToggle.checked)'), 'binds toggleVoiceGuidance to state');

// 5. Verify Gameplay Triggers Wiring
assert(mainSrc.includes('triggerVoiceGuidance("move");'), 'triggers move on first pointMove');
assert(mainSrc.includes('triggerVoiceGuidance("target");'), 'triggers target on attack requests');
assert(mainSrc.includes('triggerVoiceGuidance("combo");'), 'triggers combo on combo milestone');
assert(mainSrc.includes('triggerVoiceGuidance("execute");'), 'triggers execute on execute threshold');
assert(mainSrc.includes('triggerVoiceGuidance("levelup");'), 'triggers levelup on level increase');
assert(mainSrc.includes('triggerVoiceGuidance("gear");'), 'triggers gear on opening bag');
assert(mainSrc.includes('triggerVoiceGuidance("forest");'), 'triggers forest on warp portal');

console.log('PASS All Typhoon Voice Guidance features verified successfully!');
