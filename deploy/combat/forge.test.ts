import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { EconomyStore, STARTER_GOLD } from "./EconomyStore.js";
import { makeClassInventory, makeStarterInventory, practiceLoot, validateInventory, weaponBonuses, SHRINE_GLAIVE, SHRINE_SHARD } from "./ItemRules.js";
import { FORGE, FORGE_CATALOG, forgeStamp, rollForge, plainForge } from "./ForgeRules.js";
import { parseClaimForgeCopy, parseForge } from "./EconomyRules.js";

test("each possible roll matches the quoted outcome; the first downgrade is +3 to +2",()=>{
  const rates=[[100,0,0],[100,0,0],[100,0,0],[95,5,0],[93,7,0],[90,8,2],[85,12,3],[70,22,8],[55,30,15],[40,40,20]];
  let item=plainForge(),copies=0;
  for(const [rank,rate] of rates.entries()){
    const step=FORGE_CATALOG.enhanceSteps[rank];
    assert.deepEqual([step.chance,step.downgradeChance,step.breakChance],rate);
    assert.equal(step.breakOnFailure,rate[2]>0);
    const counts=[0,0,0];
    for(let n=0;n<100;n++){
      const roll=rollForge(item,"enhance",()=>n);
      const outcomes=[roll.success,roll.downgraded,roll.broken];
      assert.equal(outcomes.filter(Boolean).length,1);counts[outcomes.indexOf(true)]++;
      assert.equal(roll.forge.rank,rank+Number(roll.success)-Number(roll.downgraded));
    }
    assert.deepEqual(counts,rate);
    copies+=step.copies;item=rollForge(item,"enhance",()=>0).forge;
  }
  assert.equal(copies,22);assert.throws(()=>rollForge(item,"enhance"),/forge_max_rank/);
});

test("a confirmed downgrade charges once and keeps the worn item's identity, affix and allowed socket across restart",()=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),"montra-forge-down-")),file=path.join(dir,"economy.sqlite");
  let store=new EconomyStore(file,()=>98);
  try{
    const actor="c".repeat(64),gear="acc_ring_atk_1",bag=makeClassInventory("blade");
    const forge={...plainForge(),rank:3,affix:{stat:"melee" as const,tier:1}};
    bag.equipment={rightRing:gear};bag.equipmentForges={rightRing:forge};
    bag.equipmentSockets={rightRing:"card_possessed"};bag.forgeCopies={[gear]:2};
    store.register(actor,bag);
    const stamp=forgeStamp({itemId:gear,forge}),request=randomUUID(),before=store.getAccount(actor);
    const order={requestId:request,slot:"rightRing",stamp,action:"enhance",copies:2,acceptDowngrade:true};
    assert(parseForge(order)?.acceptDowngrade);
    assert.equal(parseForge({...order,acceptDowngrade:"yes"}),null);
    const attempt=(confirmed:boolean)=>store.forgeWeapon(actor,request,"rightRing",stamp,"enhance",1,undefined,2,{acceptDowngrade:confirmed});
    assert.throws(()=>attempt(false),/forge_downgrade_unconfirmed/);
    assert.deepEqual(store.getAccount(actor),before);
    const result=attempt(true);
    assert(result.downgraded && !result.broken && !result.success);
    const after=store.getAccount(actor);
    assert.equal(after.gold,before.gold-48);assert.equal(after.inventory.forgeCopies?.[gear],undefined);
    assert.equal(after.inventory.equipment?.rightRing,gear);assert.equal(after.inventory.equipmentSockets?.rightRing,"card_possessed");
    assert.deepEqual(after.inventory.equipmentForges?.rightRing,{...forge,rank:2,revision:forge.revision+1});
    store.close();store=new EconomyStore(file,()=>0);
    assert.deepEqual(attempt(true),result);assert.deepEqual(store.getAccount(actor),after);
    assert.throws(()=>store.forgeWeapon(actor,randomUUID(),"rightRing",stamp,"enhance"),/forge_item_changed/);
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

test("the worn forest weapon drops matching copies into a full bag and pays the forge through +7",()=>{
  let bag=makeClassInventory("muay_boran");
  const id="wp_wrap_1", actor="a".repeat(64);
  assert.equal(bag.slots[1]?.itemId,id);
  // The first wearable chest must still be available after a full-bag copy hunt.
  bag.slots=bag.slots.map(s=>s??{itemId:"health_potion",quantity:99});
  bag.slots[2]={itemId:"mat_ink_7",quantity:99};
  for(let i=1;i<=12;i++){
    const drop=practiceLoot(bag,"muay_boran",1,"normal",1,"forest_west_1",()=>0);
    assert.equal(drop.id,id);assert.equal(drop.banked,true);
    bag=validateInventory(JSON.parse(JSON.stringify(drop.bag)));
    assert.equal(bag.forgeCopies?.[id],i);assert.equal(bag.firstChestClaimed,undefined);
  }
  const store=new EconomyStore(":memory:",()=>0);
  try{
    store.register(actor,bag);store.sellMaterial(actor,randomUUID(),2,"mat_ink_7",99);
    for(let n=0;n<40;n++){
      const old=store.getAccount(actor),piece=old.inventory.slots[1]!,rank=piece.forge?.rank??0;
      if(rank===7)break;
      const terms=FORGE_CATALOG.enhanceSteps[rank],request=randomUUID(),stamp=forgeStamp(piece);
      const risks={acceptBreak:terms.breakOnFailure,acceptDowngrade:terms.downgradeChance>0};
      const hit=store.forgeWeapon(actor,request,1,stamp,"enhance",1,undefined,terms.copies,risks);
      assert.deepEqual(store.forgeWeapon(actor,request,1,stamp,"enhance",1,undefined,terms.copies,risks),hit);
      const after=store.getAccount(actor);
      assert.equal((old.inventory.forgeCopies?.[id]??0)-(after.inventory.forgeCopies?.[id]??0),terms.copies);
      assert.equal(after.gold,old.gold-hit.cost);
    }
    const final=store.getAccount(actor).inventory;
    assert.equal(final.slots[1]?.forge?.rank,7);assert.equal(final.equippedWeaponSlot,1);
    assert.equal(final.forgeCopies?.[id]??0,0);
  }finally{store.close();}
});

test("only the named unequipped spare can be spent and forged requests leave the account intact",()=>{
  const id="acc_ring_atk_1",actor="b".repeat(64),bag=makeClassInventory("blade");
  bag.slots[2]={itemId:id,quantity:1,forge:plainForge()};
  bag.slots[3]={itemId:id,quantity:1,forge:plainForge()};
  bag.forgeCopies={acc_ring_atk_2:10};
  const target=forgeStamp(bag.slots[2]!),other=forgeStamp(bag.slots[3]!);
  const store=new EconomyStore(":memory:");
  try{
    store.register(actor,bag);
    const before=store.getAccount(actor);
    assert.equal(parseForge({requestId:randomUUID(),slot:2,stamp:target,action:"enhance"}),null);
    assert.throws(()=>store.forgeWeapon(actor,randomUUID(),2,target,"enhance"),/forge_missing_copy/);
    for(const donor of [{slot:2,stamp:target},{slot:1,stamp:bag.slots[1]!.itemId},{slot:3,stamp:target}]){
      assert.throws(()=>store.forgeWeapon(actor,randomUUID(),2,target,"enhance",1,donor),/forge_donor_changed/);
    }
    assert.deepEqual(store.getAccount(actor),before);
    const donor={slot:3,stamp:other},request=randomUUID();
    assert(parseForge({requestId:request,slot:2,stamp:target,action:"enhance",copies:1,donor}));
    const hit=store.forgeWeapon(actor,request,2,target,"enhance",1,donor,1);
    assert.equal(hit.forge.rank,1);
    assert.deepEqual(store.forgeWeapon(actor,request,2,target,"enhance",1,donor,1),hit);
    const after=store.getAccount(actor);
    assert.equal(after.inventory.slots[3],null);assert.equal(after.inventory.forgeCopies?.acc_ring_atk_2,10);
  }finally{store.close();}
});

test("retired enhancement catalysts return their original materials once",()=>{
  const store=new EconomyStore(":memory:"),id="f".repeat(64),request=randomUUID();
  try{
    const bag=makeClassInventory("blade");bag.slots[2]={itemId:"ref_flux_1",quantity:1};
    store.register(id,bag);
    const result=store.refine(id,request,"ref_flux_1",1);
    assert.deepEqual(result,{item:"mat_metal_1",quantity:2});
    assert.deepEqual(store.refine(id,request,"ref_flux_1",1),result);
    assert.deepEqual(store.getAccount(id).inventory.slots[2],{itemId:"mat_metal_1",quantity:2});
  }finally{store.close();}
});

test("a confirmed break removes only the target and its paid copies, including worn gear, across restart",()=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),"montra-forge-break-")),file=path.join(dir,"economy.sqlite");
  let store=new EconomyStore(file,()=>99);
  try{
    for(const [i,target] of ([1,2,"rightRing"] as const).entries()){
      const id=String(i).repeat(64),bag=makeClassInventory("blade"),forge={...plainForge(),rank:9};
      const gear=target===1?"wp_shadow_1":"acc_ring_atk_1",stamp=forgeStamp({itemId:gear,forge});
      if(typeof target==="number")bag.slots[target]={itemId:gear,quantity:1,forge,socket:"card_possessed"};
      else{
        bag.equipment={rightRing:gear as "acc_ring_atk_1"};bag.equipmentForges={rightRing:forge};
        bag.equipmentSockets={rightRing:"card_possessed"};
      }
      if(gear==="acc_ring_atk_1")bag.slots[3]={itemId:gear,quantity:1,forge:plainForge()};
      bag.forgeCopies={[gear]:4};store.register(id,bag);
      const before=store.getAccount(id),request=randomUUID();
      const attempt=(confirmed:boolean)=>store.forgeWeapon(id,request,target,stamp,"enhance",1,undefined,4,{acceptBreak:confirmed,acceptDowngrade:true});
      assert.throws(()=>attempt(false),/forge_risk_unconfirmed/);
      assert.throws(()=>attempt(true),/forge_remove_card/);assert.deepEqual(store.getAccount(id),before);
      store.socketItem(id,{requestId:randomUUID(),target,gear,stamp,action:"remove",expected:"card_possessed",card:null});
      const receipt=attempt(true);assert.equal(receipt.broken,true);assert.equal(receipt.chance,40);
      const after=store.getAccount(id);
      assert.equal(after.gold,before.gold-120);assert.equal(after.inventory.forgeCopies?.[gear],undefined);
      assert(after.inventory.slots.some(s=>s?.itemId==="card_possessed"));
      if(typeof target==="number")assert.equal(after.inventory.slots[target],null);
      else{
        assert.equal(after.inventory.equipment?.rightRing,undefined);assert.equal(after.inventory.equipmentForges?.rightRing,undefined);
        assert.equal(after.inventory.equipmentSockets?.rightRing,undefined);
      }
      assert.equal(after.inventory.equippedWeaponSlot,target===1?null:1);
      if(gear==="acc_ring_atk_1")assert.deepEqual(after.inventory.slots[3],bag.slots[3]);
      store.close();store=new EconomyStore(file,()=>99);
      assert.deepEqual(attempt(true),receipt);assert.deepEqual(store.getAccount(id),after);
    }
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

test("a banked spare starts again at +0 after a break and can only be claimed once across restart",()=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),"montra-forge-claim-")),file=path.join(dir,"economy.sqlite");
  let store=new EconomyStore(file,()=>99);
  try{
    const actor="d".repeat(64),gear="wp_shadow_1",bag=makeClassInventory("blade");
    const old={...plainForge(),rank:9,affix:{stat:"melee" as const,tier:3}};
    bag.slots[1]={itemId:gear,quantity:1,bound:true,forge:old,socket:null};
    bag.forgeCopies={[gear]:6};store.register(actor,bag);
    assert(store.forgeWeapon(actor,randomUUID(),1,forgeStamp(bag.slots[1]),"enhance",1,undefined,4,{acceptBreak:true,acceptDowngrade:true}).broken);
    const before=store.getAccount(actor);
    assert.equal(before.inventory.forgeCopies?.[gear],2);
    assert.throws(()=>store.claimForgeCopy(actor,randomUUID(),gear,6),/forge_stock_changed/);
    assert.deepEqual(store.getAccount(actor),before);
    const request=randomUUID(),receipt=store.claimForgeCopy(actor,request,gear,2);
    assert.notEqual(receipt.instanceId,old.instanceId);assert.equal(receipt.remaining,1);
    store.close();store=new EconomyStore(file,()=>0);
    assert.deepEqual(store.claimForgeCopy(actor,request,gear,2),receipt);
    const after=store.getAccount(actor),piece=after.inventory.slots[1]!;
    assert.equal(after.gold,before.gold);assert.equal(after.inventory.equippedWeaponSlot,null);
    assert.equal(after.inventory.forgeCopies?.[gear],1);assert.equal(piece.forge!.instanceId,receipt.instanceId);
    assert.equal(piece.forge!.rank,0);assert.equal(piece.forge!.affix,null);assert.equal(piece.socket,undefined);assert(piece.bound);
    assert.throws(()=>store.listItem(actor,randomUUID(),1,1,1),/item_bound/);
    assert.throws(()=>store.claimForgeCopy(actor,randomUUID(),gear,1),/duplicate_weapon/);
    assert.equal(store.forgeWeapon(actor,randomUUID(),1,forgeStamp(piece),"enhance").forge.rank,1);
    assert.equal(store.getAccount(actor).inventory.forgeCopies?.[gear],undefined);
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

test("claim validates stock, bag capacity and paired slots, including bound legacy weapons",()=>{
  const actor="e".repeat(64),gear="acc_ring_atk_1",req=randomUUID();
  assert(parseClaimForgeCopy({requestId:req,gear,expectedStock:2}));
  for(const payload of [{gear:"mat_ink_1",expectedStock:1},{gear,expectedStock:0},{gear,expectedStock:100},{gear,expectedStock:1,rank:10}]){
    assert.equal(parseClaimForgeCopy({requestId:req,...payload}),null);
  }
  const store=new EconomyStore(":memory:");
  try{
    const bag=makeClassInventory("blade");bag.equipment={leftRing:gear};
    bag.forgeCopies={[gear]:2,ritual_dagger:1};
    store.register(actor,bag);
    const first=store.claimForgeCopy(actor,req,gear,2);
    assert.equal(first.remaining,1);
    assert.throws(()=>store.claimForgeCopy(actor,randomUUID(),gear,1),/accessory_limit/);
    const legacy=store.claimForgeCopy(actor,randomUUID(),"ritual_dagger",1);
    const inventory=store.getAccount(actor).inventory;
    const dagger=inventory.slots.find(s=>s?.forge?.instanceId===legacy.instanceId);
    assert(dagger?.bound && dagger.forge?.rank===0);
    assert.equal(inventory.equipment?.leftRing,gear);
    const full=makeClassInventory("blade");full.slots=full.slots.map(s=>s??{itemId:"health_potion",quantity:99});full.forgeCopies={[gear]:1};
    const other="f".repeat(64);store.register(other,full);
    assert.throws(()=>store.claimForgeCopy(other,randomUUID(),gear,1),/inventory_full/);
    assert.deepEqual(store.getAccount(other).inventory,full);
  }finally{store.close();}
});

test("a safe enhancement preserves reroll pity and clears the retired enhancement miss counter", () => {
  let f = {...plainForge(),rank:2,misses:3};
  for (let i = 0; i < FORGE.rareAfter; i++) f = rollForge(f, "reroll", () => 5).forge;
  assert.equal(f.affix?.tier, 1); assert.equal(f.rerollMisses, 4);
  f = rollForge(f, "enhance", () => 99).forge;
  assert.equal(f.rank, 3); assert.equal(f.misses, 0); assert.equal(f.rerollMisses, 4);
  f = rollForge(f, "reroll", () => 5).forge;
  assert.deepEqual(f.affix, {tier:3, stat:"melee"}); assert.equal(f.rerollMisses, 0);
});

test("forged weapon keeps identity through listing, trade and restart; retries spend once", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "montra-forge-test-")), db = path.join(dir, "economy.sqlite");
  let store = new EconomyStore(db);
  const a = "a".repeat(64), b = "b".repeat(64);
  const bag = makeStarterInventory(), emptySlot = makeStarterInventory(); emptySlot.slots[2] = null;
  try {
    bag.forgeCopies={arcane_sword:1};
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

test("craft rolls back a full bag or absent shard; traded shards craft once and the weapon can be sold", () => {
  const store = new EconomyStore(":memory:");
  const hunter="a".repeat(64), crafter="b".repeat(64);
  try {
    const bag = makeStarterInventory();
    for (let i=4; i<bag.slots.length; i++) bag.slots[i]={itemId:"health_potion",quantity:99};
    bag.slots[4]={itemId:SHRINE_SHARD,quantity:2};
    store.register(hunter,bag);
    store.register(crafter,makeStarterInventory());
    const unchanged = store.getAccount(hunter);
    assert.throws(()=>store.craftShrineGlaive(hunter,randomUUID()),/inventory_full/);
    assert.deepEqual(store.getAccount(hunter),unchanged);
    assert.throws(()=>store.forgeWeapon(hunter,randomUUID(),4,SHRINE_SHARD,"enhance"),/forge_item_changed/);
    assert.throws(()=>store.craftShrineGlaive(crafter,randomUUID()),/craft_missing_shard/);
    store.trade(hunter,crafter,randomUUID(),{slot:4,amount:1,gold:0},{slot:null,amount:0,gold:0});
    const request = randomUUID();
    const first = store.craftShrineGlaive(crafter,request);
    assert.deepEqual(store.craftShrineGlaive(crafter,request),first);
    const account = store.getAccount(crafter);
    assert.equal(account.gold,STARTER_GOLD-100);
    assert.equal(account.inventory.slots[4]?.itemId,SHRINE_GLAIVE);
    const equipped={...account.inventory,equippedWeaponSlot:4};
    assert.equal(weaponBonuses(equipped).melee,10);
    assert.equal(weaponBonuses(equipped,"pvp").melee,8);
    assert.throws(()=>store.craftShrineGlaive(crafter,randomUUID()),/craft_missing_shard/);
    const listing=store.listItem(crafter,randomUUID(),4,1,25);
    store.listItem(hunter,randomUUID(),4,1,1); // Clear a slot for the purchase.
    store.buy(hunter,randomUUID(),listing.listingId);
    assert.equal(store.getAccount(hunter).inventory.slots[4]?.itemId,SHRINE_GLAIVE);
  } finally { store.close(); }
});
