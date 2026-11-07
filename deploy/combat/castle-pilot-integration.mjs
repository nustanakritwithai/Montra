import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {createHash,randomBytes} from "node:crypto";
import {existsSync} from "node:fs";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {Client} from "@colyseus/sdk";
const url=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(url??"") || !/^montra-castle-test-/.test(path.basename(dir??"")) || process.env.MONTRA_CASTLE_PILOT!=="1" || process.env.MONTRA_CASTLE_IN_PROCESS!=="1" || url!==`http://127.0.0.1:${process.env.PORT}`)throw Error("Requires an owned in-process isolated local castle pilot with matching PORT");
const {GuildStore}=await import(existsSync("build/rooms/GuildStore.js")?"./build/rooms/GuildStore.js":"./src/rooms/GuildStore.ts");
const guild=new GuildStore(path.join(dir,"guilds.sqlite")),sdk=new Client(url),rooms=new Set();
const options={worldVersion:1,atlasVersion:1,templeVersion:1,provinceVersion:1,warVersion:1,atlasReliefVersion:1,originalReliefVersion:1};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(fn,label,ms=14000){const end=Date.now()+ms;while(Date.now()<end){const v=fn();if(v)return v;await sleep(55);}throw Error("timeout "+label);}
async function seed(name,mapId,x,z){
  const token="mt1_"+randomBytes(32).toString("hex"),id=createHash("sha256").update(token).digest("hex"),slots=Array(12).fill(null);
  slots[0]={itemId:"health_potion",quantity:2};slots[1]={itemId:"ritual_dagger",quantity:1};
  await writeFile(path.join(dir,id+".json"),JSON.stringify({version:1,id,name,level:12,experience:0,pkKills:0,pkDeaths:0,x,y:0,z,hp:416,mapId,...(mapId==="tri_wiang_castle"?{castleLayout:2}:{}),inventory:{version:1,slots,equippedWeaponSlot:1},updatedAt:new Date().toISOString()}),{flag:"wx"});
  return {token,id};
}
async function join(guest,id,warTicket,version=2){
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
  for(let i=0;i<12;i++){
    c.events.length=0;c.r.send("warp",{portalId:p.id});
    const outcome=await wait(()=>c.me().mapId===p.targetMapId&&Math.hypot(c.me().x-p.targetSpawn.x,c.me().z-p.targetSpawn.z)<.3?"arrived":
      c.events.find(e=>e.type==="command_rejected")?.data.reason,"warp "+p.id);
    if(outcome==="arrived")return;
    assert.equal(outcome,"warp_cooldown","rejected "+p.id);
    await sleep(600);
  }
  throw Error("portal cooldown did not expire for "+p.id);
}
const id="tri_wiang_castle";
let server;
try{
  // Share the test server's event loop, not its sockets: all clients still use the
  // real SDK/WebSocket transport. Synchronous SQLite checkpoint writes cannot
  // overlap the room's synchronous transactions on another connection.
  const bootstrap=await import(existsSync("build/index.js")?"./build/index.js":"./src/index.ts");
  server=bootstrap.server;
  assert.ok(server && typeof server.gracefullyShutdown==="function" && typeof bootstrap.ready?.then==="function","verification bootstrap must expose server ownership and readiness");
  await bootstrap.ready;
  const guest=await seed("Traveller","fallen_city",0,-58);
  let c=await join(guest,undefined,undefined,1);
  await send(c,"warp",{portalId:"fallen_city_to_"+id},"command_rejected",e=>e.reason==="world_client_update_required");await leave(c);
  c=await join(guest);await warp(c,id);await leave(c);c=await join(guest);assert.equal(c.me().mapId,id);assert.ok(Math.abs(c.me().z-313.75)<.1);
  await walk(c,-18,315);await warp(c,"castle_cart_north");await walk(c,0,-315);await warp(c,"asura_peak");await sleep(3300);await warp(c,id);
  await walk(c,-18,-315);await warp(c,"castle_cart_south");await walk(c,0,315);await warp(c,"fallen_city");await leave(c);
  console.log("PASS both neighbour portals, civilian carriage in both directions, large-coordinate save and legacy-client guard");
  const sideRooms={attack:[],defend:[]},field=[];
  for(const side of ["attack","defend"]){
    let leader,publicRoom;
    for(let i=0;i<11;i++){
      const name=(side==="attack"?"West":"East")+i,guest=await seed(name,id,0,308);
      if(!i){leader=guest;guild.create(guest.id,name,name+" Guild");}else guild.add(leader.id,guest.id,name);
      const c=await join(guest,i>0&&i<10?publicRoom:undefined);if(!i)publicRoom=c.r.roomId;
      sideRooms[side].push({guest,c,point:[1,2,3][i%3]});
    }
  }
  for(const side of ["attack","defend"])for(const [i,entry] of sideRooms[side].entries()){
    // Both guilds deploy to all three exterior approaches. Defenders remain outside the circles.
    const {c,guest,point}=entry,verb=side==="attack" && !i?"territory_start":"territory_join";
    if(i===10){await send(c,verb,{objectiveId:point},"territory_error",e=>e.reason==="war_side_full");continue;}
    const ticket=await send(c,verb,{objectiveId:point},"territory_transfer");await leave(c);
    const fighter=await join(guest,ticket.roomId,ticket.ticket);assert.ok(!field.length||field[0].c.r.roomId===fighter.r.roomId);
    field.push({side,point,c:fighter});
  }
  await wait(()=>field.every(e=>e.c.r.state.players.size===20),"twenty synchronized clients");
  const battlefield=JSON.parse(field[0].c.r.state.worldDefinition).maps[id].strategic;
  const places=Object.fromEntries(battlefield.objectives.map(p=>[p.id,[p.x,p.z]]));
  const departed=Date.now();
  await Promise.all(field.filter(f=>f.side==="attack").map(f=>walk(f.c,...places[f.point])));
  const travelMs=Date.now()-departed;assert.ok(travelMs<32_000,"approach time "+travelMs);
  console.log("Travel to three fronts (last arrival):",Math.round(travelMs/1000),"seconds");
  const observer=field[19].c;
  const receipt=setInterval(()=>console.log("Observed capture",observer.latest?.seconds,observer.latest?.pilot?.points.map(p=>p.progress+"/"+p.owner)),15000);
  try{await wait(()=>observer.latest?.pilot?.points.filter(p=>p.owner==="attack").length===3,"three exterior banners replicated",130000);}finally{clearInterval(receipt);}
  const base=observer.latest.pilot.score.attack;
  await wait(()=>observer.latest.pilot.score.attack>=base+9,"server accrues exterior income",20000);
  const v=observer.latest.pilot;
  assert.deepEqual(v.points.filter(p=>p.owner==="attack").map(p=>p.id),[1,2,3]);
  assert.equal(v.points.length,6);assert.equal(v.linked,null);assert.equal(v.throne.attack.outer,3);
  assert.equal(v.throne.attack.middle,0);assert.equal(v.throne.progress.attack,0);
  assert.equal(Object.keys(v.gates).length,9);assert.ok(Object.values(v.gates).every(g=>!g.closed));
  console.log("PASS 10v10 capped, exterior captures synchronized, six scoring points, neutral gates, locked throne, no spurious link bonus");
  // Move only the isolated fixture's clocks. The running room settles the battle and reports its owner.
  const fixture=new DatabaseSync(path.join(dir,"guilds.sqlite"));
  try{
    fixture.prepare("UPDATE territory_battles SET started=? WHERE site=? AND ended IS NULL").run(Date.now()-45*60_000+3000,id);
    await wait(()=>observer.latest?.phase==="protected","score victory");
    assert.equal(observer.latest.owner,"West0 Guild");
    fixture.prepare("UPDATE territory_battles SET ended=? WHERE site=? AND ended IS NOT NULL").run(Date.now()-8*3600_000,id);
  }finally{fixture.close();}
  const newLeader=await seed("Invader",id,0,308);guild.create(newLeader.id,"Invader","Mountain");
  const challenger=await join(newLeader);const guard=sideRooms.attack[10];
  async function enlist(c,guest,verb){
    const t=await send(c,verb,{objectiveId:2},"territory_transfer");await leave(c);
    return join(guest,t.roomId,t.ticket);
  }
  const raider=await enlist(challenger,newLeader,"territory_start"),keeper=await enlist(guard.c,guard.guest,"territory_join");
  await wait(()=>keeper.latest?.pilot?.throne.defended,"incumbent defence");
  const gateBox=battlefield.rampart.gates.find(g=>g.id==="outer-west").box;
  const gateX=gateBox.x+gateBox.width/2,gateZ=gateBox.z+gateBox.length/2;
  assert.ok(keeper.me().x>gateX && keeper.me().x<gateX+15);
  const guardBase={x:keeper.me().x,z:keeper.me().z};
  assert.ok(Object.values(keeper.latest.pilot.gates).every(g=>g.closed));
  const gateId="outer-west",gate=()=>keeper.latest.pilot.gates[gateId];
  await send(raider,"territory_gate",{gateId},"territory_error",e=>e.reason==="war_gate_near");
  await Promise.all([walk(raider,gateX-3,gateZ),(async()=>{
    await walk(keeper,gateX+3,gateZ);keeper.r.send("territory_gate",{gateId});
    await wait(()=>!gate().closed,"open from inside");
    await walk(keeper,gateX+.5,gateZ);await sleep(1050);
    await send(keeper,"territory_gate",{gateId},"territory_error",e=>e.reason==="war_gate_occupied");
    await walk(keeper,gateX+3,gateZ);await sleep(1050);keeper.r.send("territory_gate",{gateId});
    await wait(()=>gate().closed,"close clear gateway");
  })()]);
  for(let hp=105;hp>=0;hp-=15){
    raider.r.send("territory_gate",{gateId});await wait(()=>gate().hp===hp,"replicated breach "+hp);await sleep(1050);
  }
  await walk(raider,gateX+6,gateZ);assert.ok(!gate().closed);
  assert.equal(keeper.latest.pilot.gates["inner-west"].hp,120);
  console.log("PASS live score victory, next siege garrison, remote action refused, occupied gate protected, breached gate traversed");
  // Resume two late-battle ownership checkpoints in the isolated fixture. Movement, orders,
  // census, combat, death and respawn still run through the ordinary live server.
  function holdWest(side){
    const db=new DatabaseSync(path.join(dir,"guilds.sqlite"));
    try{
      db.prepare(`UPDATE territory_battles SET pilot_json=json_set(pilot_json,
        '$.points[1].owner',?,'$.points[3].owner',?,'$.points[4].owner',?,
        '$.siege.gates."middle-west".open',json('true')) WHERE site=? AND ended IS NULL`).run(side,side,side,id);
    }finally{db.close();}
  }
  const selectCamp=(c,campId)=>send(c,"territory_camp",{action:"select",campId},"territory_state",p=>p.local?.supply?.selected===campId);
  const march=(c)=>c.r.send("territory_camp",{action:"march",campId:4});
  const camp=battlefield.forwardCamps.find(c=>c.id===4),[storeX,storeZ]=places[4];
  const atCamp=c=>Math.hypot(c.me().x-camp.x,c.me().z-camp.z)<2;
  const available=c=>c.latest?.supply?.camps.find(p=>p.id===4)?.status;
  holdWest("attack");await wait(()=>available(raider)==="ready","western supply");
  // Queue a real server write while a fixture transaction owns the writer lock.
  // The lock spans a 50ms server tick but is released before yielding this event
  // loop; a separate server process would be able to collide with it.
  const selection=(()=>{
    const db=new DatabaseSync(path.join(dir,"guilds.sqlite"));
    let locked=false;
    try{
      assert.throws(()=>db.prepare("UPDATE territory_battles SET __missing_fixture_column=1").run(),e=>e.errcode===1,"SQL errors must propagate");
      db.exec("BEGIN IMMEDIATE");locked=true;
      assert.equal(db.prepare("UPDATE territory_battles SET started=started WHERE site=? AND ended IS NULL").run(id).changes,1);
      const pending=selectCamp(raider,4);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,75);
      db.exec("COMMIT");locked=false;
      return pending;
    }finally{try{if(locked)db.exec("ROLLBACK");}finally{db.close();}}
  })();
  await selection;
  console.log("PASS queued camp write survives fixture writer lock; SQL errors still propagate");
  await send(raider,"territory_camp",{action:"march",campId:4},"territory_error",e=>e.reason==="war_camp_base");
  await leave(raider);
  const scout=await enlist(await join(newLeader),newLeader,"territory_join");
  await wait(()=>scout.latest?.supply?.selected===4 && scout.latest.supply.atBase,"saved preference at original base");
  march(scout);await wait(()=>atCamp(scout),"march to warehouse");await walk(scout,storeX,storeZ);
  holdWest("defend");
  await wait(()=>available(keeper)==="contested" && keeper.latest.supply.drums.includes(4),"friendly drum signal");
  assert.deepEqual(scout.latest.supply.drums,[]);assert.equal(sideRooms.defend[10].c.latest.supply,undefined);
  assert.equal(keeper.latest.pilot.points.find(p=>p.id===4).progress,0);
  await send(keeper,"territory_camp",{action:"select",campId:4},"territory_error",e=>e.reason==="war_camp_cut");
  await Promise.all([walk(scout,camp.x-2,camp.z),walk(keeper,guardBase.x,guardBase.z)]);
  await wait(()=>available(keeper)==="contested" && !keeper.latest.supply.drums.length,"enemy at camp prevents spawn without a false drum signal");
  await walk(scout,storeX-5,storeZ+16);
  await wait(()=>available(keeper)==="ready","enemy left and route reopened");
  await selectCamp(keeper,4);march(keeper);await wait(()=>atCamp(keeper),"incumbent reinforcements");
  async function defeatGuard(){
    await walk(scout,keeper.me().x+.5,keeper.me().z);
    const deaths=keeper.me().pkDeaths,kills=scout.me().pkKills,eventStart=scout.events.length;
    let nextOrderAt=0,orders=0;
    // This is death setup for the respawn checks, not an uninterrupted auto-attack test.
    // A participation reward temporarily makes its recipient unavailable while saving;
    // if that overlaps a combat tick, the server clears the attack target. Resume with
    // ordinary player commands, only after the target clears and at most once a second.
    try{
      await wait(()=>{
        if(!keeper.me().alive)return true;
        if(scout.me().targetId!==keeper.r.sessionId && Date.now()>=nextOrderAt){
          scout.r.send("attack",{targetId:keeper.r.sessionId});nextOrderAt=Date.now()+1000;orders++;
        }
        return false;
      },"defeat at the front",65000);
      assert.equal(keeper.me().hp,0,"real lethal damage");
      assert.equal(keeper.me().pkDeaths,deaths+1,"one server-confirmed death");
      await Promise.all([
        wait(()=>scout.me().pkKills===kills+1,"server kill credit"),
        wait(()=>keeper.me().alive,"server respawn",20000),
      ]);
    }catch(error){
      const snapshot=c=>{const p=c.me();return {x:p.x,y:p.y,z:p.z,hp:p.hp,alive:p.alive,targetId:p.targetId,combatState:p.combatState};};
      throw new Error("front-line death setup failed "+JSON.stringify({orders,scout:snapshot(scout),keeper:snapshot(keeper),
        combat:scout.events.slice(eventStart).filter(e=>["command_rejected","pvp_hit","pvp_kill","experience_gained"].includes(e.type)).slice(-12)}),{cause:error});
    }
  }
  await walk(keeper,storeX-5,storeZ+16);
  await defeatGuard();assert.ok(atCamp(keeper),"respawn at selected supplied camp");
  await walk(keeper,storeX,storeZ);await defeatGuard();
  assert.ok(Math.hypot(keeper.me().x-guardBase.x,keeper.me().z-guardBase.z)<.2,"contested camp falls back to original base");
  console.log("PASS authenticated dispatch, persisted choice, side-only drums, real death at supplied camp and contested fallback");
}finally{
  try{guild.close();await Promise.allSettled([...rooms].map(r=>r.leave()));}
  finally{if(server)await server.gracefullyShutdown(false);}
}
