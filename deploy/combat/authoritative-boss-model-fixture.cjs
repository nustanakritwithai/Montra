// Real production rig builders, Babylon geometry/materials/animation; only canvas,
// UI, audio and network boundaries are faked. No bundled main.js dependency.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
function section(s,a,b){const i=s.indexOf(a),j=s.indexOf(b,i+a.length);assert(i>=0&&j>i,`Missing source boundary ${a}`);return s.slice(i,j);}
function fn(file,name){const s=read(file),i=s.indexOf(`  function ${name}(`);assert(i>=0,name);const j=s.indexOf('\n  }',i);assert(j>i,name);return s.slice(i,j+4);}
class Canvas {
 constructor(width=128,height=128){this.width=width;this.height=height;this.style={};}
 getContext(){return new Proxy({canvas:this,createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),getImageData:()=>({data:new Uint8ClampedArray(this.width*this.height*4)}),measureText:()=>({width:10})},{get:(o,k)=>k in o?o[k]:()=>{}});}
 addEventListener(){} removeEventListener(){}
}
function fixture(){
 global.OffscreenCanvas=Canvas;
 const B=require('babylonjs'),engine=new B.NullEngine(),scene=new B.Scene(engine);let now=1000;
 const calls=[],handlers={},nodes=new Map();const noop=()=>{};
 const ctx={B,engine,scene,console,performance:{now:()=>now},Math,Uint8ClampedArray,
  document:{createElement:()=>new Canvas()},window:{},OffscreenCanvas:Canvas,
  activeMapId:'bound_temple',localId:'me',MONSTER_ID:'possessed-1',mode:'live',shamanBody:false,
  glowMats:new Set(),forestMonsters:new Map(),seerBindingEffects:new Map(),avatars:new Map(),expansionLabels:[],worldDefinitions:{},ATLAS_GHOSTS:{},regionStyles:{},
  selectedForestTarget:null,selectedPkTargetId:null,spellTargetId:null,villageGhost:null,
  camera:{target:new B.Vector3(),radius:1000},ui:{monsterHint:{}},hudTarget:{until:0},hudKills:{},SKILL_SOURCES:new Set(),
  $:id=>{if(!nodes.has(id))nodes.set(id,{textContent:''});return nodes.get(id);},ownServerCharacter:()=>null,getLocalAvatar:()=>null,
  marker:{setEnabled:noop},syncPKHud:noop,setTargetedSkill:noop,triggerVoiceGuidance:noop,
  regionPaint:()=>null,fxNear:()=>true};
 for(const n of ['toast','ghostVoice','ghostVoices','eventFx','SFX','spawnFx','sparks','shakeCamera','floatAtMonster','floatAtPlayer','triggerCombatCallout','playAction','hitBurst','playAttack','impactAt','registerComboHit','showTalisman','faceAvatarToward','auraFx'])ctx[n]=(...a)=>calls.push([n,...a]);
 ctx.room=ctx.joined={sessionId:'me',state:{monsters:new Map(),players:new Map()},onMessage:(n,f)=>handlers[n]=f,send:(...a)=>calls.push(['send',...a])};
 vm.createContext(ctx);const run=s=>vm.runInContext(s,ctx);
 const sources=productionSources();for(const source of sources)run(source);
 return {ctx,B,scene,engine,calls,run,at:t=>now=t,emit:(n,p)=>handlers[n](p),dispose:()=>engine.dispose(),sync:()=>ctx.syncForestMonsters(ctx.room.state)};
}
function productionSources(){
 const sources=[],run=s=>sources.push(s);
 const materials='src/client/render/006-materials-atmosphere.js';
 run('let contactMat = null; const lightSpots = [];');
 run(fn('src/client/render/004-scene-camera-lights.js','addMovingLight'));
 for(const n of ['mat','paintTexture','radialTexture','additiveMat','contactShadow'])run(fn(materials,n));
 run(read(materials).match(/  const noise = .*;/)[0]);
 run(read('src/client/render/025-horse-and-avatar-animation.js').match(/  const ease = .*;/)[0]);
 const palette=['src/client/render/006-materials-atmosphere.js','src/client/world/014-ritual-village.js','src/client/world/015-forest-gates-and-services.js','src/client/render/020-avatar-materials-and-meshes.js'].map(read).join('\n');
 for(const n of ['reedMat','lotusBloom','mossMat','ropeRed','bronzeMat','hairMat','ghostMat','eyesMat','strikeMat','keeperMat','gold','darkWood','templeBronze','templeStone','templeGold','templeLacquer','rootSpiritMat','elderSpiritMat']){
  const match=palette.match(new RegExp('\\b'+n+'\\s*=\\s*(mat\\([^\\n;]*?\\))'));assert(match,'material '+n);run(`globalThis[${JSON.stringify(n)}]=${match[1]};`);
 }
 run(fn('src/client/render/021-character-models.js','quatFromUp'));
 for(const n of ['mergedSegment','khomRow','sunYantra'])run(fn('src/client/render/020-avatar-materials-and-meshes.js',n));
 for(const f of ['032-ghost-primitives','033-ghost-materials-and-surfaces','034-humanoid-ghost-designs','035-ghost-instantiation','037-ghost-animation'])run(read('src/client/render/'+f+'.js'));
 run(fn('src/client/render/026-avatar-auras-and-lifecycle.js','updateMonsterAuras'));
 for(const n of ['triggerBossPhase2','breakBossShield','processBossShieldDamage','ensureBossMinions','updateBossMinions'])run(fn('src/client/combat/008-weapon-party-boss-feedback.js',n));
 for(const n of ['makeForestMonster','syncForestMonsters','requestForestAttack'])run(fn('src/client/world/019-state-and-portals.js',n));
 const network=read('src/client/network/044-state-sync-and-connection.js');
 for(const n of ['combat_hit','monster_hit'])run(section(network,`      joined.onMessage("${n}"`,'      joined.onMessage('));
 return sources;
}
module.exports={fixture,read,fn,section,productionSources};
