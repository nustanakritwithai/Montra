import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectProtocol, protectedSourceFingerprint } from './check-contract.mjs';
const server = `class MyRoom { messages = { move: () => {}, buy: () => {}, use_item: () => {} }; reply() { client.send('state', {}); this.broadcast('notice', {}); client.send(event, payload); } }`;
const client = `room.send('move', {}); joined.send('move', {}); target?.send('buy', {});
  sendBagCommand('use_item', {}); economySend('buy', {}); joined.onMessage('state', () => {});
  room.onMessage('notice', () => {}); room.send(ready ? 'move' : 'buy', {});
  target.send(command, payload); room.send(kind + '_skill', {});
  joined.onMessage(type, () => {});
  // joined.onMessage('comment-only', () => {});`;

test('protected source fingerprint is portable across Git LF and Windows CRLF checkouts', () => {
  const linux = Buffer.from('export const schema = 1;\nexport const save = true;\n');
  const windows = Buffer.from('export const schema = 1;\r\nexport const save = true;\r\n');
  assert.equal(protectedSourceFingerprint(linux), protectedSourceFingerprint(windows));
  assert.notEqual(protectedSourceFingerprint(linux), protectedSourceFingerprint(Buffer.from('export const schema = 2;\nexport const save = true;\n')));
  assert.notEqual(protectedSourceFingerprint(linux), protectedSourceFingerprint(Buffer.from('export const schema = 1;\rexport const save = true;\n')));
  assert.notEqual(protectedSourceFingerprint(Buffer.from([0xff])), protectedSourceFingerprint(Buffer.from([0xfe])));
  assert.throws(() => protectedSourceFingerprint('not a Buffer'), /must be a Buffer/);
});

test('inventory includes joined listeners, room/target aliases, wrappers and conditional commands', () => {
  const inventory = inspectProtocol(client, server);
  assert.deepEqual(inventory.clientSends, ['buy', 'move', 'use_item']);
  assert.deepEqual(inventory.clientReceives, ['notice', 'state']);
  assert.deepEqual(inventory.serverSends, ['notice', 'state']);
  assert.equal(inventory.dynamicClientSends, 2);
  assert.equal(inventory.dynamicClientReceives, 1);
  assert.equal(inventory.dynamicServerSends, 1);
});
test('missing listener coverage cannot silently become an empty baseline', () => {
  assert.throws(() => inspectProtocol(`room.send('move', {});`, server), /both directions/);
});
test('unknown connection aliases and unhandled commands require review', () => {
  assert.throws(() => inspectProtocol(client + `\n newAlias.onMessage('state', () => {});`, server), /unknown client connection alias/);
  assert.throws(() => inspectProtocol(client + `\n joined.send('missing', {});`, server), /no server handler/);
});
test('computed server handlers are not silently omitted', () => {
  assert.throws(() => inspectProtocol(client, server.replace('move:', '[command]:')), /computed\/spread/);
});
