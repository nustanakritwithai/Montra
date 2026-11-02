
import assert from "node:assert/strict";
import {createHash, randomBytes} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {Client} from "@colyseus/sdk";
const url=process.env.MONTRA_TEST_URL, dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(url||"") || !dir || !path.basename(dir).startsWith("montra-buff-test-")) throw Error("requires isolated localhost");
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(read,label,timeout=12000){const end=Date.now()+timeout;while(Date.now()<end){const value=read();if(value)return value;await sleep(30);}throw Error("timeout "+label);}
const token="mt1_"+randomBytes(32).toString("hex"), id=createHash("sha256").update(token).digest("hex");
await writeFile(path.join(dir,id+".json"),JSON.stringify({
  version:1,id,name:"ครูดาบทดลอง",level:20,experience:0,pkKills:0,pkDeaths:0,x:0,y:0,z:0,hp:500,mapId:"ritual_village",
  build:{path:"phutthaisawan",ancestry:"woodland"},
  swordTree:{school:"phutthaisawan",learned:["footwork","guard"],cooldowns:{},training:{strikes:9,blocks:2,finishes:2}},
  updatedAt:new Date().toISOString()
}),{flag:"wx"});
const client=new Client(url), opts={guestToken:token,worldVersion:1,templeVersion:1,atlasVersion:1};
let room=await client.create("my_room",opts);
try {
  const events=[];
  room.onMessage("*",(type,data)=>events.push({type,data,at:Date.now()}));
  const me=()=>room.state?.players?.get(room.sessionId);
  const tree=()=>JSON.parse(me().swordTreeData);
  const event=(type,test)=>events.find(entry=>entry.type===type && test(entry.data))?.data;
  await until(()=>me()?.persistent && room.state.swordTreeCatalog,"loaded");
  assert.equal(Object.keys(JSON.parse(room.state.swordTreeCatalog).schools).length,4);
  room.send("sword_tree_learn",{skillId:"twin_finale"});
  await until(()=>event("command_rejected",e=>e.reason==="sword_tree_prerequisite"),"prerequisite");
  await sleep(550);
  room.send("sword_tree_school",{school:"sritrairat"});
  await until(()=>event("command_rejected",e=>e.reason==="sword_trial_incomplete"),"master trial");
  await sleep(550);
  room.send("sword_tree_learn",{skillId:"sweep"});
  await until(()=>event("command_rejected",e=>e.reason==="sword_trial_incomplete"),"training requirement");
  room.send("equip_weapon",{slot:2});
  await until(()=>me().equippedWeaponId==="arcane_sword","sword equipped");
  room.send("move",{x:1,z:7.5});
  await until(()=>Math.hypot(me().x,me().z)>6.4,"leave rest area");
  room.send("attack",{targetId:"possessed-1"});
  await until(()=>tree().training.strikes>=10,"training on attack");
  await until(()=>event("monster_hit",e=>e.targetId===room.sessionId),"monster hit");
  await sleep(450);
  room.send("sword_skill",{skillId:"guard"});
  await until(()=>event("sword_guarded",()=>true),"guard succeeds",5000);
  await until(()=>tree().training.blocks>=3,"guard training");
  const hp=me().hp;
  assert.ok(hp>0);
  room.send("move",{x:0,z:0});
  await until(()=>Math.hypot(me().x,me().z)<5,"back to shrine");
  await sleep(5500);
  room.send("sword_tree_learn",{skillId:"sweep"});
  await until(()=>tree().learned.includes("sweep"),"sweep learned");
  room.send("sword_tree_equip",{skillId:"sweep",slot:0});
  await until(()=>tree().loadouts.phutthaisawan[0]==="sweep","assign shortcut");
  await sleep(450);
  room.send("sword_tree_learn",{skillId:"rhythm"});
  await until(()=>tree().learned.includes("rhythm"),"rhythm learned");
  await sleep(700);
  room.send("sword_tree_school",{school:"sritrairat"});
  await until(()=>tree().school==="sritrairat","switch school");
  room.send("sword_tree_learn",{skillId:"measure"});
  await until(()=>tree().learned.includes("measure"),"new school skill");
  room.send("sword_tree_equip",{skillId:"measure",slot:1});
  await until(()=>tree().loadouts.sritrairat[1]==="measure","school shortcut");
  assert.equal(tree().loadouts.phutthaisawan[0],"sweep");
  await sleep(450);
  room.send("sword_tree_school",{school:"atamat"});
  await until(()=>tree().school==="atamat","second school");
  await sleep(700);
  room.send("sword_tree_learn",{skillId:"circle_guard"});
  await until(()=>tree().learned.includes("circle_guard"),"atamat skill");
  await sleep(1100);
  room.send("sword_tree_school",{school:"chumphon"});
  await until(()=>tree().school==="chumphon","third school switch");
  await sleep(550);
  room.send("sword_tree_learn",{skillId:"naval_guard"});
  await until(()=>tree().learned.includes("naval_guard"),"chumphon skill");
  const saved=tree();
  await room.leave();await sleep(500);
  room=await client.create("my_room",opts);
  await until(()=>room.state?.players?.get(room.sessionId)?.persistent,"rejoin");
  const load=()=>JSON.parse(room.state.players.get(room.sessionId).swordTreeData);
  assert.deepEqual(load(),saved);
  room.send("sword_tree_reset",{});
  await until(()=>load().learned.length===0,"reset learned skills");
  assert.deepEqual(load().training,saved.training);
  assert.deepEqual(load().cooldowns,saved.cooldowns);
  assert.ok(Object.values(load().loadouts).every(slots=>slots.every(slot=>slot===null)));
  assert.equal(load().school,saved.school);
  room.send("sword_tree_learn",{skillId:"footwork"});
  await until(()=>load().learned.includes("footwork"),"relearn after reset");
  console.log("PASS: trial gating, training, guard, four schools, shortcuts, persistence and reset");
} finally {await room.leave().catch(()=>{});}
