import assert from "node:assert/strict";
import path from "node:path";
import { Client } from "@colyseus/sdk";

const url=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(url||"") || new URL(url).port==="4108" || !dir || !/^montra-(mount|account)-test-/.test(path.basename(dir)))
  throw Error("Requires an isolated localhost server and disposable mount test directory");
const sdk=new Client(url),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),rooms=[];
async function until(check,label,timeout=8000){const end=Date.now()+timeout;while(Date.now()<end){const result=check();if(result)return result;await sleep(40);}throw Error("timeout: "+label);}
async function guest(){const r=await fetch(url+"/montra/account/guest",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});assert.equal(r.status,200);return (await r.json()).session;}
const flags={worldVersion:1,templeVersion:1,atlasVersion:1,provinceVersion:1,warVersion:1,castleVersion:2,riverCityVersion:1,terrainVersion:1,atlasReliefVersion:1,originalReliefVersion:1};
try {
  const session=await guest(),peerSession=await guest();
  const a=await sdk.create("my_room",{...flags,accountSession:session,characterSlot:1,characterSetup:{name:"ผู้ขี่",build:{path:"seer",ancestry:"shrine"}}});rooms.push(a);
  const b=await sdk.joinById(a.roomId,{...flags,accountSession:peerSession,characterSlot:1,characterSetup:{name:"เพื่อน",build:{path:"blade",ancestry:"shrine"}}});rooms.push(b);
  const events=[];a.onMessage("*",(type,data)=>events.push({type,data}));b.onMessage("*",()=>{});
  const me=()=>a.state?.players?.get(a.sessionId),peerView=()=>b.state?.players?.get(a.sessionId);
  await until(()=>me()?.persistent && peerView(),"players joined");assert.equal(a.state.mountAvailable,true);
  a.send("toggle_mount",{speed:999});await until(()=>events.some(e=>e.type==="command_rejected" && e.data.reason==="invalid_mount"),"forged speed denied");await sleep(600);
  a.send("toggle_mount",{});await until(()=>me()?.mounted && peerView()?.mounted,"mount visible to both clients");
  a.send("attack",{targetId:"possessed-1"});await until(()=>events.some(e=>e.type==="command_rejected" && e.data.reason==="dismount_required"),"combat blocked");
  await sleep(600);events.length=0;a.send("cast_class_skill",{});await until(()=>events.some(e=>e.type==="command_rejected" && e.data.reason==="dismount_required"),"skill blocked");
  const initialX=Number(me().x),started=Date.now();a.send("move",{x:-8,z:0});
  await until(()=>Math.abs(Number(me().x)-initialX)>3.6,"horse movement");
  const elapsed=(Date.now()-started)/1000,dist=Math.abs(Number(me().x)-initialX);
  assert.ok(dist/elapsed>3.4 && dist/elapsed<6.1,"speed is bounded and faster than walking");
  await until(()=>Math.abs(Number(me().x)+8)<.15,"reached destination");
  a.send("toggle_mount",{});await until(()=>!me().mounted && !peerView().mounted,"manual dismount");
  a.send("toggle_mount",{});await until(()=>me().mounted,"mount again");
  a.send("move",{x:10,z:4});await until(()=>me().combatState==="idle" && me().x>5,"wall collision",9000);
  assert.ok(me().x<7.1,"horse cannot pass through watchwall");
  a.send("move",{x:2,z:9});await until(()=>!me().mounted,"damage dismounts rider",13000);
  await a.leave();rooms.splice(rooms.indexOf(a),1);await sleep(350);
  const reconnect=await sdk.joinById(b.roomId,{...flags,accountSession:session,characterSlot:1});rooms.push(reconnect);
  await until(()=>reconnect.state?.players?.get(reconnect.sessionId)?.persistent,"reconnect");
  assert.equal(reconnect.state.players.get(reconnect.sessionId).mounted,false);
  console.log("MONTRA mount integration passed");
} finally {for(const room of rooms.reverse())await room.leave().catch(()=>{});}
