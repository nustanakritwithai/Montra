import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { EconomyStore, STARTER_GOLD } from "./EconomyStore.js";
import { makeStarterInventory, weaponBonuses } from "./ItemRules.js";
import { FORGE, forgeStamp, rollForge } from "./ForgeRules.js";

test("pity guarantees the next rank or affix and resets only the matching counter", () => {
  let f = rollForge(undefined, "enhance", () => 99).forge;
  for (let i = 0; i < FORGE.maxMisses; i++) f = rollForge(f, "enhance", () => 99).forge;
  assert.equal(f.rank, 1); assert.equal(f.misses, 3);
  for (let i = 0; i < FORGE.rareAfter; i++) f = rollForge(f, "reroll", () => 5).forge;
  assert.equal(f.affix?.tier, 1); assert.equal(f.rerollMisses, 4);
  f = rollForge(f, "enhance", () => 99).forge;
  assert.equal(f.rank, 2); assert.equal(f.misses, 0); assert.equal(f.rerollMisses, 4);
  f = rollForge(f, "reroll", () => 5).forge;
  assert.deepEqual(f.affix, {tier:3, stat:"melee"}); assert.equal(f.rerollMisses, 0);
});

test("forged weapon keeps identity through listing, trade and restart; retries spend once", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "montra-forge-test-")), db = path.join(dir, "economy.sqlite");
  let store = new EconomyStore(db);
  const a = "a".repeat(64), b = "b".repeat(64);
  const bag = makeStarterInventory(), emptySlot = makeStarterInventory(); emptySlot.slots[2] = null;
  try {
    store.register(a, bag); store.register(b, emptySlot);
    const request = randomUUID(), first = store.forgeWeapon(a, request, 2, "arcane_sword", "enhance");
    assert.deepEqual(store.forgeWeapon(a, request, 2, "arcane_sword", "enhance"), first);
    assert.throws(() => store.forgeWeapon(a, randomUUID(), 2, "arcane_sword", "enhance"), /forge_item_changed/);
    const slot = store.getAccount(a).inventory.slots[2]!;
    const affix = store.forgeWeapon(a, randomUUID(), 2, forgeStamp(slot), "reroll");
    assert.equal(affix.forge.instanceId, first.forge.instanceId);
    const listing = store.listItem(a, randomUUID(), 2, 1, 100);
    store.buy(b, randomUUID(), listing.listingId);
    const bought = store.getAccount(b).inventory;
    assert.deepEqual(bought.slots[2]?.forge, affix.forge);
    bought.equippedWeaponSlot = 2;
    assert.ok(weaponBonuses(bought).melee > weaponBonuses(bought,"pvp").melee);
    assert.equal(weaponBonuses(bought,"pvp").melee,8);
    store.trade(b, a, randomUUID(), {slot:2, amount:1, gold:0}, {slot:null, amount:0, gold:0});
    store.close(); store = new EconomyStore(db);
    assert.deepEqual(store.getAccount(a).inventory.slots[2]?.forge, affix.forge);
    assert.equal(store.getAccount(a).gold, STARTER_GOLD - first.cost - FORGE.rerollCost + 100);
  } finally {store.close(); rmSync(dir, {recursive:true, force:true});}
});
