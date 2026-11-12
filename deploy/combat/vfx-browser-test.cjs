/** Isolated production-source VFX rendering, real Babylon/WebGL, synthetic state.
 * No game login/backend/CDN. Mobile is Chromium viewport/touch emulation only.
 * npm install --no-save --package-lock=false playwright@1.56.1 babylonjs@8.34.0
 * npx playwright install chromium; node deploy/combat/vfx-browser-test.cjs
 */
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function between(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, 'Production source boundary missing: ' + start);
  return source.slice(a, b);
}
function fixture() {
  const materials = read('src/client/render/006-materials-atmosphere.js');
  const production = [
    between(materials, '  function paintTexture(', '  // Deterministic noise'),
    between(materials, '  function additiveMat(', '\n  }') + '\n  }',
    read('src/client/render/007-world-effects.js'),
    between(read('src/client/render/009-effects-and-target-hud.js'), '  function updateWorldFx(', '  // The selected monster'),
    read('src/client/combat/010-action-effects.js'),
    between(read('src/client/input/039-movement-flight-and-climbing.js'), '  function monsterForSpell(', '  function castAtTarget('),
    read('src/client/combat/040-spell-visuals.js'),
  ].join('\n');
  return `
const B=BABYLON, canvas=document.querySelector('canvas');
const engine=new B.Engine(canvas,true,{preserveDrawingBuffer:true});
const scene=new B.Scene(engine);scene.clearColor=new B.Color4(.025,.035,.06,1);
const camera=new B.ArcRotateCamera('fixture-camera',-Math.PI/2,.75,innerWidth<600?48:28,new B.Vector3(0,0,0),scene);
new B.HemisphericLight('fixture-light',new B.Vector3(0,1,0),scene);
const ground=B.MeshBuilder.CreateGround('fixture-ground',{width:30,height:30},scene);
const groundMat=new B.StandardMaterial('ground',scene);groundMat.diffuseColor=new B.Color3(.055,.07,.1);ground.material=groundMat;
let activeMapId='ritual_village',localId='local';
const avatars=new Map(),ghosts=new Map(),skillEffects=[],worldDefinitions={};
const room={state:{players:new Map(),ghosts:new Map(),monsters:new Map()}},cameraShakes=[];
let selectedGhostId='selected-wrong',spellTargetId='selected-wrong';
const MONSTER_ID='fixture-monster',forestMonsters=new Map(),enemy=null,villageGhost=null;
const seerBindingEffects=new Map(),priestAreaEffects=new Map(),floatStack=new Map(),floatLayer=document.createElement('div');
const ownServerCharacter=()=>room.state.players.get(localId),getLocalAvatar=()=>avatars.get(localId);
const shakeCamera=(...args)=>cameraShakes.push(args),triggerCombatCallout=()=>{};
const talismanPaper=new B.StandardMaterial('paper',scene);talismanPaper.emissiveColor=new B.Color3(1,.8,.3);
const bronzeMat=talismanPaper,gold=talismanPaper;
${production}
function actor(id,x,z,color){
 const node=B.MeshBuilder.CreateCylinder(id,{height:1.8,diameter:.65},scene);node.position.set(x,.9,z);
 const mat=new B.StandardMaterial(id+' material',scene);mat.diffuseColor=B.Color3.FromHexString(color);node.material=mat;
 const a={id,sessionId:id,x,y:0,z,heading:0,facing:0,mapId:activeMapId,node};avatars.set(id,a);room.state.players.set(id,a);return a;
}
const casterAvatar=actor('local',-5,0,'#509ddd'),caster={id:'local',sessionId:'local',x:-5,y:0,z:0,facing:Math.PI/2,mapId:activeMapId};room.state.players.set(localId,caster);
const target=actor('authoritative',4,0,'#55cf91'),wrong=actor('selected-wrong',-1,6,'#e19154');
let frozenNow=performance.now();
function frame(age=160){frozenNow=performance.now()+age;updateWorldFx(frozenNow);scene.render();}
function reset(){clearCombatVfx();cameraShakes.length=0;}
window.fixture={scene,engine,caster,target,wrong,worldFx,worldFxPool,skillEffects,avatars,room,cameraShakes,reset,frame,
 cast(id){reset();triggerSkillVfx(id,caster,skillVfxTarget('authoritative'),'authoritative');frame();return worldFx.length;},
 snapshot(){return worldFx.map(f=>({x:f.m.position.x,z:f.m.position.z,yaw:f.m.rotation.y,material:f.m.material.name,enabled:f.m.isEnabled(),visibility:f.m.visibility}));},
 saturate(){reset();for(let i=0;i<FX_MAX;i++)spawnFx('glow','cyan',-10+(i%10)*.2,1,-7+Math.floor(i/10)*.2,{life:5000,s0:.2,s1:.2});for(let i=worldFx.length;i<FX_MAX;i++)spawnFx('ring','cyan',-10,1,-7,{life:5000,s0:.2,s1:.2,critical:true});windupTelegraph(target.node,{tall:1.8,tier:'boss',ty:0});frame(300);return worldFx.length;},
 crossMap(){reset();target.mapId='other';triggerSkillVfx('blade_heavy',caster,skillVfxTarget(target.id),target.id);target.mapId=activeMapId;return worldFx.length;},
 subjectWarp(){
  reset();const observerMap=activeMapId,subject={id:'remote-schema',x:4,y:0,z:0,mapId:activeMapId};
  const live=spawnFx('ring','green',4,.1,0,{follow:subject,life:5000});
  const delayed=spawnFx('glow','gold',4,1,0,{follow:subject,delay:10000,life:5000});
  const control=spawnFx('ring','cyan',-5,.1,0,{life:5000});frame();
  const before={count:worldFx.length,liveVisible:live.m.visibility>0,delayedUnborn:delayed.born>frozenNow};
  subject.mapId='forbidden_forest';frame();
  return {before,observerUnchanged:activeMapId===observerMap,remaining:worldFx.length,controlSurvived:worldFx[0]===control&&control.m.isEnabled(),liveDisabled:!live.m.isEnabled(),delayedDisabled:!delayed.m.isEnabled()};
 },
 teardown(){reset();spawnFx('ring','gold',0,.1,0,{delay:1000});spawnFx('glow','green',0,1,0,{follow:target});const meshes=[0,1,2].map(i=>B.MeshBuilder.CreateBox('stale-'+i,{},scene));skillEffects.push({mesh:meshes[0]});seerBindingEffects.set('stale',{mesh:meshes[1]});priestAreaEffects.set('stale',{mesh:meshes[2]});floatLayer.append(document.createElement('span'));floatStack.set('stale',1);activeMapId='forbidden_forest';clearCombatVfx();frame();return {active:worldFx.length,enabled:worldFxPool.filter(m=>m.isEnabled()).length,disposed:meshes.every(m=>m.isDisposed()),floating:floatLayer.childNodes.length+floatStack.size};}
};
scene.executeWhenReady(()=>{frame();window.fixtureReady=true;});
window.addEventListener('resize',()=>{engine.resize();scene.render();});
`;
}
(async()=>{
 const out=path.join(root,'vfx-browser-evidence');fs.mkdirSync(out,{recursive:true});
 const report={scope:'Isolated production-source Babylon WebGL; synthetic state; mobile emulation, not physical device or full game',screens:[],errors:[],blocked:[]};
 const script=fixture(),babylon=fs.readFileSync(require.resolve('babylonjs'));
 const server=http.createServer((req,res)=>{
  const routes={'/':['text/html','<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:#070910;color:white;font:14px sans-serif}header{height:44px;padding:8px;box-sizing:border-box}canvas{display:block;width:100vw;height:calc(100vh - 44px)}</style><header>MONTRA isolated VFX • blue caster / green server target / orange wrong selection</header><canvas></canvas><script src="/babylon.js"></script><script src="/fixture.js"></script>'],'/babylon.js':['text/javascript',babylon],'/fixture.js':['text/javascript',script],'/favicon.ico':['image/x-icon','']};
  const route=routes[req.url];if(!route){res.writeHead(404);return res.end();}res.setHeader('Content-Type',route[0]);res.end(route[1]);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;let browser;
 try {
  browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  for(const screen of [{name:'desktop',width:1366,height:768},{name:'mobile-emulated',width:390,height:844}]){
   const context=await browser.newContext({viewport:{width:screen.width,height:screen.height},isMobile:screen.name!=='desktop',hasTouch:screen.name!=='desktop',deviceScaleFactor:1,serviceWorkers:'block'});
   await context.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();report.blocked.push(route.request().url());return route.abort();});
   await context.routeWebSocket('**/*',socket=>{report.blocked.push(socket.url());socket.close();});
   const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
   await page.goto(origin);await page.waitForFunction(()=>window.fixtureReady,{},{timeout:60000});
   for(const skill of ['phuttha_core','blade_heavy','seer_binding','seer_poison','mender_core_heal','mender_core_circle','mender_core_ward','mender_core_cleanse','protect']){
    assert(await page.evaluate(id=>fixture.cast(id),skill)>0,skill+' creates real effects');
    await page.screenshot({path:path.join(out,screen.name+'-'+skill+'.png')});
   }
   await page.evaluate(()=>fixture.cast('blade_heavy'));
   const fx=await page.evaluate(()=>fixture.snapshot());
   assert(fx.some(f=>f.x===4&&f.z===0),'authoritative target has effect');
   assert.equal(fx.find(f=>f.material==='fx arc:blood')?.yaw,Math.PI/2,'blade heavy mesh uses schema facing rather than default heading');
   assert(!fx.some(f=>f.x===-1&&f.z===6),'wrong selected target has no effect');
   assert.equal(await page.evaluate(()=>fixture.cameraShakes.length),1,'schema caster identified as local');
   assert.equal(await page.evaluate(()=>fixture.crossMap()),0,'cross-map authoritative target is rejected');
   assert.deepEqual(await page.evaluate(()=>fixture.subjectWarp()),{before:{count:3,liveVisible:true,delayedUnborn:true},observerUnchanged:true,remaining:1,controlSurvived:true,liveDisabled:true,delayedDisabled:true},'remote schema warp culls active and unborn followers without clearing observer-map effects');
   await page.screenshot({path:path.join(out,screen.name+'-remote-subject-warp.png')});
   assert.equal(await page.evaluate(()=>fixture.saturate()),140,'pool remains bounded');
   const warnings=await page.evaluate(()=>fixture.snapshot().filter(f=>f.material.includes(':red')||f.material.includes(':blood')));
   assert(warnings.length>=4&&warnings.every(f=>f.enabled&&f.visibility>0),'critical warning survives saturated pool');
   const redPixels=await page.evaluate(async()=>{const image=new Image();image.src=document.querySelector('canvas').toDataURL();await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,c.width,c.height).data;let red=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>160&&pixels[i]>pixels[i+1]*1.5&&pixels[i]>pixels[i+2]*1.4)red++;return red;});
   assert(redPixels>80,'danger warning produces visible red WebGL pixels');
   await page.screenshot({path:path.join(out,screen.name+'-saturated-warning.png')});
   assert.deepEqual(await page.evaluate(()=>fixture.teardown()),{active:0,enabled:0,disposed:true,floating:0},'map teardown disables active and delayed effects');
   await page.screenshot({path:path.join(out,screen.name+'-map-teardown.png')});
   report.screens.push({...screen,skills:9,warningPlanes:warnings.length,redPixels,teardown:true,crossMapRejected:true,remoteSubjectWarp:true,schemaFacing:true});
   await context.close();
  }
  assert.deepEqual(report.errors,[],'No runtime or console errors');assert.deepEqual(report.blocked,[],'Fixture makes no external requests');report.passed=true;
 }catch(error){report.failure=error.stack;throw error;}
 finally{if(browser)for(const context of browser.contexts())for(const page of context.pages())await page.screenshot({path:path.join(out,'failure-last-state.png')}).catch(()=>{});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
 console.log(JSON.stringify(report,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
