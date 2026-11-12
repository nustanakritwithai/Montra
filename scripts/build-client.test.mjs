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
  "bytes": 4710,
  "sha256": "a17add0abe6418085ac46831ae4143613354887a874afb0e259a3de1bee23ed8"
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
  "bytes": 40034,
  "sha256": "7e3f8c02b8e0a3a6b6281981b31e308849a1590ec70086075caee76d199319aa"
},
{
  "path": "input/045-pointer-touch-and-dash.js",
  "bytes": 15750,
  "sha256": "dd361c9d070f1855deff58cd70aeca1f047cab6779daa119f5df5ddc6a236344"
},
{
  "path": "render/027-summon-models-and-animation.js",
  "bytes": 14004,
  "sha256": "48f40243ffd95fa8070929c47946810421ddb05776afaddb45a17acec0c12abf"
},
{
  "path": "render/007-world-effects.js",
  "bytes": 12548,
  "sha256": "52a88f1a6b29fa532b8d74341f932aa6522189f540c86e8981fcdd89c92df049"
},
{
  "path": "render/009-effects-and-target-hud.js",
  "bytes": 18216,
  "sha256": "274852d7732477492d23e66a24f404c3a64327ab40b3751f6af8c7f7bd58ad3d"
},
{
  "path": "combat/005-floating-feedback.js",
  "bytes": 4539,
  "sha256": "bff23bf5f6cb2d2402fe999f2a40175de517e3eb698fd5b3763b5393abd93c3c"
},
{
  "path": "render/004-scene-camera-lights.js",
  "bytes": 14662,
  "sha256": "4eb0238cf50b7dd335eee8ca631d0c0e282a129e4eea5869aec29f2583372c65"
},
{
  "path": "world/029-fishing-and-resources.js",
  "bytes": 15725,
  "sha256": "8deae105640e2ceaf96312f99065151da80e54f5f4a41d8c409c1ddc9efb1a4e"
},
{
  "path": "world/019-state-and-portals.js",
  "bytes": 28750,
  "sha256": "2fdcc435ce4dc55654f60fd9da8c5bb0d37fd24b9d8203a0afe41b5480c166e2"
},
{
  "path": "world/018-region-dressing.js",
  "bytes": 29020,
  "sha256": "d7c0ca740501cc335809d9c7a6ed7c39d5f0527ac843207042e7fcc9f89af116"
},
{
  "path": "world/017-region-terrain.js",
  "bytes": 72131,
  "sha256": "7762a91b5d3744b84645987049da3acf1408965dba5d7ad437c75df19692996b"
},
{
  "path": "world/016-forest-and-temple.js",
  "bytes": 19872,
  "sha256": "a81a9b4cbc16810d551abdcf9f707fcad4778315944aacab0707fc0fdb8c4d38"
},
{
  "path": "world/015-forest-gates-and-services.js",
  "bytes": 37093,
  "sha256": "3b9a694df74c7ffdbbbad37d2e020a08b5e0c4a7cf4a0328951300941db2d577"
},
{
  "path": "world/014-ritual-village.js",
  "bytes": 30667,
  "sha256": "da6a8f81f762829dd39438af7b89baba5f19087cf2c0dc87917e581fe0fbf7c9"
},
{
  "path": "world/013-ground-and-fortification.js",
  "bytes": 4123,
  "sha256": "4f2951095b7f9967605459edfa92c9bb7768cfc13668a008c22beeaaa8907cde"
},
{
  "path": "ui/041-character-hud-and-journey.js",
  "bytes": 41658,
  "sha256": "9783696be06d183b93d3405e8f281d1ff9aab317299cd80769db74b0da2a5c63"
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
  "bytes": 26955,
  "sha256": "75837d0d6e707d81f78f29c3abce063425c8bea81798f007d4ff2a3a89764c07"
},
{
  "path": "render/006-materials-atmosphere.js",
  "bytes": 83218,
  "sha256": "8a45a69c6e5f21dad48f047ba583455e3debdd643eb8cd23d66957711d0db280"
},
{
  "path": "network/044-state-sync-and-connection.js",
  "bytes": 165564,
  "sha256": "e1d83119e36cbc8c248658dd1986946fb64addd77cc399b3e2f8b2a167230f0c"
},
{
  "path": "core/059-frame-loop-and-startup.js",
  "bytes": 35922,
  "sha256": "9f5423b5c0fca6979409ccc5bdfe98a9f182ab4efe018f5809d9de20424b9e4c"
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
    "path": "ui/052-help-and-inventory.js", "bytes": 41465, "sha256": "30312473df938bf8b425ad231bd2111f7b5a9b609b13b6c2ffde3f9270bf49a3"
  },
  {
    "path": "ui/030-item-art-and-comparison.js",
    "bytes": 19285,
    "sha256": "dc93636bfe1cf523b8c53bfcecd60df8eb4aee066d4692173e3ca8ca925050ca"
  },
  {
    "path": "ui/046-drawers-and-chat.js",
    "bytes": 10522,
    "sha256": "ba44cd487f7e7a84afdb7e3514bcc5f389f8e2ecd52984c8d06fe5242b062030"
  },
  {
    "path": "ui/048-class-books-and-hotbars.js",
    "bytes": 72566,
    "sha256": "9c5681d80689fe6189bb429108574e7680b446c1b39a768370de54da7cc8f00c"
  },
  {
    "path": "ui/049-skill-graph-and-details.js",
    "bytes": 63308,
    "sha256": "739dbdaca175f1fd9cb47bda561e4b7841d0d4d02f8872ef33e0a0ab871cfbb2"
  },
  {
    "path": "input/058-field-control-bindings.js",
    "bytes": 39172,
    "sha256": "b10923859670316ed5b508485510b5495da7d73c8be033277e0c43d514df1905"
  },
  {
    "path": "combat/008-weapon-party-boss-feedback.js",
    "bytes": 54802,
    "sha256": "2e4c119fb350350e7ffe9f5fd84fc663904f25d8f0264b983ffe9e706c9de83f"
  },
  {
  "path": "input/039-movement-flight-and-climbing.js",
  "bytes": 33434,
  "sha256": "391cf139d4ac943d32c57911ed9eb90daf1041648b94ad539f41313c2d2cf8ec"
},
  {
    "path": "ui/047-maps-and-strategy.js",
    "bytes": 107052,
    "sha256": "3168f28bc396fd95c30a19eefb1c7bee6e8ba7ebd4d50d7bf3bb360211d7336b"
  },
  {
    "path": "ui/055-market-and-trade.js",
    "bytes": 68666,
    "sha256": "ed39282c4fb75e5899e1d552b143c6ca9d701a43702a6f92ba098897e0174281"
  },
  {
    "path": "audio/051-sound-settings-and-speech.js",
    "bytes": 10014,
    "sha256": "0943bd3981a4d7b91d72276450d446deb00d9af50e5a28c30b04a0546964a355"
  },
  {
    "path": "combat/038-demo-and-monster-state.js",
    "bytes": 7757,
    "sha256": "e26baa940749cae78cd3df9899bfe89bfb3bb6f9706fd71c34d75e11373d37f4"
  },
  {
    "path": "combat/040-spell-visuals.js",
    "bytes": 16480,
    "sha256": "3c2585347212c4a3ba5673701f46910b1d44365441ee410c497b25735f411f39"
  },
  {
    "path": "render/035-ghost-instantiation.js",
    "bytes": 31189,
    "sha256": "c7cadbd8181fc45ae50edaaf4cbced2b8786e03226507e1be065cadd8b661140"
  },
  {
    "path": "render/032-ghost-primitives.js",
    "bytes": 118575,
    "sha256": "8e232f6a19db322e767b5d52f7de630673b1f45dcef52ad3a235a3b5a90a2ae0"
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
    "bytes": 41517,
    "sha256": "aa5dc3c170a80544adf159897e5f75267e0dfd4e7188767f4e000dd9ff307bb6"
  },
  {
    "path": "ui/056-party-guild-and-rebirth.js",
    "bytes": 150699,
    "sha256": "ed24735f78602889e9c249f00e0bf616459a13ee9deca600386ce2f1dc02dabd"
  },
  {
    "path": "audio/023-action-and-impact-sounds.js",
    "bytes": 3746,
    "sha256": "fa6e1fe2e791ffc945ee809dad8c00a8ce79f8394e2318fa7a1909a3dcde9adc"
  },
  {
    "path": "combat/024-action-and-skill-motion.js",
    "bytes": 5477,
    "sha256": "3844d087bd78522073e8f67b1e4624cae3e696a569616b214903b28e51e13503"
  },
  {
    "path": "audio/036-ghost-voices.js",
    "bytes": 3272,
    "sha256": "15ee292d8918b9d48b035d07b07038c2afd3c3ab45d6f469b2fa64d5dbfe6a47"
  },
  {
    "path": "audio/002-voice-guidance.js",
    "bytes": 20866,
    "sha256": "6f33c22dc7ed56558cdf635cd4544b231d7512e176e491a65b46b8e44964d623"
  },
  {
    "path": "core/028-session-and-economy-state.js",
    "bytes": 2780,
    "sha256": "ac74277be75f972e4568a38e44d12389c4014aae291125c181bad8b4f211cdaa"
  },
  {
    "path": "render/012-sky-mist-atmosphere.js",
    "bytes": 15833,
    "sha256": "476734d69b559487b15f136a5a95195262fb0f999c03640a49c6d42c9ec45408"
  }
].map(entry => [entry.path, entry]));

test('reviewed combined client preserves unchanged snapshot bytes and deterministic assembly', () => {
  const baseline = JSON.parse(readFileSync(join(clientRoot, 'src/client/extraction-baseline.json')));
  const bytes = assembleClient();
  assert.equal(baseline.bytes, 1467465);
  assert.equal(baseline.sha256, 'a8e188217ea0824ef3a5faa24e60429be45e23ba3e2c6c96317a5fe6987678b4');
  assert.equal(bytes.length, 2124971);
  assert.equal(hash(bytes), 'b5fd3b0ffd03d56ec964740cbf122dbb1943882b4e96e2f1ae5017004db3033f');
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
