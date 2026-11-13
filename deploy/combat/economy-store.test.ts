import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { CRAFT_QUEUE_LIMIT, CRAFT_QUEUE_MS_PER_ITEM, EconomyStore, MAX_CRAFT_QUANTITY, STARTER_GOLD } from "./EconomyStore.js";
import { BODY_SLOTS, PERSONAL_ITEMS, personalItem, equipPositions, monsterCardDrop, type BodyItemId } from "./PersonalItems.js";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { parseCraft, parseHomeAction } from "./EconomyRules.js";
import { parseSocketOrder, type SocketOrder } from "./CardSockets.js";
import { makeClassInventory, makeStarterInventory, equipBody, equippedStats, parseBodyCommand, validateInventory, equipInventoryWeapon, practiceLoot, useInventoryItem } from "./ItemRules.js";

const a = "a".repeat(64), b = "b".repeat(64), c = "c".repeat(64);
const request = (n: number) => "request_" + String(n).padStart(16, "0");

test("a full outfit frees bag space, keeps hands independent and survives reload", () => {
  let bag=makeClassInventory("seer");
  const base={atk:20,def:30,maxHp:240,maxStamina:100,magicAtk:15,magicDef:20};
  const initial=equippedStats(base,bag);
  for(const position of BODY_SLOTS){
    const id=Object.keys(PERSONAL_ITEMS).find(id=>{
      const def=personalItem(id)!;
      return def.level===1 && equipPositions(def.kind).includes(position) && !Object.values(bag.equipment??{}).some(worn=>worn===id) && (def.path==="all" || def.path==="seer");
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

test("craft quantity accepts legacy requests and rejects invalid batch inputs", () => {
  const order = {recipeId: "mat_charcoal_1", requestId: request(76)};
  assert.deepEqual(parseCraft(order), {...order, quantity: 1});
  assert.deepEqual(parseCraft({...order, quantity: MAX_CRAFT_QUANTITY}), {...order, quantity: MAX_CRAFT_QUANTITY});
  for (const quantity of [undefined, null, 0, -1, 1.5, "2", Infinity, MAX_CRAFT_QUANTITY + 1]) {
    assert.equal(parseCraft({...order, quantity}), null);
  }
  assert.equal(parseCraft({...order, quantity: 2, gold: 0}), null);
});

test("batch cooking persists one receipt across restart and its output can restore HP", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "montra-craft-batch-"));
  const file = path.join(dir, "economy.sqlite");
  let store = new EconomyStore(file);
  try {
    const bag = makeStarterInventory();
    bag.slots[5] = {itemId: "mat_fish_common", quantity: 2};
    bag.slots[6] = {itemId: "mat_herb_1", quantity: 3};
    store.saveCharacter(a, {inventory: bag}, bag);
    const soup = "food_herbal_fish_soup";
    const receipt = store.craftPersonal(a, request(77), soup, 1, 2);
    assert.deepEqual(receipt, {itemId: soup, quantity: 2, bankedQuantity: 0, banked: false, spentGold: 0});
    store.close();
    store = new EconomyStore(file);
    assert.deepEqual(store.craftPersonal(a, request(77), soup, 1, 2), receipt);
    assert.throws(() => store.craftPersonal(a, request(77), soup, 1, 1), /request_id_conflict/);
    const saved = store.getAccount(a);
    assert.deepEqual(store.getCharacter(a), {inventory: saved.inventory});
    assert.equal(saved.gold, STARTER_GOLD);
    assert.equal(saved.inventory.slots.some(s => s?.itemId === "mat_fish_common"), false);
    assert.equal(saved.inventory.slots.find(s => s?.itemId === "mat_herb_1")?.quantity, 1);
    const slot = saved.inventory.slots.findIndex(s => s?.itemId === soup);
    assert.equal(saved.inventory.slots[slot]?.quantity, 2);
    const consumed = useInventoryItem(saved.inventory, slot, 50, 100, true);
    assert(consumed.ok);
    assert.equal(consumed.hp, 75);
    assert.equal(consumed.inventory.slots[slot]?.quantity, 1);
  } finally {
    store.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test("batch crafting preserves legacy receipts and rolls back when the final output has no room", () => {
  const {store, dir, file} = setup();
  try {
    const bag = makeStarterInventory();
    bag.slots = bag.slots.map(stack => stack ?? {itemId: "mat_raw_stone_1", quantity: 99});
    bag.slots[5] = {itemId: "mat_raw_wood_1", quantity: 5};
    bag.slots[6] = {itemId: "mat_charcoal_1", quantity: 98};
    store.saveCharacter(a, {inventory: bag}, bag);
    const before = store.getAccount(a);
    assert.throws(() => store.craftPersonal(a, request(78), "mat_charcoal_1", 1, 2), /inventory_full/);
    assert.deepEqual(store.getAccount(a), before);
    assert.deepEqual(store.getCharacter(a), {inventory: before.inventory});

    const recipe = "mat_charcoal_1", receipt = {itemId: recipe, spentGold: 0, banked: false};
    const db = new DatabaseSync(file);
    try {
      const intent = createHash("sha256").update(JSON.stringify({recipe})).digest("hex");
      db.prepare("INSERT INTO receipts(request_id,actor,kind,intent,result) VALUES(?,?,?,?,?)")
        .run(request(79), a, "craft", intent, JSON.stringify(receipt));
    } finally { db.close(); }
    assert.deepEqual(store.craftPersonal(a, request(79), recipe), receipt);
    assert.deepEqual(store.getAccount(a), before);
  } finally {
    store.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test("timed crafts run in order, charge once, and can be claimed exactly once after a restart", () => {
  const {dir, file, store: initial} = setup();
  let store = initial;
  const now = 1_900_000_000_000, step = CRAFT_QUEUE_MS_PER_ITEM;
  try {
    const bag = makeStarterInventory();
    bag.slots[5] = {itemId: "mat_herb_1", quantity: 12};
    bag.slots[6] = {itemId: "mat_wood_1", quantity: 6};
    store.saveCharacter(a, {inventory: bag}, bag);
    const recipe = "use_herbal_1";
    const first = store.enqueueCraft(a, request(501), recipe, 1, 2, now);
    const second = store.enqueueCraft(a, request(502), recipe, 1, 1, now);
    store.enqueueCraft(a, request(503), recipe, 1, 1, now);
    assert.throws(() => store.enqueueCraft(a, request(504), recipe, 1, 1, now), /craft_queue_full/);
    assert.equal(store.craftQueue(a, now).jobs.length, CRAFT_QUEUE_LIMIT);
    assert.equal(store.getAccount(a).gold, STARTER_GOLD - 12);
    assert.equal(store.getAccount(a).inventory.slots[5]?.quantity, 4);
    assert.deepEqual(store.craftQueue(a, now).jobs.slice(0, 2).map(job => [job.id, job.startsAt, job.readyAt, job.status]), [
      [first.jobId, now, now + 2 * step, "crafting"],
      [second.jobId, now + 2 * step, now + 3 * step, "queued"],
    ]);
    assert.deepEqual(store.craftQueue(b, now).jobs, []);
    assert.throws(() => store.claimCraft(b, request(505), first.jobId, now + 2 * step), /craft_job_unavailable/);
    assert.throws(() => store.claimCraft(a, request(506), first.jobId, now + 2 * step - 1), /craft_job_not_ready/);
    store.close();
    store = new EconomyStore(file);
    assert.deepEqual(store.enqueueCraft(a, request(501), recipe, 1, 2, now + step), first);
    assert.throws(() => store.enqueueCraft(a, request(501), recipe, 1, 1, now + step), /request_id_conflict/);
    const done = now + 2 * step;
    assert.equal(store.craftQueue(a, done).jobs[0].status, "ready");
    const result = store.claimCraft(a, request(506), first.jobId, done);
    assert.deepEqual(result, {jobId: first.jobId, itemId: recipe, quantity: 2, bankedQuantity: 0});
    store.close();
    store = new EconomyStore(file);
    assert.deepEqual(store.claimCraft(a, request(506), first.jobId, done), result);
    assert.throws(() => store.claimCraft(a, request(507), first.jobId, done), /craft_job_unavailable/);
    const account = store.getAccount(a);
    assert.equal(account.gold, STARTER_GOLD - 12);
    assert.equal(account.inventory.slots.find(stack => stack?.itemId === recipe)?.quantity, 2);
    assert.deepEqual(store.getCharacter(a), {inventory: account.inventory});
    assert.equal(store.craftQueue(a, done).jobs[0].id, second.jobId);
  } finally {
    store.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test("a failed timed craft claim leaves every output waiting until there is enough bag space", () => {
  const store = new EconomyStore(":memory:");
  try {
    const bag = makeStarterInventory();
    bag.slots = bag.slots.map(stack => stack ?? {itemId: "mat_raw_stone_1", quantity: 99});
    bag.slots[5] = {itemId: "mat_raw_wood_1", quantity: 5};
    bag.slots[6] = {itemId: "mat_charcoal_1", quantity: 98};
    store.register(a, bag);
    const now = 1_900_000_000_000, ready = now + 2 * CRAFT_QUEUE_MS_PER_ITEM;
    const {jobId} = store.enqueueCraft(a, request(510), "mat_charcoal_1", 1, 2, now);
    const before = store.getAccount(a);
    assert.equal(before.inventory.slots[5]?.quantity, 1);
    assert.throws(() => store.claimCraft(a, request(511), jobId, ready), /inventory_full/);
    assert.deepEqual(store.getAccount(a), before);
    assert.equal(store.craftQueue(a, ready).jobs[0].status, "ready");
    store.listItem(a, request(512), 7, 99, 1);
    store.claimCraft(a, request(511), jobId, ready);
    assert.deepEqual(store.getAccount(a).inventory.slots.filter(s => s?.itemId === "mat_charcoal_1").map(s => s!.quantity), [99, 1]);
    assert.deepEqual(store.craftQueue(a, ready).jobs, []);
  } finally { store.close(); }
});

test("home ownership, kitchen, furniture and watered crops survive restart and keep assets private",()=>{
  const {dir,file,store:initial} = setup();
  let store=initial;
  const now=1_900_000_000_000;
  try {
    const bag=makeStarterInventory();
    const materials=[["mat_wood_1",3],["mat_raw_stone_1",3],["mat_fish_common",5],["mat_fish_silver",1],
      ["mat_charcoal_1",1],["mat_herb_1",8]] as const;
    materials.forEach(([itemId,quantity],index)=>{bag.slots[4+index]={itemId,quantity};});
    store.saveCharacter(a,{inventory:bag},bag);
    const home=(n:number,action:string,extra:object={})=>{
      const order=parseHomeAction({requestId:request(n),action,...extra});
      assert(order);
      return store.homeAction(a,order,now);
    };
    assert.throws(()=>home(600,"plant",{plot:0}),/home_required/);
    assert.throws(()=>store.craftPersonal(a,request(601),"food_grilled_fish"),/cooking_level_required/);
    store.craftPersonal(a,request(602),"food_herbal_fish_soup",1,5);
    assert.equal(store.cookingState(a).level,2);
    assert.throws(()=>store.craftPersonal(a,request(601),"food_grilled_fish"),/cooking_kitchen_required/);
    const beforeHome=store.getAccount(a).gold;
    store.ensureHome(a);
    store.ensureHome(a);
    home(603,"buy"); // A legacy client can still send the old command.
    home(603,"buy");
    assert.equal(store.homeState(a).level,1);
    assert.equal(store.getAccount(a).gold,beforeHome);
    store.craftPersonal(a,request(604),"furniture_kitchen");
    assert.throws(()=>home(605,"place",{itemId:"furniture_kitchen",cell:4}),/home_cell_invalid/);
    home(606,"place",{itemId:"furniture_kitchen",cell:1});
    home(607,"move",{from:1,cell:2});
    assert.equal(store.cookingState(a).kitchen,true);
    store.craftPersonal(a,request(601),"food_grilled_fish");
    home(608,"plant",{plot:0});
    assert.throws(()=>home(609,"harvest",{plot:0}),/garden_not_ready/);
    store.collectWater(a,request(610),now);
    home(611,"water",{plot:0});
    assert.throws(()=>home(612,"water",{plot:0}),/garden_water_unavailable/);
    store.close();
    store=new EconomyStore(file);
    assert.deepEqual(store.homeState(a,now).furniture.map(({cell,itemId})=>[cell,itemId]),[[2,"furniture_kitchen"]]);
    assert.deepEqual(store.homeState(b,now).furniture,[]);
    assert.equal(store.homeState(b,now).level,0);
    assert.equal(store.homeState(a,now).garden[0].readyAt,now+120_000);
    const harvest=parseHomeAction({requestId:request(609),action:"harvest",plot:0})!;
    const before=store.getAccount(a).inventory.slots.find(s=>s?.itemId==="mat_herb_1")?.quantity ?? 0;
    store.homeAction(a,harvest,now+120_000);
    store.homeAction(a,harvest,now+120_000);
    assert.equal(store.getAccount(a).inventory.slots.find(s=>s?.itemId==="mat_herb_1")?.quantity,before+3);
    home(613,"upgrade");
    store.ensureHome(a);
    home(615,"buy");
    assert.equal(store.homeState(a,now).plotCount,4);
    home(614,"remove",{cell:2});
    assert.equal(store.cookingState(a).kitchen,false);
    assert.equal(store.getAccount(a).gold,STARTER_GOLD-217);
  } finally {store.close();rmSync(dir,{recursive:true,force:true});}
});

test("home parts layer independently, reject unsafe walls, and return to inventory after restart",()=>{
  const {dir,file,store:initial}=setup();
  let store=initial;
  const now=1_900_000_000_000;
  try {
    const bag=makeStarterInventory();
    bag.slots[4]={itemId:"furniture_plank_floor",quantity:1};
    bag.slots[5]={itemId:"furniture_wood_wall",quantity:1};
    bag.slots[6]={itemId:"furniture_stool",quantity:1};
    bag.slots[7]={itemId:"furniture_doorway",quantity:1};
    store.saveCharacter(a,{inventory:bag},bag);
    const perform=(n:number,action:string,props:object={},mayPlaceWall?: (cell:number,rotation:0|1)=>boolean)=>{
      const order=parseHomeAction({requestId:request(n),action,...props});
      assert(order);
      return store.homeAction(a,order,now,mayPlaceWall);
    };
    perform(710,"buy");
    perform(711,"place",{itemId:"furniture_stool",cell:1});
    assert.equal(parseHomeAction({requestId:request(712),action:"place",itemId:"furniture_wood_wall",cell:1}),null);
    perform(712,"place_part",{itemId:"furniture_plank_floor",cell:1,rotation:0});
    assert.throws(()=>perform(713,"place_part",{itemId:"furniture_wood_wall",cell:1,rotation:0}),/home_cell_occupied/);
    assert.throws(()=>perform(714,"place_part",{itemId:"furniture_wood_wall",cell:2,rotation:0},()=>false),/home_wall_blocked/);
    assert.equal(store.getAccount(a).inventory.slots[5]?.quantity,1);
    perform(714,"place_part",{itemId:"furniture_wood_wall",cell:2,rotation:0},()=>true);
    perform(714,"place_part",{itemId:"furniture_wood_wall",cell:2,rotation:0},()=>false);
    perform(715,"move_part",{layer:"structure",from:2,cell:2,rotation:1});
    perform(716,"place_part",{itemId:"furniture_doorway",cell:3,rotation:0});
    store.close();
    store=new EconomyStore(file);
    assert.equal(store.homeState(a).furniture[0].cell,1);
    assert.deepEqual(store.homeState(a).parts.map(p=>[p.layer,p.cell,p.rotation]),[
      ["floor",1,0],["structure",2,1],["structure",3,0],
    ]);
    assert.deepEqual(store.homeState(b).parts,[]);
    const full=store.getAccount(a).inventory;
    full.slots=full.slots.map(item=>item??{itemId:"mat_fiber_1",quantity:99});
    store.saveCharacter(a,{inventory:full},full);
    assert.throws(()=>perform(717,"remove_part",{layer:"structure",cell:2}),/inventory_full/);
    assert.equal(store.homeState(a).parts.length,3);
    const free=full.slots.findIndex(item=>item?.itemId==="mat_fiber_1");
    store.listItem(a,request(718),free,99,1);
    perform(717,"remove_part",{layer:"structure",cell:2});
    perform(717,"remove_part",{layer:"structure",cell:2});
    assert.equal(store.homeState(a).parts.length,2);
    assert.equal(store.getAccount(a).inventory.slots[free]?.itemId,"furniture_wood_wall");
  } finally {store.close();rmSync(dir,{recursive:true,force:true});}
});

test("needs decay across restart, drinking consumes one item, and supply retries do not grant twice",()=>{
  const {dir,file,store:initial}=setup();
  let store=initial;
  const now=1_900_000_000_000;
  try {
    assert.equal(store.needsState(a,now).water,100);
    const collected=store.collectWater(a,request(620),now);
    assert.deepEqual(store.collectWater(a,request(620),now+1),collected);
    assert.throws(()=>store.collectWater(a,request(621),now+1),/water_cooldown/);
    const slot=store.getAccount(a).inventory.slots.findIndex(s=>s?.itemId==="drink_clean_water");
    assert.throws(()=>store.consumeNutrition(a,slot,"drink_clean_water",{hp:50,mana:10},false,now),/needs_full/);
    store.close();
    store=new EconomyStore(file);
    const later=now+60*120_000;
    const hungry=store.needsState(a,later);
    assert.equal(hungry.food,70);
    assert.equal(hungry.water,40);
    const restored=store.consumeNutrition(a,slot,"drink_clean_water",{hp:50,mana:10},false,later);
    assert.equal(restored.water,75);
    assert.equal(restored.food,70);
    assert.equal(store.getAccount(a).inventory.slots[slot],null);
    const bag = store.getAccount(a).inventory;
    bag.slots[slot] = {itemId:"food_herbal_fish_soup",quantity:1};
    store.saveCharacter(a,{inventory:bag,hp:50,mana:10},bag);
    const fed = store.consumeNutrition(a,slot,"food_herbal_fish_soup",{hp:75,mana:10},true,later);
    assert.equal(fed.food,90);
    assert.equal(fed.water,83);
    assert.deepEqual(store.getCharacter(a),{inventory:store.getAccount(a).inventory,hp:75,mana:10});
    assert.equal(store.needsState(b,later).water,100);
  } finally {store.close();rmSync(dir,{recursive:true,force:true});}
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
