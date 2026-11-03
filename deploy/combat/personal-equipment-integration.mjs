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
async function setTestChest(client,slot) {
  const expected="arm_medium_chest_1";
  for(let attempt=0;attempt<4;attempt++){
    await delay(850);
    const start=client.events.length;
    client.room.send("equip_gear",{position:"chest",slot,expected});
    const reply=await until(()=>client.events.slice(start).find(e=>
      e.type==="command_rejected" || e.type==="item_use_failed" ||
      e.type==="inventory_state" && (e.data.equipment?.chest??null)===(slot===null?null:expected)
    ),"server acknowledges chest change");
    if(reply.type==="inventory_state")return;
    assert.equal(reply.data.reason,"equipment_cooldown");
  }
  throw Error("chest equip cooldown did not clear");
}
// Seed only the offline test character created by this file, in its disposable account database.
function prepareCapstone(prefix,recipe){
  assert.match(prefix,/^[a-f0-9]{12}$/);
  const db=new DatabaseSync(path.join(folder,"economy.sqlite"));
  try{
    db.exec("BEGIN IMMEDIATE");
    const found=db.prepare("SELECT id,snapshot FROM characters WHERE id LIKE ?").all(prefix+"%");
    assert.equal(found.length,1);
    const {id,snapshot}=found[0], saved=JSON.parse(snapshot);
    assert.equal(saved.name,"นักดาบฝึกหัด");assert.equal(saved.build.path,"phutthaisawan");
    const bag=JSON.parse(db.prepare("SELECT inventory FROM accounts WHERE id=?").get(id).inventory);
    for(const [itemId,quantity] of [...recipe.map(r=>[r.item,r.qty]),["ref_flux_7",1],["mat_metal_1",1],["card_rift_warden",1]]){
      const index=bag.slots.findIndex(s=>s?.itemId===itemId),free=index>=0?index:bag.slots.indexOf(null);
      assert(free>=0);bag.slots[free]={itemId,quantity:quantity+(bag.slots[free]?.quantity||0)};
    }
    saved.inventory=bag;saved.level=100;saved.experience=0;saved.mana=20;
    db.prepare("UPDATE accounts SET inventory=? WHERE id=?").run(JSON.stringify(bag),id);
    db.prepare("UPDATE characters SET snapshot=? WHERE id=?").run(JSON.stringify(saved),id);
    db.exec("COMMIT");
  }finally{db.close();}
}
let active;
try{
  active=await join({characterSetup:{name:"นักดาบฝึกหัด",build:{path:"phutthaisawan",ancestry:"shrine"}}});
  const {room,bag,me,event}=active;
  assert(Object.keys(active.catalog).length>400);
  const endgame=active.catalog.wp_twins_10;assert.equal(endgame.level,100);
  assert.equal(active.event("gear_guides",p=>p.path==="phutthaisawan")?.builds.length,2);
  assert.deepEqual(bag.cardDrill,{gold:20,itemId:"mat_metal_1",quantity:1});
  assert.deepEqual(bag.slots.filter(Boolean).map(s=>s.itemId),["health_potion","wp_twins_1"]);
  assert.equal(bag.slots[bag.equippedWeaponSlot].bound,true);
  assert.equal(me().equippedWeaponId,"wp_twins_1");
  room.send("card_socket",{requestId:"test_drill_no_material",target:bag.equippedWeaponSlot,gear:"wp_twins_1",expected:"sealed",action:"drill",card:null});
  await until(()=>event("economy_error",e=>e.reason==="drill_missing_metal"),"new character needs ore before drilling");
  room.send("attack",{targetId:room.state.monster.id});
  const rewarded=await until(()=>event("inventory_state",b=>b.firstChestClaimed),"first monster drops chest",35000);
  const slot=rewarded.slots.findIndex(s=>s?.itemId==="arm_medium_chest_1");assert(slot>=0);
  await until(()=>me().level>1 || event("experience_gained"),"reward committed");
  await delay(250);
  const before={def:me().def,atk:me().atk};
  await setTestChest(active,slot);
  await until(()=>me().def===before.def+4&&me().atk===before.atk+2,"armor changes real stats");
  await setTestChest(active,null);
  await until(()=>me().def===before.def&&me().atk===before.atk,"unequip restores both stats");
  await setTestChest(active,slot);
  await until(()=>me().def===before.def+4,"re-equip");
  await room.leave(); active=null;await delay(400);
  active=await join({});
  assert.equal(active.bag.equipment.chest,"arm_medium_chest_1");
  assert.equal(active.bag.slots[slot],null);
  assert.equal(active.me().atk,before.atk+2);
  assert.equal(active.me().def,before.def+4);
  assert.equal(active.bag.slots.filter(s=>s?.itemId==="wp_twins_1").length,1);
  const prefix=active.me().characterId;
  await active.room.leave();active=null;await delay(400);
  prepareCapstone(prefix,endgame.recipe);active=await join({});
  assert.equal(active.me().level,100);
  assert.equal(active.event("gear_guides",p=>p.level===100)?.builds[0].slots.find(s=>s.position==="mainHand").id,"wp_twins_10");
  const r=active.room;
  r.send("craft_weapon",{requestId:"capstone_craft_001",recipeId:"wp_twins_10"});
  const craftBag=await until(()=>active.event("inventory_state",v=>v.slots.some(s=>s?.itemId==="wp_twins_10")),"craft capstone");
  const at=craftBag.slots.findIndex(s=>s?.itemId==="wp_twins_10"), crafted=craftBag.slots[at];assert(crafted.forge.affix);
  r.send("equip_weapon",{slot:at});await until(()=>active.me().equippedWeaponId==="wp_twins_10","equip capstone");
  assert.equal(active.me().maxMana,320);assert(active.me().mana<active.me().maxMana-50,"equipment cannot refill missing mana");
  await delay(400);r.send("forge_weapon",{requestId:"capstone_forge_001",slot:at,stamp:crafted.forge.instanceId+"."+crafted.forge.revision,action:"enhance"});
  await until(()=>active.event("forge_result",v=>v.forge?.rank===1),"upgrade capstone");
  await delay(400);r.send("card_socket",{requestId:"capstone_drill_001",target:at,gear:"wp_twins_10",expected:"sealed",action:"drill",card:null});
  await until(()=>active.event("card_socket_result",v=>v.action==="drill"),"drill capstone");
  await delay(400);r.send("card_socket",{requestId:"capstone_card_0001",target:at,gear:"wp_twins_10",expected:"empty",action:"insert",card:"card_rift_warden"});
  await until(()=>active.event("card_socket_result",v=>v.socket==="card_rift_warden"),"boss card");
  await r.leave();active=null;await delay(400);active=await join({});
  assert.equal(active.bag.slots[at].forge.rank,1);assert.equal(active.bag.slots[at].socket,"card_rift_warden");
  assert.equal(active.me().equippedWeaponId,"wp_twins_10");
  console.log("PERSONAL GEAR PASS: fresh starter, hunt, Lv.100 crafting, rolled affix, enhancement, boss card, reconnect.");
}finally{if(active)await active.room.leave();}
