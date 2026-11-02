import assert from "node:assert/strict";
import {createHash,randomBytes} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {Client} from "@colyseus/sdk";
const url=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(url||"") || new URL(url).port==="4108" || !dir || !path.basename(dir).startsWith("montra-blade-test-"))
  throw Error("Requires isolated localhost server and temporary montra-blade-test-* data");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(read,label,timeout=12000){const end=Date.now()+timeout;while(Date.now()<end){const value=read();if(value)return value;await sleep(40);}throw Error("timeout: "+label);}
const sdk=new Client(url),rooms=new Set(),token="mt1_"+randomBytes(32).toString("hex"),basicToken="mt1_"+randomBytes(32).toString("hex");
const id=createHash("sha256").update(token).digest("hex"),slots=Array(12).fill(null);
slots[0]={itemId:"health_potion",quantity:2};slots[1]={itemId:"ritual_dagger",quantity:1};
const book={learned:["cloak","hidden_edge","marked_cut","piercing_edge","sever_mark","evade","counter","retreat","killer_focus"],
  slots:["cloak","hidden_edge","marked_cut","sever_mark"],practice:{ambush:12,mark:12,evade:5,combo:6},cooldowns:{}};
await writeFile(path.join(dir,id+".json"),JSON.stringify({version:1,id,name:"BladeTest",level:19,experience:0,pkKills:0,pkDeaths:0,
  x:0,y:0,z:0,hp:160,mapId:"ritual_village",build:{path:"blade",ancestry:"woodland"},
  inventory:{version:1,slots,equippedWeaponSlot:1},bladeBook:book,updatedAt:new Date().toISOString()}),{flag:"wx"});
const basicId=createHash("sha256").update(basicToken).digest("hex");
await writeFile(path.join(dir,basicId+".json"),JSON.stringify({version:1,id:basicId,name:"BladeBasic",level:1,experience:0,pkKills:0,pkDeaths:0,
  x:0,y:0,z:0,hp:100,mapId:"ritual_village",build:{path:"blade",ancestry:"woodland"},inventory:{version:1,slots,equippedWeaponSlot:1},
  bladeBook:{learned:["cloak"],slots:["cloak",null,null,null],practice:{ambush:0,mark:0,evade:0,combo:0},cooldowns:{}},updatedAt:new Date().toISOString()}),{flag:"wx"});
async function join(roomId,guestToken=token){const opts={guestToken,worldVersion:1,templeVersion:1,atlasVersion:1};const room=roomId?await sdk.joinById(roomId,opts):await sdk.create("my_room",opts);rooms.add(room);const events=[];room.onMessage("*",(type,data)=>events.push({type,data}));await until(()=>room.state?.players?.get(room.sessionId)?.persistent,"join");return {room,events};}
async function send(client,type,data,want,predicate=()=>true){client.events.length=0;client.room.send(type,data);return (await until(()=>client.events.find(e=>e.type===want && predicate(e.data)),want)).data;}
try{
  let blade=await join(),monster=blade.room.state.monster;
  await send(blade,"blade_skill",{skillId:"hidden_edge",targetId:monster.id,damage:999999},"command_rejected",x=>x.reason==="invalid_blade_skill");
  await sleep(600);
  await send(blade,"blade_skill",{skillId:"cloak"},"blade_cloak_changed",x=>x.active===true);
  blade.room.send("move",{x:monster.x,z:monster.z-1.8});
  await until(()=>Math.hypot(blade.room.state.players.get(blade.room.sessionId).x-monster.x,blade.room.state.players.get(blade.room.sessionId).z-monster.z)<2.9,"approach while cloaked",5000);
  assert.notEqual(monster.targetId,blade.room.sessionId,"normal monster cannot detect cloaked target at this distance");
  const initial=monster.hp;
  await send(blade,"blade_skill",{skillId:"hidden_edge",targetId:monster.id},"blade_skill_used",x=>x.skillId==="hidden_edge");
  await until(()=>monster.hp<initial,"ambush damage");
  await send(blade,"blade_skill",{skillId:"marked_cut",targetId:monster.id},"blade_skill_used",x=>x.skillId==="marked_cut");
  await send(blade,"blade_skill",{skillId:"sever_mark",targetId:monster.id},"command_rejected",x=>x.reason==="blade_mark_required");
  let state=await send(blade,"blade_book_get",{},"blade_book_state");
  assert.equal(state.book.practice.ambush,13);assert.equal(state.book.practice.mark,14);assert.equal(state.book.practice.combo,7);
  await blade.room.leave();rooms.delete(blade.room);await sleep(350);
  blade=await join();state=await send(blade,"blade_book_get",{},"blade_book_state");
  assert.equal(state.book.practice.ambush,13);assert.equal(state.book.practice.mark,14);assert.ok(state.book.cooldowns.cloak>0);
  const basic=await join(undefined,basicToken);
  await send(basic,"blade_skill",{skillId:"cloak"},"blade_cloak_changed",x=>x.active===true);
  basic.events.length=0;basic.room.send("attack",{targetId:basic.room.state.monster.id});
  await until(()=>basic.events.some(e=>e.type==="blade_cloak_changed" && e.data.reason==="attack"),"normal attack reveals cloak",8000);
  state=await send(basic,"blade_book_get",{},"blade_book_state");
  assert.equal(state.book.practice.ambush,1,"ordinary attack trains the first ambush prerequisite");
  console.log("PASS: server-owned ambush, mark consumption, practice and reconnect cooldown");
}finally{await Promise.allSettled([...rooms].map(room=>room.leave()));}
