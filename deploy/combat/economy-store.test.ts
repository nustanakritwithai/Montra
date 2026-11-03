import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { EconomyStore, STARTER_GOLD } from "./EconomyStore.js";
import { BODY_SLOTS, PERSONAL_ITEMS, personalItem, equipPositions, monsterCardDrop, type BodyItemId } from "./PersonalItems.js";
import { parseSocketOrder, type SocketOrder } from "./CardSockets.js";
import { makeClassInventory, makeStarterInventory, equipBody, equippedStats, parseBodyCommand, validateInventory, equipInventoryWeapon, practiceLoot } from "./ItemRules.js";

const a = "a".repeat(64), b = "b".repeat(64), c = "c".repeat(64);
const request = (n: number) => "request_" + String(n).padStart(16, "0");

test("a full outfit frees bag space, keeps hands independent and survives reload", () => {
  let bag=makeClassInventory("seer");
  const base={atk:20,def:30,maxHp:240,maxStamina:100,magicAtk:15,magicDef:20};
  const initial=equippedStats(base,bag);
  for(const position of BODY_SLOTS){
    const id=Object.keys(PERSONAL_ITEMS).find(id=>{
      const def=personalItem(id)!;
      return equipPositions(def.kind).includes(position) && !Object.values(bag.equipment??{}).some(worn=>worn===id) && (def.path==="all" || def.path==="seer");
    }) as BodyItemId;
    assert(id);
    bag.slots[2]={itemId:id,quantity:1};
    const equipped=equipBody(bag,position,2,id,"seer");
    assert(equipped.ok);bag=equipped.inventory;
    assert.equal(bag.slots[2],null);
  }
  bag=validateInventory(JSON.parse(JSON.stringify(bag)));
  assert.equal(Object.keys(bag.equipment!).length,BODY_SLOTS.length);
  assert.equal(bag.slots.filter(Boolean).length,2);
  assert(equippedStats(base,bag).magicAtk>initial.magicAtk);
  const left=bag.equipment!.leftHand!,right=bag.equipment!.rightHand!;
  assert.notEqual(left,right);
  assert.equal(equipBody(bag,"rightHand",null,left,"seer").ok,false);
  bag.slots=bag.slots.map(s=>s??{itemId:"mat_fiber_1",quantity:99});
  assert.deepEqual(equipBody(bag,"leftHand",null,left,"seer"),{ok:false,reason:"inventory_full"});
  const replacement="arm_heavy_leftHand_1";
  bag.slots[5]={itemId:replacement,quantity:1};
  const swap=equipBody(bag,"leftHand",5,replacement,"seer");
  assert(swap.ok);
  assert.deepEqual(swap.inventory.slots[5],{itemId:left,quantity:1,bound:true});
  assert.equal(swap.inventory.equipment!.rightHand,right);
  assert.equal(equipBody(swap.inventory,"leftHand",5,replacement,"seer").ok,false);
  assert.throws(()=>validateInventory({...bag,equipment:{...bag.equipment,leftHand:right}}),/inventory_record_invalid/);
  const old=makeClassInventory("seer");
  old.slots[2]={itemId:"arm_cloth_chest_1",quantity:1};
  const migrated=validateInventory({...old,equippedChestSlot:2});
  assert.deepEqual(migrated.equipment,{chest:"arm_cloth_chest_1"});
  assert.equal(migrated.slots[2],null);
  assert.deepEqual(validateInventory(migrated),migrated);
});

test("practice equipment preserves ownership, recipe costs and receipts", () => {
  const store=new EconomyStore(":memory:");
  try {
    const bag=makeClassInventory("seer");
    const pathWeapons=["muay_boran","phutthaisawan","blade","sentinel","seer","mender"]
      .map(pathId=>makeClassInventory(pathId).slots[1]?.itemId);
    assert.equal(new Set(pathWeapons).size,6);
    assert.deepEqual(equipInventoryWeapon({...bag,equippedWeaponSlot:null},1,"blade"),{ok:false,reason:"wrong_item_class"});
    bag.slots[2]={itemId:"mat_fiber_1",quantity:3};
    bag.slots[3]={itemId:"mat_resin_1",quantity:2};
    store.register(a,bag);
    assert.throws(()=>store.craftPersonal(a,request(20),"arm_heavy_chest_1"),/craft_missing_material/);
    assert.deepEqual(store.getAccount(a).inventory,bag);
    const receipt=store.craftPersonal(a,request(21),"arm_cloth_chest_1");
    assert.deepEqual(store.craftPersonal(a,request(21),"arm_cloth_chest_1"),receipt);
    const crafted=store.getAccount(a);
    assert.equal(crafted.gold,STARTER_GOLD-4);
    assert.equal(crafted.inventory.slots.filter(s=>s?.itemId==="arm_cloth_chest_1").length,1);
    const worn=equipBody(crafted.inventory,"chest",2,"arm_cloth_chest_1","seer");
    assert(worn.ok);
    assert.equal(worn.inventory.slots[2],null);
    const removed=equipBody(worn.inventory,"chest",null,"arm_cloth_chest_1","seer");
    assert(removed.ok);
    store.register(b,removed.inventory);
    assert.throws(()=>store.listItem(b,request(22),2,1,1),/item_bound/);
    assert.throws(()=>store.listItem(b,request(23),1,1,1),/item_equipped/);
    const full=makeClassInventory("blade");
    full.slots=full.slots.map(s=>s??{itemId:"mat_ink_1",quantity:99});
    assert.equal(practiceLoot(full,"blade").bag.firstChestClaimed,undefined);
    full.slots[8]=null;
    const retry=practiceLoot(full,"blade");
    assert.equal(retry.id,"arm_hide_chest_1");
    assert.equal(practiceLoot(retry.bag,"blade").bag.slots.filter(s=>s?.itemId==="arm_hide_chest_1").length,1);
  } finally {store.close();}
});

test("a necklace, two earrings and two rings may be crafted, worn together and removed by side", () => {
  const store=new EconomyStore(":memory:");
  try {
    const bag=makeClassInventory("blade");
    bag.slots[2]={itemId:"mat_wood_1",quantity:8};
    bag.slots[3]={itemId:"mat_fiber_1",quantity:4};
    bag.slots[4]={itemId:"mat_metal_1",quantity:5};
    bag.slots[5]={itemId:"mat_ink_1",quantity:4};
    bag.slots[6]={itemId:"mat_hide_1",quantity:2};
    store.register(a,bag);
    const pieces=[["neck","acc_torc_1"],["rightEar","acc_earrings_lotus_1"],["leftEar","acc_earrings_hunter_1"],
      ["rightRing","acc_ring_atk_1"],["leftRing","acc_ring_heal_1"]] as const;
    for (const [index,[,id]] of pieces.entries())store.craftPersonal(a,request(50+index),id);
    let outfit=store.getAccount(a).inventory;
    for (const [position,id] of pieces) {
      const worn=equipBody(outfit,position,outfit.slots.findIndex(s=>s?.itemId===id),id,"blade");
      assert(worn.ok);outfit=worn.inventory;
    }
    store.saveCharacter(a,{inventory:outfit},outfit);
    const saved=store.getAccount(a).inventory;
    assert.deepEqual(saved.equipment,Object.fromEntries(pieces));
    const base={maxHp:240,maxStamina:100,atk:20,def:30,magicAtk:15,magicDef:20};
    const before=equippedStats(base,bag);
    assert.deepEqual(equippedStats(base,saved),{...before,atk:before.atk+3,magicDef:before.magicDef+3,maxStamina:before.maxStamina+6,magicAtk:before.magicAtk+4});
    assert.equal(parseBodyCommand({position:"rightEar",slot:2,expected:"acc_ring_atk_1"}),null);
    assert.equal(parseBodyCommand({position:"wings",slot:2,expected:"acc_wings_kinnari_1"}),null);
    assert.equal(equipBody(saved,"leftEar",null,"acc_earrings_lotus_1","blade").ok,false);
    const removed=equipBody(saved,"leftEar",null,"acc_earrings_hunter_1","blade");
    assert(removed.ok);
    assert.deepEqual(removed.inventory.equipment,{neck:"acc_torc_1",rightEar:"acc_earrings_lotus_1",rightRing:"acc_ring_atk_1",leftRing:"acc_ring_heal_1"});
    const swapped=equipBody(removed.inventory,"rightEar",removed.inventory.slots.findIndex(s=>s?.itemId==="acc_earrings_hunter_1"),"acc_earrings_hunter_1","blade");
    assert(swapped.ok);
    assert.equal(swapped.inventory.equipment?.rightEar,"acc_earrings_hunter_1");
    assert.equal(swapped.inventory.slots.filter(s=>s?.itemId==="acc_earrings_lotus_1").length,1);
  } finally {store.close();}
});
function setup(): { store: EconomyStore; dir: string; file: string } {
  const dir = mkdtempSync(path.join(os.tmpdir(), "montra-economy-"));
  const file = path.join(dir,"economy.sqlite");
  const store = new EconomyStore(file);
  for (const id of [a,b,c]) store.register(id,makeStarterInventory());
  return { store,dir,file };
}

test("a drilled ring keeps its card through sale, wear, side swap and retrieval", () => {
  const store=new EconomyStore(":memory:");
  try{
    const initial=makeClassInventory("blade"), gear="acc_ring_atk_1", card="card_possessed";
    initial.slots[2]={itemId:gear,quantity:1};
    initial.slots[3]={itemId:"mat_metal_1",quantity:2};
    initial.slots[4]={itemId:card,quantity:1};
    store.register(a,initial);store.register(b,makeClassInventory("blade"));
    const drill:SocketOrder={requestId:request(60),target:2,gear,expected:"sealed",action:"drill",card:null};
    const insert:SocketOrder={...drill,requestId:request(61),action:"insert",expected:"empty",card};
    assert.throws(()=>store.socketItem(a,insert),/socket_changed/);
    assert.deepEqual(store.socketItem(a,drill),store.socketItem(a,drill));
    assert.equal(store.getAccount(a).gold,STARTER_GOLD-20);
    assert.equal(store.getAccount(a).inventory.slots[3]?.quantity,1);
    assert.throws(()=>store.socketItem(a,{...drill,requestId:request(62)}),/socket_changed/);
    assert.deepEqual(store.socketItem(a,insert),store.socketItem(a,insert));
    assert.equal(store.getAccount(a).inventory.slots[4],null);
    assert.throws(()=>store.socketItem(a,{...drill,requestId:insert.requestId}),/request_id_conflict/);
    const listing=store.listItem(a,request(63),2,1,15);
    assert.equal(store.list()[0].item.socket,card);
    store.buy(b,request(64),listing.listingId);
    const buyer=store.getAccount(b).inventory, bagIndex=buyer.slots.findIndex(s=>s?.itemId===gear);
    const worn=equipBody(buyer,"leftRing",bagIndex,gear,"blade");assert(worn.ok);
    const base={atk:20,def:30,maxHp:240,maxStamina:100,magicAtk:15,magicDef:20};
    assert.equal(equippedStats(base,worn.inventory).atk-equippedStats(base,buyer).atk,3);
    const substitute="acc_ring_guard_1";
    worn.inventory.slots[bagIndex]={itemId:substitute,quantity:1};
    const swap=equipBody(worn.inventory,"leftRing",bagIndex,substitute,"blade");assert(swap.ok);
    assert.equal(swap.inventory.slots[bagIndex]?.socket,card);
    assert.equal(swap.inventory.equipmentSockets?.leftRing,undefined);
    const right=equipBody(swap.inventory,"rightRing",bagIndex,gear,"blade");assert(right.ok);
    right.inventory.slots=right.inventory.slots.map(s=>s??{itemId:"mat_ink_1",quantity:99});
    store.saveCharacter(b,{inventory:right.inventory},right.inventory);
    const remove:SocketOrder={requestId:request(65),gear,target:"rightRing",action:"remove",expected:card,card:null};
    assert.throws(()=>store.socketItem(b,remove),/inventory_full/);
    assert.equal(store.getAccount(b).inventory.equipmentSockets?.rightRing,card);
    right.inventory.slots[bagIndex]=null;
    store.saveCharacter(b,{inventory:right.inventory},right.inventory);
    assert.deepEqual(store.socketItem(b,remove),store.socketItem(b,remove));
    const saved=store.getAccount(b).inventory;
    assert.deepEqual(saved.slots[bagIndex],{itemId:card,quantity:1});
    assert.equal(saved.equipmentSockets?.rightRing,null);
    assert.equal(equippedStats(base,saved).atk,equippedStats(base,right.inventory).atk-1);
    // Old gear, including its forge state, may be drilled while worn in its bag slot.
    const weaponDrill:SocketOrder={...drill,target:1,gear:"wp_shadow_1",requestId:request(66)};
    assert.throws(()=>store.socketItem(b,weaponDrill),/drill_missing_metal/);
    assert(!Object.hasOwn(store.getAccount(b).inventory.slots[1]!,"socket"));
    assert.equal(parseSocketOrder({...insert,gear:"mat_ink_1"}),null);
    assert.equal(parseSocketOrder({...insert,card:"fake_card"}),null);
  }finally{store.close();}
});

test("a monster rolls only its own card at its published rate", () => {
  const monsters=[
    ["possessed-1",1,"card_possessed",12],["forest_west_1",2,"card_lost_ghost",12],
    ["forest_east_3",6,"card_root_shadow",12],["forest_deep_east_4",12,"card_arcane_spirit",12],
    ["forest_shrine_keeper",12,"card_shrine_keeper",20],["atlas_rift_warden",100,"card_rift_warden",25]
  ] as const;
  for(const [id,level,expected,chance] of monsters){
    assert.equal(monsterCardDrop(id,level,()=>chance-1),expected);
    assert.equal(monsterCardDrop(id,level,()=>chance),null);
  }
  assert.equal(monsterCardDrop("unrelated",1,()=>0),null);
});
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
