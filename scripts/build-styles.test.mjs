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
  assert.equal(bytes.length, 396940);
  assert.equal(hash(bytes), 'e8a5b9199653a3383c2d343f66c2db198b25c9ceb9fbc4d90a2a51890fc93a99');
  // Retain historical extraction evidence, pin only intentionally changed sources.
  const reviewedStyles = new Map([{"path":"base/000-foundation-and-drawers.css","bytes":11659,"sha256":"09fceca6b97e1153d9a5ef82d2ef15f21f9ccc8f7a0770f7150402bf1b3634b4"},{"path": "hud/019-vital-orb-resources-and-chat.css", "bytes": 5832, "sha256": "71477a110f30679c2e281eb5e825ab4557d21ee02eebbb49c2a6c16b1a500b7a"}, {"path": "forge/025-artisan-crafting-and-effects.css", "bytes": 25478, "sha256": "15f13beabd9f3e9c788894a53b12e29ba00727d606919900db3f184dbfcb7852"}, {"path": "market/045-world-market.css", "bytes": 5767, "sha256": "6202004601ad13fcb19d476017e489cd971bc5ac523d9c74257aac0b43af50a0"}, {"path": "audio/044-voice-guidance.css", "bytes": 4615, "sha256": "726eb14d122c28f2a2440119b966dafcf2b2074e2766151e3f6c76382aadcad7"}, {"path": "hud/022-chat-compose-and-vitals.css", "bytes": 6469, "sha256": "bba63466dafb8c940fffdc5f8af9795a55fba1a22f5359f78ac2e1639cf231bf"}, {"path": "hud/038-map-shortcuts-and-quick-skills.css", "bytes": 11530, "sha256": "a76cab8fedc528abc19d8902960e214fac759229825fb4ec5bebd177939bcfd1"}, {"path": "skills/015-brightness-and-skill-graph.css", "bytes": 13023, "sha256": "ed7efc3b97b3154edd5257b759fbce481da15930e2aa5d431f43e21a90cf1eb8"}, {"path":"social/012-guild-panels.css","bytes":7853,"sha256":"a46b20d55cc3a57297af6d5ec25122aaa705dadb27915c52ba506a132856afcf"}].map(entry => [entry.path, entry]));
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
