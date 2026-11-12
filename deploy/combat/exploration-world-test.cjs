const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('[TEST] Verifying waypoint beams, minimap radar and ground effects...');

const mainJsPath = path.join(__dirname, '..', '..', 'main.js');
const mainJs = fs.readFileSync(mainJsPath, 'utf8');

// 1. Verify 3D Waypoint Beam mesh definition
assert(mainJs.includes('B.MeshBuilder.CreateCylinder("waypointBeam"'), 'Should create waypointBeam cylinder mesh');
assert(mainJs.includes('waypointBeam.parent = marker;'), 'waypointBeam must be parented to destination marker');
assert(mainJs.includes('waypointBeam.rotation.x = -Math.PI / 2;'), 'waypointBeam must be rotated upright relative to marker');
assert(mainJs.includes('waypointBeam.position.set(0, 0, 13);'), 'waypointBeam must be centered at half height (13m)');
assert(mainJs.includes('mat("waypoint beam light"'), 'waypoint beam material should be defined');
assert(mainJs.includes('glowMats.add(waypointBeamMat);'), 'waypointBeamMat should be registered in glowMats');

// 2. Verify marker rotation and waypoint beam animation in updateWorldFx
assert(mainJs.includes('marker.rotation.z = (now * 0.003) % (Math.PI * 2);'), 'Destination marker torus should rotate smoothly on ground');
assert(mainJs.includes('waypointBeam.scaling.set(pulse, 1, pulse);'), 'waypointBeam should pulse scale dynamically');

const updateWorldFx = mainJs.slice(mainJs.indexOf('  function updateWorldFx('), mainJs.indexOf('  // Burst of glowing motes:'));
assert(updateWorldFx.includes('function updateWorldFx'), 'World effects frame loop exists');
assert.doesNotMatch(updateWorldFx, /\b(?:spawnFx|sparks)\(/, 'Idle frames and movement do not spawn rain-like ground effects');

// 4. Verify minimap radar ping and waypoint trail in drawMap
assert(mainJs.includes('radarPhase = (performance.now() * 0.0018) % 1;'), 'Should compute smooth radar ripple phase');
assert(mainJs.includes('radarRadius = (large ? 7 : 4) + radarPhase * (large ? 18 : 10);'), 'Radar ring should expand outward from destination');
assert(mainJs.includes('ctx.setLineDash([4, 4]);'), 'Should draw dashed guideline connecting player to destination');

// 5. Verify player view cone on minimap
assert(mainJs.includes('coneAngle = Math.PI * 0.28;'), 'Should define field-of-view visual cone');
assert(mainJs.includes('coneGrad.addColorStop(0, "rgba(255, 218, 121, 0.22)");'), 'View cone should have soft golden glow gradient');

// 6. Verify small minimap compass indicator (N)
assert(mainJs.includes('// Phase 7: Compact compass indicator for small minimap'), 'Small minimap should have compass indicator');
assert(mainJs.includes('mapText(ctx, "N", width - 14, 5, 8, "#ffe2a1", 700);'), 'Small minimap should render North heading label');

console.log('PASS waypoint, minimap and ground effect checks');
