import assert from "node:assert/strict";
import {createHash,randomBytes} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {Client} from "@colyseus/sdk";
const url=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(url||"") || new URL(url).port==="4108" || !dir || !path.basename(dir).startsWith("montra-buff-test-"))throw Error("requires isolated localhost and temporary data");
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label,timeout=12000){const end=Date.now()+timeout;while(Date.now()<end){const result=fn();if(result)return result;await sleep(35);}throw Error("timeout: "+label);}
const token="mt1_"+randomBytes(32).toString("hex"),id=createHash("sha256").update(token).digest("hex");
const slots=Array(12).fill(null);slots[0]={itemId:"health_potion",quantity:3};slots[1]={itemId:"muay_wraps",quantity:1};
await writeFile(path.join(dir,id+".json"),JSON.stringify({version:1,id,name:"นักมวยทดลอง",level:5,experience:0,pkKills:0,pkDeaths:0,x:0,y:0,z:0,hp:240,mapId:"ritual_village",build:{path:"muay_boran",ancestry:"woodland"},muayWrapGranted:true,muayBook:{learned:["step","punch","teep"],training:{strikes:10,blocks:1},slots:["step","punch","guard","counter"]},inventory:{version:1,slots,equippedWeaponSlot:1},updatedAt:new Date().toISOString()}),{flag:"wx"});
const client=new Client(url),room=await client.create("my_room",{guestToken:token,worldVersion:1,templeVersion:1,atlasVersion:1,provinceVersion:1});
const events=[];room.onMessage("*",(type,data)=>events.push({type,data}));
const me=()=>room.state?.players?.get(room.sessionId),book=()=>JSON.parse(me().muayBookData);
const seen=(type,predicate=()=>true)=>events.find(event=>event.type===type && predicate(event.data));
try {
 await until(()=>me()?.persistent && room.state.muayBookCatalog,"join");
 room.send("muay_book",{action:"school",school:"korat"});await until(()=>book().school==="korat","select school");
 for(const [slot,skillId] of ["step","punch"].entries()){
   await sleep(600);room.send("muay_book",{action:"equip",slot,skillId});await until(()=>book().slots[slot]===skillId,"equip "+skillId);
 }
 await sleep(600);room.send("muay_book",{action:"equip",slot:2,skillId:"teep"});await until(()=>book().slots[2]==="teep","equip kick");
 room.send("move",{x:1,z:7.5});await until(()=>Math.hypot(me().x,me().z)>6.4,"leave shrine");
 room.send("muay_skill",{skillId:"step",targetId:"possessed-1"});await until(()=>seen("muay_combo",e=>e.count===1 && e.next==="kick"),"first combo step");
 await sleep(500);room.send("muay_skill",{skillId:"teep",targetId:"possessed-1"});
 await until(()=>seen("muay_combo",e=>e.count===2 && e.next==="punch"),"second combo step");
 await until(()=>seen("muay_interrupt",e=>e.result==="applied"),"monster interrupted");
 await until(()=>events.filter(e=>e.type==="combat_hit" && e.data.source==="muay").length>=2,"first two combat hits received");
 const priorHits=events.filter(e=>e.type==="combat_hit" && e.data.source==="muay").length;
 const attacker=me(),monster=room.state.monster;
 const expected=Math.max(1,Math.round((attacker.atk+4)*1.1*1.25*(100*(1+(monster.level-1)/15))/(100*(1+(monster.level-1)/15)+monster.defense)));
 await sleep(500);room.send("muay_skill",{skillId:"punch",targetId:"possessed-1"});
 await until(()=>seen("muay_combo",e=>e.count===3 && e.completed===true),"combo completed");
 await until(()=>events.filter(e=>e.type==="combat_hit" && e.data.source==="muay").length>priorHits,"final hit");
 assert.equal(events.filter(e=>e.type==="combat_hit" && e.data.source==="muay")[priorHits].data.damage,expected);
 // Teep's own cooldown is shorter than the monster's shared interrupt resistance.
 await until(()=>Date.now()>JSON.parse(me().muayData).teep+100,"teep cooldown",10000);
 room.send("muay_skill",{skillId:"teep",targetId:"possessed-1"});
 await until(()=>seen("muay_interrupt",e=>e.result==="resisted"),"repeat interruption resisted");
 const experience=me().experience;room.send("attack",{targetId:"possessed-1"});
 await until(()=>!room.state.monster.alive,"monster defeated",15000);
 await until(()=>me().experience>experience,"experience awarded");
 const awarded=me().experience;await sleep(700);
 room.send("muay_skill",{skillId:"punch",targetId:"possessed-1"});await sleep(700);
 assert.equal(me().experience,awarded,"defeated target cannot award experience twice");
 console.log("PASS: equipped teep, ordered combo, final damage bonus, shared interruption resistance and single EXP reward");
} finally {await room.leave().catch(()=>{});}
