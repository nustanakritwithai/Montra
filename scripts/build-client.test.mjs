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
  "bytes": 4693,
  "sha256": "9200462f98f8f3ae03662100bb51471151532b810780217ddec3fda08020f409"
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
  "bytes": 38765,
  "sha256": "ecae1bb2b50a75a86d8a0e1ae1e9f0286863b071574643d5df0505c8d7ea1cf5"
},
{
  "path": "input/045-pointer-touch-and-dash.js",
  "bytes": 14482,
  "sha256": "b22eebc64646855af654d265e3fa68e2366b1c929ff4980b5fa8d68a990a6254"
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
  "bytes": 20705,
  "sha256": "7366b27f616a1508dc0ebbc9354cdded5ca3a1319a78e4e5d6500dcf582ac66f"
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
  "bytes": 28293,
  "sha256": "ad24daf0c47452cc936da18e01bf47c582c33b987957480ba374c682b4958b01"
},
{
  "path": "world/013-ground-and-fortification.js",
  "bytes": 4123,
  "sha256": "4f2951095b7f9967605459edfa92c9bb7768cfc13668a008c22beeaaa8907cde"
},
{
  "path": "ui/041-character-hud-and-journey.js",
  "bytes": 41694,
  "sha256": "a0fa4ea88240b0b2792a0c9eee243148264b7fa1bbfa7fd3ab740c1982f9f382"
},
{
  "path": "render/026-avatar-auras-and-lifecycle.js",
  "bytes": 19325,
  "sha256": "8ad0666252acfc431e107b949f2e982210c36ccf232e9da70862952ce9630443"
},
{
  "path": "render/025-horse-and-avatar-animation.js",
  "bytes": 48336,
  "sha256": "112a86cba39c96435234bfab077c409cde4e909ed2177e25300c09fc257033aa"
},
{
  "path": "render/021-character-models.js",
  "bytes": 77281,
  "sha256": "f8cd095bca570bebc83e71340e056ab7f1a1f7aaebd2493ea5d9478600cb1ca0"
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
  "bytes": 141098,
  "sha256": "c208b6cd1d6dd489eb9cd2af8b5fe7040d3436bc95fe2ce7a9f960c6d30ac49c"
},
{
  "path": "core/059-frame-loop-and-startup.js",
  "bytes": 20066,
  "sha256": "c5baf151f83584f962c404ad362710ec23f4052dc2f6f8c06ee8d0b66fd5ff68"
},
  {
    "path": "ui/053-gear-training-and-crafting.js",
    "bytes": 45220,
    "sha256": "2cfa7b0ccd52ccc59f72759e91bd187b9eb67e1ea71ed85f03d3f569a6bec0e6"
  },
  {
    "path": "ui/054-forge-feedback-and-pages.js",
    "bytes": 46377,
    "sha256": "f031db8d6d4945c9476faabdb69446c377a205bc0e8db48d3134db0c7b1cc24e"
  },
  {
    "path": "ui/052-help-and-inventory.js",
    "bytes": 41187,
    "sha256": "bfb6918219211a6a5eec609e7744bc470119f3ca59640cf15aca771b1c1b0e57"
  },
  {
    "path": "ui/030-item-art-and-comparison.js",
    "bytes": 19285,
    "sha256": "dc93636bfe1cf523b8c53bfcecd60df8eb4aee066d4692173e3ca8ca925050ca"
  },
  {
    "path": "ui/046-drawers-and-chat.js",
    "bytes": 10405,
    "sha256": "3923a080bd93ede4c63b032d366af9adad5f6a1d3dedd8643579c19ef4f70ad3"
  },
  {
    "path": "ui/048-class-books-and-hotbars.js",
    "bytes": 64485,
    "sha256": "23a672d25e52bf1add47bd14424fdfa48f4819b7a8798edfa311f72fcb74032a"
  },
  {
    "path": "ui/049-skill-graph-and-details.js",
    "bytes": 61357,
    "sha256": "cd52ae4e037637c0a374df93b31cf21d3b05dbd89d550eccb66fcb1ba12a7d5b"
  },
  {
    "path": "input/058-field-control-bindings.js",
    "bytes": 6304,
    "sha256": "3c1cd812902255f31cd0c9ac296e8673f896eb6240b54d09b1082352ec385d4c"
  },
  {
    "path": "combat/008-weapon-party-boss-feedback.js",
    "bytes": 49803,
    "sha256": "afe577ae7154216c90705bc74a4c0f1d4bc656bd982f17b230c341c08c934685"
  },
  {
  "path": "input/039-movement-flight-and-climbing.js",
  "bytes": 33846,
  "sha256": "53fad71e5cfab006302818cd3c73b3d2d021a76b1f43d1b5d9b8e2755feb073e"
},
  {
    "path": "ui/047-maps-and-strategy.js",
    "bytes": 72195,
    "sha256": "05d687136931ba32f235b6477d6285105329d6bb869d4daad289e1b7f4238048"
  },
  {
    "path": "ui/055-market-and-trade.js",
    "bytes": 57458,
    "sha256": "e322de05b0a4c4bcabae1199869636ac286978c863d106df2e33b184d7310471"
  },
  {
    "path": "audio/051-sound-settings-and-speech.js",
    "bytes": 9828,
    "sha256": "01ed1a822470a5af32a7dc3500dbb561d006fa933be0bfaed817f3ec8f791f17"
  },
  {
    "path": "combat/038-demo-and-monster-state.js",
    "bytes": 7525,
    "sha256": "d931f47b6f143af85b433b2e7f96a1e43d9ab75ab285fd9312f74b4257745aff"
  },
  {
    "path": "combat/040-spell-visuals.js",
    "bytes": 16480,
    "sha256": "3c2585347212c4a3ba5673701f46910b1d44365441ee410c497b25735f411f39"
  },
  {
    "path": "render/035-ghost-instantiation.js",
    "bytes": 15358,
    "sha256": "a5f4fa4b9478bc9ee2c0fef80ffd522099141ba3a1257079868fa9380513cabc"
  },
  {
    "path": "render/032-ghost-primitives.js",
    "bytes": 33439,
    "sha256": "a59f7e1682b391500e45734972348c53c7549107d9f85fcb3f1ffc4ff8087617"
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
    "bytes": 33768,
    "sha256": "358e485adb9e2f119f7f41ef3ed2d6f2853f713950194a79fafa1531ad0edb4b"
  }
].map(entry => [entry.path, entry]));

test('reviewed combined client preserves unchanged snapshot bytes and deterministic assembly', () => {
  const baseline = JSON.parse(readFileSync(join(clientRoot, 'src/client/extraction-baseline.json')));
  const bytes = assembleClient();
  assert.equal(baseline.bytes, 1467465);
  assert.equal(baseline.sha256, 'a8e188217ea0824ef3a5faa24e60429be45e23ba3e2c6c96317a5fe6987678b4');
  assert.equal(bytes.length, 1719496);
  assert.equal(hash(bytes), '0fcb4cf7373c02746a532c958f96c7cd2d79fffe4ad7f75655a3ef7f40022995');
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
