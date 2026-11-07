// Reference captured from 4184918c439497751e29ed9b7340efc13c2db483 before runtime changes.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const names = 'moon, keyLight, warm, MAX_LIGHTS, followShadow, syncShadowLists, watchFrameRate, addLightSpot, addMovingLight, updateLanternLights, clearTransientLightSpots, tickShadows';
module.exports = function load(reference) {
  if (reference !== undefined) return reference + '\n;({ ' + names + ' });';
  const fragment = read('src/client/render/004-scene-camera-lights.js');
  if (fragment.includes('  const lightingController =')) {
    return read('src/client-modules/lighting-controller.js') + '\n' + fragment.slice(fragment.indexOf('  const lightingController =')) + '\n;({ ' + names + ' });';
  }
  const block = fragment.slice(fragment.indexOf('  const moon ='));
  const clear = read('src/client/world/019-state-and-portals.js').split('\n').find(line => line.includes('for(let i=lightSpots.length-1;'));
  const tick = read('src/client/core/059-frame-loop-and-startup.js').split('\n').find(line => line.includes('if ((shadowSyncIn -= dt)'));
  if (!block || !clear || !tick) throw Error('Expected original lighting source');
  return block + '\n  function clearTransientLightSpots() {\n' + clear + '\n  }\n  function tickShadows(dt) {\n' + tick + '\n  }\n;({ ' + names + ' });';
};
