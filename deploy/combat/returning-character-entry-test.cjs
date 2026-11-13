const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

const source = readFileSync(join(__dirname, '../../src/client/network/044-state-sync-and-connection.js'), 'utf8');
const connect = source.slice(source.indexOf('  let connectionPending'), source.indexOf('  let pointer'));

const endpoint = 'https://example.test';
const CloseCode = { GOING_AWAY: 1001, NO_STATUS_RECEIVED: 1005, ABNORMAL_CLOSURE: 1006,
  CONSENTED: 4000, SERVER_SHUTDOWN: 4001, MAY_TRY_RECONNECT: 4010 };
class MatchMakeError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}
function createEntry({initialSyncFails = false, joinErrors = [], colyseus, endpoint: server = endpoint, accountSession = 'test-session', realTimers = false} = {}) {
  const attempts = [], failures = [], errors = [], requests = [], timers = [];
  const button = { disabled: false };
  const elements = {connectOnline:button, game:{}, accountEntry:{}, connectionRecovery:{hidden:true}, connectionRecoveryStatus:{}};
  let activeRoom = null, successes = 0, closedSkills = 0, opened = 0, now = 1;
  let session = accountSession, characterId = 'original-character', hangAtHandshake = false;
  let closedSockets = 0;
  class Client {
    createRoom() {
      return {connection:{close() { closedSockets++; }}};
    }
    async joinOrCreate(name, options) {
      assert.equal(name, 'my_room');
      requests.push(options);
      const error = joinErrors.shift();
      if (error) throw error;
      if (hangAtHandshake) {
        this.createRoom();
        return new Promise(() => {});
      }
      assert.equal(activeRoom, null, 'the previous room still holds the character');
      const onLeave = [];
      const sessionId = 'session-' + (attempts.length + 1);
      const joined = {
        sessionId,
        reconnection: {enabled:true},
        connection: {isOpen:true},
        state: { players: new Map([[sessionId, {
          persistent: true, characterId, pathId: 'phutthaisawan', characterSlot: 2, equippedWeaponId: 'wp_twins_10',
        }]]) },
        onLeave(callback) { onLeave.push(callback); },
        onMessage() {}, onStateChange() {}, onError() {}, send() {},
        drop(code) {
          activeRoom = null;
          joined.connection.isOpen = false;
          onLeave.forEach(callback => callback(code));
        },
        async leave() { joined.drop(CloseCode.CONSENTED); },
      };
      attempts.push(joined);
      activeRoom = joined;
      return joined;
    }
  }
  const context = {
    room: null, mode: 'demo', localId: 'demo', activeCharacterSlot: null, replacementSkillSession: null,
    ui: { onlineCount: {}, monsterStatus: {} },
    $: id => elements[id],
    window: {
      Colyseus: colyseus ?? { Client, CloseCode, MatchMakeError, ErrorCode: { MATCHMAKE_EXPIRED: 524 } },
      MontraEntry: {
        session: () => session,
        open: () => { opened++; },
        failure: message => failures.push(message),
        success: () => { successes++; elements.game.inert = false; },
      },
    },
    performance: realTimers ? performance : {now: () => now},
    location: new URL(server),
    console: { info() {}, warn() {}, error: (...args) => errors.push(args) },
    fetch, AbortController,
    currentCharacterEndpoint: () => server,
    createReplacementSkillSession: () => ({ close() { closedSkills++; } }),
    skillVfxTarget() {},
    cancelForgeAnimation() {}, finishEconomyPending() {}, clearCombatVfx() {},
    resetHomeClient() {}, resetCombatFeatures() {}, resetCraftQueue() {}, resetAdvancedMarket() {},
    clearChatHistory() {}, resetCentralMarket() {}, updateTradeBadge() {}, updatePartyBadge() {},
    renderGuild() {}, drawerActive: null,
    territoryState: null, activeMapId: 'ritual_village',
    syncGateVisual() {}, syncCastleRings() {}, syncWarQuartermaster() {}, checkTerritoryWarEvents() {},
    resetCityProduction() {}, resetLootFeed() {}, clearResourceView() {},
    itemUseSequence: 0, clearFishing() {}, clearAvatars() {}, clearSummons() {},
    setTargetedSkill() {}, onlinePlayers: new Map(), enemy: { setEnabled() {} },
    syncFortification() {}, summonAvatars: new Map(), updateStatus() {},
    syncState(state) {
      const actor = state.players.get(context.localId);
      assert.ok(actor.persistent);
      if (initialSyncFails && attempts.length === 1) throw new Error('initial hotbar sync failed');
      return true;
    },
    syncPoll: null,
    clearSyncPoll() { context.syncPoll = null; },
    setInterval: () => 1,
    setTimeout: realTimers ? setTimeout : (callback, ms) => {
      const timer = {callback, ms};
      timers.push(timer);
      return timer;
    },
    clearTimeout: realTimers ? clearTimeout : timer => {
      const index = timers.indexOf(timer);
      if (index >= 0) timers.splice(index, 1);
    },
    resetGhostPot() {}, requestGhostPotState() {},
    closeDrawer() {}, toast() {},
    stopOnline(message) {
      if (context.mode === 'live') context.showDemo();
      context.window.MontraEntry.open();
      context.window.MontraEntry.failure(message);
    },
    showDemo() {
      assert.equal(context.room, null);
      context.mode = 'demo';
      context.localId = 'demo';
      context.activeCharacterSlot = null;
    },
  };
  const actions = runInNewContext(connect + '\n({connectOnline,cancelOnlineRecovery})', context);
  async function nextRetry(expectedMs) {
    const index = timers.findIndex(timer => timer.ms === expectedMs);
    assert.notEqual(index, -1, 'expected a timer after ' + expectedMs + ' ms');
    timers.splice(index, 1)[0].callback();
    await new Promise(setImmediate);
  }
  return {
    enter: (slot = 2, setup) => actions.connectOnline(server, slot, null, setup), nextRetry, actions, context, elements,
    attempts, requests, failures, errors, timers, button,
    revoke: () => { session = null; },
    replaceCharacter: () => { characterId = 'replacement-character'; },
    stallHandshake: () => { hangAtHandshake = true; },
    advance: ms => { now += ms; },
    get activeRoom() { return activeRoom; },
    get successes() { return successes; },
    get opened() { return opened; },
    get closedSockets() { return closedSockets; },
    get closedSkills() { return closedSkills; },
  };
}

test('a failed initial character sync releases the slot so the same character can retry', async () => {
  const entry = createEntry({initialSyncFails:true});
  const {attempts, failures, errors, context, button} = entry;
  await entry.enter();
  assert.equal(failures.length, 1);
  assert.match(failures[0], /initial hotbar sync failed/);
  assert.equal(errors.length, 1);
  assert.equal(entry.successes, 0);
  assert.equal(entry.activeRoom, null);
  assert.equal(context.room, null);
  assert.equal(context.replacementSkillSession, null);
  assert.equal(context.mode, 'demo');
  assert.equal(button.disabled, false);
  assert.equal(entry.closedSkills, 1);

  await entry.enter();
  assert.equal(errors.length, 1);
  assert.equal(attempts.length, 2);
  assert.equal(context.room, attempts[1]);
  assert.equal(context.activeCharacterSlot, 2);
  assert.equal(context.mode, 'live');
  assert.equal(entry.successes, 1);
});

test('a dropped socket re-enters the same save, waiting for the old account lease', async () => {
  const joinErrors = [];
  const entry = createEntry({joinErrors});
  await entry.enter();
  const first = entry.activeRoom;
  assert.equal(first.reconnection.enabled, false);
  first.drop(CloseCode.ABNORMAL_CLOSURE);
  assert.equal(entry.context.room, null);
  assert.equal(entry.elements.game.inert, true);
  assert.equal(entry.elements.connectionRecovery.hidden, false);
  joinErrors.push(new MatchMakeError('character_already_online', 523));
  await entry.nextRetry(350);
  assert.equal(entry.opened, 0);
  await entry.nextRetry(900);
  assert.equal(entry.context.room, entry.activeRoom);
  assert.notEqual(entry.activeRoom, first);
  assert.equal(entry.context.activeCharacterSlot, 2);
  assert.equal(entry.successes, 2);
  assert.equal(entry.elements.game.inert, false);
  assert.equal(entry.elements.connectionRecovery.hidden, true);
  assert.deepEqual(entry.failures, []);
  for (const options of entry.requests) {
    assert.equal(options.characterSlot, 2);
    assert.equal(options.accountSession, 'test-session');
    assert.ok(!Object.hasOwn(options, 'characterSetup'));
  }
});

test('a returning character retries an abnormal close during initial matchmaking', async () => {
  const entry = createEntry({joinErrors:[new MatchMakeError('WebSocket closed', 1006)]});
  const entered = entry.enter();
  await new Promise(setImmediate);
  await entry.nextRetry(350);
  await entered;
  assert.equal(entry.successes, 1);
  assert.equal(entry.opened, 0);
  assert.deepEqual(entry.failures, []);
});

test('several short-lived rooms share the same retry budget', async () => {
  const entry = createEntry();
  await entry.enter();
  for (const delay of [350, 900, 1800, 3000]) {
    entry.activeRoom.drop(CloseCode.ABNORMAL_CLOSURE);
    await entry.nextRetry(delay);
  }
  entry.activeRoom.drop(CloseCode.ABNORMAL_CLOSURE);
  await new Promise(setImmediate);
  assert.equal(entry.timers.length, 0);
  assert.equal(entry.opened, 1);
  assert.equal(entry.elements.connectionRecovery.hidden, true);
});

test('consented closes, cancelled recovery, and revoked credentials stop retrying', async () => {
  const entry = createEntry();
  await entry.enter();
  entry.activeRoom.drop(CloseCode.CONSENTED);
  assert.equal(entry.timers.length, 0);
  assert.equal(entry.opened, 1);

  await entry.enter();
  entry.activeRoom.drop(CloseCode.ABNORMAL_CLOSURE);
  entry.actions.cancelOnlineRecovery();
  await entry.nextRetry(350);
  assert.equal(entry.requests.length, 2);
  assert.equal(entry.elements.connectionRecovery.hidden, true);

  await entry.enter();
  entry.activeRoom.drop(CloseCode.ABNORMAL_CLOSURE);
  entry.revoke();
  await entry.nextRetry(350);
  assert.equal(entry.requests.length, 3);
  assert.match(entry.failures.at(-1), /เซสชันหมดอายุ/);
});

test('a replaced save in the same slot needs an explicit selection', async () => {
  const entry = createEntry();
  await entry.enter();
  entry.activeRoom.drop(CloseCode.ABNORMAL_CLOSURE);
  entry.replaceCharacter();
  await entry.nextRetry(350);
  assert.equal(entry.activeRoom, null);
  assert.equal(entry.successes, 1);
  assert.equal(entry.opened, 1);
  assert.equal(entry.timers.length, 0);
});

test('a stalled WebSocket handshake is closed and recovery stops at the deadline', async () => {
  const entry = createEntry();
  await entry.enter();
  entry.stallHandshake();
  entry.activeRoom.drop(CloseCode.ABNORMAL_CLOSURE);
  await entry.nextRetry(350);
  assert.equal(entry.requests.length, 2);
  await entry.nextRetry(8000);
  assert.equal(entry.closedSockets, 1);
  await entry.nextRetry(900);
  assert.equal(entry.requests.length, 3);
  await entry.nextRetry(18000);
  assert.equal(entry.closedSockets, 2);
  assert.equal(entry.elements.connectionRecovery.hidden, true);
  assert.equal(entry.elements.accountEntry.inert, false);
  assert.equal(entry.button.disabled, false);
  assert.equal(entry.opened, 1);
  assert.equal(entry.timers.length, 0);
});

test('cancelling recovery closes a handshake immediately', async () => {
  const entry = createEntry();
  await entry.enter();
  entry.stallHandshake();
  entry.activeRoom.drop(CloseCode.ABNORMAL_CLOSURE);
  await entry.nextRetry(350);
  entry.actions.cancelOnlineRecovery();
  await new Promise(setImmediate);
  assert.equal(entry.closedSockets, 1);
  assert.equal(entry.requests.length, 2);
  assert.equal(entry.elements.accountEntry.inert, false);
  assert.equal(entry.timers.length, 0);
});

module.exports = {createEntry};
