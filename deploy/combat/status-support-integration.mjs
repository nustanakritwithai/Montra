import assert from "node:assert/strict";
import {createHash,randomBytes,randomUUID} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {Client} from "@colyseus/sdk";

const url=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(url||"") || new URL(url).port==="4108" || !dir || !path.basename(dir).startsWith("montra-status-test-"))throw Error("Requires isolated localhost and disposable status test folder");
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label){const end=Date.now()+12000;while(Date.now()<end){const result=fn();if(result)return result;await sleep(40);}throw Error("timeout: "+label);}
const sdk=new Client(url),rooms=[];
await mkdir(dir,{recursive:true});
async function seed(){
  const token="mt1_"+randomBytes(32).toString("hex"),id=createHash("sha256").update(token).digest("hex"),slots=Array(12).fill(null);
  slots[0]={itemId:"spirit_staff",quantity:1,forge:{instanceId:randomUUID(),revision:1,rank:3,misses:0,affix:{stat:"ranged",tier:2},rerollMisses:0}};
  const book={learned:{seer:[],mender:["mender_heal","mender_ward"]},loadouts:{seer:[null,null,null,null],mender:["mender_heal","mender_ward",null,null]},training:{seer:0,mender:45},cooldowns:{},ranks:{mender_heal:4,mender_ward:4}};
  await writeFile(path.join(dir,id+".json"),JSON.stringify({version:1,id,name:"StatusTester",level:99,experience:0,pkKills:0,pkDeaths:0,x:0,y:0,z:0,hp:100,mapId:"ritual_village",build:{path:"mender",ancestry:"woodland"},inventory:{version:1,slots,equippedWeaponSlot:0},occultBook:book,updatedAt:new Date().toISOString()}),{flag:"wx"});
  return token;
}
async function seedSentinel(){
  const token="mt1_"+randomBytes(32).toString("hex"),id=createHash("sha256").update(token).digest("hex"),slots=Array(12).fill(null);
  slots[0]={itemId:"shrine_glaive",quantity:1};
  const sentinelBook={learned:["taunt","ward"],slots:["ward",null,null,null],practice:{guard:45,stun:0,assist:0},cooldowns:{},ranks:{ward:4}};
  await writeFile(path.join(dir,id+".json"),JSON.stringify({version:1,id,name:"WardTester",level:99,experience:0,pkKills:0,pkDeaths:0,x:0,y:0,z:0,hp:100,mapId:"ritual_village",build:{path:"sentinel",ancestry:"woodland"},inventory:{version:1,slots,equippedWeaponSlot:0},sentinelBook,updatedAt:new Date().toISOString()}),{flag:"wx"});
  return token;
}
async function join(token){
  const room=await sdk.create("my_room",{guestToken:token,worldVersion:1,templeVersion:1,atlasVersion:1});rooms.push(room);
  const events=[];room.onMessage("*",(type,data)=>events.push({type,data}));
  const me=()=>room.state?.players?.get(room.sessionId);await until(()=>me()?.persistent,"join");return {room,events,me};
}
async function send(c,type,data,event){c.events.length=0;c.room.send(type,data);return (await until(()=>c.events.find(e=>e.type===event),event)).data;}
try {
  const token=await seed(),c=await join(token);
  await send(c,"occult_book",{action:"upgrade",skillId:"mender_heal"},"occult_book_changed");
  await sleep(500);
  await send(c,"occult_book",{action:"upgrade",skillId:"mender_ward"},"occult_book_changed");
  const status=await send(c,"get_character_status",{},"character_status");
  assert.equal(status.level,99);assert.equal(status.weaponId,"spirit_staff");
  assert.deepEqual(status.weapon.pve,{melee:0,ranged:11});
  assert.deepEqual(status.weapon.pvp,{melee:0,ranged:6});
  assert.equal(status.base.atk,c.me().atk);assert.deepEqual(status.effects,[]);
  const beforeHp=c.me().hp,maxHp=c.me().maxHp;
  await send(c,"occult_skill",{skillId:"mender_heal",targetId:c.room.sessionId},"occult_skill_used");
  await until(()=>c.me().hp>beforeHp,"ranked healing");
  assert.ok(c.me().hp-beforeHp>=Math.round(maxHp*0.14*1.1),"ranked healing includes its 10% support bonus");
  await sleep(1100);
  const beforeDef=c.me().def;
  await send(c,"occult_skill",{skillId:"mender_ward",targetId:c.room.sessionId},"occult_skill_used");
  await until(()=>c.me().def>beforeDef,"ranked ward");
  assert.equal(c.me().def,Math.round(beforeDef*(1+0.15*1.1)));
  const active=await send(c,"get_character_status",{},"character_status");
  assert.ok(active.effects.some(e=>e.id==="mender_ward" && e.remainingMs>0 && e.remainingMs<=8000));
  assert.ok(!JSON.stringify(active.effects).includes(c.room.sessionId),"status does not disclose buff source session");
  await send(c,"get_character_status",{targetId:"other"},"command_rejected");
  await c.room.leave();rooms.splice(rooms.indexOf(c.room),1);
  const again=await join(token),restored=await send(again,"occult_book_get",{},"occult_book_state");
  assert.equal(restored.book.ranks.mender_heal,5);assert.equal(restored.book.ranks.mender_ward,5);
  await send(again,"occult_book",{action:"reset"},"occult_book_changed");
  const reset=await send(again,"occult_book_get",{},"occult_book_state");
  assert.deepEqual(reset.book.learned.mender,[]);assert.equal(reset.book.ranks?.mender_heal,undefined);assert.equal(reset.book.training.mender,restored.book.training.mender);
  const tank=await join(await seedSentinel());
  await send(tank,"sentinel_book",{action:"upgrade",skillId:"ward"},"sentinel_book_changed");
  tank.room.send("move",{x:0,z:7});await until(()=>tank.me().z>6.5,"guardian leaves rest area");
  const def=tank.me().def;
  await send(tank,"sentinel_skill",{skillId:"ward",targetId:tank.room.sessionId},"sentinel_skill_used");
  await until(()=>tank.me().def>def,"ranked guardian ward");
  assert.equal(tank.me().def,Math.round(def*(1+0.15*1.1)));
  console.log("PASS: private status, forged staff, ranked healing and ward, reconnect");
} finally {await Promise.allSettled(rooms.map(room=>room.leave()));}
