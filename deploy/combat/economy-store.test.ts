import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { EconomyStore, STARTER_GOLD } from "./EconomyStore.js";
import { makeStarterInventory } from "./ItemRules.js";

const a = "a".repeat(64), b = "b".repeat(64), c = "c".repeat(64);
const request = (n: number) => "request_" + String(n).padStart(16, "0");
function setup(): { store: EconomyStore; dir: string; file: string } {
  const dir = mkdtempSync(path.join(os.tmpdir(), "montra-economy-"));
  const file = path.join(dir,"economy.sqlite");
  const store = new EconomyStore(file);
  for (const id of [a,b,c]) store.register(id,makeStarterInventory());
  return { store,dir,file };
}
test("starter balance once, escrow purchase, idempotency, and restart", () => {
  const {store,dir,file}=setup();
  try {
    const {listingId}=store.listItem(a,request(1),0,2,300);
    assert.equal(store.getAccount(a).inventory.slots[0]?.quantity,1);
    assert.deepEqual(store.listItem(a,request(1),0,2,300),{listingId});
    assert.throws(()=>store.listItem(a,request(1),0,1,300),/request_id_conflict/);
    store.buy(b,request(2),listingId);
    store.buy(b,request(2),listingId);
    assert.equal(store.getAccount(a).gold,STARTER_GOLD+300);
    assert.equal(store.getAccount(b).gold,STARTER_GOLD-300);
    assert.equal(store.getAccount(b).inventory.slots[0]?.quantity,5);
    assert.throws(()=>store.buy(c,request(3),listingId),/listing_unavailable/);
    store.close();
    const reopened=new EconomyStore(file);
    try { assert.equal(reopened.register(a,makeStarterInventory()).gold,1300); assert.equal(reopened.getAccount(b).inventory.slots[0]?.quantity,5); }
    finally { reopened.close(); }
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
test("failed purchases, inventory checks and cancellation remain atomic", () => {
  const {store,dir}=setup();
  try {
    assert.throws(()=>store.listItem(a,request(10),1,1,100),/item_equipped/);
    const {listingId}=store.listItem(a,request(11),0,1,1001);
    assert.throws(()=>store.buy(b,request(12),listingId),/insufficient_gold/);
    assert.equal(store.getAccount(b).gold,1000);
    assert.equal(store.list().length,1);
    store.cancel(a,request(13),listingId);
    assert.equal(store.getAccount(a).inventory.slots[0]?.quantity,3);
    assert.equal(store.list().length,0);
  } finally { store.close(); rmSync(dir,{recursive:true,force:true}); }
});
test("direct trade transfers both inventories and balances as one transaction", () => {
  const {store,dir}=setup();
  try {
    store.trade(a,b,request(20),{slot:0,amount:2,gold:100},{slot:0,amount:1,gold:25});
    assert.equal(store.getAccount(a).gold,925);
    assert.equal(store.getAccount(b).gold,1075);
    assert.equal(store.getAccount(a).inventory.slots[0]?.quantity,2);
    assert.equal(store.getAccount(b).inventory.slots[0]?.quantity,4);
    assert.throws(()=>store.trade(a,b,request(21),{slot:0,amount:99,gold:0},{slot:0,amount:1,gold:0}),/item_unavailable/);
    assert.equal(store.getAccount(a).gold,925);
  } finally { store.close(); rmSync(dir,{recursive:true,force:true}); }
});
