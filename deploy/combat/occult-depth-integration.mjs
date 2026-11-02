import assert from "node:assert/strict";
import {createHash,randomBytes} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {Client} from "@colyseus/sdk";
const url=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(url||"") || new URL(url).port==="4108" ||
   !dir || !path.basename(dir).startsWith("montra-occult-test-"))throw Error("Requires isolated occult test server");
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),rooms=new Set(),sdk=new Client(url);
async function until(fn,label,timeout=12000){const end=Date.now()+timeout;while(Date.now()<end){const v=fn();if(v)return v;await sleep(40);}throw Error("timeout: "+label);}
const tokens=[0,1,2,3].map(()=>"mt1_"+randomBytes(32).toString("hex"));
async function seed(index,pathId){
 const id=createHash("sha256").update(tokens[index]).digest("hex"),slots=Array(12).fill(null);
 slots[0]={itemId:"health_potion",quantity:2};slots[1]={itemId:"ritual_dagger",quantity:1};
 const book={learned:{seer:[],mender:[]},loadouts:{seer:[null,null,null,null],mender:[null,null,null,null]},training:{seer:40,mender:40},cooldowns:{}};
 if(pathId==="seer"){
  book.learned.seer=["seer_mark","seer_rice","seer_scatter","seer_burst","seer_seal","seer_curse","seer_spirit","seer_hexburst","seer_spirit_bind","seer_trance"];
  book.loadouts.seer=index===0 ? ["seer_scatter","seer_seal","seer_spirit_bind","seer_trance"] :
    ["seer_curse","seer_hexburst","seer_mark","seer_rice"];
 } else {
  book.learned.mender=["mender_heal","mender_area","mender_ward","mender_cleanse","mender_spirit","mender_ward_area","mender_cleanse_area","mender_spirit_heal","mender_trance"];
  book.loadouts.mender=["mender_area","mender_ward_area","mender_cleanse_area","mender_spirit_heal"];
 }
 await writeFile(path.join(dir,id+".json"),JSON.stringify({version:1,id,name:"Deep"+index,level:40,experience:0,pkKills:0,pkDeaths:0,
  x:index,y:0,z:0,hp:120,mapId:"ritual_village",build:{path:pathId,ancestry:"woodland"},
  inventory:{version:1,slots,equippedWeaponSlot:1},occultBook:book,updatedAt:new Date().toISOString()}),{flag:"wx"});
}
async function join(i,roomId){
 const options={guestToken:tokens[i],worldVersion:1,templeVersion:1,atlasVersion:1};
 const room=roomId?await sdk.joinById(roomId,options):await sdk.create("my_room",options);rooms.add(room);
 const events=[];room.onMessage("*",(type,data)=>events.push({type,data}));const me=()=>room.state?.players?.get(room.sessionId);
 await until(()=>me()?.persistent,"join");return {room,events,me};
}
async function event(c,type,pred=()=>true,timeout=12000){return (await until(()=>c.events.find(e=>e.type===type && pred(e.data)),type,timeout)).data;}
async function send(c,type,payload,want,pred){c.events.length=0;c.room.send(type,payload);return event(c,want,pred);}
async function walk(c,x,z){c.room.send("move",{x,z});await until(()=>Math.hypot(c.me().x-x,c.me().z-z)<0.5,"walk",25000);}
try{
 await Promise.all([seed(0,"seer"),seed(1,"mender"),seed(2,"seer"),seed(3,"seer")]);
 const seer=await join(0),mender=await join(1,seer.room.roomId),hostile=await join(2,seer.room.roomId),secondHostile=await join(3,seer.room.roomId);
 mender.room.send("party_invite",{targetId:seer.room.sessionId});
 const invitation=await event(seer,"party_invitation");
 await send(seer,"party_accept",{inviteId:invitation.inviteId},"party_state",x=>x.members?.length===2);
 const hp=seer.me().hp,def=seer.me().def;
 await send(mender,"occult_skill",{skillId:"mender_area"},"occult_skill_used",x=>x.skillId==="mender_area");
 await until(()=>seer.me().hp>hp,"area initial healing");
 const firstHeal=seer.me().hp;
 await until(()=>seer.me().hp>firstHeal,"area periodic healing",7000);
 await send(mender,"occult_skill",{skillId:"mender_ward_area"},"occult_skill_used",x=>x.skillId==="mender_ward_area");
 await until(()=>seer.me().def>def,"party ward");
 await send(mender,"pot_summon",{},"summon_spawn",x=>x.ownerId===mender.room.sessionId);
 const beforeSpirit=seer.me().hp;
 await send(mender,"occult_skill",{skillId:"mender_spirit_heal",targetId:seer.room.sessionId},"occult_skill_used",x=>x.skillId==="mender_spirit_heal");
 await until(()=>seer.me().hp>beforeSpirit,"spirit healing");
 await send(mender,"occult_book",{action:"equip",slot:3,skillId:"mender_spirit"},"occult_book_state",x=>x.book.loadouts.mender[3]==="mender_spirit");
 const beforeSpiritWard=seer.me().def;
 await send(mender,"occult_skill",{skillId:"mender_spirit",targetId:seer.room.sessionId},"occult_skill_used",x=>x.skillId==="mender_spirit");
 await until(()=>seer.me().def>beforeSpiritWard,"pot spirit ward");
 await send(mender,"occult_book",{action:"equip",slot:3,skillId:"mender_trance"},"occult_book_state",x=>x.book.loadouts.mender[3]==="mender_trance");
 await send(mender,"possess",{},"possession_changed",x=>x.playerId===mender.room.sessionId && x.active===true);
 const wardedDef=seer.me().def;
 const beforeTranceStamina=mender.me().stamina;
 await send(mender,"occult_skill",{skillId:"mender_trance"},"occult_skill_used",x=>x.skillId==="mender_trance");
 await until(()=>seer.me().def>wardedDef,"party trance ward");
 assert.ok(mender.me().stamina>beforeTranceStamina-22,"trance returns stamina after its cost");
 console.log("PASS: party healing field pulses, shared ward and pot spirit healing");
 seer.events.length=0;
 await send(hostile,"occult_skill",{skillId:"seer_curse",targetId:seer.room.sessionId},"occult_skill_used",x=>x.skillId==="seer_curse");
 await event(seer,"occult_curse_state",x=>x.active===true);
 await send(hostile,"occult_skill",{skillId:"seer_hexburst",targetId:seer.room.sessionId},"occult_skill_used",x=>x.skillId==="seer_hexburst");
 await event(seer,"occult_curse_state",x=>x.active===false && x.reason==="detonated");
 seer.events.length=0;
 await send(secondHostile,"occult_skill",{skillId:"seer_curse",targetId:seer.room.sessionId},"occult_skill_used",x=>x.skillId==="seer_curse");
 await event(seer,"occult_curse_state",x=>x.active===true);
 await send(mender,"occult_skill",{skillId:"mender_cleanse_area"},"occult_skill_used",x=>x.skillId==="mender_cleanse_area");
 await event(seer,"occult_curse_state",x=>x.active===false && x.reason==="cleansed");
 console.log("PASS: curse consumption and area cleanse of a party member");
 await send(seer,"pot_summon",{},"summon_spawn",x=>x.ownerId===seer.room.sessionId);
 await walk(seer,1,7);
 const targetId=seer.room.state.monster.id,oldHp=seer.room.state.monster.hp;
 await send(seer,"occult_skill",{skillId:"seer_scatter",targetId},"occult_skill_used",x=>x.skillId==="seer_scatter");
 await until(()=>seer.room.state.monster.hp<oldHp,"scatter damage");
 await sleep(500);
 await send(seer,"occult_skill",{skillId:"seer_seal",targetId},"occult_skill_used",x=>x.skillId==="seer_seal");
 await until(()=>seer.room.state.monster.aiState==="stagger" || !seer.room.state.monster.alive,"seal interruption");
 assert.ok(seer.room.state.monster.alive,"monster remains alive for the commanded spirit test");
 await sleep(500);
 await send(seer,"occult_skill",{skillId:"seer_spirit_bind",targetId},"occult_skill_used",x=>x.skillId==="seer_spirit_bind");
 await event(seer,"summon_hit",x=>x.ownerId===seer.room.sessionId && x.targetId===targetId);
 seer.room.send("possess",{});
 await event(seer,"possession_changed",x=>x.playerId===seer.room.sessionId && x.active===true);
 await until(()=>seer.me().possessionActive,"trance active");
 const magic=seer.me().magicAtk;
 await send(seer,"occult_skill",{skillId:"seer_trance"},"occult_skill_used",x=>x.skillId==="seer_trance");
 await until(()=>seer.me().magicAtk>magic,"enhanced trance");
 console.log("PASS: scatter, seal, commanded spirit and enhanced trance");
}finally{await Promise.allSettled([...rooms].map(room=>room.leave()));}
