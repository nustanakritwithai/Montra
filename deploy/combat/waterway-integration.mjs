import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {mkdtemp,readFile} from "node:fs/promises";
import {createServer} from "node:net";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {setTimeout as wait} from "node:timers/promises";
import {runInNewContext} from "node:vm";
import {Client} from "@colyseus/sdk";

process.env.MONTRA_CHARACTER_DIR=await mkdtemp(join(tmpdir(),"montra-water-gate-"));
process.env.MONTRA_WORLD_EXPANSION="1";
process.env.MONTRA_ORIGINAL_RELIEF="1";
process.env.MONTRA_ATLAS_RELIEF="1";
process.env.MONTRA_ACCOUNTS_REQUIRED="0";
process.env.MONTRA_BOATS_ENABLED="1";
const {defineServer,defineRoom}=await import("colyseus");
const {MyRoom}=await import("./src/rooms/MyRoom.ts");
const {getWorldMap,groundAt,WORLD_MAPS}=await import("./src/rooms/WorldMaps.ts");
const {characterStore}=await import("./src/rooms/CharacterStore.ts");
const village=getWorldMap("ritual_village"),marsh=getWorldMap("drowned_marsh"),lotus=getWorldMap("lotus_basin");
const watch=getWorldMap("river_watch"),estuary=getWorldMap("sam_lan_estuary");
const toMarsh=village.waterGates.find(gate=>gate.targetMapId===marsh.id);
const toVillage=marsh.waterGates.find(gate=>gate.targetMapId===village.id);
const visited=new Set();
class WaterGateRoom extends MyRoom {
  async onJoin(client,options){
    await super.onJoin(client,options);
    if(visited.has(options.guestToken))return;
    visited.add(options.guestToken);
    const map=options.lotus?lotus:options.marsh?marsh:village;
    const {x,z}=(options.lotus?map.boatPorts.find(port=>port.id==="lotus_west"):map.boatHarbor).shore;
    Object.assign(this.state.players.get(client.sessionId),{mapId:map.id,x,z,y:groundAt(map.id,x,z)});
  }
}
const listener=createServer();
await new Promise(resolve=>listener.listen(0,"127.0.0.1",resolve));
const {port}=listener.address();
await new Promise((resolve,reject)=>listener.close(error=>error?reject(error):resolve()));
const server=defineServer({rooms:{my_room:defineRoom(WaterGateRoom)}});
await server.listen(port,"127.0.0.1");
const sdk=new Client("http://127.0.0.1:"+port),open=new Set();
const opts=()=>({worldVersion:1,atlasVersion:1,atlasReliefVersion:1,originalReliefVersion:1,provinceVersion:1,riverCityVersion:1,
  guestToken:"mt1_"+randomBytes(32).toString("hex")});
const me=room=>room.state?.players?.get(room.sessionId);
const boats=room=>room.state.boats;
const command=(room,action,fields={})=>room.send("boat_intent",{action,...fields});
async function until(fn,label,timeout=7000){
  const end=Date.now()+timeout;
  while(Date.now()<end){const value=fn();if(value)return value;await wait(35);}
  throw Error("Timed out: "+label);
}
function observe(room){
  open.add(room);
  const events=[];
  room.onMessage("command_rejected",event=>events.push(event.reason));
  room.onMessage("*",()=>{});
  return {room,events};
}
async function leave(room){await room.leave();open.delete(room);}
async function rejected(info,action,fields,reason){
  const before=info.events.length;
  command(info.room,action,fields);
  await until(()=>info.events.slice(before).includes(reason),reason+" "+info.events.slice(before));
  await wait(560);
}

const core=await readFile(new URL("../../src/client/core/059-frame-loop-and-startup.js",import.meta.url),"utf8");
const terrain=await readFile(new URL("../../src/client/world/017-region-terrain.js",import.meta.url),"utf8");
const waterSource=terrain.slice(terrain.indexOf("  function terrainCell"),terrain.indexOf("  // ---- Ground patches"))+
  terrain.slice(terrain.indexOf("  function terrainHeight"),terrain.indexOf("  const waterPolygons"));
const courseSource=core.slice(core.indexOf("  function sailingCourse"),core.indexOf("  function setSailingDestination"));
const steeringSource=core.slice(core.indexOf("  function wrapSailingAngle"),core.indexOf('  $("boatLaunch")'));
const findCourse=runInNewContext(waterSource+courseSource+"\nsailingCourse;");
function navigator(point,boat){
  const map=getWorldMap(boat.mapId),course=findCourse({...map,boatDock:{deck:{length:5.2}}},boat,point);
  assert.ok(course.length,"navigable course to "+JSON.stringify(point));
  const scope={sailingDestination:{x:point.x,z:point.z,course,aligning:true,progress:{x:boat.x,z:boat.z,heading:boat.heading,at:0}},
    clearSailingDestination(){scope.sailingDestination=null;}};
  return runInNewContext(steeringSource+"\nsailingInputForDestination;",scope);
}
async function sail(room,id,point,range=2.5){
  const boat=boats(room).get(id),steer=navigator(point,boat),start=Date.now();
  const budget=Math.max(30000,Math.hypot(boat.x-point.x,boat.z-point.z)*450+15000);
  while(Date.now()-start<budget){
    const boat=boats(room).get(id);
    if(Math.hypot(boat.x-point.x,boat.z-point.z)<range)return;
    command(room,"input",{...steer(boat,Date.now()-start),anchor:false,passage:boat.passage});
    await wait(105);
  }
  throw Error("Could not sail to "+JSON.stringify({point,boat:boats(room).get(id)}));
}
async function launch(room){
  const id="boat-"+room.sessionId;
  command(room,"launch");
  await until(()=>boats(room).has(id),"boat launch");
  command(room,"board",{boatId:id});
  await until(()=>me(room).boatId===id,"owner boards");
  command(room,"helm");
  await until(()=>boats(room).get(id)?.helmId===room.sessionId,"owner takes helm");
  return id;
}
function localDeck(player,boat){
  const dx=player.x-boat.x,dz=player.z-boat.z,c=Math.cos(boat.heading),s=Math.sin(boat.heading);
  return [dx*c-dz*s,dx*s+dz*c];
}
function assertStern(room,boat){
  const deck=JSON.parse(room.state.worldDefinition).maps[boat.mapId].boatDock.deck;
  const [x,z]=localDeck(me(room),boat);
  assert.equal(boat.helmId,room.sessionId);
  assert.ok(deck.helmZ<0 && Math.abs(x)<.06 && Math.abs(z-deck.helmZ)<.06);
  assert.ok(Math.cos(me(room).facing-boat.heading)<-.999,"pilot faces the bow from the stern");
}
const passengerOptions=opts();
try{
  for(const map of Object.values(WORLD_MAPS)){
    const definition={...map,boatDock:{deck:{length:5.2}}};
    const points=[...map.boatPorts.map(port=>port.berth),...map.waterGates];
    for(const from of points)for(const to of points)if(from!==to)
      assert.ok(findCourse(definition,from,to).length, map.id+" course "+JSON.stringify({from,to}));
  }
  console.log("PASS client sailing routes between all docks and gates");
  const pilot=observe(await sdk.create("my_room",opts()));
  const passenger=observe(await sdk.joinById(pilot.room.roomId,passengerOptions));
  const blocker=observe(await sdk.joinById(pilot.room.roomId,{...opts(),marsh:true}));
  await until(()=>me(pilot.room)?.persistent && me(passenger.room)?.persistent && me(blocker.room)?.mapId===marsh.id,"crew and destination");
  const id=await launch(pilot.room),blockId=await launch(blocker.room);
  const boat=()=>boats(pilot.room).get(id);
  assertStern(pilot.room,boat());
  command(passenger.room,"board",{boatId:id});
  await until(()=>me(passenger.room).boatId===id,"passenger boards");
  await rejected(passenger,"warp",{gateId:toMarsh.id},"boat_gate_helm");
  await rejected(pilot,"warp",{gateId:toMarsh.id},"boat_gate_range");
  await Promise.all([sail(pilot.room,id,toMarsh),sail(blocker.room,blockId,toVillage)]);
  command(blocker.room,"input",{throttle:0,steer:0,anchor:true,passage:0});
  command(pilot.room,"input",{throttle:0,steer:0,anchor:true,passage:0});
  await rejected(pilot,"warp",{gateId:toMarsh.id},"boat_gate_busy");
  assert.equal(me(passenger.room).mapId,village.id);
  await leave(blocker.room);
  await until(()=>!boats(pilot.room).has(blockId),"destination is free");

  const save=characterStore.saveTravelGroup;
  characterStore.saveTravelGroup=()=>{throw Error("injected save failure");};
  try{await rejected(pilot,"warp",{gateId:toMarsh.id},"boat_gate_save_failed");}
  finally{characterStore.saveTravelGroup=save;}
  assert.equal(boat().mapId,village.id);
  assert.equal(me(pilot.room).mapId,village.id);
  assert.equal(me(passenger.room).mapId,village.id);

  const hp=boat().hp,deck=localDeck(me(passenger.room),boat());
  command(pilot.room,"warp",{gateId:toMarsh.id});
  await until(()=>boat()?.mapId===marsh.id && me(pilot.room).mapId===marsh.id &&
    me(passenger.room).mapId===marsh.id,"boat and both riders enter marsh");
  assert.equal(boats(pilot.room).size,1);
  assert.equal(boat().passage,1);
  assert.equal(boat().hp,hp);
  assertStern(pilot.room,boat());
  assert.equal(me(passenger.room).boatId,id);
  localDeck(me(passenger.room),boat()).forEach((value,i)=>assert.ok(Math.abs(value-deck[i])<.06));
  await rejected(pilot,"input",{throttle:1,steer:0,anchor:false,passage:0},"boat_action_unavailable");
  assert.equal(boat().speed,0);

  const toLotus=marsh.waterGates.find(gate=>gate.targetMapId===lotus.id);
  const backToMarsh=lotus.waterGates.find(gate=>gate.targetMapId===marsh.id);
  assert.ok(Math.hypot(boat().x-toLotus.x,boat().z-toLotus.z)>160);
  await sail(pilot.room,id,toLotus);
  command(pilot.room,"warp",{gateId:toLotus.id});
  await until(()=>boat()?.mapId===lotus.id && me(passenger.room).mapId===lotus.id,
    "same crew sails across the marsh and enters Lotus Basin");
  assert.equal(boat().passage,2);
  assert.equal(boat().hp,hp);
  assertStern(pilot.room,boat());
  await wait(3200);
  command(pilot.room,"warp",{gateId:backToMarsh.id});
  await until(()=>boat()?.mapId===marsh.id && me(passenger.room).mapId===marsh.id,
    "crew returns through the eastern marsh gate");
  assert.equal(boat().passage,3);

  // Rejoining immediately after a confirmed crossing places the passenger on the new bank.
  await leave(passenger.room);
  const rejoined=observe(await sdk.joinById(pilot.room.roomId,passengerOptions));
  await until(()=>me(rejoined.room)?.mapId===marsh.id && !me(rejoined.room).boatId,"passenger reconnects at the marsh bank");
  const nearestBank=marsh.boatPorts.find(port=>port.id==="marsh_reeds").shore;
  assert.ok(Math.hypot(me(rejoined.room).x-nearestBank.x,me(rejoined.room).z-nearestBank.z)<.1);
  assert.equal(boat().helmId,pilot.room.sessionId);

  const turn={x:toVillage.x,z:toVillage.z+8};
  await sail(pilot.room,id,turn);
  assert.ok(boat().z>toVillage.z+5 && boat().passage===3);
  await sail(pilot.room,id,toVillage);
  command(pilot.room,"warp",{gateId:toVillage.id});
  await until(()=>boat()?.mapId===village.id && me(pilot.room).mapId===village.id,"same boat returns to the village");
  assert.equal(boat().passage,4);
  assert.equal(boat().hp,hp);
  assertStern(pilot.room,boat());
  assert.equal(boats(pilot.room).size,1);
  console.log("PASS waterways: sailing to gates, occupied berth, save failure, two riders, preserved hull and helm, stale input, full marsh crossing, reconnect and return");
  await leave(pilot.room);
  await leave(rejoined.room);

  const portPilot=observe(await sdk.create("my_room",{...opts(),lotus:true})).room;
  const portRider=observe(await sdk.joinById(portPilot.roomId,{...opts(),lotus:true})).room;
  await until(()=>me(portPilot)?.mapId===lotus.id && me(portRider)?.mapId===lotus.id,"crew at west lotus port");
  const vessel=await launch(portPilot),ship=()=>boats(portPilot).get(vessel);
  const west=lotus.boatPorts.find(port=>port.id==="lotus_west");
  assert.ok(Math.hypot(ship().x-west.berth.x,ship().z-west.berth.z)<.1);
  command(portRider,"board",{boatId:vessel});
  await until(()=>me(portRider).boatId===vessel,"board at the alternate port");
  const hull=ship().hp;

  async function cross(map,destination,passage){
    const gate=map.waterGates.find(entry=>entry.targetMapId===destination.id);
    await sail(portPilot,vessel,gate);
    command(portPilot,"warp",{gateId:gate.id});
    await until(()=>ship()?.mapId===destination.id && me(portRider).mapId===destination.id,"crew enters "+destination.id);
    assert.equal(ship().passage,passage);
    assert.equal(ship().hp,hull);
  }
  async function landAt(map,id,boardAgain){
    const port=map.boatPorts.find(entry=>entry.id===id);
    await sail(portPilot,vessel,port.berth,1.4);
    command(portPilot,"input",{throttle:0,steer:0,anchor:true,passage:ship().passage});
    await until(()=>ship().anchored && Math.abs(ship().speed)<.4,"anchored at "+id);
    for(const room of [portRider,portPilot]){
      command(room,"exit");
      await until(()=>!me(room).boatId,"shore at "+id);
      assert.ok(Math.hypot(me(room).x-port.shore.x,me(room).z-port.shore.z)<.1,id+" dry landing");
    }
    if(!boardAgain)return;
    for(const room of [portPilot,portRider]){
      command(room,"board",{boatId:vessel});
      await until(()=>me(room).boatId===vessel,"board again at "+id);
    }
    command(portPilot,"helm");
    await until(()=>ship().helmId===portPilot.sessionId,"resume from "+id);
  }
  await cross(lotus,watch,1);
  await landAt(watch,"watch_east",true);
  console.log("PASS Lotus alternate-port launch, Watch east-port landing and reboard with two riders");
  await cross(watch,estuary,2);
  await landAt(estuary,"sam_lan_west",false);
  console.log("PASS same boat and both riders reached the Sam Lan west port");
}catch(error){
  console.error(error);
  process.exitCode=1;
}finally{
  for(const room of open)await room.leave();
  await server.gracefullyShutdown(false);
  characterStore.close();
}
