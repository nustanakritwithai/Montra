
import assert from "node:assert/strict";
import {createHash,randomBytes} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {Client} from "@colyseus/sdk";
const url=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(url||"")||!dir||!path.basename(dir).startsWith("montra-buff-test-"))throw Error("requires isolated localhost");
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(read,label,timeout=10000){const end=Date.now()+timeout;while(Date.now()<end){const value=read();if(value)return value;await sleep(30);}throw Error("timeout "+label);}
const token=()=>"mt1_"+randomBytes(32).toString("hex"), defender=token(),attacker=token();
async function seed(t,name,x,z,build,tree,level){
  const id=createHash("sha256").update(t).digest("hex");
  await writeFile(path.join(dir,id+".json"),JSON.stringify({version:1,id,name,level,experience:0,pkKills:0,pkDeaths:0,x,y:0,z,hp:500,mapId:"ritual_village",build,swordTree:tree,updatedAt:new Date().toISOString()}),{flag:"wx"});
}
await seed(defender,"ผู้ตั้งรับ",-10,9.5,{path:"phutthaisawan",ancestry:"woodland"},
  {school:"sritrairat",learned:["footwork","guard","measure","riposte"],cooldowns:{},training:{strikes:10,blocks:1,finishes:0}},20);
await seed(attacker,"ผู้ฝึกโจมตี",-10,8,undefined,undefined,1);
const client=new Client(url),opts=guestToken=>({guestToken,worldVersion:1,templeVersion:1,atlasVersion:1}),rooms=[];
try {
  const d=await client.create("my_room",opts(defender));rooms.push(d);
  const a=await client.joinById(d.roomId,opts(attacker));rooms.push(a);
  const events=[],aEvents=[];
  d.onMessage("*",(type,data)=>events.push({type,data}));
  a.onMessage("*",(type,data)=>aEvents.push({type,data}));
  const me=()=>d.state?.players?.get(d.sessionId), enemy=()=>d.state?.players?.get(a.sessionId);
  await until(()=>me()?.persistent&&enemy()?.persistent,"both joined");
  d.send("equip_weapon",{slot:2});
  await until(()=>me().equippedWeaponId==="arcane_sword","equip");
  const def=me().def,level=me().level,base=Math.max(1,Math.round(24*(100*(1+(level-1)/15))/(100*(1+(level-1)/15)+def)));
  d.send("sword_skill",{skillId:"measure"});
  await until(()=>events.some(e=>e.type==="sword_skill_used"&&e.data.skillId==="measure"),"guard");
  a.send("attack",{targetId:d.sessionId});
  const hit=await until(()=>events.find(e=>e.type==="pvp_hit"&&e.data.targetId===d.sessionId)?.data,"pvp hit");
  assert.equal(hit.damage,Math.max(1,Math.round(base*0.35)));
  await until(()=>events.some(e=>e.type==="sword_guarded"),"counter opened");
  a.send("move",{x:enemy().x,z:enemy().z});
  a.send("party_invite",{targetId:d.sessionId});
  const invitation=await until(()=>events.find(e=>e.type==="party_invitation")?.data,"invite");
  d.send("party_accept",{inviteId:invitation.inviteId});
  await until(()=>aEvents.some(e=>e.type==="party_state"&&e.data.members.length===2),"party");
  const before=enemy().hp;
  d.send("sword_skill",{skillId:"riposte",targetId:a.sessionId});
  await until(()=>events.some(e=>e.type==="command_rejected"&&e.data.reason==="target_unavailable"),"party protected");
  assert.equal(enemy().hp,before);
  console.log("PASS: directional PvP guard damage and party-friendly target protection");
} finally {for(const room of rooms.reverse())await room.leave().catch(()=>{});}
