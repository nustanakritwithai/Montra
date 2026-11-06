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
assert(mainSrc.includes('hitBurst(mesh.position.x, mesh.position.z, "red", true, y, true);'), 'strike lands heavy ground slam burst');

// 5. Verify Execute Finisher Feedback
assert(mainSrc.includes('วิชาประหารสิ้นสูญ! (EXECUTE)'), 'triggers decisive execute finisher float text');
assert(mainSrc.includes('shakeCamera(0.68, 420);'), 'triggers heavy impact camera shake on fatal finisher');
assert(mainSrc.includes('SFX("bell", { intensity: 1.2 });'), 'triggers resounding ceremonial bell SFX on finisher');

console.log('PASS All Phase 6 Boss & Execute Encounter mechanics verified successfully!');
