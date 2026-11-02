import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import path from "node:path";
import {Client} from "@colyseus/sdk";
const url=process.env.MONTRA_TEST_URL, dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(url||"")||!dir||!path.basename(dir).startsWith("montra-buff-test-"))throw Error("requires isolated server");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label,timeout=10000){const end=Date.now()+timeout;while(Date.now()<end){const v=fn();if(v)return v;await sleep(30);}throw Error(label);}
const token="mt1_"+randomBytes(32).toString("hex"), client=new Client(url);
const opts={guestToken:token,characterSlot:1,worldVersion:1,templeVersion:1,atlasVersion:1};
let room=await client.create("my_room",opts);
try {
  const me=()=>room.state?.players?.get(room.sessionId);
  const hits=[];
  room.onMessage("combat_hit",hit=>{if(hit.attackerId===room.sessionId)hits.push({hit,at:Date.now()});});
  await until(()=>me()?.persistent,"join");
  assert.ok(JSON.parse(room.state.buildCatalog).paths.phutthaisawan, "new class in client catalog");
  room.send("select_build",{path:"phutthaisawan",ancestry:"woodland"});
  await until(()=>me().pathId==="phutthaisawan","choose class");
  room.send("equip_weapon",{slot:2});
  await until(()=>me().equippedWeaponId==="arcane_sword","equip");
  room.send("cast_class_skill",{});
  await until(()=>me().atk===24,"skill buff");
  room.send("move",{x:1,z:7.5});
  await until(()=>Math.hypot(me().x,me().z)>6.4,"leave rest area");
  room.send("attack",{targetId:"possessed-1"});
  await until(()=>hits.length>=2,"two strikes",15000);
  const interval=hits[1].at-hits[0].at;
  assert.ok(interval>=600&&interval<=950,"unexpected strike interval "+interval);
  assert.ok(hits[0].hit.damage>0);
  await room.leave();await sleep(500);
  room=await client.create("my_room",opts);
  await until(()=>room.state?.players?.get(room.sessionId)?.persistent,"rejoin");
  assert.equal(room.state.players.get(room.sessionId).pathId,"phutthaisawan");
  assert.equal(room.state.players.get(room.sessionId).equippedWeaponId,"arcane_sword");
  console.log("PASS: select and persist dual-sword class, equip sword, class buff and 750ms attacks");
} finally {await room.leave().catch(()=>{});}
