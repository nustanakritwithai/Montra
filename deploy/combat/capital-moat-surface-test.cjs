const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const village = readFileSync(join(__dirname, '../../src/client/world/014-ritual-village.js'), 'utf8');
const materials = readFileSync(join(__dirname, '../../src/client/render/006-materials-atmosphere.js'), 'utf8');
const rippleStart = village.indexOf('  // Living water:');
const rippleEnd = village.indexOf('  const lotusPad', rippleStart);
const paintStart = materials.indexOf('  function paintTexture(');
const paintEnd = materials.indexOf('  // Deterministic noise', paintStart);
assert.ok(rippleStart >= 0 && rippleEnd > rippleStart && paintStart >= 0 && paintEnd > paintStart, 'ripple fixture boundaries');

const source = readFileSync(join(__dirname, '../../src/client/world/017-region-terrain.js'), 'utf8');
const start = source.indexOf('  function waterAreaContains(');
const end = source.indexOf('  // Clip each footprint', start);
assert.ok(start >= 0 && end > start, 'water rendering fixture boundaries');

class Color3 {
  static FromHexString(hex) { return { hex, r: 0, g: 0, b: 0 }; }
  static LerpToRef(from, to, factor, out) {
    for (const key of ['r', 'g', 'b']) out[key] = from[key] + (to[key] - from[key]) * factor;
  }
}
const meshes = [];
const B = {
  Color3,
  Material: { MATERIAL_OPAQUE: 0, MATERIAL_ALPHABLEND: 2 },
  Mesh: class { constructor() { meshes.push(this); } },
  StandardMaterial: class {},
  DynamicTexture: class {
    ready = false;
    getContext() {
      return { fillRect() {}, beginPath() {}, moveTo() {}, quadraticCurveTo() {}, stroke() {} };
    }
    update() { this.ready = true; }
    clone() { return new B.DynamicTexture(); }
  },
  VertexData: class { applyToMesh(mesh) { mesh.data = this; } },
};
const cuts = [-8, -6, -4, -2, 0, 2, 4, 6, 8];
const map = {
  id: 'mantra_capital',
  terrain: { xs: cuts, zs: cuts, heights: cuts.map(z => cuts.map(x => Math.max(Math.abs(x), Math.abs(z)) === 6 ? -1 : 0)) },
  water: [
    { x: -8, z: -8, width: 16, length: 4 },
    { x: -8, z: 4, width: 16, length: 4 },
    { x: -8, z: -8, width: 4, length: 16 },
    { x: 4, z: -8, width: 4, length: 16 },
  ],
  boatLanes: [
    [{ x: -6, z: -6 }, { x: 6, z: -6 }],
    [{ x: 6, z: -6 }, { x: 6, z: 6 }],
    [{ x: 6, z: 6 }, { x: -6, z: 6 }],
    [{ x: -6, z: 6 }, { x: -6, z: -6 }],
  ],
  waterLevel: .025,
};
const { riverRipple } = vm.runInNewContext(
  materials.slice(paintStart, paintEnd) + village.slice(rippleStart, rippleEnd) + '\n({riverRipple})',
  { B, scene: {}, noise: () => .5, water: { clone: () => ({}) }, riverSurface: {} },
);
assert.equal(riverRipple.ready, true, 'the ripple canvas must be uploaded before it can render');
vm.runInNewContext(source.slice(start, end) + '\nbuildWaterSurface(map);', {
  B, map, scene: {}, riverRipple, expansionRoot: {}, expansionResources: [],
});

assert.equal(meshes.length, 1, 'one moat mesh for the whole ring');
const mesh = meshes[0];
assert.equal(mesh.material.emissiveTexture, riverRipple);
assert.equal(mesh.material.transparencyMode, B.Material.MATERIAL_OPAQUE);
assert.equal(mesh.material.backFaceCulling, false);
assert.equal(mesh.hasVertexAlpha, false);
assert.equal(mesh.isPickable, false);
const { positions, indices } = mesh.data;
const vertices = indices.map(i => [positions[i * 3], positions[i * 3 + 2]]);
const edge = ([ax, az], [bx, bz], x, z) => (bx - ax) * (z - az) - (bz - az) * (x - ax);
function covers(x, z) {
  for (let i = 0; i < vertices.length; i += 3) {
    const [a, b, c] = vertices.slice(i, i + 3);
    if (Math.abs(edge(a, b, ...c)) < 1e-8) continue;
    const sides = [edge(a, b, x, z), edge(b, c, x, z), edge(c, a, x, z)];
    if (sides.every(s => s >= -1e-8) || sides.every(s => s <= 1e-8)) return true;
  }
  return false;
}
for (const [from, to] of map.boatLanes) {
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    assert.ok(covers(from.x + (to.x - from.x) * t, from.z + (to.z - from.z) * t), 'continuous moat surface');
  }
}
assert.equal(covers(0, 0), false, 'city interior stays dry');
console.log('PASS capital moat has a continuous opaque surface and a dry interior');
