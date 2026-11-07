'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const load=require('./fixtures/lighting-controller-loader.cjs');
const harness=require('./fixtures/lighting-controller-harness.cjs');
const reference=fs.readFileSync(require.resolve('./fixtures/lighting-controller-reference.js'),'utf8');
assert.equal(crypto.createHash('sha256').update(reference).digest('hex'),'12640d898b8a4d40cd4a97aed28c1956356ea5cbe16ec325965e3878f221be95');
const cases=[];
function test(name,fn){cases.push([name,fn]);}
function ready(s,options){const h=harness(s,options);assert.ifError(h.initError);return h;}
const close=(a,b)=>assert(Math.abs(a-b)<1e-10,`${a} != ${b}`);
const target={x:0,y:0,z:0};
const poolSpots=h=>h.pool().map(l=>h.raw.get(l).metadata.spot);
function tick(h,dt=.4,t=0,at=target){h.api.updateLanternLights(at,dt,t);}

test('construction order, values, engine branch and shared light identities',s=>{
 const h=ready(s);assert.deepEqual(h.lights.map(l=>h.raw.get(l).name),['moon','canopy light','lantern glow','lantern light 0','lantern light 1','lantern light 2']);
 assert.equal(h.api.moon,h.lights[0]);assert.equal(h.api.keyLight,h.lights[1]);assert.equal(h.api.warm,h.lights[2]);assert.equal(h.api.MAX_LIGHTS,7);
 const moon=h.raw.get(h.api.moon),key=h.raw.get(h.api.keyLight),warm=h.raw.get(h.api.warm),gen=h.raw.get(h.generators[0]);
 assert.equal(moon.intensity,.85);assert.equal(h.raw.get(moon.diffuse).hex,'#c9dacc');assert.equal(h.raw.get(moon.groundColor).hex,'#617362');
 assert.equal(key.intensity,.45);assert.equal(h.raw.get(key.diffuse).hex,'#f6e3c5');assert.equal(key.shadowEnabled,true);assert.equal(key.autoUpdateExtends,false);assert.equal(key.autoCalcShadowZBounds,false);
 assert.deepEqual([key.shadowMinZ,key.shadowMaxZ,key.orthoLeft,key.orthoBottom,key.orthoRight,key.orthoTop],[1,180,-38,-38,38,38]);
 assert.equal(warm.intensity,.75);assert.equal(warm.range,15);assert.equal(h.raw.get(warm.diffuse).hex,'#f6b16d');
 assert.equal(gen.light,h.api.keyLight);assert.equal(gen.size,2048);assert.equal(gen.fullFloat,true);assert.equal(gen.usePercentageCloserFiltering,true);assert.equal(gen.filteringQuality,'QUALITY_LOW');assert.equal(gen.usePoissonSampling,undefined);
 assert.deepEqual([gen.bias,gen.normalBias,gen.darkness],[.0016,.025,0]);
 for(const l of h.pool()){const p=h.raw.get(l);assert.equal(p.range,11);assert.equal(p.intensity,0);assert.deepEqual({...h.raw.get(p.position)},{x:0,y:-40,z:0});assert.deepEqual({...p.metadata},{spot:null,level:0});assert.deepEqual({...h.raw.get(p.specular)},{r:.08,g:.06,b:.04});}
 const legacy=ready(s,{webGLVersion:1});assert.equal(h.raw.get(legacy.generators[0]),undefined);assert.equal(legacy.raw.get(legacy.generators[0]).usePoissonSampling,true);
});
test('coarse and low maximum texture branch preserves short circuit and exact boundary',s=>{
 for(const [coarse,maxTextureSize,size,caps]of[[true,8192,1024,false],[false,4095,1024,true],[false,4096,2048,true]]){const h=ready(s,{coarse,maxTextureSize});assert.equal(h.raw.get(h.generators[0]).size,size);assert.equal(h.log.some(e=>e[0]==='caps'),caps);}
});
test('material observer is live, synchronous, inherited-property aware and strict',s=>{
 const atAdd={maxSimultaneousLights:1};const h=ready(s,{materialAtAdd:atAdd});assert.equal(atAdd.maxSimultaneousLights,7);assert.equal(h.listeners.length,1);
 const m=Object.create({maxSimultaneousLights:2});h.listeners[0].call({},m);assert.equal(m.maxSimultaneousLights,7);assert(Object.hasOwn(m,'maxSimultaneousLights'));
 const plain={};h.listeners[0](plain);assert.deepEqual(plain,{});assert.throws(()=>h.listeners[0](null),{name:'TypeError'});assert.throws(()=>h.listeners[0](Object.freeze({maxSimultaneousLights:1})),{name:'TypeError'});
 const frozen=harness(s,{freezeLight:'moon'});assert.equal(frozen.initError?.name,'TypeError');assert.equal(frozen.lights.length,1);
});
test('shadow zoom threshold is strictly greater than two; snapped position and clamps',s=>{
 const h=ready(s);const key=h.raw.get(h.api.keyLight);h.camera.radius=40/.52;h.api.followShadow({x:.10,y:7,z:-.13});assert.equal(key.orthoRight,38);
 const d=Math.hypot(-1,-1,-.38),snap=76/2048,pos=h.raw.get(key.position);close(pos.x,Math.round(.10/snap)*snap+90/d);close(pos.y,7+90/d);close(pos.z,Math.round(-.13/snap)*snap+.38*90/d);
 h.camera.radius=40.01/.52;h.api.followShadow(target);close(key.orthoRight,40.01);h.camera.radius=-100;h.api.followShadow(target);assert.equal(key.orthoRight,20);h.camera.radius=1000;h.api.followShadow(target);assert.equal(key.orthoRight,48);
 h.camera.radius=NaN;h.api.followShadow(target);assert.equal(key.orthoRight,48);assert.throws(()=>h.api.followShadow(null),{name:'TypeError'});
});
test('shadow filter order, height/name exclusions and receives independently of casting',s=>{
 const h=ready(s),mesh=(name,p)=>h.mesh(name,p);const sky=mesh('sky');h.state.sky=sky;const mist=mesh('mist');h.state.mistLayers=[mist];
 const kept=mesh('tree'),short=mesh('short',{getBoundingInfo(){return {boundingBox:{maximumWorld:{y:.35},minimumWorld:{y:0}}};}}),ground=mesh('ROAD roof'),noBounds=mesh('no bounds',{getBoundingInfo:undefined});
 const skipped=[mesh('no material',{material:null}),sky,mesh('tagged',{metadata:{noShadow:true}}),mesh('faded',{visibility:.499}),mesh('unlit',{material:{disableLighting:true}}),mesh('additive',{material:{alphaMode:'ALPHA_ADD'}}),mist];
 h.raw.get(h.scene).meshes=[...skipped,kept,short,ground,noBounds];h.api.syncShadowLists();assert.deepEqual(Array.from(h.map().renderList),[kept]);
 for(const m of skipped)assert.equal(h.raw.get(m).receiveShadows,undefined);for(const m of [kept,short,ground,noBounds])assert.equal(h.raw.get(m).receiveShadows,true);
 h.state.activeMapId='new';h.raw.get(h.scene).meshes=[mesh('threshold',{visibility:.5,getBoundingInfo(){return {boundingBox:{maximumWorld:{y:.35001},minimumWorld:{y:0}}};}})];h.api.syncShadowLists();assert.equal(h.map().renderList.length,1);
});
test('cache depends only on count/map and is set before failing traversal',s=>{
 const h=ready(s),a=h.mesh('a');h.raw.get(h.scene).meshes=[a];h.api.syncShadowLists();const first=h.map().renderList;h.raw.get(h.scene).meshes=[h.mesh('replacement')];h.api.syncShadowLists();assert.equal(h.map().renderList,first);
 h.state.activeMapId='forest';h.api.syncShadowLists();assert.equal(h.map().renderList[0],h.raw.get(h.scene).meshes[0]);
 h.state.activeMapId='broken';h.raw.get(h.scene).meshes=[h.mesh('bad',{getBoundingInfo(){throw Error('bounds failure');}})];assert.throws(()=>h.api.syncShadowLists(),/bounds failure/);assert.doesNotThrow(()=>h.api.syncShadowLists());
 h.raw.get(h.scene).meshes.push(h.mesh('later'));assert.throws(()=>h.api.syncShadowLists(),/bounds failure/);
});
test('sky and mist remain lazy including empty meshes and filter short circuits',s=>{
 const h=ready(s,{tdz:'sky'});h.api.syncShadowLists();h.raw.get(h.scene).meshes=[h.mesh('unlit',{material:null})];h.api.syncShadowLists();h.raw.get(h.scene).meshes.push(h.mesh('real'));assert.throws(()=>h.api.syncShadowLists(),/sky/);
 h.options.tdz='mistLayers';h.state.activeMapId='next';assert.throws(()=>h.api.syncShadowLists(),/mistLayers/);h.options.tdz=null;h.state.activeMapId='again';h.api.syncShadowLists();
});
test('half-second sync timer resets before failure and does not catch up',s=>{
 const h=ready(s);h.api.tickShadows(0);assert.equal(h.log.filter(e=>e[0]==='shadowMap').length,1);h.state.activeMapId='changed';h.api.tickShadows(.499);assert.equal(h.log.filter(e=>e[0]==='shadowMap').length,1);h.api.tickShadows(.0011);assert.equal(h.log.filter(e=>e[0]==='shadowMap').length,2);
 h.state.activeMapId='failure';h.raw.get(h.scene).meshes=[h.mesh('bad',{getBoundingInfo(){throw Error('bounds failure');}})];assert.throws(()=>h.api.tickShadows(.5),/bounds failure/);h.raw.get(h.scene).meshes.push(h.mesh('extra'));assert.doesNotThrow(()=>h.api.tickShadows(.1));assert.throws(()=>h.api.tickShadows(9),/bounds failure/);
});
test('URL override exact off and any nonempty preference prevents adaptation',s=>{
 for(const search of ['?shadows=off','?shadows=on','?shadows=0','?shadows=OFF']){const h=ready(s,{search});for(let i=0;i<20;i++)h.api.watchFrameRate(4);assert.equal(h.api.keyLight.shadowEnabled,search!=='?shadows=off');assert.equal(h.map().refreshRate,1);}
 for(const search of ['', '?shadows=']){const h=ready(s,{search});h.api.watchFrameRate(4);assert.equal(h.map().refreshRate,1);h.api.watchFrameRate(4);assert.equal(h.map().refreshRate,2);assert.equal(h.api.keyLight.shadowEnabled,true);h.api.watchFrameRate(4);h.api.watchFrameRate(4);assert.equal(h.api.keyLight.shadowEnabled,false);}
});
test('FPS threshold, window and consecutive slow windows including recovery',s=>{
 const h=ready(s);for(let i=0;i<87;i++)h.api.watchFrameRate(0);h.api.watchFrameRate(4); // exactly 22 FPS resets slow count
 h.api.watchFrameRate(3.999);assert.equal(h.map().refreshRate,1);h.api.watchFrameRate(.0011);assert.equal(h.map().refreshRate,1);
 for(let i=0;i<100;i++)h.api.watchFrameRate(0);h.api.watchFrameRate(4);h.api.watchFrameRate(4);assert.equal(h.map().refreshRate,1);h.api.watchFrameRate(4);assert.equal(h.map().refreshRate,2);
 const odd=ready(s,{refreshRate:0});odd.api.watchFrameRate(4);odd.api.watchFrameRate(4);assert.equal(odd.api.keyLight.shadowEnabled,false);
});
test('registry defaults, stable ties, strict spatial cutoff and map visibility',s=>{
 const h=ready(s);h.api.addLightSpot(1,2,0);h.api.addLightSpot(-1,3,0,'#222222',2);h.api.addLightSpot(0,4,1,'#333333',3);h.api.addLightSpot(0,5,-1,'#444444',4);h.api.addLightSpot(34,6,0);h.state.activeMapId='elsewhere';h.api.addLightSpot(0,7,0);h.state.activeMapId='ritual_village';tick(h);
 assert.deepEqual(poolSpots(h).map(p=>p.y),[2,3,4]);assert.equal(poolSpots(h)[0].strength,1);assert.equal(h.raw.get(poolSpots(h)[0].color).hex,'#ffae5a');assert.deepEqual(Object.keys(poolSpots(h)[0]),['x','y','z','map','color','strength']);
 tick(h,.4,0,{x:34,y:0,z:0});assert(poolSpots(h).some(p=>p.y===6));assert(!poolSpots(h).some(p=>p?.y===7));
});
test('nearest selection retains light slots and fade level, reuses freed slots',s=>{
 const h=ready(s);for(let i=0;i<4;i++)h.api.addLightSpot(i*2,2,i);tick(h,.1);const first=poolSpots(h);close(h.pool()[0].metadata.level,.25);
 tick(h,.35,1,{x:6,y:0,z:3});const next=poolSpots(h);assert.equal(next[1],first[1]);assert.equal(next[2],first[2]);assert.notEqual(next[0],first[0]);close(h.pool()[0].metadata.level,.875);close(h.pool()[1].metadata.level,1);
 tick(h,.35,2,{x:200,y:0,z:200});for(const l of h.pool()){assert.equal(l.metadata.spot,null);assert.equal(l.intensity,0);assert.equal(l.metadata.level,0);}
});
test('pool fade/flicker and no selection until timer expires, no catchup',s=>{
 const h=ready(s);h.api.addLightSpot(0,8,0,'#ab1234',2);tick(h,.1,2);const l=h.pool()[0];close(l.metadata.level,.25);close(l.intensity,.95*2*(.88+Math.sin(2*9.1)*.06+Math.sin(2*23.7)*.04)*.25);assert.deepEqual({...h.raw.get(l.position)},{x:0,y:8,z:0});assert.equal(h.raw.get(l.diffuse).hex,'#ab1234');
 tick(h,.2,3,{x:200,y:0,z:200});assert(l.metadata.spot);close(l.metadata.level,.75);tick(h,.151,4,{x:200,y:0,z:200});assert.equal(l.metadata.spot,null);close(l.metadata.level,.146);assert.equal(l.intensity,0);
 tick(h,10,0);assert(l.metadata.spot);assert.equal(l.metadata.level,1);tick(h,-1,0);assert.equal(l.metadata.level,0);
});
test('moving nodes update backward, disappear backward and honor enabled only on picks',s=>{
 const h=ready(s),a=h.node('a',{x:1,y:2,z:3}),b=h.node('b',{x:2,y:3,z:4});h.api.addMovingLight(a,'#123456');h.api.addMovingLight(b,'#abcdef',2,.4);h.clearLog();tick(h,.1);assert.deepEqual(h.log.filter(e=>e[0]==='enabled').map(e=>e[1]),['b','a']);const spot=poolSpots(h).find(p=>p.node===a);assert.equal(spot.map,'*');assert.equal(spot.y,3.2);
 h.raw.get(a).position={x:8,y:9,z:10};h.raw.get(a).enabled=false;tick(h,.1);assert.equal(spot.x,8);assert.equal(spot.y,10.2);assert(poolSpots(h).includes(spot));tick(h,.3);assert(!poolSpots(h).includes(spot));
 h.raw.get(a).disposed=true;h.raw.get(b).disposed=true;h.clearLog();tick(h,.4);assert.deepEqual(h.log.filter(e=>e[0]==='disposed').map(e=>e[1]),['b','a']);assert(poolSpots(h).every(p=>p===null));
});
test('disposed node between picks remains selected but position no longer read',s=>{
 const h=ready(s),n=h.node('moving',{x:1,y:1,z:1});h.api.addMovingLight(n,'#ffffff');tick(h,.1);h.raw.get(n).disposed=true;h.clearLog();tick(h,.1);assert(poolSpots(h)[0]);assert.equal(h.log.filter(e=>e[0]==='absolute').length,0);assert(h.pool()[0].intensity>0);tick(h,.3);assert.equal(poolSpots(h)[0],null);
});
test('clear operation uses exact reverse read/remove order and keeps village spots',s=>{
 const h=ready(s);h.api.addLightSpot(1,1,1);h.state.activeMapId='forest';h.api.addLightSpot(2,2,2);const n=h.node('ghost',{x:3,y:3,z:3});h.api.addMovingLight(n,'#ffffff');h.state.activeMapId='ritual_village';tick(h);const village=poolSpots(h).find(p=>p.map==='ritual_village');h.state.activeMapId='forest';tick(h);const foreign=poolSpots(h).find(p=>p.map==='forest'),moving=poolSpots(h).find(p=>p.map==='*');const order=[];
 for(const [spot,name]of[[village,'village'],[foreign,'forest'],[moving,'moving']]){const map=spot.map;Object.defineProperty(spot,'map',{configurable:true,get(){order.push(name);return map;}});}
 h.api.clearTransientLightSpots();assert.deepEqual(order,['moving','forest','village']);h.state.activeMapId='ritual_village';tick(h);assert.equal(poolSpots(h).filter(Boolean).length,1);assert(poolSpots(h).includes(village));
});
test('malformed inputs preserve throws, NaNs and registry failure boundaries',s=>{
 const h=ready(s);assert.throws(()=>h.api.addMovingLight(null,'#fff')||tick(h),{name:'TypeError'}); // null accepted until selection
 const q=ready(s);q.options.colorThrows=true;assert.throws(()=>q.api.addLightSpot(0,0,0),/color failure/);q.options.colorThrows=false;tick(q);assert(poolSpots(q).every(p=>p===null));
 const n=ready(s);n.api.addLightSpot(NaN,1,0);n.api.addLightSpot(0,2,0,'#fff',NaN);tick(n);assert.equal(poolSpots(n).filter(Boolean).length,1);assert(Number.isNaN(n.pool()[0].intensity));
 const bad=ready(s);bad.raw.get(bad.scene).meshes=[bad.mesh('bad bounds',{getBoundingInfo(){return undefined;}})];assert.throws(()=>bad.api.syncShadowLists(),{name:'TypeError'});
});
test('controller instances isolate pool, timer, shadow cache and material callbacks',s=>{
 const a=ready(s),b=ready(s);a.api.addLightSpot(0,1,0);tick(a);tick(b);assert.equal(poolSpots(a).filter(Boolean).length,1);assert.equal(poolSpots(b).filter(Boolean).length,0);a.api.watchFrameRate(4);a.api.watchFrameRate(4);assert.equal(a.map().refreshRate,2);assert.equal(b.map().refreshRate,1);assert.notEqual(a.listeners[0],b.listeners[0]);
});
test('failed material callback leaves registered observer and partial construction intact',s=>{
 const h=harness(s,{materialAtAdd:Object.freeze({maxSimultaneousLights:1})});assert.equal(h.initError?.name,'TypeError');assert.equal(h.lights.length,6);assert.equal(h.listeners.length,1);const m={maxSimultaneousLights:0};h.listeners[0](m);assert.equal(m.maxSimultaneousLights,7);
});
test('live map getter is read at each original use, not cached per pick',s=>{
 const h=ready(s);h.api.addLightSpot(0,1,0);h.state.activeMapId='other';h.api.addLightSpot(1,2,0);let reads=0;Object.defineProperty(h.state,'activeMapId',{get(){return ++reads===1?'ritual_village':'other';}});tick(h);assert.equal(reads,2);assert.deepEqual(poolSpots(h).filter(Boolean).map(p=>p.y),[1,2]);
});
test('selection timer resets before failed moving-node reads and retries only at expiry',s=>{
 const h=ready(s),node=h.node('bad');h.api.addMovingLight(node,'#fff');h.raw.get(node).getAbsolutePosition=function(){throw Error('node failure');};assert.throws(()=>tick(h,.1),/node failure/);assert.doesNotThrow(()=>tick(h,.1));assert.throws(()=>tick(h,.3),/node failure/);
 const p=ready(s);p.api.addLightSpot(0,1,0);tick(p,NaN);assert(poolSpots(p).every(x=>x===null));tick(p,1);assert(poolSpots(p).every(x=>x===null));
});
test('reverse clear failure preserves earlier removals and retries remaining registry',s=>{
 const h=ready(s);h.state.activeMapId='forest';for(let i=0;i<3;i++)h.api.addLightSpot(i,i,0);tick(h);const spots=poolSpots(h),reads=[];Object.defineProperty(spots[1],'map',{configurable:true,get(){reads.push(1);throw Error('map failure');}});Object.defineProperty(spots[2],'map',{get(){reads.push(2);return 'forest';}});
 assert.throws(()=>h.api.clearTransientLightSpots(),/map failure/);assert.deepEqual(reads,[2,1]);Object.defineProperty(spots[1],'map',{value:'forest'});h.api.clearTransientLightSpots();tick(h);assert(poolSpots(h).every(x=>x===null));
});
function run(source){for(const [name,fn]of cases){try{fn(source);}catch(error){error.message=name+': '+error.message;throw error;}}}
run(load(reference));run(load());
// Complete observable initialization trace and every operation/getter failure prefix.
const original=ready(load(reference)),runtime=ready(load());assert.deepEqual(runtime.log,original.log);
assert(original.operations()>80);
for(let failAt=1;failAt<=original.operations();failAt++){
 const a=harness(load(reference),{failAt}),b=harness(load(),{failAt});assert(a.initError);assert.equal(b.initError?.name,a.initError.name);assert.equal(b.initError?.message,a.initError.message);assert.deepEqual(b.log,a.log,'initialization failure '+failAt);assert.deepEqual(b.snapshot(),a.snapshot());
 // If registration completed before a later failure, its installed callback remains usable.
 for(const h of [a,b])if(h.listeners.length){const m={maxSimultaneousLights:0};h.listeners[0](m);assert.equal(m.maxSimultaneousLights,7);}
}
// Exercise repeated calls after each injected live dependency failure. This checks
// partial writes, cached failure keys and timer reset order, not only returned values.
function operationScenario(source,failOffset=Infinity) {
 const h=ready(source),a=h.node('moving-a',{x:1,y:2,z:3}),b=h.node('moving-b',{x:2,y:3,z:4});
 h.api.addLightSpot(0,2,0);h.api.addMovingLight(a,'#123456');h.api.addMovingLight(b,'#abcdef');
 h.raw.get(h.scene).meshes=[h.mesh('tree'),h.mesh('road')];h.clearLog();const start=h.operations();h.options.failAt=start+failOffset;
 const actions=[()=>h.api.followShadow({x:.17,y:4,z:.23}),()=>h.api.tickShadows(.5),()=>tick(h,.1,2),()=>tick(h,.4,3),
  ()=>{h.state.activeMapId='next';h.raw.get(a).disposed=true;h.raw.get(b).enabled=false;tick(h,.4,4);},
  ()=>h.api.clearTransientLightSpots(),()=>h.api.tickShadows(.5),()=>tick(h,.4,5),()=>h.api.watchFrameRate(4),()=>h.api.watchFrameRate(4)];
 const errors=[];for(let i=0;i<actions.length;i++){try{actions[i]();}catch(error){errors.push([i,error.name,error.message]);}}
 return {log:h.log,errors,snapshot:h.snapshot(),count:h.operations()-start};
}
const operationBaseline=operationScenario(load(reference));assert(operationBaseline.count>150);assert.deepEqual(operationScenario(load()),operationBaseline);
for(let i=1;i<=operationBaseline.count;i++)assert.deepEqual(operationScenario(load(),i),operationScenario(load(reference),i),'live operation failure '+i);
const mutations=[
 ['shadow-size boundary','maxTextureSize < 4096','maxTextureSize <= 4096'],
 ['zoom threshold','Math.abs(want - shadowHalf) > 2','Math.abs(want - shadowHalf) >= 2'],
 ['shadow height','> .35 &&','>= .35 &&'],
 ['visibility threshold','m.visibility < .5','m.visibility <= .5'],
 ['cache timing','    shadowListKey = key;','    // mutated cache'],
 ['fps threshold','fps < 22','fps <= 22'],
 ['off override','shadowPref !== "off"','shadowPref !== "on"'],
 ['nearest stable order','.sort((a, b) => Math.hypot','.reverse().sort((a, b) => Math.hypot'],
 ['pool limit','const LANTERN_POOL = 3','const LANTERN_POOL = 4'],
 ['timer reset','lanternPick = .35','lanternPick = .5'],
 ['fade','spot ? dt * 2.5','spot ? dt * 3'],
 ['strength','const flicker = .88','const flicker = .89'],
 ['moving filter','!p.off &&','true &&'],
 ['clear retention','lightSpots[i].map!=="ritual_village"','lightSpots[i].map==="ritual_village"'],
 ['material cap','MAX_LIGHTS = 4 +','MAX_LIGHTS = 5 +'],
];
for(const [name,from,to]of mutations){assert(reference.includes(from),name);assert.throws(()=>run(load(reference.replace(from,to))),undefined,'must detect '+name);}
console.log(`Lighting: ${cases.length} behavior cases passed against frozen/runtime sources; ${original.operations()} initialization and ${operationBaseline.count} live failure boundaries matched; ${mutations.length} mutations rejected.`);
