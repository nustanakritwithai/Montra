import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {mkdtemp} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createServer} from "node:net";
import {setTimeout as wait} from "node:timers/promises";
import {Client} from "@colyseus/sdk";

assert.ok(process.env.MONTRA_GHOST_WORKER && process.env.MONTRA_POCKET_CAPTURE_SOURCE,
  "Build the legacy worker and configure its DLL and the original PocketMonster checkout.");
process.env.MONTRA_CHARACTER_DIR = await mkdtemp(join(tmpdir(), "montra-ghost-pot-test-"));
process.env.MONTRA_ECONOMY_ENABLED = "1";
process.env.MONTRA_ACCOUNTS_REQUIRED = "0";
process.env.MONTRA_WORLD_EXPANSION ??= "1";

const {defineServer, defineRoom} = await import("colyseus");
const {MyRoom} = await import("./src/rooms/MyRoom.ts");

class GhostTestRoom extends MyRoom {
  async onJoin(client, options) {
    await super.onJoin(client, options);
    const player = this.state.players.get(client.sessionId), ghost = this.state.monster;
    Object.assign(player, {x: ghost.x, y: ghost.y, z: ghost.z - 1});
    if (ghost.alive) ghost.hp = 1;
  }
}

const free = createServer();
await new Promise(resolve => free.listen(0, "127.0.0.1", resolve));
const {port} = free.address();
await new Promise((resolve, reject) => free.close(error => error ? reject(error) : resolve()));
const server = defineServer({rooms: {my_room: defineRoom(GhostTestRoom)}});
await server.listen(port, "127.0.0.1");

async function until(predicate, name, timeout = 5000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const result = predicate();
    if (result) return result;
    await wait(35);
  }
  throw new Error("Timed out: " + name);
}

const options = () => ({worldVersion: 1, guestToken: "mt1_" + randomBytes(32).toString("hex")});
const client = () => new Client("http://127.0.0.1:" + port);
const ownerOptions = options();
const rooms = new Set();
const states = new Map();
const rejections = new Map();
function observe(room) {
  rooms.add(room);
  states.set(room, []);
  rejections.set(room, []);
  room.onMessage("ghost_pot_state", value => states.get(room).push(value));
  room.onMessage("command_rejected", value => rejections.get(room).push(value.reason));
  for (const type of ["guild_state", "guild_recruitment", "monster_hit", "summon_spawn", "summon_despawn", "monster_respawn"])
    room.onMessage(type, () => {});
  return room;
}
function last(room) {
  return states.get(room).at(-1);
}

try {
  const a = observe(await client().create("my_room", ownerOptions));
  const b = observe(await client().joinById(a.roomId, options()));
  await until(() => a.state?.ghostPotAvailable && a.state.players?.size === 2 && b.state?.players?.size === 2, "two players in the enabled room");
  a.send("ghost_pot", {action: "read"});
  assert.deepEqual(await until(() => last(a), "empty pot"), {ghost: null, active: false, status: "ready"});
  b.send("ghost_pot", {action: "summon"});
  await until(() => rejections.get(b).includes("ghost_pot_empty"), "empty pot cannot summon");

  const targetId = a.state.monster.id;
  let captured;
  for (let attempt = 0; attempt < 7 && !captured; attempt++) {
    const count = states.get(a).length;
    a.send("ghost_pot", {action: "capture", targetId});
    const outcome = await until(() => states.get(a).length > count && last(a), "capture response");
    if (outcome.status === "captured") captured = outcome.ghost;
    else {
      assert.equal(outcome.status, "escaped");
      assert.equal(outcome.ghost, null);
      await wait(3500);
    }
  }
  assert.ok(captured?.instanceId, "the original 95%-chance fixture should capture");
  await until(() => !a.state.monster.alive && !b.state.monster.alive, "captured ghost removed for both players");
  assert.equal(a.state.monster.hp, 0, "captured ghost has zero HP for its captor");
  assert.equal(b.state.monster.hp, 0, "captured ghost has zero HP for other players");
  a.send("ghost_pot", {action: "capture", targetId});
  await until(() => rejections.get(a).includes("ghost_pot_occupied"), "repeat capture blocked");

  a.send("ghost_pot", {action: "summon"});
  await until(() => last(a)?.status === "summoned", "legacy worker summon");
  await until(() => b.state.summons.get(a.sessionId)?.kind === "captured_ghost", "replication to another player");
  assert.equal(b.state.summons.size, 1);
  a.send("ghost_pot", {action: "recall"});
  await until(() => last(a)?.status === "recalled" && !b.state.summons.has(a.sessionId), "legacy worker recall");

  await a.leave();
  rooms.delete(a);
  const restored = observe(await client().joinById(b.roomId, ownerOptions));
  await until(() => restored.state?.ghostPotAvailable, "restored room state");
  restored.send("ghost_pot", {action: "read"});
  assert.deepEqual(await until(() => last(restored), "durable pot after reconnect"),
    {ghost: captured, active: false, status: "ready"});
  delete process.env.MONTRA_GHOST_WORKER;
  const disabled = observe(await client().create("my_room", options()));
  await until(() => disabled.state?.players?.size === 1, "disabled room state");
  assert.equal(disabled.state.ghostPotAvailable, false);
  disabled.send("ghost_pot", {action: "read"});
  await until(() => rejections.get(disabled).includes("ghost_pot_unavailable"), "feature is off without the worker");
  console.log("PASS: fresh Montra character, original capture formula, durable pot, duplicate guard, legacy summon/recall, two-client replication, reconnect and feature off");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await Promise.allSettled([...rooms].map(room => room.leave()));
  await server.gracefullyShutdown(false);
}
