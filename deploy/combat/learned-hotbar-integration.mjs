import assert from "node:assert/strict";
import path from "node:path";
import {randomBytes} from "node:crypto";
import {Client} from "@colyseus/sdk";

const url=process.env.MONTRA_TEST_URL, data=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(url||"") || new URL(url).port==="4108" ||
   !data || !path.basename(data).startsWith("montra-account-test-")) throw Error("Use an isolated account room and temporary characters");
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label){const end=Date.now()+8000;while(Date.now()<end){const result=check();if(result)return result;await sleep(30);}throw Error(label);}
const credentials={username:"slots_"+randomBytes(6).toString("hex"),password:"sample-123-hotbar"};
const api=async route=>{const r=await fetch(url+"/montra/account/"+route,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(credentials)});assert.equal(r.status,200);return r.json();};
await api("register");const {session}=await api("login");
const sdk=new Client(url),flags={accountSession:session,worldVersion:1,templeVersion:1,atlasVersion:1,provinceVersion:1,originalReliefVersion:1,atlasReliefVersion:1,castleVersion:2,riverCityVersion:1,terrainVersion:1};
for(const [slot,job,first] of [[1,"seer","seer_mark"],[2,"muay_boran","guard"]]){
  const room=await sdk.create("my_room",{...flags,characterSlot:slot,characterSetup:{name:"ทดสอบวิชา"+slot,build:{path:job,ancestry:"shrine"}}});
  const events=[];room.onMessage("*",(type,data)=>events.push({type,data}));
  const own=()=>room.state?.players?.get(room.sessionId);
  async function send(type,payload,reply,check){
    // A room throttles rejection notices and shrine commands; exercise independent requests.
    await sleep(1200);const start=events.length;room.send(type,payload);
    return until(()=>events.slice(start).find(e=>e.type===reply && check(e.data)),type+" → "+reply);
  }
  try{
    await until(()=>own()?.persistent,"character join");
    if(job==="seer"){
      const fresh=await send("occult_book_get",{},"occult_book_state",()=>true);
      assert.deepEqual(fresh.data.book.loadouts.seer,[null,null,null,null]);assert.deepEqual(fresh.data.book.learned.seer,[]);
      // The seer's core pot works before any optional occult lesson is learned.
      await send("pot_summon",{},"summon_spawn",e=>e.ownerId===room.sessionId && e.kind==="pot_spirit");
      await send("unsummon",{},"summon_despawn",e=>e.ownerId===room.sessionId && e.reason==="dismissed");
      for(const [type,payload] of [["possess",{}],["apply_talisman",{targetId:"possessed-1"}],["blessed_rice",{targetId:"possessed-1"}],["shoot",{targetId:"possessed-1"}],["cast_class_skill",{}]]){
        await send(type,payload,"command_rejected",e=>e.reason===(type==="cast_class_skill"?"use_learned_skill":"occult_skill_locked"));
      }
      assert.equal(room.state.summons.has(room.sessionId),false);
      await send("occult_skill",{skillId:first,targetId:"possessed-1"},"command_rejected",e=>e.reason==="occult_skill_locked");
      await sleep(550);
      await send("occult_book",{action:"learn",skillId:first},"occult_book_changed",()=>true);
      await sleep(550);
      await send("occult_book",{action:"equip",slot:2,skillId:first},"occult_book_changed",()=>true);
      const saved=await send("occult_book_get",{},"occult_book_state",()=>true);assert.deepEqual(saved.data.book.loadouts.seer,[null,null,first,null]);
      room.send("move",{x:1,z:7});await until(()=>Math.hypot(own().x-1,own().z-7)<1,"approach target");
      await send("occult_skill",{skillId:first,targetId:room.state.monster.id},"occult_skill_used",e=>e.skillId===first);
    }else{
      const book=()=>JSON.parse(own().muayBookData);
      assert.deepEqual(book().slots,[null,null,null,null]);
      await send("muay_skill",{skillId:first},"command_rejected",e=>e.reason==="muay_skill_locked");
      await send("muay_book",{action:"equip",slot:1,skillId:first},"command_rejected",e=>e.reason==="muay_skill_locked");
      await sleep(650);await send("muay_book",{action:"learn",skillId:"grapple"},"command_rejected",e=>e.reason==="muay_book_level");
      await sleep(650);await send("muay_book",{action:"learn",skillId:first},"muay_book_changed",()=>true);
      await send("muay_skill",{skillId:first},"command_rejected",e=>e.reason==="muay_skill_locked");
      await sleep(650);await send("muay_book",{action:"equip",slot:1,skillId:first},"muay_book_changed",()=>true);
      await until(()=>book().slots[1]===first,"equipped");
      await sleep(650);await send("muay_book",{action:"reset"},"muay_book_changed",()=>true);
      await until(()=>book().slots.every(x=>x===null),"reset slots");
    }
  }finally{await room.leave();await sleep(400);}
}
console.log("PASS: core spirit summon, empty learned slots, level gates, equipment, reset and retired actions verified");
