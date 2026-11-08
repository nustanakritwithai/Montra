import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { assembleClient, checkClient, clientRoot, prepareClient, writeClient } from './build-client.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

// Intentional gate, market, flight, class-skill, audio, cosmetic-safeguard and HUD (orb attack, wallet) changes. Keep snapshot
// evidence unchanged; every other fragment must still match that evidence.
const reviewedReleaseFragments = new Map([
{
  "path": "render/025-horse-and-avatar-animation.js",
  "bytes": 44774,
  "sha256": "f07dabb370d1accc700d32a5acad72f6f01459d363a6e56ca4079ab0b5a45712"
},
{
  "path": "network/044-state-sync-and-connection.js",
  "bytes": 138339,
  "sha256": "6ac9c202ba47298bb742c0c14bd221911dd9b6f6018d19b59817409931992edf"
},
{
  "path": "render/026-avatar-auras-and-lifecycle.js",
  "bytes": 12518,
  "sha256": "86b70b0155ca62560afdc27c5ff380f01fda621b008250c98b0bd037b487127a"
},
{
  "path": "render/021-character-models.js",
  "bytes": 38501,
  "sha256": "a54e79e3498d1db31af95d81fdde580b1a1cf8f1c9813b03a3103231d011a797"
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
  "path": "world/018-region-dressing.js",
  "bytes": 29219,
  "sha256": "523f97592df51182f45944ef5d1d2af9de27b18a947b46fb66a38a1b6999f972"
},
{
  "path": "world/019-state-and-portals.js",
  "bytes": 20221,
  "sha256": "bf1e356257a2099f3954553bbf9226c87783a0d0218d3a9e77c14a24fa887fb7"
},
{
  "path": "world/029-fishing-and-resources.js",
  "bytes": 13255,
  "sha256": "7a2009556926749651397b24be68677d46803f9bf935629ffc0b22a55eda7f86"
},
{
  "path": "world/017-region-terrain.js",
  "bytes": 61185,
  "sha256": "4bc6197d313d26171bff99fbd63a5a7de98355c9e359bb86a469024642e37972"
},
{
  "path": "world/016-forest-and-temple.js",
  "bytes": 19712,
  "sha256": "2735da1dfaa00f6c3dcb0cc2f0c8cd95016e9f74de5b302042ae0a7e411e9c45"
},
{
  "path": "world/015-forest-gates-and-services.js",
  "bytes": 35657,
  "sha256": "b84c944ce8d8dfda1f151ffeff7f95fde2088818ae651b72ced427e5d3baa5fb"
},
{
  "path": "world/014-ritual-village.js",
  "bytes": 27480,
  "sha256": "8074f07ef4e64c6d50366952e535e6d2501d3ecea14e3f39c9397c9cd4eb5078"
},
{
  "path": "render/006-materials-atmosphere.js",
  "bytes": 52193,
  "sha256": "cd7427f522c299acf6351e6ef75d54929aa06387100ecbb0b27734ed60105c51"
},
{
  "path": "core/059-frame-loop-and-startup.js",
  "bytes": 19066,
  "sha256": "3005aff3fb353bbebf1aa1338042e0c35d6c4b77528eaf6022ce82bbb607e7f3"
},
{
  "path": "render/020-avatar-materials-and-meshes.js",
  "bytes": 24730,
  "sha256": "6aec60c01daba916361954cf9eefe6c02ceb264ffb5e931caf4f527d4c7d02ff"
},
{
  "path": "ui/042-vitals-chat-and-status.js",
  "bytes": 34116,
  "sha256": "5defa36bc9efced8a0da031b1c75697ff55d152306e5a518a77a86747e4baa4c"
},
{
  "path": "ui/046-drawers-and-chat.js",
  "bytes": 9866,
  "sha256": "678c70cc8f20b4c04d8cfa161a660506c5de197694535589887042a8d0038aad"
},
{
  "path": "ui/048-class-books-and-hotbars.js",
  "bytes": 70197,
  "sha256": "60a5e524e669a9a95fc49e159d785c597e08a04c943ad2348c27a5653e8dad45"
},
{
  "path": "ui/049-skill-graph-and-details.js",
  "bytes": 53305,
  "sha256": "5845fd7eb336182b4bfac408e5469f1bdb3d2dc2a5503d93089777ee9ba8afc1"
},
{
  "path": "input/058-field-control-bindings.js",
  "bytes": 6385,
  "sha256": "d19a108b7d1405e75a3b8ac767bb27dd653bcfceeccac2c51f3dab06a0d336c0"
},
{
  "path": "combat/008-weapon-party-boss-feedback.js",
  "bytes": 49803,
  "sha256": "afe577ae7154216c90705bc74a4c0f1d4bc656bd982f17b230c341c08c934685"
},
{
  "path": "input/039-movement-flight-and-climbing.js",
  "bytes": 16746,
  "sha256": "2c6eabadd237367cf857e4b50c844481226566d9e902b89bbe816986c10aff23"
},
  {
    "path": "ui/047-maps-and-strategy.js",
    "bytes": 72195,
    "sha256": "05d687136931ba32f235b6477d6285105329d6bb869d4daad289e1b7f4238048"
  },
  {
    "path": "ui/055-market-and-trade.js",
    "bytes": 55367,
    "sha256": "2cf0b6272de3ff4cbd59ab5ca19319cff7b098d0eadfc82f18af8a090ee52678"
  },
  {
    "path": "audio/051-sound-settings-and-speech.js",
    "bytes": 9828,
    "sha256": "01ed1a822470a5af32a7dc3500dbb561d006fa933be0bfaed817f3ec8f791f17"
  }
].map(entry => [entry.path, entry]));

test('reviewed combined client preserves unchanged snapshot bytes and deterministic assembly', () => {
  const baseline = JSON.parse(readFileSync(join(clientRoot, 'src/client/extraction-baseline.json')));
  const bytes = assembleClient();
  assert.equal(baseline.bytes, 1467465);
  assert.equal(baseline.sha256, 'a8e188217ea0824ef3a5faa24e60429be45e23ba3e2c6c96317a5fe6987678b4');
  assert.equal(bytes.length, 1556944);
  assert.equal(hash(bytes), '54faed2f06827431c3ea974df7b3256e5ae0de420e9864c2511bb6400b044a09');
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
