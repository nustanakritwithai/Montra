import assert from "node:assert/strict";
import {createHash,randomBytes} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {Client} from "@colyseus/sdk";

const url=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(url||"") || new URL(url).port==="4108" ||
    !dir || !path.basename(dir).startsWith("montra-occult-test-"))
  throw Error("Requires isolated localhost server and temporary montra-occult-test-* data");
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(read,label,timeout=12000) {
  const end=Date.now()+timeout;
  while(Date.now()<end){const result=read();if(result)return result;await sleep(40);}
  throw Error("timeout: "+label);
}
const sdk=new Client(url),rooms=new Set(),tokens=[0,1,2].map(()=>"mt1_"+randomBytes(32).toString("hex"));
const empty=()=>({learned:{seer:[],mender:[]},loadouts:{seer:[null,null,null,null],mender:[null,null,null,null]},training:{seer:30,mender:30},cooldowns:{}});
async function seed(index,pathId) {
  const id=createHash("sha256").update(tokens[index]).digest("hex"),slots=Array(12).fill(null),book=empty();
  slots[0]={itemId:"health_potion",quantity:2};slots[1]={itemId:"ritual_dagger",quantity:1};
  if(pathId==="seer"){
    book.learned.seer=["seer_mark","seer_rice","seer_burst","seer_curse"];
    book.loadouts.seer=["seer_mark","seer_rice","seer_burst","seer_curse"];
    book.learned.mender=["mender_heal"];
    book.loadouts.mender[0]="mender_heal";
  }
  if(pathId==="mender"){
    book.learned.mender=["mender_heal","mender_area","mender_ward","mender_cleanse","mender_spirit","mender_trance"];
    book.loadouts.mender=["mender_heal","mender_cleanse","mender_ward","mender_spirit"];
  }
  await writeFile(path.join(dir,id+".json"),JSON.stringify({version:1,id,name:"Occult"+index,level:15,experience:0,pkKills:0,pkDeaths:0,
    x:0,y:0,z:0,hp:120,mapId:"ritual_village",build:{path:pathId,ancestry:"woodland"},
    inventory:{version:1,slots,equippedWeaponSlot:1},occultBook:book,updatedAt:new Date().toISOString()}),{flag:"wx"});
}
async function join(index,roomId) {
  const options={guestToken:tokens[index],worldVersion:1,templeVersion:1,atlasVersion:1};
  const room=roomId?await sdk.joinById(roomId,options):await sdk.create("my_room",options);rooms.add(room);
  const events=[];room.onMessage("*",(type,data)=>events.push({type,data}));
  const me=()=>room.state?.players?.get(room.sessionId);
  await until(()=>me()?.persistent,"joined "+index);
  return {room,events,me,index};
}
async function event(client,type,predicate=()=>true,timeout=12000) {
  return (await until(()=>client.events.find(e=>e.type===type && predicate(e.data)),type,timeout)).data;
}
async function send(client,type,data,want,predicate=()=>true) {
  client.events.length=0;client.room.send(type,data);return event(client,want,predicate);
}
async function walk(client,x,z) {
  client.room.send("move",{x,z});
  await until(()=>Math.hypot(client.me().x-x,client.me().z-z)<0.5,"walk",25000);
}
try {
  await Promise.all([seed(0,"seer"),seed(1,"mender"),seed(2,"blade")]);
  let seer=await join(0),mender=await join(1,seer.room.roomId),fighter=await join(2,seer.room.roomId);
  assert.equal(seer.room.state.occultAvailable,true,"server advertises occult protocol support");
  for (const [type,data] of [["pot_summon",{}],["summon",{}],["possess",{}],
    ["blessed_rice",{targetId:"possessed-1"}],["shoot",{targetId:"possessed-1"}],["apply_talisman",{targetId:"possessed-1"}]]) {
    await sleep(650);
    await send(fighter,type,data,"command_rejected",e=>e.reason==="occult_class_required");
  }
  assert.equal(fighter.room.state.summons.has(fighter.room.sessionId),false);
  let book=await send(seer,"occult_book_get",{},"occult_book_state",x=>x.path==="seer");
  assert.equal(book.book.learned.seer.includes("seer_spirit"),false);
  book=await send(seer,"occult_book",{action:"learn",skillId:"seer_spirit"},"occult_book_state",x=>x.book.learned.seer.includes("seer_spirit"));
  assert.equal(book.book.training.seer,30);
  await send(seer,"occult_book",{action:"equip",slot:3,skillId:"seer_spirit"},"occult_book_state",x=>x.book.loadouts.seer[3]==="seer_spirit");
  await sleep(1100);
  await send(seer,"occult_book",{action:"equip",slot:3,skillId:"seer_curse"},"occult_book_state",x=>x.book.loadouts.seer[3]==="seer_curse");

  mender.room.send("party_invite",{targetId:fighter.room.sessionId});
  const invite=await event(fighter,"party_invitation");
  await send(fighter,"party_accept",{inviteId:invite.inviteId},"party_state",x=>x.members?.length===2);
  const before=fighter.me().hp;
  await send(mender,"occult_skill",{skillId:"mender_heal",targetId:fighter.room.sessionId},"occult_skill_used",x=>x.skillId==="mender_heal");
  await until(()=>fighter.me().hp>before,"party healing");
  await sleep(650);
  await send(mender,"occult_skill",{skillId:"mender_ward",targetId:seer.room.sessionId},"command_rejected",x=>x.reason==="occult_party_required");

  await walk(seer,1,7);
  const targetId=seer.room.state.monster.id;
  const unchangedHp=seer.room.state.monster.hp;
  await send(seer,"occult_skill",{skillId:"seer_mark",targetId,damage:999999},"command_rejected",x=>x.reason==="invalid_occult_skill");
  assert.equal(seer.room.state.monster.hp,unchangedHp,"forged damage cannot change monster HP");
  await sleep(650);
  await send(seer,"occult_skill",{skillId:"seer_burst",targetId},"command_rejected",x=>x.reason==="occult_mark_required");
  await sleep(650);
  await send(seer,"occult_skill",{skillId:"seer_mark",targetId},"occult_skill_used",x=>x.skillId==="seer_mark");
  await sleep(500);
  await send(seer,"occult_skill",{skillId:"seer_rice",targetId},"occult_skill_used",x=>x.skillId==="seer_rice");
  await sleep(500);
  await send(seer,"occult_skill",{skillId:"seer_burst",targetId},"occult_skill_used",x=>x.skillId==="seer_burst");
  assert.ok(seer.room.state.monster.hp<seer.room.state.monster.maxHp);
  await Promise.all([walk(seer,-8,0),walk(mender,-8.5,0),walk(fighter,-7.5,0)]);
  fighter.events.length=0;
  await send(seer,"occult_skill",{skillId:"seer_curse",targetId:fighter.room.sessionId},"occult_skill_used",x=>x.skillId==="seer_curse");
  await event(fighter,"occult_curse_state",x=>x.active===true);
  mender.room.send("occult_skill",{skillId:"mender_cleanse",targetId:fighter.room.sessionId});
  await event(fighter,"occult_curse_state",x=>x.active===false && x.reason==="cleansed");
  console.log("PASS: curse feedback and party cleanse");
  await seer.room.leave();rooms.delete(seer.room);await sleep(350);
  seer=await join(0,mender.room.roomId);
  book=await send(seer,"occult_book_get",{},"occult_book_state",x=>x.path==="seer");
  assert.ok(book.book.learned.seer.includes("seer_spirit"));
  assert.ok(book.book.training.seer>30);
  assert.ok(book.book.cooldowns.seer_burst>0);
  await walk(seer,0,0);await sleep(5500);
  await send(seer,"pot_summon",{},"summon_spawn",x=>x.ownerId===seer.room.sessionId);
  await send(seer,"possess",{},"possession_changed",x=>x.active===true && x.playerId===seer.room.sessionId);
  await send(seer,"select_build",{path:"blade",ancestry:"woodland"},"build_selected",x=>x.path==="blade");
  await until(()=>seer.me().pathId==="blade" && !seer.me().possessionActive,"class change clears trance");
  await sleep(650);
  await send(seer,"pot_summon",{},"command_rejected",x=>x.reason==="occult_class_required");
  await sleep(1100);
  await send(seer,"select_build",{path:"seer",ancestry:"woodland"},"build_selected",x=>x.path==="seer");
  await until(()=>seer.me().pathId==="seer","switch back");
  book=await send(seer,"occult_book_get",{},"occult_book_state",x=>x.path==="seer");
  assert.ok(book.book.learned.seer.includes("seer_spirit"));
  const savedReadyAt=book.book.cooldowns.seer_burst,trained=book.book.training.seer;
  await sleep(1100);
  book=await send(seer,"occult_book",{action:"reset"},"occult_book_state",x=>x.book.learned.seer.length===0);
  assert.deepEqual(book.book.learned.mender,["mender_heal"]);
  assert.equal(book.book.cooldowns.seer_burst,savedReadyAt);
  assert.equal(book.book.training.seer,trained);
  console.log("PASS: changing class ends trance, rejects rituals and preserves occult book");
  console.log("PASS: resetting one branch preserves the other branch, cooldowns and training");
  console.log("PASS: ritual class restrictions, book learning/loadouts, mark combo, party healing, outsider rejection and reconnect persistence");
} finally {await Promise.allSettled([...rooms].map(room=>room.leave()));}
