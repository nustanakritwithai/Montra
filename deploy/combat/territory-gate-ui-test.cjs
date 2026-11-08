const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('main.js','utf8');
const start=source.indexOf('    const gate=canUse && worldDefinitions[activeMapId]');
const end=source.indexOf('    const repair=$("castleRepair")',start);
assert.ok(start>=0 && end>start);
const gates=[
  {id:'south--18',side:'south',box:{x:-21.5,z:-21.4,width:7,length:2.8}},
  {id:'north--22',side:'north',box:{x:-26,z:-41.4,width:8,length:2.8}}
];
function check(x,z,visible,expectedGate){
  const context={canUse:true,worldDefinitions:{river_watch:{strategic:{rampart:{gates}}}},activeMapId:'river_watch',
    authoritative:{x,z},castle:false,riverWar:null,localWar:{side:'defend',gateClosed:true,gateHp:120,
      gates:{'south--18':{hp:120,closed:true},'north--22':{hp:120,closed:true}}},siege:{dataset:{}}};
  vm.runInNewContext(source.slice(start,end)+'\nthis.selectedGate=gate?.id;',context);
  assert.equal(context.siege.hidden,!visible);
  if(expectedGate)assert.equal(context.selectedGate,expectedGate);
}
check(-22,-38.1,true,'north--22');check(-18,-22,true,'south--18');
check(-22,-41.9,false,'north--22');check(-22,-30,false);check(0,26,false);
console.log('PASS nearest north/south gate UI, outside and distance guards');
// Per-gate state: the attacker's break button follows the nearest gate's own closed/HP state.
function attack(x,z,visible,label){
  const context={canUse:true,worldDefinitions:{river_watch:{strategic:{rampart:{gates}}}},activeMapId:'river_watch',
    authoritative:{x,z},castle:false,riverWar:null,siege:{dataset:{}},
    localWar:{side:'attack',gateClosed:true,gateHp:0,gates:{'south--18':{hp:120,closed:true},'north--22':{hp:0,closed:false}}}};
  vm.runInNewContext(source.slice(start,end),context);
  assert.equal(context.siege.hidden,!visible);
  if(label)assert.equal(context.siege.textContent,label);
}
attack(-18,-19,true,'พังประตู · 120/120');attack(-22,-43,false);
console.log('PASS per-gate UI state');

// Frontend may be published before the VPS: never offer a secondary gate that
// a legacy server would interpret as a request for its first gate.
function legacy(x,z,visible){
  const context={canUse:true,worldDefinitions:{river_watch:{strategic:{rampart:{gates}}}},activeMapId:'river_watch',
    authoritative:{x,z},castle:false,riverWar:null,siege:{dataset:{}},localWar:{side:'defend',gateClosed:true,gateHp:120}};
  vm.runInNewContext(source.slice(start,end)+'\nthis.selectedGate=gate?.id;',context);
  assert.equal(context.selectedGate,'south--18');
  assert.equal(context.siege.hidden,!visible);
}
legacy(-18,-22,true);legacy(-22,-38.1,false);

const visualStart=source.indexOf('  function syncGateVisual(){');
const visualEnd=source.indexOf('  let appliedVillageTerrain;',visualStart);
assert.ok(visualStart>=0 && visualEnd>visualStart);
function visual(local,expected){
  const shown={};
  const context={territoryState:{local},activeMapId:'river_watch',worldDefinitions:{river_watch:{strategic:{rampart:{gates}}}},
    riverPostRings:new Map(),castleDoors:new Map(gates.map(g=>[g.id,{setEnabled:value=>shown[g.id]=value}]))};
  vm.runInNewContext(source.slice(visualStart,visualEnd)+'\nsyncGateVisual();',context);
  assert.deepEqual(shown,{'south--18':expected[0],'north--22':expected[1]});
}
const battle={site:'river_watch',inField:true,phase:'battle',gateClosed:true};
visual(battle,[true,false]);visual({...battle,gateClosed:false},[false,false]);
visual({...battle,gates:{'south--18':{closed:false},'north--22':{closed:true}}},[false,true]);
visual({...battle,inField:false},[false,false]);visual({...battle,site:'other'},[false,false]);
visual({...battle,phase:'open'},[false,false]);
visual({...battle,river:{gates:{'south--18':{closed:true},'north--22':{closed:true}}}},[true,true]);
visual({...battle,pilot:{gates:{'south--18':{closed:false},'north--22':{closed:true}}}},[false,true]);
console.log('PASS legacy/new server gate visuals and action compatibility');
