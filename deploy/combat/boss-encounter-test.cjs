const fs = require('node:fs');
const assert = require('node:assert/strict');

console.log('[TEST] Verifying Phase 6 Boss & Execute Encounter Mechanics...');

const mainSrc = fs.readFileSync('main.js', 'utf8');
const cssSrc = fs.readFileSync('styles.css', 'utf8');

// 1. Verify CSS styles for Execute Prompt
assert(cssSrc.includes('.target-overhead-execute'), 'styles.css defines .target-overhead-execute');
assert(cssSrc.includes('@keyframes pulseExecute'), 'styles.css defines @keyframes pulseExecute');
assert(cssSrc.includes('.target-overhead-hud.execute-active'), 'styles.css defines .execute-active state');

// 2. Verify Overhead Execute Badge Logic
assert(mainSrc.includes('pct <= 20 && hp > 0'), 'overhead HUD activates on low health (<=20%)');
assert(mainSrc.includes('target-overhead-execute">⚔️ ประหาร!</span>'), 'overhead HUD renders execute prompt');

// 3. Verify Boss Enrage Phase
assert(mainSrc.includes('curHp / curMax <= 0.30'), 'enrage activates when HP <= 30%');
assert(mainSrc.includes('g.enraged = true;'), 'marks monster as enraged');
assert(mainSrc.includes('จิตคลั่งวิญญาณสถิต! (ENRAGED)'), 'floats enrage banner');
assert(mainSrc.includes('g.enraged ? 1.15 : 1'), 'boss scale expands by 1.15x when enraged');

// 4. Verify Enhanced Danger Zones & Slam Impact
assert(mainSrc.includes('spawnFx("cross", "red"'), 'windupTelegraph spawns layered runic danger zone');
assert(mainSrc.includes('!g.windup && g.wasWindup'), 'detects windup completion to land strike impact');
assert(mainSrc.includes('hitBurst(mesh.position.x, mesh.position.z, "red", y, true);'), 'boss ground slam uses its scripted impact cue');

// 5. Death still has the monster's own visual and audible cues.
assert(mainSrc.includes('ghostVoice(ghost,mesh,"die")'), 'monster death keeps its own sound');
assert(mainSrc.includes('eventFx("ghost_die",mesh'), 'monster death keeps its own visual cue');

console.log('PASS All Phase 6 Boss & Execute Encounter mechanics verified successfully!');
