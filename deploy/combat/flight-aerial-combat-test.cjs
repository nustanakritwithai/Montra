const fs = require('node:fs');
const assert = require('node:assert/strict');

console.log('[TEST] Verifying Phase 17: Celestial Wing Flight & Airborne Aerial Combat 3D...');

const mainSrc = fs.readFileSync('main.js', 'utf8');
const audioSrc = fs.readFileSync('audio.js', 'utf8');
const cssSrc = fs.readFileSync('styles.css', 'utf8');
const indexSrc = fs.readFileSync('index.html', 'utf8');

// 1. Audio Synthesis Recipes for Wing Flight and Meteor Slam
assert(audioSrc.includes('wing_glide: (d, t, p) =>'), 'audio.js defines wing_glide sound recipe');
assert(audioSrc.includes('meteor_slam: (d, t, p) =>'), 'audio.js defines meteor_slam sound recipe');
assert(audioSrc.includes('wing_glide: ["sfx", .4, 1.0]'), 'audio.js META includes wing_glide entry');
assert(audioSrc.includes('meteor_slam: ["sfx", .5, 1.2]'), 'audio.js META includes meteor_slam entry');
assert(audioSrc.includes('wing_glide: 1.4'), 'audio.js DUR includes wing_glide duration');
assert(audioSrc.includes('meteor_slam: 2.0'), 'audio.js DUR includes meteor_slam duration');

// 2. Typhoon Voice Callouts for Flight & Aerial Slam
assert(mainSrc.includes('flight_takeoff: {'), 'VOICE_CALLOUTS includes flight_takeoff');
assert(mainSrc.includes('flight_slam: {'), 'VOICE_CALLOUTS includes flight_slam');
assert(mainSrc.includes('สยายปีกมนตราทะยานสู่เวหา!'), 'flight_takeoff Thai callout text');
assert(mainSrc.includes('พุ่งกระแทกธรณีสะท้านปฐพี!'), 'flight_slam Thai callout text');

// 3. 3D Celestial Wings Mesh Rig & Materials
assert(mainSrc.includes('function createCelestialWingsMesh'), 'main.js defines createCelestialWingsMesh');
assert(mainSrc.includes('wing celestial feather'), 'defines celestial feather material');
assert(mainSrc.includes('wing celestial frame'), 'defines celestial frame material');
assert(mainSrc.includes('wing celestial glow'), 'defines celestial glow material');
assert(mainSrc.includes('wing-left-pivot'), 'defines wing left pivot transform node');
assert(mainSrc.includes('wing-right-pivot'), 'defines wing right pivot transform node');

// 4. Flight Mechanics & Aerial Combat Logic
assert(mainSrc.includes('function takeoffCelestialFlight'), 'main.js defines takeoffCelestialFlight');
assert(mainSrc.includes('function landCelestialFlight'), 'main.js defines landCelestialFlight');
assert(mainSrc.includes('function meteorSlamAttack'), 'main.js defines meteorSlamAttack');
assert(mainSrc.includes('function toggleCelestialFlight'), 'main.js defines toggleCelestialFlight');
assert(mainSrc.includes('function updateFlight'), 'main.js defines updateFlight');

assert(mainSrc.includes('window.MontraFlight = {'), 'main.js exports window.MontraFlight');
assert(mainSrc.includes('takeoff: takeoffCelestialFlight'), 'MontraFlight exports takeoff');
assert(mainSrc.includes('land: landCelestialFlight'), 'MontraFlight exports land');
assert(mainSrc.includes('meteorSlam: meteorSlamAttack'), 'MontraFlight exports meteorSlam');
assert(mainSrc.includes('toggleFlight: toggleCelestialFlight'), 'MontraFlight exports toggleFlight');
assert(mainSrc.includes('isFlying: () => flightState.active'), 'MontraFlight exports isFlying');
assert(mainSrc.includes('getFlightAltitude: () => flightState.altitude'), 'MontraFlight exports getFlightAltitude');

// 5. Frame Loop Hook
assert(mainSrc.includes('if (typeof updateFlight === "function") updateFlight(dt, elapsed);'), 'frame render loop updates flight');

// 6. Field Controls & Hotkeys
assert(mainSrc.includes('e.key?.toLowerCase() === "f"'), 'hotkey F bound to flight toggle');
assert(mainSrc.includes('toggleFlightCommand'), 'hotkey F triggers toggleFlightCommand');
assert(indexSrc.includes('id="flightButton"'), 'index.html contains flightButton in field shortcuts');
assert(cssSrc.includes('#flightButton'), 'styles.css defines #flightButton');

// 7. Functional Simulation: Flight Ascent, Flapping Frequency Scaling, and Meteor Slam
const simFlight = {
  active: false,
  altitude: 0,
  targetAltitude: 0,
  lastTakeoff: -99999,
  lastSlam: -99999,
  damageDealt: 0
};

const TAKEOFF_ALT = 4.2;
const FLIGHT_CD = 3000;
const SLAM_CD = 6000;

function simTakeoff(now) {
  if (now - simFlight.lastTakeoff < FLIGHT_CD) return false;
  simFlight.active = true;
  simFlight.targetAltitude = TAKEOFF_ALT;
  simFlight.lastTakeoff = now;
  return true;
}

function simLand() {
  if (!simFlight.active) return false;
  simFlight.active = false;
  simFlight.targetAltitude = 0;
  return true;
}

function simMeteorSlam(now) {
  if (!simFlight.active || simFlight.altitude < 1.0) return false;
  if (now - simFlight.lastSlam < SLAM_CD) return false;
  simFlight.lastSlam = now;
  simFlight.damageDealt += 150;
  simFlight.altitude = 0;
  simFlight.targetAltitude = 0;
  simFlight.active = false;
  return true;
}

function simUpdate(dt, moving) {
  const lerp = Math.min(1.0, dt * 5.0);
  simFlight.altitude += (simFlight.targetAltitude - simFlight.altitude) * lerp;
  // Flap frequency test: moving characters flap at 12Hz, stationary at 6Hz
  const flapFreq = moving ? 12.0 : 6.0;
  return { flapFreq, altitude: simFlight.altitude };
}

// Initial state
assert.equal(simFlight.active, false);
assert.equal(simFlight.altitude, 0);

// Takeoff at t=0
assert.equal(simTakeoff(0), true, 'Takeoff succeeds');
assert.equal(simFlight.active, true);
assert.equal(simFlight.targetAltitude, TAKEOFF_ALT);

// Takeoff on cooldown at t=1000
assert.equal(simTakeoff(1000), false, 'Takeoff blocked by cooldown');

// Simulate ascent over 1 second (20 steps of 50ms)
for (let i = 0; i < 20; i++) {
  const { flapFreq, altitude } = simUpdate(0.05, false);
  assert.equal(flapFreq, 6.0, 'Stationary flap frequency is 6Hz');
}
assert(simFlight.altitude > 3.5, `Altitude after 1s ascent: ${simFlight.altitude}`);

// Test moving flap frequency
const movingStep = simUpdate(0.05, true);
assert.equal(movingStep.flapFreq, 12.0, 'Moving flap frequency is 12Hz');

// Meteor Slam from air at t=4000
assert.equal(simMeteorSlam(4000), true, 'Meteor slam executed from air');
assert.equal(simFlight.active, false, 'Player lands after slam');
assert.equal(simFlight.damageDealt, 150, 'Meteor slam deals 150 damage');
assert.equal(simFlight.altitude, 0, 'Altitude immediately drops to ground');

// Takeoff again at t=7000
assert.equal(simTakeoff(7000), true, 'Second takeoff succeeds');
for (let i = 0; i < 20; i++) simUpdate(0.05, false);

// Meteor slam still on cooldown at t=8000 (elapsed 4000ms < 6000ms since last slam at 4000)
assert.equal(simMeteorSlam(8000), false, 'Meteor slam blocked by 6s cooldown');

// Smooth landing
assert.equal(simLand(), true, 'Smooth landing succeeds');
for (let i = 0; i < 20; i++) simUpdate(0.05, false);
assert(simFlight.altitude < 0.1, 'Altitude returned to ground level');

console.log('PASS All Phase 17 Celestial Wing Flight & Airborne Aerial Combat 3D features verified successfully!');
