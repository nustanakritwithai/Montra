import assert from "node:assert/strict";
import { test } from "node:test";
import {
  INVENTORY_SLOT_COUNT, INVENTORY_STACK_LIMIT, POTION_HEAL,
  POTION_ID, STARTER_POTION_COUNT, makeStarterInventory,
  validateInventory, parseUseItemCommand, useInventoryItem,
} from "./ItemRules.js";

test("Inventory: exactly 12 slots, seeded with 3 health potions", () => {
  const stock = makeStarterInventory();
  assert.equal(INVENTORY_SLOT_COUNT, 12);
  assert.equal(stock.version, 1);
  assert.equal(stock.slots.length, 12);
  assert.deepEqual(stock.slots[0], {
    itemId: POTION_ID, quantity: STARTER_POTION_COUNT,
  });
  assert.ok(stock.slots.slice(1).every(slot => slot === null));
  assert.deepEqual(validateInventory(stock), stock);
  assert.notEqual(makeStarterInventory(), stock);
});

test("Inventory: rejects counterfeits, unknown items, corrupt quantities and bad structures", () => {
  const starter=makeStarterInventory();
  const forged = [
    null, {}, [], {version:1,slots:[]},
    {version:2,slots:starter.slots},
    {version:1,slots:[...starter.slots].slice(1)},
    {version:1,slots:starter.slots, hp:999},
    {version:1,slots:[{itemId:"gold",quantity:10},...starter.slots.slice(1)]},
    {version:1,slots:[{itemId:POTION_ID,quantity:0},...starter.slots.slice(1)]},
    {version:1,slots:[{itemId:POTION_ID,quantity:INVENTORY_STACK_LIMIT+1},...starter.slots.slice(1)]},
    {version:1,slots:[{itemId:POTION_ID,quantity:1.5},...starter.slots.slice(1)]},
    {version:1,slots:[{itemId:POTION_ID,quantity:"7"},...starter.slots.slice(1)]},
    {version:1,slots:[{itemId:POTION_ID,quantity:3,heal:500},...starter.slots.slice(1)]},
  ];
  for (const payload of forged) {
    assert.throws(()=>validateInventory(payload),/inventory_record_invalid/);
  }
  const source=makeStarterInventory();
  const checked=validateInventory(source);
  checked.slots[0].quantity=1;
  assert.equal(source.slots[0].quantity,STARTER_POTION_COUNT,"validation must clone input");
});

test("Inventory: only exact server-assigned slot index is accepted", () => {
  assert.equal(parseUseItemCommand({slot:0}),0);
  assert.equal(parseUseItemCommand({slot:11}),11);
  for (const payload of [
    null, {}, [], "0", {slot:12}, {slot:-1}, {slot:0.5},
    {slot:"0"}, {slot:null}, {slot:NaN}, {slot:0,quantity:9999},
    {slot:0,itemId:POTION_ID}, {slot:0,heal:999},
  ]) assert.equal(parseUseItemCommand(payload),null);
});

test("Inventory: health potion restores at most 30 HP and consumes exactly one", () => {
  const original=makeStarterInventory();
  const used=useInventoryItem(original,0,51,100,true);
  assert.equal(used.ok,true);
  if (!used.ok) return;
  assert.equal(POTION_HEAL,30);
  assert.equal(used.healed,30);
  assert.equal(used.hp,81);
  assert.equal(used.itemId,POTION_ID);
  assert.equal(used.inventory.slots[0].quantity,2);
  assert.equal(original.slots[0].quantity,3,"usage may not mutate saved input");
  const last=useInventoryItem(used.inventory,0,95,100,true);
  assert.equal(last.ok,true);
  if (!last.ok) return;
  assert.equal(last.hp,100);
  assert.equal(last.healed,5);
  assert.equal(last.inventory.slots[0].quantity,1);
  const gone=useInventoryItem(last.inventory,0,42,100,true);
  assert.equal(gone.ok,true);
  if (!gone.ok) return;
  assert.equal(gone.inventory.slots[0],null);
  assert.deepEqual(useInventoryItem(gone.inventory,0,60,100,true),
    {ok:false,reason:"item_unavailable"});
});

test("Inventory: cannot waste potion at full HP or resurrect a dead character", () => {
  const original=makeStarterInventory();
  assert.deepEqual(useInventoryItem(original,0,100,100,true),
    {ok:false,reason:"hp_full"});
  assert.deepEqual(useInventoryItem(original,0,0,100,false),
    {ok:false,reason:"not_alive"});
  assert.deepEqual(useInventoryItem(original,11,55,100,true),
    {ok:false,reason:"item_unavailable"});
  assert.equal(original.slots[0].quantity,3);
});
