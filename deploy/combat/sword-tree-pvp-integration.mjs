
import assert from "node:assert/strict";
import {createHash,randomBytes} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {Client} from "@colyseus/sdk";
const url=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(url||"")||!dir||!path.basename(dir).startsWith("montra-buff-test-"))throw Error("requires isolated localhost");
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(read,label,timeout=10000){const end=Date.now()+timeout;while(Date.now()<end){const value=read();if(value)return value;await sleep(30);}throw Error("timeout "+label);}
const token=()=>"mt1_"+randomBytes(32).toString("hex"), defender=token(),attacker=token(),hunter=token();
async function seed(t,name,x,z,build,tree,level){
  const id=createHash("sha256").update(t).digest("hex");
  await writeFile(path.join(dir,id+".json"),JSON.stringify({version:1,id,name,level,experience:0,pkKills:0,pkDeaths:0,x,y:0,z,hp:500,mapId:"ritual_village",build,swordTree:tree,updatedAt:new Date().toISOString()}),{flag:"wx"});
}
await seed(defender,"ผู้ตั้งรับ",-10,9.5,{path:"phutthaisawan",ancestry:"woodland"},
  {school:"sritrairat",learned:["footwork","guard","measure","riposte"],cooldowns:{},training:{strikes:10,blocks:1,finishes:0}},20);
await seed(attacker,"ผู้ฝึกโจมตี",-10,8,undefined,undefined,1);
await seed(hunter,"ผู้ฝึกผี",1,8,{path:"phutthaisawan",ancestry:"woodland"},
  {school:"phutthaisawan",learned:["footwork"],cooldowns:{},training:{strikes:0,blocks:0,finishes:0}},1);
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
  const attackerLevel=enemy().level,k=100*(1+(attackerLevel-1)/15);
  const expected=Math.max(1,Math.round((me().atk+8)*0.9*0.8*k/(k+enemy().def)));
  d.send("sword_skill",{skillId:"footwork",targetId:a.sessionId});
  const skillHit=await until(()=>events.find(e=>e.type==="pvp_hit"&&e.data.targetId===a.sessionId&&e.data.source==="sword")?.data,"sword PvP skill");
  assert.equal(skillHit.damage,expected,"sword skills use the PvP coefficient before defense");
  a.send("party_invite",{targetId:d.sessionId});
  const invitation=await until(()=>events.find(e=>e.type==="party_invitation")?.data,"invite");
  d.send("party_accept",{inviteId:invitation.inviteId});
  await until(()=>aEvents.some(e=>e.type==="party_state"&&e.data.members.length===2),"party");
  const before=enemy().hp;
  d.send("sword_skill",{skillId:"riposte",targetId:a.sessionId});
  await until(()=>events.some(e=>e.type==="command_rejected"&&e.data.reason==="target_unavailable"),"party protected");
  assert.equal(enemy().hp,before);
  const pve=await client.create("my_room",opts(hunter));rooms.push(pve);
  const pveEvents=[];pve.onMessage("*",(type,data)=>pveEvents.push({type,data}));
  const hunterState=()=>pve.state?.players?.get(pve.sessionId);
  await until(()=>hunterState()?.persistent,"hunter joined");
  pve.send("equip_weapon",{slot:2});
  await until(()=>hunterState().equippedWeaponId==="arcane_sword","hunter equips sword");
  const monster=pve.state.monster,monsterLevel=monster.level,monsterK=100*(1+(monsterLevel-1)/15);
  const expectedPve=Math.max(1,Math.round((hunterState().atk+8)*0.9*monsterK/(monsterK+monster.defense)));
  pve.send("sword_skill",{skillId:"footwork",targetId:monster.id});
  const monsterHit=await until(()=>pveEvents.find(e=>e.type==="combat_hit"&&e.data.source==="sword")?.data,"sword PvE skill");
  assert.equal(monsterHit.damage,expectedPve,"sword skills retain their PvE power");
  console.log("PASS: PvP sword coefficient, unchanged PvE skill damage, directional guard and party protection");
} finally {for(const room of rooms.reverse())await room.leave().catch(()=>{});}
