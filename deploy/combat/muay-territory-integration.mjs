import assert from "node:assert/strict";
import {createHash,randomBytes} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {Client} from "@colyseus/sdk";
const url=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(url||"") || new URL(url).port==="4108" || !dir || !path.basename(dir).startsWith("montra-muay-war-test-"))throw Error("Requires isolated Muay territory server and temporary data");
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label,timeout=25000){const end=Date.now()+timeout;while(Date.now()<end){const value=fn();if(value)return value;await sleep(40);}throw Error("timeout: "+label);}
const token=()=>"mt1_"+randomBytes(32).toString("hex"),tokens=[token(),token(),token()],open=new Set(),sdk=new Client(url);
async function seed(index){
 const id=createHash("sha256").update(tokens[index]).digest("hex"),slots=Array(12).fill(null),muay=index!==1;
 slots[0]={itemId:"health_potion",quantity:2};slots[1]={itemId:muay?"muay_wraps":"ritual_dagger",quantity:1};
 await writeFile(path.join(dir,id+".json"),JSON.stringify({version:1,id,name:"Fighter"+index,level:12,experience:0,pkKills:0,pkDeaths:0,
  x:index===1?0:12,y:0,z:index===1?26:-36,hp:416,mapId:"moon_pass",build:{path:muay?"muay_boran":"seer",ancestry:"woodland"},muayWrapGranted:muay,
  inventory:{version:1,slots,equippedWeaponSlot:1},updatedAt:new Date().toISOString()}),{flag:"wx"});
}
async function join(index,roomId,ticket){
 const opts={guestToken:tokens[index],warTicket:ticket,worldVersion:1,templeVersion:1,atlasVersion:1,provinceVersion:1,warVersion:1};
 const r=roomId?await sdk.joinById(roomId,opts):await sdk.create("my_room",opts);open.add(r);
 const events=[];r.onMessage("*",(type,data)=>events.push({type,data}));
 const me=()=>r.state?.players?.get(r.sessionId);await until(()=>me()?.persistent,"player joined");return {r,events,me,index};
}
async function event(c,type,predicate=()=>true,timeout=10000){return (await until(()=>c.events.find(e=>e.type===type && predicate(e.data)),type,timeout)).data;}
async function send(c,type,data,want,predicate){c.events.length=0;c.r.send(type,data);return event(c,want,predicate);}
async function transfer(c,verb){const t=await send(c,verb,{},"territory_transfer");await c.r.leave();open.delete(c.r);await sleep(250);return join(c.index,t.roomId,t.ticket);}
async function walk(c,x,z){c.r.send("move",{x,z});await until(()=>Math.hypot(c.me().x-x,c.me().z-z)<0.3,"walk "+x+","+z,30000);}
try {
 for(let i=0;i<3;i++)await seed(i);
 let attacker=await join(0),defender=await join(1,attacker.r.roomId),ally=await join(2,attacker.r.roomId);
 const suffix=randomBytes(4).toString("hex");
 await send(attacker,"guild_create",{name:"MuayA"+suffix},"guild_state",s=>s?.name==="MuayA"+suffix);
 await send(defender,"guild_create",{name:"MuayB"+suffix},"guild_state",s=>s?.name==="MuayB"+suffix);
 attacker.r.send("guild_invite",{targetId:ally.r.sessionId});const invite=await event(ally,"guild_invitation");
 await send(ally,"guild_accept",{inviteId:invite.inviteId},"guild_state",s=>s?.name==="MuayA"+suffix);
 attacker=await transfer(attacker,"territory_start");defender=await transfer(defender,"territory_join");ally=await transfer(ally,"territory_join");
 assert.equal(attacker.r.roomId,defender.r.roomId);assert.equal(attacker.r.roomId,ally.r.roomId);
 await event(attacker,"territory_state",s=>s.local?.phase==="battle" && s.local.inField);
 await Promise.all([walk(attacker,5,19),walk(ally,6,19)]);
 await send(attacker,"muay_skill",{skillId:"grapple",targetId:ally.r.sessionId},"command_rejected",s=>s.reason==="target_unavailable");
 assert.equal(JSON.parse(attacker.me().muayData).grapple,undefined,"same-side rejection cannot spend cooldown");
 await Promise.all([(async()=>{await walk(attacker,0,0);await walk(attacker,0,-10);await walk(attacker,-6,-10);})(),(async()=>{await walk(defender,0,-10);await walk(defender,-7.5,-10);})()]);
 attacker.events.length=0;defender.events.length=0;
 attacker.r.send("muay_skill",{skillId:"grapple",targetId:defender.r.sessionId});
 await event(defender,"muay_grapple",s=>s.phase==="held" && s.role==="victim");
 defender.r.send("grapple_escape",{});await event(defender,"muay_grapple_counter",s=>s.active===true);
 defender.r.send("grapple_counter",{});
 const hit=await event(defender,"pvp_hit",s=>s.source==="grapple_counter" && s.attackerId===defender.r.sessionId && s.targetId===attacker.r.sessionId);
 assert.ok(hit.damage>0);console.log("PASS: Muay cannot grab same war side; opposing sides can grapple, escape and counter");
} finally {await Promise.allSettled([...open].map(r=>r.leave()));}
