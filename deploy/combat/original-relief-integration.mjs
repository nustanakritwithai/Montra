import assert from "node:assert/strict";
import {randomBytes,createHash} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {Client} from "@colyseus/sdk";
const dir=process.env.MONTRA_CHARACTER_DIR,url=process.env.MONTRA_TEST_URL;
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(url??"") || !path.basename(dir??"").startsWith("montra-original-test-"))throw Error("Requires an isolated original-world test server");
const sdk=new Client(url),clients=new Set(),nap=ms=>new Promise(ok=>setTimeout(ok,ms));
async function until(fn,label,timeout=14000){const end=Date.now()+timeout;while(Date.now()<end){const v=fn();if(v)return v;await nap(70);}throw Error("timeout "+label);}
async function fixture(mapId,x,z,y=0){
  const token="mt1_"+randomBytes(32).toString("hex"),id=createHash("sha256").update(token).digest("hex");
  await writeFile(path.join(dir,id+".json"),JSON.stringify({version:1,id,name:"Scout",build:{path:"seer",ancestry:"woodland"},level:85,experience:0,pkKills:0,pkDeaths:0,x,y,z,hp:900,mapId,inventory:{version:1,slots:Array(12).fill(null),equippedWeaponSlot:null},updatedAt:new Date().toISOString()}),{flag:"wx"});return token;
}
async function join(token,ver=1,roomId){
  const opts={guestToken:token,worldVersion:1,templeVersion:1,atlasVersion:1,provinceVersion:1,castleVersion:2,riverCityVersion:1,atlasReliefVersion:1,originalReliefVersion:ver};
  const r=roomId?await sdk.joinById(roomId,opts):await sdk.create("my_room",opts);
  clients.add(r);const c={r,me:()=>r.state.players?.get(r.sessionId),events:[]};r.onMessage("*",(type,data)=>c.events.push({type,data}));await until(c.me,"character");return c;
}
async function leave(c){await c.r.leave();clients.delete(c.r);await nap(230);}
async function walk(c,x,z){c.r.send("move",{x,z});await until(()=>Math.hypot(c.me().x-x,c.me().z-z)<.25,"move "+x+","+z,18000);}
try{
  const hill=await fixture("ritual_village",-13,9);
  await assert.rejects(join(hill,0),/world_client_update_required/);
  let c=await join(hill);assert.ok(c.me().y>1.5);assert.equal(c.me().x,-13);
  c.r.send("fly",{});await until(()=>c.me().flying && c.me().y>7.5,"launch above village");
  await walk(c,-10,8);await leave(c);c=await join(hill);assert.ok(c.me().flying && c.me().y>6);
  c.r.send("fly",{});await until(()=>!c.me().flying && c.me().y<2,"land");await leave(c);
  const crest=await fixture("ritual_village",8,2.5,4);c=await join(crest);assert.equal(c.me().y,4);
  await walk(c,8,4.7);assert.equal(c.me().y,4);await walk(c,8,2.5);
  c.r.send("climb",{structureId:"watchwall-1",direction:"down"});await until(()=>c.me().y===0,"village stair descent");await leave(c);
  console.log("PASS village surface, flight save, crest restore, elevated movement and descent");
  const forest=await fixture("forbidden_forest",-14,-90);c=await join(forest);assert.ok(c.me().y>=3.5);
  const elite=await until(()=>c.r.state.monsters.get("forest_shrine_keeper"),"forest elite");
  assert.ok(elite.y>3.5);const hp=elite.hp;c.r.send("shoot",{targetId:elite.id});await until(()=>elite.hp<hp,"fight old forest guardian on the hill");await leave(c);
  const temple=await fixture("bound_temple",-27,-18);c=await join(temple);assert.ok(c.me().y< -1);
  const enemy=await until(()=>[...c.r.state.monsters.values()].find(m=>m.mapId==="bound_temple" && m.y<-.5 && Math.hypot(m.x-c.me().x,m.z-c.me().z)<10),"sunken cloister enemy");assert.ok(enemy.alive);await leave(c);
  console.log("PASS forest guardian and temple monsters on old hunting surfaces");
  const keep=await fixture("sam_lan_estuary",32,-48);c=await join(keep);assert.equal(c.me().y,4.5);await walk(c,30,-46);assert.ok(c.me().y>4);await leave(c);
  for(const [site,x,z,minY] of [["mantra_capital",0,-35,2.9],["moon_pass",82,-58,3.5],["river_watch",-67,-56,3],["tri_wiang_castle",690,100,17]]){
    const token=await fixture(site,x,z);c=await join(token);assert.equal(c.me().mapId,site);assert.ok(c.me().y>minY,site);await leave(c);
  }
  console.log("PASS old saves at all five cities and war sites including the 18 m pass");
  const city="sam_lan_estuary";
  for(const [name,start,end] of [
    ["walk up the command court", [23,-76,0],[23,-64,0]],
    ["fight on the same wall", [50,96,4],[51.5,96,4]],
    ["wall separates ground and crest",[50,100.5,0],[50,96,4]]
  ]){
    const a=await join(await fixture(city,...start)),b=await join(await fixture(city,...end),1,a.r.roomId);
    await until(()=>a.r.state.players.size===2 && b.r.state.players.size===2,"both fighters present");
    const hp=b.me().hp,fromY=a.me().y;
    a.r.send("attack",{targetId:b.r.sessionId});
    if(start[2]===end[2]){
      await until(()=>b.me().hp<hp || a.events.some(e=>e.type==="command_rejected"),name);
      assert.ok(b.me().hp<hp,name+" "+JSON.stringify(a.events.filter(e=>e.type==="command_rejected")));
      if(start[1]!==end[1])assert.ok(a.me().y>fromY+2 && Math.hypot(a.me().x-b.me().x,a.me().z-b.me().z)<2.9,"close distance on foot before hitting");
    }else{
      await until(()=>a.events.some(e=>e.type==="command_rejected" && e.data.reason==="melee_height_blocked"),name);
      assert.equal(b.me().hp,hp);
    }
    await leave(b);await leave(a);console.log("PASS",name);
  }
}finally{await Promise.allSettled([...clients].map(r=>r.leave()));}
