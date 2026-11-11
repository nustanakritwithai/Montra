import assert from "node:assert/strict";
import {randomBytes,randomUUID} from "node:crypto";
import {mkdtemp} from "node:fs/promises";
import {createServer} from "node:net";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {setTimeout as wait} from "node:timers/promises";
import {Client} from "@colyseus/sdk";

assert.ok(process.env.MONTRA_GHOST_WORKER && process.env.MONTRA_POCKET_CAPTURE_SOURCE);
process.env.MONTRA_CHARACTER_DIR = await mkdtemp(join(tmpdir(),"montra-ghost-war-test-"));
process.env.MONTRA_ECONOMY_ENABLED = "1";
process.env.MONTRA_ACCOUNTS_REQUIRED = "0";
process.env.MONTRA_WORLD_EXPANSION = "1";
process.env.MONTRA_CIVILIAN_WAR_FIELDS = "1";
process.env.MONTRA_SCHEDULED_WARS = "0";
process.env.MONTRA_HUNT_EVENTS = "0";

const {defineServer,defineRoom} = await import("colyseus");
const {MyRoom} = await import("./src/rooms/MyRoom.ts");
const {characterStore} = await import("./src/rooms/CharacterStore.ts");
const {guildStore} = await import("./src/rooms/GuildStore.ts");
const {getWarDefinition} = await import("./src/rooms/TerritoryWar.ts");
const site = "ritual_village", fieldRules = getWarDefinition(site);
assert.ok(fieldRules?.isolated);

const fixtures = new Map();
class GhostWarRoom extends MyRoom {
  async onJoin(client, options) {
    await super.onJoin(client,options);
    fixtures.set(this.roomId,this);
  }
  updateMonsterAI() {}
}

const free = createServer();
await new Promise(resolve=>free.listen(0,"127.0.0.1",resolve));
const {port} = free.address();
await new Promise((resolve,reject)=>free.close(error=>error ? reject(error) : resolve()));
const server = defineServer({rooms:{my_room:defineRoom(GhostWarRoom)}});
await server.listen(port,"127.0.0.1");
const sdk = new Client("http://127.0.0.1:"+port);
const rooms = new Set();

async function until(predicate, label) {
  const end = Date.now()+6000;
  while (Date.now()<end) {
    const value = predicate();
    if (value) return value;
    await wait(35);
  }
  throw Error("Timed out: "+label);
}
async function seed(name, point) {
  const options = {worldVersion:1, warVersion:1, guestToken:"mt1_"+randomBytes(32).toString("hex")};
  const {character} = await characterStore.loadOrCreate(options.guestToken,{...point,y:0});
  const ghost = {instanceId:randomUUID(),name:"ผี"+name,level:7};
  await characterStore.save({...character,...point,y:0,mapId:site,level:12,hp:416,ghostPot:ghost});
  return {options,ghost};
}
async function connect(seed, roomId, warTicket) {
  const options = {...seed.options,warTicket};
  const room = roomId ? await sdk.joinById(roomId,options) : await sdk.create("my_room",options);
  rooms.add(room);
  const events = [];
  room.onMessage("*",(type,data)=>events.push({type,data}));
  await until(()=>room.state?.players?.get(room.sessionId)?.persistent,"character joined");
  return {room,seed,events,id:room.sessionId};
}
function event(client, type, condition=()=>true, start=0) {
  return until(()=>client.events.slice(start).find(entry=>entry.type===type && condition(entry.data))?.data,type);
}
function send(client, type, data, response, condition) {
  const start = client.events.length;
  client.room.send(type,data);
  return event(client,response,condition,start);
}
async function transfer(client, action) {
  const ticket = await send(client,action,{},"territory_transfer");
  await client.room.leave();
  rooms.delete(client.room);
  return connect(client.seed,ticket.roomId,ticket.ticket);
}
const pot = (client,action,args,status) => send(client,"ghost_pot",{action,...args},"ghost_pot_state",state=>state.status===status);
const reject = (client,type,payload,reason) => send(client,type,payload,"command_rejected",state=>state.reason===reason);

try {
  const aSeed=await seed("บุก",fieldRules.entry);
  const bSeed=await seed("รับ",{x:0,z:14});
  const allySeed=await seed("ร่วม",{x:0,z:14});
  const worldA=await connect(aSeed);
  const worldB=await connect(bSeed,worldA.room.roomId);
  const worldAlly=await connect(allySeed,worldA.room.roomId);
  await send(worldA,"guild_create",{name:"Ghost Attackers"},"guild_state",state=>state.name==="Ghost Attackers");
  await send(worldB,"guild_create",{name:"Ghost Defenders"},"guild_state",state=>state.name==="Ghost Defenders");
  worldA.room.send("guild_invite",{targetId:worldAlly.id});
  const invitation=await event(worldAlly,"guild_invitation");
  await send(worldAlly,"guild_accept",{inviteId:invitation.inviteId},"guild_state",state=>state.name==="Ghost Attackers");
  const a=await transfer(worldA,"territory_start");
  const b=await transfer(worldB,"territory_join");
  const ally=await transfer(worldAlly,"territory_join");
  assert.equal(a.room.roomId,b.room.roomId);
  assert.equal(a.room.roomId,ally.room.roomId);
  const fixture=fixtures.get(a.room.roomId);
  await event(a,"territory_state",state=>state.local?.phase==="battle" && state.local.inField);
  const state=await pot(a,"read",{},"ready");
  assert.deepEqual(state.pool.collection,[aSeed.ghost]);
  assert.equal(state.captureAvailable,false);
  assert.equal(state.combatAvailable,true);
  await reject(a,"ghost_pot",{action:"capture",targetId:"possessed-1"},"ghost_capture_unavailable");
  const called=await pot(a,"summon",{},"summoned");
  assert.equal(called.activeInstanceId,aSeed.ghost.instanceId);
  const owner=fixture.state.players.get(a.id), rival=fixture.state.players.get(b.id);
  const friend=fixture.state.players.get(ally.id), guardian=fixture.state.summons.get(a.id);
  const order=(action,targetId) => ({action,combatId:called.combatId,targetId,
    ...(action==="skill" && {skillId:"SK_NORMAL_01"})});

  const base=fieldRules.isolated.attack;
  Object.assign(owner,{x:base.x+4.5,y:0,z:base.z});
  Object.assign(guardian,{x:base.x+4.5,y:0,z:base.z});
  Object.assign(rival,{x:base.x+3,y:0,z:base.z});
  await wait(550);
  await reject(a,"ghost_pot",order("skill",b.id),"ghost_combat_target");
  await reject(b,"attack",{targetId:guardian.combatTargetId},"target_unavailable");

  Object.assign(owner,{x:0,y:0,z:14});
  Object.assign(guardian,{x:0,y:0,z:14});
  Object.assign(rival,{x:0,y:0,z:15});
  Object.assign(friend,{x:.5,y:0,z:15});
  await wait(550);
  await reject(a,"ghost_pot",order("attack",ally.id),"ghost_combat_target");
  await reject(ally,"attack",{targetId:guardian.combatTargetId},"target_unavailable");
  await wait(550);
  const skill=await send(a,"ghost_pot",order("skill",b.id),"ghost_combat_state",result=>result.status==="skill");
  assert.equal(skill.targetId,b.id);
  assert.ok(skill.damage>0);
  await send(a,"ghost_pot",order("attack",b.id),"ghost_combat_state",result=>result.status==="ordered");
  const hit=await event(a,"ghost_combat_state",result=>result.status==="hit" && result.targetId===b.id);
  assert.ok(hit.damage>0);
  const incoming=await send(b,"attack",{targetId:guardian.combatTargetId},"ghost_damaged",result=>result.ownerId===a.id);
  assert.ok(incoming.hp>0 && incoming.hp<incoming.maxHp);

  // Settle the actual test battle through the territory engine instead of waiting out its full duration.
  const war=guildStore().war, deadline=war.inspect(site,Date.now()).phaseEndsAt;
  assert.ok(deadline);
  war.inspect(site,deadline+1);
  const ended=await event(a,"ghost_pot_state",result=>result.status==="war_ended");
  assert.equal(ended.combatAvailable,false);
  assert.equal(ended.activeInstanceId,null);
  await until(()=>!a.room.state.summons.has(a.id),"battle end despawns ghost");
  await reject(a,"ghost_pot",order("attack",b.id),"ghost_combat_war");

  await a.room.leave();
  rooms.delete(a.room);
  const home=await connect(aSeed);
  const returned=await pot(home,"read",{},"ready");
  assert.deepEqual(returned.pool,state.pool);
  assert.equal(returned.activeInstanceId,null);
  console.log("PASS real war transfer, bases, same-side guards, opposing skill/basic strikes, ghost damage, battle end and preserved pool");
} catch(error) {
  console.error(error);
  process.exitCode=1;
} finally {
  await Promise.allSettled([...rooms].map(room=>room.leave()));
  await server.gracefullyShutdown(false);
}
