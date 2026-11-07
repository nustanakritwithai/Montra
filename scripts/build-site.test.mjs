import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
    const expected = ['.nojekyll', 'account-entry.js', 'audio.js', 'index.html', 'main.js', 'styles.css',
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
      .split('\n').map(line => line.includes('src="./main.js?') ? line.replace('" defer', `&amp;rev=${revision}" defer`) : line).join('\n');
    assert.equal(readFileSync(join(a, 'index.html'), 'utf8'), legacyHtml);
    // Baseline from the previous workflow's cat part-*.b64 | base64 --decode.
    assert.equal(sha256(readFileSync(join(a, 'weapon-preview/lod2/crescent-blade-lod2.glb'))), '30b9b7b6d84e81ac032ca78ccfbbebd1c2b0956f8ece3247858e4c93bc23f9aa');
    assert.throws(() => buildSite(a, revision), /must be empty/);
    assert.throws(() => buildSite(join(temp, 'invalid'), 'not-a-commit'), /full Git commit SHA/);
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
