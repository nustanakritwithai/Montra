import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {mkdtemp} from "node:fs/promises";
import {createServer} from "node:net";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {setTimeout as wait} from "node:timers/promises";
import {Client} from "@colyseus/sdk";

process.env.MONTRA_CHARACTER_DIR = await mkdtemp(join(tmpdir(),"montra-boat-test-"));
process.env.MONTRA_ACCOUNTS_REQUIRED = "0";
process.env.MONTRA_WORLD_EXPANSION = "1";
process.env.MONTRA_BOATS_ENABLED = "1";
const {defineServer,defineRoom} = await import("colyseus");
const {MyRoom} = await import("./src/rooms/MyRoom.ts");
const {BOAT_SHORES,boatCanSail,parseBoatIntent} = await import("./src/rooms/MontraBoats.ts");
const {BOAT_DOCK_SPAWNS} = await import("./src/rooms/PirateBoatRules.ts");
const {groundAt,isSafeWorldPoint,getWorldMap} = await import("./src/rooms/WorldMaps.ts");
const {waterDepthAt} = await import("./src/rooms/GroundTerrain.ts");

for (const [mapId, dock] of Object.entries(BOAT_DOCK_SPAWNS)) {
  assert.ok(boatCanSail(mapId,dock.x,dock.z,2.6), mapId+" launch is on navigable water");
  const shore = BOAT_SHORES[mapId], map = getWorldMap(mapId);
  assert.ok(isSafeWorldPoint(map,{...shore,y:groundAt(mapId,shore.x,shore.z)}), mapId+" shore is walkable");
  assert.ok(!boatCanSail(mapId,shore.x,shore.z,2.6), mapId+" shore is blocked to boats");
}
assert.equal(parseBoatIntent({action:"input",throttle:1,steer:0,x:25}),null);
assert.equal(parseBoatIntent({action:"walk",x:Infinity,z:0}),null);

let game;
const visited = new Set();
class BoatTestRoom extends MyRoom {
  async onJoin(client, options) {
    await super.onJoin(client,options);
    game = this;
    if (visited.has(options.guestToken)) return;
    visited.add(options.guestToken);
    const player = this.state.players.get(client.sessionId);
    const mapId=options.marsh ? "drowned_marsh" : "ritual_village";
    const shore = BOAT_SHORES[mapId];
    Object.assign(player,{mapId,...shore,y:groundAt(mapId,shore.x,shore.z)});
  }
}

const probe = createServer();
await new Promise(resolve=>probe.listen(0,"127.0.0.1",resolve));
const {port} = probe.address();
await new Promise((resolve,reject)=>probe.close(error=>error ? reject(error) : resolve()));
const server = defineServer({rooms:{my_room:defineRoom(BoatTestRoom)}});
await server.listen(port,"127.0.0.1");
const sdk = new Client("http://127.0.0.1:"+port), clients = new Set();
const opts = () => ({worldVersion:1,atlasVersion:1,atlasReliefVersion:1,originalReliefVersion:1,
  guestToken:"mt1_"+randomBytes(32).toString("hex")});
const me = room => room.state?.players?.get(room.sessionId);
const command = (room, action, fields = {}) => room.send("boat_intent",{action,...fields});
const observe = room => {
  clients.add(room);
  const rejected = [];
  room.onMessage("command_rejected",value=>rejected.push(value.reason));
  room.onMessage("*",()=>{});
  return {room,rejected};
};
async function until(fn, label, timeout = 6500) {
  const end = Date.now()+timeout;
  while (Date.now()<end) {const value = fn();if(value) return value;await wait(30);}
  throw Error("Timed out: "+label);
}

const pilotOptions = opts();
try {
  let {room:pilot} = observe(await sdk.create("my_room",pilotOptions));
  const {room:passenger,rejected} = observe(await sdk.joinById(pilot.roomId,opts()));
  await until(()=>pilot.state?.boatsAvailable && me(pilot) && me(passenger),"both actors ashore");
  const village=getWorldMap("ritual_village"), river=village.water[0];
  const remoteVillage=JSON.parse(pilot.state.worldDefinition).maps.ritual_village;
  assert.deepEqual(remoteVillage.water,village.water);
  assert.equal(remoteVillage.waterLevel,village.waterLevel);
  pilot.send("move",{x:0,z:river.z+6});
  await until(()=>me(pilot).z>river.z+5.7 && me(pilot).y<-1,"walk below the water surface");
  await pilot.leave();
  clients.delete(pilot);
  ({room:pilot}=observe(await sdk.joinById(passenger.roomId,pilotOptions)));
  await until(()=>me(pilot)?.z>river.z+5.7 && me(pilot).y<-1,"reconnect to the same bed");
  pilot.send("move",{x:0,z:river.z-2});
  await until(()=>Math.abs(me(pilot).z-(river.z-2))<.06 && Math.abs(me(pilot).y)<.05,"walk back up to the shore");
  const pilotShore = me(pilot).z;

  command(pilot,"launch");
  const boatId = "boat-"+pilot.sessionId;
  const boat = () => pilot.state.boats.get(boatId);
  await until(()=>boat() && passenger.state.boats.get(boatId),"boat replicated to both clients");
  command(pilot,"board",{boatId});
  command(passenger,"board",{boatId});
  await until(()=>me(pilot).boatId===boatId && me(passenger).boatId===boatId,"two actors on the same deck");
  assert.equal(me(passenger).mounted,false);
  assert.ok(Math.abs(me(passenger).y-(village.waterLevel+.88))<.02);

  command(passenger,"input",{throttle:1,steer:0});
  await until(()=>rejected.includes("boat_action_unavailable"),"passenger cannot steer");
  // The room allows one rejection notice per 500 ms per client.
  await wait(650);
  command(passenger,"walk",{x:0,z:90});
  await until(()=>rejected.includes("boat_deck_only"),"deck walking rejects positions outside the boat");
  const previousX = me(passenger).x;
  command(passenger,"walk",{x:.85,z:.9});
  await until(()=>me(passenger).x>previousX+.5,"walking across the deck");

  command(pilot,"helm");
  await until(()=>boat().helmId===pilot.sessionId,"pilot takes helm");
  const startingX = boat().x, riderX = me(passenger).x;
  for (let i=0;i<16 && boat().x<startingX+3.1;i++) {
    command(pilot,"input",{throttle:1,steer:0});
    await wait(105);
  }
  await until(()=>boat().x>startingX+3 && me(passenger).x>riderX+3,"helm drives boat and carries passenger");
  command(pilot,"input",{throttle:0,steer:0,anchor:true});
  await until(()=>boat().anchored && Math.abs(boat().speed)<.05,"anchor stops the boat");

  // Keep this combat fixture at the shoreline instead of running its village patrol.
  game.updateMonsterAI = () => {};
  const attacker = game.state.players.get(passenger.sessionId), target = game.state.monster;
  const x = attacker.x, z = attacker.z-1.75;
  Object.assign(target,{x,y:groundAt("ritual_village",x,z),z,alive:true,hp:target.maxHp});
  const hp = target.hp, deck = {x:attacker.x,z:attacker.z};
  passenger.send("attack",{targetId:target.id});
  await until(()=>game.state.monster.hp<hp,"normal Montra attack damages a shoreline ghost from the deck")
    .catch(error=>{throw Error(error.message+" "+JSON.stringify({rejected,player:[attacker.x,attacker.y,attacker.z,attacker.targetId],target:[target.id,target.x,target.y,target.z,target.hp]}));});
  assert.equal(me(passenger).boatId,boatId);
  assert.ok(Math.hypot(attacker.x-deck.x,attacker.z-deck.z)<.4,"attack does not chase off the deck");

  command(passenger,"exit");
  await until(()=>!me(passenger).boatId && waterDepthAt(village,me(passenger).x,me(passenger).z)<=.141,"disembark to the bank")
    .catch(error=>{throw Error(error.message+" "+JSON.stringify({rejected,
      rider:[me(passenger).x,me(passenger).y,me(passenger).z],boat:[boat().x,boat().z,boat().speed]}));});
  const passengerShore = me(passenger).z;
  command(passenger,"board",{boatId});
  await until(()=>me(passenger).boatId===boatId,"board again from the bank")
    .catch(error=>{throw Error(error.message+" "+JSON.stringify({rejected,
      rider:[me(passenger).x,me(passenger).y,me(passenger).z],boat:[boat().x,boat().z,boat().speed]}));});

  await pilot.leave();
  clients.delete(pilot);
  await until(()=>!me(passenger).boatId && !passenger.state.boats.has(boatId),"owner disconnect removes ship and returns rider to shore");
  assert.ok(Math.abs(me(passenger).z-passengerShore)<.1);
  const {room:rejoined} = observe(await sdk.joinById(passenger.roomId,pilotOptions));
  await until(()=>me(rejoined) && !me(rejoined).boatId,"pilot reconnect");
  assert.ok(Math.abs(me(rejoined).z-pilotShore)<.1,`the pilot reconnects on the bank used to board (${me(rejoined).z} vs ${pilotShore})`);
  console.log("PASS village riverbed walking, submerged save/reconnect, floating deck, steering, deck attacks and disembarkation");

  const {room:marsh}=observe(await sdk.create("my_room",{...opts(),marsh:true}));
  const marshMap=getWorldMap("drowned_marsh"), marshId="boat-"+marsh.sessionId;
  await until(()=>me(marsh)?.mapId===marshMap.id,"marsh harbor");
  command(marsh,"launch");
  const marshBoat=()=>marsh.state.boats.get(marshId);
  await until(marshBoat,"marsh boat launches");
  assert.ok(waterDepthAt(marshMap,marshBoat().x,marshBoat().z)>.45);
  command(marsh,"board",{boatId:marshId});
  await until(()=>me(marsh).boatId===marshId,"board in the marsh");
  command(marsh,"helm");
  await until(()=>marshBoat().helmId===marsh.sessionId,"marsh helm");
  const marshZ=marshBoat().z;
  for(let i=0;i<12;i++){command(marsh,"input",{throttle:1,steer:0,anchor:false});await wait(105);}
  await until(()=>marshBoat().z>marshZ+2,"marsh sailing");
  assert.ok(Math.abs(me(marsh).y-(marshMap.waterLevel+.88))<.02);
  command(marsh,"input",{throttle:0,steer:0,anchor:true});
  await until(()=>marshBoat().anchored && Math.abs(marshBoat().speed)<.05,"marsh boat stops");
  command(marsh,"exit");
  await until(()=>!me(marsh).boatId && me(marsh).x>-105.6,"disembark at the marsh bank");
  console.log("PASS marsh dock launch, sailing and disembarkation");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  for (const room of clients) await room.leave();
  await server.gracefullyShutdown(false);
}
