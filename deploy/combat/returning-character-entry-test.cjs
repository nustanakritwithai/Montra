const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

const source = readFileSync(join(__dirname, '../../src/client/network/044-state-sync-and-connection.js'), 'utf8');
const connect = source.slice(source.indexOf('  let connectionPending'), source.indexOf('  let pointer'));

test('a failed initial character sync releases the slot so the same character can retry', async () => {
  const endpoint = 'https://example.test';
  const attempts = [], failures = [], errors = [];
  const button = { disabled: false };
  let activeRoom = null, successes = 0, closedSkills = 0;
  class Client {
    async joinOrCreate() {
      assert.equal(activeRoom, null, 'the previous room still holds the character');
      const onLeave = [];
      const sessionId = 'session-' + (attempts.length + 1);
      const joined = {
        sessionId,
        state: { players: new Map([[sessionId, {
          persistent: true, pathId: 'phutthaisawan', characterSlot: 2, equippedWeaponId: 'wp_twins_10',
        }]]) },
        onLeave(callback) { onLeave.push(callback); },
        onMessage() {}, onStateChange() {}, onError() {}, send() {},
        async leave() {
          activeRoom = null;
          onLeave.forEach(callback => callback());
        },
      };
      attempts.push(joined);
      activeRoom = joined;
      return joined;
    }
  }
  const context = {
    room: null, mode: 'demo', localId: 'demo', activeCharacterSlot: null, replacementSkillSession: null,
    ui: { onlineCount: {}, monsterStatus: {} },
    $: () => button,
    window: {
      Colyseus: { Client },
      MontraEntry: {
        session: () => 'test-session',
        failure: message => failures.push(message),
        success: () => { successes++; },
      },
    },
    console: { info() {}, warn() {}, error: (...args) => errors.push(args) },
    currentCharacterEndpoint: () => endpoint,
    createReplacementSkillSession: () => ({ close() { closedSkills++; } }),
    skillVfxTarget() {},
    cancelForgeAnimation() {}, finishEconomyPending() {}, clearCombatVfx() {},
    resetHomeClient() {}, resetCombatFeatures() {}, resetCraftQueue() {}, resetAdvancedMarket() {},
    clearChatHistory() {}, resetCentralMarket() {}, updateTradeBadge() {}, updatePartyBadge() {},
    resetCityProduction() {}, resetLootFeed() {}, clearResourceView() {},
    itemUseSequence: 0, clearFishing() {}, clearAvatars() {}, clearSummons() {},
    setTargetedSkill() {}, onlinePlayers: new Map(), enemy: { setEnabled() {} },
    syncFortification() {}, summonAvatars: new Map(), updateStatus() {},
    syncState(state) {
      const actor = state.players.get(context.localId);
      assert.equal(actor.equippedWeaponId, 'wp_twins_10');
      if (attempts.length === 1) throw new Error('initial hotbar sync failed');
      return true;
    },
    syncPoll: null,
    clearSyncPoll() { context.syncPoll = null; },
    setInterval: () => 1,
    resetGhostPot() {}, requestGhostPotState() {},
    closeDrawer() {}, toast() {},
    stopOnline() { assert.fail('a rejected join must not run the live disconnect callback'); },
    showDemo() {
      assert.equal(context.room, null);
      context.mode = 'demo';
      context.localId = 'demo';
      context.activeCharacterSlot = null;
    },
  };
  const enter = runInNewContext(connect + '\nconnectOnline', context);
  await enter(endpoint, 2);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /initial hotbar sync failed/);
  assert.equal(errors.length, 1);
  assert.equal(successes, 0);
  assert.equal(activeRoom, null);
  assert.equal(context.room, null);
  assert.equal(context.replacementSkillSession, null);
  assert.equal(context.mode, 'demo');
  assert.equal(button.disabled, false);
  assert.equal(closedSkills, 1);

  await enter(endpoint, 2);
  assert.equal(errors.length, 1);
  assert.equal(attempts.length, 2);
  assert.equal(context.room, attempts[1]);
  assert.equal(context.activeCharacterSlot, 2);
  assert.equal(context.mode, 'live');
  assert.equal(successes, 1);
});
