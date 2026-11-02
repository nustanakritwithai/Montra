import assert from "node:assert/strict";
import {createHash,randomBytes} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {Client} from "@colyseus/sdk";
const url=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(url??"") || !path.basename(dir??"").startsWith("montra-terrain-test-"))throw Error("requires isolated local terrain server");
const pass="twin_neck_pass",sdk=new Client(url),rooms=new Set(),nap=ms=>new Promise(ok=>setTimeout(ok,ms));
async function until(fn,label,timeout=12000){const end=Date.now()+timeout;while(Date.now()<end){const v=fn();if(v)return v;await nap(50);}throw Error("timeout "+label);}
async function fixture(mapId,x,y,z){
  const token="mt1_"+randomBytes(32).toString("hex"),id=createHash("sha256").update(token).digest("hex");
  await writeFile(path.join(dir,id+".json"),JSON.stringify({version:1,id,name:"Scout",build:{path:"seer",ancestry:"woodland"},level:24,experience:0,pkKills:0,pkDeaths:0,x,y,z,hp:360,mapId,inventory:{version:1,slots:Array(12).fill(null),equippedWeaponSlot:null},updatedAt:new Date().toISOString()}),{flag:"wx"});return token;
}
async function join(token,id,version=1){const opts={guestToken:token,worldVersion:1,atlasVersion:1,templeVersion:1,provinceVersion:1,terrainVersion:version};
  const r=id?await sdk.joinById(id,opts):await sdk.create("my_room",opts);rooms.add(r);
  const c={r,me:()=>r.state.players?.get(r.sessionId),events:[]};r.onMessage("*",(type,data)=>c.events.push({type,data}));
  await until(c.me,"spawn");return c;
}
async function leave(c){await c.r.leave();rooms.delete(c.r);await nap(280);}
async function walk(c,x,z){c.r.send("move",{x,z});await until(()=>Math.hypot(c.me().x-x,c.me().z-z)<.25,"walk to "+x+","+z,65000).catch(e=>{throw Error(e.message+" from "+JSON.stringify([c.me().x,c.me().y,c.me().z])+" "+JSON.stringify(c.events.filter(e=>e.type==="command_rejected").slice(-2)));});}
async function hit(a,b){const hp=b.me().hp;a.r.send("shoot",{targetId:b.r.sessionId});await until(()=>b.me().hp<hp,"visible shot");}
async function rejected(c,type,data,reason){c.events.length=0;c.r.send(type,data);await until(()=>c.events.some(e=>e.type==="command_rejected" && e.data.reason===reason),reason);}
try{
  const traveler=await fixture("hex_ridge",14,0,-66),high=await fixture(pass,40,3,41),low=await fixture(pass,40,0,49);
  const hi=await join(high),room=hi.r.roomId,lo=await join(low,room);
  await until(()=>hi.r.state.players.size===2,"opponent visible");
  await hit(hi,lo);await hit(lo,hi);
  await walk(hi,40,36);await nap(1400);
  await rejected(hi,"shoot",{targetId:lo.r.sessionId},"shot_blocked");
  await rejected(lo,"shoot",{targetId:hi.r.sessionId},"shot_blocked");
  lo.r.send("move",{x:40,z:39});await nap(3300);assert.ok(lo.me().z>=44.98 && lo.me().y<.05);
  lo.r.send("dash",{dx:0,dz:-1});await nap(600);assert.ok(lo.me().z>=44.98 && lo.me().y<.05);
  console.log("PASS visible high/low PvP both ways, crest blocks both directions, cliff blocks walking and dash");
  let a=await join(traveler,room,0);
  await rejected(a,"warp",{portalId:"hex_ridge_to_"+pass},"world_client_update_required");await leave(a);
  a=await join(traveler,room);a.r.send("warp",{portalId:"hex_ridge_to_"+pass});await until(()=>a.me().mapId===pass,"ridge entry");
  await walk(a,0,54);assert.ok(Math.abs(a.me().y-1.5)<.05);
  await leave(a);await assert.rejects(join(traveler,room,0),/world_client_update_required/);
  a=await join(traveler,room);assert.ok(Math.abs(a.me().y-1.5)<.05 && !a.me().flying);
  a.r.send("dash",{dx:0,dz:-1});await until(()=>a.me().z<52,"dash climbs");assert.ok(a.me().y>1.7);
  await until(()=>a.events.some(e=>e.type==="dash_finished"),"dash finishes before next walk");
  await walk(a,0,40);assert.equal(a.me().y,3);await walk(a,0,-40);assert.equal(a.me().y,6);
  await leave(a);a=await join(traveler,room);assert.equal(a.me().y,6);assert.equal(a.me().flying,false);
  await walk(a,0,-52);a.r.send("warp",{portalId:pass+"_to_naga_cavern"});await until(()=>a.me().mapId==="naga_cavern","high exit");
  await nap(3100);a.r.send("warp",{portalId:"naga_cavern_to_"+pass});await until(()=>a.me().mapId===pass,"return high");assert.equal(a.me().y,6);
  await walk(a,0,76);assert.equal(a.me().y,0);a.r.send("warp",{portalId:pass+"_to_hex_ridge"});await until(()=>a.me().mapId==="hex_ridge","low exit");
  console.log("PASS authoritative ascent/descent, dash, slope and summit saves, legacy guard, both return portals");
}finally{await Promise.allSettled([...rooms].map(r=>r.leave()));}
