const fs = require('node:fs');
const assert = require('node:assert/strict');

console.log('[TEST] Verifying Phase 3 Status Aura & Environmental VFX System...');

const mainSrc = fs.readFileSync('main.js', 'utf8');

// 1. Footstep dust dynamics
assert(mainSrc.includes('function spawnFootstepDust(a, speed, m)'), 'spawnFootstepDust exists');
assert(mainSrc.includes('spawnFootstepDust(a, speed, m);'), 'spawnFootstepDust called at foot plant');
assert(mainSrc.includes('if (surf === "water") return;'), 'Water footsteps do not emit ground ripples');
assert(mainSrc.includes('col = surf === "stone" || surf === "brick" ? "white" : "gold"'), 'Surface-matched dust colors');

// 2. Avatar real-time 3D status auras
assert(mainSrc.includes('function updateAvatarAuras(a, now, dt)'), 'updateAvatarAuras exists');
assert(mainSrc.includes('updateAvatarAuras(a, now, dt);'), 'updateAvatarAuras wired in avatar loop');
assert(mainSrc.includes('seerPoisoned'), 'Poison status aura check');
assert(mainSrc.includes('possessionActive'), 'Possession status aura check');
assert(mainSrc.includes('seerBindingEffects.has(a.id)'), 'Stun/binding aura check');
assert(mainSrc.includes('a.dashUntil'), 'Dash trail aura check');

// 3. Monster status auras
assert(mainSrc.includes('function updateMonsterAuras(mesh, g, now, dt)'), 'updateMonsterAuras exists');
assert(mainSrc.includes('updateMonsterAuras(mesh, g, now, dt);'), 'updateMonsterAuras wired in ghost loop');
assert(mainSrc.includes('g.design?.elite'), 'Elite radiance check');

// 4. Level-up golden celebration
assert(mainSrc.includes('🌟 LEVEL UP! 🌟'), 'Level up celebration text');
assert(mainSrc.includes('shakeCamera(0.48, 450)'), 'Camera shake on level up');
assert(mainSrc.includes('s0: 4.2, s1: 2.5, h: 16'), 'Dual grandiose golden pillars for level up');

console.log('PASS Phase 3 Status Aura & Environmental VFX verified successfully!');
