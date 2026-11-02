import assert from "node:assert/strict";
import {createHash,randomBytes} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {Client} from "@colyseus/sdk";
const url=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(url||"") || new URL(url).port==="4108" || !dir || !path.basename(dir).startsWith("montra-buff-test-"))throw Error("requires isolated localhost and temporary data");
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label,timeout=9000){const end=Date.now()+timeout;while(Date.now()<end){const r=fn();if(r)return r;await sleep(20);}throw Error("timeout: "+label);}
const token=()=>"mt1_"+randomBytes(32).toString("hex"),tokens=Array.from({length:7},token);
async function seed(t,name,x,z){
 const id=createHash("sha256").update(t).digest("hex"),slots=Array(12).fill(null),base=["parry","evade","guard","counter"];
 slots[0]={itemId:"health_potion",quantity:3};slots[1]={itemId:"muay_wraps",quantity:1};
 const loadouts={chaiya:[...base],korat:[...base],lopburi:[...base],thasao:[...base]};
 await writeFile(path.join(dir,id+".json"),JSON.stringify({version:1,id,name,level:15,experience:0,pkKills:0,pkDeaths:0,x,y:0,z,hp:9999,mapId:"ritual_village",build:{path:"muay_boran",ancestry:"woodland"},muayWrapGranted:true,muayBook:{school:"chaiya",learned:[],training:{strikes:10,blocks:1},slots:[...base],loadouts},inventory:{version:1,slots,equippedWeaponSlot:1},updatedAt:new Date().toISOString()}),{flag:"wx"});
}
await seed(tokens[0],"ผู้ป้องกัน",-10,8);await seed(tokens[1],"ผู้โจมตีด้านหน้า",-10,6.5);await seed(tokens[2],"ผู้โจมตีด้านหลัง",-10,9.5);await seed(tokens[3],"ผู้พลาดจังหวะ",-14,8);await seed(tokens[4],"ผู้ชิดเขตพัก",0,-6.5);await seed(tokens[5],"ผู้พัก",0,0);
await seed(tokens[6],"ผู้โจมตีสอง",-11,6.6);
const client=new Client(url),options=guestToken=>({guestToken,worldVersion:1,templeVersion:1,atlasVersion:1,provinceVersion:1}),rooms=[];
const events=new Map(),watch=room=>{const list=[];events.set(room.sessionId,list);room.onMessage("*",(type,data)=>list.push({type,data}));return room;};
const seen=(room,type,predicate=()=>true)=>events.get(room.sessionId).find(e=>e.type===type && predicate(e.data));
const damage=(attack,def,level)=>Math.max(1,Math.round(attack*(100*(1+(level-1)/15))/(100*(1+(level-1)/15)+def)));
try {
 const d=watch(await client.create("my_room",options(tokens[0])));rooms.push(d);
 for(const t of tokens.slice(1)){const room=watch(await client.joinById(d.roomId,options(t)));rooms.push(room);}
 const [,front,back,miss,edge,safe,front2]=rooms,player=id=>d.state?.players?.get(id),defender=()=>player(d.sessionId);
 await until(()=>rooms.every(r=>player(r.sessionId)?.persistent),"players joined");
 safe.send("muay_skill",{skillId:"parry"});await until(()=>seen(safe,"command_rejected",e=>e.reason==="muay_safe_area"),"safe area");
 const edgeStamina=player(edge.sessionId).stamina;edge.send("muay_skill",{skillId:"evade"});await until(()=>seen(edge,"command_rejected",e=>e.reason==="muay_blocked"),"rest boundary blocks evade");
 assert.equal(JSON.parse(player(edge.sessionId).muayData).evade,undefined,"blocked evade has no cooldown");
 assert.ok(player(edge.sessionId).stamina>=edgeStamina,"blocked evade costs no stamina");
 miss.send("muay_skill",{skillId:"parry"});await until(()=>seen(miss,"muay_defense",e=>e.kind==="parry" && e.phase==="miss"),"miss feedback");
 miss.send("muay_skill",{skillId:"counter",targetId:front.sessionId});await until(()=>seen(miss,"command_rejected",e=>e.reason==="muay_counter_required"),"miss does not open counter");
 d.send("muay_skill",{skillId:"parry"});await until(()=>seen(d,"muay_defense",e=>e.kind==="parry" && e.phase==="start"),"parry starts");
 const expectedBack=damage((player(back.sessionId).atk+4)*1.1*0.75,defender().def,defender().level);
 back.send("muay_skill",{skillId:"punch",targetId:d.sessionId});
 const rear=await until(()=>seen(d,"pvp_hit",e=>e.attackerId===back.sessionId)?.data,"rear hit");assert.equal(rear.damage,expectedBack);
 assert.equal(Boolean(seen(d,"muay_defense",e=>e.phase==="success")),false,"rear hit cannot trigger parry");
 const expectedFront=damage((player(front.sessionId).atk+4)*1.1*0.75,defender().def,defender().level);
 front.send("muay_skill",{skillId:"punch",targetId:d.sessionId});
 await until(()=>seen(d,"muay_defense",e=>e.kind==="parry" && e.phase==="success"),"front parry");
 const parried=await until(()=>seen(d,"pvp_hit",e=>e.attackerId===front.sessionId)?.data,"parried hit");
 assert.equal(parried.damage,Math.max(1,Math.round(expectedFront*0.35)));
 const expectedNext=damage((player(front2.sessionId).atk+4)*1.1*0.75,defender().def,defender().level);
 front2.send("muay_skill",{skillId:"punch",targetId:d.sessionId});
 const next=await until(()=>seen(d,"pvp_hit",e=>e.attackerId===front2.sessionId)?.data,"second front hit");assert.equal(next.damage,expectedNext,"parry applies to one attack only");
 d.send("muay_skill",{skillId:"counter",targetId:front.sessionId});await until(()=>seen(d,"pvp_hit",e=>e.attackerId===d.sessionId && e.targetId===front.sessionId),"counter after parry");
 await sleep(300);const before={x:defender().x,z:defender().z};
 d.send("muay_skill",{skillId:"evade"});await until(()=>seen(d,"muay_defense",e=>e.kind==="evade" && e.phase==="start"),"evade starts");
 const expectedTeep=damage((player(front.sessionId).atk+4)*0.8*0.75,defender().def,defender().level);
 front.send("muay_skill",{skillId:"teep",targetId:d.sessionId});
 await until(()=>seen(d,"muay_defense",e=>e.kind==="evade" && e.phase==="success"),"evade catches front hit");
 await until(()=>events.get(d.sessionId).filter(e=>e.type==="pvp_hit" && e.data.attackerId===front.sessionId).length>=2,"evaded hit");
 const evaded=events.get(d.sessionId).filter(e=>e.type==="pvp_hit" && e.data.attackerId===front.sessionId).at(-1).data;
 assert.equal(evaded.damage,Math.max(1,Math.round(expectedTeep*0.2)));
 await until(()=>Math.hypot(defender().x-before.x,defender().z-before.z)>1.1,"server moved defender");
 const expectedSecond=damage((player(back.sessionId).atk+4)*0.8*0.75,defender().def,defender().level);
 back.send("muay_skill",{skillId:"teep",targetId:d.sessionId});
 const second=await until(()=>events.get(d.sessionId).filter(e=>e.type==="pvp_hit" && e.data.attackerId===back.sessionId).at(-1)?.data,"second hit");
 await until(()=>events.get(d.sessionId).filter(e=>e.type==="pvp_hit" && e.data.attackerId===back.sessionId).length>=2,"second hit delivered");
 assert.equal(events.get(d.sessionId).filter(e=>e.type==="pvp_hit" && e.data.attackerId===back.sessionId).at(-1).data.damage,expectedSecond);
 assert.ok(second);
 await d.leave();rooms.splice(rooms.indexOf(d),1);await sleep(300);
 const again=watch(await client.joinById(front.roomId,options(tokens[0])));rooms.push(again);
 await until(()=>again.state?.players?.get(again.sessionId)?.persistent,"rejoin");
 const cooldowns=JSON.parse(again.state.players.get(again.sessionId).muayData);assert.ok(cooldowns.parry>Date.now() && cooldowns.evade>Date.now());
 console.log("PASS: front and rear, timed parry, miss, counter, evade movement and single hit, safe boundary, persisted cooldowns");
} finally {for(const room of rooms.reverse())await room.leave().catch(()=>{});}
