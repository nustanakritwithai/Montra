const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

const read = path => readFileSync(path, 'utf8');
const html = read('index.html');
const bar = html.slice(html.indexOf('class="skill-bar learned-bar"'), html.indexOf('id="fishingPanel"'));
for (const id of ['fly', 'ghostPotButton', 'ghostSummonButton', 'ghostPoolButton']) {
  assert.equal(html.split(`id="${id}"`).length, 2, `${id} has exactly one button`);
  assert.match(bar, new RegExp(`<button id="${id}" class="orb-action[^"]*"[^>]* hidden>`));
}
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
    setAttribute(name,value){this[name]=value;},focus(){document.activeElement=this;}};
}
const document = {createElement:node,activeElement:null};
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
  mode: 'live', room: joined, joined, selectedForestTarget: null,
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
console.log("PASS legacy controls, compact pool, detail actions, command confirmation and switch");
