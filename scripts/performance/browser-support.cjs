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
// Self-contained so Playwright can serialize it into the page. Always return
// raw evidence, including partial intervals when the unchanged deadline expires.
function sampleFrames({ count = 120, timeoutMs = 15000 } = {}) {
  return new Promise(resolve => {
    const values = []; let previous, handle, callbacks = 0;
    const started = performance.now();
    function finish(complete) {
      clearTimeout(timer); cancelAnimationFrame(handle);
      resolve({complete,reason:complete?null:'frame-sampling-timeout',requestedIntervals:count,
        timeoutMs,elapsedMs:performance.now()-started,frameCallbacks:callbacks,
        collectedIntervals:values.length,rafIntervalsMs:values});
    }
    const timer = setTimeout(() => finish(false), timeoutMs);
    function frame(t) {
      callbacks++;
      if (previous !== undefined) values.push(t - previous);
      previous = t;
      if (values.length === count) finish(true);
      else handle = requestAnimationFrame(frame);
    }
    handle = requestAnimationFrame(frame);
  });
}
// Each observation owns a fresh context. Continue to its paired variant after
// failure, but never mark an incomplete sample or cleanup failure as successful.
async function observeSafely(run, observe, cleanup, checkpoint, timeoutMs = 120000) {
  let timer;
  run.status = 'incomplete';
  try {
    await Promise.race([Promise.resolve().then(observe),new Promise((_,reject)=>{
      timer=setTimeout(()=>reject(Error('Observation deadline exceeded')),timeoutMs);
    })]);
    run.status = 'complete';
  } catch (error) {
    run.error=String(error.stack||error);
  } finally {
    clearTimeout(timer);
    checkpoint();
    let cleanupFailure,cleanupTimer;
    try { await Promise.race([Promise.resolve().then(cleanup),new Promise((_,reject)=>{
      cleanupTimer=setTimeout(()=>reject(Error('Context cleanup deadline exceeded')),10000);
    })]); }
    catch(error) { cleanupFailure=error;run.cleanupError=String(error.stack||error);run.status='incomplete'; }
    finally { clearTimeout(cleanupTimer); }
    if(run.errors?.length)run.status='incomplete';
    checkpoint();
    // Do not advance the shared static root if the old context may still exist.
    if(cleanupFailure)throw cleanupFailure;
  }
}
function assertCompleteRuns(runs, expected) {
  assert.equal(runs.length,expected,'Missing required observations');
  assert(runs.every(run=>run.status==='complete'),'Required observations incomplete; inspect raw evidence');
}
module.exports = { allowedCDNURL, assertReadyState, sampleFrames, observeSafely, assertCompleteRuns };
