import assert from 'node:assert/strict';
import { constants, lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const stylesRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const categories = '(?:base|hud|combat|inventory|character|social|skills|world|audio|forge|market|icons)';
const fragmentPath = new RegExp(`^${categories}/[0-9]{3}-[a-z0-9-]+\\.css$`);

function sourceFiles(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const name = `${prefix}${entry.name}`;
    assert(!entry.isSymbolicLink(), `Style source symlinks are not supported: ${name}`);
    if (entry.isDirectory()) return sourceFiles(join(directory, entry.name), `${name}/`);
    assert(entry.isFile(), `Expected regular style source file: ${name}`);
    return name.endsWith('.css') ? [name] : [];
  });
}

// A structural boundary check, not a CSS syntax validator. In particular it does
// not reinterpret selectors, declarations or the browser's legacy error recovery.
// Each fragment must end outside a comment, string, selector, function or block.
export function checkStyleBoundary(text, filename = 'style fragment') {
  const stack = [];
  let quote = '', comment = false, pendingRule = false;
  const fail = message => assert.fail(`${filename}: ${message}`);
  for (let i = 0; i < text.length; i++) {
    const char = text[i], next = text[i + 1];
    if (comment) {
      if (char === '*' && next === '/') { comment = false; i++; }
      continue;
    }
    if (quote) {
      if (char === '\\') { i++; continue; }
      if (char === quote) quote = '';
      continue;
    }
    if (char === '/' && next === '*') { comment = true; i++; continue; }
    if (/\s/.test(char)) continue;
    if (char === '\\') { pendingRule = true; i++; continue; }
    if (char === '"' || char === "'") { quote = char; pendingRule = true; continue; }
    if ('{(['.includes(char)) { stack.push(char); pendingRule = true; continue; }
    if ('})]'.includes(char)) {
      const expected = { '}': '{', ')': '(', ']': '[' }[char];
      if (stack.pop() !== expected) fail(`Unbalanced delimiter ${char}`);
      if (char === '}' && stack.length === 0) pendingRule = false;
      continue;
    }
    if (char === ';' && stack.length === 0) { pendingRule = false; continue; }
    pendingRule = true;
  }
  if (comment) fail('Unterminated comment');
  if (quote) fail('Unterminated string');
  if (stack.length) fail('Unclosed delimiter');
  if (pendingRule) fail('Incomplete top-level rule at fragment boundary');
}

// Preserve source order and every original byte. No separators, rewriting,
// minification, @import, cascade layers or extra browser requests are introduced.
export function assembleStyles(source = stylesRoot) {
  for (const relative of ['src', 'src/styles']) {
    const entry = lstatSync(join(source, relative));
    assert(!entry.isSymbolicLink(), `Style source directory symlinks are not supported: ${relative}`);
    assert(entry.isDirectory(), `Expected style source directory: ${relative}`);
  }
  const directory = join(source, 'src/styles');
  const files = sourceFiles(directory);
  const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
  assert.equal(manifest.format, 1, 'Unsupported style manifest format');
  assert.equal(manifest.output, 'styles.css', 'The deployed stylesheet filename must stay styles.css');
  assert(Array.isArray(manifest.fragments) && manifest.fragments.length > 0, 'Expected ordered style fragments');
  assert.equal(new Set(manifest.fragments).size, manifest.fragments.length, 'Duplicate style fragment');
  manifest.fragments.forEach((file, index) => {
    assert(typeof file === 'string' && fragmentPath.test(file), `Invalid style fragment path: ${file}`);
    assert.equal(file.split('/')[1].slice(0, 3), String(index).padStart(3, '0'), 'Style fragment numbers must match manifest order');
  });
  assert.deepEqual(files.sort(), [...manifest.fragments].sort(), 'Unlisted or missing style source fragment');
  return Buffer.concat(manifest.fragments.map(file => {
    const bytes = readFileSync(join(directory, file));
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    checkStyleBoundary(text, file);
    return bytes;
  }));
}

function outputPath(source) {
  const output = join(source, 'styles.css');
  const entry = lstatSync(output, { throwIfNoEntry: false });
  assert(!entry?.isSymbolicLink(), 'Output symlinks are not supported: styles.css');
  assert(!entry || entry.isFile(), 'Expected regular output file: styles.css');
  return output;
}

export function writeStyles(source = stylesRoot) {
  const output = outputPath(source);
  const bytes = assembleStyles(source);
  writeFileSync(output, bytes, { flag: constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | (constants.O_NOFOLLOW || 0) });
  return bytes;
}

export function checkStyles(source = stylesRoot) {
  const output = outputPath(source);
  const bytes = assembleStyles(source);
  assert(bytes.equals(readFileSync(output)), 'Generated styles.css is stale. Run node scripts/build-styles.mjs and commit it with the source fragments.');
  return bytes;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === '--check'), 'Usage: node scripts/build-styles.mjs [--check]');
  const check = process.argv[2] === '--check';
  const bytes = check ? checkStyles() : writeStyles();
  console.log(`${check ? 'Verified' : 'Generated'} styles.css: ${bytes.length} bytes, raw ordered concatenation`);
}
