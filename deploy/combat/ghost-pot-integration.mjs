import assert from "node:assert/strict";
import {randomBytes,randomUUID} from "node:crypto";
import {mkdtemp} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createServer} from "node:net";
import {setTimeout as wait} from "node:timers/promises";
import {Client} from "@colyseus/sdk";

assert.ok(process.env.MONTRA_GHOST_WORKER && process.env.MONTRA_POCKET_CAPTURE_SOURCE);
process.env.MONTRA_CHARACTER_DIR = await mkdtemp(join(tmpdir(),"montra-ghost-pool-test-"));
process.env.MONTRA_ECONOMY_ENABLED = "1";
process.env.MONTRA_ACCOUNTS_REQUIRED = "0";
process.env.MONTRA_WORLD_EXPANSION = "1";

const {defineServer,defineRoom} = await import("colyseus");
const {MyRoom} = await import("./src/rooms/MyRoom.ts");
const {characterStore} = await import("./src/rooms/CharacterStore.ts");
const {isGhostPool,GHOST_POOL_CAPACITY} = await import("./src/rooms/GhostPool.ts");

let fixture;
class GhostTestRoom extends MyRoom {
  async onJoin(client, options) {
    await super.onJoin(client,options);
    fixture = this;
  }
  updateMonsterAI() {}
  prepareTarget() {
    const ghost = this.state.monster;
    Object.assign(ghost,{alive:true,hp:1,x:0,y:0,z:15});
    for (const player of this.state.players.values()) Object.assign(player,{x:0,y:0,z:14});
    return ghost.id;
  }
}

const free = createServer();
await new Promise(resolve=>free.listen(0,"127.0.0.1",resolve));
const {port} = free.address();
await new Promise((resolve,reject)=>free.close(error=>error ? reject(error) : resolve()));
const server = defineServer({rooms:{my_room:defineRoom(GhostTestRoom)}});
await server.listen(port,"127.0.0.1");

async function until(predicate, name, timeout = 5000) {
  const end = Date.now()+timeout;
  while(Date.now()<end) {
    const result=predicate();
    if(result) return result;
    await wait(35);
  }
  throw Error("Timed out: "+name);
}
const options = () => ({worldVersion:1,guestToken:"mt1_"+randomBytes(32).toString("hex")});
const client = () => new Client("http://127.0.0.1:"+port);
const ownerOptions = options(), rooms = new Set();
const legacy = {instanceId:randomUUID(),name:"ผีในหม้อเดิม",level:7};
function observe(room) {
  const info = {room,states:[],rejections:[]};
  rooms.add(room);
  room.onMessage("ghost_pot_state",value=>info.states.push(value));
  room.onMessage("command_rejected",value=>info.rejections.push(value.reason));
  room.onMessage("*",()=>{});
  return info;
}
const last = info=>info.states.at(-1);
const send = (info,action,args={})=>info.room.send("ghost_pot",{action,...args});
async function command(info,action,args={},status) {
  const count=info.states.length;
  send(info,action,args);
  const response=await until(()=>info.states.length>count && last(info),action+" reply");
  if(status) assert.equal(response.status,status,JSON.stringify(info.rejections));
  return response;
}

try {
  const spawn={x:0,y:0,z:15};
  const {character} = await characterStore.loadOrCreate(ownerOptions.guestToken,spawn);
  await characterStore.save({...character,ghostPot:legacy});

  const a = observe(await client().create("my_room",ownerOptions));
  const b = observe(await client().joinById(a.room.roomId,options()));
  await until(()=>a.room.state?.ghostPotAvailable && a.room.state.players?.size===2 && b.room.state?.players?.size===2,"joined");
  const migrated=await command(a,"read",{},"ready");
  assert.deepEqual(migrated.pool.collection,[legacy]);
  assert.deepEqual(migrated.pool.slots,[legacy.instanceId,null,null]);
  const other=await command(b,"read",{},"ready");
  assert.deepEqual(other.pool.collection,[]);
  assert.equal((await command(b,"assign",{slot:0,instanceId:legacy.instanceId,revision:0})).status,"not_owned");

  let winner;
  for(let attempt=0;attempt<5 && !winner;attempt++){
    const targetId=fixture.prepareTarget();
    const counts=[a.states.length,b.states.length];
    send(a,"capture",{targetId});send(b,"capture",{targetId});
    await wait(500);
    const results=[a,b].map((info,i)=>info.states.slice(counts[i]).filter(state=>state.status==="captured"));
    assert.ok(results[0].length+results[1].length<=1,"same wild ghost is captured by at most one player");
    winner=results[0].length ? a : results[1].length ? b : null;
    await wait(3100);
  }
  assert.ok(winner,"one player captured the contested ghost");
  assert.equal(a.room.state.monster.hp,0);
  assert.equal(b.room.state.monster.hp,0);
  for(let attempt=0;attempt<9 && last(a).pool.collection.length<4;attempt++){
    const reply=await command(a,"capture",{targetId:fixture.prepareTarget()});
    assert.ok(["captured","escaped"].includes(reply.status),reply.status);
    await wait(3300);
  }
  const pool=last(a).pool;
  assert.equal(pool.collection.length,4);
  assert.ok(isGhostPool(pool));
  assert.equal(new Set(pool.collection.map(ghost=>ghost.instanceId)).size,4);
  assert.ok(pool.slots.every(Boolean));
  const reserved=pool.collection.find(ghost=>!pool.slots.includes(ghost.instanceId));

  const placed=await command(a,"assign",{slot:1,instanceId:reserved.instanceId,revision:pool.revision},"placed");
  assert.equal(placed.pool.slots[1],reserved.instanceId);
  assert.ok(placed.pool.collection.some(ghost=>ghost.instanceId===pool.slots[1]));
  assert.deepEqual((await command(a,"reserve",{instanceId:legacy.instanceId,revision:pool.revision},"stale")).pool,placed.pool);
  await wait(700);
  const summoned=await command(a,"summon",{},"summoned");
  assert.equal(summoned.activeInstanceId,legacy.instanceId);
  await until(()=>b.room.state.summons.get(a.room.sessionId)?.kind==="captured_ghost","other player sees one ghost");
  assert.equal(b.room.state.summons.size,1);
  await wait(700);
  const selected=await command(a,"select",{slot:1,revision:summoned.pool.revision},"selected");
  assert.equal(selected.activeInstanceId,legacy.instanceId,"selection is separate from switching");
  await wait(700);
  const switched=await command(a,"switch",{},"switched");
  assert.equal(switched.activeInstanceId,reserved.instanceId);
  assert.equal(b.room.state.summons.size,1);
  await wait(700);
  await command(a,"reserve",{instanceId:reserved.instanceId,revision:switched.pool.revision},"active_locked");
  await wait(700);
  await command(a,"recall",{},"recalled");
  await until(()=>!b.room.state.summons.has(a.room.sessionId),"recall replicated");
  await wait(700);
  const stored=await command(a,"reserve",{instanceId:reserved.instanceId,revision:switched.pool.revision},"placed");
  assert.equal(stored.pool.slots[1],null);

  await a.room.leave();
  rooms.delete(a.room);
  const restored = observe(await client().joinById(b.room.roomId,ownerOptions));
  await until(()=>restored.room.state?.ghostPotAvailable,"rejoined");
  const durable=await command(restored,"read",{},"ready");
  assert.deepEqual(durable.pool,stored.pool);
  assert.equal(durable.activeInstanceId,null);

  const fullOptions=options();
  const fullCharacter=(await characterStore.loadOrCreate(fullOptions.guestToken,spawn)).character;
  const fullCollection=Array.from({length:GHOST_POOL_CAPACITY},()=>({instanceId:randomUUID(),name:"ผีสำรอง",level:1}));
  await characterStore.save({...fullCharacter,ghostPool:{collection:fullCollection,slots:[null,null,null],selectedSlot:0,revision:0}});
  const full=observe(await client().joinById(b.room.roomId,fullOptions));
  await until(()=>full.room.state?.ghostPotAvailable && full.room.state?.players?.has(full.room.sessionId),"full pool joined");
  const fullTarget=fixture.prepareTarget();
  const blocked=await command(full,"capture",{targetId:fullTarget},"pool_full");
  assert.equal(blocked.pool.collection.length,GHOST_POOL_CAPACITY);
  assert.equal(fixture.state.monster.alive,true);

  delete process.env.MONTRA_GHOST_WORKER;
  const disabled=observe(await client().create("my_room",options()));
  await until(()=>disabled.room.state?.players?.size===1,"disabled room state");
  assert.equal(disabled.room.state.ghostPotAvailable,false);
  send(disabled,"read");
  await until(()=>disabled.rejections.includes("ghost_pot_unavailable"),"worker disabled");
  console.log("PASS ghost pool: legacy save, capture race, reserve, slots, original C# summon/switch/recall, reconnect and full pool");
} catch(error) {
  console.error(error);
  process.exitCode=1;
} finally {
  await Promise.allSettled([...rooms].map(room=>room.leave()));
  await server.gracefullyShutdown(false);
}
