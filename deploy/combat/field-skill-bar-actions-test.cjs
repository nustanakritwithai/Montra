const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

const read = path => readFileSync(path, 'utf8');
const html = read('index.html');
const barStart = html.indexOf('class="skill-bar learned-bar"');
const bar = html.slice(barStart, html.indexOf('id="fishingPanel"'));
const ghostRow = html.slice(html.indexOf('id="ghostFieldActions"'), barStart);
assert.match(bar, /<button id="fly" class="orb-action[^"]*"[^>]* hidden>/);
for (const [id, icon] of Object.entries({
  ghostSummonButton: 'summon', ghostAttackButton: 'attack', ghostFollowButton: 'follow',
  ghostSkillButton: 'skill',
})) {
  assert.equal(html.split(`id="${id}"`).length, 2, `${id} has exactly one button`);
  assert.match(ghostRow, new RegExp(
    `<button id="${id}" class="orb-action[^"]*"[^>]* hidden><img[^>]*src="\\./assets/ui/companion-${icon}\\.webp"[^>]*alt=""`
  ));
  assert.doesNotMatch(bar, new RegExp(`id="${id}"`));
}
for (const icon of ['summon','attack','follow','skill','team','recall']) {
  const artwork = readFileSync(`assets/ui/companion-${icon}.webp`);
  assert.equal(artwork.toString('ascii',8,16), 'WEBPVP8X', icon);
  assert.ok(artwork[20] & 0x10, `${icon} has transparency`);
}
const characterMenu = html.slice(html.indexOf('id="menu-character"'), html.indexOf('id="menu-travel"'));
assert.equal(html.split('id="ghostPoolButton"').length, 2);
assert.match(characterMenu, /<button id="ghostPoolButton"[^>]*>.*companion-team\.webp.*จัดทีมคู่หู/);
assert.doesNotMatch(characterMenu, /<button id="ghostPoolButton"[^>]* hidden/);
assert.doesNotMatch(html, /id="ghostTeamButton"/);
assert.doesNotMatch(ghostRow, /id="ghostPoolButton"/);
assert.equal(html.split('id="ghostPotButton"').length, 2);
assert.doesNotMatch(ghostRow, /id="ghostPotButton"/);
assert.match(html.slice(html.indexOf('class="field-prompts"'),html.indexOf('id="ghostFieldActions"')), /<button id="ghostPotButton"[^>]*><img src="\.\/assets\/ui\/ghost-capture-jar\.webp" alt=""/);
const jarArtwork = readFileSync('assets/ui/ghost-capture-jar.webp');
assert.equal(jarArtwork.toString('ascii', 0, 4), 'RIFF');
assert.equal(jarArtwork.toString('ascii', 8, 12), 'WEBP');
assert.match(read('src/client/ui/046-drawers-and-chat.js'), /ghostPool:"character"/);
const hudCss=read('src/styles/hud/022-chat-compose-and-vitals.css');
assert.match(hudCss,/\.ghost-field-actions\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column/);
assert.match(hudCss,/\.ghost-field-buttons\s*\{[^}]*flex-wrap:\s*wrap/);
assert.doesNotMatch(hudCss,/\.ghost-field-(?:actions|status|skills)\s*\{[^}]*position:\s*absolute/);
assert.doesNotMatch(html, /id="(?:flightButton|menuGhostPot)"/);
assert.doesNotMatch(read('src/client/ui/048-class-books-and-hotbars.js'), /id="occultFlight"/);
assert.match(read('src/client/core/059-frame-loop-and-startup.js'), /\$\("fly"\)\.onclick = toggleFlightCommand/);

const bindings = read('src/client/input/058-field-control-bindings.js');
const connection = read('src/client/network/044-state-sync-and-connection.js');
const ghostBinding = bindings.slice(bindings.indexOf('  let ghostPotState'), bindings.indexOf('  function triggerWarBanner'));
const ghostReset = connection.slice(connection.indexOf('  function resetGhostPot()'), connection.indexOf('  const REPLACEMENT_SKILLS'));
const ghostJoin = connection.slice(connection.indexOf('      resetGhostPot();\n      joined.onStateChange'), connection.indexOf('      joined.onMessage("chat_message"'));
const sent = [];
const notices = [];
let now = 100;
const handlers = {};
const attributes = {};
const nodes = new Map();
function node() {
  return {hidden:true,dataset:{},children:[],textContent:"",
    append(child){this.children.push(child);},replaceChildren(...children){this.children=children;},
    querySelector(){return this.children.find(child=>child.type==="button" && !child.disabled);},
    setAttribute(name,value){this[name]=value;},focus(){document.activeElement=this;}};
}
const document = {createElement:node,activeElement:null,addEventListener:(event,listener)=>{handlers[event]=listener;}};
function get(id) {
  if (!nodes.has(id)) {
    const value=node();
    value.addEventListener=(event,listener)=>{handlers[id+":"+event]=listener;};
    nodes.set(id,value);
  }
  return nodes.get(id);
}
const button=get("ghostPotButton");
const captureLabel=get("ghostPotActionLabel");
const nativeSet=button.setAttribute;
button.setAttribute=(name,value)=>{attributes[name]=value;nativeSet.call(button,name,value);};
const drawerBody=node();
const click=()=>handlers["ghostPotButton:click"]();
const joined = {
  state:{ghostPotAvailable:false},
  send: (type, payload) => sent.push([type, JSON.stringify(payload)]),
  onMessage: (type, listener) => { handlers[type] = listener; },
  onStateChange: listener => { handlers.state = listener; },
};
const monster={alive:true,hp:1,mapId:"forbidden_forest",tier:"normal",level:5,x:3,y:0,z:0,displayName:"ผีป่า"};
const owner={alive:true,mapId:"forbidden_forest",x:0,y:0,z:0};
const context = vm.createContext({
  $: get, document, ui:{drawerBody}, drawerActive:null,
  hudSet(el,key,value,prop="textContent"){el[prop]=value;},
  openDrawer(name){context.drawerActive=name;},closeDrawer(){context.drawerActive=null;},
  setTimeout:()=>1,clearTimeout(){},
  mode: 'live', room: joined, joined, localId:"local", summonAvatars:new Map(), selectedForestTarget: null, targetedSkill:null,
  fieldTargetVisible:()=>true,
  activeMapId:"forbidden_forest", monsterForSpell:id=>id==="forest-ghost"?monster:null, ownServerCharacter:()=>owner,
  setTargetedSkill(skill){context.targetedSkill=skill;context.syncGhostPoolUi();},
  hudTarget: { until: 0 }, performance: { now: () => now },
  toast: notice => notices.push(notice), syncState() {},
});
vm.runInContext(ghostBinding + ghostReset + ghostJoin, context);
handlers.state({ ghostPotAvailable: false });
click();
assert.equal(button.hidden, true);
assert.equal(sent.length, 0);
assert.equal(get("ghostSummonButton").hidden,false);
handlers["ghostPoolButton:click"]();
assert.equal(context.drawerActive,"ghostPool");
assert.match(drawerBody.children[0].textContent,/ห้องนี้ยังไม่เปิด/);
context.closeDrawer();
joined.state.ghostPotAvailable=true;
handlers.state(joined.state);
handlers.state(joined.state);
assert.deepEqual(sent.shift(), ['ghost_pot', '{"action":"read"}']);
assert.equal(sent.length, 0);
handlers["ghostSummonButton:click"]();
assert.equal(context.drawerActive,"ghostPool");
assert.match(drawerBody.children[0].textContent,/รอข้อมูลทีมคู่หู/);
assert.equal(drawerBody.children[1].textContent,"โหลดทีมใหม่");
now+=2500;
context.requestGhostPotState();
assert.deepEqual(sent.shift(), ['ghost_pot', '{"action":"read"}']);
assert.equal(sent.length,0);
handlers.ghost_pot_state({active:false,combatId:null,pool:{collection:[],slots:[null,null,null],selectedSlot:0,revision:0}});
assert.equal(context.drawerActive,"ghostPool","arrival of the pool keeps the open drawer");
assert.equal(get("ghostSummonButton").hidden,false);
assert.ok(drawerBody.children[0].children.some(child=>child.textContent.includes("ยังไม่มีคู่หู")));
context.closeDrawer();
now+=5000;
context.requestGhostPotState();
assert.equal(sent.length,0,"read retries stop after the pool arrives");

handlers.ghost_pot_state({ active: false, ghost: null, combatRange: 24 });
assert.equal(button.hidden, true);
assert.equal(captureLabel.textContent, 'จับ');
click();
assert.equal(sent.length, 0);
context.selectedForestTarget = 'forest-ghost';
context.syncGhostCaptureTarget();
assert.equal(button.hidden, false);
assert.equal(attributes['aria-label'], 'จับ ผีป่า');
monster.x=9;
context.syncGhostCaptureTarget();
assert.equal(button.hidden,true);
click();
assert.equal(sent.length,0);
monster.x=3;
monster.tier="elite";
context.syncGhostCaptureTarget();
assert.equal(button.hidden,true);
monster.tier="normal";
context.syncGhostCaptureTarget();
click();
assert.deepEqual(sent.shift(), ['ghost_pot', '{"action":"capture","targetId":"forest-ghost"}']);
context.selectedForestTarget=null;

handlers.ghost_pot_state({ active: false, ghost: { name: 'ผีป่า' } });
assert.equal(attributes['aria-label'], 'เรียกผีป่า');
assert.equal(captureLabel.textContent, 'เรียก');
click();
assert.deepEqual(sent.shift(), ['ghost_pot', '{"action":"summon"}']);
handlers.ghost_pot_state({ active: true, ghost: { name: 'ผีป่า' } });
assert.equal(attributes['aria-pressed'], 'true');
assert.equal(attributes['aria-label'], 'เก็บผีกลับหม้อ');
assert.equal(captureLabel.textContent, 'เก็บ');
assert.equal(button.textContent, '', 'updating the action label leaves the image intact');
click();
assert.deepEqual(sent.shift(), ['ghost_pot', '{"action":"recall"}']);

context.room = null;
context.resetGhostPot();
assert.equal(get("ghostSummonButton").hidden,true);
handlers["ghostPoolButton:click"]();
assert.match(drawerBody.children[0].textContent,/เข้าโหมดออนไลน์/);
context.closeDrawer();
handlers.ghost_pot_state({ active: false, ghost: null });
click();
assert.equal(button.hidden, true);
assert.equal(attributes['aria-pressed'], 'false');
assert.equal(sent.length, 0);
context.room=joined;
const ghosts=Array.from({length:8},(_,i)=>({instanceId:"ghost-"+i,name:"ผี "+i,level:i+1}));
const pool={collection:ghosts,slots:[null,"ghost-1","ghost-2"],selectedSlot:1,revision:5};
handlers.ghost_pot_state({active:true,ghost:ghosts[1],activeInstanceId:"ghost-1",pool});
assert.equal(get("ghostCompanionAction").textContent,"คู่หู");
assert.equal(button.hidden,true);
handlers["ghostPoolButton:click"]();
assert.equal(context.drawerActive, "ghostPool");
function find(key, root=drawerBody) {
  if (root.dataset.ghostPoolKey===key) return root;
  return root.children.map(child=>find(key,child)).find(Boolean);
}
assert.equal(find("tab-carry").textContent,"ทีม 2/3");
assert.equal(find("slot-0").disabled,true);
assert.ok(find("ghost-ghost-1"));
assert.equal(find("ghost-ghost-0"),undefined);
assert.equal(find("ghost-ghost-7"),undefined);
find("tab-all").onclick();
assert.ok(find("ghost-ghost-7"));
find("ghost-ghost-7").onclick();
find("assign-0").onclick();
assert.deepEqual(sent.shift(),["ghost_pot",'{"action":"assign","slot":0,"instanceId":"ghost-7","revision":5}']);
assert.equal(find("assign-0").disabled,true);
const updated={...pool,slots:["ghost-7","ghost-1","ghost-2"],revision:6};
handlers.ghost_pot_state({active:true,ghost:ghosts[1],activeInstanceId:"ghost-1",pool:updated,status:"placed"});
find("slot-0").onclick();
assert.deepEqual(sent.shift(),["ghost_pot",'{"action":"select","slot":0,"revision":6}']);
handlers.ghost_pot_state({active:true,ghost:ghosts[1],activeInstanceId:"ghost-1",
  pool:{...updated,selectedSlot:0,revision:7},status:"selected"});
find("summon").onclick();
assert.deepEqual(sent.shift(),["ghost_pot",'{"action":"switch"}']);
assert.equal(get("ghostAttackButton").hidden,true,"legacy server has no combat control");
handlers.ghost_pot_state({active:true,ghost:ghosts[7],activeInstanceId:"ghost-7",combatId:"current",
  pool:{...updated,selectedSlot:0,revision:7},combatHealth:{hp:100,maxHp:100},status:"switched"});
assert.equal(get("ghostFieldStatus").hidden,false);
assert.equal(get("ghostFieldHp").textContent,"HP 100/100");
handlers.ghost_damaged({ownerId:"local",combatId:"previous",attackerId:"mob",hp:15,maxHp:100});
assert.equal(get("ghostFieldHp").textContent,"HP 100/100");
handlers.ghost_damaged({ownerId:"local",combatId:"current",attackerId:"mob",hp:83,maxHp:100});
assert.equal(get("ghostFieldHp").textContent,"HP 83/100");
assert.equal(get("ghostCompanionHealth").value,.83);
handlers["ghostAttackButton:click"]();
assert.equal(context.targetedSkill,"ghostAttack");
assert.equal(get("ghostAttackButton")["aria-pressed"],"true");
assert.match(get("ghostFieldDetail").textContent,/แตะเป้าหมาย/);
assert.match(get("ghostFieldOrderIcon").src,/target\.webp$/);
handlers.keydown({key:"Escape"});
assert.equal(get("ghostAttackButton")["aria-pressed"],"false");
handlers["ghostAttackButton:click"]();
context.orderGhostAttack("opponent");
assert.deepEqual(sent.shift(),["ghost_pot",'{"action":"attack","combatId":"current","targetId":"opponent"}']);
assert.match(get("ghostFieldDetail").textContent,/กำลังส่ง/);
const confirmed={combatId:"current",targetId:"opponent",targetName:"คู่ต่อสู้"};
handlers.ghost_combat_state({...confirmed,combatId:"previous",status:"ordered"});
assert.equal(get("ghostFollowButton").hidden,true);
handlers.ghost_combat_state({...confirmed,status:"ordered"});
assert.equal(get("ghostFollowButton").hidden,false);
assert.match(get("ghostFieldDetail").textContent,/คู่ต่อสู้/);
const openPool = drawerBody.children[0];
handlers.ghost_combat_state({...confirmed,status:"hit",damage:8,hp:12});
assert.match(get("ghostFieldDetail").textContent,/โดน 8/);
assert.ok(openPool);
assert.equal(drawerBody.children[0],openPool,"hit updates the HUD without rebuilding the open pool");
handlers["ghostFollowButton:click"]();
assert.deepEqual(sent.shift(),["ghost_pot",'{"action":"follow","combatId":"current"}']);
handlers.ghost_combat_state({...confirmed,status:"hit",damage:3,hp:9});
assert.match(get("ghostFieldDetail").textContent,/กำลังเรียก/);
handlers.ghost_combat_state({combatId:"current",status:"following"});
assert.equal(get("ghostFollowButton").hidden,true);
assert.match(get("ghostFieldDetail").textContent,/กลับมาตาม/);
assert.match(get("ghostFieldOrderIcon").src,/follow\.webp$/);
handlers.ghost_pot_state({active:true,ghost:ghosts[7],activeInstanceId:"ghost-7",combatId:"current",
  pool:{...updated,selectedSlot:0,revision:7},skills:[
    {skillId:"SK_NORMAL_01",remainingMs:0,usesLeft:28},
    {skillId:"SK_NORMAL_02",remainingMs:4000,usesLeft:15},
  ]});
handlers["ghostSkillButton:click"]();
const skillMenu = get("ghostSkillMenu");
assert.equal(skillMenu.hidden,false);
assert.equal(document.activeElement,skillMenu.children[0]);
assert.match(skillMenu.children[0].textContent,/พุ่งชน.*28/);
assert.match(skillMenu.children[1].textContent,/จู่โจมเร็ว.*4 วิ/);
assert.equal(skillMenu.children[1].disabled,true);
skillMenu.children[0].onclick();
assert.equal(skillMenu.hidden,true);
assert.match(get("ghostFieldDetail").textContent,/พุ่งชน.*แตะเป้าหมาย/);
context.orderGhostAttack("opponent");
assert.deepEqual(sent.shift(),["ghost_pot",'{"action":"skill","combatId":"current","targetId":"opponent","skillId":"SK_NORMAL_01"}']);
assert.match(get("ghostFieldDetail").textContent,/กำลังใช้วิชาผี/);
handlers.ghost_combat_state({...confirmed,status:"skill",skillId:"SK_NORMAL_01",hit:true,damage:11,hp:40,remainingMs:1800,usesLeft:27});
assert.match(get("ghostFieldDetail").textContent,/พุ่งชน.*คู่ต่อสู้.*11/);
handlers["ghostSkillButton:click"]();
assert.equal(skillMenu.children[0].disabled,true);
handlers.keydown({key:"Escape"});
assert.equal(skillMenu.hidden,true);
handlers.ghost_pot_state({active:false,pool:{...updated,selectedSlot:0,revision:7},
  fainted:["ghost-7"],combatId:null,status:"defeated"});
assert.equal(get("ghostAttackButton").hidden,true);
assert.match(find("ghost-ghost-7").children.at(-1).textContent,/ต้องพักฟื้น/);
assert.equal(notices.at(-1),"ผีพ่ายแพ้และกลับเข้าหม้อ");
const warPool={...updated,selectedSlot:0,revision:7};
handlers.ghost_pot_state({active:false,pool:warPool,captureAvailable:false,combatAvailable:true,combatId:null,status:"ready"});
assert.equal(get("ghostPotButton").hidden,true);
assert.equal(get("ghostSummonButton").hidden,false);
handlers.ghost_pot_state({active:false,pool:warPool,captureAvailable:false,combatAvailable:false,combatId:null,status:"war_ended"});
assert.equal(get("ghostSummonButton").hidden,false);
handlers["ghostSummonButton:click"]();
assert.ok(drawerBody.children[0].children.some(child=>child.textContent.includes("เรียกคู่หูในช่วงนี้ไม่ได้")));
assert.equal(notices.at(-1),"สงครามจบแล้ว ผีกลับเข้าหม้อ");

const quickPool={...updated,selectedSlot:0,revision:8};
handlers.ghost_pot_state({active:false,pool:quickPool,combatId:null,status:"ready"});
handlers["ghostSummonButton:click"]();
assert.deepEqual(sent.shift(),["ghost_pot",'{"action":"summon"}']);
const current={active:true,activeInstanceId:"ghost-7",combatId:"quick",pool:quickPool,combatHealth:{hp:40,maxHp:50}};
handlers.ghost_pot_state({...current,status:"summoned"});
handlers["ghostSummonButton:click"]();
const teamMenu=get("ghostTeamMenu");
assert.equal(teamMenu.hidden,false);
assert.equal(teamMenu.children[1].children[0].className,"ghost-recall-action");
assert.equal(teamMenu.children[0].children[0].disabled,true,"cannot switch to the active creature");
teamMenu.children[0].children[2].onclick();
assert.deepEqual(sent.shift(),["ghost_pot",'{"action":"select","slot":2,"revision":8}']);
assert.equal(sent.length,0,"switch waits for acknowledged selection");
handlers.ghost_pot_state({...current,status:"stale",pool:{...quickPool,revision:9}});
assert.equal(sent.length,0,"stale receipt never switches");
handlers["ghostSummonButton:click"]();
teamMenu.children[0].children[2].onclick();
assert.deepEqual(sent.shift(),["ghost_pot",'{"action":"select","slot":2,"revision":9}']);
handlers.ghost_pot_state({...current,status:"selected",pool:{...quickPool,selectedSlot:2,revision:10}});
assert.deepEqual(sent.shift(),["ghost_pot",'{"action":"switch"}']);
const switched={...current,activeInstanceId:"ghost-2",combatId:"switched",status:"switched",
  pool:{...quickPool,selectedSlot:2,revision:10},skills:[{skillId:"SK_NORMAL_01",remainingMs:0,usesLeft:3}]};
handlers.ghost_pot_state(switched);
context.selectedForestTarget="forest-ghost";
monster.x=20;
handlers["ghostAttackButton:click"]();
assert.equal(context.targetedSkill,"ghostAttack","older servers keep the 8m quick-target range");
assert.equal(sent.length,0);
handlers.keydown({key:"Escape"});
handlers.ghost_pot_state({...switched,combatRange:24});
handlers["ghostAttackButton:click"]();
assert.deepEqual(sent.shift(),["ghost_pot",'{"action":"attack","combatId":"switched","targetId":"forest-ghost"}']);
assert.equal(context.targetedSkill,null);
monster.x=3;
handlers.ghost_combat_state({combatId:"switched",targetId:"forest-ghost",targetName:"ผีป่า",status:"ordered"});
handlers["ghostSkillButton:click"]();
assert.deepEqual(sent.shift(),["ghost_pot",'{"action":"skill","combatId":"switched","targetId":"forest-ghost","skillId":"SK_NORMAL_01"}']);
handlers.ghost_combat_state({combatId:"switched",targetId:"forest-ghost",targetName:"ผีป่า",status:"skill",skillId:"SK_NORMAL_01",remainingMs:1800,usesLeft:2});
assert.equal(get("ghostSkillButton").disabled,true);
assert.equal(get("ghostSkillActionLabel").textContent,"2 วิ");

handlers.ghost_pot_state({active:false,pool:quickPool,combatId:null,status:"captured",capturedInstanceId:"ghost-5"});
assert.equal(get("ghostCatchReceipt").hidden,false);
handlers["ghostCatchReceipt:click"]();
assert.equal(find("tab-all")["aria-pressed"],"true");
assert.equal(find("ghost-ghost-5")["aria-pressed"],"true");
assert.equal(get("ghostCatchReceipt").hidden,true);
context.resetGhostPot();
joined.state.players = new Map([["local",{persistent:false}]]);
context.requestGhostPotState();
assert.equal(sent.length,0,"a temporary character cannot request the saved roster");
handlers["ghostPoolButton:click"]();
assert.match(drawerBody.children[0].textContent,/เลือกตัวละครที่บันทึกบนเซิร์ฟเวอร์/);
const healerId="ritual_village_ghostHealer";
const healerAction=get("serviceNpcAction");
healerAction.dataset.ghostHealer="true";
owner.persistent=false;
context.requestGhostTreatment(healerId);
assert.equal(sent.length,0);
assert.match(notices.at(-1),/เลือกตัวละครที่บันทึก/);
owner.persistent=true;
context.requestGhostTreatment(healerId);
assert.equal(healerAction.disabled,true);
assert.deepEqual(sent.shift(),["ghost_pot",'{"action":"heal","npcId":"ritual_village_ghostHealer"}']);
context.requestGhostTreatment(healerId);
assert.equal(sent.length,0,"one request while healing is pending");
handlers.ghost_pot_state({active:false,pool:quickPool,combatId:null,status:"healed",fainted:[]});
assert.equal(healerAction.disabled,false);
assert.equal(notices.at(-1),"หมอขวัญรักษาคู่หูทั้งหมดแล้ว");
context.requestGhostTreatment(healerId);
assert.deepEqual(sent.shift(),["ghost_pot",'{"action":"heal","npcId":"ritual_village_ghostHealer"}']);
handlers.ghost_pot_state({active:false,pool:quickPool,combatId:null,status:"heal_near_npc"});
assert.equal(healerAction.disabled,false);
assert.match(notices.at(-1),/เดินเข้าใกล้หมอขวัญ/);
console.log("PASS character menu team access, roster recovery, contextual capture, one-tap summon and attack, confirmed switch, cooldown, recall and team placement");
