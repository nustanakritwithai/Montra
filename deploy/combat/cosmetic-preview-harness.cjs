// Execute production phase functions; only rendering/audio/DOM boundaries are test doubles.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
module.exports = function harness() {
  const source = fs.readFileSync(path.join(__dirname, '../../src/client/combat/008-weapon-party-boss-feedback.js'), 'utf8');
  const sourcePhases = source.slice(source.indexOf('  // Phase 15:'), source.indexOf('  // Phase 17:')) + source.slice(source.indexOf('  // Phase 18:'));
  const fields = new Map(), effects = [], messages = [];
  let now = 20000;
  const hero = { x: 1, y: 0, z: 2, hp: 100, defense: 4, serverCombat: 'combat' };
  const oldBossStatus = () => ({ shield: true });
  const oldBoss = { getBossStatus: oldBossStatus };
  for (const name of ['triggerBossPhase2', 'breakBossShield', 'processBossShieldDamage', 'updateBossMinions', 'ensureBossMinions']) oldBoss[name] = () => name;
  const ctx = { window: { MontraBoss: oldBoss }, mode: 'demo', hero,
    localId: 'fixture', getLocalAvatar: () => ctx.hero, performance: { now: () => now },
    demoMonsterHp: 100, room: { send: (...args) => messages.push(args) },
    $: id => { if (!fields.has(id)) fields.set(id, { hidden: false, textContent: 'stale', attrs: {}, setAttribute(k,v) { this.attrs[k] = v; } }); return fields.get(id); },
    toast: (...a) => effects.push(['toast', ...a]), SFX: (...a) => effects.push(['sound', ...a]),
    sparks() {}, spawnFx: (...a) => effects.push(['fx', ...a]),
    floatText: (...a) => effects.push(['text', ...a]), floatAtPlayer: (...a) => effects.push(['playerText', ...a]),
    triggerCombatCallout: (...a) => effects.push(['voice', ...a]), nearbyResource: () => ({ stock: 100 }) };
  let engine;
  if (process.env.MONTRA_TEST_BABYLON_PATH) {
    ctx.B = require(process.env.MONTRA_TEST_BABYLON_PATH);
    engine = new ctx.B.NullEngine(); ctx.scene = new ctx.B.Scene(engine);
  }
  vm.createContext(ctx); vm.runInContext(sourcePhases, ctx);
  if (!engine) vm.runInContext(`createFamiliarPetMesh = function () {
    const position = { x: 0, y: 0, z: 0, set(x,y,z) { Object.assign(this,{x,y,z}); } };
    return { root: { position, rotation: {}, disposed: false, dispose() { this.disposed = true; } } };
  };`, ctx);
  return { ctx, fields, effects, messages, oldBossStatus, oldBoss, advance: ms => { now += ms; }, close: () => engine?.dispose() };
};
