
import assert from "node:assert/strict";
import {createHash,randomBytes} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {Client} from "@colyseus/sdk";
const url=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(url||"")||!dir||!path.basename(dir).startsWith("montra-buff-test-"))throw Error("requires isolated localhost");
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(read,label,timeout=8000){const end=Date.now()+timeout;while(Date.now()<end){const v=read();if(v)return v;await sleep(30);}throw Error("timeout "+label);}
const token=()=>"mt1_"+randomBytes(32).toString("hex"), owner=token(),friend=token(),id=createHash("sha256").update(owner).digest("hex");
await writeFile(path.join(dir,id+".json"),JSON.stringify({version:1,id,name:"ผู้คุ้มครอง",level:25,experience:0,pkKills:0,pkDeaths:0,x:0,y:0,z:0,hp:500,mapId:"ritual_village",
  build:{path:"phutthaisawan",ancestry:"woodland"},swordTree:{school:"chumphon",learned:["footwork","guard","naval_guard","protect_ally"],cooldowns:{},training:{strikes:30,blocks:5,finishes:5}},updatedAt:new Date().toISOString()}),{flag:"wx"});
const client=new Client(url),opts=guestToken=>({guestToken,worldVersion:1,templeVersion:1,atlasVersion:1}), rooms=[];
try {
  const a=await client.create("my_room",opts(owner));rooms.push(a);
  const b=await client.joinById(a.roomId,opts(friend));rooms.push(b);
  const ev=[];a.onMessage("*",(type,data)=>ev.push({type,data}));
  const invitations=[];b.onMessage("party_invitation",data=>invitations.push(data));b.onMessage("*",()=>{});
  const me=()=>a.state?.players?.get(a.sessionId),ally=()=>a.state?.players?.get(b.sessionId);
  await until(()=>me()?.persistent&&ally()?.persistent,"both joined");
  a.send("equip_weapon",{slot:2});
  await until(()=>me().equippedWeaponId==="arcane_sword","equip");
  a.send("party_invite",{targetId:b.sessionId});
  const invitation=await until(()=>invitations.at(-1),"invitation");
  b.send("party_accept",{inviteId:invitation.inviteId});
  await until(()=>ev.some(e=>e.type==="party_state"&&e.data.members.length===2),"party formed");
  const baseA=me().def,baseB=ally().def;
  a.send("sword_skill",{skillId:"protect_ally"});
  await until(()=>me().def===Math.round(baseA*1.1)&&ally().def===Math.round(baseB*1.1),"party defense bonus");
  assert.ok(JSON.parse(me().swordTreeData).cooldowns.protect_ally>Date.now());
  a.send("sword_skill",{skillId:"protect_ally"});
  await until(()=>ev.some(e=>e.type==="command_rejected"&&e.data.reason==="sword_skill_cooldown"),"cooldown");
  await until(()=>me().def===baseA&&ally().def===baseB,"buff expires",20000);
  console.log("PASS: fourth school party defense, server cooldown and expiry");
} finally {for(const room of rooms.reverse())await room.leave().catch(()=>{});}
