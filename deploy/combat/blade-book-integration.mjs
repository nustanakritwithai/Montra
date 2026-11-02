import assert from "node:assert/strict";
import {createHash,randomBytes} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {Client} from "@colyseus/sdk";

const url=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(url||"") || new URL(url).port==="4108" ||
   !dir || !path.basename(dir).startsWith("montra-blade-test-"))
  throw Error("Requires isolated localhost server and temporary montra-blade-test-* data");
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(read,label,timeout=12000){const end=Date.now()+timeout;while(Date.now()<end){const value=read();if(value)return value;await sleep(40);}throw Error("timeout: "+label);}
const sdk=new Client(url),rooms=new Set(),tokens=[0,1,2,3].map(()=>"mt1_"+randomBytes(32).toString("hex"));
async function seed(index,pathId){
  const id=createHash("sha256").update(tokens[index]).digest("hex"),slots=Array(12).fill(null);
  slots[0]={itemId:"health_potion",quantity:2};slots[1]={itemId:"ritual_dagger",quantity:1};
  await writeFile(path.join(dir,id+".json"),JSON.stringify({version:1,id,name:"Blade"+index,level:5,experience:0,pkKills:0,pkDeaths:0,
    x:0,y:0,z:0,hp:120,mapId:"ritual_village",build:{path:pathId,ancestry:"woodland"},
    inventory:{version:1,slots,equippedWeaponSlot:1},updatedAt:new Date().toISOString()}),{flag:"wx"});
}
async function join(index,roomId){
  const opts={guestToken:tokens[index],worldVersion:1,templeVersion:1,atlasVersion:1};
  const room=roomId?await sdk.joinById(roomId,opts):await sdk.create("my_room",opts);rooms.add(room);
  const events=[];room.onMessage("*",(type,data)=>events.push({type,data}));
  await until(()=>room.state?.players?.get(room.sessionId)?.persistent,"joined");return {room,events};
}
async function send(client,type,data,want,predicate=()=>true){client.events.length=0;client.room.send(type,data);return (await until(()=>client.events.find(e=>e.type===want && predicate(e.data)),want)).data;}
try{
  await Promise.all([seed(0,"blade"),seed(1,"sentinel"),seed(2,"sentinel"),seed(3,"sentinel")]);
  let blade=await join(0),other=await join(1,blade.room.roomId),ally=await join(2,blade.room.roomId);
  await until(()=>blade.room.state.players.has(other.room.sessionId) && other.room.state.players.has(blade.room.sessionId),"ordinary players mutually visible");
  blade.room.send("move",{x:0,z:1});
  await until(()=>other.room.state.players.get(blade.room.sessionId)?.z>0.5,"ordinary movement remains synchronized");
  ally.events.length=0;blade.room.send("party_invite",{targetId:ally.room.sessionId});
  const invite=(await until(()=>ally.events.find(e=>e.type==="party_invitation"),"party invitation")).data;
  await send(ally,"party_accept",{inviteId:invite.inviteId},"party_state",x=>x.members?.length===2);
  await send(other,"blade_book_get",{},"command_rejected",x=>x.reason==="blade_class_required");
  let book=await send(blade,"blade_book_get",{},"blade_book_state");
  assert.deepEqual(book.book.learned,[]);assert.equal(book.book.practice.ambush,0);
  book=await send(blade,"blade_book",{action:"learn",skillId:"cloak"},"blade_book_state",x=>x.book.learned.includes("cloak"));
  await send(blade,"blade_book",{action:"learn",skillId:"hidden_edge"},"command_rejected",x=>x.reason==="blade_practice");
  book=await send(blade,"blade_book",{action:"equip",slot:0,skillId:"cloak"},"blade_book_state",x=>x.book.slots[0]==="cloak");
  other.events.length=0;blade.events.length=0;blade.room.send("blade_skill",{skillId:"cloak"});
  await until(()=>other.events.find(e=>e.type==="blade_cloak_cast" && e.data.playerId===blade.room.sessionId),"visible cloak cast");
  assert.ok(other.room.state.players.has(blade.room.sessionId),"caster remains visible during cast");
  await until(()=>blade.events.find(e=>e.type==="blade_cloak_changed" && e.data.active===true),"cloak activated");
  await until(()=>!other.room.state.players.has(blade.room.sessionId),"enemy does not receive concealed player");
  assert.ok(blade.room.state.players.has(blade.room.sessionId),"owner retains own state");
  assert.ok(ally.room.state.players.has(blade.room.sessionId),"party retains ally state");
  blade.room.send("move",{x:0,z:2});
  await until(()=>ally.room.state.players.get(blade.room.sessionId)?.z>1.5,"party receives concealed movement");
  assert.equal(other.room.state.players.has(blade.room.sessionId),false,"enemy receives no concealed movement state");
  await send(ally,"party_leave",{},"party_state",x=>x.partyId===null);
  await until(()=>!ally.room.state.players.has(blade.room.sessionId),"former ally loses concealed view");
  await sleep(650); // Rejection notifications are rate-limited per client.
  await send(other,"attack",{targetId:blade.room.sessionId},"command_rejected",x=>x.reason==="target_unavailable");
  await send(other,"trade_request",{targetId:blade.room.sessionId},"economy_error",x=>x.reason==="invalid_trade");
  const late=await join(3,blade.room.roomId);
  assert.equal(late.room.state.players.has(blade.room.sessionId),false,"late joiner cannot see concealed player");
  await until(()=>other.room.state.players.has(blade.room.sessionId),"expired cloak restores visibility",9000);
  await blade.room.leave();rooms.delete(blade.room);await sleep(350);
  blade=await join(0,other.room.roomId);
  book=await send(blade,"blade_book_get",{},"blade_book_state");
  assert.deepEqual(book.book.learned,["cloak"]);assert.equal(book.book.slots[0],"cloak");
  await send(blade,"select_build",{path:"sentinel",ancestry:"woodland"},"build_selected",x=>x.path==="sentinel");
  await send(blade,"select_build",{path:"blade",ancestry:"woodland"},"build_selected",x=>x.path==="blade");
  book=await send(blade,"blade_book_get",{},"blade_book_state");
  assert.deepEqual(book.book.learned,["cloak"],"switching class preserves blade learning");
  book=await send(blade,"blade_book",{action:"reset"},"blade_book_state",x=>x.book.learned.length===0);
  assert.deepEqual(book.book.slots,[null,null,null,null]);
  assert.ok(book.book.cooldowns.cloak>0,"reset does not clear cooldown");
  console.log("PASS: blade book, party visibility, concealed targeting, late join and reconnect persistence");
}finally{await Promise.allSettled([...rooms].map(room=>room.leave()));}
