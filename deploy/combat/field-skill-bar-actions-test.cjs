const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

const read = path => readFileSync(path, 'utf8');
const html = read('index.html');
const bar = html.slice(html.indexOf('class="skill-bar learned-bar"'), html.indexOf('id="fishingPanel"'));
for (const id of ['fly', 'ghostPotButton']) {
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
const button = {
  hidden: true,
  addEventListener: (event, listener) => { handlers[event] = listener; },
  setAttribute: (name, value) => { attributes[name] = value; },
};
const joined = {
  send: (type, payload) => sent.push([type, JSON.stringify(payload)]),
  onMessage: (type, listener) => { handlers[type] = listener; },
  onStateChange: listener => { handlers.state = listener; },
};
const context = vm.createContext({
  $: id => id === 'ghostPotButton' ? button : undefined,
  mode: 'live', room: joined, joined, selectedForestTarget: null,
  hudTarget: { until: 0 }, performance: { now: () => 100 },
  toast: notice => notices.push(notice), syncState() {},
});
vm.runInContext(ghostBinding + ghostReset + ghostJoin, context);
handlers.state({ ghostPotAvailable: false });
handlers.click();
assert.equal(button.hidden, true);
assert.equal(sent.length, 0);
handlers.state({ ghostPotAvailable: true });
handlers.state({ ghostPotAvailable: true });
assert.deepEqual(sent.shift(), ['ghost_pot', '{"action":"read"}']);
assert.equal(sent.length, 0);

handlers.ghost_pot_state({ active: false, ghost: null });
assert.equal(button.hidden, false);
assert.equal(attributes['aria-label'], 'จับผีใส่หม้อ');
handlers.click();
assert.equal(sent.length, 0);
assert.equal(notices.length, 1);
context.selectedForestTarget = 'forest-ghost';
handlers.click();
assert.deepEqual(sent.shift(), ['ghost_pot', '{"action":"capture","targetId":"forest-ghost"}']);

handlers.ghost_pot_state({ active: false, ghost: { name: 'ผีป่า' } });
assert.equal(attributes['aria-label'], 'เรียกผีป่า');
handlers.click();
assert.deepEqual(sent.shift(), ['ghost_pot', '{"action":"summon"}']);
handlers.ghost_pot_state({ active: true, ghost: { name: 'ผีป่า' } });
assert.equal(attributes['aria-pressed'], 'true');
assert.equal(attributes['aria-label'], 'เก็บผีกลับหม้อ');
handlers.click();
assert.deepEqual(sent.shift(), ['ghost_pot', '{"action":"recall"}']);

context.room = null;
context.resetGhostPot();
handlers.ghost_pot_state({ active: false, ghost: null });
handlers.click();
assert.equal(button.hidden, true);
assert.equal(attributes['aria-pressed'], 'true');
assert.equal(sent.length, 0);
console.log('PASS single bottom-bar controls and ghost-pot capture, summon and recall wiring');
