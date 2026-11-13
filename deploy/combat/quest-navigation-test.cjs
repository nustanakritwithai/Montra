/** Production quest navigation against synthetic geometry and a captured room.
 * No account, live server, protocol changes, or save fixtures are involved. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function slice(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, `Production fixture boundary missing: ${start} / ${end}`);
  return source.slice(a, b);
}
function plain(value) { return JSON.parse(JSON.stringify(value)); }
function map(extra = {}) {
  return { id: 'fixture', bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 }, obstacles: [], walls: [], portals: [], ...extra };
}
// Independent segment verification, deliberately not the planner's own predicate.
function assertClear(world, start, route) {
  let from = start;
  for (const to of route) {
    assert(Number.isFinite(to.x) && Number.isFinite(to.z), 'finite waypoint');
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / .025));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, x = from.x + (to.x - from.x) * t, z = from.z + (to.z - from.z) * t;
      assert(x >= world.bounds.minX + .4 && x <= world.bounds.maxX - .4 && z >= world.bounds.minZ + .4 && z <= world.bounds.maxZ - .4, 'body remains in map bounds');
      for (const o of world.obstacles) assert(Math.hypot(x - o.x, z - o.z) > o.radius + .4, 'segment clears circular collision');
      for (const w of [...world.walls, ...(world.water || [])]) {
        assert(!(x >= w.x - .4 && x <= w.x + w.width + .4 && z >= w.z - .4 && z <= w.z + w.length + .4), 'segment clears wall/water minimum-corner footprint');
      }
    }
    from = to;
  }
}
function fixtureScript(browser = false) {
  const movement = read('src/client/input/039-movement-flight-and-climbing.js');
  const terrain = read('src/client/world/017-region-terrain.js');
  const uiSource = read('src/client/ui/057-npcs-and-objectives.js');
  return `
    const wire=[],notices=[];let clock=1000,details=0;
    let mode='live',activeMapId='fixture',localId='me',forestObjectiveState=null,forestEscortState=null,territoryState=null,warpPending=false;
    let guide={title:'Fixture hunt',to:{x:12,z:0}},worldDefinitions={fixture:${JSON.stringify(map())}},activeFort=null;
    const me={x:0,y:0,z:0,alive:true,mapId:'fixture',combatState:'idle'};
    let room={state:{worldMapsAvailable:true,players:new Map([['me',me]])},send:(type,data)=>wire.push({type,data})};
    const $=id=>document.getElementById(id),ui={quest:$('quest')},marker={position:{},setEnabled(){}},avatars=new Map();
    let pendingClimb=null,selectedPkTargetId=null,spellTargetId=null,demoAutoAttack=false,demoDash=null;
    const triggerVoiceGuidance=()=>{},setTargetedSkill=()=>{},syncPKHud=()=>{},toast=t=>notices.push(t),playerLayer=p=>p.y;
    const currentItemHunt=()=>null,journeyNotesForPlayer=()=>({}),hudGuide=()=>guide;
    const mapBounds=()=>worldDefinitions[activeMapId].bounds,closeDrawer=()=>{},openCurrentQuest=()=>details++;
    const requestPortalWarp=id=>{warpPending=true;wire.push({type:'warp',data:{id}});};
    const isNearPortal=(p,t)=>Math.hypot(p.x-t.x,p.z-t.z)<=3;
    ${slice(terrain, '  function terrainCell(', '  // ---- Ground patches:')}
    ${slice(terrain, '  function terrainHeight(', '  // Clip each footprint')}
    ${slice(movement, '  function getLocalAvatar()', '  function hasLiveElevation(')}
    ${movement.slice(movement.indexOf('  let questNavigation = null;'))}
    const travelRoute=(world,start,end)=>[start,end];
    ${slice(uiSource, '  function forestObjectiveNavigationTarget(', '  function forestObjectiveHudGuide(')}
    ${browser ? slice(uiSource, '  ui.quest.addEventListener("click",startQuestNavigation);', '  $("characterProfile").onclick=') : ''}
    globalThis.fixture={wire,notices,resolve:forestObjectiveNavigationTarget,plan:planQuestNavigation,geometry:questNavigationGeometry,start:startQuestNavigation,
      active:()=>!!questNavigation,state:()=>questNavigation,details:()=>details,cancel:cancelQuestNavigation,manual:pointMove,
      tick:n=>{clock=n;updateQuestNavigation(n);},now:()=>performance.now(),me,guide:g=>{guide=g;},
      world:w=>{worldDefinitions=w;},change:values=>{Object.assign(me,values);},
      mode:m=>{mode=m;},map:m=>{activeMapId=m;},disconnect:()=>{room=null;},warpAck:()=>{warpPending=false;},
      hidden:v=>{Object.defineProperty(document,'hidden',{configurable:true,value:v});},
      escort:v=>{forestEscortState=v;},monsters:v=>{room.state.monsters=new Map(v);},objective:v=>{forestObjectiveState=v;},war:v=>{territoryState=v;}};
  `;
}
function fixture() {
  const element = { setAttribute(){}, classList:{contains:()=>false} };
  const context = vm.createContext({ console, performance:{now:()=>1000}, document:{hidden:false,getElementById:id=>id==='quest'?element:null} });
  vm.runInContext(fixtureScript(), context);
  return context.fixture;
}
function run() {
  let f=fixture();
  const from={x:-12,z:0},target={x:12,z:0};
  for (const [name,world] of [
    ['empty',map()],
    ['circle',map({obstacles:[{x:0,z:0,radius:3}]})],
    ['wall',map({walls:[{x:-1,z:-5,width:2,length:10}]})],
    ['water',map({water:[{x:-2,z:-6,width:4,length:12}]})],
    ['corner',map({walls:[{x:-1,z:-7,width:2,length:7},{x:-1,z:1,width:9,length:2}]})]
  ]) {
    const route=f.plan(world,from,target);assert(route?.length,`${name} produces route`);assertClear(world,from,route);
    assert(Math.hypot(route.at(-1).x-target.x,route.at(-1).z-target.z)<=1.25001,'arrive near occupied objective');
  }
  assert.equal(f.plan(map({walls:[{x:-1,z:-20,width:2,length:40}]}),from,target),null,'sealed wall fails closed');
  assert.equal(f.plan(map({strategic:{rampart:{}}}),from,target),null,'unsupported rampart refuses');
  assert.equal(f.plan(map(),from,{x:NaN,z:0}),null,'NaN refuses');
  assert.equal(f.plan(map(),from,{x:Infinity,z:0}),null,'infinite refuses');
  assert.equal(f.plan(map(),from,{x:100,z:0}),null,'out of bounds refuses');
  const steep=map({terrain:{xs:[-20,-.1,.1,20],zs:[-20,20],heights:[[0,0,3,3],[0,0,3,3]],maxGrade:.52}});
  assert.equal(f.geometry(steep).clear(from,target),false,'thin steep strip cannot be sampled over');
  assert.equal(f.plan(steep,from,target),null,'full steep strip blocks route');
  const hill=map({terrain:{xs:[-20,20],zs:[-20,20],heights:[[0,2],[0,2]],maxGrade:.52}});
  assert(f.plan(hill,from,target),'walkable slope permitted');
  const fort={x:0,z:0,width:4,length:8};
  const village=map({id:'ritual_village'}),route=f.plan(village,from,target,fort);
  assertClear({...village,walls:[{x:-2,z:-4,width:4,length:8}]},from,route);
  const crossing=map({water:[{x:-2,z:-20,width:4,length:40}],
    walkBridges:[{x:[-9,-3,3,9],z:0,width:4.4,height:3,thickness:.25}]});
  const bridgeRoute=f.plan(crossing,{x:-12,z:4},{x:12,z:4});
  assert.ok(bridgeRoute?.some(p=>Math.abs(p.z)<2),"dry navigation uses the bridge approaches");
  assert.equal(f.geometry(crossing).clear({x:0,z:-3},{x:0,z:0}),false,"the raised side is not an approach");
  const shelf={x:-3,z:-20,width:6,length:40};
  const wade=f.plan(map({water:[shelf],shallowWater:[{...shelf}]}),from,target);
  assert.ok(wade?.length===1 && Math.hypot(wade[0].x-target.x,wade[0].z-target.z)<=1.25001,"wade across a marked shallow shelf");
  console.log('PASS quest planner: obstacle, wall, water, corner, sealed map, bounds, terrain, village fort');
  const tapWorld=map({walls:[{x:4,z:-5,width:2,length:10}]});
  for(const mounted of [false,true]){
    f=fixture();f.world({fixture:tapWorld});f.change({mounted});f.manual(12,0);
    assert(f.state()?.manual && f.state()?.planner,'ground tap starts a shared route');
    assert.equal(f.wire.length,0,'no command before finding a safe route');
    for(let n=1;n<=300 && f.state()?.planner;n++)f.tick(1000+n*16);
    assert(f.state()?.path.length);
    assertClear(tapWorld,f.me,f.state().path);
    assert.deepEqual(plain(f.state().path.at(-1)),{x:12,z:0},'tap keeps the exact open destination');
    f.tick(6000);
    const first=f.wire.at(-1)?.data;
    assert(first && Math.hypot(first.x,first.z)<=(mounted?6:4)+.02,'waypoint length matches travel mode');
    for(let n=1;n<=30 && f.active();n++){
      Object.assign(f.me,f.wire.at(-1).data);f.tick(6000+n*500);
    }
    assert(!f.active());
    assert(Math.hypot(f.me.x-12,f.me.z)<.05,'reached the selected ground point');
  }
  f=fixture();f.world({fixture:tapWorld});f.change({mounted:true});f.manual(12,0);
  f.change({mounted:false});f.tick(1016);assert(!f.active(),'dismount cancels a mounted route');
  f=fixture();f.world({fixture:tapWorld});f.manual(12,0);f.manual(-2,0);
  assert(!f.active(),'a new clear tap takes over from a pending detour');
  assert.deepEqual(plain(f.wire.at(-1)),{type:'move',data:{x:-2,z:0}});
  const marsh=map({id:'drowned_marsh',waterLevel:0,water:[{x:-2,z:-4,width:4,length:8}],
    shallowWater:[{x:-2,z:-4,width:4,length:8}],terrain:{xs:[-20,-3,-2,2,3,20],zs:[-20,20],
      heights:[[0,0,-.6,-.6,0,0],[0,0,-.6,-.6,0,0]],maxGrade:.8}});
  assert(f.geometry(marsh,null,false).clear(from,target),'walking can cross the marked shallow shelf');
  assert(!f.geometry(marsh,null,true).clear(from,target),'mounted route rejects a shelf deep enough to cause a dismount');
  console.log('PASS ground tap routing: exact endpoint, walking, buffalo, takeovers and deep-water clearance');
  f=fixture();
  f.start();assert(f.active());assert.equal(f.wire.length,1);assert.equal(f.wire[0].type,'move');
  assert(Math.hypot(f.wire[0].data.x,f.wire[0].data.z)<=4.01,'bounded move hop');
  f.tick(1500);assert.equal(f.wire.length,1,'no command without authoritative arrival');
  Object.assign(f.me,f.wire[0].data);f.tick(1650);assert.equal(f.wire.length,2,'next hop after authoritative arrival');
  f.manual(2,3);assert(!f.active());assert.deepEqual(plain(f.wire.at(-1)),{type:'move',data:{x:2,z:3}});
  for (const [name,mutate,time] of [
    ['death',x=>x.change({alive:false}),1300],['flight',x=>x.change({flying:true}),1300],
    ['climb',x=>x.change({combatState:'climbing'}),1300],['altitude',x=>x.change({y:4}),1300],
    ['disconnect',x=>x.disconnect(),1300],['hidden',x=>x.hidden(true),1300],
    ['map',x=>x.map('other'),1300],['stuck',()=>{},6200],
    ['changed target',x=>x.guide({title:'Other',to:{x:10,z:1}}),1300],
    ['war',x=>x.war({local:{inField:true}}),1300],
    ['changed progress',x=>x.objective({active:{id:'hunt',progress:1}}),1300]
  ]) {f=fixture();f.start();mutate(f);f.tick(time);assert(!f.active(),`${name} cancels`);}
  f=fixture();f.start();f.start();assert(!f.active(),'second click cancels');
  assert.deepEqual(plain(f.wire.at(-1)),{type:'move',data:{x:0,z:0}},'cancel sends authoritative stop');
  f=fixture();f.guide({title:'Recipe'});f.start();assert(!f.active());assert.equal(f.wire.length,0);assert.equal(f.details(),1);
  f=fixture();f.mode('demo');f.start();assert(!f.active());assert.equal(f.wire.length,0);
  f=fixture();f.start();for(let n=1;n<=8&&f.active();n++){Object.assign(f.me,f.wire.at(-1).data);f.tick(1000+n*500);}
  assert(!f.active(),'arrival completes');assert(f.wire.every(m=>m.type==='move'),'ordinary destination never attacks or accepts');
  f=fixture();const keeper={mapId:'fixture',x:1,z:2},active={id:'task',progress:0};
  const definition={mapId:'fixture',kind:'escort',escort:{x:9,z:3}};
  assert.deepEqual(plain(f.resolve(definition,active,keeper)),keeper,'escort starts at keeper');
  f.escort({id:'task',mapId:'fixture',x:0,z:0});
  assert.deepEqual(plain(f.resolve(definition,active,keeper)),{x:9,z:3,mapId:'fixture'},'active escort destination');
  assert.deepEqual(plain(f.resolve({mapId:'fixture',kind:'defense',defense:{x:4,z:5}},active,keeper)),{x:4,z:5,mapId:'fixture'});
  f.monsters([['west_1',{id:'west_1',alive:true,mapId:'fixture',x:2,z:0}],['east_1',{id:'east_1',alive:true,mapId:'fixture',x:4,z:0}],['east_2',{id:'east_2',alive:false,mapId:'fixture',x:1,z:0}]]);
  assert.equal(f.resolve({mapId:'fixture',stages:[{prefix:'west_'},{prefix:'east_'}]}, {...active,progress:1},keeper).id,'east_1','patrol targets current stage and alive mob');
  const delivery={mapId:'fixture',kind:'delivery',goal:5,prefix:'west_',destinationMapId:'next'};
  assert.equal(f.resolve(delivery,{...active,progress:3},keeper).id,'west_1','delivery supply hunt');
  const portal={id:'gate',x:8,z:0,targetMapId:'next'};
  f.world({fixture:map({portals:[portal]}),next:map({id:'next'})});
  assert.deepEqual(plain(f.resolve(delivery,{...active,progress:4},keeper)),portal,'delivery final route goes to next portal');
  f.map('next');const destinationKeeper={mapId:'next',x:0,z:2};
  assert.deepEqual(plain(f.resolve(delivery,{...active,progress:4},destinationKeeper)),destinationKeeper,'delivery arrival uses destination keeper');
  f=fixture();f.world({fixture:map({camps:[{name:'Rest camp',x:4,z:5}]})});
  assert.deepEqual(plain(f.resolve({mapId:'fixture',camp:'Rest camp',prefix:'gone_'},active,keeper)),{name:'Rest camp',x:4,z:5,mapId:'fixture'},'respawn camp fallback');
  assert.equal(f.resolve({mapId:'fixture',prefix:'missing_'},active,keeper),null,'missing target returns null');
  f=fixture();f.objective({active});f.escort({id:'task',mapId:'fixture',x:-12,z:0});f.start();
  assert(f.active());assert.equal(f.state().escortWait,1000,'wait for lagging escort');
  assert.deepEqual(plain(f.wire.at(-1)),{type:'move',data:{x:0,z:0}});
  f.escort({id:'task',mapId:'fixture',x:-5,z:0});f.tick(1500);assert.equal(f.state().escortWait,0);assert(f.wire.at(-1).data.x>0,'resume escort movement');
  f=fixture();f.world({fixture:map({portals:[portal]}),next:map({id:'next'})});f.guide({title:'Travel',to:portal});f.start();
  for(let n=1;n<=5&&!f.wire.some(m=>m.type==='warp');n++){Object.assign(f.me,f.wire.at(-1).data);f.tick(1000+n*500);}
  assert.equal(f.wire.filter(m=>m.type==='warp').length,1,'normal portal uses existing warp once');
  f.tick(12000);assert(!f.active(),'warp timeout stops');
  f=fixture();f.world({fixture:map({portals:[portal]}),next:map({id:'next',strategic:{rampart:{}}})});f.guide({title:'Travel',to:portal});f.start();assert(!f.active());assert(!f.wire.some(m=>m.type==='warp'),'unsupported destination never warps');
  // Regression: do not overwrite the old identity while replanning a distant replacement.
  f=fixture();f.guide({title:'Hunt',to:{id:'A',x:10,z:0}});f.start();
  f.guide({title:'Hunt',to:{id:'B',x:15,z:0}});f.tick(1500);
  assert(!f.active(),'changed target identity cancels before distant replan');
  assert.deepEqual(plain(f.wire.at(-1)),{type:'move',data:{x:0,z:0}},'replacement target receives stop, not pursuit');
  for (const [before,after] of [[{id:'A',x:10,z:0},{x:10,z:0}],[{x:10,z:0},{id:'A',x:10,z:0}]]) {
    f=fixture();f.guide({title:'Hunt',to:before});f.start();f.guide({title:'Hunt',to:after});f.tick(1500);
    assert(!f.active(),'switching between mob identity and anonymous camp cancels');
    assert.deepEqual(plain(f.wire.at(-1)),{type:'move',data:{x:0,z:0}},'identity disappearance/appearance stops existing movement');
  }
  // A small movement does not invalidate the cached route until its old endpoint.
  f=fixture();f.guide({title:'Hunt',to:{id:'A',x:10,z:0}});f.start();
  const oldEndpoint=plain(f.state().path.at(-1));
  f.guide({title:'Hunt',to:{id:'A',x:12,z:0}});
  for(let n=1;n<=6&&f.state()?.path;n++){Object.assign(f.me,f.wire.at(-1).data);f.tick(1000+n*500);}
  assert(f.active(),'same moving target remains active at obsolete endpoint');
  assert.equal(f.state().path,null,'route exhaustion requests a new plan');
  assert(Math.hypot(f.me.x-12,f.me.z)>1.6);
  assert.equal(f.me.x,oldEndpoint.x);
  const previousCount=f.wire.length;f.tick(4500);
  assert(f.active());assert(f.state().path?.length);assert.equal(f.wire.length,previousCount+1,'new route sends movement');
  assert(f.wire.at(-1).data.x>oldEndpoint.x,'pursues updated location for same target');
  function atPortal() {
    const x=fixture();x.world({fixture:map({portals:[portal]}),next:map({id:'next'})});
    x.guide({title:'Travel',to:portal});x.start();
    for(let n=1;n<=5&&!x.state()?.warp;n++){Object.assign(x.me,x.wire.at(-1).data);x.tick(1000+n*500);}
    assert(x.state()?.warp);return x;
  }
  f=atPortal();const warpAt=f.state().warp.at;f.warpAck();f.tick(warpAt+200);
  assert(f.active(),'warp acknowledgement before schema patch must not cancel');
  f.tick(warpAt+8400);assert(f.active(),'wait full acknowledgement grace period');
  assert.equal(f.wire.filter(m=>m.type==='warp').length,1,'never resend warp while awaiting patch');
  f.tick(warpAt+8600);assert(!f.active(),'unpatched map still times out');
  for(const sameSemanticGoal of [true,false]) {
    f=atPortal();const arrivedAt=f.state().warp.at+200;f.warpAck();f.map('next');f.change({mapId:'next',x:0,z:0});
    f.guide({title:sameSemanticGoal?'Travel':'Different objective',to:{id:'keeper',mapId:'next',x:10,z:0}});
    const beforeArrival=f.wire.length;f.tick(arrivedAt);
    assert(f.active());assert.equal(f.wire.length,beforeArrival,'map transition grace period sends nothing');
    f.tick(arrivedAt+1400);assert.equal(f.wire.length,beforeArrival);
    f.tick(arrivedAt+1600);
    assert.equal(f.active(),sameSemanticGoal,'only the same semantic guide resumes after map transition');
    if(sameSemanticGoal)assert(f.wire.at(-1).data.x>0,'continues toward next-map keeper');
    else assert.deepEqual(plain(f.wire.at(-1)),{type:'move',data:{x:0,z:0}},'changed guide stops at destination');
  }
  f=atPortal();f.start();assert(!f.active(),'second click during warp cancels');const afterCancel=f.wire.length;
  f.warpAck();f.map('next');f.change({mapId:'next',x:0,z:0});f.guide({title:'Travel',to:{mapId:'next',x:10,z:0}});
  f.tick(5000);f.tick(8000);assert(!f.active());assert.equal(f.wire.length,afterCancel,'late warp patch never restarts cancelled navigation');
  const hardMap=map({bounds:{minX:-200,maxX:200,minZ:-200,maxZ:200},walls:[{x:20,z:-60,width:5,length:120}]});
  function planningFixture(){const x=fixture();x.world({fixture:hardMap});x.guide({title:'Long detour',to:{id:'A',x:100,z:0}});x.start();return x;}
  f=planningFixture();assert(f.state()?.planner,'hard route yields without finishing on click');assert.equal(f.wire.length,0,'no movement before route found');
  let planningFrames=0;
  while(f.state()?.planner && planningFrames<300){f.tick(1016+planningFrames*16);planningFrames++;assert.equal(f.wire.length,0,'planning slices cannot issue partial-route movement');}
  assert(planningFrames>1&&planningFrames<300,'bounded multi-frame search completes');assert(f.state()?.path?.length);
  assertClear(hardMap,{x:0,z:0},f.state().path);f.tick(1016+planningFrames*16);assert.equal(f.wire[0]?.type,'move','validated completed route starts normally');
  f=planningFixture();f.start();assert(!f.active(),'click cancels during planning');const cancelledPlanningWire=f.wire.length;
  for(let n=0;n<40;n++)f.tick(1100+n*16);assert.equal(f.wire.length,cancelledPlanningWire,'cancelled generator never sends late movement');
  for(const [name,mutate] of [['goal',x=>x.guide({title:'Long detour',to:{id:'B',x:100,z:0}})],['session',x=>x.disconnect()]]){
    f=planningFixture();mutate(f);for(let n=0;n<12;n++)f.tick(1016+n*16);
    assert(!f.active(),name+' change during planning cancels');
    assert(f.wire.every(m=>m.type==='move'&&m.data.x===0&&m.data.z===0),name+' change permits at most stop, never pursuit');
  }
  console.log('PASS incremental planning: multi-frame yield, no partial moves, cancel and stale goal/session safety');
  const network=read('src/client/network/044-state-sync-and-connection.js');
  const rejection=slice(network,'      joined.onMessage("command_rejected",','      joined.onMessage("warp_complete",');
  const movementGuard=rejection.split('\n').find(line=>line.includes('questNavigation &&'));
  for(const reason of ['invalid_move','move_rate_limited','not_alive','climbing','dashing','flight_in_progress','movement_busy'])assert(movementGuard.includes('"'+reason+'"'),'movement rejection cancels: '+reason);
  assert.match(movementGuard,/cancelQuestNavigation\(.+,false\)/,'rejection clears navigation without another rejected movement');
  assert(movementGuard.includes('questNavigation.warp'),'pending portal rejection cancels');
  const warpFailure=slice(network,'      joined.onMessage("warp_failed",','      // Colyseus 0.18');
  assert.match(warpFailure,/if\(room!==joined\)return;[\s\S]*cancelQuestNavigation\(.+,false\)/,'warp failure only cancels current room');
  const rangeCopy=network.split('\n').find(line=>line.includes('info?.reason === "talisman_out_of_range"'));
  assert.match(rangeCopy,/เข้าใกล้มอนสเตอร์.*แตะมอนสเตอร์อีกครั้ง/,'range guidance describes approaching target');
  assert.doesNotMatch(rangeCopy,/ข้าวสาร|blessed_rice/,'range guidance never recommends unavailable blessed rice');
  const warpComplete=slice(network,'      joined.onMessage("warp_complete",','      joined.onMessage("warp_failed",');
  assert.match(warpComplete,/toast\("เดินทางสำเร็จ"\)/,'warp success is destination-neutral');
  assert.doesNotMatch(warpComplete,/วัด|bound_temple/,'warp success must not hardcode temple destination');
  console.log('PASS quest network guards: current-room rejection and warp failure cancellation, accurate range and travel copy');
  console.log('PASS quest regressions: target identity, moving goal replan, warp acknowledgement ordering, semantic continuity, cancel during warp');
  console.log('PASS quest resolver: patrol, delivery, escort, defense, respawn fallback; escort wait and guarded portal');
  console.log('PASS quest controller: authoritative movement, throttling, arrival, manual/second-click cancellation, stale state, death, flight, disconnect, hidden, stuck');
}
if(require.main===module)run();
module.exports={fixtureScript,fixture};
