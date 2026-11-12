const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

const read = path => readFileSync(path, 'utf8');
const html = read('index.html');
const barStart = html.indexOf('class="skill-bar learned-bar"');
const bar = html.slice(barStart, html.indexOf('id="fishingPanel"'));
const ghostRow = html.slice(html.indexOf('id="ghostFieldActions"'), barStart);
assert.match(bar, /<button id="fly" class="orb-action[^"]*"[^>]* hidden>/);
for (const id of ['ghostPotButton', 'ghostSummonButton', 'ghostAttackButton', 'ghostFollowButton', 'ghostSkillButton', 'ghostPoolButton']) {
  assert.equal(html.split(`id="${id}"`).length, 2, `${id} has exactly one button`);
  assert.match(ghostRow, new RegExp(`<button id="${id}" class="orb-action[^"]*"[^>]* hidden>`));
  assert.doesNotMatch(bar, new RegExp(`id="${id}"`));
}
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
const ghostJoin = connection.slice(connection.indexOf('      let ghostPotRequested'), connection.indexOf('      joined.onMessage("chat_message"'));
const sent = [];
const notices = [];
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
const nativeSet=button.setAttribute;
button.setAttribute=(name,value)=>{attributes[name]=value;nativeSet.call(button,name,value);};
const drawerBody=node();
const click=()=>handlers["ghostPotButton:click"]();
const joined = {
  send: (type, payload) => sent.push([type, JSON.stringify(payload)]),
  onMessage: (type, listener) => { handlers[type] = listener; },
  onStateChange: listener => { handlers.state = listener; },
};
const context = vm.createContext({
  $: get, document, ui:{drawerBody}, drawerActive:null,
  openDrawer(name){context.drawerActive=name;},closeDrawer(){context.drawerActive=null;},
  setTimeout:()=>1,clearTimeout(){},
  mode: 'live', room: joined, joined, localId:"local", summonAvatars:new Map(), selectedForestTarget: null, targetedSkill:null,
  setTargetedSkill(skill){context.targetedSkill=skill;context.syncGhostPoolUi();},
  hudTarget: { until: 0 }, performance: { now: () => 100 },
  toast: notice => notices.push(notice), syncState() {},
});
vm.runInContext(ghostBinding + ghostReset + ghostJoin, context);
handlers.state({ ghostPotAvailable: false });
click();
assert.equal(button.hidden, true);
assert.equal(sent.length, 0);
handlers.state({ ghostPotAvailable: true });
handlers.state({ ghostPotAvailable: true });
assert.deepEqual(sent.shift(), ['ghost_pot', '{"action":"read"}']);
assert.equal(sent.length, 0);

handlers.ghost_pot_state({ active: false, ghost: null });
assert.equal(button.hidden, false);
assert.equal(attributes['aria-label'], 'จับผีใส่หม้อ');
click();
assert.equal(sent.length, 0);
assert.equal(notices.length, 1);
context.selectedForestTarget = 'forest-ghost';
click();
assert.deepEqual(sent.shift(), ['ghost_pot', '{"action":"capture","targetId":"forest-ghost"}']);

handlers.ghost_pot_state({ active: false, ghost: { name: 'ผีป่า' } });
assert.equal(attributes['aria-label'], 'เรียกผีป่า');
click();
assert.deepEqual(sent.shift(), ['ghost_pot', '{"action":"summon"}']);
handlers.ghost_pot_state({ active: true, ghost: { name: 'ผีป่า' } });
assert.equal(attributes['aria-pressed'], 'true');
assert.equal(attributes['aria-label'], 'เก็บผีกลับหม้อ');
click();
assert.deepEqual(sent.shift(), ['ghost_pot', '{"action":"recall"}']);

context.room = null;
context.resetGhostPot();
handlers.ghost_pot_state({ active: false, ghost: null });
click();
assert.equal(button.hidden, true);
assert.equal(attributes['aria-pressed'], 'false');
assert.equal(sent.length, 0);
context.room=joined;
const ghosts=Array.from({length:8},(_,i)=>({instanceId:"ghost-"+i,name:"ผี "+i,level:i+1}));
const pool={collection:ghosts,slots:[null,"ghost-1","ghost-2"],selectedSlot:1,revision:5};
handlers.ghost_pot_state({active:true,ghost:ghosts[1],activeInstanceId:"ghost-1",pool});
assert.equal(get("ghostPoolButton").hidden,false);
assert.equal(get("ghostSummonButton").textContent,"เก็บ");
assert.equal(button.disabled,true);
handlers["ghostPoolButton:click"]();
function find(key, root=drawerBody) {
  if (root.dataset.ghostPoolKey===key) return root;
  return root.children.map(child=>find(key,child)).find(Boolean);
}
assert.equal(find("tab-carry").textContent,"พูลพก 6/6");
assert.equal(find("slot-0").disabled,true);
assert.ok(find("ghost-ghost-0"));
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
assert.equal(get("ghostSummonButton").textContent,"สลับ");
handlers["ghostSummonButton:click"]();
assert.deepEqual(sent.shift(),["ghost_pot",'{"action":"switch"}']);
assert.equal(get("ghostAttackButton").hidden,true,"legacy server has no combat control");
handlers.ghost_pot_state({active:true,ghost:ghosts[7],activeInstanceId:"ghost-7",combatId:"current",
  pool:{...updated,selectedSlot:0,revision:7},combatHealth:{hp:100,maxHp:100},status:"switched"});
assert.match(get("ghostFieldStatus").textContent,/HP 100\/100/);
handlers.ghost_damaged({ownerId:"local",combatId:"previous",attackerId:"mob",hp:15,maxHp:100});
assert.match(get("ghostFieldStatus").textContent,/HP 100\/100/);
handlers.ghost_damaged({ownerId:"local",combatId:"current",attackerId:"mob",hp:83,maxHp:100});
assert.match(get("ghostFieldStatus").textContent,/HP 83\/100/);
handlers["ghostAttackButton:click"]();
assert.equal(context.targetedSkill,"ghostAttack");
assert.equal(get("ghostAttackButton")["aria-pressed"],"true");
assert.match(get("ghostFieldStatus").textContent,/แตะเป้าหมาย/);
handlers.keydown({key:"Escape"});
assert.equal(get("ghostAttackButton")["aria-pressed"],"false");
handlers["ghostAttackButton:click"]();
context.orderGhostAttack("opponent");
assert.deepEqual(sent.shift(),["ghost_pot",'{"action":"attack","combatId":"current","targetId":"opponent"}']);
assert.match(get("ghostFieldStatus").textContent,/กำลังส่ง/);
const confirmed={combatId:"current",targetId:"opponent",targetName:"คู่ต่อสู้"};
handlers.ghost_combat_state({...confirmed,combatId:"previous",status:"ordered"});
assert.equal(get("ghostFollowButton").hidden,true);
handlers.ghost_combat_state({...confirmed,status:"ordered"});
assert.equal(get("ghostFollowButton").hidden,false);
assert.match(get("ghostFieldStatus").textContent,/คู่ต่อสู้/);
const openPool = drawerBody.children[0];
handlers.ghost_combat_state({...confirmed,status:"hit",damage:8,hp:12});
assert.match(get("ghostFieldStatus").textContent,/โดน 8/);
assert.ok(openPool);
assert.equal(drawerBody.children[0],openPool,"hit updates the HUD without rebuilding the open pool");
handlers["ghostFollowButton:click"]();
assert.deepEqual(sent.shift(),["ghost_pot",'{"action":"follow","combatId":"current"}']);
handlers.ghost_combat_state({...confirmed,status:"hit",damage:3,hp:9});
assert.match(get("ghostFieldStatus").textContent,/กำลังเรียก/);
handlers.ghost_combat_state({combatId:"current",status:"following"});
assert.equal(get("ghostFollowButton").hidden,true);
assert.match(get("ghostFieldStatus").textContent,/กลับมาตาม/);
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
assert.match(get("ghostFieldStatus").textContent,/พุ่งชน.*แตะเป้าหมาย/);
context.orderGhostAttack("opponent");
assert.deepEqual(sent.shift(),["ghost_pot",'{"action":"skill","combatId":"current","targetId":"opponent","skillId":"SK_NORMAL_01"}']);
assert.match(get("ghostFieldStatus").textContent,/กำลังใช้วิชาผี/);
handlers.ghost_combat_state({...confirmed,status:"skill",skillId:"SK_NORMAL_01",hit:true,damage:11,hp:40,remainingMs:1800,usesLeft:27});
assert.match(get("ghostFieldStatus").textContent,/พุ่งชน.*คู่ต่อสู้.*11/);
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
assert.equal(get("ghostSummonButton").hidden,true);
assert.equal(get("ghostPoolButton").hidden,false);
assert.equal(notices.at(-1),"สงครามจบแล้ว ผีกลับเข้าหม้อ");
console.log("PASS legacy controls, ghost pool, summon/switch, aim, confirmed hits, follow and legacy skills");
