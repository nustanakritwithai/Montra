
import assert from "node:assert/strict";
import {createHash,randomBytes} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {Client} from "@colyseus/sdk";
const url=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(url||"")||!dir||!path.basename(dir).startsWith("montra-buff-test-"))throw Error("requires isolated localhost");
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(read,label,timeout=10000){const end=Date.now()+timeout;while(Date.now()<end){const value=read();if(value)return value;await sleep(30);}throw Error("timeout "+label);}
const common=["footwork","guard","sweep","rhythm"];
const schools={phutthaisawan:["twin_cut","circle_step","twin_finale"],sritrairat:["measure","riposte","seize"],atamat:["circle_guard","opening_cut","turning_counter"],chumphon:["naval_guard","protect_ally","guardian_sweep"]};
async function open(school){
  const token="mt1_"+randomBytes(32).toString("hex"),id=createHash("sha256").update(token).digest("hex");
  await writeFile(path.join(dir,id+".json"),JSON.stringify({version:1,id,name:"นักดาบทดลอง",level:20,experience:0,pkKills:0,pkDeaths:0,x:-33,y:0,z:-20,hp:500,mapId:"forbidden_forest",
    build:{path:"phutthaisawan",ancestry:"woodland"},swordTree:{school,learned:[...common,...schools[school]],cooldowns:{},training:{strikes:100,blocks:20,finishes:20}},updatedAt:new Date().toISOString()}),{flag:"wx"});
  const room=await new Client(url).create("my_room",{guestToken:token,worldVersion:1,templeVersion:1,atlasVersion:1});
  const events=[];room.onMessage("*",(type,data)=>events.push({type,data,at:Date.now()}));
  const me=()=>room.state?.players?.get(room.sessionId),tree=()=>JSON.parse(me().swordTreeData);
  const has=(type,test)=>events.some(e=>e.type===type && test(e.data));
  await until(()=>me()?.persistent && room.state.monsters?.has("forest_west_1"),"join forest");
  room.send("equip_weapon",{slot:2});
  await until(()=>me().equippedWeaponId==="arcane_sword","equip");
  return {room,events,me,tree,has,target:"forest_west_1"};
}
let a;
try {
  a=await open("phutthaisawan");
  a.room.send("sword_skill",{skillId:"footwork",targetId:a.target,damage:999999});
  await until(()=>a.has("command_rejected",e=>e.reason==="invalid_sword_skill"),"reject forged damage");
  await sleep(550);
  a.room.send("attack",{targetId:a.target});
  await until(()=>a.events.filter(e=>e.type==="combat_hit"&&e.data.attackerId===a.room.sessionId).length>=3,"basic combo");
  a.room.send("move",{x:a.me().x,z:a.me().z});
  a.room.send("sword_skill",{skillId:"twin_finale",targetId:a.target});
  await until(()=>a.has("sword_skill_used",e=>e.skillId==="twin_finale"),"combo finisher");
  assert.ok(a.events.filter(e=>e.type==="combat_hit"&&e.data.source==="sword").length>=1);
  assert.ok(a.tree().cooldowns.twin_finale>Date.now());
  a.room.send("sword_skill",{skillId:"measure"});
  await until(()=>a.has("command_rejected",e=>e.reason==="sword_skill_locked"),"other school locked");
  await a.room.leave();a=null;

  a=await open("phutthaisawan");
  for (const skillId of ["footwork","twin_cut","circle_step","sweep"]) {
    a.room.send("sword_skill",{skillId,targetId:a.target});
    await until(()=>a.has("sword_skill_used",e=>e.skillId===skillId),"use "+skillId);
    await sleep(350);
  }
  assert.ok(a.events.filter(e=>e.type==="combat_hit"&&e.data.source==="sword").length>=5);
  await a.room.leave();a=null;

  a=await open("sritrairat");
  a.room.send("attack",{targetId:a.target});
  await until(()=>a.has("monster_hit",e=>e.targetId===a.room.sessionId),"first monster hit");
  await sleep(500);
  a.room.send("sword_skill",{skillId:"measure"});
  await until(()=>a.has("sword_guarded",()=>true),"measured guard",5000);
  a.room.send("move",{x:a.me().x,z:a.me().z});
  a.room.send("sword_skill",{skillId:"riposte",targetId:a.target});
  await until(()=>a.has("sword_skill_used",e=>e.skillId==="riposte"),"riposte");
  assert.ok(a.events.some(e=>e.type==="combat_hit"&&e.data.source==="sword"));
  const previousHits=a.events.filter(e=>e.type==="monster_hit").length;
  await until(()=>a.events.filter(e=>e.type==="monster_hit").length>previousHits,"monster re-engages",7000);
  await sleep(500);
  a.room.send("sword_skill",{skillId:"guard"});
  await until(()=>a.events.filter(e=>e.type==="sword_guarded").length>=2,"second guard",7000);
  a.room.send("sword_skill",{skillId:"seize",targetId:a.target});
  await until(()=>a.has("sword_skill_used",e=>e.skillId==="seize"),"seize");
  await a.room.leave();a=null;

  a=await open("atamat");
  a.room.send("attack",{targetId:a.target});
  await until(()=>a.has("monster_hit",e=>e.targetId===a.room.sessionId),"atamat monster hit");
  await sleep(500);
  a.room.send("sword_skill",{skillId:"circle_guard"});
  await until(()=>a.has("sword_guarded",()=>true),"circular guard",5000);
  a.room.send("sword_skill",{skillId:"turning_counter",targetId:a.target});
  await until(()=>a.has("sword_skill_used",e=>e.skillId==="turning_counter"),"circular counter");
  a.room.send("sword_skill",{skillId:"opening_cut",targetId:a.target});
  await until(()=>a.has("sword_skill_used",e=>e.skillId==="opening_cut"),"area cut");
  assert.ok(a.events.some(e=>e.type==="combat_hit"&&e.data.source==="sword"));
  await a.room.leave();a=null;
  a=await open("chumphon");
  a.room.send("attack",{targetId:a.target});
  await until(()=>a.has("monster_hit",e=>e.targetId===a.room.sessionId),"chumphon monster hit");
  await sleep(500);
  a.room.send("sword_skill",{skillId:"naval_guard"});
  await until(()=>a.has("sword_skill_used",e=>e.skillId==="naval_guard"),"chumphon guard");
  a.room.send("sword_skill",{skillId:"guardian_sweep",targetId:a.target});
  await until(()=>a.has("sword_skill_used",e=>e.skillId==="guardian_sweep"),"chumphon sweep");
  console.log("PASS: all offensive skill types, school restriction, defensive counters and area skills");
} catch(error) {
  if(a)console.error("recent events",JSON.stringify(a.events.slice(-12)), "me",JSON.stringify(a.me()), "target",JSON.stringify(a.room.state.monsters.get(a.target)));
  throw error;
} finally {if(a)await a.room.leave().catch(()=>{});
}
