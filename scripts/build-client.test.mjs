import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { assembleClient, checkClient, clientRoot, prepareClient, writeClient } from './build-client.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function copyBuildDependencies(temp) {
  mkdirSync(join(temp, 'node_modules'), { recursive: true });
  for (const name of ['esbuild', '@esbuild']) cpSync(join(clientRoot, 'node_modules', name), join(temp, 'node_modules', name), { recursive: true });
}

// Intentional gate, market, flight, class-skill, audio and cosmetic-safeguard changes. Keep snapshot
// evidence unchanged; every other fragment must still match that evidence.
const reviewedReleaseFragments = new Map([
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
    "path": "world/017-region-terrain.js",
    "bytes": 55705,
    "sha256": "4178b32e10cde7f1ff798732f831397317cc4809444108338d75bcf624c7b00d"
  },
  {
    "path": "world/019-state-and-portals.js",
    "bytes": 19219,
    "sha256": "433a2e4004df0292a90699a71e14453bf843690895ba43d6676b54f270abf500"
  },
  {
    "path": "ui/047-maps-and-strategy.js",
    "bytes": 72195,
    "sha256": "05d687136931ba32f235b6477d6285105329d6bb869d4daad289e1b7f4238048"
  },
  {
    "path": "core/059-frame-loop-and-startup.js",
    "bytes": 18707,
    "sha256": "a73a400a703a8700c1123716baa12ccc4941338a9d0b8a0589b9353404bbb35c"
  },
  {
    "path": "ui/055-market-and-trade.js",
    "bytes": 55367,
    "sha256": "2cf0b6272de3ff4cbd59ab5ca19319cff7b098d0eadfc82f18af8a090ee52678"
  },
  {
    "path": "network/044-state-sync-and-connection.js",
    "bytes": 138100,
    "sha256": "01e70fe17a7361aec65c944b6ae592db95534f5ec792694b1dc141c4d0539e7a"
  },
  {
    "path": "audio/051-sound-settings-and-speech.js",
    "bytes": 9828,
    "sha256": "01ed1a822470a5af32a7dc3500dbb561d006fa933be0bfaed817f3ec8f791f17"
  }
].map(entry => [entry.path, entry]));

test('reviewed combined client preserves unchanged snapshot bytes and deterministic assembly', () => {
  const baseline = JSON.parse(readFileSync(join(clientRoot, 'src/client/extraction-baseline.json')));
  const phase2 = JSON.parse(readFileSync(join(clientRoot, 'src/modules/phase2-baseline.json')));
  const bytes = assembleClient();
  assert.equal(baseline.bytes, 1467465);
  assert.equal(baseline.sha256, 'a8e188217ea0824ef3a5faa24e60429be45e23ba3e2c6c96317a5fe6987678b4');
  assert.equal(phase2.integrationBaseCommit, '6c72db0ebf57c455c70ba06b7729aabbab7498c3');
  assert.equal(bytes.length, phase2.output.bytes);
  assert.equal(hash(bytes), phase2.output.sha256);
  const manifest = JSON.parse(readFileSync(join(clientRoot, 'src/client/manifest.json')));
  assert.deepEqual(manifest.fragments, baseline.fragments.map(entry => entry.path));
  assert.deepEqual(Object.keys(phase2.changedFragments), ['core/001-storage-and-dom.js', 'core/028-session-and-economy-state.js', 'render/004-scene-camera-lights.js', 'combat/038-demo-and-monster-state.js', 'network/044-state-sync-and-connection.js', 'ui/041-character-hud-and-journey.js', 'ui/047-maps-and-strategy.js', 'ui/050-character-and-equipment.js']);
  for (const file of reviewedReleaseFragments.keys()) {
    assert(manifest.fragments.includes(file), `Reviewed release fragment is missing: ${file}`);
  }
  assert.deepEqual([...reviewedReleaseFragments.keys()].filter(file=>phase2.changedFragments[file]),['ui/047-maps-and-strategy.js','network/044-state-sync-and-connection.js']);
  for (const entry of baseline.fragments) {
    const fragment = readFileSync(join(clientRoot, 'src/client', entry.path));
    const reviewed = phase2.changedFragments[entry.path] || reviewedReleaseFragments.get(entry.path) || entry;
    assert.equal(fragment.length, reviewed.bytes, entry.path);
    assert.equal(hash(fragment), reviewed.sha256, entry.path);
  }
  assert.deepEqual(Object.keys(phase2.moduleSources), ['index.mjs', 'core/chat-state.mjs', 'core/connection-lifecycle.mjs', 'core/session-state.mjs', 'core/world-state.mjs', 'network/connection.mjs', 'network/early-messages.mjs', 'network/social-handlers.mjs']);
  for (const [file, expected] of Object.entries(phase2.moduleSources)) {
    const bytes = readFileSync(join(clientRoot, 'src/modules', file));
    assert.equal(bytes.length, expected.bytes, file);
    assert.equal(hash(bytes), expected.sha256, file);
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
    copyBuildDependencies(temp);
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
    copyBuildDependencies(temp);
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
