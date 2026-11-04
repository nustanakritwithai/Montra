import assert from "node:assert/strict";
import path from "node:path";
import {DatabaseSync} from "node:sqlite";
import {Client} from "@colyseus/sdk";
const url=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(url??"") || new URL(url).port==="4108" ||
  !dir || !path.basename(dir).startsWith("montra-account-test-") || process.env.MONTRA_MASTERY_ENABLED!=="1")throw Error("Isolated mastery server required");
const sdk=new Client(url),sleep=ms=>new Promise(r=>setTimeout(r,ms)),db=new DatabaseSync(path.join(dir,"economy.sqlite"));
const rooms=new Set();
async function api(route,session,body){const r=await fetch(url+"/montra/account/"+route,{method:body?"POST":"GET",headers:{"content-type":"application/json",...(session?{authorization:"Bearer "+session}:{})},...(body?{body:JSON.stringify(body)}:{})});assert.equal(r.status,200);return r.json();}
async function until(read,label,limit=8000){for(const end=Date.now()+limit;Date.now()<end;){const v=read();if(v)return v;await sleep(40);}throw Error("Timeout: "+label);}
const flags={characterSlot:1,worldVersion:1,templeVersion:1,atlasVersion:1,provinceVersion:1,terrainVersion:1,atlasReliefVersion:1,originalReliefVersion:1,monsterAutoAttackVersion:1};
async function enter(session,setup,roomId){
  const opts={...flags,accountSession:session,...(setup?{characterSetup:setup}:{})};
  const room=roomId?await sdk.joinById(roomId,opts):await sdk.create("my_room",opts);rooms.add(room);
  const events=[];room.onMessage("*",(type,data)=>events.push({type,data}));
  const me=()=>room.state.players?.get(room.sessionId);
  await until(()=>me()?.persistent,"join");return {room,me,events};
}
async function leave(active){await active.room.leave();rooms.delete(active.room);await sleep(250);}
async function status(active){await sleep(1050);active.events.length=0;active.room.send("get_character_status",{});return until(()=>active.events.find(e=>e.type==="character_status")?.data,"status");}
const read=id=>JSON.parse(db.prepare("SELECT snapshot FROM characters WHERE id=?").get(id).snapshot);
function seed(id,fields){const s={...read(id),...fields};delete s.masteryVitals;db.prepare("UPDATE characters SET snapshot=? WHERE id=?").run(JSON.stringify(s),id);}
try{
  const session=(await api("guest",null,{})).session;
  let a=await enter(session,{name:"ผู้ชำนาญ",build:{path:"seer",ancestry:"shrine"}});
  const revision=(await api("slots",session)).slots[0].revision;await leave(a);
  const paths=["muay_boran","phutthaisawan","blade","sentinel","seer","mender"];
  const rebirth={count:15,creditedCycle:15,highest:Object.fromEntries(paths.map(p=>[p,100])),mastery:Object.fromEntries(paths.map(p=>[p,2]))};
  seed(revision,{level:100,experience:0,rebirth,hp:1000,mana:318,mapId:"ritual_village",x:-10,y:0,z:8});
  a=await enter(session);let s=await status(a);assert.equal(s.mastery.enabled,true);assert.equal(s.mastery.mode,"pve");
  assert(a.me().maxMana>320);await until(()=>a.me().mana===a.me().maxMana,"expanded mana fills");
  const full=a.me().mana;await leave(a);let saved=read(revision);
  assert(saved.mana<=320);assert.equal(saved.masteryVitals.version,1);
  a=await enter(session);assert.equal(a.me().mana,full,"mana above the old cap survives reconnect");
  const second=(await api("guest",null,{})).session;
  let b=await enter(second,{name:"คู่ฝึก",build:{path:"muay_boran",ancestry:"shrine"}});
  const id2=(await api("slots",second)).slots[0].revision;await leave(b);
  seed(id2,{level:100,experience:0,hp:1800,mana:318,mapId:"ritual_village",x:-10,y:0,z:9.5});
  b=await enter(second,null,a.room.roomId);
  a.room.send("attack",{targetId:b.room.sessionId});
  await until(()=>a.events.some(e=>e.type==="pvp_hit"),"first PvP hit");
  a.room.send("move",{x:-11,z:8});
  s=await status(a);assert.equal(s.mastery.mode,"pvp");assert(a.me().maxMana<full);
  const pvpMax=a.me().maxMana;await leave(a);saved=read(revision);assert(saved.masteryVitals.pvpUntil>Date.now());
  a=await enter(session,null,b.room.roomId);assert.equal(a.me().maxMana,pvpMax,"rejoin retains the PvP context");
  await leave(a);await leave(b);
  assert.deepEqual(read(revision).rebirth,rebirth);
  console.log("PASS live mastery save: legacy load, >320 mana, reconnect, first PvP hit and persistent PvP context");
}finally{for(const room of rooms)await room.leave().catch(()=>{});db.close();}
