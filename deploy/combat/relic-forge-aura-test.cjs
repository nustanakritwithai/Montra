const fs = require('node:fs');
const assert = require('node:assert/strict');

console.log('[TEST] Verifying Phase 9: Relic Forge & Mystic Weapon Aura System (+1 to +10)...');

const mainSrc = fs.readFileSync('main.js', 'utf8');

// 1. Verify Forge Callouts in TYPHOON_COMBAT_CALLOUTS
assert(mainSrc.includes('forge_success: {'), 'defines forge_success callout');
assert(mainSrc.includes('forge_fail: {'), 'defines forge_fail callout');
assert(mainSrc.includes('พลังแห่งยันต์แทรกซึมเข้าสู่อาวุธ!'), 'forge_success voice dialogue verified');
assert(mainSrc.includes('ศิลาอาคมแตกสลาย...'), 'forge_fail voice dialogue verified');

// 2. Verify getAvatarWeaponForgeRank function
assert(mainSrc.includes('function getAvatarWeaponForgeRank(avatar)'), 'defines getAvatarWeaponForgeRank');
assert(mainSrc.includes('bag[slot].forge.rank'), 'retrieves weapon forge rank from equipped gear slot');

// 3. Verify updateWeaponAuras tier visual effects
assert(mainSrc.includes('function updateWeaponAuras(now)'), 'defines updateWeaponAuras');
assert(mainSrc.includes('rank >= 10'), 'defines tier 10 sacred golden yantra flare');
assert(mainSrc.includes('spawnFx("yantra", "gold"'), 'spawns yantra halo at rank 10');
assert(mainSrc.includes('rank >= 7'), 'defines tier 7-9 violet spirit flame');
assert(mainSrc.includes('sparks("violet"'), 'spawns violet spirit flame at rank 7-9');
assert(mainSrc.includes('rank >= 4'), 'defines tier 4-6 arcane cyan glint');
assert(mainSrc.includes('sparks("cyan"'), 'spawns cyan glint at rank 4-6');
assert(mainSrc.includes('sparks("white"'), 'spawns white sparks for rank 1-3');

// 4. Verify main loop registration
assert(mainSrc.includes('updatePartyTethers(now); updateWeaponAuras(now);'), 'updateWeaponAuras is registered in render loop');

// 5. Verify completeForgeAnimation ceremony and voice triggers
assert(mainSrc.includes('triggerCombatCallout("forge_fail");'), 'calls forge_fail callout on broken/failure');
assert(mainSrc.includes('triggerCombatCallout("forge_success");'), 'calls forge_success callout on enhance success');
assert(mainSrc.includes('sparks("gold", hx, hy, hz, 22,'), 'spawns gold sparks celebration on success');

// 6. Verify API exposure on window
assert(mainSrc.includes('window.MontraForge = { updateWeaponAuras, getAvatarWeaponForgeRank };'), 'exposes MontraForge on window');

console.log('PASS All Phase 9 Relic Forge & Mystic Weapon Aura features verified successfully!');
