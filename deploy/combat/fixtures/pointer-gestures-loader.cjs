'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
// Deliberately slice, not reimplement, the original world action and listeners.
// After extraction only this adapter should change, never the frozen oracle/tests.
function split(source) {
  const actionStart = source.indexOf('    const rect = ui.world.getBoundingClientRect();');
  const actionEnd = source.indexOf('\n  });\n  ui.world.addEventListener("pointercancel"', actionStart);
  const cameraEnd = source.indexOf('  // Direction is relative to the CURRENT camera');
  const dashStart = source.indexOf('  const dashZone = document.querySelector(".controls");');
  const dashEnd = source.indexOf('  let drawerActive = null;', dashStart);
  assert(actionStart > 0 && actionEnd > actionStart && cameraEnd > actionEnd && dashStart > cameraEnd && dashEnd > dashStart);
  return {
    worldAction: 'function onWorldTap(event) {\n' + source.slice(actionStart, actionEnd) + '\n}',
    gestures: source.slice(0, actionStart) + '    onWorldTap(event);' + source.slice(actionEnd, cameraEnd) + source.slice(dashStart, dashEnd)
  };
}
module.exports = function loadSource(source) {
  if (source !== undefined) return split(source);
  const root = path.join(__dirname, '../../..');
  const moduleSource = fs.readFileSync(path.join(root, 'src/client-modules/pointer-gestures.js'), 'utf8');
  const shell = fs.readFileSync(path.join(root, 'src/client/input/045-pointer-touch-and-dash.js'), 'utf8');
  const start = shell.indexOf('  function handleWorldTap(event) {');
  const end = shell.indexOf('  // Direction is relative to the CURRENT camera', start);
  assert(start > 0 && end > start);
  return {
    worldAction: shell.slice(start, end).replace('function handleWorldTap(', 'function onWorldTap('),
    // Execute the actual shell wiring. Only the gameplay callback is test-injected.
    gestures: moduleSource + '\n' + shell.slice(0, start) +
      'function handleWorldTap(event) { return onWorldTap(event); }\n',
  };
};
