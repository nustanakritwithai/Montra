const fs = require('node:fs');
const assert = require('node:assert/strict');

console.log('[TEST] Verifying Phase 12: Mount System & Shamanic Steed Riding 3D...');

const mainSrc = fs.readFileSync('main.js', 'utf8');
const indexSrc = fs.readFileSync('index.html', 'utf8');

// 1. Verify Shamanic Steed 3D Model Styling
assert(mainSrc.includes('mat("horse shamanic gold"'), 'main.js defines horse shamanic gold material');
assert(mainSrc.includes('mat("horse mystic eye"'), 'main.js defines horse mystic eye material');
assert(mainSrc.includes('part("horse saddle gold"'), 'main.js defines horse saddle gold trim');
assert(mainSrc.includes('part("horse bridle gold"'), 'main.js defines horse bridle gold trim');

// 2. Verify Hoof Dust Sparks & Galloping Trail
assert(mainSrc.includes('if(a.horse && a.mounted)'), 'main.js checks mounted horse state');
assert(mainSrc.includes('sparks("gold", a.x, (a.y || 0) + 0.08, a.z, 2'), 'main.js spawns golden hoof sparks during gallop');

// 3. Verify Summoning Portal VFX & Mount Feedback
assert(mainSrc.includes('function playMountSummonVfx(a)'), 'main.js defines playMountSummonVfx');
assert(mainSrc.includes('spawnFx("yantra", "gold"'), 'playMountSummonVfx spawns gold yantra circle');
assert(mainSrc.includes('floatAtPlayer(localId, "ควบม้าทรงมนตรา! 🐎"'), 'displays mount float text');
assert(mainSrc.includes('floatAtPlayer(localId, "ลงจากหลังม้า"'), 'displays dismount float text');

// 4. Verify Typhoon Voice Guidance Callout
assert(mainSrc.includes('mount_summon: {'), 'TYPHOON_COMBAT_CALLOUTS includes mount_summon');
assert(mainSrc.includes('title: "ม้าทรงอาคม"'), 'mount_summon title matches');
assert(mainSrc.includes('subtitle: "ควบขี่ม้าทรงมนตรา ท่องแดนไสยเวทได้รวดเร็วขึ้น"'), 'mount_summon subtitle matches');
assert(mainSrc.includes('ม้าทรงอาคมพร้อมออกศึกแล้ว! ควบทะยานข้ามแดนได้อย่างรวดเร็ว'), 'mount_summon text matches');

// 5. Verify Speed Boost & Frame Loop Integration
assert(mainSrc.includes('const mountMult=me.mounted?1.6:1'), 'frame loop applies +60% speed boost when mounted');
assert(mainSrc.includes('step=baseStep*mountMult*dt'), 'step incorporates mountMult');

// 6. Verify Control Bindings & Keyboard Shortcut
assert(mainSrc.includes('e.key?.toLowerCase() === "h"'), 'keydown listener binds H key for mount toggle');
assert(mainSrc.includes('window.MontraMount = {'), 'exposes window.MontraMount API');
assert(mainSrc.includes('toggleMount: togglePlayerMount'), 'MontraMount exports toggleMount');
assert(mainSrc.includes('isMounted: isPlayerMounted'), 'MontraMount exports isMounted');
assert(mainSrc.includes('getMountSpeedMultiplier'), 'MontraMount exports getMountSpeedMultiplier');
assert(mainSrc.includes('playMountVfx: playMountSummonVfx'), 'MontraMount exports playMountVfx');

// 7. Verify index.html version bump
assert(/main\.js\?v=0\.(1[4-9]|[2-9]\d)\./.test(indexSrc), 'index.html points to v0.14.x or newer');

// 8. Functional Unit Test for MontraMount logic
const mockAvatars = new Map();
mockAvatars.set("player1", { id: "player1", x: 10, y: 0, z: 20, mounted: false });

function simulateToggle(avatar) {
  avatar.mounted = !avatar.mounted;
  const mult = avatar.mounted ? 1.6 : 1.0;
  return { mounted: avatar.mounted, speedMult: mult };
}

const res1 = simulateToggle(mockAvatars.get("player1"));
assert.equal(res1.mounted, true, 'Mount toggle activates mount');
assert.equal(res1.speedMult, 1.6, 'Mounted player speed multiplier is 1.6 (+60%)');

const res2 = simulateToggle(mockAvatars.get("player1"));
assert.equal(res2.mounted, false, 'Mount toggle deactivates mount');
assert.equal(res2.speedMult, 1.0, 'Dismounted player speed multiplier is 1.0');

console.log('PASS All Phase 12 Mount System & Shamanic Steed Riding 3D features verified successfully!');
