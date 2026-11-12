
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const {test} = require('node:test');
const vm = require('node:vm');

function fragment(file, first, next) {
  const source = readFileSync(join(__dirname, '../../src/client', file), 'utf8').replaceAll('\r\n', '\n');
  const start = source.indexOf(first), end = source.indexOf(next, start + first.length);
  assert.ok(start >= 0 && end > start, first);
  return source.slice(start, end);
}

const network = 'network/044-state-sync-and-connection.js';
const hotbar = 'ui/048-class-books-and-hotbars.js';
const source = [
  fragment(network, '  const REPLACEMENT_SKILLS', '  let connectionPending'),
  fragment('input/039-movement-flight-and-climbing.js', '  function castAtTarget(', '  function updateFlightButton('),
  fragment(hotbar, '  function useSwordSkill(', '  function learnedSlots('),
  fragment(hotbar, '  function renderMixedSkillHotbar(', '  function useMixedCoreSkill('),
  fragment(hotbar, '  function useAdvancedSkill(', '  function openSkillLoadout('),
  fragment('ui/046-drawers-and-chat.js', '  document.addEventListener("keydown",event=>{\n    if(mode', '  function setFieldLayout('),
  'globalThis.mount = session => { replacementSkillSession = session; };',
].join('\n');

const variants = [
  ['flowing_blades', 'phutthaisawan', 'sword', 'flurry', 'monster'],
  ['chaiya_advanced_counter', 'muay_boran', 'muay', 'counter', 'monster'],
  ['shadow_cut', 'blade', 'blade', 'strike', 'monster'],
  ['firm_guard', 'sentinel', 'sentinel', 'guard'],
  ['seer_ash_rice', 'seer', 'occult', 'rice', 'monster'],
  ['seer_spirit_rain', 'seer', 'occult', 'rice_area', 'monster'],
  ['mender_deep_heal', 'mender', 'occult', 'heal', 'caster'],
  ['mender_deep_circle', 'mender', 'occult', 'heal_area'],
];

function fixture(id, {party = false, bind = true} = {}) {
  const [,pathId,kind,effect] = variants.find(entry => entry[0] === id);
  const caster = {pathId,alive:true,mapId:'ritual_village',x:0,y:0,z:0,
    equippedWeaponId:kind==='sword'?'thai_dual':kind==='muay'?'muay_wraps':''};
  const ally = {alive:true,mapId:caster.mapId,x:1,y:0,z:0,characterName:'Ally'};
  const monster = {alive:true,mapId:caster.mapId,x:1,y:0,z:0};
  const lessons = {[id]:{name:id,effect,stamina:20,range:12}};
  const tree = {learned:[id],cooldowns:{}};
  const mixed = {slots:[{kind:'advanced',id},null,null,null],school:'test'};
  const messages = new Map(), sent = [], notices = [], feedback = [], actions = [], timers = new Map();
  let time = 0, timerId = 0, keyboard;
  function button() {
    return {dataset:{}, disabled:false, click(){ if(!this.disabled)this.onclick?.(); }};
  }
  const bar = {dataset:{},children:[],replaceChildren(){this.children=[];},
    append(el){this.children.push(el);},
    querySelectorAll(){return this.children;},
    querySelector(query){return this.children.find(el=>query.includes('"'+el.dataset.slotNumber+'"'));}};
  const picker = {children:[],append(el){this.children.push(el);}};
  const room = {
    sessionId:'caster', state:{players:new Map([['caster',caster],['ally',ally]])},
    send(channel, data) {sent.push([channel,JSON.parse(JSON.stringify(data))]);},
    onMessage(channel, callback) {messages.set(channel,callback);},
  };
  const context = vm.createContext({
    room,mode:'live',localId:'caster',activeMapId:caster.mapId,spellTargetId:'monster',drawerActive:'',
    fieldTargetVisible:()=>true,
    performance:{now:()=>time},
    setTimeout(fn,ms){const key=++timerId;timers.set(key,{fn,at:time+ms});return key;},
    clearTimeout(key){timers.delete(key);},
    document:{createElement:button,querySelector:()=>bar,addEventListener(name,fn){if(name==='keydown')keyboard=fn;}},
    $:id=>id==='accountEntry'?{hidden:true}:picker,
    openDrawer(id){context.drawerActive=id;},
    closeDrawer(){context.drawerActive='';},
    toast:text=>notices.push(text),
    monsterForSpell:targetId=>targetId==='monster'?monster:undefined,
    syncPKHud(){},affordKey(){},staminaCost(){},positionSwordToast(){},openSkillLoadout(){},useMixedCoreSkill(){},
    arrangeFieldSlots(element,ids){element.children.forEach((el,index)=>{el.dataset.skillId=ids[index];el.dataset.slotNumber=String(index+1);});},
    classSkillBookIdentity:()=>caster,
    mixedSlotStillCurrent:(slotKind,skill,owner,school)=>slotKind==='advanced' && skill===id && owner===caster && school===mixed.school,
    mixedHotbarKey:'',mixedSkillData:()=>mixed,mixedSkillBar:()=>bar,
    coreSkillGraphData:()=>({catalog:{core:{}},ranks:{},manaPerRank:0}),
    advancedSkillData:()=>({kind,me:caster,lessons,cooldowns:tree.cooldowns}),
    swordData:()=>({catalog:{nodes:lessons,core:{}},me:caster,tree}),
    muayBookData:()=>({catalog:{core:{}}}),weaponModelFor:value=>value,
    bladeBookState:{lessons,core:{}},sentinelBookState:{lessons},occultBookState:{path:pathId,lessons,core:{}},
    targetedSkill:null,setTargetedSkill(value){context.targetedSkill=value;},
    selectedSwordSkill:'',selectedBladeSkill:'',selectedSentinelSkill:'',selectedMuaySkill:'',selectedOccultSkill:'',
    seerBoundTarget:'',muayCoreFollowupUntil:0,muayGrabTarget:'',muayGrabUntil:0,
    partyState:party?{members:[{sessionId:'caster'},{sessionId:'ally'}]}:null,
    avatars:new Map(),playAction:(avatar,action)=>actions.push(action),
    SFX(){},recordPracticeCast(){},triggerSkillVfx(){},skillVfxTarget:targetId=>targetId==='monster'?monster:room.state.players.get(targetId),
  });
  vm.runInContext(source,context,{filename:'replacement-client.js'});
  const render=()=>context.renderMixedSkillHotbar(caster,bar);
  const session = context.createReplacementSkillSession(room, {
    currentActor:()=>context.room===room?caster:null,
    target:context.skillVfxTarget,redraw:render,notify:text=>notices.push(text),feedback:data=>feedback.push(data),
  });
  if(bind)context.mount(session);
  render();
  function emit(channel,data){messages.get(channel)(data);}
  function offer(){emit('prototype_protocol_v1_ready',{version:1,gameplayEnabled:true,nonce:'server-nonce'});}
  function confirm(){offer();emit('prototype_protocol_v1_confirmed',{version:1});}
  function notice(data){emit('prototype_skill_v1',{version:1,skillId:id,playerId:'caster',...data});}
  function at(value) {
    time=value;
    for(const [key,job] of timers)if(job.at<=time){timers.delete(key);job.fn();}
  }
  function press() {
    let prevented = false;
    keyboard({key:'1',target:{},preventDefault(){prevented=true;}});
    return prevented;
  }
  return {id,context,caster,room,tree,bar,picker,sent,notices,feedback,actions,session,render,emit,offer,confirm,notice,at,press,
    click:()=>bar.children[0].click()};
}

test('existing buttons cast the correct eight commands in all six classes after confirmation',()=>{
  for(const [id,,,,targetId] of variants){
    const f=fixture(id);
    f.confirm();
    f.click();
    assert.deepEqual(f.sent,[
      ['prototype_protocol_v1',{action:'confirm_gameplay',nonce:'server-nonce'}],
      ['prototype_protocol_v1',{action:'shadow_state'}],
      ['prototype_protocol_v1',{action:id,seq:1,...(targetId===undefined?{}:{targetId})}],
    ],id);
    f.session.close();
  }
});

test('legacy and disabled rooms use the old skill command until a gameplay offer',()=>{
  const f=fixture('firm_guard');
  f.emit('prototype_protocol_v1_ready',{version:1,gameplayEnabled:false,nonce:'ignored'});
  f.click();
  assert.deepEqual(f.sent,[['sentinel_skill',{skillId:'firm_guard'}]]);
  f.offer();
  f.click();
  assert.deepEqual(f.sent.at(-1),['prototype_protocol_v1',{action:'confirm_gameplay',nonce:'server-nonce'}]);
  assert.equal(f.sent.length,2);
  assert.ok(f.notices.length);
  f.session.close();
});

test('number key uses the same Flowing Blades slot and follows up on its original target through cooldown',()=>{
  const f=fixture('flowing_blades');
  f.confirm();
  assert.ok(f.press());
  f.tree.cooldowns.flowing_blades=Date.now()+10000;
  f.notice({phase:'first',targetId:'monster'});
  assert.equal(f.bar.children[0].disabled,true);
  assert.equal(f.press(),false);
  f.at(301);
  assert.equal(f.bar.children[0].textContent,'ฟันต่อ');
  assert.equal(f.bar.children[0].disabled,false);
  f.context.spellTargetId='different';
  assert.ok(f.press());
  assert.deepEqual(f.sent.at(-1),['prototype_protocol_v1',{action:'flowing_blades',seq:2,targetId:'monster'}]);
  f.press();
  assert.equal(f.sent.length,4,'rapid repeat cannot send another follow-up');
  f.notice({phase:'followup',targetId:'monster'});
  assert.equal(f.bar.children[0].disabled,true);
  f.session.close();
});

test('Shadow Cut reuses its original slot, clears on return and cannot cross a map or room',()=>{
  const f=fixture('shadow_cut');
  f.confirm();
  f.click();
  f.tree.cooldowns.shadow_cut=Date.now()+11000;
  const mark={markSeq:1,origin:{mapId:'ritual_village'},expiresAtServerMs:5000};
  f.emit('prototype_shadow_v1_state',{version:1,serverNowMs:2000,marks:[{...mark,playerId:'caster'}]});
  assert.equal(f.bar.children[0].textContent,'ย้อนเงา');
  f.click();
  assert.deepEqual(f.sent.at(-1),['prototype_protocol_v1',{action:'shadow_cut_return',seq:2}]);
  f.notice({...mark,phase:'return'});
  assert.equal(f.bar.children[0].disabled,true);
  f.notice({...mark,phase:'marked',serverNowMs:2000});
  f.caster.mapId='another_map';f.render();
  assert.equal(f.bar.children[0].disabled,true);
  f.context.room={};f.session.close();
  f.notice({...mark,phase:'marked',serverNowMs:2000});
  assert.equal(f.sent.length,4);
});

test('Deep Heal targets the chosen ally, with the original command available on an older server',()=>{
  for(const enabled of [false,true]){
    const f=fixture('mender_deep_heal',{party:true});
    if(enabled)f.confirm();
    f.click();
    assert.equal(f.picker.children.length,2);
    f.picker.children[1].click();
    assert.deepEqual(f.sent.at(-1), enabled
      ? ['prototype_protocol_v1',{action:'mender_deep_heal',seq:1,targetId:'ally'}]
      : ['occult_skill',{skillId:'mender_deep_heal',targetId:'ally'}]);
    f.session.close();
  }
});

