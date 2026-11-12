const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const main = fs.readFileSync('main.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
for (const level of [1, 2]) {
  const file = `buffalo-lod${level}-animated.glb`;
  const bytes = fs.readFileSync('assets/mounts/' + file);
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const asset = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  assert.ok(asset.skins[0].joints.length > 0);
  for (const name of ['rider_seat', 'rein_grip_left', 'rein_grip_right'])
    assert.ok(asset.nodes.some(node => node.name === name), name);
  for (const name of ['horn_left', 'horn_right', 'saddle_seat'])
    assert.ok(asset.meshes.some(mesh => mesh.name === name), name);
  for (const name of ['Idle', 'Walk', 'Run', 'TurnLeft', 'TurnRight', 'Mount'])
    assert.ok(asset.animations.some(animation => animation.name === name), name);
  assert.ok(main.includes(file));
}
assert.match(html, /id="mountButton"[^>]*>.*เรียกควาย/);
assert.match(html, /id="menuMountLabel">เรียกควาย/);
assert.match(fs.readFileSync('styles.css', 'utf8'), /assets\/ui\/buffalo-mount\.webp/);
assert.ok(fs.statSync('assets/ui/buffalo-mount.webp').size > 0);
assert.match(main, /mount_summon: \{\s*title: "ควายอาคม"/);
assert.match(main, /e\.key\?\.toLowerCase\(\) === "h"/);
assert.match(main, /const mountMult=me\.mounted\?1\.6:1/);
assert.match(main, /seatBuffaloRider\(a\)/);

const avatar = { id: 'local', mounted: false };
const player = { mounted: false, alive: true };
const sent = [], effects = [];
const source = main.slice(main.indexOf('  function isPlayerMounted('), main.indexOf('  window.MontraWar ='));
const mountState = main.slice(main.indexOf('  function setAvatarMounted('), main.indexOf('  function updateBuffalo('));
const syncState = main.slice(main.indexOf('  function noteAvatarState('), main.indexOf('  const ease = x => x <= 0'));
const context = vm.createContext({
  mode: 'live', localId: avatar.id,
  room: { state: { mountAvailable: true, players: new Map([[avatar.id, player]]) }, send: (...args) => sent.push(args) },
  $: () => ({ dataset: {}, disabled: false }),
  getLocalAvatar: () => avatar, syncMountButton() {},
  createBuffalo: a => { a.buffalo = {}; }, disposeBuffalo: a => { a.buffalo = null; },
  playMountSummonVfx: a => effects.push(a.id), triggerCombatCallout() {}, floatAtPlayer() {}, SFX() {},
});
vm.runInContext(source + mountState + syncState, context);
assert.equal(context.togglePlayerMount(), true);
assert.deepEqual(JSON.parse(JSON.stringify(sent)), [['toggle_mount', {}]]);
assert.equal(avatar.mounted, false, 'a request alone never renders a mount');
player.mounted = true;
context.noteAvatarState(avatar, player);
const mount = avatar.buffalo;
assert.ok(mount);
assert.equal(context.getMountSpeedMultiplier(), 1.6);
context.noteAvatarState(avatar, player);
assert.equal(avatar.buffalo, mount, 'ordinary state updates reuse the mount');
assert.deepEqual(effects, ['local']);
assert.equal(context.togglePlayerMount(), true);
assert.equal(avatar.buffalo, mount, 'dismount waits for the server');
player.mounted = false;
context.noteAvatarState(avatar, player);
assert.equal(avatar.buffalo, null);
assert.equal(context.getMountSpeedMultiplier(), 1);
player.mounted = true;
context.noteAvatarState(avatar, player);
context.noteAvatarState(avatar, { ...player, alive: false });
assert.equal(avatar.mounted, false);
assert.equal(avatar.buffalo, null);

console.log('PASS buffalo GLB assets, field and menu controls, confirmed mount/dismount, death cleanup');
