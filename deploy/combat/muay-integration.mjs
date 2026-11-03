import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {createHash,randomBytes} from "node:crypto";
import path from "node:path";
import {Client} from "@colyseus/sdk";

const url=process.env.MONTRA_TEST_URL, directory=process.env.MONTRA_CHARACTER_DIR;
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(url||"") || new URL(url).port==="4108" ||
    !directory || !path.basename(directory).startsWith("montra-buff-test-")) throw Error("requires isolated localhost and temporary data");
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label,timeout=12000) { const end=Date.now()+timeout; while(Date.now()<end) { const result=fn(); if(result)return result; await sleep(35); } throw Error("timeout: "+label); }
const token="mt1_"+randomBytes(32).toString("hex"), client=new Client(url);
const options={guestToken:token,characterSlot:1,worldVersion:1,templeVersion:1,atlasVersion:1,provinceVersion:1};
// Start with an empty fifth-level save so all three training points are earned but unspent.
const id=createHash("sha256").update(token).digest("hex");
await writeFile(path.join(directory,id+".json"),JSON.stringify({version:1,id,name:"นักมวยทดลอง",level:5,experience:0,pkKills:0,pkDeaths:0,x:0,y:0,z:0,hp:250,mapId:"ritual_village",updatedAt:new Date().toISOString()}),{flag:"wx"});
let room=await client.create("my_room",options);
try {
  let events=[];
  function watch(){events=[];room.onMessage("*",(type,data)=>events.push({type,data}));}
  watch();
  const me=()=>room.state?.players?.get(room.sessionId);
  const seen=(type,predicate=()=>true)=>events.find(e=>e.type===type && predicate(e.data));
  await until(()=>me()?.persistent,"join");
  assert.ok(JSON.parse(room.state.buildCatalog).paths.muay_boran);
  room.send("select_build",{path:"muay_boran",ancestry:"woodland"});
  await until(()=>me().pathId==="muay_boran" && me().equippedWeaponId==="muay_wraps","class and wraps");
  const inventory=await until(()=>seen("inventory_state",data=>data.slots?.some(item=>item?.itemId==="muay_wraps"))?.data,"wrap grant");
  assert.equal(inventory.slots.filter(item=>item?.itemId==="muay_wraps").length,1);
  await sleep(550);
  room.send("select_build",{path:"blade",ancestry:"woodland"});
  await until(()=>me().pathId==="blade","switch away");
  await sleep(550);
  room.send("select_build",{path:"muay_boran",ancestry:"woodland"});
  await until(()=>me().pathId==="muay_boran","switch back");
  events=[]; room.send("get_inventory",{});
  const switched=await until(()=>seen("inventory_state")?.data,"inventory after switch");
  assert.equal(switched.slots.filter(item=>item?.itemId==="muay_wraps").length,1);
  const book=()=>JSON.parse(me().muayBookData);
  assert.deepEqual(book().slots,[null,null,null,null]);
  room.send("muay_skill",{skillId:"guard"});await until(()=>seen("command_rejected",e=>e.reason==="muay_skill_locked"),"unlearned guard");
  for(const [slot,skillId] of ["guard","step","counter"].entries()){
    await sleep(1200);room.send("muay_book",{action:"learn",skillId});await until(()=>book().learned.includes(skillId),"learn "+skillId);
    await sleep(1200);room.send("muay_book",{action:"equip",slot,skillId});await until(()=>book().slots[slot]===skillId,"equip "+skillId);
  }
  await sleep(600);room.send("muay_skill",{skillId:"guard"});
  await until(()=>seen("command_rejected",e=>e.reason==="muay_safe_area"),"safe area");
  room.send("move",{x:1,z:7.5});
  await until(()=>Math.hypot(me().x,me().z)>6.4,"leave shrine");
  await sleep(500);
  room.send("muay_skill",{skillId:"counter",targetId:"possessed-1"});
  await until(()=>seen("command_rejected",e=>e.reason==="muay_counter_required"),"counter requires guard");
  await sleep(500);
  room.send("muay_skill",{skillId:"step",targetId:"possessed-1"});
  await until(()=>seen("combat_hit",e=>e.source==="muay" && e.attackerId===room.sessionId),"step strike");
  assert.ok(JSON.parse(me().muayData).step>Date.now());
  await until(()=>JSON.parse(me().muayBookData).training.strikes>=1,"strike training recorded");
  await sleep(500);
  room.send("muay_skill",{skillId:"step",targetId:"possessed-1"});
  await until(()=>seen("command_rejected",e=>e.reason==="muay_cooldown"),"cooldown");
  room.send("attack",{targetId:"possessed-1"});
  await until(()=>seen("monster_hit",e=>e.targetId===room.sessionId),"monster engages");
  // Stop auto-attacking so the target survives while the next hit is timed.
  room.send("move",{x:me().x,z:me().z});
  await sleep(700);
  room.send("muay_skill",{skillId:"guard"});
  await until(()=>seen("muay_guarded"),"successful guard",6000);
  await until(()=>JSON.parse(me().muayBookData).training.blocks>=1,"guard training recorded");
  room.send("muay_skill",{skillId:"counter",targetId:"possessed-1"});
  await until(()=>seen("muay_skill_used",e=>e.playerId===room.sessionId && e.skillId==="counter"),"counter hit");
  const savedCooldowns=JSON.parse(me().muayData);
  await room.leave(); await sleep(500);
  room=await client.create("my_room",options); watch();
  await until(()=>me()?.persistent,"rejoin");
  assert.equal(me().pathId,"muay_boran");
  assert.equal(me().equippedWeaponId,"muay_wraps");
  assert.deepEqual(JSON.parse(me().muayData),savedCooldowns);
  room.send("get_inventory",{});
  const restored=await until(()=>seen("inventory_state")?.data,"inventory restored");
  assert.equal(restored.slots.filter(item=>item?.itemId==="muay_wraps").length,1);
  console.log("PASS: Muay class, one-time wraps, safe zone, movement, guard, counter, cooldown and persistence");
} finally { await room.leave().catch(()=>{}); }
