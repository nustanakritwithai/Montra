import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash, randomBytes} from 'node:crypto';
import {cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {inspectMonsterRewardRollback} from './check-monster-reward-rollback.mjs';
import {Client} from '@colyseus/sdk';
import {armTestDeadline, assertTestChildRunning, joinTestRoom, leaveTestRoom, stopTestChild} from './prototype-test-process.mjs';

armTestDeadline(90000);
const crashDuringReward = process.argv.includes('--crash');
const loader = import.meta.resolve('tsx');
const entry = fileURLToPath(new URL('./src/rooms/isolated-class-test-server.ts', import.meta.url));
const swordTree = {
  school: 'phutthaisawan',
  learned: ['footwork', 'guard', 'sweep', 'rhythm', 'flowing_blades'],
  cooldowns: {},
  training: {strikes: 50, blocks: 3, finishes: 0},
  loadouts: {phutthaisawan: ['flowing_blades', null, null], sritrairat: [null, null, null], atamat: [null, null, null], chumphon: [null, null, null]},
};
const hotbarSlots = [{kind: 'advanced', id: 'flowing_blades'}, null, null, null];
const mixedSkillLoadouts = {version: 1, loadouts: {'phutthaisawan:phutthaisawan': hotbarSlots}};
const statAllocations = {hp: 4, atk: 7, def: 2, magicAtk: 0, magicDef: 0, stamina: 1};

async function until(check, label, timeoutMs) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const result = check();
    if (result) return result;
    await delay(25);
  }
  throw Error('Timeout: ' + label);
}

async function readSession(base, data, token, mode, rewardToken, earnReward) {
  const env = {
    SystemRoot: process.env.SystemRoot, Path: process.env.Path, HOME: base, TMPDIR: base, TEMP: base, TMP: base,
    NODE_ENV: 'test', MONTRA_TEST_SANDBOX: base, MONTRA_CHARACTER_DIR: data, MONTRA_ACCOUNTS_REQUIRED: '0',
    MONTRA_ECONOMY_ENABLED: mode, MONTRA_WORLD_EXPANSION: '0', MONTRA_MIXED_SKILLS: '1',
    MONTRA_HUNT_EVENTS: '0', MONTRA_DIRECTOR_ENABLED: '0', MONTRA_DIRECTOR_PERSIST: '0',
    MONTRA_TEST_CRASH_AFTER_REWARD_PREPARE: earnReward && crashDuringReward ? '1' : '0',
  };
  const child = spawn(process.execPath, ['--import', loader, entry], {
    cwd: base, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '', spawnError, room;
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  child.on('error', error => { spawnError = error; });
  try {
    const ready = await until(() => {
      assertTestChildRunning(child, spawnError, output);
      return output.match(/CLASS_TEST_PORT=(\d+)/);
    }, 'server readiness', 20000);
    const sdk = new Client('http://127.0.0.1:' + ready[1]);
    room = await joinTestRoom(() => sdk.create('my_room', {guestToken: token}), 12000);
    room.reconnection.enabled = false;
    const player = await until(() => {
      const state = room.state?.players?.get(room.sessionId);
      return state?.persistent && state.skillHotbarData && state.swordTreeData ? state : null;
    }, 'persistent character and skill state', 12000);
    const sword = JSON.parse(player.swordTreeData);
    const hotbar = JSON.parse(player.skillHotbarData);
    assert.equal(player.skillHotbarVersion, 1);
    assert.equal(player.level, 95);
    assert.equal(player.experience, 1234);
    assert.deepEqual(hotbar.slots, hotbarSlots);
    assert.deepEqual((sword.tree ?? sword).learned, swordTree.learned);
    const observed = {id: player.characterId, level: player.level, xp: player.experience, statPoints: player.statPoints};
    await leaveTestRoom(room, 6000);
    room = undefined;

    room = await joinTestRoom(() => sdk.create('my_room', {guestToken: rewardToken}), 12000);
    room.reconnection.enabled = false;
    const awards = [], hits = [];
    room.onMessage('experience_gained', message => awards.push(message));
    room.onMessage('combat_hit', message => hits.push(message));
    const fighter = await until(() => {
      const state = room.state?.players?.get(room.sessionId);
      return state?.persistent ? state : null;
    }, 'persistent reward character', 12000);
    if (earnReward) {
      assert.equal(fighter.experience, 0);
      room.send('attack', {targetId: 'possessed-1'});
      if (crashDuringReward) {
        await until(() => {
          assertTestChildRunning(child, spawnError, output);
          return output.includes('MONTRA_TEST_REWARD_PREPARED');
        }, 'real kill reward prepared', 15000);
        assert.equal(awards.length, 0);
        assert.equal(child.kill('SIGKILL'), true);
        room = undefined;
        return observed;
      }
      await until(() => awards[0] && !room.state.monster.alive && fighter.experience===125,
        'durable reward and replicated defeat after a real kill', 15000);
      room.send('attack', {targetId: 'possessed-1'});
      await delay(200);
      assert.equal(hits.filter(hit => hit.hp === 0).length, 1);
      assert.equal(awards.length, 1);
      assert.equal(awards[0].amount, 125);
    }
    assert.equal(fighter.level, 1);
    assert.equal(fighter.experience, 125);
    await leaveTestRoom(room, 6000);
    room = undefined;
    return observed;
  } catch (error) {
    throw Error('Restore test WebSocket session failed\n' + output, {cause: error});
  } finally {
    if (room) await leaveTestRoom(room).catch(() => {});
    await stopTestChild(child);
  }
}

async function readStoredSnapshot(dir, id, mode) {
  let saved;
  if (mode === '0') {
    saved = JSON.parse(await readFile(path.join(dir, id + '.json'), 'utf8'));
  } else {
    const db = new DatabaseSync(path.join(dir, 'economy.sqlite'), {readOnly: true});
    try {
      assert.equal(Object.values(db.prepare('PRAGMA quick_check(1)').get())[0], 'ok');
      const row = db.prepare('SELECT snapshot FROM characters WHERE id=?').get(id);
      assert.ok(row, 'character must be present in the SQLite backup');
      saved = JSON.parse(row.snapshot);
    } finally {
      db.close();
    }
  }
  assert.equal(saved.id, id);
  return saved;
}

async function checkStoredSnapshot(dir, id, mode) {
  const saved = await readStoredSnapshot(dir,id,mode);
  assert.deepEqual(saved.statAllocations, statAllocations);
  assert.deepEqual(saved.swordTree.learned, swordTree.learned);
  assert.deepEqual(saved.swordTree.training, swordTree.training);
  assert.deepEqual(saved.mixedSkillLoadouts, mixedSkillLoadouts);
}

for (const [mode, name] of [['0', 'JSON'], ['1', 'SQLite']]) {
  const parent = await realpath(tmpdir());
  const base = await mkdtemp(path.join(parent, 'montra-skill-ws-restore-'));
  const source = path.join(base, 'source');
  const restored = path.join(base, 'restore');
  try {
    await mkdir(source);
    const token = 'mt1_' + randomBytes(32).toString('hex');
    const id = createHash('sha256').update(token).digest('hex');
    const json = id + '.json';
    const slots = Array(12).fill(null);
    slots[0] = {itemId: 'arcane_sword', quantity: 1};
    await writeFile(path.join(source, json), JSON.stringify({
      version: 1, id, name: 'PrototypeRestore', level: 95, experience: 1234, pkKills: 0, pkDeaths: 0,
      x: 0, y: 0, z: 0, hp: 200, mapId: 'ritual_village', build: {path: 'phutthaisawan', ancestry: 'woodland'},
      statAllocations, swordTree, mixedSkillLoadouts, inventory: {version: 1, slots, equippedWeaponSlot: 0},
      updatedAt: new Date().toISOString(),
    }), {flag: 'wx'});

    const rewardToken = 'mt1_' + randomBytes(32).toString('hex');
    const rewardId = createHash('sha256').update(rewardToken).digest('hex');
    await writeFile(path.join(source,rewardId+'.json'),JSON.stringify({
      version: 1, id: rewardId, name: 'RewardRestore', level: 1, experience: 0, pkKills: 0, pkDeaths: 0,
      x: 1.1, y: 0, z: 8.5, hp: 200, mapId: 'ritual_village', build: {path: 'phutthaisawan', ancestry: 'woodland'},
      inventory: {version: 1, slots, equippedWeaponSlot: 0}, updatedAt: new Date().toISOString(),
    }), {flag: 'wx'});
    const before = await readSession(base, source, token, mode, rewardToken, true);
    assert.equal(before.id, id.slice(0, 12));
    await checkStoredSnapshot(source, id, mode);
    assert.equal((await readStoredSnapshot(source,rewardId,mode)).experience,crashDuringReward?0:125);
    const pending = crashDuringReward ? 1 : 0;
    const expectedPending = {jsonPending: mode === '0' ? pending : 0, sqlitePending: mode === '1' ? pending : 0};
    assert.deepEqual(inspectMonsterRewardRollback(source), expectedPending);
    await cp(source, restored, {recursive: true, errorOnExist: true});
    if (mode === '1') {
      // A SQLite restore must work without the legacy JSON migration source.
      await rm(path.join(restored, json), {force: true});
      await rm(path.join(restored, rewardId+'.json'), {force: true});
    }
    assert.deepEqual(inspectMonsterRewardRollback(restored), expectedPending);
    const backupFile = mode === '1' ? 'economy.sqlite' : json;
    assert.deepEqual(await readFile(path.join(restored, backupFile)), await readFile(path.join(source, backupFile)));
    assert.deepEqual(await readSession(base, restored, token, mode, rewardToken, false), before);
    await checkStoredSnapshot(restored, id, mode);
    assert.equal((await readStoredSnapshot(restored,rewardId,mode)).experience,125);
    assert.deepEqual(inspectMonsterRewardRollback(restored), {jsonPending: 0, sqlitePending: 0});
    if (crashDuringReward) {
      if (mode === '0') {
        await assert.rejects(readFile(path.join(restored,rewardId+'.json.reward-pending')), {code:'ENOENT'});
      } else {
        const database = new DatabaseSync(path.join(restored,'economy.sqlite'), {readOnly:true});
        try { assert.equal(database.prepare('SELECT COUNT(*) AS count FROM pending_monster_rewards').get().count,0); }
        finally { database.close(); }
      }
      console.log('PASS ' + name + ' recovered one real kill reward after stopping the server at prepare');
    } else {
      console.log('PASS ' + name + ' loopback restore preserved one kill reward, character, allocations, skills and hotbar');
    }
  } finally {
    const resolved = await realpath(base);
    assert.equal(path.dirname(resolved), parent);
    assert.ok(path.basename(resolved).startsWith('montra-skill-ws-restore-'));
    await rm(resolved, {recursive: true, force: true, maxRetries: 5, retryDelay: 100});
  }
}
