const assert = require('node:assert/strict');
const CDN_ORIGINS = new Set(['https://cdn.babylonjs.com', 'https://unpkg.com']);
function allowedCDNURL(url, method) {
  const parsed = new URL(url);
  return method === 'GET' && CDN_ORIGINS.has(parsed.origin) && !parsed.username && !parsed.password;
}
function assertReadyState(state) {
  assert.equal(state.entryStarted, true, 'DEMO startup callback did not run');
  assert.equal(state.unavailable, null, 'World reported unavailable');
  assert.equal(state.mode, 'DEMO', 'Expected isolated DEMO mode');
  assert.equal(state.drawerHidden, true, 'Drawer must start closed');
  assert(state.meshes > 100, 'Expected populated DEMO scene');
  assert.equal(typeof state.camera, 'string', 'Expected active camera');
}
// Self-contained so Playwright can serialize it into the page. A stalled render
// loop must fail in time to persist partial evidence instead of hanging the job.
function sampleFrames({ count = 120, timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const values = []; let previous, handle;
    const timer = setTimeout(() => { cancelAnimationFrame(handle); reject(Error('Timed out sampling animation frames')); }, timeoutMs);
    function frame(t) {
      if (previous !== undefined) values.push(t - previous);
      previous = t;
      if (values.length === count) { clearTimeout(timer); resolve(values); }
      else handle = requestAnimationFrame(frame);
    }
    handle = requestAnimationFrame(frame);
  });
}
module.exports = { allowedCDNURL, assertReadyState, sampleFrames };
