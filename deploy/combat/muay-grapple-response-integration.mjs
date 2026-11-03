import assert from "node:assert/strict";
import {createHash,randomBytes} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {Client} from "@colyseus/sdk";
const url=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(url||"") || new URL(url).port==="4108" || !dir || !path.basename(dir).startsWith("montra-buff-test-"))throw Error("requires isolated localhost and temporary data");
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label,timeout=9000){const end=Date.now()+timeout;while(Date.now()<end){const r=fn();if(r)return r;await sleep(25);}throw Error("timeout: "+label);}
const token=()=>"mt1_"+randomBytes(32).toString("hex"),tokens=Array.from({length:9},token);
async function seed(t,name,x,z,job="muay_boran",stamina=100,hp=9999){
 const id=createHash("sha256").update(t).digest("hex"),slots=Array(12).fill(null),base=["grapple","punch","guard","counter"];
 slots[0]={itemId:"health_potion",quantity:3};if(job==="muay_boran")slots[1]={itemId:"muay_wraps",quantity:1};
 const loadouts={chaiya:[...base],korat:[...base],lopburi:[...base],thasao:[...base]};
 await writeFile(path.join(dir,id+".json"),JSON.stringify({version:1,id,name,level:10,experience:0,pkKills:0,pkDeaths:0,x,y:0,z,hp,stamina,mapId:"ritual_village",build:{path:job,ancestry:"woodland"},muayWrapGranted:job==="muay_boran",muayBook:{school:"chaiya",learned:[...base],training:{strikes:10,blocks:1},slots:[...base],loadouts},inventory:{version:1,slots,equippedWeaponSlot:job==="muay_boran"?1:null},updatedAt:new Date().toISOString()}),{flag:"wx"});
}
await seed(tokens[0],"ผู้จับ",-10,8);await seed(tokens[1],"ผู้แก้จับ",-10,9.4,"seer");
await seed(tokens[2],"ผู้จับสอง",-14,8);await seed(tokens[3],"แรงไม่พอ",-14,9.4,"seer",0);
await seed(tokens[4],"ผู้จับสาม",-11,9.4);await seed(tokens[5],"ผู้จับสี่",-17,8);await seed(tokens[6],"จังหวะหมด",-17,9.4,"seer");
await seed(tokens[7],"ผู้จับเลือดน้อย",10,10,"muay_boran",100,1);await seed(tokens[8],"ผู้สวน",10,8.6,"seer");
const client=new Client(url),options=guestToken=>({guestToken,worldVersion:1,templeVersion:1,atlasVersion:1,provinceVersion:1}),rooms=[];
const eventMap=new Map(),watch=r=>{const e=[];eventMap.set(r.sessionId,e);r.onMessage("*",(type,data)=>e.push({type,data}));return r;};
const seen=(r,type,predicate=()=>true)=>eventMap.get(r.sessionId).find(e=>e.type===type && predicate(e.data));
const hits=(r,source)=>eventMap.get(r.sessionId).filter(e=>e.type==="pvp_hit" && e.data.source===source && e.data.attackerId===r.sessionId);
try {
 const a=watch(await client.create("my_room",options(tokens[0])));rooms.push(a);
 for(const t of tokens.slice(1,4)){const r=watch(await client.joinById(a.roomId,options(t)));rooms.push(r);}
 let [,victim,b,low]=rooms;const p=id=>a.state?.players?.get(id);
 await until(()=>rooms.every(r=>p(r.sessionId)?.persistent),"first players joined");
 b.send("muay_skill",{skillId:"grapple",targetId:low.sessionId});await until(()=>seen(low,"muay_grapple",e=>e.phase==="held"),"low stamina held");
 low.send("grapple_escape",{});await until(()=>seen(low,"command_rejected",e=>e.reason==="insufficient_stamina"),"low stamina cannot escape");
 await until(()=>seen(low,"muay_grapple",e=>e.phase==="released" && e.reason==="ended"),"hold times out");
 assert.equal(Boolean(seen(low,"muay_grapple_counter",e=>e.active)),false,"timeout never grants a counter");
 for(const t of tokens.slice(4,7)){const r=watch(await client.joinById(a.roomId,options(t)));rooms.push(r);}
 let [, , , ,c,expiryHolder,expiryVictim]=rooms;
 await until(()=>rooms.every(r=>p(r.sessionId)?.persistent),"all players joined");
 const initialStamina=p(victim.sessionId).stamina;
 victim.send("grapple_counter",{targetId:c.sessionId});await until(()=>seen(victim,"command_rejected",e=>e.reason==="invalid_grapple_response"),"forged counter rejected");
 await sleep(600);victim.send("grapple_escape",{});await until(()=>seen(victim,"command_rejected",e=>e.reason==="muay_grapple_ended"),"escape requires an active hold");
 assert.ok(p(victim.sessionId).stamina>=initialStamina,"invalid escape has no cost");
 await sleep(600);a.send("muay_skill",{skillId:"grapple",targetId:victim.sessionId});await until(()=>seen(victim,"muay_grapple",e=>e.phase==="held"),"seer held");
 const beforeEscape=p(victim.sessionId).stamina;victim.send("grapple_escape",{});
 await until(()=>seen(a,"muay_grapple",e=>e.phase==="released" && e.reason==="escaped"),"holder informed");
 await until(()=>seen(victim,"muay_grapple_counter",e=>e.active && e.stamina===18),"escape opens counter");
 await until(()=>p(victim.sessionId).stamina<beforeEscape-10,"escape stamina charged");
 victim.send("grapple_counter",{targetId:c.sessionId,damage:99999});await until(()=>eventMap.get(victim.sessionId).filter(e=>e.type==="command_rejected" && e.data.reason==="invalid_grapple_response").length>=2,"counter cannot choose target or damage");
 const opponent=p(a.sessionId),striker=p(victim.sessionId),base=Math.max(1,Math.round((striker.atk*0.75)*(100*(1+(opponent.level-1)/15))/(100*(1+(opponent.level-1)/15)+opponent.def)));
 victim.send("grapple_counter",{});const hit=await until(()=>hits(victim,"grapple_counter")[0]?.data,"valid counter");
 assert.equal(hit.targetId,a.sessionId);assert.equal(hit.damage,base);assert.equal(p(victim.sessionId).pathId,"seer");
 victim.send("grapple_counter",{});await sleep(300);assert.equal(hits(victim,"grapple_counter").length,1,"counter cannot be replayed");
 c.send("muay_skill",{skillId:"grapple",targetId:victim.sessionId});await until(()=>seen(c,"command_rejected",e=>e.reason==="muay_grapple_resisted"),"escape retains resistance");
 await victim.leave();rooms.splice(rooms.indexOf(victim),1);await sleep(300);victim=watch(await client.joinById(a.roomId,options(tokens[1])));rooms.push(victim);
 await until(()=>p(victim.sessionId)?.persistent,"victim reconnect");await sleep(350);const mark=eventMap.get(c.sessionId).length;
 c.send("muay_skill",{skillId:"grapple",targetId:victim.sessionId});await until(()=>eventMap.get(c.sessionId).slice(mark).some(e=>e.type==="command_rejected" && e.data.reason==="muay_grapple_resisted"),"same character retains resistance on reconnect");
 expiryHolder.send("muay_skill",{skillId:"grapple",targetId:expiryVictim.sessionId});await until(()=>seen(expiryVictim,"muay_grapple",e=>e.phase==="held"),"expiry hold");
 expiryVictim.send("grapple_escape",{});await until(()=>seen(expiryVictim,"muay_grapple_counter",e=>e.active),"expiry opportunity");
 await until(()=>seen(expiryVictim,"muay_grapple_counter",e=>e.active===false && e.reason==="ended"),"counter window expires");
 expiryVictim.send("grapple_counter",{});await until(()=>seen(expiryVictim,"command_rejected",e=>e.reason==="muay_grapple_counter_ended"),"expired counter rejected");assert.equal(hits(expiryVictim,"grapple_counter").length,0);
 const koHolder=watch(await client.joinById(a.roomId,options(tokens[7])));rooms.push(koHolder);
 const koVictim=watch(await client.joinById(a.roomId,options(tokens[8])));rooms.push(koVictim);
 await until(()=>p(koHolder.sessionId)?.persistent && p(koVictim.sessionId)?.persistent,"knockout players");
 koHolder.send("muay_skill",{skillId:"grapple",targetId:koVictim.sessionId});await until(()=>seen(koVictim,"muay_grapple",e=>e.phase==="held"),"knockout hold");
 koVictim.send("grapple_escape",{});await until(()=>seen(koVictim,"muay_grapple_counter",e=>e.active),"knockout opportunity");
 koVictim.send("grapple_counter",{});await until(()=>seen(koVictim,"pvp_kill",e=>e.winnerId===koVictim.sessionId && e.loserId===koHolder.sessionId),"counter knockout");
 koVictim.send("grapple_counter",{});await sleep(400);
 assert.equal(eventMap.get(koVictim.sessionId).filter(e=>e.type==="pvp_kill" && e.data.loserId===koHolder.sessionId).length,1);
 assert.equal(p(koVictim.sessionId).pkKills,1);assert.equal(p(koHolder.sessionId).pkDeaths,1);
 console.log("PASS: universal escape, stamina, target validation, single counter, resistance after reconnect, expiry and knockout");
} finally {for(const r of rooms.reverse())await r.leave().catch(()=>{});}
