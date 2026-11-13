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
  "bytes": 4812,
  "sha256": "3cb0a90b38a8cfc6c488cd8674a594e759fe479adff82f90746de9a333c1560e"
},
{
  "path": "ui/003-toast-and-mode.js",
  "bytes": 1370,
  "sha256": "7a6a098266f4a669a18ddf6c699774c731a64fc7af031b30a7d8da62f0e10bef"
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
  "bytes": 40203,
  "sha256": "39cc06015fc6c55585efaafbabd953e314f69e0a676a2d2b98b3e1df9a2acb87"
},
{
  "path": "input/045-pointer-touch-and-dash.js",
  "bytes": 15940,
  "sha256": "22acf36e12809b3b9cbdf6da3c24f59de0a005901222555b08556fd647736cf1"
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
  "bytes": 15681,
  "sha256": "6311f658026f02b528d6fd5489f3e776b171e0098ceaae28f9f4fda988a57a47"
},
{
  "path": "combat/005-floating-feedback.js",
  "bytes": 4654,
  "sha256": "2979dec2e93774b7caa991c5bffabe95b572056c89129bf8c78b2af2fac9da0c"
},
{
  "path": "render/004-scene-camera-lights.js",
  "bytes": 18640,
  "sha256": "54d7fa91970cec16a07fdc0c5fcec311948efb7bbd8ccaf53bef17bdc1b15a84"
},
{
  "path": "world/029-fishing-and-resources.js",
  "bytes": 15725,
  "sha256": "8deae105640e2ceaf96312f99065151da80e54f5f4a41d8c409c1ddc9efb1a4e"
},
{
  "path": "world/019-state-and-portals.js",
  "bytes": 28978,
  "sha256": "dd430d5efbccdc15b2d49c967861524d0b684ed9146ef4a5e9f15d85f65e54a9"
},
{
  "path": "world/018-region-dressing.js",
  "bytes": 30063,
  "sha256": "a3340e4b8fc3cd6df626242a02f847b4be3ec8972ab11a4943be6f407941bcf4"
},
{
  "path": "world/017-region-terrain.js",
  "bytes": 77689,
  "sha256": "b792703c4dcec17f549956b876496384a1e02a7b18c37edd23709f8f50e8f485"
},
{
  "path": "world/016-forest-and-temple.js",
  "bytes": 19872,
  "sha256": "a81a9b4cbc16810d551abdcf9f707fcad4778315944aacab0707fc0fdb8c4d38"
},
{
  "path": "world/015-forest-gates-and-services.js",
  "bytes": 37122,
  "sha256": "135aa6036286daccd90511b97892b3cb70572ab3554c31461baeef4282050837"
},
{
  "path": "world/014-ritual-village.js",
  "bytes": 31851,
  "sha256": "52cb339aacd84f06d3b6ec9a1cbf488aede03b18dec9954a018eefac22b323da"
},
{
  "path": "world/013-ground-and-fortification.js",
  "bytes": 4123,
  "sha256": "4f2951095b7f9967605459edfa92c9bb7768cfc13668a008c22beeaaa8907cde"
},
{
  "path": "ui/041-character-hud-and-journey.js",
  "bytes": 41475,
  "sha256": "063fc4c2e006e973d3605a80c50cead8df4133f14aad688bb5c885c683674464"
},
{
  "path": "render/026-avatar-auras-and-lifecycle.js",
  "bytes": 19174,
  "sha256": "630c018d4949c9431e00619e5f1d786469ced3595cf94947a6124a26e9de8c14"
},
{
  "path": "render/025-horse-and-avatar-animation.js",
  "bytes": 56148,
  "sha256": "ab6f8190ea1832074c56e2b248ddab3c037ba3fc9c3ce2d8091d0b85dd69b64a"
},
{
  "path": "render/021-character-models.js",
  "bytes": 83060,
  "sha256": "22157a1b0206f1a295ceba86b706b505ba80d0272d2f0899b9de4d1e83c4ceb3"
},
{
  "path": "render/020-avatar-materials-and-meshes.js",
  "bytes": 25766,
  "sha256": "5e73539be477f557879d5e8a5c31ab9ad1a2bfe950186098934c7c282061a868"
},
{
  "path": "render/006-materials-atmosphere.js",
  "bytes": 83218,
  "sha256": "8a45a69c6e5f21dad48f047ba583455e3debdd643eb8cd23d66957711d0db280"
},
{
  "path": "network/044-state-sync-and-connection.js",
  "bytes": 166374,
  "sha256": "d2e965cd22d9d16327a3710d027ddc247acf5e0518386badbd3a03b7ab36ab49"
},
{
  "path": "core/059-frame-loop-and-startup.js",
  "bytes": 43509,
  "sha256": "5db77f3f904499f406ab51b09daaa7899e08d13f7ad3ba950ca3337efbf613cb"
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
    "bytes": 10645,
    "sha256": "e000ea7906741dadccaaa340734cb6f344968c1361fb5ca92b94ed345531fa3f"
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
    "bytes": 39108,
    "sha256": "3bdde4f81bff80ab6a2390ee11b49ff4960f9afd2693b08584b472cc299cb492"
  },
  {
    "path": "combat/008-weapon-party-boss-feedback.js",
    "bytes": 54247,
    "sha256": "0be5a80c874248e6c2baf8cbb9bc377efd2df1283152ae4d28f19ce877f98204"
  },
  {
  "path": "input/039-movement-flight-and-climbing.js",
  "bytes": 33986,
  "sha256": "e83da955109384ed0907d82e2cbfd27e8a0be61594ac4010e5da8d9020db9479"
},
  {
    "path": "ui/047-maps-and-strategy.js",
    "bytes": 104542,
    "sha256": "1eab63302b536471480af42a50f51e7236ad41a2a8b474c14e0846daa1d4620b"
  },
  {
    "path": "ui/055-market-and-trade.js",
    "bytes": 69118,
    "sha256": "c6bf69817d77ae68eecc4f6bd41b1063a46afe59cf5bc8e2a1655c0a06fc7f86"
  },
  {
    "path": "audio/051-sound-settings-and-speech.js",
    "bytes": 10014,
    "sha256": "0943bd3981a4d7b91d72276450d446deb00d9af50e5a28c30b04a0546964a355"
  },
  {
    "path": "combat/038-demo-and-monster-state.js",
    "bytes": 7996,
    "sha256": "56dc1dd754988030b15b3e89aa76ee40a857e08aaa7de488f862c6fa0d97aef6"
  },
  {
    "path": "combat/040-spell-visuals.js",
    "bytes": 16480,
    "sha256": "3c2585347212c4a3ba5673701f46910b1d44365441ee410c497b25735f411f39"
  },
  {
    "path": "render/035-ghost-instantiation.js",
    "bytes": 31308,
    "sha256": "23a3562c700627f80b6a9bd9f94b1819907b1c2a3402b0bbfdf667da50a4360c"
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
    "bytes": 42905,
    "sha256": "95976a1026a64aa6e312eb9867dd268a08c59ddd073d7c78278a4fcf99fa83a5"
  },
  {
    "path": "ui/056-party-guild-and-rebirth.js",
    "bytes": 166033,
    "sha256": "e0613573dd386c1e7b66eb78e8035aee4d8f1bcf3b0648c2a8d5dade91d719ae"
  },
  {
    "path": "audio/023-action-and-impact-sounds.js",
    "bytes": 3746,
    "sha256": "fa6e1fe2e791ffc945ee809dad8c00a8ce79f8394e2318fa7a1909a3dcde9adc"
  },
  {
    "path": "combat/024-action-and-skill-motion.js",
    "bytes": 5441,
    "sha256": "6556cda9da5bcf7c469426af1e34763fdb391124582d9a3e278f90be206af6a5"
  },
  {
    "path": "audio/036-ghost-voices.js",
    "bytes": 3272,
    "sha256": "15ee292d8918b9d48b035d07b07038c2afd3c3ab45d6f469b2fa64d5dbfe6a47"
  },
  {
    "path": "audio/002-voice-guidance.js",
    "bytes": 20816,
    "sha256": "d3e6ade9de23a6e045ff6bfe183a7c8e2643d6d0d033c065cca253c6403e2836"
  },
  {
    "path": "core/028-session-and-economy-state.js",
    "bytes": 2780,
    "sha256": "ac74277be75f972e4568a38e44d12389c4014aae291125c181bad8b4f211cdaa"
  },
  {
    "path": "render/012-sky-mist-atmosphere.js",
    "bytes": 15882,
    "sha256": "49eb7538f24036bd0be78c69277d8387650898892d7f867274319f7d3ee83d58"
  },
  {
    "path": "combat/043-player-targeting.js",
    "bytes": 3342,
    "sha256": "08dac28c65cd0a467ff736a968d670aacae81f1a43036a2b68daa6082e42a995"
  },
  {
    "path": "ui/050-character-and-equipment.js",
    "bytes": 46980,
    "sha256": "fed8969f39e6e003743896123f5828f46e93a8eaa4d5ec400e0a8d57c9823575"
  },
  {
    "path": "ui/052-help-and-inventory.js",
    "bytes": 41486,
    "sha256": "3b46566f23e1b729b3f7604d9ec6eed7808ff8ad66769d7f2f03ccf5b2cfa871"
  }
].map(entry => [entry.path, entry]));

test('reviewed combined client preserves unchanged snapshot bytes and deterministic assembly', () => {
  const baseline = JSON.parse(readFileSync(join(clientRoot, 'src/client/extraction-baseline.json')));
  const bytes = assembleClient();
  assert.equal(baseline.bytes, 1467465);
  assert.equal(baseline.sha256, 'a8e188217ea0824ef3a5faa24e60429be45e23ba3e2c6c96317a5fe6987678b4');
  assert.equal(bytes.length, 2162112);
  assert.equal(hash(bytes), 'e247a976951f546f9d3a67b25455d03618455469a62e8c107f95760496d4d924');
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
