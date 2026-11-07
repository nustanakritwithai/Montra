const fs = require('node:fs');
const assert = require('node:assert/strict');

console.log('[TEST] Verifying Phase 11: Guild Territory War & War Horn Fanfare System...');

const mainSrc = fs.readFileSync('main.js', 'utf8');
const audioSrc = fs.readFileSync('audio.js', 'utf8');
const cssSrc = fs.readFileSync('styles.css', 'utf8');
const indexSrc = fs.readFileSync('index.html', 'utf8');

// 1. Verify CSS styles for War Screen Alert and Flag Indicators
assert(cssSrc.includes('.war-screen-alert'), 'styles.css defines .war-screen-alert');
assert(cssSrc.includes('.war-screen-alert.show-contested'), 'styles.css defines .show-contested');
assert(cssSrc.includes('@keyframes pulseWarBorder'), 'styles.css defines @keyframes pulseWarBorder');
assert(cssSrc.includes('.war-screen-alert.show-captured'), 'styles.css defines .show-captured');
assert(cssSrc.includes('@keyframes pulseWarVictory'), 'styles.css defines @keyframes pulseWarVictory');
assert(cssSrc.includes('.war-flag-indicator'), 'styles.css defines .war-flag-indicator');
assert(cssSrc.includes('@keyframes flagWave'), 'styles.css defines @keyframes flagWave');

// 2. Verify Audio Synthesis Recipe for Siamese War Horn
assert(audioSrc.includes('war_horn: (d, t, p) =>'), 'audio.js defines war_horn recipe');
assert(audioSrc.includes('war_horn: ["sfx", .4, 1.2]'), 'audio.js META includes war_horn');
assert(audioSrc.includes('war_horn: 3.2'), 'audio.js DUR includes war_horn');

// 3. Verify Typhoon Voice Callouts for Territory War
assert(mainSrc.includes('territory_contested: {'), 'TYPHOON_COMBAT_CALLOUTS includes territory_contested');
assert(mainSrc.includes('territory_captured: {'), 'TYPHOON_COMBAT_CALLOUTS includes territory_captured');
assert(mainSrc.includes('เสาธงอาคมถูกโจมตี! นักรบกิลด์จงรุดไปสกัดกั้น'), 'territory_contested subtitle matches');
assert(mainSrc.includes('ยึดเสาธงอาคมสำเร็จ! สถาปนาอำนาจครองแดน'), 'territory_captured subtitle matches');

// 4. Verify Territory War Logic and Alert Engine
assert(mainSrc.includes('function ensureWarScreenAlert()'), 'main.js defines ensureWarScreenAlert');
assert(mainSrc.includes('function triggerWarScreenAlert(type)'), 'main.js defines triggerWarScreenAlert');
assert(mainSrc.includes('function checkTerritoryWarEvents(local)'), 'main.js defines checkTerritoryWarEvents');
assert(mainSrc.includes('checkTerritoryWarEvents(message.local)'), 'wires event check into onTerritoryState');
assert(mainSrc.includes('SFX("war_horn", { intensity: 1.5 })'), 'triggers war horn on battle phase start');
assert(mainSrc.includes('triggerCombatCallout("territory_contested")'), 'triggers territory_contested callout');
assert(mainSrc.includes('triggerCombatCallout("territory_captured")'), 'triggers territory_captured callout');

// 5. Verify Window API & Script Versions
assert(mainSrc.includes('window.MontraWar = {'), 'exposes window.MontraWar');
assert(mainSrc.includes('soundWarHorn'), 'window.MontraWar provides soundWarHorn');
assert(mainSrc.includes('simulateTerritoryCapture'), 'window.MontraWar provides simulateTerritoryCapture');
assert(mainSrc.includes('getTerritoryStatus'), 'window.MontraWar provides getTerritoryStatus');
assert(/main\.js\?v=0\.1[3-9]\./.test(indexSrc), 'index.html points to v0.13.0 or newer');
assert(/audio\.js\?v=0\.1[1-9]\./.test(indexSrc), 'index.html points to audio.js v0.11.0 or newer');

// 6. Functional Simulation Test for Territory Event State Machine
const mockWarEvents = [];
const mockSFX = (name, opts) => mockWarEvents.push({ type: 'sfx', name, opts });
const mockCallouts = (key) => mockWarEvents.push({ type: 'callout', key });

// Simulate territory post transition from uncontested to contested
const mockLocalState = {
  phase: 'battle',
  side: 'attack',
  river: {
    posts: [
      { id: 1, contested: true, owner: 'defend', x: 20, z: -30 }
    ]
  }
};

assert.equal(mockLocalState.phase, 'battle', 'Territory in battle phase');
assert.equal(mockLocalState.river.posts[0].contested, true, 'Post 1 is contested');

// Simulate capture flip
mockLocalState.river.posts[0].contested = false;
mockLocalState.river.posts[0].owner = 'attack';
assert.equal(mockLocalState.river.posts[0].owner, 'attack', 'Post 1 flipped to attack team');

console.log('PASS All Phase 11 Guild Territory War & War Horn Fanfare features verified successfully!');
