import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectProtocol } from './check-contract.mjs';
const server = `class MyRoom { messages = { move: () => {}, buy: () => {}, use_item: () => {} }; reply() { client.send('state', {}); this.broadcast('notice', {}); } }`;
const client = `room.send('move', {}); joined.send('move', {}); target?.send('buy', {});
  sendBagCommand('use_item', {}); economySend('buy', {}); joined.onMessage('state', () => {});
  room.onMessage('notice', () => {}); room.send(ready ? 'move' : 'buy', {});
  target.send(command, payload); room.send(kind + '_skill', {});
  // joined.onMessage('comment-only', () => {});`;

test('inventory includes joined listeners, room/target aliases, wrappers and conditional commands', () => {
  const inventory = inspectProtocol(client, server);
  assert.deepEqual(inventory.clientSends, ['buy', 'move', 'use_item']);
  assert.deepEqual(inventory.clientReceives, ['notice', 'state']);
  assert.deepEqual(inventory.serverSends, ['notice', 'state']);
  assert.equal(inventory.dynamicClientSends, 2);
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
