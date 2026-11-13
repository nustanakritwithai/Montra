// Executable contracts against shipped VFX functions and accepted-event handlers.
// Graphics are instrumented here; vfx-browser-test.cjs separately renders Babylon.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const { test } = require('node:test');
const read = file => fs.readFileSync(file, 'utf8');
const spells = read('src/client/combat/040-spell-visuals.js');
const network = read('src/client/network/044-state-sync-and-connection.js');
function between(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, start); return source.slice(a, b);
}
class Vec {
  constructor(x=0,y=0,z=0) { Object.assign(this,{x,y,z}); }
  set(x,y,z) { Object.assign(this,{x,y,z}); return this; }
  setAll(n) { return this.set(n,n,n); }
  copyFrom(v) { return this.set(v.x,v.y,v.z); }
  subtract(v) { return new Vec(this.x-v.x,this.y-v.y,this.z-v.z); }
  scale(k) { return new Vec(this.x*k,this.y*k,this.z*k); }
  normalize() { const d=Math.hypot(this.x,this.y,this.z)||1;return this.scale(1/d); }
}
function fixture({pool=false}={}) {
  const calls=[], meshes=[], handlers={}; let now=1000;
  const mesh = name => { const m={name,position:new Vec(),rotation:new Vec(),scaling:new Vec(),enabled:true,
    setEnabled(v){this.enabled=v;},isEnabled(){return this.enabled;},dispose(){this.disposed=true;this.enabled=false;}};meshes.push(m);return m; };
  const caster={x:1,y:0,z:2,facing:Math.PI/2,mapId:'ritual_village',targetId:'wrong'};
  const other={...caster,x:-2};
  const actual={id:'actual',x:3,y:0,z:4,alive:true,mapId:'ritual_village'};
  const wrong={...actual,id:'wrong',x:20,z:20};
  const ally={x:4,y:0,z:3,alive:true,mapId:'ritual_village'};
  const avatar={...caster,id:'me',heading:caster.facing,local:true,node:mesh('me')};
  const joined={state:{players:new Map([['me',caster],['other',other],['ally',ally]]),monsters:new Map([['actual',actual],['wrong',wrong]]),monster:{...actual,id:'possessed-1'}},onMessage(n,f){handlers[n]=f;}};
  const noop=()=>{};
  const ctx={calls,meshes,handlers,joined,room:joined,mode:'live',localId:'me',activeMapId:'ritual_village',MONSTER_ID:'possessed-1',
    performance:{now:()=>now},scene:{},camera:{target:{x:0,z:0}},B:{Vector3:Vec,TransformNode:class{constructor(n){return mesh(n);}},Mesh:{DOUBLESIDE:2,BILLBOARDMODE_ALL:7,BILLBOARDMODE_Y:2,BILLBOARDMODE_NONE:0},MeshBuilder:Object.fromEntries(['CreatePlane','CreateLathe','CreateSphere','CreateLineSystem','CreateLines','CreateTorus'].map(n=>[n,mesh])),Color3:{FromHexString:v=>v}},
    avatars:new Map([['me',avatar],['other',{...other,id:'other',node:mesh('other')}],['ally',{...ally,id:'ally',node:mesh('ally')}]]),forestMonsters:new Map([['actual',mesh('actual')],['wrong',mesh('wrong')]]),enemy:mesh('possessed-1'),villageGhost:mesh('village ghost'),
    skillEffects:[],seerBindingEffects:new Map(),priestAreaEffects:new Map(),floatStack:new Map([['old',[1]]]),floatLayer:{replaceChildren(){calls.push(['clear-floats']);}},
    ownServerCharacter:()=>ctx.room?.state?.players?.get('me'),getLocalAvatar:()=>ctx.avatars.get('me'),monsterForSpell:id=>id==='possessed-1'?ctx.room?.state?.monster:ctx.room?.state?.monsters?.get(id),
    fxNear:()=>true,spawnFx:(...args)=>calls.push(['spawn',...args]),sparks:(...args)=>calls.push(['sparks',...args]),shakeCamera:(...args)=>calls.push(['shake',...args]),
    recordPracticeCast:noop,playAction:(...args)=>calls.push(['action',...args]),SFX:(...args)=>calls.push(['sound',...args]),playSkillVoiceShout:noop,toast:noop,
    syncBladeUI:noop,syncSentinelUI:noop,syncOccultUI:noop,syncMuayHotbar:noop,syncSwordStatus:noop,swordSkillAction:()=> 'cast',faceAvatarToward:noop,floatAtPlayer:noop,floatAtMonster:noop,swordData:()=>null,
    bladeBookState:null,occultBookState:null,spellTargetId:'wrong',gold:{},bronzeMat:{},talismanPaper:{},vfxMat:(shape,color)=>({shape,color}),
    SKILL_SOURCES:new Set(),hudTarget:{},hudKills:{},registerComboHit:noop,playAttack:noop,hitBurst:(...args)=>calls.push(['burst',...args]),syncForestMonsters:noop,monsterName:()=> 'ghost',triggerCombatCallout:noop,
    syncSummons:noop,summonAvatars:new Map([['me',{}]]),clearWorldFx:noop};
  vm.createContext(ctx);
  vm.runInContext(spells.slice(0,spells.indexOf('  const localHpBar')),ctx);
  vm.runInContext(read('src/client/combat/010-action-effects.js'),ctx);
  if(pool) {
    const source=read('src/client/render/007-world-effects.js');
    vm.runInContext(source.slice(source.indexOf('  const worldFx =')),ctx);
    const update=read('src/client/render/009-effects-and-target-hud.js');
    vm.runInContext(update.slice(0,update.indexOf('  function hitBurst(')),ctx);
    vm.runInContext(between(update,'  function windupTelegraph(','  // The selected monster'),ctx);
    // Ambient updates intentionally have no avatar during allocator/cleanup tests.
    ctx.avatars.clear();ctx.ownServerCharacter=()=>null;
  }
  function emit(event,data) {
    if(!handlers[event])vm.runInContext(between(network,`joined.onMessage("${event}"`,'joined.onMessage('),ctx);
    return handlers[event](data);
  }
  return {ctx,calls,meshes,emit,caster,avatar,actual,ally,joined,at:t=>{now=t;},eval:s=>vm.runInContext(s,ctx)};
}

test('binding uses real monster/player visual parents and completes accepted event without missing helpers',()=>{
  for(const targetId of ['actual','ally','possessed-1']) {
    const f=fixture();f.emit('seer_core_used',{playerId:'me',skillId:'seer_binding',targetId});
    const seal=f.meshes.find(m=>m.name==='talisman seal');assert(seal,targetId);
    assert.equal(seal.parent,f.ctx.skillVfxTargetMesh(targetId));
    if(targetId==='possessed-1')assert.equal(seal.parent,f.ctx.villageGhost,'use visible ghost root, not scaled invisible proxy');
    assert(f.calls.some(c=>c[0]==='spawn'&&c[1]==='yantra'),targetId);
    assert(f.ctx.skillEffects.length>=2,'binding seal and accepted projectile are completed');
  }
});
test('accepted target IDs beat observer selection and player targets remain supported',()=>{
  for(const [event,skillId,targetId] of [['blade_skill_used','blade_heavy','actual'],['muay_core_used','korat','actual'],['sentinel_core_used','protect','ally'],['sword_skill_used','phuttha_core','actual']]) {
    for(const playerId of ['me','other']) {
      const f=fixture();f.emit(event,{playerId,skillId,targetId});
      const target=f.ctx.skillVfxTarget(targetId), first=f.calls.find(c=>c[0]==='spawn');
      assert(first,event);assert.equal(first[3],target.x,event);assert.equal(first[5],target.z,event);
      assert.notEqual(first[3],20,'observer selection never used');
    }
  }
  const f=fixture();f.emit('sentinel_core_used',{playerId:'me',skillId:'shock',targetId:'',targetIds:['actual']});
  const ring=f.calls.find(c=>c[0]==='spawn');assert.equal(ring[3],f.caster.x);assert.equal(ring[5],f.caster.z);
});
test('unknown/wrong-map target is not retargeted; accepted dead targets still show the killing hit',()=>{
  const f=fixture();assert.equal(f.ctx.skillVfxTarget('missing'),null);
  f.actual.mapId='forbidden_forest';assert.equal(f.ctx.skillVfxTarget('actual'),null);
  f.emit('blade_skill_used',{playerId:'me',skillId:'blade_heavy',targetId:'actual'});
  assert.equal(f.calls.filter(c=>c[0]==='spawn').length,0);
  f.actual.mapId='ritual_village';f.actual.alive=false;
  f.emit('blade_skill_used',{playerId:'me',skillId:'blade_heavy',targetId:'actual'});
  assert(f.calls.some(c=>c[0]==='spawn'));
});
test('all four server-owned Mender core IDs execute distinct VFX plus existing sanctuary behavior',()=>{
  const body=read('deploy/combat/OccultRules.ts').match(/export const MENDER_CORE\s*=\s*\{([\s\S]*?)\} as const;/)[1];
  const ids=[...body.matchAll(/^  (\w+):/gm)].map(m=>m[1]);assert.equal(ids.length,4);
  for(const skillId of ids) {
    const f=fixture();f.emit('mender_core_used',{playerId:'me',skillId,targetId:skillId==='mender_core_heal'?'ally':'me',area:{x:1,y:0,z:2,radius:4,durationMs:3000}});
    assert(f.calls.filter(c=>c[0]==='spawn').length>=3,skillId+' has recipe and generic bolt');
    assert(f.calls.some(c=>c[0]==='sparks'),skillId);
    assert.equal(f.ctx.priestAreaEffects.size,skillId==='mender_core_ward'?1:0);
    if(skillId==='mender_core_ward') { const old=f.ctx.priestAreaEffects.get('me');f.emit('mender_core_used',{playerId:'me',skillId,targetId:'me',area:{x:1,y:0,z:2,radius:4,durationMs:3000}});assert(old.mesh.disposed); }
  }
});
test('core recipes derived from all server catalogs execute; summon and buffalo use dedicated accepted paths',()=>{
  let count=0;
  for(const [catalog,file] of [['SWORD_CORE','SkillCatalog'],['MUAY_CORE','MuayRules'],['BLADE_CORE','BladeRules'],['SENTINEL_CORE','SentinelRules'],['SEER_CORE','OccultRules'],['MENDER_CORE','OccultRules']]) {
    const body=read('deploy/combat/'+file+'.ts').match(new RegExp(`export const ${catalog}\\s*=\\s*\\{([\\s\\S]*?)\\} as const;`));assert(body);
    const ids=[...body[1].matchAll(/^  (\w+):/gm)].map(m=>m[1]);assert.equal(ids.length,4);
    for(const skillId of ids) {
      const f=fixture();count++;
      if(skillId==='seer_buffalo') {f.emit('seer_buffalo_hit',{playerId:'me',targetId:'actual',from:{x:1,y:.8,z:2},to:{x:3,y:.8,z:4}});assert(f.meshes.some(m=>m.name==='ควายธนู'));}
      else {f.ctx.triggerSkillVfx(skillId,f.caster,f.actual,'actual');assert(f.calls.some(c=>c[0]==='spawn'),skillId);}
    }
  }
  assert.equal(count,24);
  const f=fixture();f.joined.state.summons=new Map([['me',{x:1,y:0,z:2}]]);f.emit('summon_spawn',{ownerId:'me',kind:'pot_spirit'});assert(f.meshes.some(m=>m.name==='spirit pot'));
});
test('server facing and local identity are respected without shaking remote observers',()=>{
  for(const playerId of ['me','other']) {
    const f=fixture();f.emit('blade_skill_used',{playerId,skillId:'blade_heavy',targetId:'actual'});
    const arc=f.calls.find(c=>c[0]==='spawn'&&c[1]==='arc');assert.equal(arc[6].yaw,Math.PI/2);
    assert.equal(f.calls.filter(c=>c[0]==='shake').length,playerId==='me'?1:0);
  }
  const f=fixture();f.caster.y=6;f.ctx.triggerSkillVfx('seer_poison',f.caster,f.actual,'actual');
  const ring=f.calls.find(c=>c[0]==='spawn'&&c[1]==='ring');assert.equal(ring[4],.15,'ground zero is not replaced by caster altitude');
});
test('cross-map/stale-room accepted skill handlers do not create VFX or audio',()=>{
  for(const [event,skillId] of [['sword_skill_used','phuttha_core'],['muay_core_used','korat'],['blade_skill_used','blade_heavy'],['sentinel_core_used','protect'],['seer_core_used','seer_binding'],['mender_core_used','mender_core_heal']]) {
    for(const stale of [false,true]) {const f=fixture();if(stale)f.ctx.room={};else f.caster.mapId='forbidden_forest';f.emit(event,{playerId:'me',skillId,targetId:'actual'});assert.equal(f.calls.length,0,event);assert.equal(f.ctx.skillEffects.length,0,event);}
  }
});
test('buffalo and combat hits reject wrong-map/missing/stale targets before effects or sound',()=>{
  for(const event of ['seer_buffalo_hit','combat_hit'])for(const variant of ['map','missing','stale']) {
    const f=fixture();
    if(variant==='map')f.actual.mapId='forbidden_forest';if(variant==='missing')f.joined.state.monsters.delete('actual');if(variant==='stale')f.ctx.room={};
    const sounds=read('src/client/audio/023-action-and-impact-sounds.js');vm.runInContext(sounds,f.ctx);
    const n=f.meshes.length;f.emit(event,{playerId:'me',attackerId:'me',targetId:'actual',damage:10,hp:80,source:'melee',from:{x:1,y:0,z:2},to:{x:3,y:0,z:4}});
    assert.equal(f.calls.length,0,event+':'+variant);assert.equal(f.meshes.length,n);
  }
  // Positive control prevents a mute-everything regression, including final hits.
  const f=fixture();f.actual.alive=false;
  const sounds=read('src/client/audio/023-action-and-impact-sounds.js');vm.runInContext(sounds,f.ctx);
  f.emit('combat_hit',{attackerId:'me',targetId:'actual',damage:10,hp:0,source:'melee'});assert(f.calls.some(c=>c[0]==='burst'));assert(f.calls.some(c=>c[0]==='sound'));
});
test('map and room changes cull delayed/followed effects before their birth time',()=>{
  for(const changed of ['map','room','follow-map']) for(const attached of [false,true]) {
    if(changed==='follow-map'&&!attached)continue;
    const f=fixture({pool:true});const follow={x:0,z:0,mapId:'ritual_village'};f.ctx.spawnFx('ring','gold',0,0,0,{delay:500,life:2000,follow:attached?follow:null});
    if(changed==='map')f.ctx.activeMapId='forbidden_forest';else if(changed==='room')f.ctx.room={};else follow.mapId='forbidden_forest';
    f.at(1100);f.ctx.updateWorldFx(1100);assert.equal(f.eval('worldFx.length'),0);assert.equal(f.eval('worldFxPool.length'),1);assert.equal(f.eval('worldFxPool[0].enabled'),false);
  }
});
test('explicit teardown disposes owned effects and text repeatedly without disposing cached pool meshes',()=>{
  const f=fixture({pool:true});f.ctx.spawnFx('ring','gold',0,0,0,{life:2000});
  const effects=[{dispose(){this.disposed=true;}},{dispose(){this.disposed=true;}},{dispose(){this.disposed=true;}}];
  f.ctx.skillEffects.push({mesh:effects[0]});f.ctx.seerBindingEffects.set('x',{mesh:effects[1]});f.ctx.priestAreaEffects.set('x',{mesh:effects[2]});
  f.ctx.clearCombatVfx();f.ctx.clearCombatVfx();assert(effects.every(e=>e.disposed));assert.equal(f.ctx.skillEffects.length,0);assert.equal(f.ctx.seerBindingEffects.size,0);assert.equal(f.ctx.priestAreaEffects.size,0);assert.equal(f.ctx.floatStack.size,0);assert.equal(f.eval('worldFxPool.length'),1);assert.equal(f.eval('worldFxPool[0].disposed'),undefined);
  for(const [file,start,end] of [['src/client/world/019-state-and-portals.js','  function switchWorld(','  function requestPortalWarp('],['src/client/combat/038-demo-and-monster-state.js','  function showDemo(',null]]) {
    const source=read(file),body=end?between(source,start,end):source.slice(source.indexOf(start));assert(body.includes('clearCombatVfx();'),file+' owns teardown');
  }
  assert(between(network,'await verifyJoinedSlot(','room = joined;').includes('clearCombatVfx();'),'same-map new room clears all old effects');
});
test('48 cosmetic planes leave room for complete telegraphs and pooled mesh reuse',()=>{
  const f=fixture({pool:true});
  for(let i=0;i<140;i++)f.ctx.spawnFx('glow','gold',0,0,0,{life:2000});assert.equal(f.eval('worldFx.length'),48);
  for(let i=0;i<92;i++)f.ctx.spawnFx('ring','red',0,0,0,{life:2000,critical:true});assert.equal(f.eval('worldFx.length'),140);
  const allocated=f.meshes.length;f.ctx.windupTelegraph({position:{x:1,z:2}}, {tall:2,ty:0});
  assert.equal(f.eval('worldFx.length'),140);assert.equal(f.eval('worldFx.filter(f=>f.critical).length'),96);
  assert.deepEqual(Array.from(f.eval('worldFx.slice(-4).map(f=>f.m.material.shape)')),['disc','dash','ring','cross']);assert.equal(f.meshes.length,allocated,'eviction reuses pooled planes');
  f.ctx.clearWorldFx();assert.equal(f.eval('worldFxPool.length'),140);
  for(let i=0;i<140;i++)assert(f.ctx.spawnFx('ring','red',0,0,0,{critical:true}));
  assert.equal(f.ctx.spawnFx('ring','red',0,0,0,{critical:true}),null,'all-critical hard cap does not evict existing warnings or grow');assert.equal(f.eval('worldFx.length'),140);
});
