import assert from "node:assert/strict";
import {createHash,randomBytes} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {Client} from "@colyseus/sdk";
const url=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(url||"") || new URL(url).port==="4108" || !dir || !path.basename(dir).startsWith("montra-buff-test-"))throw Error("requires isolated localhost and temporary data");
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label,timeout=10000){const end=Date.now()+timeout;while(Date.now()<end){const r=fn();if(r)return r;await sleep(30);}throw Error("timeout: "+label);}
const token=()=>"mt1_"+randomBytes(32).toString("hex"), aToken=token(), dToken=token(), bToken=token(), safeToken=token(), npcToken=token(), disconnectVictimToken=token(), edgeAttackerToken=token(), edgeVictimToken=token();
async function seed(t,name,x,z,hp=250){
 const id=createHash("sha256").update(t).digest("hex"),slots=Array(12).fill(null),base=["grapple","punch","guard","counter"];
 slots[0]={itemId:"health_potion",quantity:3};slots[1]={itemId:"muay_wraps",quantity:1};
 const loadouts={chaiya:[...base],korat:[...base],lopburi:[...base],thasao:[...base]};
 await writeFile(path.join(dir,id+".json"),JSON.stringify({version:1,id,name,level:10,experience:0,pkKills:0,pkDeaths:0,x,y:0,z,hp,mapId:"ritual_village",build:{path:"muay_boran",ancestry:"woodland"},muayWrapGranted:true,muayBook:{school:"chaiya",learned:[...base],training:{strikes:10,blocks:1},slots:[...base],loadouts},inventory:{version:1,slots,equippedWeaponSlot:1},updatedAt:new Date().toISOString()}),{flag:"wx"});
}
await seed(aToken,"ผู้จับ",-10,8);await seed(dToken,"ผู้ถูกจับ",-10,9.4);await seed(bToken,"ผู้จับอีกคน",-11,10.5);await seed(safeToken,"ผู้พัก",0,0);await seed(npcToken,"ผู้ทดสอบผี",1,8.8);
await seed(disconnectVictimToken,"ผู้รอหลุด",-11.6,10.5);await seed(edgeAttackerToken,"ผู้จับริมเขตพัก",-8.6,0);await seed(edgeVictimToken,"ผู้ถูกจับริมเขตพัก",-7.2,0,9999);
const client=new Client(url),options=guestToken=>({guestToken,worldVersion:1,templeVersion:1,atlasVersion:1,provinceVersion:1}),rooms=[];
const events=new Map(),watch=room=>{const list=[];events.set(room.sessionId,list);room.onMessage("*",(type,data)=>list.push({type,data}));return room;};
const seen=(room,type,predicate=()=>true)=>events.get(room.sessionId).find(e=>e.type===type && predicate(e.data));
let a,d,b,s,n,disconnectVictim,edgeAttacker,edgeVictim;
try {
 a=watch(await client.create("my_room",options(aToken)));rooms.push(a);
 for(const t of [dToken,bToken,safeToken,npcToken,disconnectVictimToken,edgeAttackerToken,edgeVictimToken]){const room=watch(await client.joinById(a.roomId,options(t)));rooms.push(room);}
 [a,d,b,s,n,disconnectVictim,edgeAttacker,edgeVictim]=rooms;
 const p=id=>a.state?.players?.get(id);
 await until(()=>rooms.every(r=>p(r.sessionId)?.persistent),"players joined");
 a.send("muay_skill",{skillId:"grapple",targetId:s.sessionId});
 await until(()=>seen(a,"command_rejected",e=>e.reason==="target_unavailable"),"safe target");
 assert.equal(JSON.parse(p(a.sessionId).muayData).grapple,undefined);
 await sleep(450);a.send("muay_skill",{skillId:"grapple",targetId:d.sessionId});
 await until(()=>seen(a,"muay_grapple",e=>e.phase==="held" && e.targetId===d.sessionId),"PvP hold");
 const heldPosition={x:p(d.sessionId).x,z:p(d.sessionId).z},hp=p(d.sessionId).hp;
 d.send("move",{x:-8,z:10});await until(()=>seen(d,"command_rejected",e=>e.reason==="muay_controlled"),"movement held");
 assert.equal(p(d.sessionId).x,heldPosition.x);assert.equal(p(d.sessionId).z,heldPosition.z);
 a.send("muay_skill",{skillId:"grapple",targetId:d.sessionId});
 await until(()=>seen(a,"pvp_hit",e=>e.targetId===d.sessionId && e.source==="muay"),"PvP throw hit");
 await until(()=>Math.hypot(p(d.sessionId).x-heldPosition.x,p(d.sessionId).z-heldPosition.z)>1.4,"PvP displacement");
 assert.ok(p(d.sessionId).hp<hp);
 assert.ok(JSON.parse(p(a.sessionId).muayData).grapple>Date.now(),"cooldown started");
 // The second attacker is close enough to test shared resistance without waiting for a cooldown.
 b.send("muay_skill",{skillId:"grapple",targetId:d.sessionId});
 await until(()=>seen(b,"command_rejected",e=>e.reason==="muay_grapple_resisted"),"repeat hold resisted");
 d.send("move",{x:-9,z:11});await until(()=>Math.hypot(p(d.sessionId).x-heldPosition.x,p(d.sessionId).z-heldPosition.z)>1.7,"victim free to move");
 // Disconnecting the holder must release the other player immediately.
 await sleep(450);b.send("muay_skill",{skillId:"grapple",targetId:disconnectVictim.sessionId});
 await until(()=>seen(disconnectVictim,"muay_grapple",e=>e.phase==="held"),"disconnect test hold");
 await b.leave();rooms.splice(rooms.indexOf(b),1);
 await until(()=>seen(disconnectVictim,"muay_grapple",e=>e.phase==="released" && e.reason==="disconnect"),"disconnect release");
 const beforeMove={x:p(disconnectVictim.sessionId).x,z:p(disconnectVictim.sessionId).z};
 disconnectVictim.send("move",{x:-12,z:11});await until(()=>Math.hypot(p(disconnectVictim.sessionId).x-beforeMove.x,p(disconnectVictim.sessionId).z-beforeMove.z)>.1,"disconnected holder did not trap victim");
 // A legal hold cannot throw a victim across the rest-area boundary.
 edgeAttacker.send("muay_skill",{skillId:"grapple",targetId:edgeVictim.sessionId});
 await until(()=>seen(edgeAttacker,"muay_grapple",e=>e.phase==="held"),"hold by rest area");
 // Full health isolates this negative-damage check from passive regeneration.
 const edgeBefore={...p(edgeVictim.sessionId).toJSON()},edgeEventStart=events.get(a.sessionId).length;
 assert.equal(edgeBefore.hp,edgeBefore.maxHp);
 edgeAttacker.send("muay_skill",{skillId:"grapple",targetId:edgeVictim.sessionId});
 await until(()=>seen(edgeAttacker,"command_rejected",e=>e.reason==="muay_throw_blocked"),"rest area throw blocked");
 await sleep(250); // Observe the next state patch and any afterNextPatch damage event.
 const edgeAfter=p(edgeVictim.sessionId);
 for(const field of ["x","y","z","hp","hitSeq"])assert.equal(edgeAfter[field],edgeBefore[field],"blocked throw changed "+field);
 assert.equal(events.get(a.sessionId).slice(edgeEventStart).filter(e=>["pvp_hit","monster_hit","summon_hit"].includes(e.type) && e.data.targetId===edgeVictim.sessionId).length,0,"blocked throw emitted damage");
 // An uncontrolled monster can be held, and timeout releases it without another input.
 await until(()=>Math.hypot(p(n.sessionId).x-a.state.monster.x,p(n.sessionId).z-a.state.monster.z)<1.8,"monster nearby");
 n.send("muay_skill",{skillId:"grapple",targetId:"possessed-1"});
 await until(()=>seen(n,"muay_grapple",e=>e.phase==="held"),"monster held");
 await until(()=>seen(n,"muay_grapple",e=>e.phase==="released" && e.reason==="ended"),"automatic release");
 n.send("move",{x:2,z:8});await sleep(400);
 assert.ok(!seen(n,"command_rejected",e=>e.reason==="muay_controlled"),"holder is not stuck after timeout");
 await a.leave();rooms.splice(rooms.indexOf(a),1);await sleep(300);
 a=watch(await client.joinById(d.roomId,options(aToken)));rooms.push(a);
 await until(()=>a.state?.players?.get(a.sessionId)?.persistent,"rejoin");
 assert.ok(JSON.parse(a.state.players.get(a.sessionId).muayData).grapple>Date.now(),"cooldown survives reconnect");
 console.log("PASS: safe target and landing, PvP hold and throw, resistance, disconnect release, monster timeout and cooldown persistence");
} finally {for(const room of rooms.reverse())await room.leave().catch(()=>{});}
