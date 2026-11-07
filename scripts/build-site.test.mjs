import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildSite, filesIn, root, sha256 } from './build-site.mjs';

const revision = '71567e5a2242a2d2df14e3e425e9bb83f9966f7b';
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
