import assert from "node:assert/strict";
import {createHash,randomBytes} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {Client} from "@colyseus/sdk";

const url=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(url||"") || new URL(url).port==="4108" || !dir || !path.basename(dir).startsWith("montra-sentinel-test-"))
  throw Error("Requires an isolated localhost server and disposable montra-sentinel-test-* directory");
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(read,label,timeout=10000){const end=Date.now()+timeout;while(Date.now()<end){const value=read();if(value)return value;await sleep(20);}throw Error("timeout: "+label);}
const sdk=new Client(url),rooms=new Set(),tokens=Array.from({length:11},()=>"mt1_"+randomBytes(32).toString("hex"));
async function seed(index,book,z=-9,x=8,level=25,pathId="sentinel"){
  const id=createHash("sha256").update(tokens[index]).digest("hex"),slots=Array(12).fill(null);
  slots[0]={itemId:"health_potion",quantity:2};slots[1]={itemId:"ritual_dagger",quantity:1};
  await writeFile(path.join(dir,id+".json"),JSON.stringify({version:1,id,name:"Guardian"+index,level,experience:0,pkKills:0,pkDeaths:0,
    x,y:0,z,hp:160,mapId:"ritual_village",build:{path:pathId,ancestry:"woodland"},
    inventory:{version:1,slots,equippedWeaponSlot:1},...(pathId==="sentinel"?{sentinelBook:book}:{}),updatedAt:new Date().toISOString()}),{flag:"wx"});
}
const all=["guard","step","fortitude","anchor","bash","sweep","slam","counter","taunt","ward","intercept","party_ward"];
const book=slots=>({learned:all,slots,practice:{guard:20,stun:20,assist:20},cooldowns:{}});
async function join(index,roomId){
  const options={guestToken:tokens[index],worldVersion:1,templeVersion:1,atlasVersion:1};
  const room=roomId?await sdk.joinById(roomId,options):await sdk.create("my_room",options);rooms.add(room);
  const events=[];room.onMessage("*",(type,data)=>events.push({type,data}));
  await until(()=>room.state?.players?.get(room.sessionId)?.persistent,"join");
  return {room,events,me:()=>room.state.players.get(room.sessionId)};
}
async function event(client,type,predicate=()=>true){return (await until(()=>client.events.find(e=>e.type===type && predicate(e.data)),type)).data;}
async function send(client,type,data,want,predicate=()=>true){client.events.length=0;client.room.send(type,data);return event(client,want,predicate);}
try{
  await Promise.all([seed(0,book(["bash","slam","guard","counter"])),seed(1,book(["guard","taunt","ward","intercept"]),-10),
    seed(2,book(["guard","taunt","ward","intercept"])),seed(3,book(["guard","taunt","ward","intercept"]),-10),
    seed(4,book(["guard","taunt","ward","intercept"]),-11),
    seed(5,{learned:["bash","taunt"],slots:["bash","taunt",null,null],practice:{guard:0,stun:0,assist:0},cooldowns:{}},8,1,3),
    seed(6,book(["guard","taunt","ward","intercept"])),seed(7,book(["guard","taunt","ward","intercept"]),-10),
    seed(8,null,-11,8,25,"seer"),
    seed(9,book(["bash","slam","guard","counter"])),seed(10,book(["guard","taunt","ward","intercept"]),-11.5)]);
  const fighter=await join(0),victim=await join(1,fighter.room.roomId);
  assert.equal(fighter.room.state.sentinelAvailable,true);
  await send(fighter,"sentinel_skill",{skillId:"bash",targetId:victim.room.sessionId,damage:99999},"command_rejected",e=>e.reason==="invalid_sentinel_skill");
  victim.events.length=0;fighter.events.length=0;
  fighter.room.send("sentinel_skill",{skillId:"bash",targetId:victim.room.sessionId});
  await event(victim,"sentinel_stun",e=>e.playerId===victim.room.sessionId);
  victim.room.send("move",{x:9,z:-10});
  await event(victim,"command_rejected",e=>e.reason==="sentinel_stunned");
  await event(fighter,"sentinel_control",e=>e.result==="applied");
  await until(()=>victim.me().stunned===false,"stun expires");
  await send(fighter,"sentinel_skill",{skillId:"slam",targetId:victim.room.sessionId},"sentinel_windup",e=>e.playerId===fighter.room.sessionId);
  await send(fighter,"move",{x:9,z:-9},"command_rejected",e=>e.reason==="sentinel_windup_active");
  await event(fighter,"sentinel_control",e=>e.result==="resisted");
  const state=await send(fighter,"sentinel_book_get",{},"sentinel_book_state");
  assert.equal(state.book.practice.stun,20,"PvP cannot advance monster practice");
  assert.ok(state.book.cooldowns.bash>Date.now());
  await fighter.room.leave();rooms.delete(fighter.room);await sleep(350);
  const rejoined=await join(0,victim.room.roomId);
  const restored=await send(rejoined,"sentinel_book_get",{},"sentinel_book_state");
  assert.deepEqual(restored.book.learned,state.book.learned);assert.equal(restored.book.practice.stun,20);
  assert.equal(restored.book.cooldowns.bash,state.book.cooldowns.bash);
  const protector=await join(2),ally=await join(3,protector.room.roomId),attacker=await join(4,protector.room.roomId);
  protector.room.send("party_invite",{targetId:ally.room.sessionId});
  const invite=await event(ally,"party_invitation");ally.room.send("party_accept",{inviteId:invite.inviteId});
  await event(protector,"party_state",e=>e.members.length===2);
  await send(protector,"sentinel_skill",{skillId:"intercept",targetId:ally.room.sessionId},"sentinel_skill_used",e=>e.skillId==="intercept");
  const ownerHp=protector.me().hp,allyHp=ally.me().hp;
  protector.events.length=0;attacker.room.send("attack",{targetId:ally.room.sessionId});
  const shared=await event(protector,"sentinel_intercept",e=>e.targetId===ally.room.sessionId && e.damage>0);
  await until(()=>protector.me().hp<ownerHp && ally.me().hp<allyHp,"both receive damage");
  assert.ok(shared.damage>0);
  const practice=await send(protector,"sentinel_book_get",{},"sentinel_book_state");
  assert.equal(practice.book.practice.assist,20,"PvP cannot advance PvE practice");
  const hunter=await join(5),monster=hunter.room.state.monster;
  const taunt=await send(hunter,"sentinel_skill",{skillId:"taunt"},"sentinel_taunt");
  assert.equal(taunt.applied,1);await until(()=>monster.targetId===hunter.room.sessionId,"monster taunted");
  const priorHp=monster.hp;
  await send(hunter,"sentinel_skill",{skillId:"bash",targetId:monster.id},"sentinel_control",e=>e.result==="applied");
  await until(()=>monster.hp<priorHp && monster.aiState==="stagger","monster damaged and stunned");
  const training=await send(hunter,"sentinel_book_get",{},"sentinel_book_state");
  assert.equal(training.book.practice.stun,1);
  const guard=await join(6),protectedAlly=await join(7,guard.room.roomId),summoner=await join(8,guard.room.roomId);
  guard.room.send("party_invite",{targetId:protectedAlly.room.sessionId});
  const secondInvite=await event(protectedAlly,"party_invitation");protectedAlly.room.send("party_accept",{inviteId:secondInvite.inviteId});
  await event(guard,"party_state",e=>e.members.length===2);
  await send(guard,"sentinel_skill",{skillId:"intercept",targetId:protectedAlly.room.sessionId},"sentinel_skill_used",e=>e.skillId==="intercept");
  await send(summoner,"summon",{},"summon_spawn",e=>e.ownerId===summoner.room.sessionId);
  guard.events.length=0;summoner.room.send("attack",{targetId:protectedAlly.room.sessionId});
  const spiritShare=await event(guard,"sentinel_intercept",e=>e.source==="summon" && e.attackerId===summoner.room.sessionId);
  assert.ok(spiritShare.damage>0,"summon damage is shared and attributed to its owner");
  const charger=await join(9),runner=await join(10,charger.room.roomId);
  await send(charger,"sentinel_skill",{skillId:"slam",targetId:runner.room.sessionId},"sentinel_windup",e=>e.playerId===charger.room.sessionId);
  runner.room.send("move",{x:8,z:-16});
  await event(charger,"sentinel_windup_result",e=>e.result==="miss");
  assert.equal(runner.me().stunned,false,"escaping the advertised range avoids the delayed stun");
  console.log("PASS: monster taunt and stun, PvP stun immunity, delayed range, player and summon damage sharing, book persistence");
}finally{await Promise.allSettled([...rooms].map(room=>room.leave()));}
