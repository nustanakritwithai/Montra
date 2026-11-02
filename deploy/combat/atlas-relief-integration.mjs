import assert from "node:assert/strict";
import {randomBytes,createHash} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {Client} from "@colyseus/sdk";
const url=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(url??"") || !path.basename(dir??"").startsWith("montra-relief-test-"))throw Error("requires isolated local relief server");
const sdk=new Client(url),rooms=new Set(),nap=ms=>new Promise(ok=>setTimeout(ok,ms));
async function until(fn,label,timeout=14000){const end=Date.now()+timeout;while(Date.now()<end){const v=fn();if(v)return v;await nap(60);}throw Error("timeout "+label);}
async function fixture(mapId,x,z,y=0){
  const token="mt1_"+randomBytes(32).toString("hex"),id=createHash("sha256").update(token).digest("hex");
  await writeFile(path.join(dir,id+".json"),JSON.stringify({version:1,id,name:"Scout",build:{path:"seer",ancestry:"woodland"},level:95,experience:0,pkKills:0,pkDeaths:0,x,y,z,hp:990,mapId,inventory:{version:1,slots:Array(12).fill(null),equippedWeaponSlot:null},updatedAt:new Date().toISOString()}),{flag:"wx"});return token;
}
async function join(token,ver=1){
  const r=await sdk.create("my_room",{guestToken:token,worldVersion:1,atlasVersion:1,templeVersion:1,provinceVersion:1,terrainVersion:1,atlasReliefVersion:ver});rooms.add(r);
  const c={r,me:()=>r.state.players?.get(r.sessionId),events:[]};r.onMessage("*",(type,data)=>c.events.push({type,data}));await until(c.me,"spawn");return c;
}
async function leave(c){await c.r.leave();rooms.delete(c.r);await nap(220);}
async function walk(c,x,z){c.r.send("move",{x,z});await until(()=>Math.hypot(c.me().x-x,c.me().z-z)<.25,"walk "+x+","+z,20000);}
try{
  const ridge=await fixture("hex_ridge",66,-46);
  await assert.rejects(join(ridge,0),/world_client_update_required/);
  let c=await join(ridge);assert.equal(c.me().x,66);const begin=c.me().y;
  await walk(c,66,-69);assert.ok(c.me().y>begin+1.5);const ground=c.me().y;
  c.r.send("fly",{});await until(()=>c.me().flying && Math.abs(c.me().y-ground-6)<.06,"ground-relative flight");
  await walk(c,66,-54);const air=c.me().y;assert.ok(air<ground+5.7);
  await leave(c);c=await join(ridge);assert.ok(c.me().flying && Math.abs(c.me().y-air)<.15);
  c.r.send("fly",{});await until(()=>!c.me().flying,"land");assert.ok(Math.abs(c.me().y-air+6)<.15);await leave(c);
  const oldFly=await fixture("asura_peak",-90,-76,6);c=await join(oldFly);assert.ok(c.me().flying && c.me().y>10);await leave(c);
  console.log("PASS old ground and flight saves, ridge ascent, airborne travel, reconnect and landing");
  const cave=await fixture("naga_cavern",13,-40);c=await join(cave);assert.ok(c.me().y< -1);
  c.r.send("fly",{});await until(()=>c.events.some(e=>e.type==="command_rejected" && e.data.reason==="flight_forbidden"),"cave keeps its flight rule");
  const target=await until(()=>[...c.r.state.monsters.values()].find(m=>m.mapId==="naga_cavern" && Math.hypot(m.x-c.me().x,m.z-c.me().z)<7),"cave monster");
  assert.ok(target.y<-.5);const hp=target.hp;c.r.send("shoot",{targetId:target.id});await until(()=>target.hp<hp,"shoot on cave floor");await leave(c);
  const traveler=await fixture("river_watch",0,26);c=await join(traveler,0);
  c.r.send("warp",{portalId:"river_watch_to_naga_cavern"});await until(()=>c.events.some(e=>e.type==="command_rejected" && e.data.reason==="world_client_update_required"),"legacy warp guard");await leave(c);
  c=await join(traveler);c.r.send("warp",{portalId:"river_watch_to_naga_cavern"});await until(()=>c.me().mapId==="naga_cavern","cave gate");
  // Warp cooldown uses fixed simulation time. A busy renderer can slow a local test server.
  await nap(3200);
  for(let i=0;i<10 && c.me().mapId==="naga_cavern";i++){
    c.events.length=0;c.r.send("warp",{portalId:"naga_cavern_to_river_watch"});await nap(1250);
    if(c.me().mapId==="naga_cavern")for(const e of c.events){
      if(e.type==="command_rejected")assert.equal(e.data.reason,"warp_cooldown");
      if(e.type==="warp_failed")assert.fail(JSON.stringify(e.data));
    }
  }
  assert.equal(c.me().mapId,"river_watch",JSON.stringify([c.me().x,c.me().y,c.me().z,c.events.map(e=>e.type)]));
  console.log("PASS old cave save restored below datum, live PvE, flight restriction, two-way gate");
}finally{await Promise.allSettled([...rooms].map(r=>r.leave()));}
