const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const { test } = require('node:test');

function source(file, start, end) {
  const code = readFileSync('src/client/' + file, 'utf8');
  const from = code.indexOf(start), to = code.indexOf(end, from + 1);
  assert(from >= 0 && to > from);
  return code.slice(from, to);
}

test('NPC guide plays the latest Thai answer only and hides replay on failure', () => {
  const nodes = {}, sent = [], spoken = [], timers = new Map();
  let timerId = 0, stops = 0;
  const room = {
    send(type, request) { assert.equal(type, 'ask_npc_guide'); sent.push(request); },
    onMessage(_type, callback) { this.answer = callback; },
  };
  const scope = {
    room, joined: room, mode: 'live', drawerActive: null, npcGuidePending: null, npcGuideSeq: 0,
    window: { MontraAudio: { stopSpeech() { stops++; } } },
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    $: id => nodes[id],
    openDrawer(name, _title, html) {
      scope.drawerActive = name;
      for (const [,id] of html.matchAll(/id="([^"]+)"/g)) nodes[id] = {};
      nodes.npcGuideSpeakBtn.hidden = true;
    },
    bindSpeechButton(button, text) {
      button.montraSpeechStatus ??= { hidden: false };
      button.onclick = () => spoken.push(text);
    },
  };
  const open = runInNewContext(
    source('ui/057-npcs-and-objectives.js', '  function stripMarkdownForSpeech(', '  function openServiceNpc(') +
    source('network/044-state-sync-and-connection.js', '      joined.onMessage("npc_guide_result"', '      joined.onMessage("forest_defense_state"') +
    '\nopenNpcGuide', scope);
  open({ id: 'village_guide', name: 'ผู้แนะนำ' });
  const { npcGuideAnswer: output, npcGuideSpeakBtn: voice, npcGuideSend: send } = nodes;
  function ask() {
    nodes.npcGuideQuestion.value = 'แนะนำภารกิจ';
    send.onclick();
    return sent.at(-1).requestId;
  }
  const first = ask();
  room.answer({ requestId: first, answer: '- ไปคุยกับ **ผู้มอบงาน**\n• รับภารกิจ' });
  assert.equal(voice.hidden, false);
  voice.onclick();
  assert.equal(spoken.at(-1), 'ไปคุยกับ ผู้มอบงาน รับภารกิจ');

  const second = ask();
  assert.equal(stops, 1);
  assert.equal(voice.hidden, true);
  assert.equal(voice.onclick, null);
  assert.equal(voice.montraSpeechStatus.hidden, true);
  room.answer({ requestId: first, answer: 'คำตอบเดิม' });
  assert.equal(voice.hidden, true);
  room.answer({ requestId: second, error: 'near_npc' });
  assert.match(output.textContent, /เดินกลับ/);
  assert.equal(voice.hidden, true);
  assert.equal(send.disabled, false);

  room.answer({ requestId: ask(), answer: 'มีภารกิจล่า' });
  assert.equal(voice.montraSpeechStatus.hidden, false);
  voice.onclick();
  assert.equal(spoken.at(-1), 'มีภารกิจล่า');

  const timedOut = ask();
  [...timers.values()].at(-1)();
  assert.match(output.textContent, /ตอบไม่ทัน/);
  room.answer({ requestId: timedOut, answer: 'คำตอบที่มาช้า' });
  assert.equal(voice.hidden, true);
});

test('map NPC buttons recheck range and open the matching dialogue for nearby players', () => {
  const element = tag => ({ tag, children: [], append(...children) { this.children.push(...children); }, after() {} });
  const body = element('drawer body');
  const canvas = { parentElement: body, after() {}, getContext() {} };
  const calls = [], notices = [];
  const npc = { name: 'หมอขวัญคู่หู', role: 'ghostHealer', x: 7, z: 8, radius: 2 };
  const keeper = { name: 'ผู้มอบงาน', mapId: 'ritual_village', x: 8, z: 8, radius: 2 };
  let me = { x: 0, z: 0, flying: false };
  const scope = {
    worldDefinitions: { ritual_village: { name: 'หมู่บ้านอาคม', serviceNpcs: [npc] } },
    activeMapId: 'ritual_village', forestObjectiveState: { keeper }, territoryState: null, room: { state: {} },
    openDrawer() { body.children.length = 0; },
    drawMap() {}, document: { createElement: element }, updateResourceHud() {}, economyReady: () => false,
    ownServerCharacter: () => me, $: () => canvas, toast: message => notices.push(message),
    closeDrawer: () => calls.push('close'), pointMove: (x,z) => calls.push([x,z]),
    openServiceNpc: service => calls.push(service), openForestRanger: () => calls.push('quest'),
  };
  runInNewContext(source('ui/047-maps-and-strategy.js', '  let refreshMapNpcActions=', '  function openOnline(') + '\nopenMap();', scope);
  const list = body.children.find(node => node.tag === 'details');
  const [quest, healer] = list.children.filter(node => node.tag === 'button');
  assert.equal(healer.textContent, 'เดินไปหา หมอขวัญคู่หู');
  healer.onclick();
  assert.deepEqual(calls.splice(0), ['close', [7,8]]);
  me = { x: 7, z: 8, flying: false };
  list.open = true;
  list.ontoggle();
  assert.equal(healer.textContent, 'คุยกับ หมอขวัญคู่หู');
  healer.onclick();
  quest.onclick();
  assert.deepEqual(calls.splice(0), [npc, 'quest']);
  me.flying = true;
  healer.onclick();
  assert.match(notices.at(-1), /ลงจอด/);
  assert.equal(calls.length, 0);
  scope.activeMapId = 'forbidden_forest';
  me.flying = false;
  healer.onclick();
  assert.equal(calls.length, 0, 'stale map buttons cannot open the former NPC');
});

test('sends NPC feedback to sound and only the current screen-reader status', () => {
  const status = { textContent: '' }, field = {}, shade = {}, drawer = { hidden: false };
  const toast = { textContent: '' }, sounds = [];
  const game = { children: [field, shade, drawer] };
  const api = runInNewContext(
    source('ui/003-toast-and-mode.js', '  function toast(', '  function setModeBadge(') +
    source('ui/046-drawers-and-chat.js', '  function gateFieldInput(', '  function closeDrawer(') +
    '\n({toast, gateFieldInput})',
    { ui: { drawer, shade }, $: id => ({ game, drawerStatus: status, toast })[id],
      window: { MontraAudio: { notify: message => sounds.push(message) } } });
  const html = readFileSync('index.html','utf8');
  assert.match(html, /<section id="drawer"[\s\S]*?<div id="drawerStatus" class="sr-only"[^>]*role="status"/);
  assert.match(html, /<div id="toast" class="sr-only" role="status"/);
  api.gateFieldInput(true);
  api.toast('รักษาคู่หูแล้ว');
  assert.equal(field.inert, true);
  assert.equal(status.textContent, 'รักษาคู่หูแล้ว');
  assert.equal(toast.textContent, '');
  api.gateFieldInput(false);
  assert.equal(field.inert, false);
  drawer.hidden = true;
  api.toast('กลับสู่สนาม');
  assert.equal(toast.textContent, 'กลับสู่สนาม');
  assert.deepEqual(sounds, ['รักษาคู่หูแล้ว', 'กลับสู่สนาม']);
});
