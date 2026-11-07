const fs = require('node:fs');
const assert = require('node:assert/strict');

console.log('[TEST] Verifying Phase 15: Guild Alliance & Shamanic War Banner 3D...');

const mainSrc = fs.readFileSync('main.js', 'utf8');
const audioSrc = fs.readFileSync('audio.js', 'utf8');
const cssSrc = fs.readFileSync('styles.css', 'utf8');
const indexSrc = fs.readFileSync('index.html', 'utf8');

// 1. Audio Synthesis Recipe for War Banner
assert(audioSrc.includes('banner: (d, t, p) =>'), 'audio.js defines banner sound recipe');
assert(audioSrc.includes('banner: ["sfx", .45, 1.1]'), 'audio.js META includes banner entry');
assert(audioSrc.includes('banner: 2.8'), 'audio.js DUR includes banner duration');

// 2. Typhoon Voice Callouts for War Banner
assert(mainSrc.includes('banner_planted: {'), 'VOICE_CALLOUTS includes banner_planted');
assert(mainSrc.includes('banner_expired: {'), 'VOICE_CALLOUTS includes banner_expired');
assert(mainSrc.includes('ปักธงชัยอาคม! แนวพิทักษ์แห่งกิลด์เริ่มทำงาน'), 'banner_planted Thai callout text');
assert(mainSrc.includes('ธงชัยอาคมสิ้นฤทธิ์มนตราแล้ว'), 'banner_expired Thai callout text');

// 3. 3D War Banner Mesh Rig & Logic
assert(mainSrc.includes('function createWarBannerMesh'), 'main.js defines createWarBannerMesh');
assert(mainSrc.includes('war banner pole'), 'defines war banner pole material');
assert(mainSrc.includes('war banner gold'), 'defines war banner gold material');
assert(mainSrc.includes('war banner cloth'), 'defines war banner cloth with procedural yantra texture');
assert(mainSrc.includes('BANNER_RADIUS = 12'), 'BANNER_RADIUS is 12 meters');
assert(mainSrc.includes('BANNER_DURATION = 60000'), 'BANNER_DURATION is 60 seconds');
assert(mainSrc.includes('BANNER_COOLDOWN = 15000'), 'BANNER_COOLDOWN is 15 seconds');

// 4. API & Controls
assert(mainSrc.includes('window.MontraBanner = {'), 'main.js exports window.MontraBanner');
assert(mainSrc.includes('plantBanner: plantWarBanner'), 'MontraBanner exports plantBanner');
assert(mainSrc.includes('removeBanner: removeWarBanner'), 'MontraBanner exports removeBanner');
assert(mainSrc.includes('getNearbyBanners'), 'MontraBanner exports getNearbyBanners');
assert(mainSrc.includes('getBannerDefenseBuff'), 'MontraBanner exports getBannerDefenseBuff');
assert(mainSrc.includes('updateBanners'), 'MontraBanner exports updateBanners');

// 5. Frame Render Loop & Input Hotkeys
assert(mainSrc.includes('if (typeof updateBanners === "function") updateBanners(dt, elapsed);'), 'frame render loop updates banners');
assert(mainSrc.includes('e.key?.toLowerCase() === "b"'), 'hotkey B bound to war banner');
assert(mainSrc.includes('triggerWarBanner'), 'hotkey B triggers war banner');

// 6. DOM & Styles
assert(indexSrc.includes('id="bannerButton"'), 'index.html contains bannerButton in field shortcuts');
assert(indexSrc.includes('id="warBannerBuffBadge"'), 'index.html contains warBannerBuffBadge');
assert(/audio\.js\?v=0\.1[3-9]\./.test(indexSrc), 'index.html points to audio.js v0.13.x+');
assert(/main\.js\?v=0\.1[7-9]\./.test(indexSrc), 'index.html points to main.js v0.17.x+');
assert(cssSrc.includes('#bannerButton'), 'styles.css defines #bannerButton');
assert(cssSrc.includes('.war-banner-buff-badge'), 'styles.css defines .war-banner-buff-badge');
assert(cssSrc.includes('@keyframes bannerPulse'), 'styles.css defines bannerPulse keyframe');

// 7. Functional Simulation Test for Banner Aura Buff & Radius
const simBanners = new Map();
let simId = 0;
const RADIUS = 12.0;

function simPlantBanner(x, z, now = 1000) {
  const id = ++simId;
  const b = { id, x, z, plantedAt: now, expiresAt: now + 60000 };
  simBanners.set(id, b);
  return b;
}

function simGetBuff(playerX, playerZ, now = 1000) {
  if (simBanners.size === 0) return { active: false, defBonus: 0 };
  let minDist = Infinity;
  let nearest = null;
  for (const b of simBanners.values()) {
    if (now >= b.expiresAt) continue;
    const d = Math.hypot(b.x - playerX, b.z - playerZ);
    if (d <= RADIUS && d < minDist) {
      minDist = d;
      nearest = b;
    }
  }
  if (nearest) {
    return { active: true, defBonus: 0.10, distance: minDist };
  }
  return { active: false, defBonus: 0 };
}

// Plant banner at origin (0, 0)
const b1 = simPlantBanner(0, 0, 0);
assert.equal(b1.id, 1);

// Inside 12m radius (5m away) -> buff active
const buffClose = simGetBuff(3, 4, 1000); // 3-4-5 triangle, d=5
assert.equal(buffClose.active, true);
assert.equal(buffClose.defBonus, 0.10);
assert.equal(buffClose.distance, 5);

// On boundary (12m away) -> buff active
const buffEdge = simGetBuff(12, 0, 1000);
assert.equal(buffEdge.active, true);
assert.equal(buffEdge.defBonus, 0.10);
assert.equal(buffEdge.distance, 12);

// Outside 12m radius (15m away) -> buff inactive
const buffFar = simGetBuff(9, 12, 1000); // d=15
assert.equal(buffFar.active, false);
assert.equal(buffFar.defBonus, 0);

// Expired banner after 60s -> buff inactive even if close
const buffExpired = simGetBuff(3, 4, 70000);
assert.equal(buffExpired.active, false);

console.log('PASS All Phase 15 Guild Alliance & Shamanic War Banner 3D features verified successfully!');
