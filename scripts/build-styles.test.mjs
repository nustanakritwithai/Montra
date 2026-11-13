import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { assembleStyles, checkStyleBoundary, checkStyles, stylesRoot, writeStyles } from './build-styles.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function withStylesFixture(run) {
  const temp = mkdtempSync(join(tmpdir(), 'montra-styles-'));
  try {
    cpSync(join(stylesRoot, 'src/styles'), join(temp, 'src/styles'), { recursive: true });
    cpSync(join(stylesRoot, 'styles.css'), join(temp, 'styles.css'));
    run(temp);
  } finally { rmSync(temp, { recursive: true, force: true }); }
}

test('reviewed style snapshot retains pinned bytes, cascade order, URLs and legacy overrides', () => {
  const baseline = JSON.parse(readFileSync(join(stylesRoot, 'src/styles/extraction-baseline.json')));
  const manifest = JSON.parse(readFileSync(join(stylesRoot, 'src/styles/manifest.json')));
  const bytes = checkStyles();
  assert.equal(bytes.length, 435661);
  assert.equal(hash(bytes), '9539a11be289dbf43b7b1cd0a7966d9d8d7cedef28f8f80e17215879ef646b55');
  // Retain historical extraction evidence, pin only intentionally changed sources.
  const reviewedStyles = new Map([{"path":"hud/001-combat-targets.css","bytes":1102,"sha256":"eea45919a89243ca2fdc545d355f8b711035c7a2ecf2db098694daa1e5586ab6"},{"path":"hud/010-player-guide-and-targets.css","bytes":3778,"sha256":"0819ed1bab1f4b9bafb2f22a3c5eedaa69cad5412f7c345ac3749af447dd0a16"},{"path":"inventory/005-item-detail-modal.css","bytes":6215,"sha256":"915ff089f37857ae854695630a73a31aa2e78b40cabe31e4bc95ba37a6cc1ef2"},{"path":"hud/016-field-layout-and-account.css","bytes":9431,"sha256":"49f690170150baecef74b6a9a238833e4955755deacf64ceb2e7969a05631ba0"},{"path":"base/000-foundation-and-drawers.css","bytes":11268,"sha256":"78e333794ea01e982d7d7b66974a14874bd73ce219e4b11843190a76124785fc"},{"path":"hud/002-field-slots-and-portrait.css","bytes":4260,"sha256":"24814dc0e1a1d544563b06657539c3c6784db028e66a7207ece2796753213754"},{"path":"hud/019-vital-orb-resources-and-chat.css","bytes":8947,"sha256":"b43f9e9b7a068bbd971989976c7c7affb054cddefd216285d68083dcab405a3e"},{"path":"forge/025-artisan-crafting-and-effects.css","bytes":23366,"sha256":"15ec2bd95092779655fd01fe9c332ef155239ad0f7b938fc76d31153fc50e5e2"},{"path":"market/045-world-market.css","bytes":5663,"sha256":"8085916d8cff3d18314efb5f7137ee80983fb7e8702d69aba5055cfacf74f407"},{"path":"audio/044-voice-guidance.css","bytes":192,"sha256":"c23bd4f58163ff764582a0e16fa403f7f87147a0aa70cff88f69ca0074a585c7"},{"path":"hud/021-map-menu-status-and-skill-arc.css","bytes":5642,"sha256":"b699f8fc5732d7145fba7d37594633817d5c217f929a2a7a02603af90a65f060"},{"path":"hud/022-chat-compose-and-vitals.css","bytes":11895,"sha256":"a57813b510f1bdf8a6aef10a6510d028b119cb4b209b99eeffe21d1ca0705661"},{"path":"hud/038-map-shortcuts-and-quick-skills.css","bytes":10220,"sha256":"71c82094e8dc3d4016d947a251f329233a182aca4300abdb4d4330aad4b4ae0c"},{"path":"skills/015-brightness-and-skill-graph.css","bytes":13023,"sha256":"ed7efc3b97b3154edd5257b759fbce481da15930e2aa5d431f43e21a90cf1eb8"},{"path":"social/012-guild-panels.css","bytes":25018,"sha256":"68578cc8923f8c2543c545152f8e9d42a2babe9f8ff61dd22c7f052ae6e63dcb"},{"path":"combat/014-floating-feedback.css","bytes":10682,"sha256":"ff3307e1ff212670c6b3f624df39bdb9b885057f97ff6ff59c0b9afb5def3536"},{"path":"combat/043-target-combo-and-boss.css","bytes":5501,"sha256":"4147e0585c175475b1f2276fe04681c9bfe1b0a4f5ba988a3ea3e6179a8bc89b"},{"path":"icons/037-skill-artwork.css","bytes":72312,"sha256":"7b0d0281051b016d2c2a98426f77106bba95de2a888f05326bee8ab4987b1f93"},{"path":"icons/039-skill-books.css","bytes":2175,"sha256":"5406777c20b427986fc35e8fd36194c510c46ae9a1bad9f9ce01d3a5aec625ae"},{"path":"icons/040-blade-artwork.css","bytes":8736,"sha256":"661ffced40df757486a2a4490fac444ce756059e9450a7aeb5a3fe55d4afdd8c"},{"path":"icons/041-mender-artwork.css","bytes":8032,"sha256":"c4caf823fe84a7d2e67eb8b718dbc6355c7bbfbe38b8076894a0642bdda5cee1"},{"path":"icons/042-sentinel-artwork.css","bytes":8060,"sha256":"c92da0becd96cecf1c7d9f9c1b76635124e19e0a7a3b8593311e7a2167be6273"},{"path":"character/018-seals-and-skill-slots.css","bytes":7914,"sha256":"aa92c0786484f46393dc1b7c6dccefeb6d72bc0a7ed1f758fa61fc171ffcda4d"},{"path":"character/023-medallion-and-map-menu.css","bytes":4786,"sha256":"9e0662dff81ef4653e4e524c858fa292c4d88aa5e2cca92e9d02590431e38070"},{"path":"world/024-rebirth-target-and-gathering.css","bytes":2405,"sha256":"98476daa3afe5b819ec385fa182f633806f8d4b52fc7c63acc8baf720d555edd"},{"path":"market/008-economy-trade-and-atlas.css","bytes":15534,"sha256":"44d548301f7c90dfada60a2c19b0201f5bf7a6b345c647005fffa5c080ab5ca0"},{"path":"market/032-catalog.css","bytes":6292,"sha256":"4d4b14ed3c03260ec83616a34f00861d0c2672c667f097a52b525485d3eb3fbc"}].map(entry => [entry.path, entry]));
  const addedStyles = [{"path": "inventory/046-loot-feed.css", "bytes": 2658, "sha256": "29a8b363283eb0472d74dfd68aed4f8e0e4203398ee2dadfc06d541376e1a0c5"}];
  assert.deepEqual(manifest.fragments, [...baseline.fragments.map(entry => entry.path), ...addedStyles.map(entry => entry.path)]);
  let nextLine = 1;
  for (const entry of baseline.fragments) {
    const fragment = readFileSync(join(stylesRoot, 'src/styles', entry.path));
    const expected = reviewedStyles.get(entry.path) ?? entry;
    assert.equal(fragment.length, expected.bytes, entry.path);
    assert.equal(hash(fragment), expected.sha256, entry.path);
    assert.equal(entry.originalStartLine, nextLine);
    if(expected === entry) assert.equal(fragment.toString('utf8').split('\n').length - 1, entry.originalEndLine - entry.originalStartLine + 1);
    nextLine = entry.originalEndLine + 1;
  }
  assert.equal(nextLine, 5589);
  for (const entry of addedStyles) {
    const fragment = readFileSync(join(stylesRoot, 'src/styles', entry.path));
    assert.equal(fragment.length, entry.bytes, entry.path);
    assert.equal(hash(fragment), entry.sha256, entry.path);
  }
  assert.deepEqual(assembleStyles(), assembleStyles());
});

test('stale output fails; a complete source edit requires an explicit reproducible rebuild', () => {
  withStylesFixture(temp => {
    const manifest = JSON.parse(readFileSync(join(temp, 'src/styles/manifest.json')));
    const fragment = join(temp, 'src/styles', manifest.fragments[0]);
    writeFileSync(join(temp, 'styles.css'), 'stale');
    assert.throws(() => checkStyles(temp), /styles.css is stale/);
    assert.deepEqual(writeStyles(temp), checkStyles());
    writeFileSync(fragment, '\n.preview { --accent: #ffcc00; }\n', { flag: 'a' });
    assert.throws(() => checkStyles(temp), /styles.css is stale/);
    const first = writeStyles(temp);
    assert.deepEqual(first, checkStyles(temp));
    assert.deepEqual(writeStyles(temp), first);
    assert.notDeepEqual(first, checkStyles());
  });
});

test('missing, duplicate, reordered, unlisted and unsafe fragment paths fail closed', () => {
  withStylesFixture(temp => {
    const manifestFile = join(temp, 'src/styles/manifest.json');
    const original = JSON.parse(readFileSync(manifestFile));
    const change = mutate => {
      const manifest = structuredClone(original);
      mutate(manifest);
      writeFileSync(manifestFile, JSON.stringify(manifest));
    };
    change(manifest => manifest.fragments.push(manifest.fragments[1]));
    assert.throws(() => assembleStyles(temp), /Duplicate style fragment/);
    change(manifest => manifest.fragments.reverse());
    assert.throws(() => assembleStyles(temp), /manifest order/);
    change(manifest => manifest.fragments.pop());
    assert.throws(() => assembleStyles(temp), /Unlisted or missing/);
    for (const bad of ['../styles.css', '/styles.css', 'base/000-../../styles.css', 'base\\000-escape.css', 12]) {
      change(manifest => { manifest.fragments[0] = bad; });
      assert.throws(() => assembleStyles(temp), /Invalid style fragment path/);
    }
    change(manifest => { manifest.format = 2; });
    assert.throws(() => assembleStyles(temp), /Unsupported style manifest format/);
    change(manifest => { manifest.output = 'other.css'; });
    assert.throws(() => assembleStyles(temp), /filename must stay styles.css/);
    for (const fragments of [[], null, 'base/000-example.css']) {
      change(manifest => { manifest.fragments = fragments; });
      assert.throws(() => assembleStyles(temp), /Expected ordered style fragments/);
    }
    change(() => {});
    const orphan = join(temp, 'src/styles/base/999-orphan.css');
    writeFileSync(orphan, '.orphan {}\n');
    assert.throws(() => assembleStyles(temp), /Unlisted or missing/);
    rmSync(orphan);
    rmSync(join(temp, 'src/styles', original.fragments[0]));
    assert.throws(() => assembleStyles(temp), /Unlisted or missing/);
  });
});

test('fragment boundary guard understands comments, quoted data URLs, nesting and escapes', () => {
  for (const text of [
    '/* } ] ) */ .thai::before { content: "ภาษาไทย } /*"; }\n',
    '.icon { background: url("data:image/svg+xml,<svg>{test}</svg>"); }',
    '@media (max-width: 440px) { .a:is(.b, [hidden]) { color: red; } }',
    '@keyframes pulse { 0% { opacity: 0; } 100% { opacity: 1; } }',
    '.escaped\\{name { content: "\\\""; --tokens: { nested: [one (two)]; }; }',
    '@charset "UTF-8";\n',
  ]) assert.doesNotThrow(() => checkStyleBoundary(text));
  for (const text of ['/* open', '.a { content: "open; }', '.a {', '.a { width: calc(1px; }', '.a[hidden { }', '.a,', '}']) {
    assert.throws(() => checkStyleBoundary(text, 'broken.css'), /broken\.css:/);
  }
  // Two individually incomplete pieces are rejected even if their joined CSS
  // would parse, so no selector, block, string or comment can cross files.
  withStylesFixture(temp => {
    const manifest = JSON.parse(readFileSync(join(temp, 'src/styles/manifest.json')));
    writeFileSync(join(temp, 'src/styles', manifest.fragments[0]), '.a {');
    writeFileSync(join(temp, 'src/styles', manifest.fragments[1]), ' color:red; }\n');
    assert.throws(() => assembleStyles(temp), /Unclosed delimiter/);
  });
});

test('invalid UTF-8 and incomplete source fail without overwriting a valid output', () => {
  withStylesFixture(temp => {
    const before = readFileSync(join(temp, 'styles.css'));
    const manifest = JSON.parse(readFileSync(join(temp, 'src/styles/manifest.json')));
    const fragment = join(temp, 'src/styles', manifest.fragments[0]);
    writeFileSync(fragment, Buffer.from([0xff, 0xfe, 0x7b, 0x7d]));
    assert.throws(() => writeStyles(temp), /encoded data was not valid/);
    assert.deepEqual(readFileSync(join(temp, 'styles.css')), before);
    writeFileSync(fragment, '.open {');
    assert.throws(() => writeStyles(temp), /Unclosed delimiter/);
    assert.deepEqual(readFileSync(join(temp, 'styles.css')), before);
  });
});

for (const relative of ['src', 'src/styles', 'src/styles/base', 'src/styles/base/000-foundation-and-drawers.css', 'src/styles/manifest.json']) {
  test(`reject style source symlink: ${relative}`, () => {
    withStylesFixture(temp => {
      const original = join(temp, relative), target = join(temp, 'link-target');
      renameSync(original, target);
      symlinkSync(target, original, /\.(css|json)$/.test(relative) ? 'file' : 'junction');
      assert.throws(() => assembleStyles(temp), /[Ss]tyle source.*symlinks are not supported/);
    });
  });
}

test('CLI build/check reject output symlinks without touching the target, including broken links', () => {
  withStylesFixture(temp => {
    const target = join(temp, 'untouched.css'), original = readFileSync(join(temp, 'styles.css'));
    renameSync(join(temp, 'styles.css'), target);
    symlinkSync(target, join(temp, 'styles.css'), 'file');
    assert.throws(() => checkStyles(temp), /Output symlinks/);
    assert.throws(() => writeStyles(temp), /Output symlinks/);
    mkdirSync(join(temp, 'scripts'));
    cpSync(join(stylesRoot, 'scripts/build-styles.mjs'), join(temp, 'scripts/build-styles.mjs'));
    for (const args of [[], ['--check']]) {
      const result = spawnSync(process.execPath, [join(temp, 'scripts/build-styles.mjs'), ...args], { encoding: 'utf8' });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Output symlinks are not supported/);
      assert.deepEqual(readFileSync(target), original);
    }
    rmSync(target);
    assert.throws(() => writeStyles(temp), /Output symlinks/);
  });
});

test('CLI build and check succeed on the fixture and reject unknown flags', () => {
  withStylesFixture(temp => {
    mkdirSync(join(temp, 'scripts'));
    cpSync(join(stylesRoot, 'scripts/build-styles.mjs'), join(temp, 'scripts/build-styles.mjs'));
    rmSync(join(temp, 'styles.css'));
    for (const args of [[], ['--check']]) {
      const result = spawnSync(process.execPath, [join(temp, 'scripts/build-styles.mjs'), ...args], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
    }
    assert.deepEqual(checkStyles(temp), checkStyles());
    const bad = spawnSync(process.execPath, [join(temp, 'scripts/build-styles.mjs'), '--unknown'], { encoding: 'utf8' });
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /Usage:/);
    rmSync(join(temp, 'styles.css'));
    mkdirSync(join(temp, 'styles.css'));
    assert.throws(() => writeStyles(temp), /Expected regular output file/);
  });
});
