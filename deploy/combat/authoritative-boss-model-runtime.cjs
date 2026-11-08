/** Executable regressions against production fragments and Babylon NullEngine.
 * NODE_PATH=<isolated dependencies>/node_modules node --test deploy/combat/authoritative-boss-model-runtime.cjs
 * Install babylonjs@8.34.0 in an isolated test prefix, never in the game runtime.
 * This is geometry/state verification, not a WebGL screenshot pass.
 */
const assert=require('node:assert/strict'),{test}=require('node:test');
const {fixture,read}=require('./authoritative-boss-model-fixture.cjs');
const regional=[...read('deploy/combat/RegionalBosses.ts').matchAll(/^  boss\("([^"]+)","([^"]+)",(\d+),/gm)].map(m=>({id:'boss_'+m[1],mapId:m[1],displayName:m[2],level:+m[3]}));
const roster=[...regional,{id:'atlas_rift_warden',mapId:'spirit_rift',displayName:'ราชันรอยแยก',level:100}];
// Reviewed mapping is deliberately independent from the production registry.
const expectedKinds={bound_temple:'bell',drowned_marsh:'boatman',moon_cemetery:'moonspirit',moon_pass:'statue',bamboo_frontier:'stump',hex_ridge:'krahang',lotus_basin:'waterspirit',river_watch:'phipop',twin_neck_pass:'krahang',sam_lan_estuary:'boatman',naga_cavern:'waterspirit',fallen_city:'bell',tri_wiang_castle:'headless',asura_peak:'phitakhon',spirit_rift:'preta'};
function state(entry=roster[0],extra={}){return {...entry,tier:'boss',x:7.25,y:2.75,z:-5.125,facing:1.375,hp:19,maxHp:100,alive:true,aiState:'idle',targetId:'',...extra};}
function add(f,m=state(),radius=3.2){f.ctx.activeMapId=m.mapId;f.ctx.worldDefinitions[m.mapId]={name:m.mapId,boss:{id:m.id,strikeRadius:radius}};f.ctx.room.state.monsters.set(m.id,m);f.sync();return f.ctx.forestMonsters.get(m.id);}
function close(a,b,message){assert(Math.abs(a-b)<1e-5,`${message}: ${a} != ${b}`);}
function vertexRadii(f,mesh,center){mesh.computeWorldMatrix(true);const p=mesh.getVerticesData(f.B.VertexBuffer.PositionKind),out=[];for(let i=0;i<p.length;i+=3){const v=f.B.Vector3.TransformCoordinates(new f.B.Vector3(p[i],p[i+1],p[i+2]),mesh.getWorldMatrix());out.push(Math.hypot(v.x-center.x,v.z-center.z));}return out;}

test('all 15 authoritative IDs select concrete boss rigs; state and target root stay server owned',()=>{
 const f=fixture();try {
 assert.equal(roster.length,15);assert.equal(Object.keys(f.run('BOSS_VISUALS')).length,15);
 const kinds=new Set();
 for(const entry of roster){
  const m=state(entry),before=JSON.stringify(m),mesh=add(f,m),g=mesh.metadata.ghost,d=f.ctx.bossDesign(m,m.id);
  assert(g,entry.id+' must not remain the keeper sphere');assert.equal(g.design.kind,d.kind);assert.equal(d.kind,expectedKinds[m.mapId]);assert.equal(g.design.boss,true);kinds.add(d.kind);
  assert.equal(mesh.metadata.monsterId,m.id);assert.equal(mesh.isPickable,true);assert.equal(mesh.visibility,.001);
  assert(mesh.getChildMeshes().some(c=>c.getTotalVertices()>0),'visible geometry is built even without GLB');
  assert(mesh.getChildMeshes().every(c=>!c.isPickable),'visual descendants cannot steal targeting');
  close(mesh.position.x,m.x,'server X');close(mesh.position.z,m.z,'server Z');close(g.ty,m.y,'server ground Y');close(mesh.position.y-g.tall/2,m.y,'visual ground origin');close(mesh.rotation.y,m.facing,'server facing');
  close(g.tx,m.x,'authoritative target X');close(g.tz,m.z,'authoritative target Z');close(g.tf,m.facing,'authoritative facing target');
  mesh.computeWorldMatrix(true);const box=mesh.getBoundingInfo().boundingBox;
  close(box.minimumWorld.y,m.y,'pick box grounded');close(box.maximumWorld.y-box.minimumWorld.y,g.tall*d.scale,'pick box scales to boss height');
  const ray=new f.B.Ray(new f.B.Vector3(m.x,m.y+g.tall*d.scale/2,m.z-20),new f.B.Vector3(0,0,1),40);
  const hit=f.scene.pickWithRay(ray,p=>p.isPickable);assert.equal(hit.pickedMesh,mesh,'real ray resolves authoritative root');
  g.spawnAt=0;f.at(3000);f.ctx.animateGhosts(.016,3000);
  const visible=g.rig.getChildMeshes().filter(child=>child.isEnabled()&&child.visibility>0&&child.getTotalVertices()>0);
  const highest=Math.max(...visible.map(child=>{child.computeWorldMatrix(true);return child.getBoundingInfo().boundingBox.maximumWorld.y;}));
  const upperRay=new f.B.Ray(new f.B.Vector3(m.x,highest-.05,m.z-20),new f.B.Vector3(0,0,1),40);
  assert.equal(f.scene.pickWithRay(upperRay,p=>p.isPickable).pickedMesh,mesh,'highest visible bound stays targetable '+m.id);
  assert(g.tall>=2,'boss pick height is not normal ghost size');assert.equal(JSON.stringify(m),before,'renderer must never mutate HP/position/state');
  f.ctx.requestForestAttack(m.id);assert.deepEqual(f.calls.filter(c=>c[0]==='send').at(-1).slice(0,2),['send','attack']);assert.equal(f.calls.filter(c=>c[0]==='send').at(-1)[2].targetId,m.id);
  f.ctx.room.state.monsters.clear();f.sync();assert(mesh.isDisposed());
 }
 assert(kinds.size>=6,'boss identities must not collapse to one generic rig');
 }finally{f.dispose();}
});

test('windup torus uses exact server radius independent of boss scale, altitude and facing',()=>{
 const f=fixture();try{for(const entry of roster){
  const m=state(entry,{aiState:'windup'}),radius=entry.id==='atlas_rift_warden'?3.8:3.2,mesh=add(f,m,radius),warning=mesh.metadata.warning;
  assert(warning,entry.id);assert(warning.isEnabled());assert.equal(warning.isPickable,false);
  const radii=vertexRadii(f,warning,m);close((Math.max(...radii)+Math.min(...radii))/2,radius,'ring centerline radius');
  close(warning.getAbsolutePosition().y,m.y+.11,'ring ground Y');
  m.aiState='chase';f.sync();assert.equal(warning.isEnabled(),false);
  f.ctx.room.state.monsters.clear();f.sync();
 }}finally{f.dispose();}
});

test('idle, proximity and low HP cannot invent attacks, hurt, phase two, shield or stagger',()=>{
 const f=fixture();try{const m=state(),mesh=add(f,m),g=mesh.metadata.ghost;const before=JSON.stringify(m),attack=g.attackAt,hurt=g.hurtAt;
  for(const hp of [49,29,1]){m.hp=hp;for(let t=2000;t<=6000;t+=250){f.at(t);f.sync();f.ctx.animateGhosts(.016,t);}}
  assert.equal(g.attackAt,attack);assert.equal(g.hurtAt,hurt);
  for(const key of ['phase2','shieldActive','staggeredUntil','enraged'])assert(!g[key],key+' must not be invented');
  assert(!f.calls.some(c=>c[0]==='triggerCombatCallout'&&['boss_phase_2','boss_enrage','shield_break'].includes(c[1])));
  m.hp=19;assert.equal(JSON.stringify(m),before);
  f.at(7000);f.emit('monster_hit',{attackerId:m.id,targetId:'other',damage:12});assert.equal(g.attackAt,6550);const timeline=f.ctx.ghostTimeline(g,7000);assert(timeline.hit>0);assert.equal(timeline.wind,0,'confirmed hit must not replay anticipation');
  f.at(7200);f.emit('combat_hit',{attackerId:'other',targetId:m.id,damage:7,hp:12,source:'melee'});assert.equal(g.hurtAt,7200);assert.equal(m.hp,19,'accepted event animation does not apply damage locally');
  const normal=f.ctx.makeGhostMonster({...m,tier:'normal'},'normal-probe',{kind:'corpse',scale:1});f.ctx.forestMonsters.set('normal-probe',normal);f.at(7300);f.emit('monster_hit',{attackerId:'normal-probe',targetId:'other'});assert.equal(normal.metadata.ghost.attackAt,7300,'ordinary ghost timeline unchanged');
  f.ctx.room={};f.at(7500);f.emit('monster_hit',{attackerId:m.id,targetId:'other'});assert.equal(g.attackAt,6550,'stale room ignored');
 }finally{f.dispose();}
});

test('death, repeated snapshots, respawn and map cleanup preserve lifecycle',()=>{
 const f=fixture();try{const m=state(),mesh=add(f,m),g=mesh.metadata.ghost;
  f.at(2000);m.alive=false;m.hp=0;f.sync();assert.equal(g.deathAt,2000);const deaths=f.calls.filter(c=>c[0]==='eventFx'&&c[1]==='ghost_die').length;
  f.at(2100);f.sync();assert.equal(g.deathAt,2000);assert.equal(f.calls.filter(c=>c[0]==='eventFx'&&c[1]==='ghost_die').length,deaths);
  f.at(3500);f.ctx.animateGhosts(.016,3500);assert.equal(mesh.isEnabled(),false);f.sync();assert.equal(mesh.isEnabled(),false);
  g.attackAt=3450;g.hurtAt=3460;f.at(4000);m.alive=true;m.hp=100;f.sync();assert(mesh.isEnabled());assert.equal(g.deathAt,0);assert.equal(g.spawnAt,4000);assert(g.attackAt<0&&g.hurtAt<0,'respawn clears prior action timeline');
  const descendants=mesh.getDescendants();f.ctx.activeMapId='ritual_village';f.sync();assert(mesh.isDisposed());assert(descendants.every(n=>n.isDisposed()));assert.equal(f.ctx.forestMonsters.size,0);
  f.ctx.activeMapId=m.mapId;m.alive=false;f.sync();assert.equal(f.ctx.forestMonsters.get(m.id).isEnabled(),false,'already-dead initial snapshot stays hidden');
 }finally{f.dispose();}
});

test('unknown IDs, wrong maps and non-boss tiers never borrow a registered boss identity',()=>{
 const f=fixture();try{
  for(const m of [state(roster[0],{id:'boss_future_unknown'}),state(roster[0],{mapId:'moon_pass'}),state(roster[0],{tier:'normal'})])assert.equal(f.ctx.bossDesign(m,m.id),null);
  const m=state(roster[0],{id:'boss_future_unknown'}),mesh=add(f,m);assert.equal(mesh.metadata.ghost,undefined);assert(mesh.getTotalVertices()>0);assert.equal(mesh.metadata.monsterId,m.id);assert(mesh.metadata.warning);
 }finally{f.dispose();}
});

test('pending shared asset retains fallback; failed load and late callbacks cannot resurrect removed bosses',()=>{
 const f=fixture();try{
  const entry=roster.find(e=>f.run(`HUMANOID_KINDS.has(bossDesign(${JSON.stringify(state(e))},${JSON.stringify(e.id)}).kind)`));assert(entry,'at least one humanoid boss');
  f.ctx.shamanBody=null;const m=state(entry),mesh=add(f,m);assert(mesh.getChildMeshes().some(c=>c.getTotalVertices()>0),'pending body must have visible fallback');
  const pending=f.run('ghostWaiting.length');assert(pending>0,'shared asset callback registered');
  f.ctx.room.state.monsters.clear();f.sync();assert(mesh.isDisposed());const count=f.scene.meshes.length;
  f.ctx.shamanBody=false;f.run('for (const build of ghostWaiting.splice(0)) build();');assert.equal(f.scene.meshes.length,count,'late failure callback must not create orphan geometry');
  const fresh=add(f,m);assert(fresh.getChildMeshes().some(c=>c.getTotalVertices()>0),'asset failure fallback remains visible');f.ctx.animateGhosts(.016,2000);
 }finally{f.dispose();}
});

test('repeated create/map-exit cycles release owned meshes and MultiMaterials without disposing shared materials',()=>{
 const f=fixture();try{
  // Warm lazy shared contact/default materials once before measuring growth.
  for(const entry of roster){add(f,state(entry));f.ctx.activeMapId='ritual_village';f.sync();}
  const baseline={meshes:f.scene.meshes.length,multi:f.scene.multiMaterials.length,materials:f.scene.materials.length};
  const shared=f.run('gm.corpse');
  for(let cycle=0;cycle<4;cycle++)for(const entry of roster){const m=state(entry),mesh=add(f,m);f.ctx.activeMapId='ritual_village';f.sync();assert(mesh.isDisposed());assert.equal(f.scene.meshes.length,baseline.meshes,'mesh leak '+entry.id);assert.equal(f.scene.multiMaterials.length,baseline.multi,'MultiMaterial leak '+entry.id);assert(f.scene.materials.includes(shared),'shared corpse material disposed');}
  assert.equal(f.scene.materials.length,baseline.materials,'shared material count changed');
 }finally{f.dispose();}
});

test('production smoke color variants share the painted opacity texture without empty clone textures',()=>{
 const f=fixture();try{
  const materials=f.run('[gm.smoke,gm.smokeWhite,gm.moonMist]'),texture=materials[0].opacityTexture;
  assert.equal(new Set(materials).size,3,'color variants remain separate materials');
  assert(materials.every(m=>m.opacityTexture===texture),'variants must use original painted opacity gradient');
  assert.equal(f.scene.textures.filter(t=>t.name==='smoke fade').length,1,'dispose unused DynamicTexture clones');
  assert.equal(texture.hasAlpha,true);
  const m=state(roster.find(e=>e.mapId==='moon_cemetery'));add(f,m);f.ctx.activeMapId='ritual_village';f.sync();
  assert(f.scene.textures.includes(texture),'boss teardown must not dispose shared opacity texture');
  assert(materials.every(m=>f.scene.materials.includes(m)),'boss teardown must preserve shared smoke materials');
  // NullEngine has no GPU upload; actual texture readiness is asserted by WebGL CI.
 }finally{f.dispose();}
});
