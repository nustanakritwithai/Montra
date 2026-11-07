'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const load = require('./fixtures/pointer-gestures-loader.cjs');
const reference = fs.readFileSync(require.resolve('./fixtures/pointer-gestures-reference.js'), 'utf8');
assert.equal(crypto.createHash('sha256').update(reference).digest('hex'), '7d22b0ee7fa1da927c14b3444da42ad4cf8744154865a1af236219473f2443be');
function harness(source, options = {}) {
  const log = [], taps = [], dashes = [], picks = [], actions = [];
  let now = 1000, operation = 0;
  const record = (...args) => { log.push(args); if (++operation === options.failAt) throw Error('install failure'); };
  const node = name => ({name, listeners:[], addEventListener(type, fn, opts) {
    record('listen', name, type, opts === true ? 'capture' : opts?.passive === false ? 'nonpassive' : 'bubble');
    this.listeners.push({type, fn, capture:opts === true});
  }});
  const window = node('window'), world = node('world'), controls = node('controls');
  world.setPointerCapture = id => { log.push(['capture', id]); if(options.captureThrows) throw Error('capture failure'); };
  world.getBoundingClientRect = () => ({left:10, top:20, width:200, height:300});
  const camera = {alpha:1, beta:1, radius:20, lowerBetaLimit:.2, upperBetaLimit:2};
  const document = {querySelector(selector) {record('query', selector); return options.noControls ? null : controls;}};
  const h = {log, taps, dashes, picks, actions, world, controls, window, camera, options, time(n) {now=n;}};
  const globals = {ui:{world}, window, document, camera, performance:{now:()=>now},
    queueMicrotask:fn=>{ (h.microtasks ||= []).push(fn); },
    setCameraZoom(value) {assert.equal(this, undefined); log.push(['zoom', value]); if(options.zoomThrows) throw Error('zoom failure'); camera.radius=value;},
    requestSwipeDash(dx,dy) {assert.equal(this, undefined); dashes.push([dx,dy]); if(options.onDash) return options.onDash(h);},
    onWorldTap(event) {assert.equal(this, undefined); taps.push(event); if(options.onTap) return options.onTap(h,event);},
    fishingSelect:false, mode:'live', resourcePickers:new Map(), forestMonsters:new Map(), localId:'self',
    enemy:{isEnabled:()=>true}, fortRoot:{isEnabled:()=>false}, targetedSkill:false,
    scene:{pick(x,y,filter) {picks.push([x,y]); h.filter=filter; if(options.pickThrows) throw Error('pick failure'); return h.hit;}},
    ownServerCharacter:()=>({x:0,z:0}), nearbyResources:()=>[{id:'ore'}],
    pointMove:(...args)=>actions.push(['move',...args]), requestClimb:(...args)=>actions.push(['climb',...args]),
    requestMonsterAttack:()=>actions.push(['enemy']), requestForestAttack:id=>actions.push(['monster',id]),
    tapPlayerForPK:id=>actions.push(['pk',id]), castAtTarget:id=>actions.push(['cast',id]),
    selectResource:n=>actions.push(['resource',n.id]), openServiceNpc:n=>actions.push(['npc',n.name]),
    toast:t=>actions.push(['toast',t]), activePortal:id=>({id,x:3,z:4}), isNearPortal:()=>true,
    requestPortalWarp:id=>actions.push(['portal',id]), room:{state:{worldMapsAvailable:true}},
    engine:{getRenderWidth:()=>800, getRenderHeight:()=>1200},
  };
  h.context=vm.createContext(globals);
  if(options.gameplay) vm.runInContext('"use strict";\n'+source.worldAction, h.context);
  h.fire = (type, target='world', data={}) => {
    const event={type,pointerId:1,pointerType:'touch',button:0,isPrimary:true,clientX:30,clientY:40,...data,
      preventDefault(){this.prevented=true; log.push(['prevent',type]);},
      stopImmediatePropagation(){this.stopped=true;log.push(['stop',type]);}};
    const path=target==='window'?[window]:[window, target==='controls'?controls:world];
    // DOM capture travels from window to target, irrespective of registration order.
    for(const phase of [true,false]) for(const n of phase?path:[...path].reverse()) {
      for(const l of [...n.listeners]) if(l.type===type && l.capture===phase && !event.stopped) l.fn.call(n,event);
    }
    return event;
  };
  try {vm.runInContext('"use strict";\n'+source.gestures,h.context);} catch(error) {h.installError=error;}
  return h;
}
const cases=[];
function test(name,fn){cases.push([name,fn]);}
const close=(a,b)=>assert(Math.abs(a-b)<1e-10, `${a} != ${b}`);
function tap(h,data={}) {h.fire('pointerdown','world',data); return h.fire('pointerup','world',data);}
function swipe(h,dx=50,dy=0,elapsed=850) {h.fire('pointerdown','controls');h.time(1000+elapsed);return h.fire('pointerup','window',{clientX:30+dx,clientY:40+dy});}
test('installation order, capture flags and absent controls', s=>{
 const expected=[['listen','world','pointerdown','bubble'],['listen','world','pointermove','bubble'],['listen','world','pointerup','bubble'],['listen','world','pointercancel','bubble'],['listen','world','wheel','nonpassive'],['query','.controls'],['listen','controls','pointerdown','capture'],['listen','window','pointerdown','capture'],['listen','window','pointerup','capture'],['listen','window','pointercancel','capture'],['listen','controls','click','capture']];
 assert.deepEqual(harness(s).log,expected);const absent=harness(s,{noControls:true});assert.deepEqual(absent.log,expected.slice(0,6));tap(absent);assert.equal(absent.taps.length,1);
 for(let i=1;i<=11;i++){const h=harness(s,{failAt:i});assert.match(h.installError?.message||'',/install failure/);assert.deepEqual(h.log,expected.slice(0,i));}
});
test('only non-left mouse filtered, raw event identity, release without move is tap',s=>{
 const h=harness(s);tap(h,{pointerType:'mouse',button:2});assert.equal(h.taps.length,0);
 for(const pointerType of ['pen','touch','mouse']) {h.fire('pointerdown','world',{pointerType,button:pointerType==='mouse'?0:2});const e=h.fire('pointerup','world',{pointerType,clientX:190,clientY:280});assert.equal(h.taps.at(-1),e);}
 assert.equal(h.taps.length,3);
});
test('strict Manhattan threshold, sticky movement, snapshots and live limits',s=>{
 const h=harness(s);h.fire('pointerdown');h.fire('pointermove','world',{clientX:35,clientY:44});assert.equal(h.camera.alpha,1);h.fire('pointerup');assert.equal(h.taps.length,1);
 h.fire('pointerdown');h.camera.alpha=9;h.camera.beta=9;h.camera.upperBetaLimit=1.01;h.fire('pointermove','world',{clientX:36,clientY:44});close(h.camera.alpha,.964);close(h.camera.beta,1.01);
 h.fire('pointermove','world',{clientX:30,clientY:40});close(h.camera.alpha,1);close(h.camera.beta,1);h.fire('pointerup');assert.equal(h.taps.length,1);
 h.camera.lowerBetaLimit=.99;h.fire('pointerdown');h.fire('pointermove','world',{clientY:0});close(h.camera.beta,.99);
});
test('pointer identity and matching cancel',s=>{const h=harness(s);h.fire('pointerdown');h.fire('pointermove','world',{pointerId:4,clientX:99});h.fire('pointercancel','world',{pointerId:4});h.fire('pointerup');assert.equal(h.taps.length,1);h.fire('pointerdown');h.fire('pointercancel');h.fire('pointerup');assert.equal(h.taps.length,1);});
test('pinch, third touch rebaseline and final lift suppression',s=>{
 const h=harness(s);h.fire('pointerdown','world',{clientX:0});h.fire('pointerdown','world',{pointerId:2,clientX:100});h.fire('pointermove','world',{pointerId:2,clientX:200});close(h.camera.radius,10);
 h.fire('pointerdown','world',{pointerId:3,clientX:300});h.fire('pointermove','world',{pointerId:2,clientX:400});close(h.camera.radius,10);
 h.fire('pointerup','world',{pointerId:3});h.fire('pointermove','world',{pointerId:2,clientX:200});close(h.camera.radius,10);h.fire('pointermove','world',{pointerId:2,clientX:100});close(h.camera.radius,20);
 h.fire('pointerup','world',{pointerId:2});h.fire('pointermove','world',{clientX:10});h.fire('pointerup');assert.equal(h.taps.length,0);tap(h);assert.equal(h.taps.length,1);
});
test('touch suppression does not swallow mouse and cancel permits next gesture',s=>{
 const h=harness(s);h.fire('pointerdown');h.fire('pointerdown','world',{pointerId:2});tap(h,{pointerType:'mouse',pointerId:7});assert.equal(h.taps.length,1);
 h.fire('pointercancel','world',{pointerId:2});h.fire('pointercancel');tap(h);assert.equal(h.taps.length,2);
});
test('capture errors alone swallowed, callback errors propagate and next tap retries',s=>{
 const h=harness(s,{captureThrows:true,onTap(){throw Error('tap failure');}});h.fire('pointerdown');assert.throws(()=>h.fire('pointerup'),/tap failure/);assert.equal(h.taps.length,1);h.fire('pointerup');assert.equal(h.taps.length,1);h.fire('pointerdown');assert.throws(()=>h.fire('pointerup'),/tap failure/);assert.equal(h.taps.length,2);
 const z=harness(s,{zoomThrows:true});assert.throws(()=>z.fire('wheel','world',{deltaY:1}),/zoom failure/);
});
test('wheel cancellation precedes sign zoom including zero',s=>{
 const h=harness(s);h.log.length=0;for(const deltaY of [200,-.001,0])h.fire('wheel','world',{deltaY});assert.deepEqual(h.log,[['prevent','wheel'],['zoom',22],['prevent','wheel'],['zoom',20],['prevent','wheel'],['zoom',20]]);
});
test('dash exact distance/time boundaries raw diagonal deltas and no duplicate',s=>{
 for(const [dx,dy,ms,yes] of [[30,40,850,true],[49.999,0,850,false],[50,0,851,false],[-30,-40,0,true]]){const h=harness(s);swipe(h,dx,dy,ms);assert.deepEqual(h.dashes,yes?[[dx,dy]]:[]);h.fire('pointerup','window',{clientX:300});assert.equal(h.dashes.length,yes?1:0);}
});
test('second pointer anywhere cancels and DOM capture precedes controls',s=>{
 for(const target of ['world','window','controls']) {const h=harness(s);h.fire('pointerdown','controls');h.fire('pointerdown',target,{pointerId:2,isPrimary:false});h.fire('pointerup','window',{clientX:100});assert.equal(h.dashes.length,0);assert.equal(h.fire('click','controls').prevented,true);}
 // A second primary controls down cancels old state at window, then starts new state at target.
 const h=harness(s);h.fire('pointerdown','controls');h.fire('pointerdown','controls',{pointerId:2});h.fire('pointerup','window',{pointerId:2,clientX:80});assert.deepEqual(h.dashes,[[50,0]]);
});
test('dash cancel is matching, non-left ignored, primary resets suppression',s=>{
 const h=harness(s);h.fire('pointerdown','controls');h.fire('pointercancel','window',{pointerId:2});h.fire('pointerup','window',{clientX:80});assert.equal(h.dashes.length,1);
 h.fire('pointerdown','controls',{pointerType:'mouse',button:2});assert.equal(h.fire('click','controls').prevented,true);
 h.fire('pointerdown','controls');h.fire('pointercancel','window');h.fire('pointerup','window',{clientX:80});assert.equal(h.dashes.length,1);
 swipe(h);h.fire('pointerdown','controls');assert.equal(h.fire('click','controls').prevented,undefined);
});
test('clear swipe and one click suppression before synchronous callback even reject/throw',s=>{
 for(const throws of [false,true]){let nested=0;const h=harness(s,{onDash(h){if(++nested>1)throw Error('duplicate dash');h.fire('pointerup','window',{clientX:80});const e=h.fire('click','controls');assert.equal(e.prevented,true);assert.equal(e.stopped,true);assert.equal(h.fire('click','controls').prevented,undefined);if(throws)throw Error('dash failure');return false;}});
 if(throws)assert.throws(()=>swipe(h),/dash failure/);else swipe(h);assert.equal(h.dashes.length,1);h.fire('pointerup','window',{clientX:90});assert.equal(h.dashes.length,1);}
});
test('click stopImmediatePropagation once protects later target and bubble handlers',s=>{
 const h=harness(s);let count=0;h.controls.addEventListener('click',()=>count++,true);h.window.addEventListener('click',()=>count++);swipe(h);h.fire('click','controls');assert.equal(count,0);h.fire('click','controls');assert.equal(count,2);
});
test('real world action CSS pixels bounds, predicate and representative dispatch',s=>{
 const h=harness(s,{gameplay:true});const mesh=metadata=>({metadata,isEnabled:()=>true});h.hit={hit:true,pickedMesh:mesh({walkable:true}),pickedPoint:{x:7,z:8}};
 tap(h,{clientX:210,clientY:320});assert.deepEqual(h.picks,[[200,300]]);assert.deepEqual(h.actions,[['move',7,8]]);assert.equal(h.filter(mesh({walkable:true})),true);assert.equal(h.filter({metadata:{walkable:true},isEnabled:()=>false}),false);
 for(const [clientX,clientY]of [[9,30],[211,30],[20,19],[20,321]])tap(h,{clientX,clientY});assert.equal(h.picks.length,1);
 for(const [metadata,action] of [[{stairId:'steps'},['climb','steps']],[{resourceId:'ore'},['resource','ore']],[{pkPlayerId:'other'},['pk','other']],[{monsterId:'wolf'},['monster','wolf']],[{portalId:'gate'},['portal','gate']],[{serviceNpc:{name:'shop',x:0,z:0,radius:3}},['npc','shop']]]){h.hit.pickedMesh=mesh(metadata);tap(h);assert.deepEqual(h.actions.at(-1),action);}
 h.hit.pickedMesh=h.context.enemy;tap(h);assert.deepEqual(h.actions.at(-1),['enemy']);
 h.context.targetedSkill=true;h.hit.pickedMesh=mesh({pkPlayerId:'other'});tap(h);assert.deepEqual(h.actions.at(-1),['cast','other']);
});
test('pinch clamps zero separation and cancel rebaselines next pair',s=>{
 const h=harness(s);h.fire('pointerdown','world',{clientX:0,clientY:0});h.fire('pointerdown','world',{pointerId:2,clientX:0,clientY:0});h.fire('pointermove','world',{pointerId:2,clientX:2,clientY:0});close(h.camera.radius,10);
 h.fire('pointercancel','world',{pointerId:2});h.fire('pointerdown','world',{pointerId:3,clientX:10,clientY:0});h.fire('pointermove','world',{pointerId:3,clientX:20,clientY:0});close(h.camera.radius,5);
 h.fire('pointerup','world',{pointerId:3});h.fire('pointerup');assert.equal(h.taps.length,0);
});
test('original world callback failures propagate, consume pointer and retry next down',s=>{
 const h=harness(s,{gameplay:true,pickThrows:true});h.fire('pointerdown');assert.throws(()=>h.fire('pointerup'),/pick failure/);assert.equal(h.picks.length,1);h.fire('pointerup');assert.equal(h.picks.length,1);h.fire('pointerdown');assert.throws(()=>h.fire('pointerup'),/pick failure/);assert.equal(h.picks.length,2);
});
test('independent instances retain separate state',s=>{const a=harness(s),b=harness(s);a.fire('pointerdown');b.fire('pointerup');assert.equal(b.taps.length,0);a.fire('pointerup');assert.equal(a.taps.length,1);swipe(a);assert.equal(b.fire('click','controls').prevented,undefined);});
function run(source){for(const[name,fn]of cases){try{fn(source);}catch(e){e.message=name+': '+e.message;throw e;}}}
run(load(reference));run(load());
const mutations=[
 ['movement threshold','>9','>=9'],
 ['dash distance','length < 50','length <= 50'],
 ['dash deadline','elapsedMs > 850','elapsedMs >= 850'],
 ['sticky moved','if (Math.abs(dx)+Math.abs(dy)>9) pointer.moved=true;','pointer.moved=Math.abs(dx)+Math.abs(dy)>9;'],
 ['release inferred movement','const wasMoved = pointer.moved;','const wasMoved = pointer.moved || Math.abs(event.clientX-pointer.x)>9;'],
 ['touch final-lift suppression','const suppressTap = event.pointerType === "touch" && ignoreTapUntilTouchesLift;','const suppressTap = ignoreTapUntilTouchesLift;'],
 ['capture phases','    }, true);','    }, false);'],
 ['delayed callback','requestSwipeDash(dx, dy);','queueMicrotask(() => requestSwipeDash(dx, dy));'],
 ['double dash','requestSwipeDash(dx, dy);','requestSwipeDash(dx, dy); requestSwipeDash(dx, dy);'],
 ['callback before suppression','suppressMenuClick = true;\n      requestSwipeDash(dx, dy);','requestSwipeDash(dx, dy);\n      suppressMenuClick = true;'],
 ['clear swipe after callback','      dashSwipe = null;\n      const dx','      // mutant retains swipe\n      const dx'],
 ['wheel order','e.preventDefault();\n    setCameraZoom(camera.radius + Math.sign(e.deltaY) * 2);','setCameraZoom(camera.radius + Math.sign(e.deltaY) * 2);\n    e.preventDefault();'],
];
for(const[name,from,to]of mutations){assert(reference.includes(from),name+' mutation anchor');assert.throws(()=>run(load(reference.replace(from,to))),undefined,name+' must be detected');}
console.log(`Pointer gestures: ${cases.length} behavior cases passed for frozen/runtime sources; ${mutations.length} source mutations rejected.`);
