import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { assembleClient, checkClient, clientRoot, prepareClient, writeClient } from './build-client.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

// Intentional early hunt guidance, quest navigation, gate, market, flight, class-skill, audio, VFX and cosmetic-safeguard changes. Keep snapshot
// evidence unchanged; every other fragment must still match that evidence.
const reviewedReleaseFragments = new Map([
{
  "path": "render/037-ghost-animation.js",
  "bytes": 4716,
  "sha256": "f4e1f68398fcb35c5d768b225c251a78a63c0ded7deab7a5e172959ec5ba3344"
},
{
  "path": "ui/003-toast-and-mode.js",
  "bytes": 1140,
  "sha256": "17376d8893e60624095e82deec4a134e298081232045a7154165e7ccccdaf7d1"
},
{
  "path": "core/001-storage-and-dom.js",
  "bytes": 3074,
  "sha256": "989b3139af3ac5d9f4fe68cc2786470fdfe374a0853723e071568b2fdd444f42"
},
{
  "path": "combat/022-action-timelines.js",
  "bytes": 2517,
  "sha256": "5ff89f4b819d1dc9b9bb3a600079e688fd9062b3d6cb932fee3774fca4c7963d"
},
{
  "path": "ui/057-npcs-and-objectives.js",
  "bytes": 38771,
  "sha256": "d5cfc584ef8169b68e867a2dfb8c3f71d24049545d9ebc5beb506a69229b71be"
},
{
  "path": "input/045-pointer-touch-and-dash.js",
  "bytes": 14718,
  "sha256": "eb8f8dfd06a88f629880d46c1bdd9ff4d7258e07101f5183b72fb6671a236f68"
},
{
  "path": "render/007-world-effects.js",
  "bytes": 12559,
  "sha256": "d9eb4a92bec1bb3470a42f9d3a277d761e1973bdf1ce47dd48c983b4fe6db7ab"
},
{
  "path": "render/009-effects-and-target-hud.js",
  "bytes": 21009,
  "sha256": "0322ecbd8698c9e4c7734a205b78dc49e942a3a0fd3720a08365e8bc1722e807"
},
{
  "path": "combat/005-floating-feedback.js",
  "bytes": 4484,
  "sha256": "e20bdd0428d9a967732d3c35884e40680e2e121f66e592ca301539dbc9f01684"
},
{
  "path": "render/004-scene-camera-lights.js",
  "bytes": 14662,
  "sha256": "4eb0238cf50b7dd335eee8ca631d0c0e282a129e4eea5869aec29f2583372c65"
},
{
  "path": "world/029-fishing-and-resources.js",
  "bytes": 14723,
  "sha256": "551d6d558c8caa59c26ebf608f070a8b3b140616c79282fc623c24908c55006f"
},
{
  "path": "world/019-state-and-portals.js",
  "bytes": 22959,
  "sha256": "ae7a427a8f8d2250552f5ae3539cd0ec0354c0c0f481e28038fb29d1c8c81301"
},
{
  "path": "world/018-region-dressing.js",
  "bytes": 29020,
  "sha256": "d7c0ca740501cc335809d9c7a6ed7c39d5f0527ac843207042e7fcc9f89af116"
},
{
  "path": "world/017-region-terrain.js",
  "bytes": 67752,
  "sha256": "4c9308fe5c245a56c09208eeb55dee4305100420c81690164d8787eaf48f6a56"
},
{
  "path": "world/016-forest-and-temple.js",
  "bytes": 19872,
  "sha256": "a81a9b4cbc16810d551abdcf9f707fcad4778315944aacab0707fc0fdb8c4d38"
},
{
  "path": "world/015-forest-gates-and-services.js",
  "bytes": 35119,
  "sha256": "d67c697a6c0cce8995c0ba820bcfcf27323b431c56efac396f7485927a193c98"
},
{
  "path": "world/014-ritual-village.js",
  "bytes": 28446,
  "sha256": "861ceef6b5d9e82c2f08dff6994ce9753968aad66dc169237e2087e62fc6c020"
},
{
  "path": "world/013-ground-and-fortification.js",
  "bytes": 4123,
  "sha256": "4f2951095b7f9967605459edfa92c9bb7768cfc13668a008c22beeaaa8907cde"
},
{
  "path": "ui/041-character-hud-and-journey.js",
  "bytes": 41532,
  "sha256": "1847579efaf08bb114c0572a1b518e37426f59e151fafe6a79cdfd63800f0518"
},
{
  "path": "render/026-avatar-auras-and-lifecycle.js",
  "bytes": 19382,
  "sha256": "2688cd6d37e94e967ddd6337393f69264717e33cb6ee254d184fc62bc793001f"
},
{
  "path": "render/025-horse-and-avatar-animation.js",
  "bytes": 52255,
  "sha256": "0cadc72d8bf87f910f715cd4c3ccdad35c63751e659815c13f803406bf1f6e2f"
},
{
  "path": "render/021-character-models.js",
  "bytes": 81720,
  "sha256": "fcae8c96fe2004f2765f1223a2aeb98f09e3a02c5221dd2789d54bee864056ad"
},
{
  "path": "render/020-avatar-materials-and-meshes.js",
  "bytes": 26677,
  "sha256": "5a6e483651235dd71c6a825e5c06b82bd6626ee86ce5bf373a710cbc96f793ef"
},
{
  "path": "render/006-materials-atmosphere.js",
  "bytes": 83358,
  "sha256": "bb5f7ac6d06d4660ba19b6ba409c47e46634ee2bc375384707f1e86fea80c68f"
},
{
  "path": "network/044-state-sync-and-connection.js",
  "bytes": 165695,
  "sha256": "ce269ff24be900cbc9a56cfe0981ac955aa2edea4eeeba2b2ec963bb518e2164"
},
{
  "path": "core/059-frame-loop-and-startup.js",
  "bytes": 30562,
  "sha256": "81048f83e4b38bd4c65cd05721cfb0515cf2aab651ee39f89b9d6a03611450c6"
},
  {
    "path": "ui/053-gear-training-and-crafting.js",
    "bytes": 45429,
    "sha256": "c3dc11522e51a1372e9988c11f0be0a2b9e83a111899c95ab19c467ae177b6f9"
  },
  {
    "path": "ui/054-forge-feedback-and-pages.js", "bytes": 71891, "sha256": "64e1a6e8dabe88f83631b81ede20ba2b337a57a5b7f47c5230d79ce4f5d85325"
  },
  {
    "path": "ui/052-help-and-inventory.js", "bytes": 41496, "sha256": "a92bbc3a3e55c928a8ad3e163af07778ec9694ed356713daedbe6a593eb6779f"
  },
  {
    "path": "ui/030-item-art-and-comparison.js",
    "bytes": 19285,
    "sha256": "dc93636bfe1cf523b8c53bfcecd60df8eb4aee066d4692173e3ca8ca925050ca"
  },
  {
    "path": "ui/046-drawers-and-chat.js",
    "bytes": 10471,
    "sha256": "ee7289e4979c49c64cde15a767565c6322cdd7f9261caa34d590e2cf1880da29"
  },
  {
    "path": "ui/048-class-books-and-hotbars.js",
    "bytes": 72694,
    "sha256": "b87b3eb7e5188fec48756d7fb661f5efcf513d1001337f9d467b205e3061bb5b"
  },
  {
    "path": "ui/049-skill-graph-and-details.js",
    "bytes": 63308,
    "sha256": "739dbdaca175f1fd9cb47bda561e4b7841d0d4d02f8872ef33e0a0ab871cfbb2"
  },
  {
    "path": "input/058-field-control-bindings.js",
    "bytes": 7606,
    "sha256": "55694904ef426e2edb1b2715575757d0c856848e0fba9d231ad696600aceb0c0"
  },
  {
    "path": "combat/008-weapon-party-boss-feedback.js",
    "bytes": 54809,
    "sha256": "3e7b5f46dd08f69477ace8d69a50c31dc6f090b21d43cd27e647c2b6e0c3d140"
  },
  {
  "path": "input/039-movement-flight-and-climbing.js",
  "bytes": 34000,
  "sha256": "bc1de96d343100dc838a34757ba05feabb2716283c0f5b166957bdaa196bb99d"
},
  {
    "path": "ui/047-maps-and-strategy.js",
    "bytes": 80472,
    "sha256": "5b4992c9eb9b35712f799c7b3b524395dea15be17d2aaf6471e88906e177b586"
  },
  {
    "path": "ui/055-market-and-trade.js",
    "bytes": 68666,
    "sha256": "ed39282c4fb75e5899e1d552b143c6ca9d701a43702a6f92ba098897e0174281"
  },
  {
    "path": "audio/051-sound-settings-and-speech.js",
    "bytes": 9828,
    "sha256": "01ed1a822470a5af32a7dc3500dbb561d006fa933be0bfaed817f3ec8f791f17"
  },
  {
    "path": "combat/038-demo-and-monster-state.js",
    "bytes": 7685,
    "sha256": "d94b9be0f79dead974e58d501ee99e8ddaa2449aefafac07146fc3585cd6a822"
  },
  {
    "path": "combat/040-spell-visuals.js",
    "bytes": 16480,
    "sha256": "3c2585347212c4a3ba5673701f46910b1d44365441ee410c497b25735f411f39"
  },
  {
    "path": "render/035-ghost-instantiation.js",
    "bytes": 28525,
    "sha256": "c0571ac131b114232a3f18621be3aaba4e7d8bc853cc020853db115c28fd667a"
  },
  {
    "path": "render/032-ghost-primitives.js",
    "bytes": 85535,
    "sha256": "bbebc507c4aee6bcb6ae96c87db5c9222fa73e62fddb80ebd14ef3e6026f4da5"
  },
  {
    "path": "render/033-ghost-materials-and-surfaces.js",
    "bytes": 29130,
    "sha256": "cfa9d8a68854827f604d4add3270ffc01400baa43de1d334eda6f3282a258c92"
  },
  {
    "path": "render/034-humanoid-ghost-designs.js",
    "bytes": 92950,
    "sha256": "41d3298f8656da9105576a7be0e68ec1ed7069456e848ef6e0a02d12f18b5ed2"
  },
  {
    "path": "ui/042-vitals-chat-and-status.js",
    "bytes": 33709,
    "sha256": "a0f2ebdc65089d571bb1abe728549fa917d1bf295a90c4908660373a5b240b2d"
  },
  {
    "path": "ui/056-party-guild-and-rebirth.js",
    "bytes": 98467,
    "sha256": "e127d71625796e00adb858b389b7a323865ea2e5c116a5db6c20bf40fd1c3648"
  }
].map(entry => [entry.path, entry]));

test('reviewed combined client preserves unchanged snapshot bytes and deterministic assembly', () => {
  const baseline = JSON.parse(readFileSync(join(clientRoot, 'src/client/extraction-baseline.json')));
  const bytes = assembleClient();
  assert.equal(baseline.bytes, 1467465);
  assert.equal(baseline.sha256, 'a8e188217ea0824ef3a5faa24e60429be45e23ba3e2c6c96317a5fe6987678b4');
  assert.equal(bytes.length, 1956539);
  assert.equal(hash(bytes), '9d6385d98c4ecf8fdd5cc1e411a7f4da52f94d2f7039b99a0b8862543bb32457');
  const manifest = JSON.parse(readFileSync(join(clientRoot, 'src/client/manifest.json')));
  assert.deepEqual(manifest.fragments, baseline.fragments.map(entry => entry.path));
  for (const entry of baseline.fragments) {
    const fragment = readFileSync(join(clientRoot, 'src/client', entry.path));
    const expected = reviewedReleaseFragments.get(entry.path) ?? entry;
    assert.equal(fragment.length, expected.bytes, entry.path);
    assert.equal(hash(fragment), expected.sha256, entry.path);
  }
  assert.deepEqual(assembleClient(), assembleClient());
});

test('stale output, omitted/duplicate/reordered sources, unsafe paths and syntax errors fail closed', () => {
  const temp = mkdtempSync(join(tmpdir(), 'montra-client-'));
  try {
    cpSync(join(clientRoot, 'src'), join(temp, 'src'), { recursive: true });
    writeFileSync(join(temp, 'main.js'), assembleClient());
    assert.deepEqual(checkClient(temp), assembleClient());
    writeFileSync(join(temp, 'main.js'), 'stale');
    assert.throws(() => checkClient(temp), /main.js is stale/);
    const manifestFile = join(temp, 'src/client/manifest.json');
    const original = JSON.parse(readFileSync(manifestFile));
    const change = mutate => {
      const manifest = structuredClone(original);
      mutate(manifest.fragments);
      writeFileSync(manifestFile, JSON.stringify(manifest));
    };
    change(files => files.push(files[1]));
    assert.throws(() => assembleClient(temp), /Duplicate/);
    change(files => files.reverse());
    assert.throws(() => assembleClient(temp), /manifest order/);
    change(files => files.pop());
    assert.throws(() => assembleClient(temp), /Unlisted or missing/);
    change(files => files[0] = '../main.js');
    assert.throws(() => assembleClient(temp), /Invalid client fragment path/);
    writeFileSync(manifestFile, JSON.stringify(original));
    writeFileSync(join(temp, 'src/client', original.fragments[1]), 'const = ;');
    assert.throws(() => assembleClient(temp), SyntaxError);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

function withClientFixture(run) {
  const temp = mkdtempSync(join(tmpdir(), 'montra-client-safety-'));
  try {
    cpSync(join(clientRoot, 'src'), join(temp, 'src'), { recursive: true });
    writeFileSync(join(temp, 'main.js'), assembleClient());
    run(temp);
  } finally { rmSync(temp, { recursive: true, force: true }); }
}

test('valid source-only changes require rebuilding; missing files and invalid manifests fail', () => {
  withClientFixture(temp => {
    const manifestFile = join(temp, 'src/client/manifest.json');
    const manifest = JSON.parse(readFileSync(manifestFile));
    const fragment = join(temp, 'src/client', manifest.fragments[1]);
    const original = readFileSync(fragment);
    writeFileSync(fragment, Buffer.concat([original, Buffer.from('  // Valid source-only test edit.\n')]));
    assert.doesNotThrow(() => assembleClient(temp));
    assert.throws(() => checkClient(temp), /main.js is stale/);
    const stale = readFileSync(join(temp, 'main.js'));
    assert.throws(() => prepareClient(temp), /main.js is stale/);
    assert.deepEqual(readFileSync(join(temp, 'main.js')), stale);
    assert.deepEqual(writeClient(temp), checkClient(temp));
    rmSync(fragment);
    assert.throws(() => assembleClient(temp), /Unlisted or missing/);
    writeFileSync(fragment, original);
    writeFileSync(manifestFile, JSON.stringify({ ...manifest, format: 2 }));
    assert.throws(() => assembleClient(temp), /Unsupported client manifest format/);
    writeFileSync(manifestFile, JSON.stringify({ ...manifest, output: 'other.js' }));
    assert.throws(() => assembleClient(temp), /filename must stay main.js/);
  });
});

for (const relative of ['src', 'src/client', 'src/client/core', 'src/client/manifest.json', 'src/client/core/001-storage-and-dom.js']) {
  test(`reject source symlink: ${relative}`, () => {
    withClientFixture(temp => {
      const original = join(temp, relative);
      const target = join(temp, 'link-target');
      renameSync(original, target);
      symlinkSync(target, original, /\.(js|json)$/.test(relative) ? 'file' : 'junction');
      assert.throws(() => assembleClient(temp), /[Ss]ource.*symlinks are not supported/);
    });
  });
}

test('CLI build and check reject output symlinks without reading or overwriting their targets', () => {
  withClientFixture(temp => {
    const target = join(temp, 'untouched.js');
    const original = readFileSync(join(temp, 'main.js'));
    renameSync(join(temp, 'main.js'), target);
    symlinkSync(target, join(temp, 'main.js'), 'file');
    assert.throws(() => checkClient(temp), /Output symlinks/);
    assert.throws(() => writeClient(temp), /Output symlinks/);
    assert.throws(() => prepareClient(temp), /Output symlinks/);
    mkdirSync(join(temp, 'scripts'));
    cpSync(join(clientRoot, 'scripts/build-client.mjs'), join(temp, 'scripts/build-client.mjs'));
    for (const args of [[], ['--check'], ['--prepare']]) {
      const result = spawnSync(process.execPath, [join(temp, 'scripts/build-client.mjs'), ...args], { encoding: 'utf8' });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Output symlinks are not supported/);
      assert.deepEqual(readFileSync(target), original);
    }
    // Broken links must be rejected too, not treated as a missing output file.
    rmSync(target);
    assert.throws(() => writeClient(temp), /Output symlinks/);
    assert.throws(() => prepareClient(temp), /Output symlinks/);
  });
});


test('prepare creates missing output, verifies existing output and never repairs stale bytes', () => {
  withClientFixture(temp => {
    const output = join(temp, 'main.js');
    rmSync(output);
    assert.throws(() => checkClient(temp), /main.js is missing/);
    assert.deepEqual(prepareClient(temp), assembleClient(temp));
    assert.deepEqual(readFileSync(output), assembleClient(temp));
    assert.deepEqual(prepareClient(temp), checkClient(temp));
    writeFileSync(output, 'stale');
    assert.throws(() => prepareClient(temp), /main.js is stale/);
    assert.equal(readFileSync(output, 'utf8'), 'stale');
    rmSync(output);
    mkdirSync(output);
    assert.throws(() => prepareClient(temp), /Expected regular output file/);
  });
});

test('clean-checkout CLI preparation succeeds; strict check and stale preparation fail', () => {
  withClientFixture(temp => {
    mkdirSync(join(temp, 'scripts'));
    cpSync(join(clientRoot, 'scripts/build-client.mjs'), join(temp, 'scripts/build-client.mjs'));
    const output = join(temp, 'main.js');
    const run = mode => spawnSync(process.execPath, [join(temp, 'scripts/build-client.mjs'), mode], { encoding: 'utf8' });
    rmSync(output);
    assert.match(run('--check').stderr, /main.js is missing/);
    assert.equal(run('--prepare').status, 0);
    assert.deepEqual(readFileSync(output), assembleClient(temp));
    assert.equal(run('--check').status, 0);
    writeFileSync(output, 'stale');
    assert.equal(run('--prepare').status, 1);
    assert.equal(readFileSync(output, 'utf8'), 'stale');
  });
});
