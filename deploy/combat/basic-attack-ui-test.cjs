/** Production orb and attack helpers, synthetic room only. Shared by browser fixture. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),source=fs.readFileSync(root+'/main.js','utf8');
function slice(a,b){const start=source.indexOf(a),end=source.indexOf(b,start);assert(start>=0&&end>start);return source.slice(start,end);}
function fixtureScript(){return `
 const wire=[],notices=[];let dashes=0,profiles=0,mode='live',activeMapId='ritual_village',selectedForestTarget=null,selectedPkTargetId=null,spellTargetId=null,monsterReady=true,demoMonsterHp=100,demoAutoAttack=false;
 const MONSTER_ID='possessed-1',me={pathId:'seer',x:0,z:0};
 const room={state:{worldDefinition:'fixture',monsters:new Map()},send:(type,data)=>wire.push({type,data})};
 const $=id=>document.getElementById(id),ui={monsterHint:document.createElement('span')};
 const enemy={isEnabled:()=>true},marker={setEnabled(){}},triggerVoiceGuidance=()=>{},setTargetedSkill=()=>{},syncPKHud=()=>{},monsterName=()=>'',toast=text=>notices.push(text);
 const requestSwipeDash=()=>{dashes++;};
 const ownServerCharacter=()=>me,openCharacterProfile=()=>{profiles++;};
 ${slice('  function requestForestAttack(', '  function switchWorld(')}
 ${slice('  function requestMonsterAttack(', '  function updateStatus(')}
 ${slice('  const ORB_SEGS =', '  // ---- Resource strip (top-left):')}
 ${slice('  // ---- Layout moves:', '  // ---- Status boxes:')}
 ${slice('  const dashZone =','  let drawerActive =')}
 ${slice('  // One activation sends the existing monster attack order;', '  // Under the minimap')}
 $('characterProfile').onclick=openCharacterProfile;
 layoutOrbArc();
 const refresh=()=>updateVitalOrb(73,100,35,100,20,60);refresh();
 window.fixture={wire,notices,refresh,counts:()=>({profiles,dashes,wire:wire.length}),forest:()=>{activeMapId='forbidden_forest';selectedForestTarget=null;room.state.monsters=new Map([['near',{id:'near',alive:true,mapId:activeMapId,x:2,z:0,level:1}],['far',{id:'far',alive:true,mapId:activeMapId,x:9,z:0,level:1}]]);},selected:id=>{selectedForestTarget=id;},empty:()=>{room.state.monsters.clear();}};
 `;}
if(require.main===module){
 assert.match(fs.readFileSync(root+'/index.html','utf8'),/styles\.css\?v=nested-recipes-20261108-attack-button-20261108/,'native-button styling has a new cache key');
 assert.match(source,/document.createElement\("button"\); el.type = "button"; el.className = "vital-orb"/);
 assert(!slice('  const ORB_SEGS =','  const orbWide =').includes('openCharacterProfile()'));
 assert.match(fixtureScript(),/room.send\("attack", \{ targetId: MONSTER_ID \}\)/);
 console.log('PASS basic attack UI source: production orb, existing attack protocol and no profile binding');
}
module.exports={fixtureScript};
