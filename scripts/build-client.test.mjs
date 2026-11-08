import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { assembleClient, checkClient, clientRoot, prepareClient, writeClient } from './build-client.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

// Intentional gate, market, flight, class-skill, audio, VFX and cosmetic-safeguard changes. Keep snapshot
// evidence unchanged; every other fragment must still match that evidence.
const reviewedReleaseFragments = new Map([
{
  "path": "ui/053-gear-training-and-crafting.js",
  "bytes": 43100,
  "sha256": "7c686faf73e77de54c3fbfea7ffa576b64f981d510b3b5c7ec00079598cd0285"
},
{
  "path": "ui/054-forge-feedback-and-pages.js",
  "bytes": 44358,
  "sha256": "66722b3856875b437e48405296c83686c73f1f2ca4fc08cfbac0718702a8a112"
},
  {
    "path": "ui/052-help-and-inventory.js",
    "bytes": 41162,
    "sha256": "5738b40538f6cb24aa9a297a88b1329463b088f86d7902030934db3edce21252"
  },
  {
    "path": "ui/030-item-art-and-comparison.js",
    "bytes": 14156,
    "sha256": "439a8b9703a5f4da0add7322e5fe9ee226d680777c5a415500b20e544014c023"
  },
  {
    "path": "ui/046-drawers-and-chat.js",
    "bytes": 10014,
    "sha256": "950249f8b364f90852b3200923e573ce7cec4a27431f4da3f5e6fdb070c9302f"
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
    "bytes": 19241,
    "sha256": "cd49e6c00b182217ab9bda65979e185a7c62c21b135fa9416e280bea00a0e17f"
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
    "bytes": 138475,
    "sha256": "476218fd0ffb6e56a535352171f6620c473273c01cb7a667f6a6cea8982977d3"
  },
  {
    "path": "audio/051-sound-settings-and-speech.js",
    "bytes": 9828,
    "sha256": "01ed1a822470a5af32a7dc3500dbb561d006fa933be0bfaed817f3ec8f791f17"
  },
  {
    "path": "render/007-world-effects.js",
    "bytes": 10048,
    "sha256": "a99a57a1c090788a9a9c3abab6d3a466575bc5b8f3d99a6affc8db2b7d7f16e2"
  },
  {
    "path": "render/009-effects-and-target-hud.js",
    "bytes": 20832,
    "sha256": "5014dcad2b9efcc43dc84c7d5635a1ba45a6eba6aef38cdd6c571d4aa79b46c6"
  },
  {
    "path": "combat/038-demo-and-monster-state.js",
    "bytes": 7425,
    "sha256": "239665c0c336cffe1f4e03140cbbb0b195051b8dba71dd297d51d3735970d32b"
  },
  {
    "path": "combat/040-spell-visuals.js",
    "bytes": 16480,
    "sha256": "3c2585347212c4a3ba5673701f46910b1d44365441ee410c497b25735f411f39"
  }
].map(entry => [entry.path, entry]));

test('reviewed combined client preserves unchanged snapshot bytes and deterministic assembly', () => {
  const baseline = JSON.parse(readFileSync(join(clientRoot, 'src/client/extraction-baseline.json')));
  const bytes = assembleClient();
  assert.equal(baseline.bytes, 1467465);
  assert.equal(baseline.sha256, 'a8e188217ea0824ef3a5faa24e60429be45e23ba3e2c6c96317a5fe6987678b4');
  assert.equal(bytes.length, 1465098);
  assert.equal(hash(bytes), 'cc538b069f4dc4e58346cca17a0468d269a87e67512e5f1532690ad2b2efb2e5');
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
