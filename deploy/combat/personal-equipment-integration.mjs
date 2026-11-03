import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
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
  const bag=await until(()=>event("inventory_state",p=>p.personalItems),"catalog and bag");
  return {room,me,bag,event};
}
let active;
try{
  active=await join({characterSetup:{name:"นักดาบฝึกหัด",build:{path:"phutthaisawan",ancestry:"shrine"}}});
  const {room,bag,me,event}=active;
  assert.equal(Object.keys(bag.personalItems).length,60);
  assert.deepEqual(bag.slots.filter(Boolean).map(s=>s.itemId),["health_potion","wp_twins_1"]);
  assert.equal(bag.slots[bag.equippedWeaponSlot].bound,true);
  assert.equal(me().equippedWeaponId,"wp_twins_1");
  room.send("attack",{targetId:room.state.monster.id});
  const rewarded=await until(()=>event("inventory_state",b=>b.firstChestClaimed),"first monster drops chest",35000);
  const slot=rewarded.slots.findIndex(s=>s?.itemId==="arm_medium_chest_1");assert(slot>=0);
  await until(()=>me().level>1 || event("experience_gained"),"reward committed");
  await delay(250);
  const before={def:me().def,atk:me().atk};
  room.send("equip_gear",{position:"chest",slot,expected:"arm_medium_chest_1"});
  await until(()=>me().def===before.def+4&&me().atk===before.atk+2,"armor changes real stats");
  await delay(800);room.send("equip_gear",{position:"chest",slot:null,expected:"arm_medium_chest_1"});
  await until(()=>me().def===before.def&&me().atk===before.atk,"unequip restores both stats");
  await delay(800);room.send("equip_gear",{position:"chest",slot,expected:"arm_medium_chest_1"});
  await until(()=>me().def===before.def+4,"re-equip");
  await room.leave(); active=null;await delay(400);
  active=await join({});
  assert.equal(active.bag.equipment.chest,"arm_medium_chest_1");
  assert.equal(active.bag.slots[slot],null);
  assert.equal(active.me().atk,before.atk+2);
  assert.equal(active.me().def,before.def+4);
  assert.equal(active.bag.slots.filter(s=>s?.itemId==="wp_twins_1").length,1);
  console.log("PERSONAL GEAR PASS: fresh account, ordinary monster drop, equip/unequip, real stats, reconnect.");
}finally{if(active)await active.room.leave();}
