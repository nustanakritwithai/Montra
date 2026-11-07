// Test-only loader. Run the shipped classic module and its exact shell wiring,
// not a duplicate implementation or a snapshot of the fixture's mutable state.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const root = resolve(__dirname, '../../..');
const moduleSource = readFileSync(resolve(root, 'src/client-modules/item-presentation.js'), 'utf8');
const core = readFileSync(resolve(root, 'src/client/core/001-storage-and-dom.js'), 'utf8');
const start = core.indexOf('  const itemPresentation = '), end = core.indexOf('  const ui =', start);
assert(start >= 0 && end > start, 'Explicit item module wiring must precede first DOM initialization');
const wiring = core.slice(start, end);
const prelude = moduleSource + '\n' + wiring;
function install(context) { vm.runInContext(prelude, context); }
function load(context) { vm.createContext(context); install(context); return vm.runInContext('itemPresentation', context); }
module.exports = { moduleSource, wiring, prelude, install, load };
