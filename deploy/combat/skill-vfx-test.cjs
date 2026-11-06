// deploy/combat/skill-vfx-test.cjs
// Headless test verifying 3D Skill VFX System and event wiring in main.js
// NO BROWSER / EDGE / CDP.

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('[TEST] Verifying 3D Skill VFX System and Event Wiring in main.js...');

const mainPath = path.join(__dirname, '..', '..', 'main.js');
const main = fs.readFileSync(mainPath, 'utf8');

// 1. Check function definition
assert(main.includes('function triggerSkillVfx(skillId, caster, target)'), 'main.js must define triggerSkillVfx');

// 2. Check coverage of all major skills across classes
const expectedSkillsInVfx = [
  // Sword
  'phuttha_core', 'sritra_core', 'atamat_core', 'chumphon_core',
  // Blade
  'blade_vanish', 'blade_heavy', 'blade_withdraw', 'blade_fury',
  // Muay
  'chaiya', 'muay_chaiya', 'korat', 'muay_korat', 'lopburi', 'muay_lopburi', 'thasao', 'muay_thasao',
  // Seer
  'seer_pot', 'seer_binding', 'seer_poison',
  // Mender
  'mender_core_heal', 'mender_core_circle', 'mender_core_ward', 'mender_core_cleanse',
  // Sentinel
  'shock', 'bulwark', 'riposte', 'protect'
];

for (const skill of expectedSkillsInVfx) {
  assert(main.includes(`case "${skill}":`), `triggerSkillVfx must handle ${skill}`);
}

// 3. Check wiring into network message listeners
assert(main.includes('triggerSkillVfx(result.skillId, caster, target);'), 'sword_skill_used must invoke triggerSkillVfx');
assert(main.includes('triggerSkillVfx(data.skillId, caster, target);'), 'skill handlers must invoke triggerSkillVfx');

console.log('PASS 3D Skill VFX System verified with complete coverage across all classes!');
process.exit(0);
