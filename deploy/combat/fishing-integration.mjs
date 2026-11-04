import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {Client} from "@colyseus/sdk";
const url=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(url??"") || !dir || !/^montra-fishing-test-/.test(path.basename(dir)))throw Error("Requires an isolated local test server");
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(fn,label){for(let i=0;i<250;i++){const value=fn();if(value)return value;await sleep(40);}throw Error("timeout: "+label);}
const token="mt1_"+createHash("sha256").update("montra-fishing-integration").digest("hex"),id=createHash("sha256").update(token).digest("hex"),slots=Array(12).fill(null);
slots[0]={itemId:"health_potion",quantity:2};slots[1]={itemId:"ritual_dagger",quantity:1};
await writeFile(path.join(dir,id+".json"),JSON.stringify({version:1,id,name:"นักตกปลาทดสอบ",level:12,experience:0,pkKills:0,pkDeaths:0,x:-5,y:0,z:0,hp:416,mapId:"ritual_village",inventory:{version:1,slots,equippedWeaponSlot:1},updatedAt:new Date().toISOString()}),{flag:"wx"});
const room=await new Client(url).create("my_room",{guestToken:token,worldVersion:1,templeVersion:1,atlasVersion:1});
const events=[];room.onMessage("*",(type,data)=>events.push({type,data}));
async function send(type,payload,expected,predicate=()=>true){
  const start=events.length;room.send(type,payload);
  return (await waitFor(()=>events.slice(start).find(e=>e.type===expected && predicate(e.data)),expected)).data;
}
try{
  await waitFor(()=>room.state?.players?.get(room.sessionId) && room.state.economyAvailable,"ready");
  await send("fish_start",{x:0,z:0},"economy_error",e=>e.reason==="fish_water");
  let state=await send("fish_start",{x:-9,z:0},"fish_state");
  assert.equal(state.distance,4);assert.equal(state.line,100);
  state=await send("fish_reel",{id:state.id},"fish_state",e=>e.result==="early");
  const cast=state.id;await sleep(state.wait+700);
  state=await send("fish_reel",{id:cast},"fish_state",e=>e.result==="perfect" || e.result==="good");
  assert.ok(state.distance<4 && state.line<100 && state.strength<100);
  const phase=state.elapsed%2800,next=(700-phase+2800)%2800;
  await sleep(next<500?next+2800:next);
  const caught=await send("fish_reel",{id:cast},"fish_result",e=>e.result==="caught");
  assert.ok(["mat_fish_common","mat_fish_silver","mat_fish_spirit"].includes(caught.item));
  await send("fish_reel",{id:cast},"economy_error",e=>e.reason==="fish_expired");
  const inventory=await send("get_inventory",{},"inventory_state",v=>v.slots?.some(s=>s?.itemId===caught.item));
  assert.equal(inventory.slots.find(s=>s?.itemId===caught.item).quantity,1);
  console.log("PASS: cast in water, timed pulls, approach, one fish in inventory and no duplicate claim");
}finally{await room.leave();}
