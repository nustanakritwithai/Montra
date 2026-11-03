import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import path from "node:path";
import {Client} from "@colyseus/sdk";

const endpoint=process.env.MONTRA_TEST_URL, folder=process.env.MONTRA_CHARACTER_DIR;
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(endpoint||"") || new URL(endpoint).port==="4108" ||
    !folder || !path.basename(folder).startsWith("montra-account-test-")) throw Error("Requires an isolated test account server");
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(get,label,timeout=7500) {
  const end=Date.now()+timeout;
  while(Date.now()<end){const value=get();if(value)return value;await delay(40);}
  throw Error("timed out: "+label);
}
const credentials={username:"gear_"+randomBytes(5).toString("hex"),password:"personal-gear-test-123"};
async function api(route){
  const response=await fetch(endpoint+"/montra/account/"+route,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(credentials)});
  assert.equal(response.status,200);return response.json();
}
await api("register");const {session}=await api("login");
const sdk=new Client(endpoint);
const options={accountSession:session,characterSlot:1,worldVersion:1,templeVersion:1,atlasVersion:1,provinceVersion:1,atlasReliefVersion:1,originalReliefVersion:1,terrainVersion:1,monsterAutoAttackVersion:1};
async function join(extra){
  const room=await sdk.create("my_room",{...options,...extra}),events=[];
  room.onMessage("*",(type,data)=>events.push({type,data}));
  const me=()=>room.state?.players?.get(room.sessionId);
  await until(()=>me()?.persistent,"admit");
  const event=(type,check=()=>true)=>events.find(e=>e.type===type && check(e.data))?.data;
  room.send("get_inventory",{});
  const bag=await until(()=>event("inventory_state",p=>p.catalogReady),"catalog and bag");
  const catalog=Object.assign({},...events.filter(e=>e.type==="item_catalog_page").map(e=>e.data.items));
  return {room,me,bag,event,events,catalog};
}
async function setTestGear(client,slot,position="chest",expected="arm_medium_chest_1",stamp) {
  for(let attempt=0;attempt<4;attempt++){
    await delay(850);
    const start=client.events.length;
    client.room.send("equip_gear",{position,slot,expected,...(stamp?{stamp}:{})});
    const reply=await until(()=>client.events.slice(start).find(e=>
      e.type==="command_rejected" || e.type==="item_use_failed" ||
      e.type==="inventory_state" && (e.data.equipment?.[position]??null)===(slot===null?null:expected)
    ),"server acknowledges "+position+" change");
    if(reply.type==="inventory_state")return reply.data;
    assert.equal(reply.data.reason,"equipment_cooldown");
  }
  throw Error("equipment cooldown did not clear");
}
// Seed only the offline test character created by this file, in its disposable account database.
function seedMaterials(prefix,name,pathId,inputs,level,copies={},rightRingRank){
  assert.match(prefix,/^[a-f0-9]{12}$/);
  const db=new DatabaseSync(path.join(folder,"economy.sqlite"));
  try{
    db.exec("BEGIN IMMEDIATE");
    const found=db.prepare("SELECT id,snapshot FROM characters WHERE id LIKE ?").all(prefix+"%");
    assert.equal(found.length,1);
    const {id,snapshot}=found[0], saved=JSON.parse(snapshot);
    assert.equal(saved.name,name);assert.equal(saved.build.path,pathId);
    const bag=JSON.parse(db.prepare("SELECT inventory FROM accounts WHERE id=?").get(id).inventory);
    for(const [itemId,quantity] of inputs){
      const index=bag.slots.findIndex(s=>s?.itemId===itemId),free=index>=0?index:bag.slots.indexOf(null);
      assert(free>=0);bag.slots[free]={itemId,quantity:quantity+(bag.slots[free]?.quantity||0)};
    }
    bag.forgeCopies={...bag.forgeCopies,...copies};
    if(rightRingRank!==undefined)bag.equipmentForges.rightRing.rank=rightRingRank;
    saved.inventory=bag;saved.level=level;saved.experience=0;saved.mana=20;
    db.prepare("UPDATE accounts SET inventory=? WHERE id=?").run(JSON.stringify(bag),id);
    db.prepare("UPDATE characters SET snapshot=? WHERE id=?").run(JSON.stringify(saved),id);
    db.exec("COMMIT");
  }finally{db.close();}
}
function prepareCapstone(prefix,recipe){
  assert(recipe.some(r=>r.item==="mat_ingot_7"&&r.qty===1));
  const inputs=recipe.filter(r=>r.item!=="mat_ingot_7").map(r=>[r.item,r.qty]);
  seedMaterials(prefix,"นักดาบฝึกหัด","phutthaisawan",[...inputs,["mat_raw_wood_7",2],["mat_raw_stone_7",2],["mat_metal_1",1],["card_rift_warden",1],["use_mana_7",1]],100,{wp_twins_10:1});
}
let active;
try{
  active=await join({characterSetup:{name:"นักดาบฝึกหัด",build:{path:"phutthaisawan",ancestry:"shrine"}}});
  const {room,bag,me,event}=active;
  assert(Object.keys(active.catalog).length>400);
  const endgame=active.catalog.wp_twins_10;assert.equal(endgame.level,100);
  assert.equal(endgame.forge.affixTierCap,3);
  assert(active.catalog.arm_heavy_chest_8.recommended.includes("mender"));
  assert.equal(active.catalog.wp_twins_2.huntTarget.id,"temple_forecourt_3");
  assert.equal(active.catalog.card_possessed.huntTarget.id,room.state.monster.id);
  assert.equal(active.catalog.mat_rift_star.huntTarget.mapId,"spirit_rift");
  assert.equal(active.catalog.mat_ingot_1.huntTarget,undefined);
  assert.match(active.catalog.wp_twins_2.dropHint,/ภูตทวารบาล/);
  assert.match(active.catalog.wp_wrap_2.dropHint,/พรายกอกก/);
  assert.equal(active.catalog.mat_ingot_1.dropHint,undefined);
  const guides=active.event("gear_guides",p=>p.path==="phutthaisawan");
  assert.equal(guides?.builds.length,2);
  assert.equal(guides.baseMana,120);assert.equal(guides.manaCap,320);
  assert.equal(guides.builds[0].slots.find(s=>s.position==="offHand").next,"arm_field_phutthaisawan_2");
  assert.equal(active.catalog.arm_field_phutthaisawan_2.path,"phutthaisawan");
  assert.deepEqual(bag.cardDrill,{gold:20,itemId:"mat_metal_1",quantity:1});
  assert.deepEqual(bag.slots.filter(Boolean).map(s=>s.itemId),["health_potion","wp_twins_1"]);
  assert.equal(bag.slots[bag.equippedWeaponSlot].bound,true);
  assert.equal(me().equippedWeaponId,"wp_twins_1");
  await until(()=>me().maxMana===120+active.catalog.wp_twins_1.stats.mana && me().maxMana>120,"starter swords expand the live skill mana pool");
  room.send("card_socket",{requestId:"test_drill_no_material",target:bag.equippedWeaponSlot,gear:"wp_twins_1",expected:"sealed",action:"drill",card:null});
  await until(()=>event("economy_error",e=>e.reason==="drill_missing_metal"),"new character needs ore before drilling");
  room.send("attack",{targetId:room.state.monster.id});
  const rewarded=await until(()=>event("inventory_state",b=>b.firstChestClaimed),"first monster drops chest",35000);
  const slot=rewarded.slots.findIndex(s=>s?.itemId==="arm_medium_chest_1");assert(slot>=0);
  await until(()=>me().level>1 || event("experience_gained"),"reward committed");
  await delay(250);
  const before={def:me().def,atk:me().atk};
  await setTestGear(active,slot);
  await until(()=>me().def===before.def+4&&me().atk===before.atk+2,"armor changes real stats");
  await setTestGear(active,null);
  await until(()=>me().def===before.def&&me().atk===before.atk,"unequip restores both stats");
  await setTestGear(active,slot);
  await until(()=>me().def===before.def+4,"re-equip");
  await room.leave(); active=null;await delay(400);
  active=await join({});
  assert.equal(active.bag.equipment.chest,"arm_medium_chest_1");
  assert.equal(active.bag.slots[slot],null);
  assert.equal(active.me().atk,before.atk+2);
  assert.equal(active.me().def,before.def+4);
  assert.equal(active.bag.slots.filter(s=>s?.itemId==="wp_twins_1").length,1);
  active.room.send("attack",{targetId:"possessed-1"});
  const prize=await until(()=>active.event("experience_gained",p=>p.personalDrop && p.personalDrop!=="bag_full"),"monster-specific personal loot",30000);
  assert.match(active.catalog[prize.personalDrop].dropHint,/ผีสิง/);
  assert(Number.isInteger(prize.dropQuantity) && prize.dropQuantity>0);
  const earned=await until(()=>active.event("inventory_state",p=>p.slots.some(s=>s?.itemId===prize.personalDrop)),"reward in bag");
  const prefix=active.me().characterId;
  await active.room.leave();active=null;await delay(400);
  active=await join({});
  assert(active.bag.slots.some(s=>s?.itemId===prize.personalDrop));
  assert.equal(active.bag.lootMisses??0,earned.lootMisses??0);
  await active.room.leave();active=null;await delay(400);
  prepareCapstone(prefix,endgame.recipe);active=await join({});
  assert.equal(active.me().level,100);
  const finalBuild=active.event("gear_guides",p=>p.level===100)?.builds[0];
  assert.equal(finalBuild?.slots.find(s=>s.position==="mainHand").id,"wp_twins_10");
  assert.equal(finalBuild.maxMana,320);
  assert(active.catalog.wp_twins_10.stats.atk>active.catalog.wp_twins_9.stats.atk);
  const r=active.room;
  r.send("refine_resource",{requestId:"capstone_refine_07",expected:"mat_raw_stone_7"});
  await until(()=>active.event("resource_result",v=>v.item==="mat_metal_7"),"refine ore for the kiln");
  for(const recipeId of ["mat_charcoal_7","mat_ingot_7"]){
    assert.equal(active.catalog[recipeId].station,"kiln");
    r.send("craft_weapon",{requestId:"capstone_kiln_"+recipeId,recipeId});
    await until(()=>active.event("craft_result",v=>v.itemId===recipeId&&v.spentGold===0),"fire "+recipeId);
  }
  r.send("craft_weapon",{requestId:"capstone_craft_001",recipeId:"wp_twins_10"});
  const craftBag=await until(()=>active.event("inventory_state",v=>v.slots.some(s=>s?.itemId==="wp_twins_10")),"craft capstone");
  const at=craftBag.slots.findIndex(s=>s?.itemId==="wp_twins_10"), crafted=craftBag.slots[at];assert(crafted.forge.affix);
  r.send("equip_weapon",{slot:at});await until(()=>active.me().equippedWeaponId==="wp_twins_10","equip capstone");
  assert.equal(active.me().maxMana,320);assert(active.me().mana<active.me().maxMana-50,"equipment cannot refill missing mana");
  const potionSlot=craftBag.slots.findIndex(s=>s?.itemId==="use_mana_7");
  r.send("use_item",{slot:potionSlot});
  await until(()=>active.event("item_used",e=>e.itemId==="use_mana_7"&&e.restoredMana>0&&e.healed===0),"drink mana brew");
  await delay(400);r.send("forge_weapon",{requestId:"capstone_forge_001",slot:at,stamp:crafted.forge.instanceId+"."+crafted.forge.revision,action:"enhance",copies:1});
  await until(()=>active.event("forge_result",v=>v.forge?.rank===1),"upgrade capstone");
  await delay(400);r.send("card_socket",{requestId:"capstone_drill_001",target:at,gear:"wp_twins_10",expected:"sealed",action:"drill",card:null});
  await until(()=>active.event("card_socket_result",v=>v.action==="drill"),"drill capstone");
  await delay(400);r.send("card_socket",{requestId:"capstone_card_0001",target:at,gear:"wp_twins_10",expected:"empty",action:"insert",card:"card_rift_warden"});
  await until(()=>active.event("card_socket_result",v=>v.socket==="card_rift_warden"),"boss card");
  await r.leave();active=null;await delay(400);active=await join({});
  assert.equal(active.bag.slots[at].forge.rank,1);assert.equal(active.bag.slots[at].socket,"card_rift_warden");
  assert.equal(active.bag.slots.some(s=>s?.itemId==="use_mana_7"),false);
  assert.equal(active.me().equippedWeaponId,"wp_twins_10");
  const output=active.catalog.wp_twins_10.salvage,old=active.bag.slots[at],card=old.socket;
  assert(output && old.bound && card==="card_rift_warden");
  const count=(bag,id)=>bag.slots.reduce((sum,s)=>sum+(s?.itemId===id?s.quantity:0),0);
  const beforeMaterial=count(active.bag,output.item),beforeCards=count(active.bag,card);
  const order={slot:at,gear:old.itemId,stamp:old.forge.instanceId+"."+old.forge.revision,bound:true,socket:card,requestId:"capstone_salvage_0001"};
  active.room.send("salvage_gear",order);
  await until(()=>active.event("economy_error",v=>v.reason==="item_equipped"),"equipped weapon cannot be salvaged");
  active.room.send("equip_weapon",{slot:null});await until(()=>!active.me().equippedWeaponId,"unequip for salvage");
  active.room.send("salvage_gear",order);
  const receipt=await until(()=>active.event("gear_salvaged"),"confirmed salvage receipt");
  assert.deepEqual(receipt,{gear:old.itemId,material:output.item,quantity:output.quantity,card});
  await active.room.leave();active=null;await delay(400);active=await join({});
  const retryStart=active.events.length;
  active.room.send("salvage_gear",order);
  assert.deepEqual(await until(()=>active.event("gear_salvaged"),"durable salvage retry"),receipt);
  const afterRetry=await until(()=>active.events.slice(retryStart).find(e=>e.type==="inventory_state")?.data,"bag after retry");
  for(const inventory of [active.bag,afterRetry]){
    assert.equal(count(inventory,old.itemId),0);
    assert.equal(count(inventory,output.item),beforeMaterial+output.quantity);
    assert.equal(count(inventory,card),beforeCards+1);
  }
  const tree=active.event("world_resources",v=>v.mapId==="ritual_village").nodes.find(n=>n.kind==="wood");
  active.room.send("move",{x:tree.x-1.5,z:tree.z});
  await until(()=>Math.hypot(active.me().x-tree.x,active.me().z-tree.z)<2.8,"walk to a village tree",15000);
  for(let i=0;i<2;i++){
    const start=active.events.length;
    active.room.send("harvest_resource",{node:tree.id,requestId:"test_resource_harvest_"+i});
    await until(()=>active.events.slice(start).some(e=>e.type==="resource_result"&&e.data.item==="mat_raw_wood_1"),"cut wood");
    if(i===0)await delay(1650);
  }
  active.room.send("refine_resource",{expected:"mat_raw_wood_1",requestId:"test_resource_refine_01"});
  await until(()=>active.event("resource_result",v=>v.action==="refine"&&v.item==="mat_wood_1"),"process wood");
  active.room.send("get_resource_atlas",{});
  await until(()=>active.event("resource_atlas",v=>v.some(z=>z.mapId==="ritual_village"&&z.wood===2)),"world harvest accounting");
  await active.room.leave();active=null;await delay(400);active=await join({});
  assert(active.bag.slots.some(s=>s?.itemId==="mat_wood_1"));
  assert.equal(active.event("world_resources",v=>v.mapId==="ritual_village").nodes.find(n=>n.id===tree.id).stock,2);
  active.room.send("move",{x:-4,z:-17});
  await until(()=>Math.hypot(active.me().x+4,active.me().z+17)<1.8,"walk to the forest gate",18000);
  active.room.send("warp",{portalId:"village_to_forest"});
  await until(()=>active.me().mapId==="forbidden_forest" && active.event("warp_complete",v=>v.mapId==="forbidden_forest"),"enter original forest",10000);
  active.room.send("move",{x:7,z:9.3});
  await until(()=>Math.hypot(active.me().x-7,active.me().z-7)<3.4,"walk beside the original east tree",15000);
  const start=active.events.length;
  active.room.send("harvest_resource",{node:"forbidden_forest/tree-east-1",requestId:"test_existing_tree_001"});
  await until(()=>active.events.slice(start).some(e=>e.type==="resource_result"&&e.data.item==="mat_raw_wood_1"),"cut original forest scenery");
  for(const [characterSlot,path,name,weapon] of [[2,"blade","เงาฝึกหัด","wp_shadow_1"],[3,"sentinel","ทวนฝึกหัด","wp_pike_1"]]){
    await active.room.leave();active=null;await delay(400);
    active=await join({characterSlot,characterSetup:{name,build:{path,ancestry:"shrine"}}});
    await until(()=>active.me().equippedWeaponId===weapon && active.me().maxMana===120+active.catalog[weapon].stats.mana,"starting gear for "+path);
    const builds=active.event("gear_guides",g=>g.path===path).builds;
    assert(builds.every(build=>build.slots.find(s=>s.position==="mainHand")?.id===weapon && build.maxMana>active.me().maxMana));
  }
  const ring="acc_ring_atk_1",ringDef=active.catalog[ring],prefix3=active.me().characterId;
  assert.equal(ringDef.copyLimit,2);
  await active.room.leave();active=null;await delay(400);
  seedMaterials(prefix3,"ทวนฝึกหัด","sentinel",[...ringDef.recipe.map(r=>[r.item,r.qty*3]),["mat_metal_1",1],["card_possessed",1]],1);
  active=await join({characterSlot:3});
  let pairBag;
  for(let n=1;n<=2;n++){
    active.room.send("craft_weapon",{recipeId:ring,requestId:"paired_ring_craft_0"+n});
    pairBag=await until(()=>active.event("inventory_state",v=>v.slots.filter(s=>s?.itemId===ring).length===n),"craft ring "+n);
  }
  const pair=pairBag.slots.filter(s=>s?.itemId===ring),stamps=pair.map(s=>s.forge.instanceId+"."+s.forge.revision);
  assert.notEqual(stamps[0],stamps[1]);
  active.room.send("craft_weapon",{recipeId:ring,requestId:"paired_ring_limit_03"});
  await until(()=>active.event("inventory_state",s=>s.forgeCopies?.[ring]===1),"third ring stored for enhancement");
  const firstSlot=pairBag.slots.indexOf(pair[0]);
  active.room.send("card_socket",{requestId:"paired_ring_drill_01",target:firstSlot,gear:ring,stamp:stamps[0],expected:"sealed",action:"drill",card:null});
  await until(()=>active.event("inventory_state",v=>v.slots[firstSlot]?.socket===null),"drill only the first ring");
  active.room.send("card_socket",{requestId:"paired_ring_insert_01",target:firstSlot,gear:ring,stamp:stamps[0],expected:"empty",action:"insert",card:"card_possessed"});
  await until(()=>active.event("inventory_state",v=>v.slots[firstSlot]?.socket==="card_possessed"),"install card in first ring");
  active.room.send("forge_weapon",{requestId:"paired_ring_forge_01",slot:firstSlot,stamp:stamps[0],action:"enhance",copies:1});
  const forged=await until(()=>active.event("inventory_state",v=>v.slots[firstSlot]?.forge?.rank===1),"enhance only the first ring");
  stamps[0]=forged.slots[firstSlot].forge.instanceId+"."+forged.slots[firstSlot].forge.revision;
  await setTestGear(active,firstSlot,"leftRing",ring,stamps[0]);
  await setTestGear(active,pairBag.slots.indexOf(pair[1]),"rightRing",ring,stamps[1]);
  const unequipped=await setTestGear(active,null,"leftRing",ring,stamps[0]);
  const swapped=await setTestGear(active,unequipped.slots.findIndex(s=>s?.forge?.instanceId===pair[0].forge.instanceId),"rightRing",ring,stamps[0]);
  await setTestGear(active,swapped.slots.findIndex(s=>s?.forge?.instanceId===pair[1].forge.instanceId),"leftRing",ring,stamps[1]);
  await active.room.leave();active=null;await delay(400);active=await join({characterSlot:3});
  assert.equal(active.bag.equipmentForges.rightRing.instanceId,pair[0].forge.instanceId);
  assert.equal(active.bag.equipmentForges.leftRing.instanceId,pair[1].forge.instanceId);
  assert.equal(active.bag.equipmentForges.rightRing.rank,1);assert.equal(active.bag.equipmentForges.leftRing.rank,0);
  assert.equal(active.bag.equipmentSockets.rightRing,"card_possessed");assert.equal(active.bag.equipmentSockets.leftRing,undefined);
  await active.room.leave();active=null;await delay(400);
  seedMaterials(prefix3,"ทวนฝึกหัด","sentinel",[],1,{[ring]:5,wp_pike_2:1},9);
  active=await join({characterSlot:3});
  const item=active.bag.equipmentForges.rightRing,stamp=item.instanceId+"."+item.revision;
  const riskOrder={requestId:"paired_ring_risky_10",slot:"rightRing",stamp,action:"enhance",copies:4};
  active.room.send("forge_weapon",riskOrder);
  await until(()=>active.event("economy_error",e=>e.reason==="forge_risk_unconfirmed"),"risk confirmation required");
  await delay(400);active.room.send("forge_weapon",{...riskOrder,acceptBreak:true});
  await until(()=>active.event("economy_error",e=>e.reason==="forge_downgrade_unconfirmed"),"downgrade confirmation required");
  await delay(400);active.room.send("forge_weapon",{...riskOrder,acceptBreak:true,acceptDowngrade:true});
  await until(()=>active.event("economy_error",e=>e.reason==="forge_remove_card"),"card protected");
  await delay(400);active.room.send("card_socket",{requestId:"paired_remove_card_10",target:"rightRing",gear:ring,stamp,action:"remove",expected:"card_possessed",card:null});
  await until(()=>active.event("card_socket_result",e=>e.action==="remove"),"recover card before risky forge");
  await delay(400);active.room.send("forge_weapon",{...riskOrder,acceptBreak:true,acceptDowngrade:true});
  const result=await until(()=>active.event("forge_result",e=>e.requestId===riskOrder.requestId),"resolve risky +10");
  assert.equal(result.chance,40);assert.equal([result.broken,result.downgraded,result.success].filter(Boolean).length,1);
  await active.room.leave();active=null;await delay(400);active=await join({characterSlot:3});
  assert.equal(active.bag.forgeCopies?.[ring],1);assert.equal(active.bag.equipmentForges.leftRing.rank,0);
  assert.equal(active.bag.equipmentForges.rightRing?.rank,result.broken?undefined:result.downgraded?8:10);
  assert.equal(active.bag.equipment.rightRing,result.broken?undefined:ring);
  assert(active.bag.slots.some(s=>s?.itemId==="card_possessed"));
  const replacement=result.broken?ring:"wp_pike_2";
  const claim={requestId:"claim_spare_after_risk",gear:replacement,expectedStock:1};
  active.room.send("claim_forge_copy",{...claim,expectedStock:2});
  await until(()=>active.event("economy_error",e=>e.reason==="forge_stock_changed"),"stale stock rejected");
  await delay(400);active.room.send("claim_forge_copy",claim);
  const claimed=await until(()=>active.event("forge_copy_claimed",e=>e.requestId===claim.requestId),"claim a spare +0 item");
  await active.room.leave();active=null;await delay(400);active=await join({characterSlot:3});
  active.room.send("claim_forge_copy",claim);
  assert.deepEqual(await until(()=>active.event("forge_copy_claimed"),"retry claim after reconnect"),claimed);
  const copies=active.bag.slots.filter(s=>s?.forge?.instanceId===claimed.instanceId);
  assert.equal(copies.length,1);assert.equal(copies[0].itemId,replacement);assert(copies[0].bound);
  assert.equal(copies[0].forge.rank,0);assert.equal(copies[0].forge.affix,null);assert.equal(active.bag.forgeCopies?.[replacement]??0,0);
  console.log("PERSONAL GEAR PASS: risky +10, protected card, independently worn rings and one bound spare after reconnect.");
}finally{if(active)await active.room.leave();}
