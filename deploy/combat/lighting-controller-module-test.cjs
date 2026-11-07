'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const load=require('./fixtures/lighting-controller-loader.cjs');
const harness=require('./fixtures/lighting-controller-harness.cjs');
const read=file=>fs.readFileSync(file,'utf8');
const moduleSource=read('src/client-modules/lighting-controller.js');
const shell=read('src/client/render/004-scene-camera-lights.js');
let groups=0;
function test(name,fn){fn();groups++;console.log('PASS '+name);}
function ready(){const h=harness(load());assert.ifError(h.initError);return h;}

test('classic script has no browser or Babylon effects until the old initialization site',()=>{
 const env={};for(const name of ['B','engine','scene','camera','activeMapId','sky','mistLayers','matchMedia','location','URLSearchParams'])Object.defineProperty(env,name,{get(){assert.fail('eager dependency '+name);}});
 vm.createContext(env);vm.runInContext(moduleSource,env);assert(Object.isFrozen(env.MontraLightingController));assert.deepEqual(Object.keys(env.MontraLightingController),['create']);
 assert.match(read('main.js'),/\(\(\) => \{\n  "use strict";/);assert.match(moduleSource,/\n"use strict";\n/);
 assert.equal(shell.indexOf('  const lightingController ='),shell.indexOf('globalThis.MontraLightingController.create')-'  const lightingController = '.length);
 const prefix=shell.slice(0,shell.indexOf('  const lightingController ='));
 assert(prefix.includes('function applyCameraShake(dt)'));assert(!prefix.includes('MontraLightingController'));
 const missing=harness(shell.slice(shell.indexOf('  const lightingController =')));assert.equal(missing.initError?.name,'TypeError');assert.equal(missing.lights.length,0);assert.equal(missing.listeners.length,0);
 const html=read('index.html');const tag=html.split('\n').find(line=>line.includes('./src/client-modules/lighting-controller.js?'));assert(tag);assert(tag.includes(' defer '));assert(tag.includes('MontraEntry?.worldUnavailable'));
 for(const file of ['src/client/world/019-state-and-portals.js','src/client/core/059-frame-loop-and-startup.js','src/client/render/004-scene-camera-lights.js'])assert.doesNotMatch(read(file),/\b(?:lightSpots|shadowSyncIn|shadowGen|lanternPick|frameWatch)\b/);
});
test('frozen narrow API exposes stable mutable lights, not bookkeeping',()=>{
 const h=ready(),api=vm.runInContext('lightingController',h.context);
 assert(Object.isFrozen(api));assert.deepEqual(Object.keys(api),['moon','keyLight','warm','MAX_LIGHTS','followShadow','syncShadowLists','watchFrameRate','addLightSpot','addMovingLight','updateLanternLights','clearTransientLightSpots','tickShadows']);
 for(const key of ['moon','keyLight','warm']){assert.equal(api[key],h.api[key]);assert(!Object.isFrozen(api[key]));}
 for(const [name,length]of [['followShadow',1],['syncShadowLists',0],['watchFrameRate',1],['addLightSpot',3],['addMovingLight',2],['updateLanternLights',3],['clearTransientLightSpots',0],['tickShadows',1]]){assert.equal(api[name].name,name);assert.equal(api[name].length,length);assert.equal(h.api[name].length,length);}
 assert.throws(()=>{api.moon={};},TypeError);h.api.moon.intensity=2;assert.equal(api.moon.intensity,2);
});
test('two factories in one realm retain independent timers, registries and material observers',()=>{
 const h=ready();const second=vm.runInContext(`MontraLightingController.create({B,engine,scene,camera,getActiveMapId:()=>activeMapId,getSky:()=>sky,getMistLayers:()=>mistLayers,getMatchMedia:()=>matchMedia,getLocation:()=>location,getURLSearchParams:()=>URLSearchParams})`,h.context);
 assert.notEqual(second.moon,h.api.moon);assert.notEqual(second.updateLanternLights,h.api.updateLanternLights);assert.equal(h.listeners.length,2);
 h.api.addLightSpot(0,2,0);h.api.updateLanternLights({x:0,y:0,z:0},.1,0);second.updateLanternLights({x:0,y:0,z:0},.1,0);
 assert.equal(h.lights[3].metadata.level,.25);assert(h.lights[3].metadata.spot);assert(h.lights.slice(9).every(l=>l.metadata.spot===null));
 second.addLightSpot(0,4,0);second.updateLanternLights({x:0,y:0,z:0},.4,0);assert.equal(h.lights[9].metadata.spot.y,4);assert.equal(h.lights[3].metadata.spot.y,2);
 second.clearTransientLightSpots();assert(h.lights[3].metadata.spot);second.watchFrameRate(4);second.watchFrameRate(4);assert.equal(h.generators[1].getShadowMap().refreshRate,2);assert.equal(h.generators[0].getShadowMap().refreshRate,1);h.api.tickShadows(0);second.tickShadows(0);assert.notEqual(h.generators[0].getShadowMap().renderList,h.generators[1].getShadowMap().renderList);const m={maxSimultaneousLights:0};for(const listener of h.listeners){listener(m);assert.equal(m.maxSimultaneousLights,7);}
});
test('later sky/mist lexical bindings remain TDZ during factory initialization',()=>{
 for(const name of ['Sky','Mist']){
  const h=ready();h.raw.get(h.scene).meshes=[h.mesh('tree')];
  h.context.capture=value=>{h.captured=value;};
  vm.runInContext(`(() => {
    const earlySky={};
    const api=MontraLightingController.create({B,engine,scene,camera,getActiveMapId:()=>activeMapId,getSky:()=>${name==='Sky'?'laterSky':'earlySky'},getMistLayers:()=>laterMist,getMatchMedia:()=>matchMedia,getLocation:()=>location,getURLSearchParams:()=>URLSearchParams});
    let failure;
    try { api.syncShadowLists(); } catch (error) { failure=error; }
    const laterSky={}; const laterMist=[];
    capture({failure,sync:api.syncShadowLists});
  })()`,h.context);
  assert.equal(h.captured.failure?.name,'ReferenceError');assert.match(h.captured.failure.message,new RegExp('later'+name));
  h.state.activeMapId='retry';assert.doesNotThrow(()=>h.captured.sync());assert.equal(h.generators[1].getShadowMap().renderList.length,1);
 }
});
test('actual frame slice preserves atmosphere writes, sync cadence and neighboring calls',()=>{
 const h=ready(),frame=read('src/client/core/059-frame-loop-and-startup.js');
 const start=frame.indexOf('    driftClouds(camera.target, elapsed);'),end=frame.indexOf('    motes.emitter',start);assert(start>0&&end>start);
 h.raw.get(h.camera).target={x:0,y:0,z:0};const order=[];
 Object.assign(h.context,{dt:.1,elapsed:3,performance:{now:()=>5},atmosphere:{keyI:.8},cloudCover:.4,
  driftClouds(){order.push('clouds');},updateStrikeLight(){order.push('strike');},stormFlash(){order.push('storm');},
  rippleTexture:{vOffset:0},riverRipple:{uOffset:0},
 });
 h.state.sky={setEnabled(){order.push('sky');}};
 h.raw.get(h.scene).meshes=[h.mesh('tree',{getBoundingInfo(){order.push('shadows');return {boundingBox:{maximumWorld:{y:1},minimumWorld:{y:0}}};}})];
 vm.runInContext(frame.slice(start,end),h.context);assert.deepEqual(order,['clouds','strike','storm','shadows','sky']);assert.equal(h.api.keyLight.intensity,.8*1.65*(1-.22*.4));assert.equal(h.context.rippleTexture.vOffset,.1*.025);assert.equal(h.context.riverRipple.uOffset,.1*.012);
 order.length=0;vm.runInContext(frame.slice(start,end),h.context);assert.deepEqual(order,['clouds','strike','storm','sky']);
});
test('actual world teardown retains backward clear at its original call point',()=>{
 const h=ready(),world=read('src/client/world/019-state-and-portals.js');h.state.activeMapId='forest';h.api.addLightSpot(0,2,0);
 const order=[];Object.assign(h.context,{expansionRoot:{getChildren(){return [{dispose(){order.push('child');}}];}},expansionResources:[{dispose(){order.push('resource');}}],expansionLabels:[1],mapBounds(){order.push('bounds');return {};}});
 const start=world.indexOf('    for(const child of expansionRoot.getChildren())'),end=world.indexOf('    ground.scaling.x',start);assert(start>0&&end>start);
 vm.runInContext(world.slice(start,end),h.context);assert.deepEqual(order,['child','resource','bounds']);assert.equal(h.context.expansionResources.length,0);assert.equal(h.context.expansionLabels.length,0);
 h.api.updateLanternLights({x:0,y:0,z:0},.4,0);assert(h.pool().every(l=>l.metadata.spot===null));
});
console.log(`Lighting module: ${groups} API, lazy-boundary and shell integration groups passed.`);
