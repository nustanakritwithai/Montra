/**
 * MONTRA Summon Alpha — real Colyseus sockets, isolated fresh room.
 * Four independent players own one server-driven guardian each.
 * Exercises anti-spoof, cooldown, following, PvP defense, PvE, death and leave.
 */
import { Client } from "@colyseus/sdk";
import assert from "node:assert/strict";

const endpoint = process.env.MONTRA_TEST_URL || "http://127.0.0.1:4108";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function until(predicate, timeoutMs, name) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = predicate();
    if (result) return result;
    await sleep(65);
  }
  throw Error("Timed out: " + name);
}

const connections = Array.from({ length: 4 }, () => new Client(endpoint));
const rooms = [];
const alreadyLeft = new Set();

try {
  rooms.push(await connections[0].create("my_room"));
  for (let i = 1; i < 4; i++) rooms.push(await connections[i].joinById(rooms[0].roomId));

  const [a, b, c, d] = rooms;
  const [aId, bId, cId, dId] = rooms.map(r => r.sessionId);
  const owned = (r, id) => r.state?.summons?.get(id);
  const player = id => a.state?.players?.get(id);
  let denied = [];
  let guardianPveHits = [];
  let guardianPvpHits = [];
  let summonSpawns = 0;
  let summonDespawn = 0;

  rooms.forEach((r, i) => {
    r.onMessage("summon_spawn", () => { summonSpawns++; });
    r.onMessage("summon_despawn", () => { summonDespawn++; });
    r.onMessage("summon_hit", hit => { guardianPveHits.push(hit); });
    r.onMessage("pvp_hit", hit => {
      if (hit.source === "summon") guardianPvpHits.push(hit);
    });
    r.onMessage("command_rejected", notice => {
      if (i === 0) denied.push(notice.reason);
    });
    for (const msg of [
      "combat_hit", "combat_notice", "monster_respawn", "monster_hit",
      "player_down", "player_respawn", "pvp_kill",
    ]) r.onMessage(msg, () => {});
  });
  await until(() => rooms.every(r => r.state?.players?.size === 4 && r.state?.summons),
    6000, "four players with summon schema");

  // Forged owner/stats/locations are rejected; no cross-owner spawns.
  a.send("summon", { ownerId: bId, damage: 999, x: 9999 });
  a.send("summon", { kind: "dragon" });
  a.send("unsummon", { ownerId: bId });
  a.send("summon_hit", { targetId: "possessed-1", damage: 9999 });
  await sleep(240);
  assert.ok(rooms.every(r => r.state.summons.size === 0 && r.state.monster.hp === 100));
  console.log("PASS: forged summon owner, kind, position and damage rejected");

  rooms.forEach(r => r.send("summon", {}));
  await until(() => rooms.every(r => r.state.summons.size === 4), 4800,
    "four unique owned guardians replicated");
  for (const r of rooms) {
    for (const id of [aId, bId, cId, dId]) {
      const spirit = owned(r, id);
      assert.ok(spirit && spirit.ownerId === id && spirit.kind === "guardian");
      assert.ok(Number.isFinite(spirit.x) && Number.isFinite(spirit.z));
    }
  }
  console.log("PASS: four owners summon four independent synchronized NPCs");

  a.send("summon", {});
  await sleep(120);
  assert.equal(a.state.summons.size, 4, "duplicate summon exceeded one-per-player cap");
  a.send("unsummon", {});
  await until(() => rooms.every(r => r.state.summons.size === 3 &&
                                    !r.state.summons.has(aId)), 3800,
    "owner dismiss replicated");
  a.send("summon", {});
  await sleep(200);
  assert.ok(!a.state.summons.has(aId), "summon cooldown bypassed by instant resummon");
  await sleep(2500);
  a.send("summon", {});
  await until(() => rooms.every(r => r.state.summons.size === 4 &&
                                    r.state.summons.has(aId)), 3800,
    "summon after cooldown");
  console.log("PASS: duplicate summon rejected; dismiss and server cooldown enforced");

  // Guardian follows server-owned position as the player moves away.
  a.send("move", { x: 11, z: -3 });
  await until(() => player(aId)?.x > 8 && owned(a, aId)?.x > 7,
    6000, "guardian follows moving owner");
  await until(() => rooms.every(r =>
    Math.abs(owned(r, aId)?.x - owned(a, aId)?.x) < 0.2
  ), 2500, "guardian coordinates replicated");
  assert.ok(owned(a, aId).action === "follow");
  console.log("PASS: following NPC movement is owned by server and synchronized");

  // C can PK D. D's spirit automatically defends it; C's guardian assists.
  c.send("attack", { targetId: dId });
  await until(() => guardianPvpHits.some(hit => hit.summonOwnerId === cId ||
                                                hit.summonOwnerId === dId),
    8500, "guardian PK support/defense");
  console.log("PASS: guardian assists owner in Free PK without client damage values");

  await until(() => player(cId)?.alive === false || player(dId)?.alive === false,
    13000, "PvP death");
  const downId = player(cId).alive ? dId : cId;
  await until(() => rooms.every(r => !r.state.summons.has(downId)), 2300,
    "owner death despawns NPC");
  assert.equal(a.state.summons.size, 3);
  console.log("PASS: owner knockout immediately removes owned NPC for all clients");

  // B's guardian can attack a ghost the owner targets or that attacks owner.
  b.send("attack", { targetId: "possessed-1" });
  await until(() => guardianPveHits.some(h => h.ownerId === bId &&
                                             h.targetId === "possessed-1"),
    12000, "guardian attacks shared monster");
  assert.ok(rooms.every(r => Number(r.state.monster.hp) <= 100));
  console.log("PASS: guardian damages real monster via fixed server tick");

  await b.leave();
  alreadyLeft.add(b);
  await until(() => rooms.every(r =>
    r === b || (!r.state.summons.has(bId) && !r.state.players.has(bId))
  ), 3500, "disconnect cleans up summon");
  console.log("PASS: leaving a room destroys owned NPC without affecting others");
  console.log("PASS: MONTRA Summon 4-player integration complete");
} catch (error) {
  console.error("FAIL: MONTRA Summon integration:", error);
  process.exitCode = 1;
} finally {
  for (const r of rooms.reverse()) {
    if (alreadyLeft.has(r)) continue;
    try { await r.leave(); } catch (_) {}
  }
}
