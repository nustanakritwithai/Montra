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
  "bytes": 39849,
  "sha256": "fe65716b2921e8f9884ce0e145d5467d3fd0660d5d371069fd8586ee3ba75847"
},
{
  "path": "input/045-pointer-touch-and-dash.js",
  "bytes": 14978,
  "sha256": "b663488359e4b844e90052f7f50a1afc8744af4375f37f6f66565f832953dece"
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
  "bytes": 14723,
  "sha256": "551d6d558c8caa59c26ebf608f070a8b3b140616c79282fc623c24908c55006f"
},
{
  "path": "world/019-state-and-portals.js",
  "bytes": 23163,
  "sha256": "31432b00c9551611d772474af0ead0fc6ff01e2de21ee93ec6b8130cb9307ff8"
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
  "bytes": 36584,
  "sha256": "749bf66206057664a21f30f55f45dbf32e9477bdde5a50b106cb524b7c78beac"
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
  "bytes": 41603,
  "sha256": "0c900bc0062935b5f8a76f3d2bcdce49bd6ee826462ebf26bb27ea303f3997ee"
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
  "bytes": 83358,
  "sha256": "bb5f7ac6d06d4660ba19b6ba409c47e46634ee2bc375384707f1e86fea80c68f"
},
{
  "path": "network/044-state-sync-and-connection.js",
  "bytes": 162506,
  "sha256": "3ff5868013c58c08bf499012cc45a506db1f91193c6234298ea70a07decd27e5"
},
{
  "path": "core/059-frame-loop-and-startup.js",
  "bytes": 30078,
  "sha256": "748946ccfb04c831a5ed4b7e49ffdd074ad07065f27a76fdb22c015a0a50cb4f"
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
    "bytes": 10500,
    "sha256": "d49167805813a70e4fa3eff3c1cd4d86ff6ec383a9449aba9188b0ad1419f954"
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
    "bytes": 22716,
    "sha256": "3b234630a2bafd06bfbd9970d4e972a75f55284e876c1ccf473a741b81b59d3c"
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
    "bytes": 103490,
    "sha256": "cb3398e0d97000c6cf632650f97583ca9f80f1180e47fa3888fa8fa821851be9"
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
    "bytes": 31157,
    "sha256": "26b9fd5bb9842f4f3ce996abcabc725e176f1f157d9f27730da7d295f0fbec96"
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
    "bytes": 41481,
    "sha256": "81d922a607cb892c5dfdda6c9bd53b020698c8c3885714d078707ce98b5d9aef"
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
  }
].map(entry => [entry.path, entry]));

test('reviewed combined client preserves unchanged snapshot bytes and deterministic assembly', () => {
  const baseline = JSON.parse(readFileSync(join(clientRoot, 'src/client/extraction-baseline.json')));
  const bytes = assembleClient();
  assert.equal(baseline.bytes, 1467465);
  assert.equal(baseline.sha256, 'a8e188217ea0824ef3a5faa24e60429be45e23ba3e2c6c96317a5fe6987678b4');
  assert.equal(bytes.length, 2080526);
  assert.equal(hash(bytes), '3ebdb26d9efde90ab9416e8275e0d52ca55ee1fcfaa2f46a093585d98893b538');
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
