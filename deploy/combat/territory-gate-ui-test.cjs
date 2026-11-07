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
    authoritative:{x,z},castle:false,riverWar:null,localWar:{side:'defend',gateClosed:true,gateHp:120},siege:{dataset:{}}};
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
