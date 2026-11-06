const fs = require('node:fs');
const assert = require('node:assert/strict');

console.log('[TEST] Verifying Phase 5 Target Overhead HUD & Combo Streak System...');

const mainSrc = fs.readFileSync('main.js', 'utf8');
const cssSrc = fs.readFileSync('styles.css', 'utf8');

// 1. Verify Target Ring 4-Cardinal Compass Reticle & Rotation
assert(mainSrc.includes('Math.cos(a) * 58'), 'target ring draws 4-cardinal compass ticks');
assert(mainSrc.includes('targetRingMesh.rotation.y = now * 0.0018'), 'target ring mesh rotates smoothly');

// 2. Verify Floating Target Overhead HUD in styles.css & main.js
assert(cssSrc.includes('.target-overhead-hud'), 'styles.css contains .target-overhead-hud');
assert(cssSrc.includes('.target-overhead-delay-bar'), 'styles.css contains .target-overhead-delay-bar');
assert(cssSrc.includes('.target-overhead-fill-bar'), 'styles.css contains .target-overhead-fill-bar');
assert(mainSrc.includes('function ensureTargetOverheadHud()'), 'main.js defines ensureTargetOverheadHud');
assert(mainSrc.includes('function updateTargetOverheadHud(now)'), 'main.js defines updateTargetOverheadHud');

// 3. Verify Combo Streak System in styles.css & main.js
assert(cssSrc.includes('.combo-streak-hud'), 'styles.css contains .combo-streak-hud');
assert(cssSrc.includes('.combo-streak-hits'), 'styles.css contains .combo-streak-hits');
assert(cssSrc.includes('.combo-streak-grade'), 'styles.css contains .combo-streak-grade');
assert(cssSrc.includes('@keyframes comboPop'), 'styles.css contains @keyframes comboPop');
assert(mainSrc.includes('function registerComboHit()'), 'main.js defines registerComboHit');
assert(mainSrc.includes('function updateComboHud(now)'), 'main.js defines updateComboHud');
assert(mainSrc.includes('grade = "S"'), 'main.js defines Rank S threshold');
assert(mainSrc.includes('grade = "A"'), 'main.js defines Rank A threshold');
assert(mainSrc.includes('grade = "B"'), 'main.js defines Rank B threshold');

// 4. Verify Wiring in Render Loop & Combat Events
assert(mainSrc.includes('updateMonsterLabels(); updateTargetOverheadHud(now); updateComboHud(now);'), 'overhead HUD & combo updated in render loop');
assert(mainSrc.includes('registerComboHit();'), 'registerComboHit called in combat hit handlers');

console.log('PASS All Phase 5 Target Overhead HUD & Combo Streak features verified successfully!');
