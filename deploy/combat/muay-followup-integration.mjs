import assert from "node:assert/strict";
import {createHash,randomBytes} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {Client} from "@colyseus/sdk";
const url=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(url||"") || new URL(url).port==="4108" || !dir || !path.basename(dir).startsWith("montra-buff-test-"))throw Error("requires isolated localhost and temporary data");
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label,timeout=9000){const end=Date.now()+timeout;while(Date.now()<end){const r=fn();if(r)return r;await sleep(30);}throw Error("timeout: "+label);}
const makeToken=()=>"mt1_"+randomBytes(32).toString("hex");
const cases=[
 {school:"chaiya",opener:"chaiya_knee",finisher:"chaiya_finish",learned:["chaiya_elbow","chaiya_knee","chaiya_finish"],x:-10,z:8},
 {school:"korat",opener:"korat_swing",finisher:"korat_finish",learned:["korat_heavy","korat_swing","korat_finish"],x:-14,z:8},
 {school:"lopburi",opener:"lopburi_angle",finisher:"lopburi_finish",learned:["lopburi_angle","lopburi_counter","lopburi_finish"],x:10,z:10},
 {school:"thasao",opener:"thasao_flurry",finisher:"thasao_finish",learned:["thasao_step","thasao_flurry","thasao_finish"],x:14,z:10},
];
async function seed(token,name,x,z,school="chaiya",learned=[],skills=["step","punch","guard","counter"],level=15){
 const id=createHash("sha256").update(token).digest("hex"),slots=Array(12).fill(null),base=["step","punch","guard","counter"];
 slots[0]={itemId:"health_potion",quantity:3};slots[1]={itemId:"muay_wraps",quantity:1};
 const loadouts={chaiya:[...base],korat:[...base],lopburi:[...base],thasao:[...base]};loadouts[school]=[...skills];
 await writeFile(path.join(dir,id+".json"),JSON.stringify({version:1,id,name,level,experience:0,pkKills:0,pkDeaths:0,x,y:0,z,hp:9999,mapId:"ritual_village",build:{path:"muay_boran",ancestry:"woodland"},muayWrapGranted:true,muayBook:{school,learned:[...learned,"guard","punch"],training:{strikes:30,blocks:4},slots:[...skills],loadouts},inventory:{version:1,slots,equippedWeaponSlot:1},updatedAt:new Date().toISOString()}),{flag:"wx"});
}
for(const c of cases){c.token=makeToken();c.victimToken=makeToken();await seed(c.token,"นักมวย"+c.school,c.x,c.z,c.school,c.learned,[c.opener,c.finisher,"guard","punch"]);await seed(c.victimToken,"เป้าหมาย"+c.school,c.x,c.z-1.4,"chaiya",[],undefined,100);}
const expiryToken=makeToken(),otherToken=makeToken(),learnerToken=makeToken();
await seed(expiryToken,"นักมวยวัดเวลา",-12.8,6.8,"korat",cases[1].learned,["korat_swing","korat_finish","guard","punch"]);
await seed(otherToken,"เป้าหมายวัดเวลา",-13,6.8,"chaiya",[],undefined,100);
await seed(learnerToken,"ผู้เรียนขั้นสูง",0,0,"korat",["korat_heavy","korat_swing"]);
const client=new Client(url),options=guestToken=>({guestToken,worldVersion:1,templeVersion:1,atlasVersion:1,provinceVersion:1}),rooms=[];
const eventMap=new Map(),watch=room=>{const events=[];eventMap.set(room.sessionId,events);room.onMessage("*",(type,data)=>events.push({type,data}));return room;};
const seen=(room,type,predicate=()=>true)=>eventMap.get(room.sessionId).find(e=>e.type===type && predicate(e.data));
try {
 const first=watch(await client.create("my_room",options(cases[0].token)));rooms.push(first);cases[0].actor=first;
 for(const c of cases){if(!c.actor){c.actor=watch(await client.joinById(first.roomId,options(c.token)));rooms.push(c.actor);}c.victim=watch(await client.joinById(first.roomId,options(c.victimToken)));rooms.push(c.victim);}
 const player=(room,id)=>room.state?.players?.get(id);
 await until(()=>rooms.every(room=>player(room,room.sessionId)?.persistent),"all players joined");
 for(const c of cases){
  const {actor,victim,opener,finisher}=c;
  actor.send("muay_skill",{skillId:finisher,targetId:victim.sessionId});
  await until(()=>seen(actor,"command_rejected",e=>e.reason==="muay_followup_required"),c.school+" requires opener");
  assert.equal(JSON.parse(player(actor,actor.sessionId).muayData)[finisher],undefined,"rejected finisher costs no cooldown");
  await sleep(450);
  if(c.school==="chaiya") {
   actor.send("muay_skill",{skillId:"guard"});await until(()=>seen(actor,"muay_skill_used",e=>e.skillId==="guard"),"guard");
   victim.send("attack",{targetId:actor.sessionId});await until(()=>seen(actor,"muay_guarded"),"front guard");
   victim.send("move",{x:c.x,z:c.z-1.4});await sleep(200);
  }
  actor.send("muay_skill",{skillId:opener,targetId:victim.sessionId});
  await until(()=>seen(actor,"muay_followup",e=>e.active===true && e.skillId===finisher && e.targetId===victim.sessionId),c.school+" opening");
  const before=eventMap.get(actor.sessionId).filter(e=>e.type==="pvp_hit" && e.data.attackerId===actor.sessionId && e.data.targetId===victim.sessionId).length;
  actor.send("muay_skill",{skillId:finisher,targetId:victim.sessionId});
  await until(()=>seen(actor,"muay_followup",e=>e.active===false),c.school+" opening consumed");
  const hitCount=c.school==="thasao" ? 2 : 1;
  await until(()=>eventMap.get(actor.sessionId).filter(e=>e.type==="pvp_hit" && e.data.attackerId===actor.sessionId && e.data.targetId===victim.sessionId).length>=before+hitCount,c.school+" finisher damage");
  await until(()=>JSON.parse(player(actor,actor.sessionId).muayData)[finisher]>Date.now(),c.school+" finisher cooldown set");
 }
 const expiryActor=watch(await client.joinById(first.roomId,options(expiryToken)));rooms.push(expiryActor);
 const expiryTarget=watch(await client.joinById(first.roomId,options(otherToken)));rooms.push(expiryTarget);
 await until(()=>player(expiryActor,expiryActor.sessionId)?.persistent && player(expiryActor,expiryTarget.sessionId)?.persistent,"expiry players joined");
 expiryActor.send("muay_skill",{skillId:"korat_swing",targetId:expiryTarget.sessionId});
 await until(()=>seen(expiryActor,"muay_followup",e=>e.active===true),"expiry opening");
 expiryActor.send("muay_skill",{skillId:"korat_finish",targetId:cases[1].victim.sessionId});
 await until(()=>seen(expiryActor,"command_rejected",e=>e.reason==="muay_followup_required"),"different target rejected");
 await sleep(4100);const start=eventMap.get(expiryActor.sessionId).length;
 expiryActor.send("muay_skill",{skillId:"korat_finish",targetId:expiryTarget.sessionId});
 await until(()=>eventMap.get(expiryActor.sessionId).slice(start).some(e=>e.type==="command_rejected" && e.data.reason==="muay_followup_required"),"expired opening rejected");
 assert.equal(JSON.parse(player(expiryActor,expiryActor.sessionId).muayData).korat_finish,undefined,"invalid finish costs no cooldown");
 await expiryActor.leave();rooms.splice(rooms.indexOf(expiryActor),1);await expiryTarget.leave();rooms.splice(rooms.indexOf(expiryTarget),1);
 const saved=cases[1],savedId=saved.actor.sessionId;await saved.actor.leave();rooms.splice(rooms.indexOf(saved.actor),1);await sleep(300);
 const rejoined=watch(await client.joinById(first.roomId,options(saved.token)));rooms.push(rejoined);
 await until(()=>player(rejoined,rejoined.sessionId)?.persistent,"rejoin");
 assert.notEqual(rejoined.sessionId,savedId);assert.ok(JSON.parse(player(rejoined,rejoined.sessionId).muayBookData).learned.includes(saved.finisher));
 assert.ok(JSON.parse(player(rejoined,rejoined.sessionId).muayData)[saved.finisher]>Date.now(),"cooldown persisted");
 const learner=watch(await client.joinById(first.roomId,options(learnerToken)));rooms.push(learner);
 const learnerBook=()=>JSON.parse(player(learner,learner.sessionId).muayBookData);
 await until(()=>player(learner,learner.sessionId)?.persistent,"learner joined");
 learner.send("muay_book",{action:"learn",skillId:"korat_finish"});await until(()=>learnerBook().learned.includes("korat_finish"),"learn finisher at shrine");
 await sleep(500);learner.send("muay_book",{action:"equip",slot:2,skillId:"korat_finish"});await until(()=>learnerBook().slots[2]==="korat_finish","equip finisher at shrine");
 await learner.leave();rooms.splice(rooms.indexOf(learner),1);await sleep(300);
 const learnerAgain=watch(await client.joinById(first.roomId,options(learnerToken)));rooms.push(learnerAgain);
 await until(()=>player(learnerAgain,learnerAgain.sessionId)?.persistent,"learner rejoined");
 assert.equal(JSON.parse(player(learnerAgain,learnerAgain.sessionId).muayBookData).slots[2],"korat_finish");
 console.log("PASS: four school finishers, same target and expiry checks, learning, equip, cooldown and save persistence");
} finally {for(const room of rooms.reverse())await room.leave().catch(()=>{});}
