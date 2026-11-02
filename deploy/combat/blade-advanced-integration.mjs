import assert from "node:assert/strict";
import {createHash,randomBytes} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {Client} from "@colyseus/sdk";
const url=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(url||"") || new URL(url).port==="4108" || !dir || !path.basename(dir).startsWith("montra-blade-test-"))
  throw Error("Requires isolated localhost server and temporary montra-blade-test-* data");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(read,label,timeout=12000){const end=Date.now()+timeout;while(Date.now()<end){const value=read();if(value)return value;await sleep(30);}throw Error("timeout: "+label);}
const sdk=new Client(url),rooms=new Set(),tokens=[0,1,2,3,4,5].map(()=>"mt1_"+randomBytes(32).toString("hex"));
async function seed(index,pathId,z){const id=createHash("sha256").update(tokens[index]).digest("hex"),slots=Array(12).fill(null);
  slots[0]={itemId:"health_potion",quantity:2};slots[1]={itemId:"ritual_dagger",quantity:1};
  const book={learned:["cloak","hidden_edge","marked_cut","piercing_edge","evade","counter","retreat"],slots:["piercing_edge","evade","counter","cloak"],practice:{ambush:12,mark:12,evade:0,combo:6},cooldowns:{}};
  await writeFile(path.join(dir,id+".json"),JSON.stringify({version:1,id,name:"Test"+index,level:19,experience:0,pkKills:0,pkDeaths:0,
    x:0,y:0,z,hp:160,mapId:"ritual_village",build:{path:pathId,ancestry:"woodland"},inventory:{version:1,slots,equippedWeaponSlot:1},
    ...(pathId==="blade"?{bladeBook:book}:{}),updatedAt:new Date().toISOString()}),{flag:"wx"});}
async function join(index,roomId){const opts={guestToken:tokens[index],worldVersion:1,templeVersion:1,atlasVersion:1};const room=roomId?await sdk.joinById(roomId,opts):await sdk.create("my_room",opts);rooms.add(room);const events=[];room.onMessage("*",(type,data)=>events.push({type,data}));await until(()=>room.state?.players?.get(room.sessionId)?.persistent,"join");return {room,events};}
async function event(client,type,predicate=()=>true){return (await until(()=>client.events.find(e=>e.type===type && predicate(e.data)),type)).data;}
async function send(client,type,data,want,predicate=()=>true){client.events.length=0;client.room.send(type,data);return event(client,want,predicate);}
try{
  await Promise.all([seed(0,"blade",0),seed(1,"sentinel",-1),seed(2,"blade",0),seed(3,"sentinel",-1),seed(4,"blade",0),seed(5,"sentinel",-1)]);
  const first=await join(0),victim=await join(1,first.room.roomId);
  const before=victim.room.state.players.get(victim.room.sessionId).hp;
  await send(first,"blade_skill",{skillId:"piercing_edge",targetId:victim.room.sessionId},"blade_skill_used",x=>x.skillId==="piercing_edge");
  await send(first,"move",{x:1,z:0},"command_rejected",x=>x.reason==="blade_windup_active");
  await event(first,"blade_windup",x=>x.result==="hit");
  await until(()=>victim.room.state.players.get(victim.room.sessionId).hp<before,"windup damage");
  const defender=await join(2),opponent=await join(3,defender.room.roomId);
  await send(defender,"blade_skill",{skillId:"piercing_edge",targetId:opponent.room.sessionId},"blade_skill_used",x=>x.skillId==="piercing_edge");
  defender.events.length=0;opponent.room.send("attack",{targetId:defender.room.sessionId});
  await event(defender,"blade_windup",x=>x.result==="interrupted");
  opponent.room.send("move",{x:0,z:-1});
  await sleep(1200); // Let the opponent's previous attack cooldown finish.
  await send(defender,"blade_skill",{skillId:"evade"},"blade_skill_used",x=>x.skillId==="evade");
  defender.events.length=0;opponent.room.send("attack",{targetId:defender.room.sessionId});
  await event(defender,"blade_evade",x=>x.success===true);
  await send(defender,"blade_skill",{skillId:"counter",targetId:opponent.room.sessionId},"blade_skill_used",x=>x.skillId==="counter");
  const state=await send(defender,"blade_book_get",{},"blade_book_state");
  assert.equal(state.book.practice.evade,0,"PvP cannot farm PvE practice");
  const caster=await join(4),interrupter=await join(5,caster.room.roomId);
  await send(caster,"blade_skill",{skillId:"cloak"},"blade_cloak_cast",x=>x.playerId===caster.room.sessionId);
  caster.events.length=0;interrupter.room.send("attack",{targetId:caster.room.sessionId});
  await event(caster,"blade_cloak_changed",x=>x.reason==="interrupted");
  assert.ok(interrupter.room.state.players.has(caster.room.sessionId),"interrupted caster remains visible");
  console.log("PASS: timed strike, movement lock, interruption, evade and PvP counter");
}finally{await Promise.allSettled([...rooms].map(room=>room.leave()));}
