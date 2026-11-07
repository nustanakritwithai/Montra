import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {allowedCDNURL,assertReadyState,sampleFrames,observeSafely,assertCompleteRuns}=createRequire(import.meta.url)('./browser-support.cjs');
test('CDN policy accepts only credential-free approved HTTPS GETs',()=>{
  assert(allowedCDNURL('https://cdn.babylonjs.com/babylon.js','GET'));
  assert(allowedCDNURL('https://unpkg.com/@colyseus/sdk@0.18.1/dist/colyseus.js','GET'));
  for(const url of ['https://example.com','https://cdn.babylonjs.com.evil.test/x','http://unpkg.com/x','https://user:secret@unpkg.com/x','wss://unpkg.com/x']) assert.equal(allowedCDNURL(url,'GET'),false);
  assert.equal(allowedCDNURL('https://unpkg.com/x','POST'),false);
});
test('readiness fails closed for missing startup, live mode, world errors and empty scenes',()=>{
  const ready={entryStarted:true,unavailable:null,mode:'DEMO',drawerHidden:true,meshes:101,camera:'ArcRotateCamera'};
  assertReadyState(ready);
  for(const patch of [{entryStarted:false},{unavailable:'failed'},{mode:'LIVE'},{drawerHidden:false},{meshes:0},{camera:undefined}]) assert.throws(()=>assertReadyState({...ready,...patch}));
});
test('frame sampling retains complete, partially stalled and zero-frame evidence',async()=>{
  let time=0;const oldRAF=globalThis.requestAnimationFrame,oldCancel=globalThis.cancelAnimationFrame;
  try{
    globalThis.requestAnimationFrame=callback=>setTimeout(()=>callback(time+=16),0);
    globalThis.cancelAnimationFrame=clearTimeout;
    const complete=await sampleFrames({count:3,timeoutMs:1000});
    assert.deepEqual(complete.rafIntervalsMs,[16,16,16]);
    assert.equal(complete.complete,true);assert.equal(complete.frameCallbacks,4);
    assert.equal(complete.collectedIntervals,3);assert.equal(complete.reason,null);
    let callbacks=0;
    globalThis.requestAnimationFrame=callback=>++callbacks<=3?setTimeout(()=>callback(time+=20),0):0;
    const partial=await sampleFrames({count:5,timeoutMs:50});
    assert.equal(partial.complete,false);assert.equal(partial.reason,'frame-sampling-timeout');
    assert.deepEqual(partial.rafIntervalsMs,[20,20]);assert.equal(partial.frameCallbacks,3);
    assert.equal(partial.requestedIntervals,5);assert.equal(partial.collectedIntervals,2);
    assert(partial.elapsedMs>=0);assert.equal(partial.timeoutMs,50);
    globalThis.requestAnimationFrame=()=>0;
    const stalled=await sampleFrames({count:3,timeoutMs:5});
    assert.equal(stalled.complete,false);assert.equal(stalled.frameCallbacks,0);
    assert.deepEqual(stalled.rafIntervalsMs,[]);assert.equal(stalled.collectedIntervals,0);
  }finally{globalThis.requestAnimationFrame=oldRAF;globalThis.cancelAnimationFrame=oldCancel;}
});
test('failed candidate preserves partial evidence and still attempts paired baseline, but aggregate fails',async()=>{
  const runs=[],visited=[],cleaned=[];let checkpoints=0;
  for(const label of ['candidate','baseline']){
    const run={label,errors:[],snapshots:[]};runs.push(run);
    await observeSafely(run,async()=>{
      visited.push(label);
      run.snapshots.push({complete:label==='baseline',rafIntervalsMs:[200]});
      if(label==='candidate')throw Error('Incomplete frame sample');
    },async()=>{cleaned.push(label);},()=>{checkpoints++;});
  }
  assert.deepEqual(visited,['candidate','baseline']);assert.deepEqual(cleaned,visited);
  assert.equal(runs[0].status,'incomplete');assert.match(runs[0].error,/Incomplete frame sample/);
  assert.deepEqual(runs[0].snapshots[0].rafIntervalsMs,[200]);
  assert.equal(runs[1].status,'complete');assert.equal(checkpoints,4);
  assert.throws(()=>assertCompleteRuns(runs,2),/incomplete/);
  assertCompleteRuns([runs[1]],1);
  assert.throws(()=>assertCompleteRuns([runs[1]],2),/Missing/);
});
test('observation watchdog and cleanup errors remain failures',async()=>{
  let cleaned=false;const stalled={errors:[]};
  await observeSafely(stalled,()=>new Promise(()=>{}),async()=>{cleaned=true;},()=>{},5);
  assert(cleaned);assert.equal(stalled.status,'incomplete');assert.match(stalled.error,/deadline exceeded/);
  const cleanupFailure={errors:[]};
  await assert.rejects(observeSafely(cleanupFailure,async()=>{},async()=>{throw Error('close failed');},()=>{}),/close failed/);
  assert.equal(cleanupFailure.status,'incomplete');assert.match(cleanupFailure.cleanupError,/close failed/);
  const lateError={errors:[]};
  await observeSafely(lateError,async()=>{},async()=>{lateError.errors.push('late route error');},()=>{});
  assert.equal(lateError.status,'incomplete');
});
