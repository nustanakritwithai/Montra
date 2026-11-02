import assert from "node:assert/strict";
import {createHash,randomBytes} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {Client} from "@colyseus/sdk";
const url=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(url||"") || new URL(url).port==="4108" || !dir || !path.basename(dir).startsWith("montra-occult-test-"))
  throw Error("Requires an isolated localhost server and disposable montra-occult-test-* directory");
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(read,label,timeout=10000){const end=Date.now()+timeout;while(Date.now()<end){const value=read();if(value)return value;await sleep(30);}throw Error("timeout: "+label);}
const tokens=[0,1].map(()=>"mt1_"+randomBytes(32).toString("hex")),rooms=new Set();
async function seed(index,pathId,z){
  const id=createHash("sha256").update(tokens[index]).digest("hex"),slots=Array(12).fill(null);
  slots[0]={itemId:"health_potion",quantity:2};slots[1]={itemId:"spirit_staff",quantity:1};
  const book={learned:{seer:["seer_mark","seer_rice","seer_burst"],mender:[]},
    loadouts:{seer:["seer_mark","seer_rice","seer_burst",null],mender:[null,null,null,null]},training:{seer:10,mender:0},cooldowns:{}};
  await writeFile(path.join(dir,id+".json"),JSON.stringify({version:1,id,name:"Balance"+index,level:5,experience:0,pkKills:0,pkDeaths:0,
    x:1.1,y:0,z,hp:240,mapId:"ritual_village",build:{path:pathId,ancestry:"woodland"},
    inventory:{version:1,slots,equippedWeaponSlot:1},occultBook:book,updatedAt:new Date().toISOString()}),{flag:"wx"});
}
const sdk=new Client(url);
async function join(index,roomId){
  const options={guestToken:tokens[index],worldVersion:1,templeVersion:1,atlasVersion:1};
  const room=roomId?await sdk.joinById(roomId,options):await sdk.create("my_room",options);rooms.add(room);
  const events=[];room.onMessage("*",(type,data)=>events.push({type,data}));
  const me=()=>room.state?.players?.get(room.sessionId);
  await until(()=>me()?.persistent,"join");return {room,events,me};
}
async function event(client,type,predicate=()=>true){return (await until(()=>client.events.find(e=>e.type===type && predicate(e.data)),type)).data;}
const damage=(power,def,level)=>{const k=100*(1+(level-1)/15);return Math.max(1,Math.round(power*k/(k+def)));};
try{
  await Promise.all([seed(0,"mender",17.7),seed(1,"seer",16.7)]);
  const mender=await join(0),seer=await join(1,mender.room.roomId),monster=mender.room.state.monster;
  const pveExpected=damage((mender.me().magicAtk+6)*1.1,monster.defense,monster.level);
  mender.room.send("blessed_rice",{targetId:monster.id});
  const pve=await event(mender,"ranged_hit",e=>e.targetId===monster.id);
  assert.equal(pve.damage,pveExpected,"healer receives the PvE rice bonus before defense");
  await sleep(1300);
  mender.events.length=0;
  const foe=seer.me(),pvpExpected=damage(mender.me().magicAtk+6,foe.magicDef,foe.level);
  mender.room.send("blessed_rice",{targetId:seer.room.sessionId});
  const pvp=await event(mender,"pvp_hit",e=>e.targetId===seer.room.sessionId && e.source==="ranged");
  assert.equal(pvp.damage,pvpExpected,"healer PvP rice is unchanged");
  const expected=(power)=>damage((seer.me().magicAtk+6)*power,monster.defense,monster.level);
  for(const [skillId,power] of [["seer_mark",0.9],["seer_rice",1.4*1.3],["seer_burst",2.15]]){
    seer.events.length=0;seer.room.send("occult_skill",{skillId,targetId:monster.id});
    const hit=await event(seer,"combat_hit",e=>e.targetId===monster.id && e.source==="talisman");
    assert.equal(hit.damage,expected(power),skillId+" damage");
    await sleep(300);
  }
  console.log("PASS: healer PvE rice bonus, unchanged PvP rice and seer mark/rice/burst damage");
}finally{await Promise.allSettled([...rooms].map(room=>room.leave()));}
