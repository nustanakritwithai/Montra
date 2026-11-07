import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareClient } from './build-client.mjs';
import { root, sha256 } from './build-site.mjs';

// Uses the same locked TypeScript parser as server verification, never executes game code.
const require = createRequire(join(root, 'combat-verify/package.json'));
const ts = require('typescript');
function literalNames(node) {
  if (!node) return [];
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isConditionalExpression(node)) return [...literalNames(node.whenTrue), ...literalNames(node.whenFalse)];
  return [];
}
function walk(node, callback) { callback(node); ts.forEachChild(node, child => walk(child, callback)); }
export function inspectProtocol(clientText, serverText) {
  const client = ts.createSourceFile('main.js', clientText, ts.ScriptTarget.Latest, true);
  const server = ts.createSourceFile('MyRoom.ts', serverText, ts.ScriptTarget.Latest, true);
  const clientSends = new Set(), clientReceives = new Set(), serverSends = new Set(), serverReceives = new Set();
  let dynamicClientSends = 0, dynamicClientReceives = 0, dynamicServerSends = 0;
  walk(client, node => {
    if (!ts.isCallExpression(node)) return;
    const call = node.expression;
    const method = ts.isPropertyAccessExpression(call) ? call.name.text : '';
    const receiver = ts.isPropertyAccessExpression(call) ? call.expression.getText(client) : '';
    const wrapperCommand = ts.isIdentifier(call) && ['sendBagCommand', 'economySend'].includes(call.text);
    if (method === 'send' || method === 'onMessage') {
      assert(['room', 'joined', 'target'].includes(receiver), `Review unknown client connection alias: ${receiver}`);
    }
    if (method === 'send' || wrapperCommand) {
      const names = literalNames(node.arguments[0]);
      if (!names.length) dynamicClientSends++;
      names.forEach(name => clientSends.add(name));
    }
    if (method === 'onMessage') {
      const names = literalNames(node.arguments[0]);
      if (!names.length) dynamicClientReceives++;
      names.forEach(name => clientReceives.add(name));
    }
  });
  walk(server, node => {
    if (ts.isPropertyDeclaration(node) && node.name.getText(server) === 'messages' && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      for (const member of node.initializer.properties) {
        assert(member.name && (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)), 'Review computed/spread server message handler');
        serverReceives.add(member.name.text);
      }
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ['send', 'broadcast'].includes(node.expression.name.text)) {
      const names = literalNames(node.arguments[0]);
      if (!names.length) dynamicServerSends++;
      names.forEach(name => serverSends.add(name));
    }
  });
  assert(serverReceives.size > 0 && clientSends.size > 0 && clientReceives.size > 0 && serverSends.size > 0, 'Expected non-empty message inventories in both directions');
  const missing = [...clientSends].filter(name => !serverReceives.has(name));
  assert.deepEqual(missing, [], 'Client literal command has no server handler');
  return {
    clientSends: [...clientSends].sort(), serverReceives: [...serverReceives].sort(),
    clientReceives: [...clientReceives].sort(), serverSends: [...serverSends].sort(), dynamicClientSends, dynamicClientReceives, dynamicServerSends
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const inventory = inspectProtocol(prepareClient().toString('utf8'), readFileSync(join(root, 'deploy/combat/MyRoom.ts'), 'utf8'));
  const snapshot = {
    format: 2,
    scope: 'Static message-name inventory, schema and persistence-source fingerprints. Dynamic commands and payload semantics require integration tests.',
    ...inventory,
    protectedSources: Object.fromEntries(['MyRoomState.ts', 'CharacterStore.ts', 'AccountStore.ts', 'EconomyStore.ts'].map(file => [file, sha256(readFileSync(join(root, 'deploy/combat', file)))]))
  };
  const baseline = join(root, 'deploy/combat/verify/contract-baseline.json');
  if (process.argv.includes('--write')) {
    writeFileSync(baseline, `${JSON.stringify(snapshot, null, 2)}\n`);
    console.log('Wrote contract baseline. Review every change before committing.');
  } else {
    assert.deepEqual(snapshot, JSON.parse(readFileSync(baseline, 'utf8')), 'Contract baseline changed: review protocol/schema/save compatibility before explicitly refreshing');
    console.log(`PASS contract baseline: ${inventory.clientSends.length} static client commands, ${inventory.serverReceives.length} handlers, ${inventory.clientReceives.length} literal client listener names; dynamic client sends/receives and server sends: ${inventory.dynamicClientSends}/${inventory.dynamicClientReceives}/${inventory.dynamicServerSends} require integration coverage`);
  }
}
