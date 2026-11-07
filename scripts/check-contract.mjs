import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, sha256 } from './build-site.mjs';

// Uses the same locked TypeScript parser as server verification, never executes game code.
const require = createRequire(join(root, 'combat-verify/package.json'));
const ts = require('typescript');
const parse = path => ts.createSourceFile(path, readFileSync(join(root, path), 'utf8'), ts.ScriptTarget.Latest, true);
const client = parse('main.js'), server = parse('deploy/combat/MyRoom.ts');
const clientSends = new Set(), clientReceives = new Set(), serverSends = new Set(), serverReceives = new Set();
let dynamicClientSends = 0;
function literalNames(node) {
  if (!node) return [];
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isConditionalExpression(node)) return [...literalNames(node.whenTrue), ...literalNames(node.whenFalse)];
  return [];
}
function walk(node, callback) { callback(node); ts.forEachChild(node, child => walk(child, callback)); }
walk(client, node => {
  if (!ts.isCallExpression(node)) return;
  const call = node.expression;
  const method = ts.isPropertyAccessExpression(call) ? call.name.text : '';
  const receiver = ts.isPropertyAccessExpression(call) ? call.expression.getText(client) : '';
  const bagCommand = ts.isIdentifier(call) && call.text === 'sendBagCommand';
  if ((receiver === 'room' && method === 'send') || bagCommand) {
    const names = literalNames(node.arguments[0]);
    if (!names.length) dynamicClientSends++;
    names.forEach(name => clientSends.add(name));
  }
  if (receiver === 'room' && method === 'onMessage') literalNames(node.arguments[0]).forEach(name => clientReceives.add(name));
});
walk(server, node => {
  if (ts.isPropertyDeclaration(node) && node.name.getText(server) === 'messages' && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
    for (const member of node.initializer.properties) {
      assert(member.name && (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)), 'Review computed/spread server message handler');
      serverReceives.add(member.name.text);
    }
  }
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ['send', 'broadcast'].includes(node.expression.name.text)) {
    literalNames(node.arguments[0]).forEach(name => serverSends.add(name));
  }
});
assert(serverReceives.size > 0 && clientSends.size > 0, 'No message declarations discovered');
const missing = [...clientSends].filter(name => !serverReceives.has(name));
assert.deepEqual(missing, [], 'Client literal command has no server handler');
const snapshot = {
  format: 1,
  scope: 'Static message-name inventory, schema and persistence-source fingerprints. Dynamic commands and payload semantics require integration tests.',
  clientSends: [...clientSends].sort(), serverReceives: [...serverReceives].sort(),
  clientReceives: [...clientReceives].sort(), serverSends: [...serverSends].sort(), dynamicClientSends,
  protectedSources: Object.fromEntries(['MyRoomState.ts', 'CharacterStore.ts', 'AccountStore.ts', 'EconomyStore.ts'].map(file => [file, sha256(readFileSync(join(root, 'deploy/combat', file)))]))
};
const baseline = join(root, 'deploy/combat/verify/contract-baseline.json');
if (process.argv.includes('--write')) {
  writeFileSync(baseline, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log('Wrote contract baseline. Review every change before committing.');
} else {
  assert.deepEqual(snapshot, JSON.parse(readFileSync(baseline, 'utf8')), 'Contract baseline changed: review protocol/schema/save compatibility before explicitly refreshing');
  console.log(`PASS contract baseline: ${clientSends.size} static client commands, ${serverReceives.size} handlers; ${dynamicClientSends} dynamic call sites require integration coverage`);
}
