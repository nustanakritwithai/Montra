import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {existsSync} from "node:fs";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {Client} from "@colyseus/sdk";
const url=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(url??"") || !/^montra-(?:monster|original)-test-/.test(path.basename(dir??"")))throw Error("Requires isolated B01 test server");
const compiled=new URL("./build/rooms/GuildStore.js",import.meta.url);
const {GuildStore}=await import(existsSync(compiled)?compiled.href:new URL("./src/rooms/GuildStore.ts",import.meta.url).href);
const city="sam_lan_estuary",sdk=new Client(url),rooms=new Set(),nap=ms=>new Promise(r=>setTimeout(r,ms));
const sha=s=>createHash("sha256").update(s).digest("hex"),token=i=>"mt1_"+sha("b01-fixture-"+i);
async function until(fn,label,timeout=12000){
  const end=Date.now()+timeout;while(Date.now()<end){const v=fn();if(v)return v;await nap(65);}throw Error("timeout "+label);
}
async function join(i,roomId,ticket,ver=1){
  const opt={guestToken:token(i),worldVersion:1,templeVersion:1,atlasVersion:1,provinceVersion:1,warVersion:1,originalReliefVersion:1,riverCityVersion:ver,warTicket:ticket};
  const r=roomId?await sdk.joinById(roomId,opt):await sdk.create("my_room",opt);rooms.add(r);
  const c={i,r,events:[],me:()=>r.state.players?.get(r.sessionId),local:null};
  r.onMessage("*",(type,data)=>{c.events.push({type,data});if(type==="territory_state")c.local=data.local;});
  r.send("get_territories",{});await until(c.me,"join");return c;
}
async function leave(c){await c.r.leave();rooms.delete(c.r);await nap(225);}
async function command(c,verb,data,type){
  c.events.length=0;c.r.send(verb,data);return until(()=>c.events.find(e=>e.type===type)?.data,verb);
}
async function walk(c,x,z){
  c.events.length=0;c.r.send("move",{x,z});
  try{await until(()=>Math.hypot(c.me().x-x,c.me().z-z)<.35,"move",65000);}
  catch(e){throw Error("walk "+x+","+z+" from "+c.me().x+","+c.me().z+" "+JSON.stringify(c.events.filter(e=>e.type==="command_rejected").slice(-2)));}
}
async function gate(c,id){
  for(let i=0;i<8;i++){
    const previous=c.local.river.gates[id].hp;c.r.send("territory_gate",{gateId:id});
    await until(()=>c.local.river.gates[id].hp<previous,"breach "+id+" hp "+previous);
    if(c.local.river.gates[id].hp===0)break;await nap(1050);
  }
  assert.equal(c.local.river.gates[id].closed,false);
}
const db=new GuildStore(path.join(dir,"guilds.sqlite"));
try{
  for(let i=0;i<2;i++){
    const id=sha(token(i));db.create(id,"B"+i,i?"Old Wharf":"New Wharf");
    const slots=Array(12).fill(null);
    await writeFile(path.join(dir,id+".json"),JSON.stringify({version:1,id,name:"B"+i,level:12,experience:0,pkKills:0,pkDeaths:0,x:-35,y:0,z:25,hp:416,mapId:"river_watch",inventory:{version:1,slots,equippedWeaponSlot:null},updatedAt:new Date().toISOString()}),{flag:"wx"});
  }
  const t=Date.now()-10*3600000,old=db.war.member(sha(token(1)));
  const past=db.war.start(city,old,t);
  for(let i=1;i<=70;i++)db.war.advance(past,t+i*1000,2,0,undefined,undefined,null,[{attack:1,defend:0},{attack:0,defend:0},{attack:0,defend:0}]);
  assert.equal(db.war.inspect(city,Date.now()).owner,"Old Wharf");
  const entry="river_watch_to_"+city,exit=city+"_to_river_watch";
  let c=await join(0,undefined,undefined,0);
  assert.equal((await command(c,"warp",{portalId:entry},"command_rejected")).reason,"world_client_update_required");await leave(c);
  c=await join(0);c.r.send("warp",{portalId:entry});await until(()=>c.me().mapId===city,"wharf to city");await leave(c);
  await assert.rejects(join(0,undefined,undefined,0),/world_client_update_required/);
  c=await join(0);assert.equal(c.me().mapId,city);
  const transfer=await command(c,"territory_start",{},"territory_transfer");await leave(c);c=await join(0,transfer.roomId,transfer.ticket);
  await until(()=>c.local?.inField && c.local.river?.defended,"defended field");assert.equal(Object.values(c.local.river.gates).filter(g=>g.closed).length,5);
  assert.equal(c.local.side,"attack");console.log("PASS B01 wharf, legacy entry/load protection, 5 closed gates");
  await walk(c,-112,176);await walk(c,-112,122);await walk(c,0,122);await walk(c,0,100.4);
  c.r.send("move",{x:0,z:88});await nap(1300);assert.ok(c.me().z>=99);
  await gate(c,"G11");await walk(c,0,80);await walk(c,-144,80);
  c.r.send("climb",{structureId:"b01-stair-1",direction:"up"});await until(()=>c.me().y===4,"outer stair");
  await walk(c,-125,96);await walk(c,-144,96);c.r.send("climb",{structureId:"b01-stair-1",direction:"down"});await until(()=>c.me().y===0,"return to ground");
  await walk(c,-112,80);await walk(c,-112,32);await walk(c,-96,32);await walk(c,-96,0);await walk(c,-112,0);
  await until(()=>c.local.river.posts.find(p=>p.id==="S").owner==="attack","secure store",15000);
  await walk(c,-112,-64);await walk(c,-64,-64);await walk(c,-64,-48);await walk(c,-52.4,-48);
  await gate(c,"G22");await walk(c,32,-48);
  await until(()=>c.local?.progress>0,"capture progresses");await until(()=>c.local?.phase==="protected","win city",90000);
  assert.equal(c.local.owner,"New Wharf");assert.equal(db.war.inspect(city,Date.now()).phase,"protected");
  assert.equal(db.war.government.balance(old.id),480);
  await leave(c);c=await join(0);await until(()=>c.local?.government,"government after return");
  assert.ok(c.local.government.commander && c.local.government.damaged);
  console.log("PASS defended city captured, warehouse breached and ownership transferred");
  // Returning from a battlefield restores the character's saved court position in the world.
  for(const [x,z] of [[16,-24],[16,20],[0,38],[0,120],[112,120],[112,176],[0,176]])await walk(c,x,z);
  c.r.send("warp",{portalId:exit});await until(()=>c.me().mapId==="river_watch","return wharf");console.log("PASS B01 two breaches, stair ascent/crest/descent, supply, capture, treasury transfer, return sailing");
}finally{await Promise.allSettled([...rooms].map(r=>r.leave()));db.close();}
