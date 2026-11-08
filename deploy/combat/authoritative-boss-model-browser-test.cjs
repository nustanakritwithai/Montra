/** Real WebGL + actual shipped thai-male.glb. Localhost-only network, no game server.
 * Run in CI: NODE_PATH=<pinned isolated dependencies> node deploy/combat/authoritative-boss-model-browser-test.cjs
 * Requires playwright@1.56.1 babylonjs@8.34.0 babylonjs-loaders@8.34.0 and Chromium.
 * Outputs all 15 boss screenshots in desktop and 390px touch-emulated viewports.
 */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {read,section,productionSources}=require('./authoritative-boss-model-fixture.cjs');
const root=path.resolve(__dirname,'../..'),out=path.resolve(process.env.MONTRA_BOSS_ARTIFACTS||'artifacts/boss-models');
function pageSource(){
 const loader=section(read('src/client/render/021-character-models.js'),'  if (B.SceneLoader?.IsPluginForExtensionAvailable?.(".glb")) {\n    B.SceneLoader.LoadAssetContainerAsync("./assets/characters/"','  function shamanGear(');
 return `
const B=BABYLON,engine=new B.Engine(document.querySelector('canvas'),true,{preserveDrawingBuffer:true}),scene=new B.Scene(engine);
scene.clearColor=new B.Color4(.025,.035,.06,1);
const camera=new B.ArcRotateCamera('boss camera',-Math.PI/2,1.12,11,new B.Vector3(0,2,0),scene);
new B.HemisphericLight('sky',new B.Vector3(.3,1,-.5),scene);
const light=new B.DirectionalLight('key',new B.Vector3(-.3,-1,.6),scene);light.intensity=1.6;
const floor=B.MeshBuilder.CreateGround('floor',{width:20,height:20},scene);floor.isPickable=false;
const floorMat=new B.StandardMaterial('floor',scene);floorMat.diffuseColor=new B.Color3(.07,.09,.12);floor.material=floorMat;
const calls=[],handlers={},noop=()=>{},MAX_LIGHTS=4,shamanWaiting=[],spiritArmWaiting=[];
let shamanBody=null;const attachShamanModel=noop,attachSpiritArms=noop;
Object.assign(globalThis,{activeMapId:'bound_temple',localId:'me',MONSTER_ID:'possessed-1',mode:'live',
 glowMats:new Set(),forestMonsters:new Map(),seerBindingEffects:new Map(),avatars:new Map(),expansionLabels:[],worldDefinitions:{},regionStyles:{},selectedForestTarget:null,selectedPkTargetId:null,spellTargetId:null,villageGhost:null,
 ui:{monsterHint:{}},hudTarget:{until:0},hudKills:{},SKILL_SOURCES:new Set(),$:()=>({textContent:''}),ownServerCharacter:()=>null,getLocalAvatar:()=>null,marker:{setEnabled:noop},syncPKHud:noop,setTargetedSkill:noop,triggerVoiceGuidance:noop,regionPaint:()=>null,fxNear:()=>true});
for(const n of ['toast','ghostVoice','ghostVoices','eventFx','SFX','spawnFx','sparks','shakeCamera','floatAtMonster','floatAtPlayer','triggerCombatCallout','playAction','hitBurst','playAttack','impactAt','registerComboHit','showTalisman','faceAvatarToward','auraFx'])globalThis[n]=(...a)=>calls.push([n,...a]);
globalThis.room=globalThis.joined={sessionId:'me',state:{monsters:new Map(),players:new Map()},onMessage:(n,f)=>handlers[n]=f,send:(...a)=>calls.push(['send',...a])};
${productionSources().join('\n')}
enemy.setEnabled(false);
${loader}
const assert=(ok,message)=>{if(!ok)throw Error(message);};
function frame(t){animateGhosts(.016,t);scene.render();}
function show(id){
 room.state.monsters.clear();syncForestMonsters(room.state);
 const spec=BOSS_VISUALS[id];activeMapId=spec.mapId;worldDefinitions[activeMapId]={name:activeMapId,boss:{id,strikeRadius:id==='atlas_rift_warden'?3.8:3.2}};
 const m={id,mapId:activeMapId,tier:'boss',displayName:id,level:100,x:0,y:0,z:0,facing:0,hp:100,maxHp:100,alive:true,aiState:'idle'};room.state.monsters.set(id,m);syncForestMonsters(room.state);
 const mesh=forestMonsters.get(id),g=mesh.metadata.ghost;g.spawnAt=performance.now()-2000;camera.target.set(0,g.tall*spec.scale*.48,0);camera.radius=innerWidth<600?12:10;
 frame(performance.now());document.querySelector('#label').textContent=id+' · '+spec.kind;
 return {m,mesh,g};
}
let pendingLive=null,pendingDisposed=null,pendingWarning=null,pendingWrappers=[],pendingMultiBaseline=0;
function diagnostic(){
 const safe=fn=>{try{return fn();}catch(e){return {error:String(e)};}};
 return {asset:shamanBody===null?'pending':shamanBody===false?'failed':'ready',map:activeMapId,
  counts:{meshes:scene.meshes.length,skeletons:scene.skeletons.length,materials:scene.materials.length,multiMaterials:scene.multiMaterials.length},
  waitingItems:safe(()=>scene.getWaitingItemsCount()),effectsReady:safe(()=>engine.areAllEffectsReady()),
  unreadyMeshes:scene.meshes.filter(m=>m.subMeshes?.length&&!safe(()=>m.isReady(true))).map(m=>({name:m.name,enabled:m.isEnabled(),material:m.material?.name,errors:m.subMeshes.map(sm=>safe(()=>sm.effect?.getCompilationError?.())).filter(Boolean)})),
  unreadyTextures:scene.textures.filter(t=>!safe(()=>t.isReady())).map(t=>({name:t.name,url:t.url})),
  bosses:[...forestMonsters].map(([id,m])=>({id,enabled:m.isEnabled(),disposed:m.isDisposed(),kind:m.metadata.ghost?.design.kind}))};
}
window.fixture={diagnostic,ids:Object.keys(BOSS_VISUALS),asset:()=>shamanBody===null?'pending':shamanBody===false?'failed':'ready',
 show(id){const {mesh,g}=show(id);return {kind:g.design.kind,vertices:mesh.getChildMeshes().reduce((n,m)=>n+m.getTotalVertices(),0),skeletons:g.rig.metadata?.skeletons?.length||0,humanoid:HUMANOID_KINDS.has(g.design.kind)};},
 check(id){const {m,mesh,g}=show(id);const before=JSON.stringify(m);frame(performance.now()+300);assert(JSON.stringify(m)===before,'renderer mutated server state');assert(g.attackAt<0&&g.hurtAt<0,'idle attack/hurt');assert(!g.phase2&&!g.shieldActive&&!g.enraged&&!g.staggeredUntil,'local combat state');return true;},
 eventOrder(id){const {m,g}=show(id);m.aiState='windup';syncForestMonsters(room.state);const before=JSON.stringify(m);handlers.monster_hit({attackerId:id,targetId:'other',damage:10});const accepted=ghostTimeline(g,performance.now());assert(accepted.hit>0,'accepted event has no strike');assert(JSON.stringify(m)===before,'accepted hit changed server state');m.aiState='idle';syncForestMonsters(room.state);const patched=ghostTimeline(g,performance.now());assert(patched.wind===0,'idle patch left stale windup');return {acceptedHit:accepted.hit,acceptedWind:accepted.wind,patchedWind:patched.wind};},
 pose(id,pose){const {m,mesh,g}=show(id),now=performance.now();if(pose==='windup'){m.aiState='windup';syncForestMonsters(room.state);assert(mesh.metadata.warning.isEnabled(),'windup missing');}
 if(pose==='attack'){handlers.monster_hit({attackerId:id,targetId:'other',damage:10});const timeline=ghostTimeline(g,performance.now());assert(timeline.hit>0&&timeline.wind===0,'confirmed boss hit replayed windup');frame(performance.now());return;}
 if(pose==='hurt'){handlers.combat_hit({attackerId:'other',targetId:id,damage:10,hp:90,source:'melee'});frame(now+100);return;}
 if(pose==='spawn')g.spawnAt=now-200;
 if(pose==='death'){m.alive=false;m.hp=0;syncForestMonsters(room.state);frame(now+700);return;}
 frame(now);},
 lifecycle(id){
  // Warm this rig's cached skins/clothes, then measure a clean map baseline.
  show(id);room.state.monsters.clear();syncForestMonsters(room.state);frame(performance.now()+2200);
  const baseline={skeletons:scene.skeletons.length,multi:scene.multiMaterials.length,meshes:scene.meshes.length,materials:[...scene.materials]};
  const {m,mesh,g}=show(id),now=performance.now();m.alive=false;m.hp=0;syncForestMonsters(room.state);frame(now+2000);assert(!mesh.isEnabled(),'dead mesh visible');m.alive=true;m.hp=100;syncForestMonsters(room.state);assert(mesh.isEnabled(),'respawn hidden');assert(g.attackAt<0&&g.hurtAt<0,'stale action on respawn');const children=mesh.getDescendants();activeMapId='ritual_village';syncForestMonsters(room.state);assert(mesh.isDisposed()&&children.every(n=>n.isDisposed()),'map teardown leaked');
  assert(scene.skeletons.length===baseline.skeletons,'skeleton leak '+id);assert(scene.multiMaterials.length===baseline.multi,'MultiMaterial leak '+id);assert(scene.meshes.length===baseline.meshes,'mesh leak '+id);assert(scene.materials.length===baseline.materials.length&&baseline.materials.every(m=>scene.materials.includes(m)),'shared material leak/disposal '+id);return true;},
 pending(){const id='boss_drowned_marsh',a=show(id);assert(a.mesh.getChildMeshes().some(m=>m.getTotalVertices()>0),'pending invisible');room.state.monsters.clear();syncForestMonsters(room.state);assert(a.mesh.isDisposed(),'pending disposal failed');pendingDisposed=a.mesh;pendingMultiBaseline=scene.multiMaterials.length;pendingLive=show(id).mesh;pendingWrappers=scene.multiMaterials.filter(m=>pendingLive.getChildMeshes().some(child=>child.material===m));pendingWarning=pendingLive.metadata.warning;return true;},
 upgraded(failed){assert(pendingDisposed.isDisposed(),'late callback resurrected root');assert(pendingLive===forestMonsters.get('boss_drowned_marsh'),'upgrade replaced target identity');assert(pendingWarning===pendingLive.metadata.warning,'upgrade replaced strike boundary');const g=pendingLive.metadata.ghost;assert(pendingLive.getChildMeshes().some(m=>m.getTotalVertices()>0),'upgrade invisible');assert(failed?!g.rig.metadata?.skeletons:g.rig.metadata?.skeletons?.length>0,'asset outcome mismatch');if(!failed){assert(pendingWrappers.every(m=>!scene.multiMaterials.includes(m)),'upgrade leaked fallback wrapper');assert(scene.multiMaterials.length===pendingMultiBaseline,'upgrade MultiMaterials did not return to baseline');}return true;},
 render:async()=>{
 // Equivalent to whenReadyAsync(false), but bounded and with frozen-pose frames.
 // Babylon's readiness test includes all meshes/effects, even disabled meshes.
 const deadline=performance.now()+20000;
 while(!scene.isReady(false)){
  if(performance.now()>deadline)throw Error('Scene readiness deadline: '+JSON.stringify(diagnostic()));
  scene.render();await new Promise(resolve=>setTimeout(resolve,50));
 }
 scene.render();await new Promise(resolve=>setTimeout(resolve,50));scene.render();}};
window.ready=true;
`;
}
function bounded(promise,ms,label){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(`Deadline ${ms}ms: ${label}`)),ms);})]).finally(()=>clearTimeout(timer));}
async function main(){
 fs.mkdirSync(out,{recursive:true});const script=pageSource();new Function(script);
 const files=new Map([['/babylon.js',require.resolve('babylonjs')],['/loaders.js',require.resolve('babylonjs-loaders')],['/assets/characters/thai-male.glb',path.join(root,'assets/characters/thai-male.glb')]]);
 const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;if(pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#080b10}canvas{display:block;width:100vw;height:100vh}#label{position:absolute;top:8px;left:10px;color:#fff;font:14px sans-serif}</style><canvas></canvas><div id="label"></div><script src="/babylon.js"></script><script src="/loaders.js"></script><script src="/fixture.js"></script>');}else if(pathname==='/fixture.js'){res.setHeader('Content-Type','application/javascript');res.end(script);}else if(files.has(pathname)){res.setHeader('Content-Type',pathname.endsWith('.glb')?'model/gltf-binary':'application/javascript');fs.createReadStream(files.get(pathname)).pipe(res);}else{res.statusCode=404;res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;let browser,page,releaseAsset;const report=[],stages=[],errors=[],external=[],browserConsole=[];let currentStage='launch';
 const step=async(label,action)=>{currentStage=label;console.log('[boss] START '+label);const started=Date.now();try{const result=await bounded(action(),30000,label);stages.push({label,ms:Date.now()-started,status:'passed'});console.log('[boss] PASS '+label+' '+(Date.now()-started)+'ms');return result;}catch(e){stages.push({label,ms:Date.now()-started,status:'failed',error:String(e)});throw e;}};
 const evaluate=(label,fn,arg)=>step(label,()=>page.evaluate(fn,arg));
 const shot=name=>step('screenshot '+name,()=>page.screenshot({path:path.join(out,name+'.png'),timeout:15000}));
 try{
  browser=await step('launch',()=>chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}));
  for(const viewport of [{width:1280,height:900},{width:390,height:844}])for(const failure of [false,true]){
   const prefix=`${viewport.width}-${failure?'fallback':'loaded'}`,context=await browser.newContext({viewport,isMobile:viewport.width===390,hasTouch:viewport.width===390});context.setDefaultTimeout(30000);
   const gate=new Promise(r=>releaseAsset=r);
   await context.route('**/*',async route=>{const url=route.request().url();if(!url.startsWith(origin+'/')){external.push(url);return route.abort();}if(url.endsWith('/thai-male.glb')){await gate;if(failure)return route.abort('failed');}return route.continue();});
   await context.routeWebSocket('**/*',ws=>{external.push(ws.url());ws.close();});
   page=await context.newPage();page.on('pageerror',e=>{errors.push(e.message);console.error('[boss] pageerror '+e.message);});page.on('console',msg=>{if(['error','warning'].includes(msg.type())){browserConsole.push({type:msg.type(),text:msg.text()});console.log('[boss] browser '+msg.type()+': '+msg.text());}});
   await step(prefix+' navigate',()=>page.goto(origin,{waitUntil:'domcontentloaded'}));await step(prefix+' fixture ready',()=>page.waitForFunction(()=>window.ready));
   assert.equal(await evaluate(prefix+' pending state',()=>fixture.asset()),'pending');await evaluate(prefix+' pending lifecycle',()=>fixture.pending());releaseAsset();await step(prefix+' asset settled',()=>page.waitForFunction(()=>fixture.asset()!=='pending'));assert.equal(await evaluate(prefix+' asset outcome',()=>fixture.asset()),failure?'failed':'ready');await evaluate(prefix+' upgrade identity',failed=>fixture.upgraded(failed),failure);
   const ids=await evaluate(prefix+' roster',()=>fixture.ids);assert.equal(ids.length,15);
   for(const id of ids){const stats=await evaluate(prefix+' show '+id,id=>{fixture.check(id);return fixture.show(id);},id);assert(stats.vertices>0,id);if(!failure&&stats.humanoid)assert(stats.skeletons>0,id+' must use real GLB skeleton');
    await evaluate(prefix+' render '+id,()=>fixture.render());await shot(`${prefix}-${id}`);
    assert(await evaluate(prefix+' lifecycle '+id,id=>fixture.lifecycle(id),id));report.push({viewport:viewport.width,failure,id,...stats});
   }
   for(const id of ['boss_drowned_marsh','boss_bound_temple','boss_moon_pass','atlas_rift_warden','boss_tri_wiang_castle','boss_hex_ridge'])await evaluate(prefix+' event order '+id,id=>fixture.eventOrder(id),id);
   const poses=[...['windup','attack','hurt','spawn','death'].map(pose=>({id:'boss_drowned_marsh',pose})),...['boss_bound_temple','boss_moon_pass','atlas_rift_warden','boss_tri_wiang_castle','boss_hex_ridge'].flatMap(id=>['windup','attack'].map(pose=>({id,pose})))];
   for(const {id,pose} of poses){await evaluate(prefix+' pose '+id+' '+pose,({id,pose})=>fixture.pose(id,pose),{id,pose});await evaluate(prefix+' render pose '+id+' '+pose,()=>fixture.render());await shot(`${prefix}-${id}-${pose}`);}
   assert.deepEqual(errors,[],'browser runtime errors');assert.deepEqual(external,[],'cross-origin/backend requests');await step(prefix+' close',()=>context.close());page=null;
  }
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(`PASS ${report.length} boss/viewport/asset cases plus 60 pose screenshots`);
 }catch(error){
  const failure={stage:currentStage,error:String(error),errors,external,browserConsole,completed:report};
  if(page&&!page.isClosed()){
   try{failure.diagnostic=await bounded(page.evaluate(()=>window.fixture?.diagnostic?.()||{ready:window.ready}),3000,'failure diagnostic');}catch(e){failure.diagnosticError=String(e);}
   try{await bounded(page.screenshot({path:path.join(out,'failure.png'),timeout:5000}),6000,'failure screenshot');}catch(e){failure.screenshotError=String(e);}
  }
  fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify(failure,null,2));throw error;
 }finally{
  fs.writeFileSync(path.join(out,'stages.json'),JSON.stringify(stages,null,2));releaseAsset?.();
  if(browser)try{await bounded(browser.close(),10000,'browser close');}catch(e){console.error(e);}
  server.closeAllConnections();await bounded(new Promise(r=>server.close(r)),3000,'server close');
 }
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={pageSource};
