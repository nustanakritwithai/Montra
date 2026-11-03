import {test} from "node:test";
import assert from "node:assert/strict";
import {BODY_SLOTS, PERSONAL_ITEMS, WEAPON_LEVELS, OUTFIT_LEVELS, MATERIAL_LEVELS, equipPositions, monsterCardDrop, wearsTwinSwords, wearsWraps, usesStaff, type BodyItemId, type PersonalId} from "./PersonalItems.js";
import {CATALOG_PAGES,hunts,findItemHunt,rollMonsterLoot} from "./MonsterLoot.js";
import {makeClassInventory,equipBody,equipInventoryWeapon,equippedStats,equipmentRatings,gearHealing,overflowStaminaRegen,weaponBonuses,practiceLoot,validateInventory} from "./ItemRules.js";
import {EconomyStore} from "./EconomyStore.js";
import {rollForge,forgeStamp,forgeIngredient} from "./ForgeRules.js";
import {changeCardSocket} from "./CardSockets.js";
import {ATLAS_SPAWNS} from "./WorldAtlas.js";
import {FOREST_CAMPS} from "./WorldMaps.js";
import {TEMPLE_SPAWNS} from "./TempleMap.js";
import {personalGearGuides,cardHunt} from "./GearGuides.js";
import {gearMana} from "./ItemRules.js";
import {bossAccessoryReward,grantStackReward} from "./ItemRules.js";
import {BOSS_TREASURES,type MaterialId} from "./PersonalItems.js";
import {MyRoom} from "./MyRoom.js";
import {Player} from "./schema/MyRoomState.js";

const paths=["muay_boran","phutthaisawan","blade","sentinel","seer","mender"];
const entries=Object.entries(PERSONAL_ITEMS);
const base={maxHp:1000,atk:100,def:110,magicAtk:90,magicDef:65,maxStamina:298};

test("a listed monster really drops the item, and crafted and harvested products stay off its table",()=>{
  const allOwned=new Set(entries.map(([id])=>id));
  for(const mob of hunts){
    const roll=rollMonsterLoot(mob.id,"muay_boran",allOwned,mob.level,0,mob.tier??"normal",max=>max-1);
    assert(roll && PERSONAL_ITEMS[roll.id]?.kind==="material",mob.id+" has no material reward");
  }
  for(const [id,item] of entries){
    const hint=findItemHunt(id as PersonalId,item.level!);
    if(item.sourceBoss){assert.equal(hint?.monster,hunts.find(m=>m.id===item.sourceBoss)?.name,id);continue;}
    if(!item.dropMax || !item.forge && item.kind!=="material"){assert.equal(hint,null,id);continue;}
    assert(hint,id);
    const mob=hunts.find(m=>m.name===hint.monster && m.mapId===hint.mapId && m.level===hint.level)!;
    const path=item.path==="all"?"muay_boran":item.path;
    allOwned.delete(id);
    if(item.forge)assert.equal(rollMonsterLoot(mob.id,path,allOwned,100,0,mob.tier??"normal",()=>0)?.id,id,id);
    else assert(Array.from({length:7},(_,i)=>rollMonsterLoot(mob.id,path,allOwned,100,0,"normal",max=>max===100?99:i%max)?.id).some(candidate=>candidate===id),id);
    allOwned.add(id);
  }
  const sword="wp_twins_2",wrap="wp_wrap_2";
  const roll=(mob:string,path:string,id:string)=>rollMonsterLoot(mob,path,new Set([...allOwned].filter(i=>i!==id)),15,0,"normal",()=>0)?.id;
  assert.equal(roll("temple_forecourt_3","phutthaisawan",sword),sword);
  assert.notEqual(roll("atlas_drowned_marsh_2_1","phutthaisawan",sword),sword);
  assert.equal(roll("atlas_drowned_marsh_2_1","muay_boran",wrap),wrap);
  assert.notEqual(roll("temple_forecourt_3","muay_boran",wrap),wrap);
  assert.notEqual(roll("atlas_drowned_marsh_2_1","phutthaisawan",wrap),wrap);
  assert.equal(roll("atlas_drowned_marsh_1_1","muay_boran",wrap),wrap);
  for(const level of WEAPON_LEVELS)for(const family of ["wp_wrap","wp_twins"]){
    const hint=findItemHunt((family+"_"+(WEAPON_LEVELS.indexOf(level)+1)) as PersonalId,level);
    assert(hint && hint.level<=level+2,family+" has no nearby hunt at level "+level);
  }
});

test("each named encounter owns its fragment and accessory; three fragments craft the same wearable reward",()=>{
  const store=new EconomyStore(":memory:");
  try{
    for(const [boss,t] of Object.entries(BOSS_TREASURES)){
      const id=(t.level===12?"a":"b").repeat(64),bag=makeClassInventory("muay_boran");
      const gear=PERSONAL_ITEMS[t.gear],mob=hunts.find(m=>m.id===boss)!;
      assert.equal(findItemHunt(t.fragment,t.level)?.monster,mob.name);
      assert.equal(findItemHunt(t.gear,t.level)?.mapId,mob.mapId);
      assert.equal(gear.recipe![0].item,t.fragment);assert.equal(gear.recipe![0].qty,3);
      assert.equal(rollMonsterLoot("forest_west_1","muay_boran",new Set(),100,0,"normal",()=>0)?.id===t.gear,false);
      const preview=CATALOG_PAGES.find(page=>page[t.gear])![t.gear];
      assert("dropHint" in preview);assert.match(preview.dropHint,/20%/);
      assert.equal(bossAccessoryReward(bag,boss,t.level-1,()=>0),null);
      assert.equal(bossAccessoryReward(bag,boss,t.level,()=>20),null);
      assert.equal(bossAccessoryReward(bag,"forest_west_1",100,()=>0),null);
      const direct=bossAccessoryReward(bag,boss,t.level,()=>19)!;
      assert(direct.granted);assert.equal(direct.id,t.gear);
      assert.equal(bossAccessoryReward(direct.bag,boss,t.level,()=>0),null);
      const at=direct.bag.slots.findIndex(s=>s?.itemId===t.gear),position=t.level===12?"neck":"leftRing";
      const equip=equipBody(direct.bag,position,at,t.gear,"muay_boran",t.level);
      assert(equip.ok);assert.equal(bossAccessoryReward(equip.inventory,boss,t.level,()=>0),null);
      const full={...bag,slots:bag.slots.map(s=>s??{itemId:"health_potion" as const,quantity:99})};
      assert.equal(bossAccessoryReward(full,boss,t.level,()=>0)?.granted,false);
      assert.equal(grantStackReward(full,t.fragment),null);
      bag.slots[2]={itemId:gear.recipe![1].item as MaterialId,quantity:2};
      const two=grantStackReward(grantStackReward(bag,t.fragment)!,t.fragment)!;
      store.register(id,two);
      assert.throws(()=>store.craftPersonal(id,"test_boss_recipe_1",t.gear,t.level));
      const three=grantStackReward(store.getAccount(id).inventory,t.fragment)!;
      store.saveCharacter(id,{},three);
      const request="test_boss_recipe_"+boss;
      store.craftPersonal(id,request,t.gear,t.level);
      store.craftPersonal(id,request,t.gear,t.level);
      const crafted=store.getAccount(id).inventory;
      assert(!crafted.slots.some(s=>s?.itemId===t.fragment));
      assert.equal(crafted.slots.filter(s=>s?.itemId===t.gear).length,1);
    }
  }finally{store.close();}
});

test("three misses survive reload and a full bag preserves the guaranteed upgrade",()=>{
  const miss=(max:number)=>max-1;
  for(const [path,mob] of [["muay_boran","atlas_drowned_marsh_2_1"],["phutthaisawan","temple_forecourt_3"]]){
    let bag=makeClassInventory(path);
    const first=practiceLoot(bag,path,10,"normal",15,mob,miss);
    assert(first.bag.firstChestClaimed);bag=first.bag;
    for(let count=1;count<=3;count++){
      const reward=practiceLoot(bag,path,10,"normal",15,mob,miss);
      assert.equal(PERSONAL_ITEMS[reward.id!].kind,"material");
      bag=validateInventory(JSON.parse(JSON.stringify(reward.bag)));
      assert.equal(bag.lootMisses,count);
    }
    const full={...bag,slots:bag.slots.map(s=>s??{itemId:"health_potion" as const,quantity:99})};
    const blocked=practiceLoot(full,path,10,"normal",15,mob,miss);
    assert.equal(blocked.id,null);assert.equal(blocked.bag.lootMisses,3);
    const material=path==="phutthaisawan"?"mat_metal_2":"mat_hide_2";
    const tight={...full,lootMisses:0,slots:full.slots.map(s=>s.itemId.startsWith("mat_")?{...s,quantity:99}:s)};
    tight.slots[11]={itemId:material,quantity:98};
    const stacked=practiceLoot(tight,path,10,"normal",15,mob,miss);
    assert.equal(stacked.id,material);assert.equal(stacked.quantity,1);assert.equal(stacked.bag.slots[11]?.quantity,99);
    const reward=practiceLoot(bag,path,10,"normal",15,mob,miss);
    assert(reward.id && PERSONAL_ITEMS[reward.id].recommended?.includes(path));assert.equal(reward.bag.lootMisses??0,0);
  }
});

test("a dropped pair of wraps can be equipped and its Muay strike damages a monster",()=>{
  const room=new MyRoom(),bag=makeClassInventory("muay_boran");
  const roll=rollMonsterLoot("atlas_drowned_marsh_2_1","muay_boran",new Set(entries.map(([id])=>id).filter(id=>id!=="wp_wrap_2")),15,3,"normal",()=>0);
  assert(roll?.id==="wp_wrap_2");
  bag.slots[2]={itemId:roll.id,quantity:1};
  const equipped=equipInventoryWeapon(bag,2,"muay_boran",15);assert(equipped.ok);
  const actorId="looter",m=room.state.monster;
  Object.assign(m,{x:-10,z:9,y:0,hp:500,maxHp:500});
  room.state.players.set(actorId,new Player({pathId:"muay_boran",level:15,x:-10,z:8,y:0,alive:true,atk:40}));
  const combat=room as unknown as {inventories:Map<string,typeof bag>;muayCoreHit(id:string,target:string,power:number):boolean;broadcast:()=>void};
  combat.broadcast=()=>{};combat.inventories.set(actorId,equipped.inventory);
  assert(combat.muayCoreHit(actorId,m.id,1));assert(m.hp<500);
  const before=m.hp;combat.inventories.set(actorId,{...bag,equippedWeaponSlot:null});
  assert.equal(combat.muayCoreHit(actorId,m.id,1),false);assert.equal(m.hp,before);
});

test("twelve suggested builds resolve to legal gear, cards and hunting grounds at all levels",()=>{
  for(const path of paths)for(let level=1;level<=100;level++){
    const guides=personalGearGuides(path,level)!;
    assert.equal(guides.builds.length,2);
    assert.notDeepEqual(guides.builds[0].slots.map(s=>s.id),guides.builds[1].slots.map(s=>s.id));
    for(const build of guides.builds){
      assert.equal(new Set(build.slots.map(s=>s.id)).size,15);
      assert.equal(new Set(build.slots.map(s=>s.position)).size,15);
      for(const piece of build.slots){
        const def=PERSONAL_ITEMS[piece.id];
        assert(def.level!<=level&&(def.path==="all"||def.path===path));
        assert(def.forge!.pool.includes(piece.affix));
        assert(piece.hunt && piece.hunt.level>=def.level! && piece.hunt.level<=def.dropMax!,piece.id);
        if(piece.card){
          assert(PERSONAL_ITEMS[piece.card].level!<=def.level!);
          assert(piece.cardHunt && piece.cardHunt.level<=level && piece.cardHunt.monster===PERSONAL_ITEMS[piece.card].monster);
        }
        if(piece.next)assert(PERSONAL_ITEMS[piece.next].level!>level);
        else assert.equal(level,100);
      }
    }
  }
  const bag=makeClassInventory("mender");
  const mender=personalGearGuides("mender",100)!;
  assert.equal(mender.builds[1].slots.find(s=>s.position==="leftEar")?.affix,"healing");
  const sentinel=personalGearGuides("sentinel",100)!;
  assert.equal(sentinel.builds[0].slots.find(s=>s.position==="mainHand")?.affix,"melee");
  assert.equal(sentinel.builds[1].slots.find(s=>s.position==="mainHand")?.affix,"guard");
  for(const path of paths){
    const amulet=personalGearGuides(path,100)!.builds[0].slots.find(s=>s.position==="neck")!;
    assert.equal(PERSONAL_ITEMS[amulet.id].forge!.primary,path==="mender"?"healing":path==="seer"?"ranged":"melee");
  }
  bag.slots[1]={itemId:"wp_crook_6",quantity:1};
  assert(gearMana(50,bag).max>gearMana(50,undefined).max);
  bag.slots[1]={itemId:"wp_crook_10",quantity:1};
  assert.equal(gearMana(100,bag).max,320);
  assert(gearMana(100,bag).restRegen>0&&gearMana(100,bag).restRegen<=1);
  assert.equal(personalGearGuides("unknown",50),null);
});

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
    const ids=new Set(hunts.filter(m=>m.level>=level && m.level<(MATERIAL_LEVELS.find(n=>n>level)??101)).flatMap(m=>
      Array.from({length:7},(_,i)=>rollMonsterLoot(m.id,"seer",new Set(),level,0,"normal",max=>max===100?99:i%max)!.id)));
    assert.equal(ids.size,7);
    for(const id of ids)assert.equal(PERSONAL_ITEMS[id].level,level);
  }
  for(const [,card] of entries.filter(([,v])=>v.sourceCamp)){
    const spawn=ATLAS_SPAWNS.find(s=>s.id===card.sourceCamp+"_1");
    assert(spawn&&spawn.name===card.monster&&spawn.level>=card.level!,card.name);
    assert.equal(PERSONAL_ITEMS[monsterCardDrop(spawn.id,spawn.level,()=>0)!].name,card.name);
  }
});

test("late monster cards unlock through real hunts and the first high-level chest rolls an affix",()=>{
  const leftEar=(level:number)=>personalGearGuides("mender",level)!.builds[0].slots.find(s=>s.position==="leftEar")!;
  assert.notEqual(leftEar(85).card,"card_light_eater");
  assert.equal(leftEar(88).card,"card_light_eater");
  assert.equal(cardHunt("card_last_spirit")?.level,96);
  assert.equal(cardHunt("card_star_warden")?.level,98);
  const source=ATLAS_SPAWNS.find(s=>s.id==="atlas_spirit_rift_2_1")!;
  assert.equal(monsterCardDrop(source.id,source.level,()=>9),"card_light_eater");
  assert.equal(monsterCardDrop(source.id,source.level,()=>10),null);
  const bag=makeClassInventory("seer");
  const low=practiceLoot(bag,"seer",100,"boss",1);
  assert.equal(low.bag.slots.find(s=>s?.itemId===low.id)?.forge,undefined);
  const high=practiceLoot(bag,"seer",100,"boss",100);
  const armor=high.bag.slots.find(s=>s?.itemId===high.id);
  assert(armor?.bound && armor.forge?.affix && armor.forge.rank===0);
  bag.slots[2]={itemId:"acc_spell_6",quantity:1,socket:null};
  bag.slots[3]={itemId:"card_light_eater",quantity:1};
  const socket=changeCardSocket(bag,{target:2,gear:"acc_spell_6",action:"insert",expected:"empty",card:"card_light_eater",requestId:"light_card_85"});
  const worn=equipBody(socket.bag,"neck",2,"acc_spell_6","seer",88);
  assert(worn.ok);
  const bare=equipBody(bag,"neck",2,"acc_spell_6","seer",88);
  assert(bare.ok);
  assert.equal(gearMana(88,worn.inventory).max-gearMana(88,bare.inventory).max,4);
});

test("every class unlocks wearable equipment at every level, with field gear bounded by its adjacent tiers",()=>{
  const huntLevels=[1,...FOREST_CAMPS.flatMap(c=>c.levels),...TEMPLE_SPAWNS.map(s=>s.level),...ATLAS_SPAWNS.map(s=>s.level)];
  for(const path of paths)for(let level=1;level<=100;level++){
    const unlocked=entries.filter(([,item])=>item.forge && item.level===level && item.path===path);
    assert(unlocked.length,path+" Lv."+level);
    for(const [id,def] of unlocked.filter(([id])=>id.startsWith("arm_field_"))){
      const tier=OUTFIT_LEVELS.filter(n=>n<level).length;
      const lo=PERSONAL_ITEMS[(def.family+"_"+tier) as PersonalId];
      const hi=PERSONAL_ITEMS[(def.family+"_"+(tier+1)) as PersonalId];
      for(const stat of Object.keys({...lo.stats,...hi.stats}) as (keyof typeof lo.stats)[]){
        const value=def.stats[stat]??0, from=lo.stats[stat]??0, to=hi.stats[stat]??0;
        assert(value>=Math.min(from,to) && value<=Math.max(from,to),id+" "+stat);
      }
      assert(huntLevels.some(n=>n>=level && n<=def.dropMax!),id+" has no monster in its drop range");
      const bag=makeClassInventory(path),slot=equipPositions(def.kind)[0];
      bag.slots[2]={itemId:id as BodyItemId,quantity:1};
      assert(equipBody(bag,slot,2,id as BodyItemId,path,level).ok);
      assert(!equipBody(bag,slot,2,id as BodyItemId,path,level-1).ok);
      assert(!equipBody(bag,slot,2,id as BodyItemId,paths.find(p=>p!==path)!,level).ok);
    }
  }
});

test("level 99 class gear can drop or be crafted, enhanced, rerolled, drilled and fitted before the cap",()=>{
  const item="arm_field_mender_99",def=PERSONAL_ITEMS[item],position=equipPositions(def.kind)[0];
  const owned=new Set(entries.map(([id])=>id).filter(id=>id!==item));
  assert.equal(rollMonsterLoot("atlas_rift_warden","mender",owned,100,0,"boss",()=>0)?.id,item);
  assert.notEqual(rollMonsterLoot("atlas_rift_warden","seer",owned,100,0,"boss",()=>0)?.id,item);
  assert.notEqual(rollMonsterLoot("atlas_spirit_rift_5_1","mender",owned,98,0,"strong",()=>0)?.id,item);
  const store=new EconomyStore(":memory:"), account="f".repeat(64),bag=makeClassInventory("mender");
  try{
    let slot=2;
    for(const r of def.recipe!)bag.slots[slot++]={itemId:r.item as PersonalId,quantity:r.qty};
    for(const id of ["ref_flux_7","ref_seal_7","mat_metal_1","card_star_warden"] as const)bag.slots[slot++]={itemId:id,quantity:1};
    store.register(account,bag);
    store.craftPersonal(account,"field_crafting_0001",item,99);
    const crafted=store.getAccount(account).inventory,index=crafted.slots.findIndex(s=>s?.itemId===item);
    assert(crafted.slots[index]?.forge?.affix);
    const worn=equipBody(crafted,position,index,item,"mender",99);
    assert(worn.ok);store.saveCharacter(account,{inventory:worn.inventory},worn.inventory);
    const stamp=forgeStamp({itemId:item,forge:worn.inventory.equipmentForges![position]});
    const plus=store.forgeWeapon(account,"field_enhance_0001",position,stamp,"enhance",99);
    const reroll=store.forgeWeapon(account,"field_reroll_00001",position,forgeStamp({itemId:item,forge:plus.forge}),"reroll",99);
    store.socketItem(account,{requestId:"field_drilling_001",target:position,gear:item,action:"drill",expected:"sealed",card:null});
    store.socketItem(account,{requestId:"field_inserting_01",target:position,gear:item,action:"insert",expected:"empty",card:"card_star_warden"});
    const restored=store.getAccount(account).inventory;
    assert.equal(restored.equipmentForges![position]?.rank,1);
    assert.deepEqual(restored.equipmentForges![position]?.affix,reroll.forge.affix);
    assert.equal(restored.equipmentSockets![position],"card_star_warden");
  }finally{store.close();}
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
    let improved=top;
    for(let rank=1;rank<=10;rank++){
      improved=rollForge(improved,"enhance",()=>0,item).forge;
      assert.equal(improved.rank,rank);
      assert.deepEqual(improved.affix,top.affix);
    }
    assert.throws(()=>rollForge(improved,"enhance",()=>0,item),/forge_max_rank/);
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
