import assert from "node:assert/strict";
import {createHash,randomBytes} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {Client} from "@colyseus/sdk";
const url=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(url||"") || new URL(url).port==="4108" || !dir || !path.basename(dir).startsWith("montra-buff-test-"))throw Error("requires isolated localhost and temporary data");
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label,timeout=12000){const end=Date.now()+timeout;while(Date.now()<end){const value=fn();if(value)return value;await sleep(35);}throw Error("timeout: "+label);}
const token="mt1_"+randomBytes(32).toString("hex"),id=createHash("sha256").update(token).digest("hex");
const slots=Array(12).fill(null);slots[0]={itemId:"health_potion",quantity:3};slots[1]={itemId:"muay_wraps",quantity:1};
// Legacy one-school book exercises the existing preview save migration.
await writeFile(path.join(dir,id+".json"),JSON.stringify({version:1,id,name:"ครูมวยสี่สาย",level:15,experience:0,pkKills:0,pkDeaths:0,x:0,y:0,z:0,hp:250,mapId:"ritual_village",build:{path:"muay_boran",ancestry:"woodland"},muayWrapGranted:true,muayBook:{learned:["chaiya_elbow"],training:{strikes:20,blocks:3},slots:["step","chaiya_elbow","guard","counter"]},inventory:{version:1,slots,equippedWeaponSlot:1},updatedAt:new Date().toISOString()}),{flag:"wx"});
const client=new Client(url),options={guestToken:token,worldVersion:1,templeVersion:1,atlasVersion:1,provinceVersion:1};
let room=await client.create("my_room",options),events=[];
function watch(){events=[];room.onMessage("*",(type,data)=>events.push({type,data}));}
const me=()=>room.state?.players?.get(room.sessionId),book=()=>JSON.parse(me().muayBookData);
const seen=(type,predicate=()=>true)=>events.find(event=>event.type===type && predicate(event.data));
async function changeSchool(school){await sleep(1100);room.send("muay_book",{action:"school",school});await until(()=>book().school===school,"select "+school);}
async function learn(skillId){await sleep(1100);room.send("muay_book",{action:"learn",skillId});await until(()=>book().learned.includes(skillId),"learn "+skillId);}
async function equip(slot,skillId){await sleep(1100);room.send("muay_book",{action:"equip",slot,skillId});await until(()=>book().slots[slot]===skillId,"equip "+skillId);}
try {
 watch();await until(()=>me()?.persistent && room.state.muayBookCatalog,"join");
 assert.equal(book().school,"chaiya");assert.equal(book().slots[1],"chaiya_elbow");
 assert.deepEqual(Object.keys(JSON.parse(room.state.muayBookCatalog).schools).sort(),["chaiya","korat","lopburi","thasao"]);
 await changeSchool("korat");
 room.send("muay_skill",{skillId:"chaiya_elbow",targetId:"possessed-1"});
 await until(()=>seen("command_rejected",e=>e.reason==="muay_skill_locked"),"cross-school cast rejected");
 await learn("korat_heavy");await learn("korat_swing");await equip(1,"korat_swing");
 await changeSchool("lopburi");await learn("lopburi_angle");await learn("lopburi_counter");await equip(0,"lopburi_angle");
 room.send("move",{x:1,z:7.5});await until(()=>Math.hypot(me().x,me().z)>6.4,"leave shrine for sidestep");
 const beforeStep={x:me().x,z:me().z},targetBefore={x:room.state.monster.x,z:room.state.monster.z};
 await sleep(500);room.send("muay_skill",{skillId:"lopburi_angle",targetId:"possessed-1"});
 await until(()=>seen("muay_skill_used",e=>e.skillId==="lopburi_angle"),"l Buri sidestep");
 await until(()=>Math.hypot(me().x-beforeStep.x,me().z-beforeStep.z)>0.2,"sidestep position");
 const dx=targetBefore.x-beforeStep.x,dz=targetBefore.z-beforeStep.z;
 assert.ok(Math.abs(dx*(me().z-beforeStep.z)-dz*(me().x-beforeStep.x))/Math.max(0.001,Math.hypot(dx,dz))>0.3,"sidestep must move laterally");
 room.send("move",{x:0,z:0});await until(()=>Math.hypot(me().x,me().z)<5,"return to shrine");await sleep(5600);
 await changeSchool("thasao");await learn("thasao_step");await learn("thasao_flurry");await equip(0,"thasao_step");await equip(1,"thasao_flurry");
 await changeSchool("chaiya");assert.equal(book().slots[1],"chaiya_elbow");
 await changeSchool("korat");assert.equal(book().slots[1],"korat_swing");
 await changeSchool("lopburi");assert.equal(book().slots[0],"lopburi_angle");
 await changeSchool("thasao");assert.equal(book().slots[1],"thasao_flurry");
 const saved=book();await room.leave();await sleep(500);room=await client.create("my_room",options);watch();await until(()=>me()?.persistent,"rejoin");assert.deepEqual(book(),saved);
 room.send("move",{x:1,z:7.5});await until(()=>Math.hypot(me().x,me().z)>6.4,"leave shrine");
 await sleep(500);room.send("muay_skill",{skillId:"thasao_step",targetId:"possessed-1"});
 await until(()=>seen("muay_skill_used",e=>e.skillId==="thasao_step"),"approach");
 await sleep(500);const before=events.filter(e=>e.type==="combat_hit" && e.data.source==="muay").length;
 room.send("muay_skill",{skillId:"thasao_flurry",targetId:"possessed-1"});
 await until(()=>seen("muay_skill_used",e=>e.skillId==="thasao_flurry"),"flurry");
 await until(()=>events.filter(e=>e.type==="combat_hit" && e.data.source==="muay").length>=before+2,"two flurry hits");
 console.log("PASS: legacy migration, four schools, school restrictions, lessons, separate shortcuts, persistence, sidestep and flurry");
} finally {await room.leave().catch(()=>{});}
