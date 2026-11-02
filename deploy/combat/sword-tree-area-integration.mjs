
import assert from "node:assert/strict";
import {createHash,randomBytes} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {Client} from "@colyseus/sdk";
const url=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(url||"")||!dir||!path.basename(dir).startsWith("montra-buff-test-"))throw Error("requires isolated localhost");
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(read,label,timeout=10000){const end=Date.now()+timeout;while(Date.now()<end){const value=read();if(value)return value;await sleep(50);}throw Error("timeout "+label);}
const token="mt1_"+randomBytes(32).toString("hex"),id=createHash("sha256").update(token).digest("hex");
await writeFile(path.join(dir,id+".json"),JSON.stringify({version:1,id,name:"นักดาบวงกว้าง",level:100,experience:0,pkKills:0,pkDeaths:0,x:-23,y:0,z:4,hp:1800,mapId:"fallen_city",
  build:{path:"phutthaisawan",ancestry:"woodland"},swordTree:{school:"atamat",learned:["footwork","guard","sweep","rhythm","circle_guard","opening_cut"],cooldowns:{},training:{strikes:30,blocks:5,finishes:5}},updatedAt:new Date().toISOString()}),{flag:"wx"});
const room=await new Client(url).create("my_room",{guestToken:token,worldVersion:1,templeVersion:1,atlasVersion:1});
try {
  const events=[];room.onMessage("*",(type,data)=>events.push({type,data}));
  const me=()=>room.state?.players?.get(room.sessionId);
  const m1=()=>room.state?.monsters?.get("atlas_fallen_city_1_1"),m2=()=>room.state?.monsters?.get("atlas_fallen_city_1_2");
  await until(()=>me()?.persistent&&m1()&&m2(),"spawn");
  room.send("equip_weapon",{slot:2});
  await until(()=>me().equippedWeaponId==="arcane_sword","equip");
  let nextMove=0;
  await until(()=>{
    const p=me(),a=m1(),b=m2(),dx=a.x-p.x,dz=a.z-p.z,ex=b.x-p.x,ez=b.z-p.z,d1=Math.hypot(dx,dz),d2=Math.hypot(ex,ez);
    if(!p.alive || !a.alive || !b.alive)throw Error("encounter ended");
    if(d1<3.3 && d2<3.3 && d1>0.01 && d2>0.01 && (dx*ex+dz*ez)/(d1*d2)>.6)return true;
    if(Date.now()>=nextMove){
      const mx=(a.x+b.x)/2,mz=(a.z+b.z)/2,vx=b.x-a.x,vz=b.z-a.z,len=Math.max(.01,Math.hypot(vx,vz));
      room.send("move",{x:mx-vz/len*2,z:mz+vx/len*2});nextMove=Date.now()+1200;
    }
    return false;
  },"gather monsters",20000);
  room.send("move",{x:me().x,z:me().z});
  room.send("sword_skill",{skillId:"opening_cut",targetId:m1().id});
  await until(()=>events.some(e=>e.type==="sword_skill_used"&&e.data.skillId==="opening_cut"),"area cast");
  const targets=new Set(events.filter(e=>e.type==="combat_hit"&&e.data.source==="sword").map(e=>e.data.targetId));
  assert.ok(targets.has(m1().id)&&targets.has(m2().id),JSON.stringify([...targets]));
  console.log("PASS: frontal area skill hits two same-map monsters in one cast");
} finally {await room.leave().catch(()=>{});}
