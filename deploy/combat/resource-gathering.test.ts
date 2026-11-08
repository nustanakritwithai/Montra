import assert from "node:assert/strict";
import {test} from "node:test";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {EconomyStore} from "./EconomyStore.js";
import {makeClassInventory,useInventoryItem} from "./ItemRules.js";
import {MATERIAL_LEVELS,PERSONAL_ITEMS} from "./PersonalItems.js";
import {rollMonsterLoot} from "./MonsterLoot.js";
import {WORLD_EXPANSION,WORLD_MAPS} from "./WorldMaps.js";
import {getResourceNode,harvestableFrom,resourceNodes,resourceStock,resourceApproach,rawResource} from "./WorldResources.js";
import {SCENERY_NODES} from "./SceneryNodes.js";
import {Player} from "./schema/MyRoomState.js";

test("server schema players can gather nearby wood and stone",()=>{
  for(const mapId of ["ritual_village","forbidden_forest"])for(const kind of ["wood","stone"] as const){
    const node=resourceNodes(mapId).find(n=>n.kind===kind && resourceApproach(n))!;
    const near=resourceApproach(node)!;
    const player=new Player();
    player.mapId=near.mapId;player.x=near.x;player.y=near.y;player.z=near.z;
    player.level=100;player.alive=true;player.mounted=false;player.flying=false;
    assert.doesNotThrow(()=>harvestableFrom(player,node));
    player.x+=100;
    assert.throws(()=>harvestableFrom(player,node),/resource_range/);
  }
});

test("gatherable objects have reachable ground, correct tier, map and range",()=>{
  const tiers=new Set<number>();
  for(const map of Object.values(WORLD_MAPS))for(const node of resourceNodes(map.id)){
    const near=resourceApproach(node);
    assert(near,node.id);tiers.add(node.tier);
    harvestableFrom(near,node);
    assert.throws(()=>harvestableFrom({...near,x:near.x+100},node),/resource_range/);
    assert.throws(()=>harvestableFrom({...near,mapId:"other"},node),/resource_range/);
    assert.throws(()=>harvestableFrom({...near,mounted:true},node),/resource_ground/);
    if(node.tier>1)assert.throws(()=>harvestableFrom({...near,level:1},node),/item_level_required/);
    assert(getResourceNode(node.id)===node);
    assert(node.kind==="herb" || PERSONAL_ITEMS[rawResource(node)].refinesTo);
  }
  if(WORLD_EXPANSION)assert.equal(tiers.size,MATERIAL_LEVELS.length);
  if(WORLD_EXPANSION)for(const map of Object.values(WORLD_MAPS)){
    for(const [kind,x,z] of SCENERY_NODES[map.id]??[]){
      const b=map.bounds;
      if(x/100<b.minX || x/100>b.maxX || z/100<b.minZ || z/100>b.maxZ)continue;
      assert(getResourceNode(map.id+"/scenery-"+kind+"-"+x+"-"+z),"missing original model "+map.id+" "+x+","+z);
    }
  }
  assert(resourceNodes("ritual_village").length>=3);
  assert.equal(resourceNodes("forbidden_forest").filter(n=>/\/(tree|stone)-/.test(n.id)).length,12);
  assert(!rollMonsterLoot("possessed-1","blade",new Set(),1,0,"normal",max=>max-1)!.id.startsWith("mat_raw_"));
});

test("two characters share one stock and clock across database handles, retries, logout and reopen",()=>{
  const dir=mkdtempSync(join(tmpdir(),"montra-resource-test-")),file=join(dir,"economy.sqlite");
  const store=new EconomyStore(file),other=new EconomyStore(file),a="a".repeat(64),b="b".repeat(64);
  const wood=resourceNodes("ritual_village").find(n=>n.kind==="wood")!,stone=resourceNodes("ritual_village").find(n=>n.kind==="stone")!;
  const now=100_000;
  try{
    store.register(a,makeClassInventory("mender"));other.register(b,makeClassInventory("seer"));
    const first=store.harvest(a,"resource_first_0001",wood,now);
    assert.deepEqual(store.harvest(a,"resource_first_0001",wood,now+1),first);
    assert.throws(()=>store.harvest(a,"resource_again_0002",stone,now+1),/resource_cooldown/);
    other.harvest(b,"resource_second_001",wood,now);
    store.harvest(a,"resource_third_0001",wood,now+1500);
    other.harvest(b,"resource_fourth_001",wood,now+1500);
    assert.throws(()=>store.harvest(a,"resource_over_00001",wood,now+3000),/resource_empty/);
    const stock=(time:number)=>other.resourceMap(wood.mapId,time).nodes.find(n=>n.id===wood.id)!.stock;
    assert.equal(stock(now+3000),0);assert.equal(stock(now+wood.period),1);assert.equal(stock(now+4*wood.period),4);
    const refined=store.refine(a,"resource_refine_001",first.item,1);
    assert.deepEqual(store.refine(a,"resource_refine_001",first.item,1),refined);
    assert.equal(refined.item,"mat_wood_1");assert.throws(()=>store.refine(a,"resource_refine_002",first.item,1),/craft_missing_material/);
    const reloaded=new EconomyStore(file);
    try{
      assert.equal(reloaded.resourceMap(wood.mapId,now+3000).nodes.find(n=>n.id===wood.id)?.stock,0);
      assert.equal(reloaded.getAccount(a).inventory.slots.find(s=>s?.itemId===refined.item)?.quantity,1);
    }finally{reloaded.close();}
    assert(stone.period>wood.period);
    assert.deepEqual(resourceStock(stone,{stock:0,nextAt:now+stone.period},now+wood.period),{stock:0,nextAt:now+stone.period});
    const full=makeClassInventory("seer");full.slots=full.slots.map(()=>({itemId:"health_potion",quantity:99}));full.equippedWeaponSlot=null;
    const c="c".repeat(64);store.register(c,full);
    assert.throws(()=>store.harvest(c,"resource_full_00001",stone,now),/inventory_full/);
    assert.equal(other.resourceMap(stone.mapId,now).nodes.find(n=>n.id===stone.id)?.stock,stone.capacity);
    other.harvest(b,"resource_herb_00001",resourceNodes(wood.mapId).find(n=>n.kind==="herb")!,now+3000);
    store.harvest(a,"resource_stone_0001",stone,now+3100);
    store.harvest(a,"resource_stone_0002",stone,now+4700);
    other.harvest(b,"resource_stone_0003",stone,now+4700);
    const world=store.resourceAtlas(now+4700).find(z=>z.mapId===stone.mapId)!;
    // The expanded village has more nodes (fields, orchard, bank trees); only the two used here are empty.
    const untouched=(kind:string,used:string)=>resourceNodes(stone.mapId).filter(n=>n.kind===kind&&n.id!==used).reduce((sum,n)=>sum+n.capacity,0);
    assert.equal(world.stone,untouched("stone",stone.id));assert.equal(world.wood,untouched("wood",wood.id));
    const region=other.resourceMap(stone.mapId,now+4700),next=region.nodes.find(n=>n.id===stone.id)!.nextIn;
    // The 25% slow-down applies only when the whole map is nearly stripped (the larger village usually is not).
    const scarce=region.available*4<=region.capacity;
    assert.equal(next,stone.period+(scarce?Math.round(stone.period*.25):0)-1600);
    assert.equal(store.refine(a,"resource_ore_refine1","mat_raw_stone_1",1).item,"mat_metal_1");
    store.socketItem(a,{requestId:"resource_drill_0001",target:1,gear:"wp_crook_1",action:"drill",expected:"sealed",card:null});
    assert.equal(store.getAccount(a).inventory.slots[1]?.socket,null);
  }finally{store.close();other.close();rmSync(dir,{recursive:true,force:true});}
});

test("craft field tools and herbal medicines; tools conserve stock and medicine restores only its own stat",()=>{
  const store=new EconomyStore(":memory:"),actor="e".repeat(64),bag=makeClassInventory("seer");
  bag.slots[2]={itemId:"mat_wood_1",quantity:12};bag.slots[3]={itemId:"mat_metal_1",quantity:8};
  bag.slots[4]={itemId:"mat_herb_1",quantity:8};
  try{
    store.register(actor,bag);
    for(const id of ["tool_axe_1","tool_pick_1","use_herbal_1","use_mana_1"] as const)
      store.craftPersonal(actor,"resource_craft_"+id,id,1);
    const nodes=resourceNodes("ritual_village");
    for(const [i,kind] of (["wood","stone","herb"] as const).entries()){
      const n=nodes.find(n=>n.kind===kind)!,at=100_000+i*1600;
      const won=store.harvest(actor,"resource_tool_test_"+kind,n,at);
      assert.equal(won.quantity,kind==="herb"?1:2);
      assert.equal(store.resourceMap(n.mapId,at).nodes.find(s=>s.id===n.id)?.stock,n.capacity-won.quantity);
    }
    const inventory=store.getAccount(actor).inventory,mp=inventory.slots.findIndex(s=>s?.itemId==="use_mana_1"),hp=inventory.slots.findIndex(s=>s?.itemId==="use_herbal_1");
    assert.deepEqual(useInventoryItem(inventory,mp,45,100,true,1,120,120),{ok:false,reason:"mana_full"});
    const heal=useInventoryItem(inventory,hp,95,100,true,1,10,120);
    assert(heal.ok && heal.healed===5 && heal.restoredMana===0);
    const mana=useInventoryItem(inventory,mp,100,100,true,1,115,120);
    assert(mana.ok && mana.restoredMana===5 && mana.healed===0 && !mana.inventory.slots[mp]);
  }finally{store.close();}
});

test("kiln receipts conserve fuel, reject invalid attempts and supply metal recipes in all seven tiers",()=>{
  for(const [i,level] of MATERIAL_LEVELS.entries()){
    const tier=i+1;
    for(const kind of ["charcoal","ingot"] as const){
      const product=PERSONAL_ITEMS[`mat_${kind}_${tier}`];
      assert.equal(product.station,"kiln");assert.equal(product.level,level);assert.equal(product.dropMax,undefined);
    }
    const consumers=Object.values(PERSONAL_ITEMS).filter(item=>item.recipe?.some(r=>r.item==="mat_ingot_"+tier));
    assert(consumers.some(item=>item.kind==="mainHand"));
    if(tier>1)assert(consumers.some(item=>item.kind==="tool"));
  }
  const store=new EconomyStore(":memory:"),actor="7".repeat(64),bag=makeClassInventory("seer");
  bag.slots[2]={itemId:"mat_raw_wood_2",quantity:2};bag.slots[3]={itemId:"mat_metal_2",quantity:2};
  bag.slots[4]={itemId:"mat_wood_2",quantity:1};
  try{
    store.register(actor,bag);
    const before=store.getAccount(actor);
    assert.throws(()=>store.craftPersonal(actor,"kiln_too_young_0001","mat_charcoal_2",9),/item_level_required/);
    assert.throws(()=>store.craftPersonal(actor,"kiln_missing_fuel01","mat_ingot_2",10),/craft_missing_material/);
    assert.deepEqual(store.getAccount(actor),before);
    const fire=store.craftPersonal(actor,"kiln_fire_once_001","mat_charcoal_2",10);
    assert.equal(fire.spentGold,0);
    assert.deepEqual(store.craftPersonal(actor,"kiln_fire_once_001","mat_charcoal_2",10),fire);
    assert.throws(()=>store.craftPersonal(actor,"kiln_fire_once_001","mat_ingot_2",10),/request_id_conflict/);
    const metal=store.craftPersonal(actor,"kiln_smelt_once_01","mat_ingot_2",10);
    assert.deepEqual(store.craftPersonal(actor,"kiln_smelt_once_01","mat_ingot_2",10),metal);
    const tool=store.craftPersonal(actor,"kiln_make_a_pick01","tool_pick_2",10);
    const done=store.getAccount(actor);
    assert.equal(done.gold,before.gold-tool.spentGold);
    assert(done.inventory.slots.some(s=>s?.itemId==="tool_pick_2"));
    assert(!done.inventory.slots.some(s=>s?.itemId==="mat_charcoal_2"||s?.itemId==="mat_ingot_2"));
    const full=makeClassInventory("seer"),other="8".repeat(64);
    full.slots=full.slots.map(s=>s??{itemId:"health_potion",quantity:99});
    full.slots[2]={itemId:"mat_raw_wood_1",quantity:3};store.register(other,full);
    assert.throws(()=>store.craftPersonal(other,"kiln_full_bag_0001","mat_charcoal_1",1),/inventory_full/);
    assert.deepEqual(store.getAccount(other).inventory,full);
  }finally{store.close();}
});
