import assert from 'node:assert/strict';
import { constants, lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';

export const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const clientModules = ['src/client-modules/character-slot-storage.js', 'src/client-modules/world-math.js', 'src/client-modules/item-presentation.js', 'src/client-modules/voice-guidance.js', 'src/client-modules/pointer-gestures.js', 'src/client-modules/lighting-controller.js', 'src/client-modules/room-state-sync.js', 'src/client-modules/skill-motion.js', 'src/client-modules/drawer-controller.js'];
const categories = '(?:core|network|world|render|input|combat|ui|audio)';
const fragmentPath = new RegExp(`^${categories}/[0-9]{3}-[a-z0-9-]+\\.js$`);
function sourceFiles(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const name = `${prefix}${entry.name}`;
    assert(!entry.isSymbolicLink(), `Source symlinks are not supported: ${name}`);
    return entry.isDirectory() ? sourceFiles(join(directory, entry.name), `${name}/`) : name.endsWith('.js') ? [name] : [];
  });
}

// These are ordered source fragments, not modules. Preserve every byte, including
// comments, Unicode, whitespace and the original single IIFE. Never add separators.
export function assembleClient(source = clientRoot) {
  for (const relative of ['src', 'src/client', 'src/client-modules']) {
    const entry = lstatSync(join(source, relative));
    assert(!entry.isSymbolicLink(), `Source directory symlinks are not supported: ${relative}`);
    assert(entry.isDirectory(), `Expected client source directory: ${relative}`);
  }
  const moduleDirectory = join(source, 'src/client-modules');
  assert.deepEqual(sourceFiles(moduleDirectory).sort(), clientModules.map(file => file.slice('src/client-modules/'.length)).sort(), 'Unlisted or missing client module');
  for (const file of clientModules) new Script(readFileSync(join(source, file), 'utf8'), { filename: file });
  const directory = join(source, 'src/client');
  const files = sourceFiles(directory);
  const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
  assert.equal(manifest.format, 1, 'Unsupported client manifest format');
  assert.equal(manifest.output, 'main.js', 'The deployed client filename must stay main.js');
  assert(Array.isArray(manifest.fragments) && manifest.fragments.length >= 3, 'Expected ordered client fragments');
  assert.equal(new Set(manifest.fragments).size, manifest.fragments.length, 'Duplicate client fragment');
  manifest.fragments.forEach((file, index) => {
    assert(typeof file === 'string' && fragmentPath.test(file), `Invalid client fragment path: ${file}`);
    assert.equal(file.split('/')[1].slice(0, 3), String(index).padStart(3, '0'), 'Fragment numbers must match manifest order');
  });
  assert.deepEqual(files.sort(), [...manifest.fragments].sort(), 'Unlisted or missing client source fragment');
  const bytes = Buffer.concat(manifest.fragments.map(file => readFileSync(join(directory, file))));
  new Script(bytes.toString('utf8'), { filename: 'main.js' }); // Parse only; never execute game code.
  return bytes;
}

function outputPath(source) {
  const output = join(source, 'main.js');
  const entry = lstatSync(output, { throwIfNoEntry: false });
  assert(!entry?.isSymbolicLink(), 'Output symlinks are not supported: main.js');
  assert(!entry || entry.isFile(), 'Expected regular output file: main.js');
  return output;
}

export function writeClient(source = clientRoot) {
  const output = outputPath(source);
  const bytes = assembleClient(source);
  // O_NOFOLLOW also prevents following a link substituted between lstat and open
  // where the platform supports it. Existing links are rejected on every platform.
  writeFileSync(output, bytes, { flag: constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | (constants.O_NOFOLLOW || 0) });
  return bytes;
}

export function checkClient(source = clientRoot) {
  const output = outputPath(source);
  const bytes = assembleClient(source);
  assert(lstatSync(output, { throwIfNoEntry: false }), 'Generated main.js is missing. Run npm run prepare:client.');
  assert(bytes.equals(readFileSync(output)), 'Generated main.js is stale. Run npm run build:client after reviewing source changes.');
  return bytes;
}

// A clean checkout has no bundle. Once present, never silently repair stale or
// hand-edited output: rebuilding is an explicit developer action.
export function prepareClient(source = clientRoot) {
  const output = outputPath(source);
  if (!lstatSync(output, { throwIfNoEntry: false })) writeClient(source);
  return checkClient(source);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert(process.argv.length === 2 || (process.argv.length === 3 && ['--check', '--prepare'].includes(process.argv[2])), 'Usage: node scripts/build-client.mjs [--check|--prepare]');
  const mode = process.argv[2];
  const bytes = mode === '--check' ? checkClient() : mode === '--prepare' ? prepareClient() : writeClient();
  console.log(`${mode === '--check' ? 'Verified' : mode === '--prepare' ? 'Prepared' : 'Generated'} main.js: ${bytes.length} bytes, raw ordered concatenation`);
}
