const fs = require('node:fs');
const assert = require('node:assert/strict');

console.log('[TEST] Verifying Typhoon Tactical Combat Callouts System...');

// Inspect the shipped controller together with its unchanged shell callers.
const mainSrc = fs.readFileSync('main.js', 'utf8') + '\n' + fs.readFileSync('src/client-modules/voice-guidance.js', 'utf8');
const cssSrc = fs.readFileSync('styles.css', 'utf8');

// 1. Verify CSS styles for combat alerts
assert(cssSrc.includes('.voice-guidance-hud.combat-alert'), 'styles.css defines .voice-guidance-hud.combat-alert');
assert(cssSrc.includes('@keyframes pulseAvatarDanger'), 'styles.css defines @keyframes pulseAvatarDanger');

// 2. Verify TYPHOON_COMBAT_CALLOUTS dictionary
assert(mainSrc.includes('const TYPHOON_COMBAT_CALLOUTS = {'), 'main.js defines TYPHOON_COMBAT_CALLOUTS');
for (const key of ['boss_telegraph', 'low_hp', 'boss_enrage', 'combo_rank_s', 'execute_finisher']) {
  assert(mainSrc.includes(`${key}: {`), `TYPHOON_COMBAT_CALLOUTS includes ${key}`);
}
assert(mainSrc.includes('ระวัง! ถอยออกจากวงอาคมเร็วเข้า!'), 'telegraph callout text matches');
assert(mainSrc.includes('พลังชีวิตวิกฤต!'), 'low_hp callout text matches');
assert(mainSrc.includes('บอสเข้าสู่สภาวะโทสะคลั่ง!'), 'enrage callout text matches');
assert(mainSrc.includes('คอมโบทะลวงระดับ S!'), 'combo S callout text matches');
assert(mainSrc.includes('ปลดปล่อยดวงวิญญาณสูญสลายสำเร็จ!'), 'execute callout text matches');

// 3. Verify triggerCombatCallout engine and cooldown throttle
assert(mainSrc.includes('function triggerCombatCallout(key)'), 'main.js defines triggerCombatCallout');
assert(mainSrc.includes('lastCombatCalloutTimes'), 'uses lastCombatCalloutTimes for cooldown throttling');
assert(mainSrc.includes('now - last < item.cooldown'), 'guards repeated triggers within cooldown period');

// 4. Verify trigger wiring in gameplay events
assert(mainSrc.includes('triggerCombatCallout("boss_telegraph")'), 'wired to boss/elite windup telegraph');
assert(mainSrc.includes('triggerCombatCallout("boss_enrage")'), 'wired to boss enrage event');
assert(mainSrc.includes('triggerCombatCallout("low_hp")'), 'wired to low HP threshold in HUD update');
assert(mainSrc.includes('triggerCombatCallout("combo_rank_s")'), 'wired to combo rank S milestone');
assert(mainSrc.includes('triggerCombatCallout("execute_finisher")'), 'wired to lethal execute finisher');

console.log('PASS All Typhoon Tactical Combat Callouts verified successfully!');
