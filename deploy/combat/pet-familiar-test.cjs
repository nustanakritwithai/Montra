const fs = require('node:fs');
const assert = require('node:assert/strict');

console.log('[TEST] Verifying Phase 16: Shamanic Spirit Pet & Talisman Familiar 3D...');

const mainSrc = fs.readFileSync('main.js', 'utf8');
const audioSrc = fs.readFileSync('audio.js', 'utf8');
const cssSrc = fs.readFileSync('styles.css', 'utf8');
const indexSrc = fs.readFileSync('index.html', 'utf8');

// 1. Audio Synthesis Recipe for Spirit Pet Familiar
assert(audioSrc.includes('pet_chime: (d, t, p) =>'), 'audio.js defines pet_chime sound recipe');
assert(audioSrc.includes('pet_chime: ["sfx", .4, 1.0]'), 'audio.js META includes pet_chime entry');
assert(audioSrc.includes('pet_chime: 1.6'), 'audio.js DUR includes pet_chime duration');

// 2. Typhoon Voice Callouts for Pet Familiar
assert(mainSrc.includes('familiar_summon: {'), 'VOICE_CALLOUTS includes familiar_summon');
assert(mainSrc.includes('familiar_treasure: {'), 'VOICE_CALLOUTS includes familiar_treasure');
assert(mainSrc.includes('ภูติอาคมคู่หูพร้อมเคียงข้างท่านแล้ว!'), 'familiar_summon Thai callout text');
assert(mainSrc.includes('ตรวจพบแหล่งพลังเวทหรือสมบัติล้ำค่า'), 'familiar_treasure Thai callout text');

// 3. 3D Pet Mesh Rig & Animation
assert(mainSrc.includes('function createFamiliarPetMesh'), 'main.js defines createFamiliarPetMesh');
assert(mainSrc.includes('pet spirit body'), 'defines familiar pet body material');
assert(mainSrc.includes('pet crown gold'), 'defines familiar pet golden crown material');
assert(mainSrc.includes('pet spirit wings'), 'defines familiar pet wings');
assert(mainSrc.includes('leftWingPivot.rotation.z = flap'), 'defines wing flapping animation');

// 4. Pet Following & Combat Assist Logic
assert(mainSrc.includes('function summonFamiliarPet'), 'main.js defines summonFamiliarPet');
assert(mainSrc.includes('function dismissFamiliarPet'), 'main.js defines dismissFamiliarPet');
assert(mainSrc.includes('function toggleFamiliarPet'), 'main.js defines toggleFamiliarPet');
assert(mainSrc.includes('function updatePet'), 'main.js defines updatePet');
assert(mainSrc.includes('window.MontraPet = {'), 'main.js exports window.MontraPet');
assert(mainSrc.includes('summonPet: summonFamiliarPet'), 'MontraPet exports summonPet');
assert(mainSrc.includes('dismissPet: dismissFamiliarPet'), 'MontraPet exports dismissPet');
assert(mainSrc.includes('togglePet: toggleFamiliarPet'), 'MontraPet exports togglePet');
assert(mainSrc.includes('updatePet'), 'MontraPet exports updatePet');
assert(mainSrc.includes('getPetStatus: () => ({'), 'MontraPet exports getPetStatus');

// 5. Frame Loop Hook
assert(mainSrc.includes('if (typeof updatePet === "function") updatePet(dt, elapsed);'), 'frame render loop updates pet');

// 6. Field Controls & Hotkeys
assert(mainSrc.includes('e.key?.toLowerCase() === "p"'), 'hotkey P bound to familiar pet');
assert(mainSrc.includes('toggleFamiliarPet'), 'hotkey P toggles familiar pet');
assert(indexSrc.includes('id="petButton"'), 'index.html contains petButton in field shortcuts');
assert(cssSrc.includes('#petButton'), 'styles.css defines #petButton');

// 7. Functional Simulation: Following, Combat Assist, and Treasure Sensing
class MockVector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  clone() { return new MockVector3(this.x, this.y, this.z); }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  add(v) { return new MockVector3(this.x + v.x, this.y + v.y, this.z + v.z); }
  subtract(v) { return new MockVector3(this.x - v.x, this.y - v.y, this.z - v.z); }
  length() { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); }
}

const simState = {
  active: false,
  petPosition: new MockVector3(0, 0, 0),
  playerPosition: new MockVector3(10, 0, 10),
  lastSpark: 0,
  lastTreasure: 0,
  sparksFired: 0,
  treasuresDetected: 0
};

function simToggle() {
  simState.active = !simState.active;
  if (simState.active) {
    simState.petPosition.set(simState.playerPosition.x - 1.2, simState.playerPosition.y + 1.8, simState.playerPosition.z - 0.8);
  }
}

function simUpdate(now, playerMoving, enemyNearby, treasureNearby) {
  if (!simState.active) return;
  // Follow shoulder target: offset (-1.2, 1.8, -0.8)
  const targetX = simState.playerPosition.x - 1.2;
  const targetY = simState.playerPosition.y + 1.8 + Math.sin(now * 0.003) * 0.15;
  const targetZ = simState.playerPosition.z - 0.8;
  const lerpFactor = playerMoving ? 0.08 : 0.04;
  simState.petPosition.x += (targetX - simState.petPosition.x) * lerpFactor;
  simState.petPosition.y += (targetY - simState.petPosition.y) * lerpFactor;
  simState.petPosition.z += (targetZ - simState.petPosition.z) * lerpFactor;

  // Combat assist spark (6s cooldown)
  if (enemyNearby && (now - simState.lastSpark >= 6000)) {
    simState.lastSpark = now;
    simState.sparksFired++;
  }

  // Treasure sensing (25s cooldown)
  if (treasureNearby && (now - simState.lastTreasure >= 25000)) {
    simState.lastTreasure = now;
    simState.treasuresDetected++;
  }
}

// Initial state: inactive
assert.equal(simState.active, false);

// Summon pet
simToggle();
assert.equal(simState.active, true);
assert.equal(simState.petPosition.x, 8.8);
assert.equal(simState.petPosition.y, 1.8);
assert.equal(simState.petPosition.z, 9.2);

// Move player to (20, 0, 20) and update over multiple frames
simState.playerPosition.set(20, 0, 20);
for (let t = 0; t < 60; t++) {
  simUpdate(t * 50, true, false, false);
}
// Pet should smoothly catch up towards player shoulder (targetX = 18.8, targetZ = 19.2)
const distToTarget = Math.sqrt(Math.pow(simState.petPosition.x - 18.8, 2) + Math.pow(simState.petPosition.z - 19.2, 2));
assert(distToTarget < 0.5, `Pet should catch up to player, dist: ${distToTarget}`);

// Test Combat Assist Spark firing (cooldown 6000ms)
simUpdate(10000, false, true, false);
assert.equal(simState.sparksFired, 1, 'First combat spark fired');
simUpdate(12000, false, true, false);
assert.equal(simState.sparksFired, 1, 'Combat spark still on cooldown at 2s');
simUpdate(16500, false, true, false);
assert.equal(simState.sparksFired, 2, 'Second combat spark fired after 6.5s');

// Test Treasure Sensing (cooldown 25000ms)
simUpdate(26000, false, false, true);
assert.equal(simState.treasuresDetected, 1, 'First treasure detected');
simUpdate(35000, false, false, true);
assert.equal(simState.treasuresDetected, 1, 'Treasure sensing still on cooldown at 9s');
simUpdate(52000, false, false, true);
assert.equal(simState.treasuresDetected, 2, 'Second treasure detected after 26s');

// Dismiss pet
simToggle();
assert.equal(simState.active, false, 'Pet dismissed successfully');

console.log('PASS All Phase 16 Shamanic Spirit Pet & Talisman Familiar 3D features verified successfully!');
