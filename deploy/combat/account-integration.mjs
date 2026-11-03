import assert from "node:assert/strict";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { Client } from "@colyseus/sdk";

const url=process.env.MONTRA_TEST_URL, dir=process.env.MONTRA_CHARACTER_DIR;
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(url||"") || new URL(url).port==="4108" || !dir || !path.basename(dir).startsWith("montra-account-test-"))
  throw Error("Requires isolated localhost server and disposable montra-account-test-* directory");
const sdk=new Client(url), sleep=ms=>new Promise(r=>setTimeout(r,ms));
const username="test_"+randomBytes(6).toString("hex"), password="a-test-password-123";
const api=async(route,body,session)=>{
  const response=await fetch(url+"/montra/account/"+route,{method:body?"POST":"GET",headers:{...(body?{"content-type":"application/json"}:{}),...(session?{authorization:"Bearer "+session}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,body:await response.json()};
};
async function until(fn,label){const end=Date.now()+8000;while(Date.now()<end){const value=fn();if(value)return value;await sleep(30);}throw Error("timeout: "+label);}
const flags={worldVersion:1,templeVersion:1,atlasVersion:1,provinceVersion:1,warVersion:1,castleVersion:2,riverCityVersion:1,terrainVersion:1,atlasReliefVersion:1,originalReliefVersion:1};
let room;
try {
  assert.equal((await api("slots",null,"invalid")).status,401);
  await assert.rejects(sdk.create("my_room",{...flags,guestToken:"mt1_"+"ff".repeat(32)}));
  assert.equal((await api("register",{username,password})).status,200);
  const auth=await api("login",{username,password}); assert.equal(auth.status,200); const session=auth.body.session;
  assert.equal((await api("slots",null,session)).body.slots[0].occupied,false);
  await assert.rejects(sdk.create("my_room",{...flags,accountSession:session,characterSlot:1}));
  room=await sdk.create("my_room",{...flags,accountSession:session,characterSlot:1,characterSetup:{name:"ทดสอบ",build:{path:"blade",ancestry:"shrine"}}});
  const me=()=>room.state?.players?.get(room.sessionId);
  await until(()=>me()?.persistent,"character joined");
  assert.equal(me().pathId,"blade");assert.equal(me().characterName,"ทดสอบ");
  const rejected=new Promise(resolve=>room.onMessage("command_rejected",resolve));
  room.send("select_build",{path:"seer",ancestry:"shrine"});
  assert.equal((await rejected).reason,"class_permanent");
  await room.leave();room=null;await sleep(350);
  const listed=await api("slots",null,session);assert.equal(listed.body.slots[0].path,"blade");
  room=await sdk.create("my_room",{...flags,accountSession:session,characterSlot:1});
  await until(()=>room.state?.players?.get(room.sessionId)?.persistent,"character rejoined");
  assert.equal(room.state.players.get(room.sessionId).pathId,"blade");
  let disconnected=false;room.onLeave(()=>{disconnected=true;});
  await api("logout",{},session);
  await until(()=>disconnected,"revoked session disconnect");
  assert.equal((await api("slots",null,session)).status,401);
  room=null; // server already disconnected the client
  console.log("MONTRA account integration passed");
} finally { if(room)try{await room.leave();}catch{} }
