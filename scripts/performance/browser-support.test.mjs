import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {allowedCDNURL,assertReadyState,sampleFrames}=createRequire(import.meta.url)('./browser-support.cjs');
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
test('frame sampling preserves raw deltas and times out when rendering stalls',async()=>{
  let time=0;const oldRAF=globalThis.requestAnimationFrame,oldCancel=globalThis.cancelAnimationFrame;
  try{
    globalThis.requestAnimationFrame=callback=>setTimeout(()=>callback(time+=16),0);
    globalThis.cancelAnimationFrame=clearTimeout;
    assert.deepEqual(await sampleFrames({count:3,timeoutMs:1000}),[16,16,16]);
    globalThis.requestAnimationFrame=()=>0;
    await assert.rejects(sampleFrames({count:3,timeoutMs:5}),/Timed out/);
  }finally{globalThis.requestAnimationFrame=oldRAF;globalThis.cancelAnimationFrame=oldCancel;}
});
