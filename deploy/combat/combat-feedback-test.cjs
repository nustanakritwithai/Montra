const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const read = name => fs.readFileSync(name, 'utf8');
const network = read('src/client/network/044-state-sync-and-connection.js');
const render = read('src/client/render/009-effects-and-target-hud.js');

function between(source, start, end) {
  const first = source.indexOf(start), last = source.indexOf(end, first + start.length);
  assert(first >= 0 && last > first, start);
  return source.slice(first, last);
}

function fixture() {
  let now = 1000;
  const calls = [], handlers = {};
  const me = { x: 1, y: 0, z: 1, local: true, weaponId: 'ritual_dagger' };
  const peer = { x: 2, y: 0, z: 2 };
  const monster = { x: 3, y: 4, z: 5, mapId: 'ritual_village' };
  const ghost = { design: { boss: false } };
  const actor = { x: 2, z: 1 };
  const joined = {
    state: { monsters: new Map([['mob', monster]]) },
    onMessage(name, handler) { handlers[name] = handler; },
  };
  const trace = name => (...args) => { calls.push([name, ...args]); };
  const ctx = {
    joined, room: joined, localId: 'me', activeMapId: 'ritual_village', MONSTER_ID: 'village',
    avatars: new Map([['me', me], ['peer', peer]]), forestMonsters: new Map([['mob', { metadata: { ghost } }]]),
    summonAvatars: new Map([['me', actor], ['peer', { x: 0, z: 0 }]]),
    hudKills: {}, hudTarget: { until: 0 }, performance: { now: () => now },
    ACTIONS: { stab: { dur: .4, swing: true }, punch: { dur: .4, swing: true }, hit: { dur: .25 }, cast: { dur: .45 } },
    MELEE: { ritual_dagger: 'stab' }, SKILL_SOURCES: new Set(['ranged', 'sword']),
    SFX: trace('sound'), spawnFx: trace('plane'), flashStrike: trace('flash'), actionFx: trace('action-fx'),
    shakeCamera: trace('shake'), floatAtMonster: trace('damage-mob'), floatAtPlayer: trace('damage-player'),
    toast: trace('toast'), registerComboHit: trace('combo'), showTalisman: trace('talisman'),
    triggerCombatCallout: trace('callout'),
    syncForestMonsters: trace('resync'), faceAvatarToward: trace('face'), syncPKHud() {},
  };
  vm.createContext(ctx);
  vm.runInContext(read('src/client/audio/023-action-and-impact-sounds.js'), ctx);
  vm.runInContext(read('src/client/combat/024-action-and-skill-motion.js'), ctx);
  vm.runInContext(between(render, '  function hitBurst(', '  // Wind-up telegraph:'), ctx);
  for (const event of ['combat_hit', 'pvp_hit', 'monster_hit', 'summon_hit', 'ranged_hit']) {
    const start = 'joined.onMessage("' + event + '",';
    vm.runInContext(between(network, start, 'joined.onMessage('), ctx);
  }
  ctx.renderMagicBolt = trace('projectile');
  return { emit: (event, data) => handlers[event](data), advance: ms => { now += ms; },
    count: name => calls.filter(call => call[0] === name).length, calls, ctx, me, peer, ghost, actor };
}

test('a burst of confirmed hits has one sound and flash, while damage, combo, animation and kills still update', () => {
  const f = fixture();
  f.emit('combat_hit', { attackerId: 'me', targetId: 'mob', damage: 18, hp: 50 });
  const firstSwing = f.me.action;
  f.advance(40);
  for (let i = 0; i < 6; i++) f.emit('combat_hit', { attackerId: 'me', targetId: 'mob', damage: 18, hp: i === 5 ? 0 : 20 });
  assert.equal(f.count('sound'), 1);
  assert.equal(f.count('plane'), 1);
  assert.equal(f.count('damage-mob'), 7);
  assert.equal(f.count('combo'), 7);
  assert.equal(f.me.action, firstSwing);
  assert.equal(f.ctx.hudKills.ritual_village, 1);
  assert.equal(f.ctx.hudTarget.id, 'mob');
  for (const name of ['flash', 'action-fx', 'toast', 'resync', 'callout']) assert.equal(f.count(name), 0, name);

  f.advance(100);
  f.emit('combat_hit', { attackerId: 'me', targetId: 'mob', source: 'sword', damage: 42, hp: 3 });
  assert.equal(f.count('sound'), 2);
  assert.equal(f.calls.filter(call => call[0] === 'damage-mob').at(-1)[3], 'crit');

  f.advance(140);
  f.emit('combat_hit', { attackerId: 'me', targetId: 'mob', source: 'sword', damage: 18, hp: 2 });
  const flashes = f.calls.filter(call => call[0] === 'plane');
  assert.equal(flashes.length, 3);
  assert.equal(flashes[0][1], 'star');
  assert.deepEqual(flashes[1], flashes[0], 'critical impact matches a normal hit');
  assert.deepEqual(flashes[2], flashes[0], 'heavy skill impact matches a normal hit');
  assert.equal(f.count('shake'), 0);
  f.ctx.joined.state.monsters.get('mob').tier = 'boss';
  f.emit('combat_hit', { attackerId: 'me', targetId: 'mob', damage: 15, hp: 0 });
  assert.deepEqual(f.calls.filter(call => call[0] === 'callout'), [['callout', 'execute_finisher']]);
});

test('other players keep their animations without observer impact sounds, flashes, or damage labels', () => {
  const f = fixture();
  f.emit('combat_hit', { attackerId: 'peer', targetId: 'mob', damage: 19 });
  assert.equal(f.peer.action.type, 'punch');
  assert.equal(f.ghost.hurtAt, 1000);
  f.emit('monster_hit', { attackerId: 'mob', targetId: 'peer', damage: 12 });
  assert.equal(f.peer.action.type, 'hit');
  f.emit('summon_hit', { ownerId: 'peer', targetId: 'mob', damage: 8 });
  f.emit('pvp_hit', { attackerId: 'peer', targetId: 'stranger', damage: 13 });
  for (const name of ['sound', 'plane', 'damage-mob', 'damage-player', 'toast']) assert.equal(f.count(name), 0, name);
});

test('incoming and summon hits retain damage labels, and the ranged projectile adds no second impact sound', () => {
  const f = fixture();
  f.emit('monster_hit', { attackerId: 'mob', targetId: 'me', damage: 12 });
  assert.equal(f.me.action.type, 'hit');
  f.emit('pvp_hit', { attackerId: 'peer', targetId: 'me', source: 'ranged', damage: 15 });
  f.emit('ranged_hit', { attackerId: 'peer', skill: 'blessed_rice', damage: 15 });
  assert.equal(f.count('sound'), 1);
  assert.equal(f.count('plane'), 1);
  assert.equal(f.count('damage-player'), 2);
  assert.equal(f.count('projectile'), 1);
  f.advance(140);
  f.emit('summon_hit', { ownerId: 'me', targetId: 'mob', damage: 8 });
  assert.equal(f.actor.hitUntil, 1400);
  assert.equal(f.count('sound'), 2);
  assert.equal(f.count('damage-mob'), 1);
  assert.equal(f.count('toast'), 0);
});

test('damage text keeps at most eight visible DOM labels', () => {
  class Vector {
    set(x, y, z) { Object.assign(this, { x, y, z }); return this; }
    static ProjectToRef(point, _world, _transform, _viewport, result) { result.set(point.x, point.y, point.z); }
  }
  const labels = [];
  const layer = {
    get childElementCount() { return labels.length; },
    get firstElementChild() { return labels[0]; },
    setAttribute() {},
    append(label) { labels.push(label); },
  };
  const document = {
    getElementById: () => null,
    createElement(tag) {
      if (tag === 'div') return layer;
      return { classList: { add() {} }, dataset: {}, style: { setProperty() {} },
        remove() { labels.splice(labels.indexOf(this), 1); } };
    },
  };
  const canvas = { getBoundingClientRect: () => ({ width: 100, height: 100 }) };
  const ctx = { document, B: { Vector3: Vector, Matrix: {} }, scene: { getTransformMatrix() {} },
    camera: { viewport: { toGlobal() {} } }, setTimeout() {},
    engine: { getRenderingCanvas: () => canvas, getRenderWidth: () => 100, getRenderHeight: () => 100 } };
  vm.createContext(ctx);
  vm.runInContext(read('src/client/combat/005-floating-feedback.js'), ctx);
  for (let i = 0; i < 20; i++) ctx.floatText(10, 20, .5, String(i));
  assert.deepEqual(labels.map(label => label.textContent), ['12', '13', '14', '15', '16', '17', '18', '19']);
});
