import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildSite, filesIn, root, sha256 } from './build-site.mjs';
import { assembleClient } from './build-client.mjs';
import { spawnSync } from 'node:child_process';

const revision = '71567e5a2242a2d2df14e3e425e9bb83f9966f7b';
test('static packaging rejects stale generated CSS before writing output', () => {
  const temp = mkdtempSync(join(tmpdir(), 'montra-stale-styles-'));
  try {
    const source = join(temp, 'source'), output = join(temp, 'output');
    cpSync(join(root, 'src'), join(source, 'src'), { recursive: true });
    writeFileSync(join(source, 'main.js'), assembleClient());
    writeFileSync(join(source, 'styles.css'), `${readFileSync(join(root, 'styles.css'), 'utf8')}\n/* stale */\n`);
    assert.throws(() => buildSite(output, revision, source), /styles\.css/);
    assert.equal(existsSync(output), false, 'stale CSS must fail before any publication files are written');
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('two builds are byte-identical and preserve the existing Pages payload', () => {
  const temp = mkdtempSync(join(tmpdir(), 'montra-build-'));
  try {
    const a = join(temp, 'a'), b = join(temp, 'b');
    const manifest = buildSite(a, revision);
    assert.deepEqual(buildSite(b, revision), manifest);
    assert.deepEqual(filesIn(a), filesIn(b));
    for (const path of filesIn(a)) assert.deepEqual(readFileSync(join(a, path)), readFileSync(join(b, path)), path);
    const expected = ['.nojekyll', 'account-entry.js', 'audio.js', 'index.html', 'main.js', 'styles.css', 'src/client-modules/character-slot-storage.js', 'src/client-modules/world-math.js', 'src/client-modules/item-presentation.js', 'src/client-modules/voice-guidance.js', 'src/client-modules/pointer-gestures.js', 'src/client-modules/lighting-controller.js', 'src/client-modules/room-state-sync.js', 'src/client-modules/skill-motion.js', 'src/client-modules/drawer-controller.js', 'src/client-modules/join-message-bootstrap.js',
      ...filesIn(join(root, 'assets')).map(path => `assets/${path}`),
      'weapon-preview/lod2/index.html', 'weapon-preview/lod2/crescent-blade-lod2.glb'].sort();
    assert.deepEqual(manifest.files.map(file => file.path).sort(), expected);
    for (const file of manifest.files) {
      const bytes = readFileSync(join(a, file.path));
      assert.equal(bytes.length, file.bytes);
      assert.equal(sha256(bytes), file.sha256);
      if (!['.nojekyll', 'index.html', 'weapon-preview/lod2/crescent-blade-lod2.glb'].includes(file.path)) {
        assert.deepEqual(bytes, readFileSync(join(root, file.path)), `${file.path} must not be transformed`);
      }
    }
    const legacyHtml = readFileSync(join(root, 'index.html'), 'utf8')
      .split('\n').map(line => (line.includes('src="./main.js?') || line.includes('src="./src/client-modules/')) ? line.replace('" defer', `&amp;rev=${revision}" defer`) : line).join('\n');
    assert.equal(readFileSync(join(a, 'index.html'), 'utf8'), legacyHtml);
    const sourceHtml = readFileSync(join(root, 'index.html'), 'utf8');
    const builtHtml = readFileSync(join(a, 'index.html'), 'utf8');
    const urls = [...builtHtml.matchAll(/<script src="([^"]+)"/g)].map(match => match[1]);
    for (const path of ['./main.js?', './src/client-modules/character-slot-storage.js?', './src/client-modules/world-math.js?', './src/client-modules/item-presentation.js?', './src/client-modules/voice-guidance.js?', './src/client-modules/pointer-gestures.js?', './src/client-modules/lighting-controller.js?', './src/client-modules/room-state-sync.js?', './src/client-modules/skill-motion.js?', './src/client-modules/drawer-controller.js?', './src/client-modules/join-message-bootstrap.js?']) {
      const matching = urls.filter(url => url.startsWith(path));
      assert.equal(matching.length, 1);
      const params = new URL(matching[0].replaceAll('&amp;', '&'), 'https://example.invalid/').searchParams;
      assert.deepEqual(params.getAll('rev'), [revision]);
      assert.equal(params.getAll('v').length, 1);
    }
    // Rebuilding for a different commit reads pristine source, never appends revisions.
    const nextRevision = 'a'.repeat(40);
    const c = join(temp, 'c');
    buildSite(c, nextRevision);
    assert.equal(readFileSync(join(c, 'index.html'), 'utf8'), builtHtml.replaceAll(revision, nextRevision));
    assert.equal(readFileSync(join(root, 'index.html'), 'utf8'), sourceHtml);
    // Baseline from the previous workflow's cat part-*.b64 | base64 --decode.
    assert.equal(sha256(readFileSync(join(a, 'weapon-preview/lod2/crescent-blade-lod2.glb'))), '30b9b7b6d84e81ac032ca78ccfbbebd1c2b0956f8ece3247858e4c93bc23f9aa');
    assert.throws(() => buildSite(a, revision), /must be empty/);
    assert.throws(() => buildSite(join(temp, 'invalid'), 'not-a-commit'), /full Git commit SHA/);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});


test('packaging rejects absent, duplicate or late module script loading', () => {
  const temp = mkdtempSync(join(tmpdir(), 'montra-load-order-'));
  try {
    const source = join(temp, 'source');
    mkdirSync(source);
    for (const file of ['src', 'index.html', 'main.js', 'audio.js', 'account-entry.js', 'styles.css']) {
      cpSync(join(root, file), join(source, file), { recursive: true });
    }
    const html = readFileSync(join(source, 'index.html'), 'utf8');
    const lines = ['character-slot-storage', 'world-math', 'item-presentation', 'voice-guidance', 'pointer-gestures', 'lighting-controller', 'room-state-sync', 'skill-motion', 'drawer-controller', 'join-message-bootstrap'].map(name => html.split('\n').find(line => line.includes(`./src/client-modules/${name}.js?`)));
    const variants = lines.flatMap(line => [html.replace(line, ''), html.replace(line, line + '\n' + line),
      html.replace(line, '').replace('</body>', line + '\n</body>'),
      html.replace(line, line.replace(' defer', ' async')),
      html.replace(line, line.replace(' defer', ' defer async')),
      html.replace(line, line.replace(' defer', ' defer type="module"')),
      html.replace(line, line.replace('?v=1', '?v=1&amp;rev=old'))]);
    const mainLine = html.split('\n').find(line => line.includes('./main.js?'));
    for (const line of [...lines, mainLine]) {
      for (const attribute of ['async', 'ASYNC', 'aSyNc', 'type="module"', 'TYPE="module"', 'tYpE="MoDuLe"']) {
        variants.push(html.replace(line, line.replace(' defer', ` defer ${attribute}`)));
      }
    }
    variants.push(html.replace('./main.js?v=', './main.js?rev=old&amp;v='));
    for (let a = 0; a < lines.length; a++) for (let b = a + 1; b < lines.length; b++) {
      variants.push(html.replace(lines[a], 'MODULE_SWAP').replace(lines[b], lines[a]).replace('MODULE_SWAP', lines[b]));
    }
    variants.forEach((value, index) => {
      writeFileSync(join(source, 'index.html'), value);
      assert.throws(() => buildSite(join(temp, `out-${index}`), revision, source), /client module|modules must load|generated revision|deferred classic scripts/);
    });
  } finally { rmSync(temp, { recursive: true, force: true }); }
});


test('packaging publishes only approved module files, never incidental or unrecognized files', () => {
  const temp = mkdtempSync(join(tmpdir(), 'montra-module-allowlist-'));
  try {
    const source = join(temp, 'source');
    mkdirSync(source);
    for (const file of ['src', 'index.html', 'main.js', 'audio.js', 'account-entry.js', 'styles.css', 'assets', 'weapon-preview']) {
      cpSync(join(root, file), join(source, file), { recursive: true });
    }
    const modules = join(source, 'src/client-modules');
    mkdirSync(join(modules, 'notes'));
    for (const file of ['README.md', 'private.json', 'unrecognized.mjs', 'notes/scratch.txt']) {
      writeFileSync(join(modules, file), 'Not a public build input');
    }
    const output = join(temp, 'output');
    const manifest = buildSite(output, revision, source);
    assert.deepEqual(filesIn(join(output, 'src/client-modules')), ['character-slot-storage.js', 'drawer-controller.js', 'item-presentation.js', 'join-message-bootstrap.js', 'lighting-controller.js', 'pointer-gestures.js', 'room-state-sync.js', 'skill-motion.js', 'voice-guidance.js', 'world-math.js']);
    assert.deepEqual(manifest.files.filter(file => file.path.startsWith('src/client-modules/')).map(file => file.path),
      ['src/client-modules/character-slot-storage.js', 'src/client-modules/drawer-controller.js', 'src/client-modules/item-presentation.js', 'src/client-modules/join-message-bootstrap.js', 'src/client-modules/lighting-controller.js', 'src/client-modules/pointer-gestures.js', 'src/client-modules/room-state-sync.js', 'src/client-modules/skill-motion.js', 'src/client-modules/voice-guidance.js', 'src/client-modules/world-math.js']);
    writeFileSync(join(modules, 'unrecognized.js'), '');
    assert.throws(() => buildSite(join(temp, 'rejected'), revision, source), /Unlisted or missing client module/);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('clean-checkout static CLI generates the same payload and rejects a stale bundle', () => {
  const temp = mkdtempSync(join(tmpdir(), 'montra-clean-build-'));
  try {
    for (const path of ['scripts', 'src', 'assets', 'weapon-preview', 'index.html', 'audio.js', 'account-entry.js', 'styles.css', 'package.json']) {
      cpSync(join(root, path), join(temp, path), { recursive: true });
    }
    assert.equal(existsSync(join(temp, 'main.js')), false);
    const run = () => spawnSync(process.execPath, ['scripts/build-site.mjs'], {
      cwd: temp, encoding: 'utf8', env: { ...process.env, GITHUB_SHA: revision }
    });
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(readFileSync(join(temp, 'main.js')), assembleClient());
    const expected = buildSite(join(temp, 'expected'), revision);
    assert.deepEqual(JSON.parse(readFileSync(join(temp, '_site/build-manifest.json'))), expected);
    for (const file of filesIn(join(temp, '_site'))) {
      assert.deepEqual(readFileSync(join(temp, '_site', file)), readFileSync(join(temp, 'expected', file)), file);
    }
    writeFileSync(join(temp, 'main.js'), 'stale');
    const failed = run();
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, /main.js is stale/);
    assert.equal(readFileSync(join(temp, 'main.js'), 'utf8'), 'stale');
    assert.equal(existsSync(join(temp, '_site')), false, 'stale client must fail before publication');
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
