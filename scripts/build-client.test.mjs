import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { assembleClient, checkClient, clientRoot, prepareClient, writeClient } from './build-client.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

// Intentional quest navigation, gate, market, flight, class-skill, audio, VFX and cosmetic-safeguard changes. Keep snapshot
// evidence unchanged; every other fragment must still match that evidence.
const reviewedReleaseFragments = new Map([
{
  "path": "combat/022-action-timelines.js",
  "bytes": 2517,
  "sha256": "5ff89f4b819d1dc9b9bb3a600079e688fd9062b3d6cb932fee3774fca4c7963d"
},
{
  "path": "ui/057-npcs-and-objectives.js",
  "bytes": 38475,
  "sha256": "89e31a09805379c16c09476fa7dbe0f85552e4c22c986e42b9085708998d1a7d"
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
  "bytes": 20674,
  "sha256": "26344bd4ccbdc992db376b881c0cff4fd7dfffe3108a0e84a56b8aebd236c037"
},
{
  "path": "world/018-region-dressing.js",
  "bytes": 29020,
  "sha256": "d7c0ca740501cc335809d9c7a6ed7c39d5f0527ac843207042e7fcc9f89af116"
},
{
  "path": "world/017-region-terrain.js",
  "bytes": 60990,
  "sha256": "a6be8f2f744c09a4663bae04f232c829a3dc1d39d8377a9bcad5d7b52cb87822"
},
{
  "path": "world/016-forest-and-temple.js",
  "bytes": 19855,
  "sha256": "0822f2404e1f98b7dc8d84db1b0e70d54b0c5e978e68919315cbecca65683080"
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
  "bytes": 38449,
  "sha256": "f99550d62c85c79d66c4b83b7010a279c259b8fc06fb5123fdd5293d1f767bcf"
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
  "bytes": 67893,
  "sha256": "bc3712dff7d49d8d422c8a9ce54af6468fe93fdb467e068bc1bb790dc52786ad"
},
{
  "path": "render/020-avatar-materials-and-meshes.js",
  "bytes": 26677,
  "sha256": "5a6e483651235dd71c6a825e5c06b82bd6626ee86ce5bf373a710cbc96f793ef"
},
{
  "path": "render/006-materials-atmosphere.js",
  "bytes": 82957,
  "sha256": "eea015c3a726c8668a52bfe418854c6c123dff7e2146bc2df3734043e2e00091"
},
{
  "path": "network/044-state-sync-and-connection.js",
  "bytes": 139722,
  "sha256": "98042316360f499843cd467a494ed4ca4d7b72cf658a9aa9645b64135a128b2b"
},
{
  "path": "core/059-frame-loop-and-startup.js",
  "bytes": 19229,
  "sha256": "8134ddc774c6eccd612f30a7be9ad2d7f696278c5e72afd2e29eadb0f34dad04"
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
    "bytes": 10271,
    "sha256": "c4a2cfbbacbe63f4b120abc1b8bd41e348480ef55f56873bca4ca8fde326889c"
  },
  {
    "path": "ui/048-class-books-and-hotbars.js",
    "bytes": 51360,
    "sha256": "ca926c1b6e73ab7f18de783b9c3122879b6454df25286d7a429a9d70d9bc0088"
  },
  {
    "path": "ui/049-skill-graph-and-details.js",
    "bytes": 57616,
    "sha256": "85ae272aea7ad5a541f2842e9ec6ee87923532dc9f1abb640e1c2db20f54214a"
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
  "bytes": 33585,
  "sha256": "fbb8cee0b96a2804f0877b4f76f94e47c8a3f429ff19e61a55c362297216966c"
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
    "path": "render/037-ghost-animation.js",
    "bytes": 4323,
    "sha256": "2fa0e4e1230e19ee855c812ba9912f7ff144cfc6f18401b90ef949beb448a6ea"
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
    "bytes": 33682,
    "sha256": "d02aeba9ac5d00f48cdd1144519ec6da53e0d3a37cb419b266bca3845dfb3626"
  }
].map(entry => [entry.path, entry]));

test('reviewed combined client preserves unchanged snapshot bytes and deterministic assembly', () => {
  const baseline = JSON.parse(readFileSync(join(clientRoot, 'src/client/extraction-baseline.json')));
  const bytes = assembleClient();
  assert.equal(baseline.bytes, 1467465);
  assert.equal(baseline.sha256, 'a8e188217ea0824ef3a5faa24e60429be45e23ba3e2c6c96317a5fe6987678b4');
  assert.equal(bytes.length, 1678791);
  assert.equal(hash(bytes), '06881502d2d695268fd860342fa9312dc8f51afe940746d5ba4c1d6b08bc9cec');
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
