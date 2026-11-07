import { prepareClient } from './build-client.mjs';
import { checkStyles } from './build-styles.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function filesIn(directory, prefix = '') {
  return readdirSync(join(directory, prefix), { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)
    .flatMap(entry => entry.isDirectory() ? filesIn(directory, `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`]);
}
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// Deliberately copy, not transpile/minify: preserve script order and bytes.
export function buildSite(output, revision, source = root) {
  assert.match(revision, /^[a-f0-9]{40}$/, 'Build revision must be a full Git commit SHA');
  prepareClient(source); // Generate if absent; refuse stale or hand-edited output.
  checkStyles(source); // Preserve the exact ordered cascade and generated CSS.
  mkdirSync(output, { recursive: true });
  assert.equal(readdirSync(output).length, 0, 'Build output must be empty');
  for (const file of ['index.html', 'main.js', 'audio.js', 'account-entry.js', 'styles.css']) {
    cpSync(join(source, file), join(output, file));
  }
  const html = readFileSync(join(source, 'index.html'), 'utf8');
  const script = /(<script src="\.\/main\.js\?[^"\n]+)(" defer)/g;
  assert.equal([...html.matchAll(script)].length, 1, 'Expected exactly one versioned main.js script');
  writeFileSync(join(output, 'index.html'), html.replace(script, `$1&amp;rev=${revision}$2`));
  cpSync(join(source, 'assets'), join(output, 'assets'), { recursive: true });
  for (const file of ['assets/characters/thai-male.glb', 'assets/characters/thai-golden-spirit.glb', 'assets/weapons/crescent-blade-lod2.glb']) {
    assert(statSync(join(output, file)).size > 0, `Missing model: ${file}`);
  }
  const preview = 'weapon-preview/lod2';
  mkdirSync(join(output, preview), { recursive: true });
  cpSync(join(source, preview, 'index.html'), join(output, preview, 'index.html'));
  const chunks = readdirSync(join(source, preview, 'chunks')).filter(file => /^part-.*\.b64$/.test(file)).sort();
  assert(chunks.length > 0, 'Missing preview chunks');
  const encoded = chunks.map(file => readFileSync(join(source, preview, 'chunks', file), 'utf8')).join('').replace(/\s/g, '');
  const model = Buffer.from(encoded, 'base64');
  assert.equal(model.toString('base64'), encoded, 'Invalid preview base64');
  assert.equal(model.length, 6307460, 'Unexpected preview model size');
  writeFileSync(join(output, preview, 'crescent-blade-lod2.glb'), model);
  writeFileSync(join(output, '.nojekyll'), '');
  const files = filesIn(output).map(path => {
    const bytes = readFileSync(join(output, path));
    return { path, bytes: bytes.length, sha256: sha256(bytes) };
  });
  const manifest = { format: 1, revision, files };
  writeFileSync(join(output, 'build-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const revision = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const output = join(root, '_site');
  // Only this fixed, ignored build directory can be replaced by the CLI.
  rmSync(output, { recursive: true, force: true });
  const manifest = buildSite(output, revision);
  console.log(`Built ${manifest.files.length} static files for ${revision}`);
}
