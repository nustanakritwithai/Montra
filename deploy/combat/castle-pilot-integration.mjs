import assert from "node:assert/strict";
import {createHash,randomBytes} from "node:crypto";
import {existsSync} from "node:fs";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {Client} from "@colyseus/sdk";
const url=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(url??"") || !/^montra-castle-test-/.test(path.basename(dir??"")) || process.env.MONTRA_CASTLE_PILOT!=="1")throw Error("Requires an isolated local castle pilot");
const {GuildStore}=await import(existsSync("build/rooms/GuildStore.js")?"./build/rooms/GuildStore.js":"./src/rooms/GuildStore.ts");
const guild=new GuildStore(path.join(dir,"guilds.sqlite")),sdk=new Client(url),rooms=new Set();
const options={worldVersion:1,atlasVersion:1,templeVersion:1,provinceVersion:1,warVersion:1,castleVersion:1};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(fn,label,ms=14000){const end=Date.now()+ms;while(Date.now()<end){const v=fn();if(v)return v;await sleep(55);}throw Error("timeout "+label);}
async function seed(name,mapId,x,z){
  const token="mt1_"+randomBytes(32).toString("hex"),id=createHash("sha256").update(token).digest("hex"),slots=Array(12).fill(null);
  slots[0]={itemId:"health_potion",quantity:2};slots[1]={itemId:"ritual_dagger",quantity:1};
  await writeFile(path.join(dir,id+".json"),JSON.stringify({version:1,id,name,level:12,experience:0,pkKills:0,pkDeaths:0,x,y:0,z,hp:416,mapId,inventory:{version:1,slots,equippedWeaponSlot:1},updatedAt:new Date().toISOString()}),{flag:"wx"});
  return {token,id};
}
async function join(guest,id,warTicket,version=1){
  const opt={...options,castleVersion:version,guestToken:guest.token,warTicket};
  const r=id?await sdk.joinById(id,opt):await sdk.create("my_room",opt);rooms.add(r);
  const c={r,events:[],me:()=>r.state.players?.get(r.sessionId),latest:null};
  r.onMessage("*",(type,data)=>{c.events.push({type,data});if(type==="territory_state")c.latest=data.local;});
  await wait(c.me,"join");return c;
}
async function send(c,k,d,target,test=()=>true){
  c.events.length=0;c.r.send(k,d);return (await wait(()=>c.events.find(e=>e.type===target&&test(e.data)),k)).data;
}
async function leave(c){await c.r.leave();rooms.delete(c.r);await sleep(180);}
async function walk(c,x,z){c.r.send("move",{x,z});await wait(()=>Math.hypot(c.me().x-x,c.me().z-z)<.4,"walk "+x+","+z,110000);}
async function warp(c,target){
  const source=c.me().mapId,p=JSON.parse(c.r.state.worldDefinition).maps[source].portals.find(p=>p.id===target || p.targetMapId===target);
  c.r.send("warp",{portalId:p.id});await wait(()=>c.me().mapId===p.targetMapId&&Math.hypot(c.me().x-p.targetSpawn.x,c.me().z-p.targetSpawn.z)<.3,"warp "+p.id);
}
const id="tri_wiang_castle";
try{
  const guest=await seed("Traveller","fallen_city",0,-58);
  let c=await join(guest,undefined,undefined,0);
  await send(c,"warp",{portalId:"fallen_city_to_"+id},"command_rejected",e=>e.reason==="world_client_update_required");await leave(c);
  c=await join(guest);await warp(c,id);await leave(c);c=await join(guest);assert.equal(c.me().mapId,id);assert.ok(c.me().z>890);
  await walk(c,-18,900);await warp(c,"castle_cart_north");await walk(c,0,-900);await warp(c,"asura_peak");await sleep(3300);await warp(c,id);
  await walk(c,-18,-900);await warp(c,"castle_cart_south");await walk(c,0,900);await warp(c,"fallen_city");await leave(c);
  console.log("PASS both neighbour portals, civilian carriage in both directions, large-coordinate save and legacy-client guard");
  const sideRooms={attack:[],defend:[]},field=[];
  for(const side of ["attack","defend"]){
    let leader,publicRoom;
    for(let i=0;i<11;i++){
      const name=(side==="attack"?"West":"East")+i,guest=await seed(name,id,0,880);
      if(!i){leader=guest;guild.create(guest.id,name,name+" Guild");}else guild.add(leader.id,guest.id,name);
      const c=await join(guest,i>0&&i<10?publicRoom:undefined);if(!i)publicRoom=c.r.roomId;
      sideRooms[side].push({guest,c,point:[2,4,5][i%3]});
    }
  }
  for(const side of ["attack","defend"])for(const [i,entry] of sideRooms[side].entries()){
    // All three active points have both sides on the roster. Defenders hold outside the circles.
    const {c,guest,point}=entry,verb=side==="attack" && !i?"territory_start":"territory_join";
    if(i===10){await send(c,verb,{objectiveId:point},"territory_error",e=>e.reason==="war_side_full");continue;}
    const ticket=await send(c,verb,{objectiveId:point},"territory_transfer");await leave(c);
    const fighter=await join(guest,ticket.roomId,ticket.ticket);assert.ok(!field.length||field[0].c.r.roomId===fighter.r.roomId);
    field.push({side,point,c:fighter});
  }
  await wait(()=>field.every(e=>e.c.r.state.players.size===20),"twenty synchronized clients");
  const places={2:[-680,100],4:[-250,-110],5:[0,155]};
  const departed=Date.now();
  await Promise.all(field.filter(f=>f.side==="attack").map(f=>walk(f.c,...places[f.point])));
  console.log("Travel to three fronts (last arrival):",Math.round((Date.now()-departed)/1000),"seconds");
  const observer=field[19].c;
  const receipt=setInterval(()=>console.log("Observed capture",observer.latest?.seconds,observer.latest?.pilot?.points.map(p=>p.progress+"/"+p.owner)),15000);
  try{await wait(()=>observer.latest?.pilot?.linked==="attack","linked 2–4–5 on defending client",130000);}finally{clearInterval(receipt);}
  const base=observer.latest.pilot.score.attack;
  await wait(()=>observer.latest.pilot.score.attack>=base+9,"server accrues network score",7000);
  assert.ok(observer.latest.pilot.points.every(p=>p.owner==="attack"));
  console.log("PASS 10v10 in one private room, both eleventh seats refused, three simultaneous captures, network bonus and replicated scores");
}finally{guild.close();await Promise.allSettled([...rooms].map(r=>r.leave()));}
