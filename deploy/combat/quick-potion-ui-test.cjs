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
      assert.equal((html.match(/class="chat-potion-slot"/g) || []).length, 1);
      assert.match(html, /aria-controls="chatPotionPicker"/);
      const use = new Element('button', 'chat-potion-use');
      const icon = new Element('span', 'chat-potion-icon');
      icon.append(new Element('span', 'bag-symbol'));
      use.append(icon, new Element('b', 'chat-potion-count'));
      const list = new Element('div', 'chat-potion-picker');
      list.hidden = true;
      this.append(use, new Element('button', 'chat-potion-swap'), list);
    }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
    setAttribute(key, value) { this.attributes[key] = value; }
    removeAttribute(key) { delete this.attributes[key]; }
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
  const sent = [];
  const context = {
    document, mode:'live', room:{}, player:{characterId:'character-1', persistent:true, alive:true},
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
  const use = control.el.querySelector('.chat-potion-use'), swap = control.el.querySelector('.chat-potion-swap');
  const list = control.el.querySelector('.chat-potion-picker'), count = use.querySelector('.chat-potion-count');
  const row = id => list.children.find(child => child.dataset.itemId === id);
  return {context, control, use, swap, list, count, row, sent, storage, document, listeners};
}

test('single slot aggregates matching stacks and switches from a vertical list without consuming', () => {
  const f = fixture();
  f.control.render();
  assert.equal(f.control.el.hidden, false);
  assert.equal(f.count.textContent, '×6');
  f.swap.onclick();
  assert.equal(f.swap.attributes['aria-expanded'], 'true');
  assert.deepEqual(f.list.children.map(row => row.dataset.itemId), [hp, mp]);
  assert.equal(f.row(hp).attributes['aria-pressed'], 'true');
  assert.equal(f.document.activeElement, f.row(hp));
  f.row(mp).onclick();
  assert.equal(f.list.hidden, true);
  assert.equal(f.document.activeElement, f.swap);
  assert.equal(f.count.textContent, '×5');
  assert.match(f.use.attributes['aria-label'], /ยามานา/);
  assert.deepEqual(f.sent, []);
});

test('use resolves the latest inventory slot and blocks a second press while the server is pending', () => {
  const f = fixture();
  f.swap.onclick();
  f.row(mp).onclick();
  f.context.slots = [stack(mp, 5), stack(hp, 2), null, stack('rice', 3)];
  f.use.onclick();
  f.use.onclick();
  assert.deepEqual(f.sent, [{command:'use_item', slot:0}]);
  assert.equal(f.count.textContent, '×5', 'count waits for the inventory update');
  assert.equal(f.use.disabled, true);
  f.context.slots = [stack(mp, 4), stack(hp, 2)];
  f.context.itemUsePending = false;
  f.control.render();
  assert.equal(f.count.textContent, '×4');
  assert.equal(f.use.disabled, false);
});

test('depleted selection stays at zero and is restored for the same character on rejoin', () => {
  const first = fixture();
  first.swap.onclick();
  first.row(mp).onclick();
  const f = fixture(first.storage);
  f.context.slots = [stack(hp, 2)];
  f.control.render();
  assert.match(f.use.attributes['aria-label'], /ยามานา/);
  assert.equal(f.count.textContent, '×0');
  f.use.onclick();
  assert.deepEqual(f.sent, []);
  f.swap.onclick();
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
  f.swap.onclick();
  assert.equal(f.list.hidden, false);
  assert.equal(f.list.children[0].textContent, 'ไม่มียาในกระเป๋า');
  let prevented = false;
  f.control.el.events.get('keydown')({key:'Escape', preventDefault:() => { prevented = true; }, stopPropagation() {}});
  assert.equal(prevented, true);
  assert.equal(f.document.activeElement, f.swap);
  f.swap.onclick();
  f.listeners.get('pointerdown')({target:{}});
  assert.equal(f.list.hidden, true);
  assert.equal(f.swap.attributes['aria-expanded'], 'false');
});

test('the slot is attached above the real chat feed and the picker opens upward', () => {
  assert.match(source, /harvestControls\.append\(potion\.el,\$\("harvestButton"\),\$\("fishButton"\)\); el\.prepend\(harvestControls\)/);
  assert.match(source, /function openChat\(\)\{\s+if\(!chatBox\)return;\s+chatBox\.potion\?\.close\(\)/);
  const css = readFileSync('src/styles/hud/019-vital-orb-resources-and-chat.css', 'utf8');
  assert.match(css, /\.chat-harvest\s*\{[^}]*bottom:calc\(100% \+ 5px\)/);
  assert.match(css, /\.chat-potion-picker\s*\{[^}]*bottom:calc\(100% \+ 4px\)/);
});
