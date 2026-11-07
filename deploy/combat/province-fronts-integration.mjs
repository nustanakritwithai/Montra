import assert from "node:assert/strict";
import {createHash,randomBytes} from "node:crypto";
import {existsSync} from "node:fs";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {Client} from "@colyseus/sdk";

const url=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(url??"") || !/^montra-front-test-/.test(path.basename(dir??"")))throw Error("Requires an isolated borderlands server");
const {GuildStore}=await import(existsSync("build/rooms/GuildStore.js")?"./build/rooms/GuildStore.js":"./src/rooms/GuildStore.ts");
const fixtures=await seedFixtures(),sdk=new Client(url),rooms=new Set();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(fn,label,timeout=16000){
  const end=Date.now()+timeout;while(Date.now()<end){const v=fn();if(v)return v;await sleep(60);}throw Error("timeout "+label);
}
async function createGuest(name,mapId,x,z){
  const token="mt1_"+randomBytes(32).toString("hex"),id=createHash("sha256").update(token).digest("hex");
  await writeFile(path.join(dir,id+".json"),JSON.stringify({version:1,id,name,level:12,experience:0,pkKills:0,pkDeaths:0,x,y:0,z,hp:416,mapId,
    inventory:{version:1,slots:Array(12).fill(null),equippedWeaponSlot:null},updatedAt:new Date().toISOString()}),{flag:"wx"});
  return {id,token};
}
async function seedFixtures(){
  // The server owns guild writes once clients join. A fixture connection writing
  // during either concurrent siege can lock its territory tick and close rooms.
  const guild=new GuildStore(path.join(dir,"guilds.sqlite"));
  async function crew(map,tag,flag,withDefender){
    const leader=await createGuest(tag+"One",map,...flag),scout=await createGuest(tag+"Two",map,...flag);
    guild.create(leader.id,tag+"One",tag+" Guild");guild.add(leader.id,scout.id,tag+"Two");
    let defender;
    if(withDefender){defender=await createGuest(tag+"Guard",map,...flag);guild.create(defender.id,tag+"Guard",tag+" Guard");}
    return {leader,scout,defender};
  }
  try{
    return {
      mine:{traveler:await createGuest("Rail","moon_pass",41,17),crew:await crew("moon_pass","Silver",[12,-36],true)},
      river:{traveler:await createGuest("Ferry","river_watch",-35,18),crew:await crew("river_watch","Delta",[-18,-29],false)},
    };
  }finally{guild.close();}
}
async function join(guest,ticket){
  const opts={worldVersion:1,atlasVersion:1,provinceVersion:1,warVersion:1,guestToken:guest.token,warTicket:ticket?.ticket};
  const r=ticket?await sdk.joinById(ticket.roomId,opts):await sdk.create("my_room",opts);rooms.add(r);
  const c={r,guest,events:[],local:null,me:()=>r.state.players?.get(r.sessionId)};
  r.onMessage("*",(type,data)=>{c.events.push({type,data});if(type==="territory_state")c.local=data.local;});
  await wait(c.me,"join");return c;
}
async function leave(c){await c.r.leave();rooms.delete(c.r);await sleep(220);}
async function request(c,key,data,type){
  c.events.length=0;c.r.send(key,data);return (await wait(()=>c.events.find(e=>e.type===type),key+" → "+type)).data;
}
async function walk(c,route){
  for(const [x,z] of route){
    c.r.send("move",{x,z});await wait(()=>Math.hypot(c.me().x-x,c.me().z-z)<.4,"walk "+x+","+z,45000);
  }
}
async function transit(map,g){
  let c=await join(g);
  const stops=JSON.parse(c.r.state.worldDefinition).maps[map].portals.filter(p=>p.targetMapId===map);
  const [a,b]=stops;
  assert.equal((await request(c,"warp",{portalId:b.id},"command_rejected")).reason,"portal_too_far");
  await request(c,"warp",{portalId:a.id},"warp_complete");
  await wait(()=>Math.hypot(c.me().x-a.targetSpawn.x,c.me().z-a.targetSpawn.z)<.1,"arrival");
  await leave(c);c=await join(g);
  assert.ok(Math.hypot(c.me().x-a.targetSpawn.x,c.me().z-a.targetSpawn.z)<.1);
  await sleep(3200);await request(c,"warp",{portalId:b.id},"warp_complete");
  await wait(()=>Math.hypot(c.me().x-b.targetSpawn.x,c.me().z-b.targetSpawn.z)<.1,"return");await leave(c);
}
async function enlist(c,start=false){
  const t=await request(c,start?"territory_start":"territory_join",{},"territory_transfer");await leave(c);return join(c.guest,t);
}
async function siege({leader,scout,defender}){
  const main=await enlist(await join(leader),true),wing=await enlist(await join(scout));
  let foe;
  if(defender)foe=await enlist(await join(defender));
  return {main,wing,foe};
}
async function mine({traveler,crew}){
  await transit("moon_pass",traveler);
  const {main,wing,foe}=await siege(crew);
  await Promise.all([walk(main,[[0,10],[0,-17],[12,-25]]),
    walk(wing,[[22,39],[48,42],[77,36],[82,22],[76,8],[76,-22],[83,-40],[82,-58]]),
    walk(foe,[[26,-66],[48,-84],[73,-89],[93,-76],[82,-65]])]);
  await wait(()=>main.local?.relay?.side==="attack","mine held");
  async function strike(hp){main.r.send("territory_gate",{});await wait(()=>main.local?.gateHp===hp,"gate HP "+hp);}
  await strike(90);await walk(foe,[[82,-58]]);await wait(()=>main.local?.relay?.contested,"mine contested");await strike(75);
  await walk(wing,[[82,-51]]);await wait(()=>main.local?.relay?.side==="defend","mine defended");await strike(65);
  console.log("PASS Moon Pass railway in both directions, save/rejoin, and 30/15/10 gate hits from live positions");
}
async function river({traveler,crew}){
  await transit("river_watch",traveler);
  const {main,wing}=await siege(crew);
  await Promise.all([walk(main,[[0,12],[-18,12],[-36,8],[-38,-46],[-22,-46],[-22,-35]]),
    walk(wing,[[0,12],[-18,12],[-35,18],[-35,25],[-56,32],[-78,25],[-87,8],[-84,-13],[-72,-35],[-67,-56]])]);
  await wait(()=>main.local?.relay?.side==="attack","river supplied");await sleep(2100);assert.equal(main.local.progress,0);
  await walk(main,[[-18,-29]]);
  await wait(()=>main.local?.attack===1 && main.local.progress>0,"flag crew");
  const sample=main.local;main.events.length=0;
  await wait(()=>main.events.filter(e=>e.type==="territory_state" && e.data.local?.attack===1 && e.data.local?.relay?.side==="attack").length>=5,"five supported banner samples",20000);
  assert.ok(main.local.progress-sample.progress>=8,"supplied flag accelerates");
  assert.equal((await request(wing,"warp",{portalId:"river_ferry_home"},"territory_error")).reason,"war_exit");
  console.log("PASS River Watch ferry/save/return, isolated supply cannot capture, flag crew gets its bonus");
}
try{
  const results=await Promise.allSettled([mine(fixtures.mine),river(fixtures.river)]);
  for(const result of results)if(result.status==="rejected")throw result.reason;
}finally{await Promise.allSettled([...rooms].map(r=>r.leave()));}
