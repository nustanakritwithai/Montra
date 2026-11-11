// Executes exact shipped client handlers with captured effects, not a live server.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {test}=require('node:test');
const source=fs.readFileSync('src/client/network/044-state-sync-and-connection.js','utf8');
const audio=fs.readFileSync('src/client/audio/051-sound-settings-and-speech.js','utf8');
const helper=audio.slice(audio.indexOf('  const SKILL_VOICE_SHOUTS ='),audio.indexOf('  function soundSettingsHtml('));
const groups={
  sword_skill_used:['phuttha_core','sritra_core','atamat_core','chumphon_core'],
  muay_core_used:['chaiya','korat','lopburi','thasao'],
  blade_skill_used:['blade_heavy','blade_withdraw','blade_fury'],
  blade_cloak_changed:['blade_vanish'],
  sentinel_core_used:['shock','bulwark','riposte','protect'],
  seer_core_used:['seer_pot','seer_binding','seer_poison','seer_buffalo'],
  mender_core_used:['mender_core_heal','mender_core_circle','mender_core_ward','mender_core_cleanse']
};
function fixture(event,{remote=false,map='ritual_village',stale=false,speaking=false}={}){
  const sfx=[],speech=[];let handler, now=1000;
  const id=remote?'other':'me',caster={x:0,y:0,z:0,mapId:map};
  const joined={state:{players:new Map([[id,caster]]),monsters:new Map()},onMessage(name,f){assert.equal(name,event);handler=f}};
  const noop=()=>{};
  const ctx={joined,room:stale?{}:joined,localId:'me',activeMapId:'ritual_village',
    avatars:new Map([[id,caster]]),getLocalAvatar:()=>caster,recordPracticeCast:noop,
    SFX:(...args)=>sfx.push(args),window:{MontraAudio:{speak:(...args)=>speech.push(args),isSpeaking:()=>speaking}},
    performance:{now:()=>now},monsterForSpell:()=>null,skillVfxTarget:()=>null,spellTargetId:'',playAction:noop,triggerSkillVfx:noop,ownServerCharacter:()=>caster,
    syncSentinelUI:noop,syncOccultUI:noop,syncBladeUI:noop,syncMuayHotbar:noop,syncSwordStatus:noop,
    swordSkillAction:()=> 'cast',faceAvatarToward:noop,floatAtPlayer:noop,toast:noop,swordData:()=>null,
    bladeBookState:null,occultBookState:null,priestAreaEffects:new Map(),renderMagicBolt:noop,eventFx:noop,
    scene:{},gold:{},skillEffects:[],MONSTER_ID:'monster',B:{MeshBuilder:{CreateTorus:()=>({position:{set(){}},rotation:{}})}}
  };
  const a=source.indexOf(`joined.onMessage("${event}"`),b=source.indexOf('joined.onMessage(',a+30);
  assert(a>=0 && b>a,event);vm.createContext(ctx);vm.runInContext(helper+source.slice(a,b),ctx);
  return{emit:skillId=>handler({playerId:id,skillId,active:true,durationMs:1000}),sfx,speech,advance:ms=>{now+=ms;}};
}
test('all 24 core skills route one effect and one fixed local shout after authoritative acceptance',()=>{
 let n=0;for(const[event,skills]of Object.entries(groups))for(const id of skills){
  const f=fixture(event);assert.equal(f.speech.length,0);f.emit(id);assert.equal(f.sfx.length,1,event+':'+id);assert.equal(f.sfx[0][0],id);assert.equal(f.speech.length,1,event+':'+id);n++;
 }assert.equal(n,24);
});
test('room broadcasts never speak another player skill; owned cloak confirmation is unicast',()=>{
 for(const[event,skills]of Object.entries(groups)){if(event==='blade_cloak_changed')continue;const f=fixture(event,{remote:true});f.emit(skills[0]);assert.equal(f.sfx.length,1,event);assert.equal(f.speech.length,0,event);}
});
test('skill and occult effects from another map or departed room are silent',()=>{
 for(const event of [...Object.keys(groups).filter(e=>e!=='blade_cloak_changed'),'occult_skill_used'])for(const opts of [{map:'forbidden_forest'},{stale:true}]){
  const f=fixture(event,opts);f.emit(groups[event]?.[0]||'seer_curse');assert.equal(f.sfx.length,0,event);assert.equal(f.speech.length,0,event);
 }
 const f=fixture('blade_cloak_changed',{stale:true});f.emit('blade_vanish');assert.equal(f.sfx.length,0);assert.equal(f.speech.length,0);
});
test('skill shouts never interrupt guidance, NPC answers or a preview',()=>{
 for(const[event,skills]of Object.entries(groups)){const f=fixture(event,{speaking:true});f.emit(skills[0]);assert.equal(f.sfx.length,1);assert.equal(f.speech.length,0,event);}
});
test('successive skills keep their effects and share a spoken-shout cooldown', () => {
 const f=fixture('sword_skill_used');
 f.emit('phuttha_core');
 f.advance(7999);
 f.emit('sritra_core');
 assert.equal(f.sfx.length,2);
 assert.equal(f.speech.length,1);
 f.advance(1);
 f.emit('atamat_core');
 assert.equal(f.sfx.length,3);
 assert.equal(f.speech.length,2);
});
test('hotbar click and target selection never announce an unaccepted or rejected cast',()=>{
 const ui=fs.readFileSync('src/client/ui/048-class-books-and-hotbars.js','utf8');
 const a=ui.indexOf('  function arrangeFieldSlots('),b=ui.indexOf('  // Stamina cost',a),events=[];
 const button={firstChild:{textContent:'Protect'},classList:{add(){}},dataset:{},querySelector(){return null},setAttribute(){},addEventListener(n,f){events.push(f)},replaceChildren(){},onclick(){}};
 const ctx={document:{createElement:()=>({dataset:{},setAttribute(){},append(){}})},SENTINEL_SKILL_ICONS:{protect:''},SG_GLYPH:{},localId:'me',window:{MontraAudio:{speak(){assert.fail('must await acceptance')}}}};
 vm.createContext(ctx);vm.runInContext(helper+ui.slice(a,b),ctx);ctx.arrangeFieldSlots({id:'sentinelHotbar',querySelectorAll:()=>[button]},['protect'],{protect:{name:'Protect'}},()=>{});button.onclick();events.forEach(f=>f());assert.equal(events.length,0);
});
test('unknown skill IDs cannot create new spoken text or cross-provider data',()=>{
 const f=fixture('muay_core_used');f.emit('unrecognized-id');assert.equal(f.speech.length,0);
});
