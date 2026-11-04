import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {Client} from "@colyseus/sdk";

const url=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(url??"") || !dir || !/^montra-guild-test-/.test(path.basename(dir)))throw Error("Requires an isolated local test server");
const clients=new Set(),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const token=i=>"mt1_"+createHash("sha256").update("guild-recruitment-test-"+i).digest("hex");
async function waitFor(fn,label){for(let n=0;n<250;n++){const v=fn();if(v)return v;await sleep(40);}throw Error("timeout: "+label);}
async function seed(i){
  const id=createHash("sha256").update(token(i)).digest("hex"),slots=Array(12).fill(null);
  slots[0]={itemId:"health_potion",quantity:2};slots[1]={itemId:"ritual_dagger",quantity:1};
  await writeFile(path.join(dir,id+".json"),JSON.stringify({version:1,id,name:"ผู้ทดสอบ "+i,level:12,experience:0,pkKills:0,pkDeaths:0,x:0,y:0,z:0,hp:416,mapId:"ritual_village",inventory:{version:1,slots,equippedWeaponSlot:1},updatedAt:new Date().toISOString()}),{flag:"wx"});
}
async function join(i){
  const room=await new Client(url).create("my_room",{guestToken:token(i),worldVersion:1,templeVersion:1,atlasVersion:1});
  clients.add(room);const events=[];room.onMessage("*",(type,data)=>events.push({type,data}));
  await waitFor(()=>room.state?.players?.get(room.sessionId),"join");return {room,events};
}
async function send(c,type,payload,expected,match=()=>true){
  c.events.length=0;c.room.send(type,payload);
  return (await waitFor(()=>c.events.find(e=>e.type===expected && match(e.data)),expected)).data;
}
try{
  await seed(1);await seed(2);await seed(3);
  const leader=await join(1),applicant=await join(2),stranger=await join(3);
  assert.notEqual(leader.room.roomId,applicant.room.roomId);
  const guild=await send(leader,"guild_create",{name:"นาคพิทักษ์"},"guild_state",x=>x?.name==="นาคพิทักษ์");
  const result=await send(applicant,"guild_search",{query:"พิทักษ์"},"guild_directory");
  assert.equal(result.guilds[0].id,guild.id);assert.equal(result.guilds[0].members,1);
  leader.events.length=0;
  await send(applicant,"guild_apply",{guildId:guild.id},"guild_notice",x=>x.reason==="application_sent");
  const received=await waitFor(()=>leader.events.find(e=>e.type==="guild_recruitment" && e.data.applications.length===1),"cross-room application");
  const id=received.data.applications[0].id;
  await send(stranger,"guild_application_decide",{id,accept:true},"guild_error",x=>x.reason==="guild_officer_required");
  await applicant.room.leave();clients.delete(applicant.room);await sleep(250);
  await send(leader,"guild_application_decide",{id,accept:true},"guild_state",x=>x?.members?.length===2);
  const rejoined=await join(2);
  const state=await send(rejoined,"get_guild",{},"guild_state",x=>x?.members?.length===2);
  assert.equal(state.name,"นาคพิทักษ์");
  console.log("PASS: cross-room search, application, permission, offline approval and rejoin");
}finally{for(const room of clients)await room.leave().catch(()=>{});}
