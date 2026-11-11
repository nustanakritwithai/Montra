const fs = require('node:fs');
const assert = require('node:assert/strict');
const vm = require('node:vm');

console.log('[TEST] Verifying boss combat and low-health HUD...');

const mainSrc = fs.readFileSync('main.js', 'utf8');
const cssSrc = fs.readFileSync('styles.css', 'utf8');

// 1. Low-health targets retain their health display and boss status badges.
const from = mainSrc.indexOf('  function updateTargetOverheadHud(');
const end = mainSrc.indexOf('  let comboStreak', from);
assert(from >= 0 && end > from);
const target = {name: 'Target', hp: 20, maxHp: 100, alive: true};
const ghost = {tall: 2, design: {}, phase2: false};
const mesh = {position: {x: 1, y: 2, z: 3}, metadata: {ghost}, isEnabled: () => true};
const hud = {style: {}}, tag = {}, fill = {style: {}}, delay = {style: {}};
const context = {
  ensureTargetOverheadHud() {},
  targetOverheadHud: hud, targetOverheadTag: tag, targetOverheadFill: fill, targetOverheadDelay: delay,
  targetOverheadShieldWrap: {}, targetOverheadShieldFill: {style: {}},
  selectedForestTarget: 'mob', selectedPkTargetId: null, MONSTER_ID: 'village',
  forestMonsters: new Map([['mob', mesh]]), hudCurrentTarget: () => target,
  monsterLabelPoint: {set() {}}, monsterLabelProjection: {x: 10, y: 10, z: .5},
  canvasRect: () => ({width: 100, height: 100}), engine: {getRenderWidth: () => 100, getRenderHeight: () => 100},
  camera: {viewport: {toGlobal() {}}}, scene: {getTransformMatrix() {}},
  B: {Matrix: {}, Vector3: {ProjectToRef() {}}},
};
vm.runInNewContext(mainSrc.slice(from, end), context);
context.updateTargetOverheadHud(1000);
assert.equal(hud.hidden, false);
assert.equal(fill.style.width, '20%');
assert.equal(tag.textContent, 'Target · 20/100');
ghost.phase2 = true;
context.updateTargetOverheadHud(1100);
assert.match(tag.innerHTML, /^Target · 20\/100<span class="target-overhead-phase2-badge">/);
target.alive = false;
context.updateTargetOverheadHud(1200);
assert.equal(hud.hidden, true);
assert(!cssSrc.includes('.target-overhead-execute'));

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

console.log('PASS boss combat and low-health HUD');
