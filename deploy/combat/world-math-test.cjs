const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const root = resolve(__dirname, '../..');
const referenceSource = readFileSync(resolve(__dirname, 'fixtures/world-math-reference.js'), 'utf8');
assert.equal(createHash('sha256').update(referenceSource).digest('hex'),
  'dbaeb1e5e15d40a396f5464e2d0a6369c838968698661134eaa1e534bd6ba40b', 'Do not refresh the original helper reference');
const reference = vm.runInNewContext(`${referenceSource}\nWorldMathReference;`);
// The independently committed characterization cases now use the module API.
const helperSource = readFileSync(resolve(root, 'src/client-modules/world-math.js'), 'utf8');
const helpers = vm.runInNewContext(`${helperSource}\nMontraWorldMath;`);

// structuredClone retains NaN, signed zero, undefined, array holes and aliases,
// unlike JSON, and removes cross-realm prototypes from VM results.
const plain = value => structuredClone(value);
function outcome(run) {
  try { return { value: plain(run()) }; }
  catch (error) { return { error: { name: error.name, message: error.message } }; }
}
function equivalent(name, makeArgs, label = '') {
  assert.deepEqual(outcome(() => helpers[name](...makeArgs())), outcome(() => reference[name](...makeArgs())), `${name}: ${label}`);
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const member of Object.values(value)) freeze(member);
    Object.freeze(value);
  }
  return value;
}
const saddle = () => ({ xs: [0, 10], zs: [0, 20], heights: [[0, 10], [20, 100]] });

for (const [label, api] of [['original reference', reference], ['client helpers', helpers]]) {
  test(`${label}: terrain cells choose the right cell at interior cuts and clamp only the index`, () => {
    for (const [v, expected] of [[-Infinity, 0], [-1, 0], [0, 0], [9, 0], [10, 1], [19, 1], [20, 1], [Infinity, 1], [NaN, 1]]) {
      assert.equal(api.terrainCell([0, 10, 20], v), expected);
    }
    assert.equal(api.terrainCell([], 0), -2);
    assert.equal(api.terrainCell([0], 0), -1);
    assert.equal(api.terrainCell([0], -1), 0);
    assert.equal(api.terrainCell([0, 0, 10], 0), 1);
    assert.equal(api.terrainCell([20, 0, 10], 5), 0);
    assert.equal(api.terrainCell(['0', '2', '10'], '11'), 0, 'Relational comparison keeps string coercion');
    assert.equal(api.terrainCell(new Float64Array([0, 10, 20]), 10), 1);
  });

  test(`${label}: terrain uses the a-d diagonal, not bilinear interpolation, with coordinate clamping`, () => {
    const t = freeze(saddle());
    for (const [x, z, expected] of [[0, 0, 0], [10, 0, 10], [0, 20, 20], [10, 20, 100],
      [5, 10, 50], [7.5, 5, 30], [2.5, 15, 35], [-10, 10, 10], [20, 10, 55],
      [5, -10, 5], [5, 40, 60], [-Infinity, Infinity, 20], ['5', '10', 50], [null, false, 0]]) {
      assert.equal(api.terrainHeight(t, x, z), expected, `${x}, ${z}`);
    }
    assert(Number.isNaN(api.terrainHeight(t, NaN, 0)));
    assert(Number.isNaN(api.terrainHeight({ xs: [0, 0], zs: [0, 1], heights: [[1, 2], [3, 4]] }, 0, 0)));
    assert.equal(api.terrainHeight({ xs: [0, 1], zs: [0, 1], heights: [['1', '5'], ['9', '13']] }, .5, .5), '16');
    assert.throws(() => api.terrainHeight(null, 0, 0), { name: 'TypeError' });
    assert.throws(() => api.terrainHeight({ xs: [], zs: [], heights: [] }, 0, 0), { name: 'TypeError' });
  });

  test(`${label}: Chaikin interpolation preserves endpoints, order and fresh point copies`, () => {
    const points = freeze([{ x: 0, z: 8, extra: 'ignored' }, { x: 8, z: 0 }]);
    const first = api.smoothPath(points, 1);
    assert.deepEqual(plain(first), [{ x: 0, z: 8 }, { x: 2, z: 6 }, { x: 6, z: 2 }, { x: 8, z: 0 }]);
    for (const n of [0, 1, 2, 3, 4]) {
      const path = api.smoothPath(points, n);
      assert.equal(path.length, 2 * 2 ** n);
      assert.deepEqual(plain(path[0]), { x: 0, z: 8 });
      assert.deepEqual(plain(path.at(-1)), { x: 8, z: 0 });
      assert.notEqual(path[0], points[0]);
      assert.notEqual(path.at(-1), points.at(-1));
    }
    assert.deepEqual(plain(api.smoothPath(points)), plain(api.smoothPath(points, 3)));
    const copy = api.smoothPath(points, 0);
    copy[0].x = 999;
    assert.equal(points[0].x, 0);
  });

  test(`${label}: smoothing retains empty/singleton, iteration coercion and malformed-point behavior`, () => {
    assert.deepEqual(plain(api.smoothPath([], 0)), []);
    assert.deepEqual(plain(api.smoothPath([], 1)), [undefined, undefined]);
    assert.throws(() => api.smoothPath([]), { name: 'TypeError' });
    assert.throws(() => api.smoothPath([null], 0), { name: 'TypeError' });
    const one = api.smoothPath([{ x: -0, z: 2 }], 1);
    assert.equal(one.length, 2);
    assert.equal(one[0], one[1], 'Existing endpoint alias for a singleton is preserved');
    assert(Object.is(one[0].x, -0));
    assert.equal(api.smoothPath([{ x: 1, z: 2 }]).length, 8);
    const points = [{ x: 0, z: 0 }, { x: 8, z: 8 }];
    for (const count of [null, false, 0, -1, NaN, '']) assert.equal(api.smoothPath(points, count).length, 2);
    for (const count of [true, .25, 1, '1', 1n]) assert.equal(api.smoothPath(points, count).length, 4);
    assert.equal(api.smoothPath(points, 1.5).length, 8);
    assert.throws(() => api.smoothPath(points, Symbol('iterations')), { name: 'TypeError' });
    const sparse = Array(2);
    const copy = api.smoothPath(sparse, 0);
    assert.equal(copy.length, 2);
    assert.equal(0 in copy, false);
    assert.throws(() => api.smoothPath(sparse, 1), { name: 'TypeError' });
  });
}

test('cell edge and coercion cases exactly match the frozen reference', () => {
  const cuts = [[], [0], [0, 1], [-10, -2, 3, 10], [0, 0, 1], [0, 1, 1], [2, 0, 1], [NaN, 1, 2], [0, Infinity], ['0', '2', '10'], [null, undefined, false, true], Array(3)];
  const values = [-Infinity, -10, -0, 0, .5, 1, 2, 10, Infinity, NaN, undefined, null, false, true, '2', 'bogus', 1n, Symbol('x')];
  for (const xs of cuts) for (const x of values) equivalent('terrainCell', () => [xs.slice(), x]);
  for (const xs of [null, undefined, {}, 3, '123', new Float64Array([0, 1, 2])]) equivalent('terrainCell', () => [xs, .5]);
});

test('terrain malformed data and special values keep exact results and failures', () => {
  const terrains = [saddle(), { xs: [0, 1, 2], zs: [0, 1, 3], heights: [[1, 2, 3], [4, 5, 6], [7, 8, 9]] },
    { xs: [0, 0], zs: [0, 0], heights: [[1, 2], [3, 4]] }, { xs: [2, 0], zs: [0, 1], heights: [[1, 2], [3, 4]] },
    { xs: [0, 1], zs: [0, 1], heights: [[-0, Infinity], [NaN, -Infinity]] },
    { xs: [0, 1], zs: [0, 1], heights: [['1', '2'], [null, undefined]] },
    { xs: [0, 1], zs: [0, 1], heights: [[1n, 2n], [3n, 4n]] },
    { xs: [], zs: [], heights: [] }, { xs: [0], zs: [0], heights: [[1]] },
    { xs: [0, 1], zs: [0, 1], heights: [[1], []] }, { xs: [0, 1], zs: [0, 1], heights: [null, []] },
    { xs: [0, 1], zs: [0, 1], heights: [] }, { xs: {}, zs: [], heights: [] }, {}, null, undefined];
  const values = [-Infinity, -2, -0, 0, .5, 1, 5, 10, 20, Infinity, NaN, undefined, null, false, true, '5', 'bad', 1n, Symbol('x')];
  for (const t of terrains) for (let i = 0; i < values.length; i++) {
    for (const [x, z] of [[values[i], .5], [.5, values[i]], [values[i], values[(i + 1) % values.length]]]) {
      equivalent('terrainHeight', () => [plain(t), x, z]);
    }
  }
});

test('smoothing malformed/coercible input, typed arrays, array holes and failure messages match reference', () => {
  const inputs = [[], [{ x: 1, z: 2 }], [{ x: -0, z: NaN }, { x: Infinity, z: -Infinity }],
    [{ x: '4', z: null }, { x: false, z: undefined }], [{}, {}], [null], [undefined], [1, 2], ['abc', 'd'],
    [{ x: 1n, z: 2n }, { x: 2n, z: 1n }], Array(2), null, undefined, {}, '12', new Float64Array([1, 2])];
  const iterations = [undefined, -2, -0, 0, .5, 1, 1.5, 2, 3, NaN, null, false, true, '2', 'invalid', 2n, Symbol('n')];
  for (const points of inputs) for (const n of iterations) equivalent('smoothPath', () => [plain(points), n]);
  equivalent('smoothPath', () => [[{ x: Symbol('x'), z: 0 }, { x: 0, z: 0 }], 1]);
});

function traced(value, log, path = 'arg') {
  if (!value || typeof value !== 'object') return value;
  return new Proxy(value, {
    get(target, key, receiver) {
      log.push(`${path}.${String(key)}`);
      return traced(Reflect.get(target, key, receiver), log, `${path}.${String(key)}`);
    },
    set() { assert.fail('Input write'); }, deleteProperty() { assert.fail('Input deletion'); },
    defineProperty() { assert.fail('Input definition'); },
  });
}
test('property reads, value coercion, iterator limits and thrown accessors retain evaluation order', () => {
  const cases = [
    ['terrainCell', log => [traced([0, 10, 20], log), { valueOf() { log.push('valueOf'); return 10; } }]],
    ['terrainHeight', log => [traced(saddle(), log), { valueOf() { log.push('x.valueOf'); return 7.5; } }, { valueOf() { log.push('z.valueOf'); return 5; } }]],
    ['terrainHeight', log => [traced({ xs: [0, 10], get zs() { log.push('zs.throw'); throw new RangeError('bad zs'); } }, log), 1, 2]],
    ['terrainHeight', log => [traced(saddle(), log), { valueOf() { log.push('x.throw'); throw new Error('bad x'); } }, 2]],
    ['smoothPath', log => [traced([{ x: 1, z: 2 }, { x: 3, z: 4 }], log), { valueOf() { log.push('iterations'); return 2; } }]],
    ['smoothPath', log => [traced([{ x: 1, get z() { log.push('z.throw'); throw new RangeError('bad point'); } }], log), 0]],
    ['smoothPath', log => [[{ x: { valueOf() { log.push('a.x'); return 1; } }, z: 2 }, { x: { valueOf() { log.push('b.x'); return 3; } }, z: 4 }], 2]],
  ];
  for (const [name, makeArgs] of cases) {
    const expectedLog = [], actualLog = [];
    const expected = outcome(() => reference[name](...makeArgs(expectedLog)));
    const actual = outcome(() => helpers[name](...makeArgs(actualLog)));
    assert.deepEqual(actual, expected, name);
    assert.deepEqual(actualLog, expectedLog, name);
  }
});

function rng(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
}
test('deterministic terrain/path corpus matches exactly without mutating frozen inputs', () => {
  const random = rng(0x4d4f4e54);
  const integer = n => Math.floor(random() * n);
  for (let sample = 0; sample < 240; sample++) {
    const cuts = () => Array.from({ length: 2 + integer(6) }, () => .25 + integer(80) / 4)
      .reduce((out, delta) => [...out, (out.at(-1) ?? -40) + delta], []);
    const xs = cuts(), zs = cuts();
    const t = freeze({ xs, zs, heights: zs.map(() => xs.map(() => (integer(4096) - 2048) / 16)) });
    const before = plain(t);
    for (let query = 0; query < 12; query++) {
      const x = xs[0] - 10 + random() * (xs.at(-1) - xs[0] + 20);
      const z = zs[0] - 10 + random() * (zs.at(-1) - zs[0] + 20);
      assert.equal(helpers.terrainCell(xs, x), reference.terrainCell(xs, x));
      assert.equal(helpers.terrainHeight(t, x, z), reference.terrainHeight(t, x, z));
      const cx = Math.max(xs[0], Math.min(xs.at(-1), x)), cz = Math.max(zs[0], Math.min(zs.at(-1), z));
      assert.equal(helpers.terrainHeight(t, x, z), helpers.terrainHeight(t, cx, cz));
    }
    for (let j = 0; j < zs.length; j++) for (let i = 0; i < xs.length; i++) assert.equal(helpers.terrainHeight(t, xs[i], zs[j]), t.heights[j][i]);
    assert.deepEqual(t, before);
    const points = freeze(Array.from({ length: 1 + integer(7) }, () => ({ x: integer(512) - 256, z: integer(512) - 256 })));
    const original = plain(points), iterations = integer(5);
    const actual = helpers.smoothPath(points, iterations);
    assert.deepEqual(plain(actual), plain(reference.smoothPath(points, iterations)));
    assert.equal(actual.length, points.length * 2 ** iterations);
    assert.deepEqual(plain(actual[0]), points[0]);
    assert.deepEqual(plain(actual.at(-1)), points.at(-1));
    for (const point of actual) {
      assert(point.x >= Math.min(...points.map(p => p.x)) && point.x <= Math.max(...points.map(p => p.x)));
      assert(point.z >= Math.min(...points.map(p => p.z)) && point.z <= Math.max(...points.map(p => p.z)));
      assert(!points.includes(point));
    }
    actual[0].x = 12345;
    assert.deepEqual(points, original);
    assert.deepEqual(plain(helpers.smoothPath(points, iterations)), plain(reference.smoothPath(points, iterations)));
  }
});

test('classic script exports only the frozen three-helper API without touching shell dependencies', () => {
  const sandbox = {};
  for (const name of ['B', 'document', 'localStorage', 'URL', 'worldDefinitions', 'activeMapId', 'scene', 'fetch']) {
    Object.defineProperty(sandbox, name, { get() { assert.fail(`Unexpected dependency: ${name}`); } });
  }
  vm.runInNewContext(helperSource, sandbox);
  assert.deepEqual(Object.keys(sandbox), ['MontraWorldMath']);
  assert.deepEqual(Object.keys(sandbox.MontraWorldMath), ['terrainCell', 'terrainHeight', 'smoothPath']);
  assert(Object.isFrozen(sandbox.MontraWorldMath));
  for (const [name, arity] of [['terrainCell', 2], ['terrainHeight', 3], ['smoothPath', 1]]) {
    assert.equal(sandbox.MontraWorldMath[name].name, name);
    assert.equal(sandbox.MontraWorldMath[name].length, arity);
  }
  assert.equal(sandbox.MontraWorldMath.terrainHeight(saddle(), 5, 10), 50);
  assert.throws(() => vm.runInNewContext(`${helperSource}\nMontraWorldMath.terrainCell = null;`), { name: 'TypeError' });
});

const coreSource = readFileSync(resolve(root, 'src/client/core/001-storage-and-dom.js'), 'utf8');
const shellPrefix = coreSource.slice(0, coreSource.indexOf('  const ui ='));
const slotSource = readFileSync(resolve(root, 'src/client-modules/character-slot-storage.js'), 'utf8');
test('shell binds the exact exported functions before DOM or game initialization; missing modules fail early', () => {
  const sandbox = { URL };
  Object.defineProperty(sandbox, 'document', { get() { assert.fail('DOM initialization must not have started'); } });
  Object.defineProperty(sandbox, 'localStorage', { get() { assert.fail('Storage must remain lazy'); } });
  vm.createContext(sandbox);
  vm.runInContext(slotSource, sandbox);
  vm.runInContext(helperSource, sandbox);
  vm.runInContext(require('./fixtures/item-presentation-loader.cjs').moduleSource, sandbox);
  vm.runInContext(shellPrefix, sandbox);
  for (const name of ['terrainCell', 'terrainHeight', 'smoothPath']) {
    assert.equal(vm.runInContext(name, sandbox), sandbox.MontraWorldMath[name]);
  }
  assert.equal(vm.runInContext('terrainHeight({ xs: [0, 10], zs: [0, 20], heights: [[0, 10], [20, 100]] }, 5, 10)', sandbox), 50);
  for (const missing of [undefined, null]) {
    const absent = { URL, MontraWorldMath: missing };
    Object.defineProperty(absent, 'document', { get() { assert.fail('No game initialization after missing module'); } });
    vm.createContext(absent);
    vm.runInContext(slotSource, absent);
    assert.throws(() => vm.runInContext(shellPrefix, absent), { name: 'TypeError' });
  }
});

function deferredClientScripts(html) {
  const scripts = [...html.matchAll(/<script src="([^"]+)"([^>]*)>/g)];
  const indices = ['./src/client-modules/character-slot-storage.js?', './src/client-modules/world-math.js?', './main.js?']
    .map(path => {
      const matches = scripts.map((match, index) => [match, index]).filter(([match]) => match[1].startsWith(path));
      assert.equal(matches.length, 1);
      return matches[0][1];
    });
  assert(indices[0] < indices[1] && indices[1] < indices[2]);
  for (const index of indices) {
    const attributes = scripts[index][2];
    assert.match(attributes, /\bdefer\b/i);
    assert.doesNotMatch(attributes, /\basync\b|\btype\s*=/i);
  }
  return indices.map(index => scripts[index]);
}

test('both classic modules load in order before main and use the existing load-failure handler', () => {
  const html = readFileSync(resolve(root, 'index.html'), 'utf8');
  for (const script of deferredClientScripts(html)) {
    const onerror = script[2].match(/\bonerror="([^"]+)"/i);
    assert(onerror, 'Module and shell failures must route through account entry');
    const notices = [];
    vm.runInNewContext(onerror[1], { window: { MontraEntry: { worldUnavailable(message) { notices.push(message); } } } });
    assert.equal(notices.length, 1);
    assert.equal(notices[0], 'โหลดเกมไม่สำเร็จ กรุณาลองอีกครั้ง');
    assert.doesNotThrow(() => vm.runInNewContext(onerror[1], { window: {} }));
  }
});

test('load-order assertions reject case-insensitive async and type attributes on both modules and main', () => {
  const html = readFileSync(resolve(root, 'index.html'), 'utf8');
  for (const script of deferredClientScripts(html)) {
    for (const attribute of ['async', 'ASYNC', 'aSyNc', 'type="module"', 'TYPE="module"', 'tYpE="MoDuLe"']) {
      const mutated = html.replace(script[0], script[0].replace(' defer', ` defer ${attribute}`));
      assert.throws(() => deferredClientScripts(mutated), { name: 'AssertionError' }, `${script[1]} ${attribute}`);
    }
  }
});

test('exact diagonal tie selection and coordinate read order remain observable at numeric extremes', () => {
  const t = { xs: [0, 1], zs: [0, 1], heights: [[1e308, -1e308], [1e308, 1e308]] };
  assert(Number.isNaN(helpers.terrainHeight(t, .5, .5)), '>= chooses the first triangle on an exact tie');
  equivalent('terrainHeight', () => [t, .5, .5]);
  const log = [];
  helpers.terrainHeight(saddle(), { valueOf() { log.push('x'); return 1; } }, { valueOf() { log.push('z'); return 2; } });
  assert.deepEqual(log, ['x', 'z']);
});

test('negative controls detect cell boundaries, interpolation, coercion, smoothing and mutation regressions', () => {
  const mutations = [
    ['cut equality', 'n=>n>v', 'n=>n>=v', 'terrainCell', () => [[0, 10, 20], 10]],
    ['NaN cell', 'i<0?cuts.length-2', 'i<0?0', 'terrainCell', () => [[0, 10, 20], NaN]],
    ['diagonal tie', 'u>=v?', 'u>v?', 'terrainHeight', () => [{ xs: [0, 1], zs: [0, 1], heights: [[1e308, -1e308], [1e308, 1e308]] }, .5, .5]],
    ['bilinear terrain', 'a+(u>=v?(b-a)*u+(d-b)*v:(d-c)*u+(c-a)*v)', 'a*(1-u)*(1-v)+b*u*(1-v)+c*(1-u)*v+d*u*v', 'terrainHeight', () => [saddle(), 5, 10]],
    ['height string coercion', 'return a+(', 'return Number(a)+(', 'terrainHeight', () => [{ xs: [0, 1], zs: [0, 1], heights: [["1", "5"], ["9", "13"]] }, .5, .5]],
    ['clamp removal', 'x=Math.max(t.xs[0],Math.min(t.xs.at(-1),x));', '', 'terrainHeight', () => [saddle(), -10, 10]],
    ['weight change', 'a.x * .75 + b.x * .25', 'a.x * .5 + b.x * .5', 'smoothPath', () => [[{ x: 0, z: 0 }, { x: 8, z: 8 }], 1]],
    ['fractional iterations', 'it < iterations', 'it < Math.floor(iterations)', 'smoothPath', () => [[{ x: 0, z: 0 }, { x: 8, z: 8 }], .25]],
    ['empty-path repair', 'let p = points.map', 'if (!points.length) return []; let p = points.map', 'smoothPath', () => [[], 1]],
    ['input write', 'let p = points.map', 'points[0].x = 10; let p = points.map', 'smoothPath', () => [freeze([{ x: 0, z: 0 }]), 0]],
  ];
  for (const [label, before, after, name, makeArgs] of mutations) {
    assert.equal(helperSource.split(before).length, 2, `Exactly one mutation site: ${label}`);
    const mutant = vm.runInNewContext(`${helperSource.replace(before, after)}\nMontraWorldMath;`);
    const expected = outcome(() => reference[name](...makeArgs()));
    assert.deepEqual(outcome(() => helpers[name](...makeArgs())), expected, label);
    assert.notDeepEqual(outcome(() => mutant[name](...makeArgs())), expected, `Must detect ${label}`);
  }
  const unaliased = vm.runInNewContext(`${helperSource.replace('const out = [p[0]];', 'const out = [{ ...p[0] }];')}\nMontraWorldMath;`);
  const original = helpers.smoothPath([{ x: 1, z: 2 }], 1), mutated = unaliased.smoothPath([{ x: 1, z: 2 }], 1);
  assert.equal(original[0], original[1]);
  assert.notEqual(mutated[0], mutated[1], 'Must detect changed singleton identity');
});
