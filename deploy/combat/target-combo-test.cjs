const fs = require('node:fs');
const assert = require('node:assert/strict');
const vm = require('node:vm');

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

// 3. Exercise the shipped combo counter across the former Rank milestones.
assert(cssSrc.includes('.combo-streak-hud'));
assert(cssSrc.includes('.combo-streak-hits'));
assert(!cssSrc.includes('.combo-streak-grade'));
let now = 0;
const nodes = [], guidance = [];
function element() {
  return { children: [], append(...children) { this.children.push(...children); } };
}
const context = {
  performance: {now: () => now},
  document: {createElement: element, getElementById: () => ({append: node => nodes.push(node)})},
  triggerVoiceGuidance: step => guidance.push(step),
};
const comboStart = mainSrc.indexOf('  let comboStreak =');
const comboEnd = mainSrc.indexOf('  let targetRingMesh', comboStart);
assert(comboStart >= 0 && comboEnd > comboStart);
vm.runInNewContext(mainSrc.slice(comboStart, comboEnd), context);
for (let hit = 1; hit <= 26; hit++) {
  now += 150;
  context.registerComboHit();
  if (hit < 3) assert.equal(nodes.length, 0);
  else assert.equal(nodes[0].children[0].textContent, String(hit));
}
assert.equal(nodes.length, 1);
assert.deepEqual(nodes[0].children.map(node => node.className), ['combo-streak-hits']);
assert.deepEqual(guidance, ['combo']);
context.updateComboHud(now + 3501);
assert.equal(nodes[0].hidden, true);

// 4. Verify Wiring in Render Loop & Combat Events
assert(mainSrc.includes('updateMonsterLabels(); updateTargetOverheadHud(now); updateComboHud(now);'), 'overhead HUD & combo updated in render loop');
assert(mainSrc.includes('registerComboHit();'), 'registerComboHit called in combat hit handlers');

console.log('PASS All Phase 5 Target Overhead HUD & Combo Streak features verified successfully!');
