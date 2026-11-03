import assert from "node:assert/strict";
import {createHash,randomBytes} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {Client} from "@colyseus/sdk";
const url=process.env.MONTRA_TEST_URL, dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(url||"") || new URL(url).port==="4108" || !dir || !path.basename(dir).startsWith("montra-buff-test-"))throw Error("requires isolated localhost and temporary data");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label,timeout=12000){const end=Date.now()+timeout;while(Date.now()<end){const value=fn();if(value)return value;await sleep(35);}throw Error("timeout: "+label);}
const token="mt1_"+randomBytes(32).toString("hex"),id=createHash("sha256").update(token).digest("hex");
const slots=Array(12).fill(null);slots[0]={itemId:"health_potion",quantity:3};slots[1]={itemId:"muay_wraps",quantity:1};
await writeFile(path.join(dir,id+".json"),JSON.stringify({version:1,id,name:"ครูมวยทดลอง",level:5,experience:0,pkKills:0,pkDeaths:0,x:0,y:0,z:0,hp:100,mapId:"ritual_village",build:{path:"muay_boran",ancestry:"woodland"},muayWrapGranted:true,muayBook:{learned:[],training:{strikes:5,blocks:1},slots:["step","punch","guard","counter"]},inventory:{version:1,slots,equippedWeaponSlot:1},updatedAt:new Date().toISOString()}),{flag:"wx"});
const client=new Client(url),options={guestToken:token,worldVersion:1,templeVersion:1,atlasVersion:1,provinceVersion:1};
let room=await client.create("my_room",options), events=[];
const watch=()=>{events=[];room.onMessage("*",(type,data)=>events.push({type,data}));};
const me=()=>room.state?.players?.get(room.sessionId), book=()=>JSON.parse(me().muayBookData);
const seen=(type,predicate=()=>true)=>events.find(event=>event.type===type && predicate(event.data));
try {
 watch();await until(()=>me()?.persistent && room.state.muayBookCatalog,"join");
 room.send("muay_skill",{skillId:"chaiya_elbow",targetId:"possessed-1"});
 await until(()=>seen("command_rejected",e=>e.reason==="muay_skill_locked"),"locked skill");
 await sleep(550);room.send("muay_book",{action:"learn",skillId:"chaiya_knee"});
 await until(()=>seen("command_rejected",e=>e.reason==="muay_book_prerequisite"),"prerequisite");
 await sleep(550);room.send("muay_book",{action:"learn",skillId:"chaiya_elbow"});
 await until(()=>book().learned.includes("chaiya_elbow"),"learn elbow");
 await sleep(550);room.send("muay_book",{action:"learn",skillId:"chaiya_knee"});
 await until(()=>book().learned.includes("chaiya_knee"),"learn knee");
 await sleep(550);room.send("muay_book",{action:"equip",slot:0,skillId:"chaiya_elbow"});
 await until(()=>book().slots[0]==="chaiya_elbow","shortcut");
 const saved=book();await room.leave();await sleep(500);
 room=await client.create("my_room",options);watch();await until(()=>me()?.persistent,"rejoin");
 assert.deepEqual(book(),saved);
 room.send("muay_book",{action:"reset"});
 await until(()=>book().learned.length===0,"reset");
 assert.deepEqual(book().slots,[null,null,null,null]);
 assert.deepEqual(book().training,{strikes:5,blocks:1});
 await sleep(550);room.send("muay_book",{action:"learn",skillId:"chaiya_elbow"});
 await until(()=>book().learned.includes("chaiya_elbow"),"relearn");
 await sleep(1200);room.send("muay_book",{action:"learn",skillId:"step"});
 await until(()=>book().learned.includes("step"),"learn approach");
 for(const [slot,skillId] of ["step","chaiya_elbow"].entries()){
   await sleep(1200);room.send("muay_book",{action:"equip",slot,skillId});
   await until(()=>book().slots[slot]===skillId,"equip after reset "+skillId);
 }
 room.send("move",{x:1,z:7.5});await until(()=>Math.hypot(me().x,me().z)>6.4,"leave shrine");
 await sleep(500);room.send("muay_skill",{skillId:"step",targetId:"possessed-1"});
 await until(()=>seen("muay_skill_used",e=>e.skillId==="step"),"approach");
 await sleep(500);room.send("muay_skill",{skillId:"chaiya_elbow",targetId:"possessed-1"});
 await until(()=>seen("muay_skill_used",e=>e.skillId==="chaiya_elbow"),"elbow attack");
 console.log("PASS: training gates, Muay lessons, shortcut, reset, persistence and advanced attack");
} finally {await room.leave().catch(()=>{});}
