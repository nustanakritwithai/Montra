import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {writeSync} from 'node:fs';
import {mkdtemp, readFile, realpath, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {test} from 'node:test';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {CharacterStore} from './src/rooms/CharacterStore.js';
import {grantRewardPotion, makeStarterInventory} from './src/rooms/ItemRules.js';
import {assertTestChildRunning, stopTestChild} from './prototype-test-process.mjs';

const id = 'a'.repeat(64);
const seed = {
  id, version: 1, name: 'RewardCrash', level: 5, experience: 40,
  pkKills: 0, pkDeaths: 0, x: 0, y: 0, z: 0, hp: 100,
  mapId: 'ritual_village', inventory: makeStarterInventory(),
  forestObjective: {id: 'west', progress: 0},
  updatedAt: '2026-01-01T00:00:00.000Z',
};
const reward = {
  ...seed, experience: 165, inventory: grantRewardPotion(seed.inventory),
  forestObjective: {id: 'west', progress: 1},
  updatedAt: '2026-01-01T00:00:01.000Z',
};
assert.ok(reward.inventory);

function pauseAt(checkpoint) {
  writeSync(1, 'REWARD_CHECKPOINT=' + checkpoint + '\n');
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
}

async function rewardChild(mode, checkpoint) {
  const directory = process.cwd();
  assert.equal(process.env.NODE_ENV, 'test');
  assert.equal(process.env.MONTRA_CHARACTER_DIR, directory);
  assert.ok(path.basename(directory).startsWith('montra-reward-crash-'));
  const store = new CharacterStore(directory, mode === 'sqlite');
  if (mode === 'sqlite') {
    const database = store.economy;
    if (checkpoint === 'before_prepare') database.stageMonsterReward = () => pauseAt(checkpoint);
    if (checkpoint === 'prepared') database.commitMonsterReward = () => pauseAt(checkpoint);
    if (checkpoint === 'inside_transaction') {
      const writeCharacter = database.writeCharacter.bind(database);
      database.writeCharacter = (...args) => {
        writeCharacter(...args);
        pauseAt(checkpoint);
      };
    }
  } else {
    if (checkpoint === 'before_prepare') store.atomicWrite = () => pauseAt(checkpoint);
    if (checkpoint === 'prepared') store.commitJsonMonsterReward = () => pauseAt(checkpoint);
  }
  await store.save(reward, 'monster_reward');
  if (checkpoint === 'committed') pauseAt(checkpoint);
  throw Error('expected crash checkpoint was not reached');
}

async function interruptReward(directory, mode, checkpoint) {
  const entry = fileURLToPath(import.meta.url);
  const env = {
    SystemRoot: process.env.SystemRoot, Path: process.env.Path, HOME: directory,
    TMPDIR: directory, TEMP: directory, TMP: directory, NODE_ENV: 'test',
    MONTRA_CHARACTER_DIR: directory, MONTRA_WORLD_EXPANSION: '1',
  };
  const child = spawn(process.execPath, ['--import', import.meta.resolve('tsx'), entry, '--reward-child', mode, checkpoint], {
    cwd: directory, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '', spawnError;
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  child.on('error', error => { spawnError = error; });
  try {
    const deadline = Date.now() + 20000;
    while (!output.includes('REWARD_CHECKPOINT=' + checkpoint + '\n')) {
      assertTestChildRunning(child, spawnError, output);
      assert.ok(Date.now() < deadline, output || 'crash checkpoint timeout');
      await delay(25);
    }
    const exited = once(child, 'exit');
    assert.equal(child.kill('SIGKILL'), true);
    let timer;
    try {
      const [exitCode] = await Promise.race([
        exited,
        new Promise((_, reject) => { timer = setTimeout(() => reject(Error('test process did not stop')), 6000); }),
      ]);
      assert.notEqual(exitCode, 0);
    } finally { clearTimeout(timer); }
  } finally { await stopTestChild(child); }
}

async function inspect(directory, mode) {
  if (mode === 'json') {
    const saved = JSON.parse(await readFile(path.join(directory, id + '.json'), 'utf8'));
    let pending;
    try { pending = JSON.parse(await readFile(path.join(directory, id + '.json.reward-pending'), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    return {saved, pending};
  }
  const database = new DatabaseSync(path.join(directory, 'economy.sqlite'), {readOnly: true});
  try {
    assert.equal(Object.values(database.prepare('PRAGMA quick_check(1)').get())[0], 'ok');
    const saved = JSON.parse(database.prepare('SELECT snapshot FROM characters WHERE id=?').get(id).snapshot);
    const bag = JSON.parse(database.prepare('SELECT inventory FROM accounts WHERE id=?').get(id).inventory);
    const row = database.prepare('SELECT snapshot FROM pending_monster_rewards WHERE id=?').get(id);
    assert.deepEqual(bag, saved.inventory);
    return {saved, pending: row && JSON.parse(row.snapshot)};
  } finally { database.close(); }
}

function assertReward(saved, expected) {
  assert.equal(saved.experience, expected.experience);
  assert.deepEqual(saved.inventory, expected.inventory);
  assert.deepEqual(saved.forestObjective, expected.forestObjective);
}

async function runCrashTest(mode, checkpoint) {
  const parent = await realpath(tmpdir());
  const directory = await mkdtemp(path.join(parent, 'montra-reward-crash-'));
  const economy = mode === 'sqlite';
  let store = new CharacterStore(directory, economy);
  try {
    await store.save(seed);
    store.close();
    await interruptReward(directory, mode, checkpoint);
    const recorded = await inspect(directory, mode);
    const hasJournal = checkpoint === 'prepared' || checkpoint === 'inside_transaction';
    assertReward(recorded.saved, checkpoint === 'committed' ? reward : seed);
    assert.equal(Boolean(recorded.pending), hasJournal);
    if (hasJournal) {
      assertReward(recorded.pending, reward);
      await assert.rejects(store.save({...seed, experience: 999}), /monster_reward_pending/);
      await assert.rejects(store.save(reward, 'monster_reward'), /monster_reward_pending/);
      await assert.rejects(store.eraseCharacter(id), /monster_reward_pending/);
      if (economy) {
        const balance = store.economy.getAccount(id).gold;
        assert.throws(() => store.economy.catchFish(id,'pending-reward-fish','mat_fish_common'), /monster_reward_pending/);
        assert.equal(store.economy.getAccount(id).gold, balance);
        assert.deepEqual(store.economy.getAccount(id).inventory, seed.inventory);
      }
    }
    const expected = checkpoint === 'before_prepare' ? seed : reward;
    const restored = await store.loadOrCreateById(id, {x: 0, z: 0});
    assert.equal(restored.created, false);
    assertReward(restored.character, expected);
    assert.equal((await inspect(directory, mode)).pending, undefined);
    store.close();

    store = new CharacterStore(directory, economy);
    const next = await store.loadOrCreateById(id, {x: 0, z: 0});
    assertReward(next.character, expected);
    await store.save({...next.character, experience: expected.experience + 1});
    store.close();

    store = new CharacterStore(directory, economy);
    assert.equal((await store.loadOrCreateById(id, {x: 0, z: 0})).character.experience, expected.experience + 1);
  } finally {
    store.close();
    const resolved = await realpath(directory);
    assert.equal(path.dirname(resolved), parent);
    assert.ok(path.basename(resolved).startsWith('montra-reward-crash-'));
    await rm(resolved, {recursive: true, force: true, maxRetries: 5, retryDelay: 100});
  }
}

if (process.argv[2] === '--reward-child') {
  await rewardChild(process.argv[3], process.argv[4]);
} else {

  test('pre-journal SQLite saves open without changing the character or wallet', async () => {
    const parent = await realpath(tmpdir());
    const directory = await mkdtemp(path.join(parent, 'montra-reward-crash-'));
    const store = new CharacterStore(directory, true);
    try {
      const database = new DatabaseSync(path.join(directory, 'economy.sqlite'));
      try {
        database.exec('CREATE TABLE characters(id TEXT PRIMARY KEY, snapshot TEXT NOT NULL); ' +
          'CREATE TABLE accounts(id TEXT PRIMARY KEY, gold INTEGER NOT NULL, inventory TEXT NOT NULL);');
        database.prepare('INSERT INTO characters VALUES (?,?)').run(id, JSON.stringify(seed));
        database.prepare('INSERT INTO accounts VALUES (?,?,?)').run(id, 777, JSON.stringify(seed.inventory));
      } finally { database.close(); }
      const existing = await store.loadOrCreateById(id, {x: 0, z: 0});
      assert.equal(existing.created, false);
      assertReward(existing.character, seed);
      assert.equal(store.economy.getAccount(id).gold, 777);
      await store.save(reward, 'monster_reward');
      assertReward((await inspect(directory, 'sqlite')).saved, reward);
      assert.equal(store.economy.getAccount(id).gold, 777);
    } finally {
      store.close();
      const resolved = await realpath(directory);
      assert.equal(path.dirname(resolved), parent);
      assert.ok(path.basename(resolved).startsWith('montra-reward-crash-'));
      await rm(resolved, {recursive: true, force: true, maxRetries: 5, retryDelay: 100});
    }
  });
  for (const mode of ['json', 'sqlite']) {
    const checkpoints = ['before_prepare', 'prepared', 'committed'];
    if (mode === 'sqlite') checkpoints.splice(2, 0, 'inside_transaction');
    for (const checkpoint of checkpoints) {
      test(mode + ' preserves the expected reward state at ' + checkpoint, {timeout: 35000}, async () => {
        await runCrashTest(mode, checkpoint);
      });
    }
  }
}
