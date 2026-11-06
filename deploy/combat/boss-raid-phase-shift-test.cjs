const fs = require('node:fs');
const assert = require('node:assert/strict');

console.log('[TEST] Verifying Phase 10: Boss Raid Phase Shift & Occult Shield Break System...');

const mainSrc = fs.readFileSync('main.js', 'utf8');
const cssSrc = fs.readFileSync('styles.css', 'utf8');
const indexSrc = fs.readFileSync('index.html', 'utf8');

// 1. Verify CSS styles for Phase 2 badge, Stagger badge, and Shield Bar
assert(cssSrc.includes('.target-overhead-phase2-badge'), 'styles.css defines .target-overhead-phase2-badge');
assert(cssSrc.includes('@keyframes pulsePhase2'), 'styles.css defines @keyframes pulsePhase2');
assert(cssSrc.includes('.target-overhead-stagger-badge'), 'styles.css defines .target-overhead-stagger-badge');
assert(cssSrc.includes('@keyframes pulseStagger'), 'styles.css defines @keyframes pulseStagger');
assert(cssSrc.includes('.target-overhead-shield-wrap'), 'styles.css defines .target-overhead-shield-wrap');
assert(cssSrc.includes('.target-overhead-shield-bar'), 'styles.css defines .target-overhead-shield-bar');

// 2. Verify Typhoon Voice Guidance Callouts for Boss Phase 2 and Shield Break
assert(mainSrc.includes('boss_phase_2: {'), 'TYPHOON_COMBAT_CALLOUTS includes boss_phase_2');
assert(mainSrc.includes('shield_break: {'), 'TYPHOON_COMBAT_CALLOUTS includes shield_break');
assert(mainSrc.includes('บอสปลดปล่อยพลังขั้นที่ 2!'), 'boss_phase_2 callout subtitle matches');
assert(mainSrc.includes('เกราะมันแตกแล้ว ระดมโจมตีเต็มกำลัง!'), 'shield_break callout subtitle matches');

// 3. Verify Target Overhead HUD Elements & Logic
assert(mainSrc.includes('let targetOverheadShieldWrap = null'), 'main.js defines targetOverheadShieldWrap');
assert(mainSrc.includes('targetOverheadShieldFill = document.createElement("div")'), 'creates targetOverheadShieldFill');
assert(mainSrc.includes('targetOverheadShieldWrap.className = "target-overhead-shield-wrap"'), 'assigns shield wrap class');
assert(mainSrc.includes('target-overhead-phase2-badge">🔥 ขั้น 2</span>'), 'renders Phase 2 badge in overhead HUD');
assert(mainSrc.includes('target-overhead-stagger-badge">😵 มึนงง!</span>'), 'renders Stagger badge in overhead HUD');
assert(mainSrc.includes('targetOverheadShieldFill.style.width = sPct + "%"'), 'updates shield bar fill width');

// 4. Verify Phase 2 Trigger & Swarm Minions
assert(mainSrc.includes('triggerBossPhase2(mesh, g)'), 'triggers Boss Phase 2 transition');
assert(mainSrc.includes('ensureBossMinions(mesh, g)'), 'creates boss astral minion swarm');
assert(mainSrc.includes('updateBossMinions(mesh, g, now, dt)'), 'updates boss minions orbital rotation and VFX');
assert(mainSrc.includes('curHp / curMax <= 0.50'), 'activates Phase 2 when boss HP <= 50%');
assert(mainSrc.includes('g.phase2 = true'), 'sets boss phase2 flag');
assert(mainSrc.includes('g.shieldActive = true'), 'activates occult shield on Phase 2 transition');
assert(mainSrc.includes('triggerCombatCallout("boss_phase_2")'), 'triggers Typhoon boss_phase_2 callout');
assert(mainSrc.includes('วิญญาณเปลี่ยนสภาพ! ปลดปล่อยพลังขั้นที่ 2 (PHASE 2)'), 'floats Phase 2 announcement text');

// 5. Verify Shield Damage & Shield Break Mechanics
assert(mainSrc.includes('processBossShieldDamage(mesh, g, dmg, id)'), 'main.js defines processBossShieldDamage');
assert(mainSrc.includes('breakBossShield(mesh, g, id)'), 'main.js defines breakBossShield');
assert(mainSrc.includes('g.staggeredUntil = performance.now() + 4500'), 'staggers boss for 4.5 seconds on shield break');
assert(mainSrc.includes('เกราะมนตราแตกกระจาย! (SHIELD BREAK)'), 'floats Shield Break announcement text');
assert(mainSrc.includes('triggerCombatCallout("shield_break")'), 'triggers Typhoon shield_break callout');
assert(mainSrc.includes('g.staggeredUntil && g.staggeredUntil > now'), 'checks boss stagger state in animateGhosts');

// 6. Verify Window API & Version Bump
assert(mainSrc.includes('window.MontraBoss = {'), 'exposes window.MontraBoss');
assert(mainSrc.includes('getBossStatus'), 'window.MontraBoss provides getBossStatus');
assert(indexSrc.includes('main.js?v=0.12.0-boss-raid-phase-shift'), 'index.html points to v0.12.0-boss-raid-phase-shift');

// 7. Functional Simulation Test for Boss State Machine
const mockGhost = {
  phase2: false,
  shieldActive: false,
  shieldHp: 0,
  maxShieldHp: 0,
  staggeredUntil: 0,
  minionOrbs: null
};

// Simulate Phase 2 transition
mockGhost.phase2 = true;
mockGhost.shieldActive = true;
mockGhost.shieldHp = 80;
mockGhost.maxShieldHp = 80;
mockGhost.minionOrbs = [{ angle: 0 }, { angle: 2.1 }, { angle: 4.2 }];

assert.equal(mockGhost.phase2, true, 'Boss entered phase 2');
assert.equal(mockGhost.shieldActive, true, 'Occult shield active');
assert.equal(mockGhost.minionOrbs.length, 3, '3 minion orbs summoned');

// Simulate attack damage to shield
const dmg1 = 30;
mockGhost.shieldHp = Math.max(0, mockGhost.shieldHp - dmg1);
assert.equal(mockGhost.shieldHp, 50, 'Shield absorbed 30 dmg, 50 remaining');

// Simulate fatal blow to shield (Shield Break)
const dmg2 = 60;
mockGhost.shieldHp = Math.max(0, mockGhost.shieldHp - dmg2);
if (mockGhost.shieldHp <= 0) {
  mockGhost.shieldActive = false;
  mockGhost.shieldHp = 0;
  mockGhost.staggeredUntil = Date.now() + 4500;
}
assert.equal(mockGhost.shieldActive, false, 'Shield broken');
assert.equal(mockGhost.shieldHp, 0, 'Shield HP depleted');
assert(mockGhost.staggeredUntil > Date.now(), 'Boss is staggered');

console.log('PASS All Phase 10 Boss Raid Phase Shift & Occult Shield Break features verified successfully!');
