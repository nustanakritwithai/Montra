import {test} from "node:test";
import assert from "node:assert/strict";
import {BODY_SLOTS, PERSONAL_ITEMS, WEAPON_LEVELS, OUTFIT_LEVELS, MATERIAL_LEVELS, CATALOG_PAGES, equipPositions, fieldItem, monsterCardDrop, wearsTwinSwords, wearsWraps, usesStaff, type BodyItemId, type PersonalId} from "./PersonalItems.js";
import {makeClassInventory,equipBody,equipInventoryWeapon,equippedStats,equipmentRatings,gearHealing,overflowStaminaRegen,weaponBonuses} from "./ItemRules.js";
import {EconomyStore} from "./EconomyStore.js";
import {rollForge,forgeStamp,forgeIngredient} from "./ForgeRules.js";
import {changeCardSocket} from "./CardSockets.js";
import {ATLAS_SPAWNS} from "./WorldAtlas.js";

const paths=["muay_boran","phutthaisawan","blade","sentinel","seer","mender"];
const entries=Object.entries(PERSONAL_ITEMS);
const base={maxHp:1000,atk:100,def:110,magicAtk:90,magicDef:65,maxStamina:298};

test("every class has a legal, craftable outfit from 1 to 100, including two distinct rings and earrings",()=>{
  for(const [id,item] of entries){
    assert(item.level!>=1&&item.level!<=100,id);
    if(item.forge)assert(item.recipe?.length,id);
    if(item.recipe){assert(Number.isInteger(item.craftGold));for(const ingredient of item.recipe){
      const input=PERSONAL_ITEMS[ingredient.item as PersonalId];
      assert(input && input.level!<=item.level! && ingredient.qty>=1,id+" -> "+ingredient.item);
    }}
  }
  for(const path of paths)for(let level=1;level<=100;level++){
    const weaponLevel=WEAPON_LEVELS.filter(n=>n<=level).pop()!,bodyLevel=OUTFIT_LEVELS.filter(n=>n<=level).pop()!;
    const weapon=entries.find(([,v])=>v.path===path&&v.kind==="mainHand"&&v.level===weaponLevel);
    assert(weapon,path+" "+level);
    if(level===100){
      if(path==="muay_boran")assert(wearsWraps(weapon[0]));
      if(path==="phutthaisawan")assert(wearsTwinSwords(weapon[0]));
      if(path==="mender"||path==="seer")assert(usesStaff(weapon[0]));
    }
    const used=new Set<string>();
    for(const slot of BODY_SLOTS){
      const piece=entries.find(([id,v])=>!used.has(id)&&v.level===bodyLevel&&(v.path==="all"||v.path===path)&&equipPositions(v.kind).includes(slot));
      assert(piece,path+"/"+level+"/"+slot);
      used.add(piece[0]);
    }
  }
  const sent=CATALOG_PAGES.flatMap(Object.keys);
  assert.equal(new Set(sent).size,entries.length);
  assert(CATALOG_PAGES.every(page=>Buffer.byteLength(JSON.stringify(page))<16_384));
  for(const level of MATERIAL_LEVELS){
    const ids=new Set(Array.from({length:7},(_,i)=>fieldItem("seer",new Set(),level,max=>max===4?1:i)));
    assert.equal(ids.size,7);
    for(const id of ids)assert.equal(PERSONAL_ITEMS[id].level,level);
  }
  for(const [,card] of entries.filter(([,v])=>v.sourceCamp)){
    const spawn=ATLAS_SPAWNS.find(s=>s.id===card.sourceCamp+"_1");
    assert(spawn&&spawn.name===card.monster&&spawn.level===card.level,card.name);
    assert.equal(PERSONAL_ITEMS[monsterCardDrop(spawn.id,spawn.level,()=>0)!].name,card.name);
  }
});

test("capstone crafting, forge materials, role options, card and sale survive inventory transactions",()=>{
  const store=new EconomyStore(":memory:"),id="c".repeat(64);
  try{
    const bag=makeClassInventory("mender");
    const robe="arm_cloth_chest_8", def=PERSONAL_ITEMS[robe];
    let slot=2;
    for(const i of def.recipe!){bag.slots[slot++]={itemId:i.item as PersonalId,quantity:i.qty};}
    bag.slots[slot++]={itemId:"ref_flux_7",quantity:2};
    bag.slots[slot++]={itemId:"ref_seal_7",quantity:1};
    bag.slots[slot++]={itemId:"card_rift_warden",quantity:1};
    bag.slots[slot++]={itemId:"mat_metal_1",quantity:1};
    bag.slots[slot++]={itemId:"mat_ink_7",quantity:10};
    store.register(id,bag);
    const req=(n:number)=>"capstone_test_"+String(n).padStart(5,"0");
    assert.throws(()=>store.craftPersonal(id,req(1),robe,99),/item_level_required/);
    assert.deepEqual(store.getAccount(id).inventory,bag);
    store.craftPersonal(id,req(1),robe,100);
    const crafted=store.getAccount(id).inventory, index=crafted.slots.findIndex(s=>s?.itemId===robe);
    assert(crafted.slots[index]?.forge?.affix);
    assert.equal(equipBody(crafted,"chest",index,robe,"mender",99).ok,false);
    const worn=equipBody(crafted,"chest",index,robe,"mender",100);
    assert(worn.ok);store.saveCharacter(id,{inventory:worn.inventory},worn.inventory);
    const stamp=forgeStamp({itemId:robe,forge:worn.inventory.equipmentForges!.chest});
    const enhanced=store.forgeWeapon(id,req(2),"chest",stamp,"enhance",100);
    assert.deepEqual(store.forgeWeapon(id,req(2),"chest",stamp,"enhance",100),enhanced);
    assert.equal(enhanced.forge.rank,1);assert.equal(store.getAccount(id).inventory.slots.find(s=>s?.itemId==="ref_flux_7")?.quantity,1);
    assert.throws(()=>store.forgeWeapon(id,req(3),"chest",stamp,"reroll",100),/forge_item_changed/);
    const rolled=store.forgeWeapon(id,req(3),"chest",forgeStamp({itemId:robe,forge:enhanced.forge}),"reroll",100);
    assert(def.forge!.pool.includes(rolled.forge.affix!.stat));
    store.socketItem(id,{requestId:req(4),target:"chest",gear:robe,action:"drill",expected:"sealed",card:null});
    store.socketItem(id,{requestId:req(5),target:"chest",gear:robe,action:"insert",expected:"empty",card:"card_rift_warden"});
    const finished=store.getAccount(id).inventory;
    assert.equal(finished.equipmentForges!.chest!.rank,1);assert.equal(finished.equipmentSockets!.chest,"card_rift_warden");
    const naked=makeClassInventory("mender");
    assert(equippedStats(base,finished).magicAtk>equippedStats(base,naked).magicAtk);
    assert(weaponBonuses(finished,"pve").ranged>weaponBonuses(finished,"pvp").ranged);
    assert(gearHealing(finished,200)>0);assert(overflowStaminaRegen(base,finished)>0);
    const removed=equipBody(finished,"chest",null,robe,"mender",100);assert(removed.ok);
    const item=removed.inventory.slots.find(s=>s?.itemId===robe)!;
    assert.deepEqual(item.forge,rolled.forge);assert.equal(item.socket,"card_rift_warden");
    const saleSlot=finished.slots.findIndex(s=>s?.itemId==="mat_ink_7");
    const sale=store.sellMaterial(id,req(6),saleSlot,"mat_ink_7",2);
    assert.deepEqual(store.sellMaterial(id,req(6),saleSlot,"mat_ink_7",2),sale);
    assert.equal(sale.receivedGold,2*PERSONAL_ITEMS.mat_ink_7.sellGold!);
  }finally{store.close();}
});

test("class restrictions, capped forge ratings and card level survive the entire upgrade curve",()=>{
  for(const [id,item] of entries.filter(([,v])=>v.forge)){
    const def=item.forge!,top=rollForge(undefined,"reroll",()=>99,item).forge;
    assert(def.pool.includes(top.affix!.stat));
    assert.equal(top.affix!.tier,item.level!<25?1:item.level!<65?2:3);
    assert(forgeIngredient(item,9,"enhance")!.item in PERSONAL_ITEMS);
    if(item.kind==="mainHand"){
      const bag=makeClassInventory(item.path);bag.slots[1]={itemId:id as PersonalId,quantity:1,forge:{...top,rank:10}};bag.equippedWeaponSlot=null;
      assert.equal(equipInventoryWeapon(bag,1,"wrong_path",100).ok,false);
      if(item.level!>1)assert.equal(equipInventoryWeapon(bag,1,item.path,item.level!-1).ok,false);
      const worn=equipInventoryWeapon(bag,1,item.path,item.level);assert(worn.ok);
      const ratings=equipmentRatings(worn.inventory);
      assert(Object.values(ratings).reduce((a,b)=>a+b,0)<=def.enhanceMax+def.affixMax+.001);
    }
  }
  const starter=makeClassInventory("blade");starter.slots[1]!.socket=null;starter.slots[3]={itemId:"card_rift_warden",quantity:1};
  assert.throws(()=>changeCardSocket(starter,{target:1,gear:"wp_shadow_1",action:"insert",expected:"empty",card:"card_rift_warden",requestId:"card_level_test_01"}),/card_gear_level/);
  assert.equal(starter.slots[3]?.quantity,1);
});
