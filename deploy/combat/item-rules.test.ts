import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAuctionCreate, parseForge, parseMarketCreate, parseSellMaterial, parseTradeOffer } from "./EconomyRules.js";
import { parseCityOrder } from "./CityProductionRules.js";
import {
  INVENTORY_SLOT_COUNT, INVENTORY_STACK_LIMIT, POTION_HEAL,
  POTION_ID, STARTER_POTION_COUNT, makeStarterInventory,
  validateInventory, parseUseItemCommand, useInventoryItem,
  RITUAL_DAGGER_ID, ARCANE_SWORD_ID, SPIRIT_STAFF_ID,
  grantStarterWeapons, parseEquipWeaponCommand, equipInventoryWeapon,
  equippedWeaponId, weaponBonuses,
} from "./ItemRules.js";

test("Inventory: 108 slots, 3 potions and permanent starter weapon kit", () => {
  const stock = makeStarterInventory();
  assert.equal(INVENTORY_SLOT_COUNT, 108);
  assert.equal(stock.version, 1);
  assert.equal(stock.slots.length, INVENTORY_SLOT_COUNT);
  assert.deepEqual(stock.slots[0], {
    itemId: POTION_ID, quantity: STARTER_POTION_COUNT,
  });
  assert.deepEqual(stock.slots.slice(1,4).map(item => item?.itemId),
    [RITUAL_DAGGER_ID,ARCANE_SWORD_ID,SPIRIT_STAFF_ID]);
  assert.ok(stock.slots.slice(4).every(slot => slot === null));
  assert.equal(stock.equippedWeaponSlot,1);
  assert.deepEqual(validateInventory(stock), stock);
  assert.notEqual(makeStarterInventory(), stock);
});

test("Inventory: legacy slots retain their items and the expanded last slot accepts commands", () => {
  const stock = makeStarterInventory();
  const legacy = {...stock, slots: stock.slots.slice(0, 12)};
  legacy.slots[11] = {itemId: POTION_ID, quantity: 2};
  const expanded = validateInventory(legacy);
  assert.deepEqual(expanded.slots.slice(0, 12), legacy.slots);
  assert.equal(expanded.equippedWeaponSlot, legacy.equippedWeaponSlot);
  assert.equal(expanded.slots.length, 108);
  assert.ok(expanded.slots.slice(12).every(slot => slot === null));
  assert.equal(legacy.slots.length, 12);

  expanded.slots[106] = expanded.slots[1];
  expanded.slots[1] = null;
  expanded.equippedWeaponSlot = null;
  expanded.slots[107] = {itemId: POTION_ID, quantity: 2};
  assert.deepEqual(parseEquipWeaponCommand({slot: 106}), {slot: 106});
  const equipped = equipInventoryWeapon(expanded, 106);
  assert.equal(equipped.ok, true);
  if (!equipped.ok) return;
  assert.equal(equipped.inventory.equippedWeaponSlot, 106);
  const used = useInventoryItem(equipped.inventory, 107, 50, 100, true);
  assert.equal(used.ok, true);
  if (used.ok) assert.equal(used.inventory.slots[107]?.quantity, 1);
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
  checked.slots[0]!.quantity=1;
  assert.equal(source.slots[0]!.quantity,STARTER_POTION_COUNT,"validation must clone input");
});

test("Inventory: only exact server-assigned slot index is accepted", () => {
  assert.equal(parseUseItemCommand({slot:0}),0);
  assert.equal(parseUseItemCommand({slot:11}),11);
  assert.equal(parseUseItemCommand({slot:107}),107);
  for (const payload of [
    null, {}, [], "0", {slot:108}, {slot:-1}, {slot:0.5},
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
  assert.equal(used.inventory.slots[0]!.quantity,2);
  assert.equal(original.slots[0]!.quantity,3,"usage may not mutate saved input");
  const last=useInventoryItem(used.inventory,0,95,100,true);
  assert.equal(last.ok,true);
  if (!last.ok) return;
  assert.equal(last.hp,100);
  assert.equal(last.healed,5);
  assert.equal(last.inventory.slots[0]!.quantity,1);
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
  assert.equal(original.slots[0]!.quantity,3);
});

test("Weapon loadout: V0.2.6 potion bag migrates exactly once without free potions", () => {
  const slots=Array.from({length:INVENTORY_SLOT_COUNT},()=>null) as
    Array<{itemId:typeof POTION_ID;quantity:number}|null>;
  slots[0]={itemId:POTION_ID,quantity:2};
  const legacy={version:1 as const,slots};
  const migrated=grantStarterWeapons(legacy);
  assert.equal(migrated.slots[0]!.quantity,2);
  assert.deepEqual(migrated.slots.slice(1,4).map(stack=>stack?.itemId),
    [RITUAL_DAGGER_ID,ARCANE_SWORD_ID,SPIRIT_STAFF_ID]);
  assert.equal(migrated.equippedWeaponSlot,1);
  assert.deepEqual(grantStarterWeapons(migrated),migrated,
    "repeated migration cannot duplicate weapons or heal potions");
  const used=useInventoryItem(migrated,0,40,100,true);
  assert.equal(used.ok,true);
  if ("reason" in used) return;
  assert.equal(used.inventory.slots[0]!.quantity,1);
  const upgraded=grantStarterWeapons(used.inventory);
  assert.equal(upgraded.slots[0]!.quantity,1);
  assert.equal(upgraded.equippedWeaponSlot,1);
  slots[0]=null;
  assert.equal(grantStarterWeapons({version:1,slots}).slots[0]?.itemId,
    RITUAL_DAGGER_ID,"fully spent potions are never regenerated");
});

test("Weapon loadout: equip sword and staff, unequip, preserve item counts and damage stats", () => {
  const first=makeStarterInventory();
  assert.deepEqual(weaponBonuses(first),{melee:4,ranged:0});
  const sword=equipInventoryWeapon(first,2);
  assert.equal(sword.ok,true);
  if ("reason" in sword)return;
  assert.equal(sword.weaponId,ARCANE_SWORD_ID);
  assert.equal(equippedWeaponId(sword.inventory),ARCANE_SWORD_ID);
  assert.deepEqual(weaponBonuses(sword.inventory),{melee:8,ranged:0});
  assert.equal(first.equippedWeaponSlot,1,"equip does not mutate existing save");
  assert.deepEqual(equipInventoryWeapon(sword.inventory,2),
    {ok:false,reason:"already_equipped"});
  const staff=equipInventoryWeapon(sword.inventory,3);
  assert.equal(staff.ok,true);
  if ("reason" in staff)return;
  assert.equal(staff.weaponId,SPIRIT_STAFF_ID);
  assert.deepEqual(weaponBonuses(staff.inventory),{melee:0,ranged:6});
  const none=equipInventoryWeapon(staff.inventory,null);
  assert.equal(none.ok,true);
  if ("reason" in none)return;
  assert.equal(none.weaponId,null);
  assert.deepEqual(weaponBonuses(none.inventory),{melee:0,ranged:0});
  assert.equal(none.inventory.slots[0]!.quantity,3);
  assert.equal(none.inventory.slots[2]!.quantity,1);
  assert.equal(none.inventory.slots[3]!.quantity,1);
});

test("Weapon loadout: validate strict equip command and reject forged damage/stacks", () => {
  assert.deepEqual(parseEquipWeaponCommand({slot:2}),{slot:2});
  assert.deepEqual(parseEquipWeaponCommand({slot:null}),{slot:null});
  for(const bad of [
    null,{},[],{slot:108},{slot:-1},{slot:0.3},{slot:"3"},
    {slot:2,damage:999},{slot:2,quantity:100},{weaponId:ARCANE_SWORD_ID},
  ])assert.equal(parseEquipWeaponCommand(bad),null);
  const base=makeStarterInventory();
  assert.deepEqual(equipInventoryWeapon(base,0),{ok:false,reason:"not_weapon"});
  assert.deepEqual(equipInventoryWeapon(base,11),{ok:false,reason:"item_unavailable"});
  assert.deepEqual(useInventoryItem(base,2,52,100,true),
    {ok:false,reason:"not_consumable"});
  const modified={...base,slots:[...base.slots]};
  modified.slots[2]={itemId:ARCANE_SWORD_ID,quantity:2};
  assert.throws(()=>validateInventory(modified),/inventory_record_invalid/);
  modified.slots[2]={itemId:"unlisted_weapon" as typeof ARCANE_SWORD_ID,quantity:1};
  assert.throws(()=>validateInventory(modified),/inventory_record_invalid/);
  modified.slots[2]={itemId:ARCANE_SWORD_ID,quantity:1};
  modified.slots[4]={itemId:ARCANE_SWORD_ID,quantity:1};
  assert.throws(()=>validateInventory(modified),/inventory_record_invalid/);
  modified.slots[4]=null;
  assert.throws(()=>validateInventory({...modified,equippedWeaponSlot:0}),
    /inventory_record_invalid/,"potions cannot be equipped");
  assert.throws(()=>validateInventory({...modified,equippedWeaponSlot:25}),
    /inventory_record_invalid/);
});

// ---- Visible gear look (display only) ----
import { gearLook, gearLookPart } from "./ItemRules.js";
import { PERSONAL_ITEMS, OUTFIT_LEVELS } from "./PersonalItems.js";
const lookSlots: Record<string, string[]> = { head: ["head"], shoulders: ["shoulders"], chest: ["chest"], arms: ["arms"], leftHand: ["leftHand"], rightHand: ["rightHand"],
  legs: ["legs"], feet: ["feet"], offHand: ["offHand"], neck: ["neck"], earring: ["leftEar", "rightEar"], ring: ["leftRing", "rightRing"] };
const wornLook = (slot: string, id: string) => gearLook({ version: 1, slots: [], equippedWeaponSlot: 1, equipment: { [slot]: id } } as never);

test("Gear look: regular pieces keep their family and tier", () => {
  assert.equal(wornLook("head", "arm_cloth_head_3"), "head=arm_cloth_head:3");
  assert.equal(wornLook("offHand", "off_jar_8"), "offHand=off_jar:8");
  assert.equal(wornLook("leftEar", "acc_earrings_lotus_2"), "leftEar=acc_earrings_lotus:2");
  assert.equal(gearLook(undefined), "");
});

test("Gear look: class field-kit pieces show their real piece at the outfit tier", () => {
  const tierOf = (level: number) => OUTFIT_LEVELS.filter(min => min <= level).length;
  let checked = 0;
  for (const [id, def] of Object.entries(PERSONAL_ITEMS)) {
    if (!id.startsWith("arm_field_")) continue;
    const slot = lookSlots[def.kind]![0]!;
    assert.equal(wornLook(slot, id), `${slot}=${def.family}:${tierOf(def.level!)}`, id);
    assert.doesNotMatch(wornLook(slot, id), /arm_field_/, id);
    checked++;
  }
  assert.ok(checked > 500);
  // A level-37 sentinel field piece is outfit tier 3 (25 <= 37 < 45), not tier 37.
  const sentinel = Object.entries(PERSONAL_ITEMS).find(([id, d]) => id.startsWith("arm_field_sentinel_") && d.level === 37)!;
  assert.match(gearLookPart(sentinel[0])!, /:3$/);
});

test("Gear look: boss accessories without a numeric suffix are sent", () => {
  const boss = Object.entries(PERSONAL_ITEMS).filter(([, d]) => d.sourceBoss && ["neck", "earring", "ring"].includes(d.kind));
  assert.ok(boss.length >= 16);
  for (const [id, def] of boss) {
    const slot = lookSlots[def.kind]![0]!;
    assert.match(wornLook(slot, id), new RegExp(`^${slot}=${def.family}:\\d+$`), id);
  }
});

test("Gear look: every wearable piece has a look in every slot it fits", () => {
  for (const [id, def] of Object.entries(PERSONAL_ITEMS))
    for (const slot of lookSlots[def.kind] ?? []) assert.match(wornLook(slot, id), /^[a-zA-Z]+=[a-zA-Z_]+:\d+$/, `${id} in ${slot}`);
});

test("Economy commands share the expanded inventory limit", () => {
  const requestId = "inventory_capacity_001";
  const tradeId = "cafebeef-0dab-4436-85f3-deadbeef0001";
  const commands = [
    [parseMarketCreate, {requestId, amount:1, price:10}],
    [parseAuctionCreate, {requestId, amount:1, opening:10, durationHours:1}],
    [parseTradeOffer, {tradeId, amount:1, gold:0}],
    [parseForge, {requestId, stamp:"gear", action:"reroll"}],
    [parseSellMaterial, {requestId, expected:"mat_fish_common", quantity:1}],
  ] as const;
  for (const [parse, data] of commands) {
    assert.ok(parse({...data, slot:107}));
    assert.equal(parse({...data, slot:108}), null);
  }
  const forge = {requestId, slot:106, stamp:"gear", action:"enhance", copies:1};
  assert.ok(parseForge({...forge, donor:{slot:107, stamp:"donor"}}));
  assert.equal(parseForge({...forge, donor:{slot:108, stamp:"donor"}}), null);
  const deposit = {action:"deposit",requestId,epoch:1,item:"mat_raw_wood_1",amount:1};
  assert.ok(parseCityOrder({...deposit,slot:107}));
  assert.equal(parseCityOrder({...deposit,slot:108}), null);
});
