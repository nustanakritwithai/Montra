// Executes shipped functions with captured effects only. No server or player data.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {test}=require('node:test');
const source=fs.readFileSync('main.js','utf8');
function slice(start,end){const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert(a>=0&&b>a,start);return source.slice(a,b);}
const route=slice('  function openClassSkillBook(', '  function getBuildCatalog(');
const dataSource=slice('  function swordData(', '  function syncSwordStatus(');
const buttonSource=slice('  function syncSwordTreeButton(', '  let swordHotbarKey=');
const ownerSource=slice('  let activeSkillModalId =', '  function ensureSkillDetailModalElements(');
const modalSource=slice('  function ensureSkillDetailModalElements(', '  function openSwordTree(');
const openSource=slice('  function openSwordTree(', '  function renderSwordTree(');
const renderSource=slice('  function renderSwordTree(', '  function ancestryHint(');
function fixture(code=''){
  const nodes=new Map(),wire=[],opened=[],toasts=[];
  const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:true,style:{},innerHTML:'',setAttribute(){},querySelectorAll:()=>[]});return nodes.get(id);};
  const ranks={phuttha_core:0,sritra_core:0,atamat_core:0,chumphon_core:0};
  const core=Object.fromEntries(Object.keys(ranks).map(id=>[id,{name:id,stamina:8,cooldownMs:1200,range:2,description:id}]));
  const catalog={core,coreLevels:[1,10],corePointLevels:[1,5],coreProgress:{}};
  const ctx={mode:'live',localId:'slot-1',me:{pathId:'phutthaisawan',level:15,swordTreeData:JSON.stringify({coreRanks:ranks,school:'phuttha'})},
    room:{state:{swordTreeCatalog:JSON.stringify(catalog)},send:(command,payload)=>wire.push({command,payload})},
    $:node,ownServerCharacter:()=>ctx.me,toast:s=>toasts.push(s),SFX(){},gearGuides:null,skillLearningLevel:me=>me.level,
    demoSwordTreeData:{coreRanks:{...ranks}},DEFAULT_SWORD_CATALOG:catalog,drawerActive:null,
    swordTreeRenderKey:'',swordTreeViewedSchool:'',skillGraphKey:'',targetedSkill:null,selectedSwordSkill:'',
    setTargetedSkill:s=>ctx.targetedSkill=s,
    openDrawer:(kind,title,html)=>{ctx.drawerActive=kind;opened.push(kind);},closeDrawer:()=>ctx.drawerActive=null,
    window:{confirm:()=>true},renderSwordTree:()=>{},
  };
  vm.createContext(ctx);vm.runInContext(dataSource+ownerSource+modalSource+code,ctx);
  return {ctx,nodes,node,wire,opened,toasts,run:s=>vm.runInContext(s,ctx),catalog};
}
test('quick skill entry routes all six authoritative classes independent of DOM visibility/order',()=>{
  const calls=[],ctx={mode:'live',room:{},me:null,ownServerCharacter:()=>ctx.me,toast:()=>calls.push('waiting')};
  for(const name of ['SwordTree','MuayBook','BladeBook','SentinelBook','OccultBook'])ctx['open'+name]=()=>calls.push(name);
  vm.createContext(ctx);vm.runInContext(route,ctx);
  for(const [pathId,expected] of [['phutthaisawan','SwordTree'],['muay_boran','MuayBook'],['blade','BladeBook'],['sentinel','SentinelBook'],['seer','OccultBook'],['mender','OccultBook']]){
    ctx.me={pathId};ctx.openClassSkillBook();assert.equal(calls.pop(),expected);
  }
  for(const me of [null,{pathId:''},{pathId:'unknown'}]){ctx.me=me;ctx.openClassSkillBook();assert.equal(calls.pop(),'waiting');}
  ctx.mode='connecting';ctx.openClassSkillBook();assert.equal(calls.pop(),'waiting');
  ctx.mode='demo';ctx.openClassSkillBook();assert.equal(calls.pop(),'SwordTree');
  assert.match(source,/\$\("quickSkills"\)\.onclick=openClassSkillBook;/);
  assert(!source.includes('querySelector(".book-entry:not([hidden])")'));
});
test('LIVE sword reads only the current sword character and real server data; DEMO is explicit',()=>{
  const f=fixture(),original=f.ctx.me.swordTreeData;
  assert.equal(f.ctx.swordData().me,f.ctx.me);
  assert.equal(f.ctx.swordData().tree.coreRanks.phuttha_core,0);
  for(const value of ['',null,'{bad','null','[]','42','"text"']){
    f.ctx.me.swordTreeData=value;assert.equal(f.ctx.swordData(),null,'bad tree '+value);
    f.ctx.me.swordTreeData=original;f.ctx.room.state.swordTreeCatalog=value;assert.equal(f.ctx.swordData(),null,'bad catalog '+value);
    f.ctx.room.state.swordTreeCatalog=JSON.stringify(f.catalog);
  }
  for(const pathId of ['muay_boran','blade','sentinel','seer','mender','']){f.ctx.me.pathId=pathId;assert.equal(f.ctx.swordData(),null);}
  f.ctx.me=null;assert.equal(f.ctx.swordData(),null);
  f.ctx.mode='demo';assert.equal(f.ctx.swordData().tree,f.ctx.demoSwordTreeData);
  assert.equal(f.ctx.swordData().catalog,f.ctx.DEFAULT_SWORD_CATALOG);
  f.ctx.mode='connecting';assert.equal(f.ctx.swordData(),null);
});
test('direct sword open fails closed instead of displaying a fake or wrong-class book',()=>{
  const f=fixture(openSource);f.ctx.me.pathId='seer';f.ctx.openSwordTree();assert.deepEqual(f.opened,[]);
  f.ctx.me.pathId='phutthaisawan';f.ctx.me.swordTreeData='';f.ctx.openSwordTree();assert.deepEqual(f.opened,[]);
  f.ctx.mode='demo';f.ctx.openSwordTree();assert.deepEqual(f.opened,['swordTree']);
});
test('sword entry is hidden for other LIVE classes and cancels stale sword targeting',()=>{
  const f=fixture(buttonSource);
  for(const pathId of ['muay_boran','blade','sentinel','seer','mender','']){
    f.ctx.me.pathId=pathId;f.ctx.targetedSkill='sword';f.ctx.selectedSwordSkill='phuttha_core';f.ctx.syncSwordTreeButton(f.ctx.me);
    assert.equal(f.node('swordTreeButton').hidden,true);assert.equal(f.ctx.targetedSkill,null);assert.equal(f.ctx.selectedSwordSkill,'');
  }
  f.ctx.me.pathId='phutthaisawan';f.ctx.syncSwordTreeButton(f.ctx.me);assert.equal(f.node('swordTreeButton').hidden,false);
  f.ctx.mode='demo';f.ctx.syncSwordTreeButton(null);assert.equal(f.node('swordTreeButton').hidden,false);
});
test('book owners close on class, slot, room and mode changes, but ordinary sync preserves them',()=>{
  for(const change of [f=>f.ctx.me.pathId='seer',f=>f.ctx.localId='slot-2',f=>f.ctx.room={...f.ctx.room},f=>f.ctx.mode='demo']){
    const f=fixture();f.ctx.openClassBookDrawer('swordTree','','');f.ctx.openSkillDetailModal('phuttha_core');
    f.ctx.syncClassSkillBookContext();assert.equal(f.ctx.drawerActive,'swordTree');assert.equal(f.node('skillDetailModal').hidden,false);
    change(f);f.ctx.syncClassSkillBookContext();assert.equal(f.ctx.drawerActive,null);assert.equal(f.node('skillDetailModal').hidden,true);
  }
  const f=fixture();f.ctx.drawerActive='bag';f.ctx.syncClassSkillBookContext();assert.equal(f.ctx.drawerActive,'bag');
});
test('sword core modal emits one canonical upgrade, waits for server ranks, refreshes and rejects stale handlers',()=>{
  const f=fixture();f.ctx.openSkillDetailModal('phuttha_core');const button=f.node('skillModalUpgradeBtn');
  assert.equal(button.disabled,false);const before=f.ctx.me.swordTreeData;button.onclick();
  assert.equal(f.wire.length,1);assert.equal(f.wire[0].command,'sword_core_book');assert.equal(f.wire[0].payload.action,'upgrade');
  assert.equal(f.wire[0].payload.skillId,'phuttha_core');assert.equal(f.ctx.me.swordTreeData,before);
  f.ctx.me.swordTreeData=JSON.stringify({coreRanks:{phuttha_core:2}});f.ctx.syncClassSkillBookContext();
  assert.equal(button.disabled,true);assert.equal(button.onclick,null);assert.match(f.node('skillModalBadge').textContent,/ขั้น 2\/2/);
  f.ctx.me.swordTreeData=before;f.ctx.openSkillDetailModal('phuttha_core');const stale=button.onclick;
  f.ctx.me.pathId='seer';stale();assert.equal(f.wire.length,1);
  f.ctx.mode='demo';stale();assert.equal(f.ctx.demoSwordTreeData.coreRanks.phuttha_core,0);
});
test('sword reset emits only canonical core reset and cannot cross character sessions',()=>{
  const f=fixture(renderSource);f.ctx.renderSwordTree();const reset=f.node('resetSwordCore').onclick;reset();
  assert.equal(f.wire.length,1);assert.equal(f.wire[0].command,'sword_core_book');assert.equal(f.wire[0].payload.action,'reset');
  f.ctx.localId='slot-2';reset();assert.equal(f.wire.length,1);
});
