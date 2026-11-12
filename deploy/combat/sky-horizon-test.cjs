const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');

const source = readFileSync('src/client/render/012-sky-mist-atmosphere.js', 'utf8');
const part = (start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert(from >= 0 && to > from, start);
  return source.slice(from, to);
};

class Color {
  constructor(r, g, b, a) { Object.assign(this, {r, g, b, a}); }
  static Black() { return new Color(0, 0, 0); }
  static FromHexString(hex) {
    const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
    return new Color(...rgb);
  }
  add(other) { return new Color(this.r + other.r, this.g + other.g, this.b + other.b); }
  scale(level) { return new Color(this.r * level, this.g * level, this.b * level); }
  toHexString() {
    return '#' + [this.r, this.g, this.b].map(value => Math.round(value * 255).toString(16).padStart(2, '0')).join('');
  }
}

function fixture(openGLUVs = false) {
  const uploads = [];
  const paint = () => ({
    createLinearGradient(x0, y0, x1, y1) {
      const stops = [];
      return { y0, y1, stops, addColorStop: (offset, color) => stops.push({offset, color}) };
    },
    createRadialGradient() { return {addColorStop() {}}; },
    fillRect(x, y, width, height) { this.lastFill = {x, y, width, height, gradient: this.fillStyle}; },
    clearRect() {}, drawImage() {}, beginPath() {}, arc() {}, fill() {}, ellipse() {},
  });
  const B = {
    Color3:Color, Color4:Color, CompatibilityOptions:{UseOpenGLOrientationForUV:openGLUVs},
    DynamicTexture:class {
      constructor() { this.context = paint(); this.vScale = 1; this.vOffset = 0; this.level = 1; }
      getContext() { return this.context; }
      update() { uploads.push(this.context.lastFill); }
    },
    StandardMaterial:class {},
    Mesh:{BACKSIDE:1},
    MeshBuilder:{CreateSphere:() => ({setEnabled(enabled) { this.enabled = enabled; }})},
  };
  const scene = {};
  const mistMat = {};
  const messages = [];
  const context = vm.createContext({
    B, scene, noise: () => .5, document:{createElement:() => ({getContext:paint}), querySelector:() => null},
    localStorage:{getItem:() => 'bright', setItem() {}}, window:{},
    grade:{}, moon:{}, keyLight:{}, warm:{}, mistMat, motes:{},
    floatAtPlayer(_id, message) { messages.push(message); }, triggerCombatCallout() {}, SFX() {}, localId:'test',
  });
  const api = vm.runInContext([
    part('  // Night sky', '  // Only lanterns'),
    part('  const ATMOSPHERES', '  applyAtmosphere("ritual_village");'),
    'applyAtmosphere("ritual_village"); ({sky, skyTexture, applyAtmosphere, setLightLevel, setWeather})',
  ].join('\n'), context);
  return {...api, scene, uploads, mistMat, messages};
}

function assertFogHorizon(f) {
  const fill = f.uploads.at(-1);
  const fog = f.scene.fogColor.toHexString();
  assert.deepEqual(fill.gradient.stops, [{offset:0, color:fog + '00'}, {offset:1, color:fog}]);
  assert(fill.gradient.y0 < 256 && fill.gradient.y1 < 256, 'haze becomes solid before the sphere equator');
  assert.equal(fill.y + fill.height, 512, 'haze covers the whole lower hemisphere');
  assert.equal(f.skyTexture.level, 1, 'horizon colour reaches the material without scaling');
  const {r, g, b} = f.scene.fogColor;
  assert.deepEqual(f.scene.clearColor, new Color(r, g, b, 1));
}

test('the sky equator matches far fog and updates only when its colours change', () => {
  const f = fixture();
  assert.equal(f.sky.enabled, true);
  assertFogHorizon(f);
  const village = f.scene.fogColor.toHexString();
  f.applyAtmosphere('ritual_village');
  const clearMist = f.mistMat.alpha;
  assert.equal(f.setWeather('rain'), true);
  assert.equal(f.mistMat.alpha, clearMist);
  assert.deepEqual(f.messages, []);
  assert.equal(f.uploads.length, 1);
  f.applyAtmosphere('drowned_marsh');
  assert.notEqual(f.scene.fogColor.toHexString(), village);
  assertFogHorizon(f);
  f.setLightLevel('night');
  assertFogHorizon(f);
  assert.equal(f.uploads.length, 3);
  assert.equal(f.sky.material.disableDepthWrite, true);
});

test('the cave hides the dome in all weather and returning outside restores the blood-moon sky', () => {
  const f = fixture();
  f.applyAtmosphere('naga_cavern');
  assert.equal(f.sky.enabled, false);
  f.setWeather('blood_moon');
  assert.equal(f.sky.enabled, false);
  assert.equal(f.uploads.length, 1);
  f.applyAtmosphere('ritual_village');
  assert.equal(f.sky.enabled, true);
  assert(f.scene.fogColor.r > f.scene.fogColor.g);
  assertFogHorizon(f);
  f.setWeather('clear');
  assertFogHorizon(f);
});

test('sphere UV conventions keep the moon and stars above the equator', () => {
  const standard = fixture().skyTexture;
  const openGL = fixture(true).skyTexture;
  assert.equal(0 * standard.vScale + standard.vOffset, 1);
  assert.equal(1 * openGL.vScale + openGL.vOffset, 1);
  assert.equal(.5 * standard.vScale + standard.vOffset, .5);
  assert.equal(.5 * openGL.vScale + openGL.vOffset, .5);
});
