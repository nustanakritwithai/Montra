const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const root = resolve(__dirname, '../..');
const reference = readFileSync(resolve(__dirname, 'fixtures/item-presentation-reference.js'), 'utf8');
const source = readFileSync(resolve(root, 'src/client/ui/030-item-art-and-comparison.js'), 'utf8');
const names = ['statLine', 'wearPositions', 'gearDestination', 'bagMeta', 'itemSymbol', 'getItemArtKey', 'createItemTile', 'renderItemTile', 'renderItemPreview', 'wornGearAt', 'pieceStat', 'gearComparison', 'pieceForgeRatings', 'forgeComparison'];
const values = ['statNames', 'bodyLabels', 'preferredGearSlot', 'WEAPON_META', 'personalItems', 'gearSymbols', 'POTION_ITEM_ID', 'SHRINE_SHARD', 'document', 'inventoryState', 'gearGuides', 'forgeNames'];
const plain = value => structuredClone(value);
const functionsOnly = text => text.split('\n').filter(line => !/^  (const bodyLabels=|const gearSymbols=|let inspectingGear=)/.test(line)).join('\n');
function loadOriginal(text, env) {
  return vm.runInNewContext('"use strict";\n' + functionsOnly(text) + '\n({' + names.join(',') + '})', env);
}
const { load, moduleSource, wiring, prelude } = require('./fixtures/item-presentation-loader.cjs');
let groups = 0;
function test(name, fn) { fn(); groups++; console.log('PASS ' + name); }
function state() {
  return {
    statNames: { atk: 'โจมตี', hp: 'HP', mana: 'มานา', def: 'ป้องกัน' },
    forgeNames: { melee: 'ประชิด', ranged: 'เวท', guard: 'ป้องกัน', healing: 'รักษา' },
    bodyLabels: { head: 'ศีรษะ', leftRing: 'แหวนซ้าย', rightRing: 'แหวนขวา' },
    gearSymbols: { head: '♛', ring: '◎', leftRing: '◎', rightRing: '◎' },
    preferredGearSlot: null, POTION_ITEM_ID: 'health_potion', SHRINE_SHARD: 'shrine_shard',
    WEAPON_META: { legacy: { name: 'เก่า', melee: 4, symbol: '†' }, spirit_staff: { ranged: 6 } },
    personalItems: {
      sword: { name: '<b>ดาบ</b>', kind: 'mainHand', path: 'blade', rarity: 'rare', stats: { atk: 4, mana: 5 }, forge: { primary: 'melee', enhanceRatings: { 2: 7 }, enhanceMax: 10, affixMax: 6 } },
      ring: { name: 'แหวน', kind: 'ring', stats: { atk: 2, mana: 2 } }, card: { kind: 'card', stats: { atk: 3, mana: 1 } },
    },
    inventoryState: { equipment: { leftRing: 'ring' }, equipmentForges: { leftRing: { rank: 2 } }, equipmentSockets: { leftRing: 'card' } },
    gearGuides: { level: 10, baseMana: 98, manaCap: 100 },
    currentEquippedWeaponSlot: function () { 'use strict'; assert.equal(this, undefined); return 1; },
    ownServerCharacter: function () { 'use strict'; assert.equal(this, undefined); return { level: 10 }; },
  };
}
function dom(trace, failAt = Infinity) {
  let sequence = 0, operation = 0;
  const emit = (...entry) => { trace.push(entry); if (++operation === failAt) throw new Error('DOM failure'); };
  const nodes = [];
  function node(tag) {
    const id = ++sequence, data = { id, tag, children: [], attributes: {}, classes: [], textContent: '', hidden: false };
    nodes.push(data);
    const el = { id, classList: { toggle(name, enabled) { emit(id, 'toggle', name, enabled); const set = new Set(data.classes); enabled ? set.add(name) : set.delete(name); data.classes = [...set]; } },
      setAttribute(name, value) { emit(id, 'attribute', name, String(value)); data.attributes[name] = String(value); },
      append(...children) { emit(id, 'append', children.map(c => c.id)); data.children.push(...children.map(c => c.id)); },
      replaceChildren(...children) { emit(id, 'replace', children.map(c => c.id)); data.children = children.map(c => c.id); data.textContent = ''; },
    };
    for (const key of ['hidden', 'textContent', 'className']) Object.defineProperty(el, key, {
      get() { return key === 'className' ? data.classes.join(' ') : data[key]; },
      set(value) { emit(id, key, value); if (key === 'className') data.classes = String(value).split(/\s+/); else data[key] = value; if (key === 'textContent') data.children = []; },
    });
    for (const key of ['innerHTML', 'onclick']) Object.defineProperty(el, key, { set() { assert.fail('No markup or action binding'); } });
    el.addEventListener = () => assert.fail('No action listener');
    return el;
  }
  const host = node('host');
  const api = { nodes, document: { createElement(tag) { emit('create', tag); assert.equal(this, api.document); return node(tag); } },
    $: function (id) { 'use strict'; assert.equal(this, undefined); emit('lookup', id); return id === 'host' ? host : null; } };
  return api;
}
test('independent pre-extraction source is pinned to the original 119-line fragment', () => {
  assert.equal(createHash('sha256').update(reference).digest('hex'), '5e493b4e767f6736018ce0edc1e2252b6ef4d7f135a9d88560d5762cbbffb2c9');
  assert.equal(reference.split('\n').length - 1, 119);
});
test('stat text keeps own names, finite numbers, insertion order and signed-zero filtering', () => {
  const api = load(state());
  assert.equal(api.statLine({ def: -2, hp: 5, atk: 0, mana: -0, unknown: 99, toString: 3 }), 'ป้องกัน -2 · HP +5');
  assert.equal(api.statLine({ atk: '4', hp: NaN, mana: Infinity }), '');
  for (const value of [undefined, null, false, 0, '']) assert.equal(api.statLine(value), '');
});
test('physical destinations preserve preference, empty-slot order, inherited property behavior and empty arrays', () => {
  const env = state(), api = load(env);
  assert.deepEqual(plain(api.wearPositions('ring')), ['leftRing', 'rightRing']);
  assert.deepEqual(plain(api.wearPositions('earring')), ['leftEar', 'rightEar']);
  assert.deepEqual(plain(api.wearPositions('head')), ['head']);
  assert.deepEqual(plain(api.wearPositions('toString')), []);
  const positions = ['leftRing', 'rightRing'];
  assert.equal(api.gearDestination(positions, { leftRing: 'ring' }), 'rightRing');
  env.preferredGearSlot = 'leftRing';
  assert.equal(api.gearDestination(positions, { leftRing: 'ring' }), 'leftRing');
  env.preferredGearSlot = 'unavailable';
  assert.equal(api.gearDestination([], {}), undefined);
  assert.equal(api.gearDestination(positions, { leftRing: 'x', rightRing: 'x' }), 'leftRing');
});
test('metadata clones legacy/catalog records, preserves fallback symbols and sees replacement catalogs', () => {
  const env = state(), api = load(env);
  assert.deepEqual(plain(api.bagMeta('legacy')), { name: 'เก่า', melee: 4, symbol: '†', kind: 'mainHand' });
  const result = api.bagMeta('sword');
  assert.equal(result.symbol, '🗡'); assert.equal(result.bonus, 'โจมตี +4 · มานา +5');
  assert.notEqual(result, env.personalItems.sword); assert.equal(result.stats, env.personalItems.sword.stats);
  for (const [id, expected] of [['missing', '◈'], ['health_potion', '🧪'], ['', '·'], [null, '·']]) assert.equal(api.itemSymbol(id), expected);
  env.personalItems = { sword: { kind: 'material', name: 'updated', stats: {} } };
  assert.equal(api.bagMeta('sword').name, 'updated'); assert.equal(api.itemSymbol('sword'), '◆');
});
test('artwork keeps all historical mappings and precedence, including feet versus boots', () => {
  const api = load(state());
  const cases = [
    ['', { healHp: 1 }, ''], ['health_potion', { healMana: 1 }, 'potion_health'], ['medicine', {}, 'potion_health'],
    ['other', { healHp: 1, healMana: 1 }, 'potion_health'], ['mana_potion', {}, 'potion_mana'], ['shrine_shard', {}, 'mat_shard'],
    ['muay_wraps', {}, 'weapon_wraps'], ['shrine_glaive', {}, 'weapon_glaive'], ['ritual_dagger', {}, 'weapon_dagger'],
    ['legacy', {}, 'weapon_dagger'], ['spirit_staff', {}, 'weapon_staff'], ['blade', {}, 'weapon_dual'], ['arcane_sword', {}, 'weapon_sword'],
    ...Object.entries({ muay_boran: 'wraps', sentinel: 'glaive', seer: 'staff', mender: 'staff', blade: 'dual', phutthaisawan: 'sword' }).map(([path, art]) => ['other', { path }, 'weapon_' + art]),
    ...Object.entries({ mainHand: 'weapon_sword', chest: 'armor_chest', head: 'armor_head', legs: 'armor_legs', boots: 'armor_boots', belt: 'armor_belt', feet: '', ring: 'acc_ring', amulet: 'acc_amulet', neck: '', card: 'card_yantra', catalyst: 'cat_seal', tool: 'tool_rod', material: 'mat_shard' }).map(([kind, art]) => ['other', { kind }, art]),
    ['xringx', { kind: 'card' }, 'acc_ring'], ['xnecklacex', {}, 'acc_amulet'], ['ref_seal_2', {}, 'cat_seal'], ['seal', {}, 'cat_seal'], ['tool', {}, 'tool_rod'],
    ...['metal', 'wood', 'herb', 'soul'].map(kind => ['mat_' + kind + '_1', { kind: 'material' }, 'mat_' + kind]),
    ['ore', { kind: 'material' }, 'mat_metal'], ['ore', {}, ''], ['missing', {}, ''],
  ];
  for (const [id, meta, expected] of cases) assert.equal(api.getItemArtKey(id, meta), expected, `${id}/${JSON.stringify(meta)}`);
});
test('equipped gear and card stats retain aliases, nullish values, coercion and live selection/state', () => {
  const env = state(), api = load(env), slots = [null, { itemId: 'sword' }];
  assert.equal(api.wornGearAt('mainHand', slots), slots[1]);
  assert.equal(api.wornGearAt('mainHand', null), null);
  const worn = api.wornGearAt('leftRing', slots);
  assert.equal(worn.forge, env.inventoryState.equipmentForges.leftRing); assert.equal(worn.socket, 'card'); assert.equal(worn.bound, true);
  assert.equal(api.pieceStat(worn, 'atk'), 5);
  env.personalItems.ring.stats.atk = '2'; assert.equal(api.pieceStat(worn, 'atk'), '23');
  env.inventoryState = { equipment: { rightRing: 'card' } };
  assert.equal(api.wornGearAt('leftRing', slots), null); assert.equal(api.wornGearAt('rightRing', slots).itemId, 'card');
  env.currentEquippedWeaponSlot = function () { 'use strict'; assert.equal(this, undefined); return 0; };
  assert.equal(api.wornGearAt('mainHand', slots), null);
});
test('forge profiles, legacy additions, fractional threshold, NaN and mana cap behavior stay exact', () => {
  const env = state(), api = load(env), piece = { itemId: 'sword', forge: { rank: 2, affix: { stat: 'guard', tier: 2 } } };
  assert.deepEqual(plain(api.pieceForgeRatings(piece)), { melee: 7, ranged: 0, guard: 4, healing: 0 });
  assert.equal(api.pieceForgeRatings({ itemId: 'sword', forge: { rank: 3 } }).melee, 3);
  assert.equal(api.pieceForgeRatings({ itemId: 'spirit_staff', forge: { rank: 2 } }).ranged, 8);
  assert.equal(api.forgeComparison(piece, null), 'ประชิด +7 / ป้องกัน +4');
  assert.equal(api.forgeComparison({ itemId: 'unknown', forge: { rank: .0049 } }, null), '');
  assert.equal(api.forgeComparison({ itemId: 'unknown', forge: { rank: .005 } }, null), 'ประชิด +0.01');
  assert(Number.isNaN(api.pieceForgeRatings({ itemId: 'unknown', forge: { rank: 1, affix: { stat: 'unexpected', tier: 1 } } }).unexpected));
  assert.equal(api.gearComparison({ itemId: 'sword' }, { itemId: 'ring' }, [null, { itemId: 'sword' }]), 'โจมตี +2 · MP สูงสุดก่อนบัฟ 100 → 100');
  env.gearGuides = null;
  assert.equal(api.gearComparison({ itemId: 'sword' }, { itemId: 'ring' }, []), 'โจมตี +2 · มานา +3');
  assert.equal(api.gearComparison(piece, piece, []), 'สเตตัสและโบนัส PvE เท่ากัน');
});
function observed(loader, scenario, failAt) {
  const trace = [], env = state(), recorder = dom(trace, failAt); Object.assign(env, recorder);
  const api = loader(env);
  let error, result;
  try { result = scenario(api, env, trace); } catch (e) { error = { name: e.name, message: e.message }; }
  return { trace, nodes: recorder.nodes, error, result: result?.id ?? result };
}
const scenarios = [
  api => api.createItemTile({ itemId: 'sword', quantity: 3, forge: { rank: 2 } }, { equipped: true }),
  api => api.createItemTile(null),
  api => api.createItemTile('ring', { quantity: 0, rank: 0, equipped: true }),
  api => { api.renderItemTile('host', 'sword'); api.renderItemTile('host', null); api.renderItemTile('missing', 'ring'); },
  api => { api.renderItemPreview('host', 'sword', '<img onerror=x>'); api.renderItemPreview('host', null); api.renderItemPreview('host', 'ring'); },
];
test('exact DOM operations, inert text, clearing/repeated rendering and every interrupted mutation match the original', () => {
  for (const scenario of scenarios) {
    const expected = observed(env => loadOriginal(reference, env), scenario);
    assert.equal(expected.error, undefined);
    assert.deepEqual(observed(load, scenario), expected);
    for (let failAt = 1; failAt <= expected.trace.length; failAt++) {
      const interrupted = observed(env => loadOriginal(reference, env), scenario, failAt);
      assert.equal(interrupted.error?.message, 'DOM failure');
      assert.deepEqual(observed(load, scenario, failAt), interrupted, `DOM operation ${failAt}`);
    }
  }
  const rendered = observed(load, scenarios[0]);
  assert.equal(rendered.nodes[1].attributes['aria-label'], '<b>ดาบ</b> +2 ×3 · สวมอยู่');
  assert.equal(rendered.nodes[1].attributes['data-item-art'], 'weapon_dual');
  assert.equal(rendered.nodes[1].attributes['data-item-rarity'], 'rare');
  assert.equal(rendered.nodes[3].textContent, '+2');
});
function readTrace(loader, method, makeArgs) {
  const trace = [], backing = state(), sandbox = {};
  for (const name of values) Object.defineProperty(sandbox, name, { configurable: true, get() { trace.push(name); return backing[name]; } });
  for (const name of ['currentEquippedWeaponSlot', 'ownServerCharacter']) Object.defineProperty(sandbox, name, { get() { trace.push(name); return backing[name]; } });
  const api = loader(sandbox), args = makeArgs(backing, trace);
  let result, error;
  try { result = api[method](...args); } catch (e) { error = { name: e.name, message: e.message }; }
  return { trace, result: plain(result), error };
}
const reads = [
  ['statLine', () => [{ atk: 2, hp: -1 }]],
  ['bagMeta', () => ['sword']],
  ['pieceStat', (env, trace) => [{ get itemId() { trace.push('piece.itemId'); env.personalItems = { ring: { stats: { atk: 10 } } }; return 'sword'; }, get socket() { trace.push('piece.socket'); return 'ring'; } }, 'atk']],
  ['gearDestination', (env, trace) => [{ includes(slot) { trace.push('includes:' + slot); env.preferredGearSlot = 'rightRing'; return true; } }, {}]],
  ['wornGearAt', (env, trace) => { env.inventoryState.equipment = { get leftRing() { trace.push('equipment.leftRing'); env.inventoryState = { equipmentForges: { leftRing: 'new forge' }, equipmentSockets: { leftRing: 'new card' } }; return 'ring'; } }; return ['leftRing', []]; }],
  ['gearComparison', () => [{ itemId: 'sword' }, { itemId: 'ring' }, [null, { itemId: 'sword' }]]],
  ['gearComparison', (env, trace) => { env.gearGuides = { get baseMana() { trace.push('guide.baseMana'); env.gearGuides = { baseMana: 90, manaCap: 99, level: 10 }; return 98; }, manaCap: 100, level: 10 }; return [{ itemId: 'sword' }, { itemId: 'ring' }, [null, { itemId: 'sword' }]]; }],
  ['pieceForgeRatings', () => [{ itemId: 'sword', forge: { rank: 2, affix: { stat: 'guard', tier: 2 } } }]],
  ['getItemArtKey', (env, trace) => ['ring', { get healHp() { trace.push('healHp'); return false; }, get healMana() { trace.push('healMana'); return true; }, get path() { assert.fail('short-circuited'); } }]],
];
test('live reads and accessor/coercion order match the independent implementation without snapshots', () => {
  for (const [method, args] of reads) assert.deepEqual(readTrace(load, method, args), readTrace(env => loadOriginal(reference, env), method, args), method);
});
test('malformed inputs retain original exceptions, partial operations and nullish short circuits', () => {
  const cases = [
    ['getItemArtKey', () => [42, {}]], ['createItemTile', () => ['ring', null]], ['gearDestination', () => [null, {}]],
    ['wearPositions', () => [Symbol('kind')]], ['pieceStat', env => { env.personalItems = null; return [null, 'atk']; }],
    ['wornGearAt', env => { env.inventoryState = null; return ['leftRing', []]; }],
    ['pieceForgeRatings', env => { env.personalItems = null; return [{ itemId: 'ring', forge: { rank: 1 } }]; }],
    ['statLine', () => [new Proxy({}, { ownKeys() { throw new Error('ownKeys failed'); } })]],
  ];
  for (const [method, args] of cases) assert.deepEqual(readTrace(load, method, args), readTrace(env => loadOriginal(reference, env), method, args), method);
});


test('classic factory and instances are frozen, isolated and completely lazy at startup', () => {
  const sandbox = {};
  for (const name of [...values, '$', 'currentEquippedWeaponSlot', 'ownServerCharacter', 'room', 'localStorage', 'fetch', 'B']) {
    Object.defineProperty(sandbox, name, { get() { assert.fail(`Unexpected eager read: ${name}`); } });
  }
  vm.createContext(sandbox); vm.runInContext(moduleSource, sandbox);
  assert.deepEqual(Object.keys(sandbox), ['MontraItemPresentation']);
  assert.deepEqual(Object.keys(sandbox.MontraItemPresentation), ['create']);
  assert(Object.isFrozen(sandbox.MontraItemPresentation));
  vm.runInContext(wiring, sandbox);
  const api = vm.runInContext('itemPresentation', sandbox);
  assert.deepEqual(Object.keys(api), names); assert(Object.isFrozen(api));
  const original = loadOriginal(reference, state());
  for (const name of names) {
    assert.equal(api[name].name, name); assert.equal(api[name].length, original[name].length);
  }
  assert.throws(() => vm.runInContext('"use strict"; itemPresentation.bagMeta = null;', sandbox), { name: 'TypeError' });
  const one = state(), two = state(), a = load(one), b = load(two);
  one.personalItems = { replacement: { kind: 'material' } };
  assert.equal(a.bagMeta('sword'), null); assert.equal(b.bagMeta('sword').name, '<b>ดาบ</b>');
});
test('actual shell initialization is lazy; declarations remain hoisted with the original TDZ and defaults', () => {
  const core = readFileSync(resolve(root, 'src/client/core/001-storage-and-dom.js'), 'utf8');
  const prefix = core.slice(0, core.indexOf('  const ui ='));
  const storage = readFileSync(resolve(root, 'src/client-modules/character-slot-storage.js'), 'utf8');
  const world = readFileSync(resolve(root, 'src/client-modules/world-math.js'), 'utf8');
  const sandbox = { URL };
  for (const name of [...values, 'localStorage']) Object.defineProperty(sandbox, name, { get() { assert.fail('Startup read: ' + name); } });
  vm.createContext(sandbox); vm.runInContext(storage + world + moduleSource + prefix, sandbox);
  for (const missing of [undefined, null, {}]) {
    const env = { URL, MontraItemPresentation: missing };
    Object.defineProperty(env, 'document', { get() { assert.fail('Missing module must fail before DOM initialization'); } });
    vm.createContext(env); vm.runInContext(storage + world, env);
    assert.throws(() => vm.runInContext(prefix, env), { name: 'TypeError' });
  }
  const run = (body, before = '') => {
    const env = state(), results = [];
    env.probe = (name, fn) => { try { results.push([name, plain(fn())]); } catch (e) { results.push([name, e.name]); } };
    vm.runInNewContext(before + '\n(() => {\n' + (before ? wiring : '') +
      'probe("hoisted ring", () => wearPositions("ring")); probe("body TDZ", () => wearPositions("head"));' +
      'probe("empty art", () => getItemArtKey("")); probe("empty stats", () => statLine({}));' +
      'probe("stat TDZ", () => statLine({atk:1})); const statNames = {atk:"atk"};\n' + body +
      '\nprobe("later body", () => wearPositions("head")); probe("function metadata", () => [' +
      names.map(name => `[${name}.name,${name}.length]`).join(',') + ']); })();', env);
    return results;
  };
  assert.deepEqual(run(source, moduleSource), run(reference));
  assert.deepEqual(run(source, moduleSource).slice(0, 5), [
    ['hoisted ring', ['leftRing', 'rightRing']], ['body TDZ', 'ReferenceError'], ['empty art', ''], ['empty stats', ''], ['stat TDZ', 'ReferenceError'],
  ]);
});
test('dependency failures propagate at the original access point and stop subsequent reads', () => {
  for (const [method, args] of reads) {
    const expected = readTrace(env => loadOriginal(reference, env), method, args);
    for (const failing of new Set(expected.trace.filter(name => values.includes(name)))) {
      const run = loader => {
        const trace = [], env = state();
        for (const name of values) {
          const value = env[name];
          Object.defineProperty(env, name, { configurable: true, get() { trace.push(name); if (name === failing) throw new Error('unavailable ' + name); return value; } });
        }
        const api = loader(env); let error;
        // These scenarios require no state replacement from the test itself.
        try { api[method](...({ statLine: [{ atk: 1 }], bagMeta: ['sword'], pieceStat: [{ itemId: 'ring', socket: 'card' }, 'atk'], gearDestination: [['leftRing'], {}], wornGearAt: ['leftRing', []], gearComparison: [{ itemId: 'sword' }, { itemId: 'ring' }, []], pieceForgeRatings: [{ itemId: 'sword', forge: { rank: 2 } }], getItemArtKey: ['unknown', {}] }[method])); }
        catch (e) { error = [e.name, e.message]; }
        return { trace, error };
      };
      assert.deepEqual(run(load), run(env => loadOriginal(reference, env)), `${method}/${failing}`);
    }
  }
});
test('every repeated dependency read can fail independently without eager or subsequent reads', () => {
  const run = (loader, failAt = Infinity) => {
    const trace = [], backing = state(), env = {}; let count = 0;
    for (const name of [...values, 'currentEquippedWeaponSlot', 'ownServerCharacter']) Object.defineProperty(env, name, {
      get() { trace.push(name); if (++count === failAt) throw new Error('dependency failure'); return backing[name]; },
    });
    const api = loader(env); let result, error;
    try { result = api.gearComparison({ itemId: 'sword', forge: { rank: 2 } }, { itemId: 'ring', socket: 'card' }, [null, { itemId: 'sword' }]); }
    catch (e) { error = [e.name, e.message]; }
    return { trace, result, error };
  };
  const original = env => loadOriginal(reference, env), expected = run(original);
  assert.equal(expected.error, undefined); assert.deepEqual(run(load), expected);
  for (let failAt = 1; failAt <= expected.trace.length; failAt++) {
    assert.deepEqual(run(load, failAt), run(original, failAt), `lexical dependency read ${failAt}`);
  }
});
test('failed render attempts can be followed by clearing and a fresh render without leaked module state', () => {
  const scenario = api => {
    try { api.renderItemPreview('host', 'sword', 'first'); } catch (e) { assert.equal(e.message, 'DOM failure'); }
    api.renderItemPreview('host', null); api.renderItemPreview('host', 'ring', 'second');
  };
  for (let failAt = 2; failAt <= 30; failAt++) assert.deepEqual(observed(load, scenario, failAt), observed(env => loadOriginal(reference, env), scenario, failAt));
});
test('all scripts keep deferred classic order and the existing load-failure path', () => {
  const html = readFileSync(resolve(root, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"([^>]*)>/g)];
  let last = -1;
  for (const path of ['src/client-modules/character-slot-storage.js', 'src/client-modules/world-math.js', 'src/client-modules/item-presentation.js', 'main.js']) {
    const matches = scripts.map((script, index) => ({ script, index })).filter(({ script }) => script[1].startsWith('./' + path + '?'));
    assert.equal(matches.length, 1); const { script, index } = matches[0];
    assert(index > last); last = index;
    assert.match(script[2], /\bdefer\b/i); assert.doesNotMatch(script[2], /\basync\b|\btype\s*=/i);
    const handler = script[2].match(/\bonerror="([^"]+)"/)[1], notices = [];
    vm.runInNewContext(handler, { window: { MontraEntry: { worldUnavailable: text => notices.push(text) } } });
    assert.deepEqual(notices, ['โหลดเกมไม่สำเร็จ กรุณาลองอีกครั้ง']);
    assert.doesNotThrow(() => vm.runInNewContext(handler, { window: {} }));
  }
});
test('presentation leaves frozen catalog, equipment, pieces and options untouched', () => {
  const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) freeze(child); } return value; };
  const env = state(); for (const value of Object.values(env)) freeze(value);
  const trace = [], recorder = dom(trace); Object.assign(env, recorder);
  const api = load(env), piece = freeze({ itemId: 'sword', quantity: 2, forge: { rank: 2, affix: { stat: 'guard', tier: 2 } }, socket: 'card' });
  const previous = freeze({ itemId: 'ring' }), options = freeze({ equipped: true }), slots = freeze([null, piece]);
  assert.equal(api.bagMeta('sword').name, '<b>ดาบ</b>'); assert.equal(api.pieceStat(piece, 'atk'), 7);
  assert.equal(api.pieceForgeRatings(piece).guard, 4); assert(api.forgeComparison(piece, previous));
  assert(api.gearComparison(piece, previous, slots)); assert.equal(api.wornGearAt('mainHand', slots), piece);
  api.createItemTile(piece, options); api.renderItemTile('host', piece, options); api.renderItemPreview('host', piece, 'frozen');
});
test('negative controls detect cached state, reordered reads, receiver changes, art and DOM regressions', () => {
  const mutated = (from, to) => {
    assert.equal(moduleSource.split(from).length, 2, from);
    return env => vm.runInNewContext(moduleSource.replace(from, to) + '\n' + wiring + '\nitemPresentation', env);
  };
  const checks = [
    [mutated('positions.includes(getPreferredGearSlot())?getPreferredGearSlot()', '(getPreferredGearSlot(),positions.includes("leftRing"))?"leftRing"'), loader => assert.deepEqual(readTrace(loader, ...reads[3]), readTrace(env => loadOriginal(reference, env), ...reads[3]))],
    [mutated('getCurrentEquippedWeaponSlot()()', '(getCurrentEquippedWeaponSlot()).call({})'), loader => assert.equal(loader(state()).wornGearAt('mainHand', [null, { itemId: 'sword' }]).itemId, 'sword')],
    [mutated('const art=getItemArtKey(id,meta);', 'const art="changed";'), loader => assert.deepEqual(observed(loader, scenarios[0]), observed(load, scenarios[0]))],
    [mutated('host.hidden=!item;host.replaceChildren();', 'host.replaceChildren();host.hidden=!item;'), loader => assert.deepEqual(observed(loader, scenarios[4]), observed(load, scenarios[4]))],
    [mutated('Math.abs(a[k]-b[k])>=.005', 'Math.abs(a[k]-b[k])>.005'), loader => assert.equal(loader(state()).forgeComparison({ itemId: 'unknown', forge: { rank: .005 } }, null), 'ประชิด +0.01')],
    [mutated('getInventoryState().equipmentForges?.[position]', 'undefined'), loader => assert.deepEqual(readTrace(loader, ...reads[4]), readTrace(env => loadOriginal(reference, env), ...reads[4]))],
    [mutated('    const profile=getPersonalItems()[stack.itemId]?.forge;', '    getPersonalItems()[stack.itemId].touched=true; const profile=getPersonalItems()[stack.itemId]?.forge;'), loader => { const env = state(); Object.freeze(env.personalItems.sword); loader(env).pieceForgeRatings({ itemId: 'sword', forge: { rank: 2 } }); }],
  ];
  for (const [loader, check] of checks) assert.throws(() => check(loader));
  const cached = moduleSource.replace('  function statLine(stats)', '  const catalog = getPersonalItems(); getPersonalItems = () => catalog;\n  function statLine(stats)');
  assert.throws(() => {
    const env = state(), api = vm.runInNewContext(cached + '\n' + wiring + '\nitemPresentation', env);
    env.personalItems = {}; assert.equal(api.bagMeta('sword'), null);
  });
  const eager = moduleSource.replace('  function statLine(stats)', '  getPersonalItems();\n  function statLine(stats)');
  assert.notEqual(eager, moduleSource);
  assert.throws(() => { const env = state(); Object.defineProperty(env, 'personalItems', { get() { assert.fail('Must remain lazy'); } }); vm.runInNewContext(eager + '\n' + wiring, env); });
});
console.log(`PASS item presentation: ${groups} characterization groups`);
