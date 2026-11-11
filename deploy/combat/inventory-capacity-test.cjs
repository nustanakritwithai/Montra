const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

const read = file => fs.readFileSync(file, 'utf8');
const network = read('src/client/network/044-state-sync-and-connection.js');
const constants = read('src/client/core/028-session-and-economy-state.js');
const equipment = read('src/client/ui/050-character-and-equipment.js');

function between(source, start, end) {
  const first = source.indexOf(start), last = source.indexOf(end, first + start.length);
  assert(first >= 0 && last > first, start);
  return source.slice(first, last);
}

test('existing bag grid opens 36 consecutive slot IDs on each of three pages', () => {
  const sizes = equipment.match(/^  const BAG_(?:PAGE_SIZE|TOTAL_PAGES) = \d+;$/gm);
  assert.equal(sizes.length, 2);
  const source = between(equipment, '  function bagMultiPageSliderHtml(', '  function setBagPage(');
  const html = vm.runInNewContext(sizes.join('\n') + source + '\nbagMultiPageSliderHtml()');
  const pages = [...html.matchAll(/data-page="(\d+)">([^]*?)<\/div>/g)];
  assert.equal(pages.length, 3);
  for (const [index, page] of pages.entries()) {
    assert.equal(Number(page[1]), index);
    const ids = [...page[2].matchAll(/id="bagSlot(\d+)"/g)].map(match => Number(match[1]));
    assert.deepEqual(ids, Array.from({length: 36}, (_, slot) => index * 36 + slot));
  }
});

test('client accepts both rollout sizes and equips a recognized weapon in the final slot', () => {
  let receive;
  const joined = {onMessage(name, handler) { assert.equal(name, 'inventory_state'); receive = handler; }};
  const ctx = {
    joined, room: joined, inventoryState: null, selectedBagSlot: 0, drawerActive: '',
    POTION_ITEM_ID: 'health_potion', SHRINE_SHARD: 'shrine_shard', personalItems: {},
    bagMeta: id => id === 'ritual_dagger' ? {kind: 'mainHand'} : null,
    wearPositions: () => [], observeLootInventory() {}, refreshOpenFieldQuest() {},
    renderBag() {}, renderEconomy() {},
  };
  const sizes = constants.match(/^  const (?:LEGACY_)?INVENTORY_SLOTS = \d+;$/gm);
  assert.equal(sizes.length, 2);
  const listener = between(network, 'joined.onMessage("inventory_state",', 'joined.onMessage("weapon_equipped",');
  vm.runInNewContext(sizes.join('\n') + listener, ctx);
  for (const capacity of [12, 108]) {
    const slots = Array(capacity).fill(null);
    slots[capacity - 1] = {itemId: 'ritual_dagger', quantity: 1, bound: true};
    receive({version: 1, slots, equippedWeaponSlot: capacity - 1});
    assert.equal(ctx.inventoryState.slots.length, capacity);
    assert.equal(ctx.inventoryState.equippedWeaponSlot, capacity - 1);
    assert.equal(ctx.inventoryState.slots[capacity - 1].bound, true);
  }
  const accepted = ctx.inventoryState;
  receive({version: 1, slots: Array(107).fill(null), equippedWeaponSlot: 0});
  assert.equal(ctx.inventoryState, accepted);
});
