// Execute the shipped flight functions and actual avatar shape. No parallel gameplay simulation.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(process.env.MONTRA_FLIGHT_SOURCE_ROOT || '.');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const source = read('src/client/combat/008-weapon-party-boss-feedback.js');
const phase = source.slice(source.indexOf('  // Phase 17:'), source.indexOf('  // Phase 18:'));
const movementSource = read('src/client/input/039-movement-flight-and-climbing.js');
const movement = movementSource.slice(movementSource.indexOf('  function updateFlightButton()'), movementSource.indexOf('  function syncClimbButton()'));
const fieldSource = read('src/client/input/058-field-control-bindings.js');
const fieldCommand = fieldSource.slice(fieldSource.indexOf('  function toggleFlightCommand()'), fieldSource.indexOf('  const meteorBtn='));
const avatarSource = read('src/client/render/020-avatar-materials-and-meshes.js');
const avatarLiteral = avatarSource.slice(avatarSource.indexOf('    const avatar = {'), avatarSource.indexOf('    attachShamanModel(avatar);'));
const stateSource = read('src/client/render/025-horse-and-avatar-animation.js');
const noteState = stateSource.slice(stateSource.indexOf('  function noteAvatarState('), stateSource.indexOf('  const ease ='));
const terrainSource = read('src/client/world/017-region-terrain.js');
const layer = terrainSource.slice(terrainSource.indexOf('  function playerLayer('), terrainSource.indexOf('  function terrainHeight('));
const lifecycleSource = read('src/client/render/026-avatar-auras-and-lifecycle.js');
const lifecycle = lifecycleSource.slice(lifecycleSource.indexOf('  function deleteAvatar('));

// Dependency-free contract double; optional real Babylon runs the SAME assertions.
class Vector {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z) { Object.assign(this, { x, y, z }); }
}
class Node {
  constructor(name) { this.name = name; this.position = new Vector(); this.rotation = new Vector(); this.scaling = new Vector(1, 1, 1); this.children = new Set(); this.enabled = true; this.disposed = false; }
  set parent(value) { if (value) assert.equal(typeof value.isEnabled, 'function', 'Babylon parent must be a node'); this._parent?.children.delete(this); this._parent = value; value?.children.add(this); }
  get parent() { return this._parent; }
  setEnabled(value) { this.enabled = value; }
  isEnabled() { return this.enabled && !this.disposed; }
  isDisposed() { return this.disposed; }
  dispose() { for (const child of [...this.children]) child.dispose(); this.disposed = true; this.parent = null; }
  getChildMeshes() { return [...this.children].flatMap(child => [child, ...child.getChildMeshes()]); }
}
const realBabylon = process.env.MONTRA_TEST_BABYLON_PATH ? require(path.resolve(process.env.MONTRA_TEST_BABYLON_PATH)) : null;
const B = realBabylon || { TransformNode: Node, MeshBuilder: Object.fromEntries(['CreateSphere', 'CreateCylinder', 'CreatePlane'].map(name => [name, id => new Node(id)])) };
const engine = realBabylon ? new B.NullEngine() : null;
const scene = realBabylon ? new B.Scene(engine) : {};
if (realBabylon) scene.activeCamera = new B.FreeCamera('flight-test-camera', new B.Vector3(0, 3, -10), scene);
function avatar(id = 'local') {
  return vm.runInNewContext(avatarLiteral + '\navatar;', { id, parent: new B.TransformNode(id, scene), local: id === 'local', npcOptions: null, halo: null, weaponModels: {}, body: null, arms: [], elbows: [], legs: [], knees: [], familiars: [] });
}
function button() {
  const attributes = {};
  return { attributes, hidden: false, disabled: false, classList: { toggle() {} }, setAttribute: (key, value) => { attributes[key] = value; } };
}
function setup() {
  const hero = avatar();
  const player = { alive: true, flying: false, pathId: 'seer', combatState: 'idle', x: 0, y: 0, z: 0, mapId: 'ritual_village' };
  const sends = [], notices = [], effects = [], buttons = new Map([['fly', button()], ['meteorButton', button()]]);
  const context = {
    B, scene, window: {}, console, performance: { now: () => 20000 }, mode: 'live', localId: 'local',
    avatars: new Map([['local', hero]]), room: { state: { flightAvailable: true, players: new Map([['local', player]]) }, send: (...args) => sends.push(args) },
    worldCombatFeatures: {}, partyState: null, guildState: null, worldDefinitions: { ritual_village: {} }, activeMapId: 'ritual_village', activeFort: { x: 10, z: 10, width: 4, length: 4, height: 4 },
    demoFlying: false, demoFlightTarget: null, demoMonsterHp: 100, DEMO_FLIGHT_HEIGHT: 6,
    pendingClimb: null, demoDest: null, demoDash: null, demoAutoAttack: false, marker: { setEnabled() {} },
    $: id => buttons.get(id), toast: value => notices.push(value), SFX: (...args) => effects.push(args),
    triggerCombatCallout: (...args) => effects.push(args), floatAtPlayer: (...args) => effects.push(args),
    floatText: (...args) => effects.push(args), spawnFx: (...args) => effects.push(args), sparks: (...args) => effects.push(args),
    playAction() {}, terrainHeight: () => 100,
  };
  context.getLocalAvatar = () => context.avatars.get(context.localId);
  context.ownServerCharacter = () => context.mode === 'live' ? context.room?.state?.players.get(context.localId) : null;
  vm.createContext(context);
  vm.runInContext(layer + noteState + movement + phase + fieldCommand + lifecycle, context);
  return { context, hero, player, sends, notices, effects, buttons, flight: context.window.MontraFlight };
}
let cases = 0;
function test(name, run) { run(); cases++; console.log('PASS ' + name); }

test('new flight command sends existing fly request without optimistic height, wings or damage', () => {
  const t = setup(); t.context.toggleFlightCommand();
  assert.equal(t.sends.length, 1); assert.equal(t.sends[0][0], 'fly'); assert.equal(JSON.stringify(t.sends[0][1]), '{}');
  t.flight.updateFlight(1 / 60, 20);
  assert.equal(t.flight.isFlying(), false); assert.equal(t.hero.celestialWings, undefined);
  assert.equal(t.hero.node.position.y, 0); assert.equal(t.hero.targetY, 0); assert.equal(t.effects.length, 0);
});

test('confirmed server flight attaches real avatar.node, preserves server coordinates and reuses wings', () => {
  const t = setup(); Object.assign(t.player, { flying: true, combatState: 'ascending', y: 2 });
  t.hero.y = 2; t.hero.node.position.y = 2; t.context.noteAvatarState(t.hero, t.player);
  t.flight.updateFlight(1 / 60, 20);
  const wings = t.hero.celestialWings;
  assert(wings?.root); assert.equal(wings.root.parent, t.hero.node); assert.equal(wings.root.isEnabled(), true);
  assert.equal(t.hero.node.position.y, 2); assert.equal(t.hero.y, 2); assert.equal(t.flight.getFlightAltitude(), 2);
  t.flight.updateFlight(1 / 60, 21);
  assert.equal(t.hero.celestialWings, wings); assert.equal(t.effects.filter(x => x[0] === 'flight_takeoff').length, 1);
  assert.equal(t.sends.length, 0);
  // Terrain height is deducted by the production playerLayer helper, not applied again to the mesh.
  t.context.worldDefinitions.ritual_village.terrain = {}; t.player.y = 106; t.hero.y = 106; t.hero.node.position.y = 106;
  t.flight.updateFlight(1 / 60, 22); assert.equal(t.flight.getFlightAltitude(), 6); assert.equal(t.hero.node.position.y, 106);
});

test('second toggle requests landing, never meteor, and only confirmation hides wings', () => {
  const t = setup(); t.player.flying = true; t.hero.y = 6; t.hero.node.position.y = 6;
  t.context.noteAvatarState(t.hero, t.player); t.flight.updateFlight(1 / 60, 20); t.flight.toggleFlight();
  assert.equal(t.sends.length, 1); assert.equal(t.sends[0][0], 'fly'); assert.equal(t.flight.isFlying(), true);
  assert.equal(t.hero.node.position.y, 6); assert.equal(t.context.demoMonsterHp, 100);
  t.player.combatState = 'descending'; t.player.y = 1; t.hero.y = 1; t.hero.node.position.y = 1; t.context.noteAvatarState(t.hero, t.player);
  t.flight.updateFlight(1 / 60, 21); assert.equal(t.hero.celestialWings.root.isEnabled(), true); assert.equal(t.hero.node.position.y, 1);
  t.player.flying = false; t.player.combatState = 'idle'; t.hero.y = 0; t.hero.node.position.y = 0; t.context.noteAvatarState(t.hero, t.player);
  t.flight.updateFlight(1 / 60, 22); assert.equal(t.hero.celestialWings.root.isEnabled(), false); assert.equal(t.flight.isFlying(), false);
});

test('server rejection and repeated requests cannot manufacture local flight', () => {
  const t = setup(); t.context.toggleFlightCommand(); t.context.toggleFlightCommand();
  t.flight.updateFlight(1 / 60, 20); assert.equal(t.flight.isFlying(), false); assert.equal(t.hero.celestialWings, undefined);
  assert.equal(t.hero.y, 0); assert.equal(t.hero.node.position.y, 0);
  t.player.combatState = 'ascending'; const before = t.sends.length; t.context.toggleFlightCommand();
  assert.equal(t.sends.length, before); assert.match(t.notices.at(-1), /กำลังเปลี่ยนระดับ/);
});

test('capability, class, death, transition and no-flight zones retain command guards', () => {
  for (const change of [t => { t.context.room.state.flightAvailable = false; }, t => { t.player.pathId = 'muay'; }, t => { t.player.alive = false; }, t => { t.player.combatState = 'descending'; }, t => { t.context.worldDefinitions.ritual_village.region = { noFlight: true }; }, t => { t.context.worldDefinitions.ritual_village.strategic = { kind: 'territory' }; }, t => { t.context.room = null; }]) {
    const t = setup(); change(t); t.context.toggleFlightCommand(); assert.equal(t.sends.length, 0); assert(t.notices.length > 0);
  }
  const t = setup(); t.player.flying = true; t.player.pathId = 'muay'; t.context.worldDefinitions.ritual_village.region = { noFlight: true };
  t.flight.land(); assert.equal(t.sends.length, 1, 'legacy airborne classes can always request safe landing');
});

test('bottom flight control shows confirmed state and disables forbidden/dead/transition requests', () => {
  const t = setup();
  const fly = t.buttons.get('fly');
  t.context.updateFlightButton(); assert.equal(fly.attributes['aria-pressed'], 'false');
  t.player.flying = true; t.context.updateFlightButton(); assert.equal(fly.attributes['aria-label'], 'ลงจอด');
  t.player.combatState = 'descending'; t.context.updateFlightButton(); assert.equal(fly.disabled, true);
  Object.assign(t.player, { flying: false, combatState: 'idle', alive: false });
  t.context.updateFlightButton(); assert.equal(fly.disabled, true);
  t.player.alive = true;
  t.context.worldDefinitions.ritual_village.region = { noFlight: true };
  t.context.updateFlightButton(); assert.equal(fly.disabled, true);
  t.player.pathId = 'muay'; t.context.updateFlightButton(); assert.equal(fly.hidden, true);
  t.context.mode = 'demo'; t.context.updateFlightButton(); assert.equal(fly.hidden, false); assert.equal(fly.disabled, false);
});

test('local death hides wings and remote flight does not allocate extra visuals', () => {
  const t = setup(); t.player.flying = true; t.flight.updateFlight(1 / 60, 20);
  assert.equal(t.hero.celestialWings.root.isEnabled(), true);
  const other = avatar('remote'); other.y = 6; other.node.position.y = 6; t.context.avatars.set(other.id, other);
  t.context.noteAvatarState(other, { alive: true, flying: true, combatState: 'idle' });
  t.player.alive = false; t.flight.updateFlight(1 / 60, 21);
  assert.equal(t.hero.celestialWings.root.isEnabled(), false); assert.equal(other.celestialWings, undefined);
  assert.equal(other.node.position.y, 6); assert.equal(t.sends.length, 0);
});

test('avatar deletion/reentry disposes old wings and mode changes never retain a false flight state', () => {
  const t = setup(); t.player.flying = true; t.context.noteAvatarState(t.hero, t.player); t.flight.updateFlight(1 / 60, 20);
  const oldWings = t.hero.celestialWings; t.context.clearAvatars(); assert.equal(oldWings.root.isDisposed(), true);
  assert.equal(t.flight.isFlying(), false); t.flight.updateFlight(1 / 60, 21);
  const replacement = avatar(); t.context.avatars.set('local', replacement); t.context.noteAvatarState(replacement, t.player);
  t.flight.updateFlight(1 / 60, 22); assert.notEqual(replacement.celestialWings, oldWings); assert.equal(replacement.celestialWings.root.parent, replacement.node);
  t.context.mode = 'demo'; t.context.demoFlying = false; t.flight.updateFlight(1 / 60, 23); assert.equal(replacement.celestialWings.root.isEnabled(), false);
  t.context.mode = 'offline'; t.flight.updateFlight(1 / 60, 24); assert.equal(t.flight.isFlying(), false);
});

test('DEMO uses the existing six-metre flight controller and second toggle is ordinary landing', () => {
  const t = setup(); t.context.mode = 'demo'; t.flight.takeoff(); assert.equal(t.context.demoFlightTarget.targetY, 6);
  t.flight.updateFlight(1 / 60, 20); assert.equal(t.hero.celestialWings.root.parent, t.hero.node); assert.equal(t.hero.node.position.y, 0);
  assert.equal(t.sends.length, 0); t.context.demoFlightTarget = null; t.hero.y = 6; t.hero.targetY = 6; t.flight.toggleFlight();
  assert.equal(t.context.demoFlightTarget.targetY, 0); assert.equal(t.context.demoFlightTarget.landing, true); assert.equal(t.context.demoMonsterHp, 100);
});

test('unsupported meteor fails closed with no simulated damage, VFX or server messages', () => {
  for (const mode of ['live', 'demo']) {
    const t = setup(); t.context.mode = mode; t.player.flying = true; t.context.demoFlying = true;
    assert.equal(t.flight.meteorSlam(), false); assert.equal(t.sends.length, 0); assert.equal(t.effects.length, 0); assert.equal(t.context.demoMonsterHp, 100);
    assert.match(t.notices.at(-1), /ยังไม่เปิดใช้งาน/);
  }
});

test('Meteor is available only while the caster leads a party and belongs to a guild', () => {
  const t = setup();
  t.context.worldCombatFeatures.meteor = true;
  t.player.flying = true;
  const meteor = t.buttons.get('meteorButton');
  const update = () => t.flight.updateFlight(1 / 60, 20);
  for (const [party, guild] of [[null, { id: 'guild' }], [{ leaderId: 'local' }, null], [{ leaderId: 'peer' }, { id: 'guild' }]]) {
    t.context.partyState = party;
    t.context.guildState = guild;
    update();
    assert.equal(meteor.hidden, true);
    assert.equal(t.flight.meteorSlam(), false);
    assert.match(t.notices.at(-1), /หัวหน้าปาร์ตี้ที่สังกัดกิลด์/);
  }
  assert.equal(t.sends.length, 0);
  t.context.partyState.leaderId = 'local';
  update();
  assert.equal(meteor.hidden, false);
  t.context.guildState = null;
  update();
  assert.equal(meteor.hidden, true);
});

test('supported Meteor sends once and displays effects only for the confirmed same-map impact',()=>{
  const t=setup();
  t.context.worldCombatFeatures={meteor:true};
  t.context.partyState={leaderId:'local'};
  t.context.guildState={id:'guild'};
  t.player.flying=true;
  assert.equal(t.flight.meteorSlam(),true);
  assert.deepEqual(t.sends.map(value=>value[0]),['meteor_slam']);
  assert.equal(t.flight.meteorSlam(),false);
  assert.equal(t.effects.length,0);
  t.context.showMeteorImpact({ownerId:'local',mapId:'another',x:0,y:0,z:0});
  assert.equal(t.effects.length,0);
  t.context.showMeteorImpact({ownerId:'local',mapId:'ritual_village',x:0,y:0,z:0});
  assert.equal(t.effects.length,1);
});

if (realBabylon) { scene.render(); engine.dispose(); }
console.log(`PASS ${cases} production flight regression groups (${realBabylon ? `Babylon ${B.Engine.Version} NullEngine` : 'dependency-free scene contract'}).`);
