const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');

const source = readFileSync('main.js', 'utf8');
const start = source.indexOf('  function createQuickPotionControl()');
const end = source.indexOf('  const chatBox = ', start);
assert.ok(start >= 0 && end > start);
const controlSource = source.slice(start, end);
const hp = 'health_potion';
const mp = 'mana_brew';
const stack = (itemId, quantity) => ({itemId, quantity});

function fixture(storage = new Map()) {
  const listeners = new Map();
  const document = {activeElement:null, addEventListener:(type, listener) => listeners.set(type, listener)};
  class Element {
    constructor(tag, className = '') {
      this.tag = tag;
      this.className = className;
      this.children = [];
      this.attributes = {};
      this.dataset = {};
      this.events = new Map();
    }
    set innerHTML(html) {
      assert.equal((html.match(/<button\b/g) || []).length, 1);
      assert.match(html, /class="chat-potion-use"[^>]+aria-controls="chatPotionPicker"/);
      const use = new Element('button', 'chat-potion-use');
      const icon = new Element('span', 'chat-potion-icon');
      icon.append(new Element('span', 'bag-symbol'));
      use.append(icon, new Element('b', 'chat-potion-count'));
      const list = new Element('div', 'chat-potion-picker');
      list.hidden = true;
      this.append(use, list);
    }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
    setAttribute(key, value) { this.attributes[key] = value; }
    removeAttribute(key) { delete this.attributes[key]; }
    toggleAttribute(key, enabled) { if (enabled) this.setAttribute(key, ''); else this.removeAttribute(key); }
    addEventListener(type, listener) { this.events.set(type, listener); }
    contains(node) { return this === node || this.children.some(child => child.contains(node)); }
    focus() { document.activeElement = this; }
    querySelector(selector) {
      for (const child of this.children) {
        if (selector === child.tag || selector === '.' + child.className ||
            (selector === '[aria-pressed="true"]' && child.attributes['aria-pressed'] === 'true')) return child;
        const nested = child.querySelector(selector);
        if (nested) return nested;
      }
      return null;
    }
  }
  document.createElement = tag => new Element(tag);
  const items = {
    [mp]: {name:'ยามานา', kind:'consumable', healMana:18},
    rice: {name:'ข้าว', kind:'consumable', healHp:20, nutrition:{food:15}},
    weapon: {name:'ดาบ', kind:'mainHand'}
  };
  const sent = [], timers = new Map();
  let now = 0, nextTimer = 0;
  const context = {
    document, mode:'live', room:{}, player:{characterId:'character-1', persistent:true, alive:true},
    setTimeout: (callback, delay) => { timers.set(++nextTimer, {callback, at: now + delay}); return nextTimer; },
    clearTimeout: id => timers.delete(id),
    slots:[stack(hp, 2), stack('rice', 3), stack(hp, 4), stack(mp, 5), stack('weapon', 1)],
    itemUsePending:false, economyPending:false, catalogRevision:1, POTION_ITEM_ID:hp,
    localStorage:{getItem:key => storage.get(key), setItem:(key, value) => storage.set(key, value)},
    ownServerCharacter:() => context.player,
    currentBagSlots:() => context.slots,
    bagMeta:id => items[id], getItemArtKey:id => id ? 'art_' + id : '',
    itemSymbol:() => '🧪',
    sendBagCommand:(command, {slot}) => { sent.push({command, slot}); context.itemUsePending = true; }
  };
  vm.createContext(context);
  const control = vm.runInContext(controlSource + '\ncreateQuickPotionControl()', context);
  const use = control.el.querySelector('.chat-potion-use');
  const list = control.el.querySelector('.chat-potion-picker'), count = use.querySelector('.chat-potion-count');
  const row = id => list.children.find(child => child.dataset.itemId === id);
  function advance(ms) {
    now += ms;
    for (const [id, timer] of timers) {
      if (timer.at > now) continue;
      timers.delete(id);
      timer.callback();
    }
  }
  const pointer = (type, overrides) => use.events.get(type)({
    pointerId:1, button:0, isPrimary:true, pointerType:'touch', clientX:40, clientY:40, ...overrides,
  });
  const click = () => use.onclick({detail:1, pointerType:'touch'});
  const tap = () => { pointer('pointerdown'); pointer('pointerup'); click(); };
  const hold = () => { pointer('pointerdown'); advance(450); pointer('pointerup'); click(); };
  const openWithKeyboard = () => use.events.get('keydown')({key:'ArrowUp', preventDefault() {}, stopPropagation() {}});
  return {context, control, use, list, count, row, sent, storage, document, listeners, advance, pointer, click, tap, hold, openWithKeyboard};
}

test('holding the only slot opens the list and releasing or selecting a row consumes nothing', () => {
  const f = fixture();
  f.control.render();
  assert.equal(f.control.el.hidden, false);
  assert.equal(f.count.textContent, '×6');
  f.pointer('pointerdown');
  f.advance(449);
  assert.equal(f.list.hidden, true);
  f.advance(1);
  f.pointer('pointerup');
  f.click();
  assert.equal(f.use.attributes['aria-expanded'], 'true');
  assert.deepEqual(f.list.children.map(row => row.dataset.itemId), [hp, mp]);
  assert.equal(f.row(hp).attributes['aria-pressed'], 'true');
  f.row(mp).onclick();
  assert.equal(f.list.hidden, true);
  assert.equal(f.document.activeElement, f.use);
  assert.equal(f.count.textContent, '×5');
  assert.match(f.use.attributes['aria-label'], /ยามานา/);
  assert.deepEqual(f.sent, []);
});

test('use resolves the latest inventory slot and blocks a second press while the server is pending', () => {
  const f = fixture();
  f.hold();
  f.row(mp).onclick();
  f.context.slots = [stack(mp, 5), stack(hp, 2), null, stack('rice', 3)];
  f.tap();
  f.tap();
  assert.deepEqual(f.sent, [{command:'use_item', slot:0}]);
  assert.equal(f.count.textContent, '×5', 'count waits for the inventory update');
  assert.ok('data-unavailable' in f.use.attributes);
  f.context.slots = [stack(mp, 4), stack(hp, 2)];
  f.context.itemUsePending = false;
  f.control.render();
  assert.equal(f.count.textContent, '×4');
  assert.ok(!('data-unavailable' in f.use.attributes));
});

test('depleted selection stays at zero and is restored for the same character on rejoin', () => {
  const first = fixture();
  first.hold();
  first.row(mp).onclick();
  const f = fixture(first.storage);
  f.context.slots = [stack(hp, 2)];
  f.control.render();
  assert.match(f.use.attributes['aria-label'], /ยามานา/);
  assert.equal(f.count.textContent, '×0');
  f.tap();
  assert.deepEqual(f.sent, []);
  f.hold();
  assert.deepEqual(f.list.children.map(row => row.dataset.itemId), [hp]);
  f.context.player = {characterId:'character-2', persistent:true, alive:true};
  f.control.render();
  assert.equal(f.list.hidden, true);
  assert.equal(f.count.textContent, '×2');
  f.context.mode = 'demo';
  f.control.render();
  assert.equal(f.control.el.hidden, true);
});

test('keyboard and outside taps dismiss the picker, and empty bags have usable feedback', () => {
  const f = fixture();
  f.context.slots = [];
  f.hold();
  assert.equal(f.list.hidden, false);
  assert.equal(f.list.children[0].textContent, 'ไม่มียาในกระเป๋า');
  let prevented = false;
  f.control.el.events.get('keydown')({key:'Escape', preventDefault:() => { prevented = true; }, stopPropagation() {}});
  assert.equal(prevented, true);
  assert.equal(f.document.activeElement, f.use);
  f.openWithKeyboard();
  f.listeners.get('pointerdown')({target:{}});
  assert.equal(f.list.hidden, true);
  assert.equal(f.use.attributes['aria-expanded'], 'false');
});

test('keyboard opens and focuses a choice, and tapping an open slot dismisses without using it', () => {
  const f = fixture();
  f.openWithKeyboard();
  assert.equal(f.document.activeElement, f.row(hp));
  f.tap();
  assert.equal(f.list.hidden, true);
  assert.deepEqual(f.sent, []);
  f.use.onclick({detail:0});
  assert.deepEqual(f.sent, [{command:'use_item', slot:0}]);
});

test('cancelled, dragged and stale presses do not open the picker or consume a potion', () => {
  const f = fixture();
  f.pointer('pointerdown');
  f.pointer('pointercancel');
  f.advance(450);
  assert.equal(f.list.hidden, true);
  f.pointer('pointerdown');
  f.pointer('pointermove', {clientX:60});
  f.advance(450);
  f.pointer('pointerup');
  f.click();
  assert.equal(f.list.hidden, true);
  f.pointer('pointerdown');
  f.context.player = {...f.context.player, characterId:'character-2'};
  f.advance(450);
  f.pointer('pointerup');
  f.click();
  assert.equal(f.list.hidden, true);
  f.pointer('pointerdown');
  f.context.player = {...f.context.player, characterId:'character-3'};
  f.pointer('pointerup');
  f.click();
  assert.deepEqual(f.sent, []);
  f.tap();
  assert.deepEqual(f.sent, [{command:'use_item', slot:0}]);
});

test('the slot is attached above the real chat feed and the picker opens upward', () => {
  assert.match(source, /harvestControls\.append\(potion\.el,\$\("harvestButton"\),\$\("fishButton"\)\); el\.prepend\(harvestControls\)/);
  assert.match(source, /function openChat\(\)\{\s+if\(!chatBox\)return;\s+chatBox\.potion\?\.close\(\)/);
  const css = readFileSync('src/styles/hud/019-vital-orb-resources-and-chat.css', 'utf8');
  assert.match(css, /\.chat-harvest\s*\{[^}]*bottom:calc\(100% \+ 5px\)/);
  assert.match(css, /\.chat-potion-picker\s*\{[^}]*bottom:calc\(100% \+ 4px\)[^}]*width:min\(148px, 75vw\)[^}]*overflow-y:auto/);
});

test('the nearby gathering button swaps tool artwork and keeps the action details accessible', () => {
  const gathering=readFileSync('src/client/world/029-fishing-and-resources.js','utf8');
  const start=gathering.indexOf('  const resourceHudActions='),end=gathering.indexOf('  const rarityNames=',start);
  assert(start>=0 && end>start);
  const button={setAttribute(key,value){this[key]=value;}};
  const icon={...button,getAttribute(key){return this[key];}};
  const context=vm.createContext({
    $:id=>id==='harvestButton'?button:id==='harvestIcon'?icon:null,
    resourceViewMap:'fixture',activeMapId:'fixture',resources:{received:0},resourceChoice:null,
    nearbyResources:()=>context.near,syncResourcePickers(){},worldDefinitions:{},
    harvestFocus:{setEnabled(){},position:{set(){}},scaling:{set(){}}},
    personalItems:{mat_raw_stone_2:{level:10}},economyPending:false,resourceReadyAt:0,performance:{now:()=>1000},
  });
  vm.runInContext(gathering.slice(start,end),context);
  for(const [kind,art,label] of [['wood','tool_axe','ตัดไม้'],['stone','tool_pick','ขุดหิน'],['herb','mat_herb','เก็บสมุนไพร']]){
    context.near=[{kind,tier:2,x:0,z:0,radius:1,stock:1,capacity:1,readyAt:6000}];
    context.updateResourceHud({level:12});
    assert.equal(button.hidden,false);
    assert.equal(button.disabled,false);
    assert.equal(icon.src,'./assets/items/'+art+'.webp');
    assert.equal(button['aria-label'],label+' · ชั้น 2 · 1/1');
  }
  context.near[0].stock=0;
  context.updateResourceHud({level:12});
  assert.equal(button.disabled,true);
  assert.match(button.title,/ฟื้นใน 5 วิ/);
  context.near[0].kind='stone';
  context.updateResourceHud({level:1});
  assert.match(button['aria-label'],/ต้องการ Lv\.10/);
  context.near=[];
  context.updateResourceHud({level:12});
  assert.equal(button.hidden,true);
  assert.match(readFileSync('index.html','utf8'),/<img id="harvestIcon" width="24" height="24" alt=""/);
});
