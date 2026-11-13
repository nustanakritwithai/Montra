/** Real production maps and server collision rules, without room/account writes.
 * Run from repository root with:
 * MONTRA_WORLD_EXPANSION=1 MONTRA_ORIGINAL_RELIEF=1 MONTRA_ATLAS_RELIEF=1 \
 * MONTRA_RIDGE_TERRAIN=1 MONTRA_CASTLE_PILOT=1 node --import tsx --test deploy/combat/quest-navigation-world-test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {WORLD_MAPS, isSafeWorldPoint, groundAt} from './WorldMaps.js';
import {FORT} from './HeightRules.js';
const require = createRequire(import.meta.url);
const {fixture} = require('./quest-navigation-test.cjs');

test('ordinary map spawn-to-portal/camp paths satisfy independent server collision checks', () => {
  for (const flag of ['MONTRA_WORLD_EXPANSION', 'MONTRA_ORIGINAL_RELIEF', 'MONTRA_ATLAS_RELIEF', 'MONTRA_RIDGE_TERRAIN', 'MONTRA_CASTLE_PILOT']) {
    assert.equal(process.env[flag], '1', `Enable ${flag} so the world sweep cannot silently lose coverage`);
  }
  const navigation = fixture();
  let routes = 0, unsupported = 0, samples = 0;
  let slowest = {label:"", ms:0}, plannerMs = 0;
  for (const map of Object.values(WORLD_MAPS)) {
    if (map.strategic?.rampart) {
      assert.equal(navigation.plan(map, map.spawn, map.portals[0] ?? map.spawn, FORT), null, `${map.id}: dynamic ramparts fail closed`);
      unsupported++;
      continue;
    }
    for (const target of [...map.portals, ...(map.camps ?? [])]) {
      const label = `${map.id}: ${'id' in target ? target.id : target.name}`;
      const started = performance.now();
      const route = navigation.plan(map, map.spawn, target, FORT) as {x:number;z:number}[] | null;
      const duration = performance.now()-started;
      plannerMs += duration;
      if (duration > slowest.ms) slowest = {label, ms:duration};
      assert.ok(route?.length, `${label}: planner finds a path`);
      const end = route[route.length - 1];
      assert.ok(Math.hypot(end.x-target.x, end.z-target.z) <= 1.25001, `${label}: arrives near target`);
      let from: {x:number;z:number} = map.spawn;
      for (const to of route) {
        // This uses authoritative server geometry, not the planner's predicate.
        const steps = Math.max(1, Math.ceil(Math.hypot(to.x-from.x, to.z-from.z)/.04));
        for (let i=0; i<=steps; i++) {
          const x=from.x+(to.x-from.x)*i/steps, z=from.z+(to.z-from.z)*i/steps;
          assert.ok(isSafeWorldPoint(map, {x, z, y:groundAt(map.id,x,z)}), `${label}: unsafe server point (${x}, ${z})`);
          samples++;
        }
        from = to;
      }
      routes++;
    }
  }
  assert.ok(routes >= 79, 'All ordinary map routes are covered');
  assert.ok(unsupported >= 1, 'Dynamic rampart rejection is covered');
  console.log({plannerMs, slowest});
  console.log(`PASS real-world navigation: ${routes} routes, ${samples} server-validated points, ${unsupported} unsupported maps rejected`);
});

// A ceiling on graph visits prevents unbounded work but does not guarantee that
// a synchronous plan is cheap on phones. Keep measured worst cases visible in CI.
test('bounded unreachable large maps report planner latency', () => {
  const navigation=fixture();
  for (const size of [100, 500]) {
    const map={id:'stress', bounds:{minX:-size,maxX:size,minZ:-size,maxZ:size}, obstacles:[], walls:[{x:-1,z:-size,width:2,length:2*size}], portals:[]};
    const started=performance.now();
    assert.equal(navigation.plan(map,{x:-size/2,z:0},{x:size/2,z:0},null),null);
    console.log(`Planner unreachable ${size*2}m map: ${(performance.now()-started).toFixed(1)}ms`);
  }
});

test('production incremental planner yields short slices with a real monotonic clock', () => {
  const {fixtureScript}=require('./quest-navigation-test.cjs');
  const element={setAttribute(){},classList:{contains:()=>false}};
  const context=vm.createContext({console,performance,document:{hidden:false,getElementById:(id:string)=>id==='quest'?element:null}});
  vm.runInContext(fixtureScript()+';globalThis.productionPlanner=questNavigationPlan;', context);
  let maxSlice=0, totalSlices=0, slowest='', yieldingRoutes=0;
  const durations:number[]=[]; const slowSlices:unknown[]=[];
  const cases:any[]=[];
  for (const map of Object.values(WORLD_MAPS)) if (!map.strategic?.rampart) {
    for (const target of [...map.portals,...(map.camps??[])]) cases.push({map,from:map.spawn,target,label:map.id+':'+('id' in target?target.id:target.name)});
  }
  for (const size of [100,500]) cases.push({map:{id:'stress',bounds:{minX:-size,maxX:size,minZ:-size,maxZ:size},obstacles:[],walls:[{x:-1,z:-size,width:2,length:2*size}],portals:[]},from:{x:-size/2,z:0},target:{x:size/2,z:0},label:`sealed ${size*2}m`});
  for (const c of cases) {
    const generator=context.productionPlanner(c.map,c.from,c.target,FORT);
    let count=0,result;
    do {
      const started=performance.now();
      result=generator.next();
      const duration=performance.now()-started;
      durations.push(duration);
      if(duration>20)slowSlices.push({label:c.label,slice:count,done:result.done,ms:duration});
      if(duration>maxSlice){maxSlice=duration;slowest=c.label;}
      count++;
    } while(!result.done);
    if(count>1)yieldingRoutes++;
    totalSlices+=count;
    if(c.map.id==='stress')assert.equal(result.value,null);else assert.ok(result.value?.path.length,c.label);
  }
  assert.ok(yieldingRoutes>0,'Difficult routes release execution between batches');
  durations.sort((a,b)=>a-b);
  console.log({maxSliceMs:maxSlice,p95Ms:durations[Math.floor(durations.length*.95)],p99Ms:durations[Math.floor(durations.length*.99)],slowest,totalSlices,yieldingRoutes,slowSlices});
});
