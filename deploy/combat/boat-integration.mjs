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
    const shore = BOAT_SHORES.ritual_village;
    Object.assign(player,{...shore,y:groundAt("ritual_village",shore.x,shore.z)});
  }
}

const probe = createServer();
await new Promise(resolve=>probe.listen(0,"127.0.0.1",resolve));
const {port} = probe.address();
await new Promise((resolve,reject)=>probe.close(error=>error ? reject(error) : resolve()));
const server = defineServer({rooms:{my_room:defineRoom(BoatTestRoom)}});
await server.listen(port,"127.0.0.1");
const sdk = new Client("http://127.0.0.1:"+port), clients = new Set();
const opts = () => ({worldVersion:1,guestToken:"mt1_"+randomBytes(32).toString("hex")});
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
  const {room:pilot} = observe(await sdk.create("my_room",pilotOptions));
  const {room:passenger,rejected} = observe(await sdk.joinById(pilot.roomId,opts()));
  await until(()=>pilot.state?.boatsAvailable && me(pilot) && me(passenger),"both actors ashore");

  command(pilot,"launch");
  const boatId = "boat-"+pilot.sessionId;
  const boat = () => pilot.state.boats.get(boatId);
  await until(()=>boat() && passenger.state.boats.get(boatId),"boat replicated to both clients");
  command(pilot,"board",{boatId});
  command(passenger,"board",{boatId});
  await until(()=>me(pilot).boatId===boatId && me(passenger).boatId===boatId,"two actors on the same deck");
  assert.equal(me(passenger).mounted,false);
  assert.ok(me(passenger).y>.8);

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
  for (let i=0;i<16;i++) {
    command(pilot,"input",{throttle:1,steer:0});
    await wait(105);
  }
  await until(()=>boat().x>startingX+3 && me(passenger).x>riderX+3,"helm drives boat and carries passenger");
  command(pilot,"input",{throttle:0,steer:0,anchor:true});
  await until(()=>boat().anchored && Math.abs(boat().speed)<=1,"anchor stops the boat");

  // Keep this combat fixture at the shoreline instead of running its village patrol.
  game.updateMonsterAI = () => {};
  const attacker = game.state.players.get(passenger.sessionId), target = game.state.monster;
  const x = attacker.x, z = 47.9;
  Object.assign(target,{x,y:groundAt("ritual_village",x,z),z,alive:true,hp:target.maxHp});
  const hp = target.hp, deck = {x:attacker.x,z:attacker.z};
  passenger.send("attack",{targetId:target.id});
  await until(()=>game.state.monster.hp<hp,"normal Montra attack damages a shoreline ghost from the deck")
    .catch(error=>{throw Error(error.message+" "+JSON.stringify({rejected,player:[attacker.x,attacker.y,attacker.z,attacker.targetId],target:[target.id,target.x,target.y,target.z,target.hp]}));});
  assert.equal(me(passenger).boatId,boatId);
  assert.ok(Math.hypot(attacker.x-deck.x,attacker.z-deck.z)<.4,"attack does not chase off the deck");

  await pilot.leave();
  clients.delete(pilot);
  await until(()=>!me(passenger).boatId && !passenger.state.boats.has(boatId),"owner disconnect removes ship and returns rider to shore");
  assert.ok(Math.abs(me(passenger).z-BOAT_SHORES.ritual_village.z)<1);
  const {room:rejoined} = observe(await sdk.joinById(passenger.roomId,pilotOptions));
  await until(()=>me(rejoined) && !me(rejoined).boatId,"pilot reconnect");
  assert.ok(Math.abs(me(rejoined).z-BOAT_SHORES.ritual_village.z)<1);
  console.log("PASS legacy boat launch, replication, helm, deck walk and carry, deck attack, disconnect and reconnect");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  for (const room of clients) await room.leave();
  await server.gracefullyShutdown(false);
}
