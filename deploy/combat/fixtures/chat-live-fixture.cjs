'use strict';
// Isolated composition, not a substitute for the full game bootstrap.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
function section(file, first, last) {
  const source = read(file), start = source.indexOf(first), end = source.indexOf(last, start);
  assert(start >= 0 && end > start, `Missing source boundary: ${file}: ${first}`);
  assert.equal(source.indexOf(first, start + first.length), -1, 'Start boundary must be unique');
  return source.slice(start, end);
}
const network = 'src/client/network/044-state-sync-and-connection.js';
const controls = 'src/client/ui/046-drawers-and-chat.js';
const parts = {
  controller: read('src/client-modules/chat-controller.js'),
  commandBindings: section('src/client/render/004-scene-camera-lights.js', '  const chatController =', '  const scene ='),
  view: section('src/client/ui/042-vitals-chat-and-status.js', '  // ---- One chat box', '  // ---- Layout moves:'),
  drawer: read('src/client-modules/drawer-controller.js') + '\n' + section(controls, '  const drawerController =', '  const journalOrigins='),
  controls: section(controls, '  function finishChatPending(){return', '  drawerController.installBackdrop();'),
  message: section(network, '      joined.onMessage("chat_message"', '      const onTerritoryState='),
  report: section(network, '      joined.onMessage("chat_report_result"', '      const onGuildState='),
  rejection: section(network, '      joined.onMessage("command_rejected"', '      joined.onMessage("warp_complete"'),
};
const setup = `
const $=id=>document.getElementById(id);
const ui={drawer:$('drawer'),shade:$('shade'),drawerBody:$('drawerBody'),drawerTitle:$('drawerTitle')};
let drawerActive=null,fieldTrainingTip=null,mode='live';
const toasts=[],events=[];
function toast(message){toasts.push(message);}
function updateFieldAlerts(){} function SFX(){}
function ownServerCharacter(){return room.state.players.get(localId);}
function cancelForgeAnimation(){} function closeForgePicker(){}
function closeItemDetailModal(){$('itemDetailModal').hidden=true;}
function closeEquipPopup(){$('equipPopup').hidden=true;}
function handleForgePickerKey(){return false;} function handleItemDetailKey(){return false;}
$('accountEntry').hidden=true;$('loading').hidden=true;
const config=await (await fetch('/config')).json();
const client=new Colyseus.Client(config.endpoint);
const token='mt1_'+Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
const roomId=new URL(location.href).searchParams.get('room');
let joinTimer;
window.fixtureStage='joining';
const joined=await Promise.race([
 roomId?client.joinById(roomId,{guestToken:token}):client.create('my_room',{guestToken:token}),
 new Promise((_,reject)=>{joinTimer=setTimeout(()=>reject(new Error('Local SDK create/join timeout before initial state')),10000);}),
]).finally(()=>clearTimeout(joinTimer));
window.fixtureStage='waiting-for-initial-state';
let room=joined,localId=joined.sessionId;
joined.onMessage('*',(type,data)=>events.push({type,data}));
await new Promise((resolve,reject)=>{
 const deadline=Date.now()+8000;
 const poll=()=>{if(joined.state.players?.get(localId))return resolve();if(Date.now()>deadline)return reject(new Error('No initial player state'));setTimeout(poll,20);};poll();
});
let activeMapId=joined.state.players.get(localId).mapId;
`;
const expose = `
// SDK wildcard handlers are fallback-only. Observe handled packets through
// additional listeners; never replace/wrap send or the production listeners.
for(const type of ['chat_message','chat_report_result','command_rejected'])
  joined.onMessage(type,data=>events.push({type,data}));
window.fixtureStage='ready';
window.liveChat={roomId:joined.roomId,id:localId,events,toasts,
 count:()=>joined.state.players.size,
 // Only non-chat party setup uses this test control. Chat always uses DOM submit.
 invite:id=>joined.send('party_invite',{targetId:id}),
 accept:id=>joined.send('party_accept',{inviteId:id}),
 leave:()=>joined.leave(),
};
`;
const program = `(async()=>{\n${setup}\n${Object.values(parts).join('\n')}\ndrawerController.installBackdrop();\ndocument.addEventListener('keydown',drawerController.handleKey);\n${expose}\n})().catch(error=>{window.fixtureError=error.stack;throw error;});`;
new vm.Script(program);
const html = read('index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
assert(!/<script\b/i.test(html));
module.exports = { root, read, hash, parts, program, html, fingerprints: Object.fromEntries(Object.entries(parts).map(([key,value])=>[key,hash(value)])) };
