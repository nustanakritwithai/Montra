const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

const root = join(__dirname, '../..');
const read = path => readFileSync(join(root, path), 'utf8');
const modelCode = read('src/client/render/021-character-models.js').split('  // ---- Skinned Thai male body')[0];
const equipCode = read('src/client/render/026-avatar-auras-and-lifecycle.js')
  .split('  function weaponModelFor')[1].split('  const trimGold')[0];
const swordFile = tier => `thai-sword-${String(tier).padStart(2, '0')}.glb`;

function fixture() {
  const fetches = [];
  const instances = [];
  const context = {
    scene: {}, MAX_LIGHTS: 4,
    B: { SceneLoader: {
      IsPluginForExtensionAvailable: () => true,
      LoadAssetContainerAsync(base, file) {
        assert.equal(base, './assets/weapons/');
        return new Promise((resolve, reject) => fetches.push({ file, resolve, reject }));
      },
    } },
    practiceModels: { wp_twins_1: 'thai_dual' },
    setAvatarRitualGear() {}, showWeaponTrim() {}, setMuayPrajiad() {},
    console: { warn() {} },
  };
  const api = runInNewContext(`${modelCode}\nfunction weaponModelFor${equipCode}\n({heldBladeFile, setAvatarWeapon})`, context);
  const hand = kind => {
    const fallback = { name: `held ${kind}`, enabled: true, setEnabled(value) { this.enabled = value; } };
    return {
      fallback, enabled: false, disposed: false,
      setEnabled(value) { this.enabled = value; },
      getChildMeshes() { return [fallback]; },
      isDisposed() { return this.disposed; },
    };
  };
  const avatar = { weaponModels: Object.fromEntries(['thai_left', 'thai_right', 'arcane_sword', 'ritual_dagger']
    .map(kind => [kind, hand(kind)])) };
  const equip = (id, path = 'phutthaisawan') => api.setAvatarWeapon(avatar, id, path);
  const settle = () => new Promise(resolve => setImmediate(resolve));
  const finish = async (request, fail = false) => {
    if (fail) request.reject(new Error('unavailable'));
    else request.resolve({
      materials: [],
      instantiateModelsToScene() {
        const mesh = { isPickable: true };
        const model = {
          file: request.file, mesh, disposed: false, scaling: { setAll() {} }, position: { set() {} },
          getChildMeshes() { return [mesh]; }, dispose() { this.disposed = true; },
        };
        instances.push(model);
        return { rootNodes: [model] };
      },
    });
    await settle();
  };
  return { avatar, fetches, instances, heldBladeFile: api.heldBladeFile, equip, finish, settle };
}

test('each Thai sword profile has separable gameplay and scabbard geometry', () => {
  const { heldBladeFile } = fixture();
  for (let tier = 1; tier <= 8; tier++) {
    const file = heldBladeFile(`wp_twins_${tier}`, 'thai_dual');
    assert.equal(file, swordFile(tier));
    const bytes = readFileSync(join(root, 'assets/weapons', file));
    assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
    assert.equal(bytes.readUInt32LE(4), 2);
    assert.equal(bytes.readUInt32LE(8), bytes.length);
    const doc = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
    const [weapon] = doc.scenes[doc.scene].nodes;
    assert.deepEqual(doc.scenes[doc.scene].nodes, [weapon]);
    assert.deepEqual(doc.nodes[weapon].children.map(i => doc.nodes[i].name),
      ['Blade', 'Handle', 'Handle Wrap', 'Metal Fittings']);
    const display = doc.scenes[1].nodes.map(i => doc.nodes[i].name);
    assert(display.includes('Scabbard'));
  }
  assert.equal(heldBladeFile('wp_twins_9', 'thai_dual'), swordFile(7));
  assert.equal(heldBladeFile('wp_twins_10', 'thai_dual'), swordFile(8));
  assert.equal(heldBladeFile('arcane_sword', 'arcane_sword'), swordFile(1));
  assert.equal(heldBladeFile('shrine_glaive', 'arcane_sword'), 'crescent-blade-lod2.glb');
});

test('a late load never replaces the current sword and both hands share one fetch', async () => {
  const { avatar, fetches, instances, equip, finish, settle } = fixture();
  equip('wp_twins_2');
  equip('wp_twins_3');
  assert.deepEqual(fetches.map(request => request.file), [swordFile(2), swordFile(3)]);
  await finish(fetches[1]);
  await finish(fetches[0]);
  assert.equal(instances.length, 2);
  for (const kind of ['thai_left', 'thai_right']) {
    const hand = avatar.weaponModels[kind];
    assert.equal(hand.enabled, true);
    assert.equal(hand.fallback.enabled, false);
    assert(instances.some(model => model.parent === hand && model.file === swordFile(3) && !model.mesh.isPickable));
  }

  equip('wp_twins_2');
  await settle();
  assert.equal(fetches.length, 2);
  assert(instances.slice(0, 2).every(model => model.disposed));
  assert(instances.slice(2).every(model => model.file === swordFile(2) && !model.disposed));
});

test('failed loads retain the fallback and disposed hands ignore completed loads', async () => {
  const { avatar, fetches, instances, equip, finish } = fixture();
  const hand = avatar.weaponModels.arcane_sword;
  equip('arcane_sword', '');
  await finish(fetches[0], true);
  assert.equal(hand.fallback.enabled, true);
  equip('ritual_dagger', '');
  assert.equal(hand.enabled, false);
  equip('arcane_sword', '');
  assert.equal(fetches.length, 2);
  hand.disposed = true;
  await finish(fetches[1]);
  assert.equal(instances.length, 0);
});
