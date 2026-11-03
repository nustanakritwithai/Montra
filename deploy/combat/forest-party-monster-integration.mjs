/** A private localhost server and a disposable montra-monster-test-* folder only. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir,writeFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "@colyseus/sdk";
const endpoint=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(endpoint||"") || !dir || !/^montra-monster-test-/.test(path.basename(dir))) throw new Error("Requires localhost and disposable montra-monster-test-* data");
const token=ch=>"mt1_"+ch.repeat(64), sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label,ms=8000){const end=Date.now()+ms;while(Date.now()<end){const value=fn();if(value)return value;await sleep(40);}throw new Error("timeout: "+label);}
async function seed(t,x){const id=createHash("sha256").update(t).digest("hex");const slots=new Array(12).fill(null);slots[0]={itemId:"health_potion",quantity:2};slots[1]={itemId:"ritual_dagger",quantity:1};slots[2]={itemId:"arcane_sword",quantity:1};slots[3]={itemId:"spirit_staff",quantity:1};const data={version:1,id,name:"นักเดินทาง",level:1,experience:0,pkKills:0,pkDeaths:0,x,y:0,z:-17,hp:240,mapId:"forbidden_forest",inventory:{version:1,slots,equippedWeaponSlot:1},updatedAt:new Date().toISOString()};await writeFile(path.join(dir,id+".json"),JSON.stringify(data),{flag:"wx"});}
const rooms=[];
function monitor(room){const events=[];room.onMessage("*",(type,data)=>events.push({type,data}));return events;}
const last=(events,type,predicate=()=>true)=>events.findLast(e=>e.type===type&&predicate(e.data))?.data;
try {
  await mkdir(dir,{recursive:true});await seed(token("a"),-33);await seed(token("b"),-32.5);
  const a=await new Client(endpoint).create("my_room",{guestToken:token("a"),worldVersion:1});rooms.push(a);const ae=monitor(a);
  const b=await new Client(endpoint).joinById(a.roomId,{guestToken:token("b"),worldVersion:1});rooms.push(b);const be=monitor(b);
  await until(()=>a.state?.monsters?.get("forest_west_1")&&a.state.players.size===2,"forest initialized");
  assert.equal(a.state.monsters.get("forest_west_1").maxHp,200);
  a.send("party_invite",{targetId:b.sessionId});const invite=await until(()=>last(be,"party_invitation"),"invite");
  b.send("party_accept",{inviteId:invite.inviteId});await until(()=>last(ae,"party_state",x=>x.members.length===2),"party formed");
  a.send("attack",{targetId:"forest_west_1"});
  await until(()=>a.state.players.get(a.sessionId)?.experience===68 && b.state.players.get(b.sessionId)?.experience===68,"forest party EXP",25000);
  assert.equal(a.state.monsters.get("forest_west_1").alive,false);
  assert.equal(a.state.monsters.get("forest_west_2").alive,true);
  console.log("PASS: forest profile, server combat, independent kill and equal party EXP in SQLite mode");
} finally {for(const room of rooms.reverse())await room.leave().catch(()=>{});}
