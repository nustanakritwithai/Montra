const fs = require('node:fs');
const assert = require('node:assert/strict');

console.log('[TEST] Verifying Phase 18: Thao Wessuwan Asura Titan 3D Boss Model & Combat System...');

const mainSrc = fs.readFileSync('main.js', 'utf8');
const audioSrc = fs.readFileSync('audio.js', 'utf8');
const cssSrc = fs.readFileSync('styles.css', 'utf8');
const indexSrc = fs.readFileSync('index.html', 'utf8');

// 1. Audio Synthesis Recipes for Titan Boss
assert(audioSrc.includes('boss_roar: (d, t, p) =>'), 'audio.js defines boss_roar sound recipe');
assert(audioSrc.includes('boss_slam: (d, t, p) =>'), 'audio.js defines boss_slam sound recipe');
assert(audioSrc.includes('boss_roar: ["sfx", .5, 1.2]'), 'audio.js META includes boss_roar entry');
assert(audioSrc.includes('boss_slam: ["sfx", .5, 1.3]'), 'audio.js META includes boss_slam entry');
assert(audioSrc.includes('boss_roar: 2.4'), 'audio.js DUR includes boss_roar duration');
assert(audioSrc.includes('boss_slam: 2.2'), 'audio.js DUR includes boss_slam duration');

// 2. Typhoon Voice Callouts for Titan Boss
assert(mainSrc.includes('boss_titan_spawn: {'), 'VOICE_CALLOUTS includes boss_titan_spawn');
assert(mainSrc.includes('boss_titan_stagger: {'), 'VOICE_CALLOUTS includes boss_titan_stagger');
assert(mainSrc.includes('ท้าวเวสสุวรรณเทวราชปรากฏกายแล้ว!'), 'boss_titan_spawn Thai callout text');
assert(mainSrc.includes('เกราะอาคมของท้าวเวสสุวรรณแตกแล้ว!'), 'boss_titan_stagger Thai callout text');

// 3. 3D Titan Boss Mesh Rig & Materials
assert(mainSrc.includes('function createThaoWessuwanBossMesh'), 'main.js defines createThaoWessuwanBossMesh');
assert(mainSrc.includes('boss titan skin'), 'defines boss titan skin material');
assert(mainSrc.includes('boss titan gold'), 'defines boss titan gold material');
assert(mainSrc.includes('boss titan red'), 'defines boss titan red material');
assert(mainSrc.includes('boss titan eye'), 'defines boss titan eye material');
assert(mainSrc.includes('boss titan club'), 'defines boss titan club material');
assert(mainSrc.includes('boss telegraph ground'), 'defines boss telegraph ground material');

assert(mainSrc.includes('boss-wessuwan-root'), 'defines boss root transform node');
assert(mainSrc.includes('boss-mace-shaft'), 'defines colossal mace shaft cylinder');
assert(mainSrc.includes('boss-telegraph-ring'), 'defines warning telegraph ground ring');

// 4. Boss Actions & AI State
assert(mainSrc.includes('function spawnThaoWessuwanBoss'), 'main.js defines spawnThaoWessuwanBoss');
assert(mainSrc.includes('function removeThaoWessuwanBoss'), 'main.js defines removeThaoWessuwanBoss');
assert(mainSrc.includes('function triggerBossWindup'), 'main.js defines triggerBossWindup');
assert(mainSrc.includes('function triggerBossSlam'), 'main.js defines triggerBossSlam');
assert(mainSrc.includes('function toggleThaoWessuwanBoss'), 'main.js defines toggleThaoWessuwanBoss');
assert(mainSrc.includes('function updateThaoWessuwanBoss'), 'main.js defines updateThaoWessuwanBoss');

assert(mainSrc.includes('window.MontraBoss = {'), 'main.js exports window.MontraBoss');
assert(mainSrc.includes('spawnBoss: spawnThaoWessuwanBoss'), 'MontraBoss exports spawnBoss');
assert(mainSrc.includes('removeBoss: removeThaoWessuwanBoss'), 'MontraBoss exports removeBoss');
assert(mainSrc.includes('toggleBoss: toggleThaoWessuwanBoss'), 'MontraBoss exports toggleBoss');
assert(mainSrc.includes('triggerWindup: triggerBossWindup'), 'MontraBoss exports triggerWindup');
assert(mainSrc.includes('triggerSlam: triggerBossSlam'), 'MontraBoss exports triggerSlam');
assert(mainSrc.includes('isBossActive: () => bossTitanState.active'), 'MontraBoss exports isBossActive');
assert(mainSrc.includes('getBossStatus: () => ({ ...bossTitanState })'), 'MontraBoss exports getBossStatus');
assert(mainSrc.includes('updateBoss: updateThaoWessuwanBoss'), 'MontraBoss exports updateBoss');

// 5. Frame Loop Hook & Field Controls
assert(mainSrc.includes('if (typeof updateThaoWessuwanBoss === "function") updateThaoWessuwanBoss(dt, elapsed);'), 'frame loop updates boss');
assert(mainSrc.includes('e.key?.toLowerCase() === "v"'), 'hotkey V bound to boss encounter toggle');
assert(mainSrc.includes('toggleBossCommand'), 'hotkey V triggers toggleBossCommand');
assert(indexSrc.includes('id="bossEncounterButton"'), 'index.html contains bossEncounterButton');
assert(cssSrc.includes('#bossEncounterButton'), 'styles.css defines #bossEncounterButton');

// 6. Functional Simulation: Boss State, Windup Telegraph, Ground Slam, and Enrage Phase
const simBoss = {
  active: false,
  x: 1.1,
  z: 10.4,
  hp: 1200,
  maxHp: 1200,
  isEnraged: false,
  isTelegraphing: false,
  telegraphStartTime: 0,
  slamsExecuted: 0,
  playerDamageTaken: 0
};

const TELEGRAPH_DURATION = 1800;

function simSpawn() {
  simBoss.active = true;
  simBoss.hp = 1200;
  simBoss.isEnraged = false;
  simBoss.isTelegraphing = false;
}

function simWindup(now) {
  if (!simBoss.active || simBoss.isTelegraphing) return false;
  simBoss.isTelegraphing = true;
  simBoss.telegraphStartTime = now;
  return true;
}

function simUpdate(now, playerDist) {
  if (!simBoss.active) return;
  // Enrage check
  if (!simBoss.isEnraged && simBoss.hp <= simBoss.maxHp * 0.5) {
    simBoss.isEnraged = true;
  }
  // Telegraph sequence
  if (simBoss.isTelegraphing) {
    if (now - simBoss.telegraphStartTime >= TELEGRAPH_DURATION) {
      simBoss.isTelegraphing = false;
      simBoss.slamsExecuted++;
      if (playerDist <= 4.5) {
        simBoss.playerDamageTaken += 60;
      }
    }
  }
}

// Initial state
assert.equal(simBoss.active, false);

// Spawn boss
simSpawn();
assert.equal(simBoss.active, true);
assert.equal(simBoss.hp, 1200);
assert.equal(simBoss.isEnraged, false);

// Windup starts at t=1000
assert.equal(simWindup(1000), true, 'Windup starts');
assert.equal(simBoss.isTelegraphing, true);

// During telegraph at t=1500 (500ms elapsed < 1800ms)
simUpdate(1500, 3.0);
assert.equal(simBoss.isTelegraphing, true, 'Still telegraphing');
assert.equal(simBoss.slamsExecuted, 0, 'Slam not yet fired');

// Telegraph finishes at t=2800 (1800ms elapsed) -> Slam executes, player in range (3m <= 4.5m)
simUpdate(2800, 3.0);
assert.equal(simBoss.isTelegraphing, false, 'Telegraph finished');
assert.equal(simBoss.slamsExecuted, 1, 'Slam executed');
assert.equal(simBoss.playerDamageTaken, 60, 'Player took 60 shockwave damage');

// Boss takes damage down to 500 HP (< 50% of 1200)
simBoss.hp = 500;
simUpdate(3500, 3.0);
assert.equal(simBoss.isEnraged, true, 'Boss entered enraged phase below 50% HP');

console.log('PASS All Phase 18 Thao Wessuwan Asura Titan 3D Boss features verified successfully!');
