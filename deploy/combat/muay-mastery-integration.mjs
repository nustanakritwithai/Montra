import assert from "node:assert/strict";
import {createHash,randomBytes} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {Client} from "@colyseus/sdk";
const url=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(url||"") || new URL(url).port==="4108" || !dir || !path.basename(dir).startsWith("montra-buff-test-"))throw Error("requires isolated localhost and temporary data");
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label,timeout=15000){const end=Date.now()+timeout;while(Date.now()<end){const value=fn();if(value)return value;await sleep(35);}throw Error("timeout: "+label);}
const token=()=>"mt1_"+randomBytes(32).toString("hex"),learnerToken=token(),opponentToken=token(),oldToken=token(),seriesToken=token();
function mastery(korat={technique:0,sequences:0}){return {chaiya:{technique:0,sequences:0},korat,lopburi:{technique:0,sequences:0},thasao:{technique:0,sequences:0}};}
async function seed(t,name,x,z,school,learned,skillSlots,extra={}){
 const id=createHash("sha256").update(t).digest("hex"),slots=Array(12).fill(null),base=["step","punch","guard","counter"];
 slots[0]={itemId:"health_potion",quantity:3};slots[1]={itemId:"muay_wraps",quantity:1};
 const loadouts={chaiya:[...base],korat:[...base],lopburi:[...base],thasao:[...base]};loadouts[school]=[...skillSlots];
 const muayBook={school,learned,training:{strikes:70,blocks:8},slots:[...skillSlots],loadouts,...(extra.mastery?{mastery:extra.mastery}:{})};
 await writeFile(path.join(dir,id+".json"),JSON.stringify({version:1,id,name,level:extra.level??25,experience:0,pkKills:0,pkDeaths:0,x,y:0,z,hp:9999,mapId:extra.mapId??"ritual_village",build:{path:"muay_boran",ancestry:"woodland"},muayWrapGranted:true,muayBook,inventory:{version:1,slots,equippedWeaponSlot:1},updatedAt:new Date().toISOString()}),{flag:"wx"});
}
await seed(learnerToken,"ผู้ฝึกโคราช",-10,8,"korat",["korat_heavy","korat_swing"],["korat_heavy","korat_swing","guard","counter"],{mastery:mastery({technique:4,sequences:2})});
await seed(opponentToken,"ผู้เล่นทดสอบ",-10,9.4,"chaiya",[],["step","punch","guard","counter"]);
await seed(oldToken,"เซฟเก่า",0,0,"korat",["korat_heavy","korat_swing","korat_press"],["korat_press","punch","guard","counter"]);
await seed(seriesToken,"ผู้ฝึกท่าเสา",-19,-8,"thasao",["teep","thasao_step","thasao_flurry","thasao_finish"],["thasao_step","thasao_flurry","thasao_finish","teep"],{level:15,mapId:"forbidden_forest"});
const client=new Client(url),options=guestToken=>({guestToken,worldVersion:1,templeVersion:1,atlasVersion:1,provinceVersion:1}),rooms=[];
const events=new Map(),watch=r=>{const list=[];events.set(r.sessionId,list);r.onMessage("*",(type,data)=>list.push({type,data}));return r;};
const seen=(r,type,predicate=()=>true)=>events.get(r.sessionId).find(e=>e.type===type && predicate(e.data));
try {
 let learner=watch(await client.create("my_room",options(learnerToken)));rooms.push(learner);
 const opponent=watch(await client.joinById(learner.roomId,options(opponentToken)));rooms.push(opponent);
 const old=watch(await client.joinById(learner.roomId,options(oldToken)));rooms.push(old);
 const me=r=>r.state?.players?.get(r.sessionId),book=r=>JSON.parse(me(r).muayBookData);
 await until(()=>[learner,opponent,old].every(r=>me(r)?.persistent),"players joined");
 assert.ok(book(old).learned.includes("korat_press"),"old learned level-25 skill kept");assert.equal(book(old).slots[0],"korat_press");assert.deepEqual(book(old).mastery.korat,{technique:0,sequences:0});
 learner.send("muay_skill",{skillId:"korat_heavy",targetId:opponent.sessionId});await until(()=>seen(learner,"pvp_hit",e=>e.attackerId===learner.sessionId),"PvP hit");
 assert.deepEqual(book(learner).mastery.korat,{technique:4,sequences:2},"PvP grants no school mastery");
 learner.send("move",{x:0,z:0});await until(()=>Math.hypot(me(learner).x,me(learner).z)<5,"return shrine");await sleep(5600);
 learner.send("muay_book",{action:"learn",skillId:"korat_pierce"});await until(()=>seen(learner,"command_rejected",e=>e.reason==="muay_book_mastery"),"unmet mastery blocks learning");
 assert.ok(!book(learner).learned.includes("korat_pierce"));
 learner.send("move",{x:1,z:8});await until(()=>Math.hypot(me(learner).x,me(learner).z)>6.5,"leave shrine");
 await until(()=>learner.state.monster?.alive && Math.hypot(me(learner).x-learner.state.monster.x,me(learner).z-learner.state.monster.z)<2.4,"monster close");
 learner.send("muay_skill",{skillId:"korat_swing",targetId:"possessed-1"});await until(()=>book(learner).mastery.korat.technique===5,"monster technique counts");
 assert.equal(book(learner).mastery.korat.sequences,2);
 learner.send("move",{x:0,z:0});await until(()=>Math.hypot(me(learner).x,me(learner).z)<5,"return to learn");await sleep(5600);
 learner.send("muay_book",{action:"learn",skillId:"korat_pierce"});await until(()=>book(learner).learned.includes("korat_pierce"),"mastery unlocks skill");
 await sleep(600);const mark=events.get(learner.sessionId).length;learner.send("muay_book",{action:"learn",skillId:"korat_press"});
 await until(()=>events.get(learner.sessionId).slice(mark).some(e=>e.type==="command_rejected" && e.data.reason==="muay_book_mastery"),"level-25 mastery still required");
 const saved=book(learner);await learner.leave();rooms.splice(rooms.indexOf(learner),1);await sleep(350);
 learner=watch(await client.joinById(old.roomId,options(learnerToken)));rooms.push(learner);await until(()=>me(learner)?.persistent,"rejoin");assert.deepEqual(book(learner),saved);
 learner.send("muay_book",{action:"reset"});await until(()=>book(learner).learned.length===0,"reset skills");assert.deepEqual(book(learner).mastery.korat,{technique:5,sequences:2},"reset retains mastery");
 const series=watch(await client.create("my_room",options(seriesToken)));rooms.push(series);await until(()=>me(series)?.persistent && series.state.monsters?.get("forest_west_4")?.alive,"forest target");
 const monster=()=>series.state.monsters.get("forest_west_4");
 await until(()=>Math.hypot(me(series).x-monster().x,me(series).z-monster().z)<7,"forest monster in range");
 series.send("muay_skill",{skillId:"thasao_step",targetId:"forest_west_4"});await until(()=>book(series).mastery.thasao.technique===1,"moving step counts");
 series.send("muay_skill",{skillId:"teep",targetId:"forest_west_4"});await until(()=>seen(series,"muay_combo",e=>e.count===1 && e.next==="punch"),"combo starts");
 series.send("muay_skill",{skillId:"thasao_flurry",targetId:"forest_west_4"});await until(()=>seen(series,"muay_followup",e=>e.active && e.skillId==="thasao_finish"),"followup opens");
 series.send("muay_skill",{skillId:"thasao_finish",targetId:"forest_west_4"});await until(()=>book(series).mastery.thasao.sequences===1,"completed series counts");
 assert.deepEqual(book(series).mastery.thasao,{technique:1,sequences:1},"multi-hit and combined combo/followup count only once");
 console.log("PASS: legacy saves, PvP exclusion, monster training, learning gates, reset, persistence and school sequences");
} finally {for(const r of rooms.reverse())await r.leave().catch(()=>{});}
