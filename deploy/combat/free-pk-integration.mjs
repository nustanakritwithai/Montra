/**
 * MONTRA Free PK Alpha test: 4 real clients share an isolated Colyseus room.
 * Tests direct attack without consent, spoof prevention, shared HP, cooldown,
 * moving-target pursuit, cancellation, kill/respawn and disconnect cleanup.
 */
import assert from "node:assert/strict";
import { Client } from "@colyseus/sdk";

const url = process.env.MONTRA_TEST_URL || "http://127.0.0.1:4108";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, timeout, label) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = check();
    if (value) return value;
    await sleep(70);
  }
  throw new Error("Timeout: " + label);
}

const clients = Array.from({ length: 4 }, () => new Client(url));
const rooms = [];
let leftD = false;
let disconnectedRoom = null;
try {
  const a = await clients[0].create("my_room");
  rooms.push(a);
  for (let i = 1; i < clients.length; i++) {
    rooms.push(await clients[i].joinById(a.roomId));
  }
  const [b, c, d] = rooms.slice(1);
  const player = id => a.state?.players?.get(id);
  const ids = rooms.map(room => room.sessionId);
  const [aId, bId, cId, dId] = ids;
  let pvpEvents = 0;
  let killEvents = [];
  let downEvents = 0;
  let rejectEvents = [];
  rooms.forEach((r, index) => {
    r.onMessage("pvp_hit", info => {
      assert.equal(info.damage, 12, "only server may choose PK damage");
      if (info.targetId === bId || info.targetId === dId) pvpEvents++;
    });
    r.onMessage("pvp_kill", info => killEvents.push(info));
    r.onMessage("player_down", info => { if (info.source === "pk") downEvents++; });
    r.onMessage("command_rejected", info => {
      if (index === 0) rejectEvents.push(info.reason);
    });
    for (const topic of [
      "combat_hit", "combat_notice", "monster_hit", "monster_respawn", "player_respawn",
    ]) r.onMessage(topic, () => {});
  });

  await until(() => rooms.every(r => r.state?.players?.size === 4), 6000, "four joined");
  assert.equal(new Set(rooms.map(r => r.roomId)).size, 1);
  for (const id of ids) {
    assert.equal(player(id).hp, 100);
    assert.equal(player(id).pkKills, 0);
    assert.equal(player(id).pkDeaths, 0);
  }

  // Free PK: self-target, nonexistent session, and injected damage are rejected.
  a.send("attack", { targetId: aId });
  a.send("attack", { targetId: "NOT_A_PLAYER_12345" });
  a.send("attack", { targetId: bId, damage: 1000000 });
  a.send("attack", { targetId: bId, hp: 0 });
  await sleep(260);
  assert.equal(player(aId).hp, 100);
  assert.equal(player(bId).hp, 100);
  assert.equal(player(dId).hp, 100);
  console.log("PASS: self-attack, unknown player and forged HP/damage rejected");

  // Two unrelated pairs fight without invites in the same room.
  a.send("attack", { targetId: bId });
  c.send("attack", { targetId: dId });
  await until(() => player(bId).hp === 88 && player(dId).hp === 88 &&
    rooms.every(r => r.state.players.get(bId)?.hp === 88 &&
                     r.state.players.get(dId)?.hp === 88),
    4500, "first PK hits shared by four users");
  await until(() => pvpEvents >= 8, 2500, "PK events broadcast to all four users");
  console.log("PASS: two PK fights start immediately; four clients see shared HP 100 -> 88");

  await sleep(300);
  assert.equal(player(bId).hp, 88);
  assert.equal(player(dId).hp, 88);
  console.log("PASS: repeated server tick does not bypass PK attack cooldown");

  // Tap the ground cancels C's repeated attacks on D, even while A fights B.
  c.send("move", { x: 4, z: 1 });
  await sleep(250);
  const dHp = player(dId).hp;
  await sleep(1320);
  assert.equal(player(dId).hp, dHp);
  console.log("PASS: independent PK attack is cancelled by manual movement");

  // Server calculates knockout, awards the kill and schedules victim respawn.
  await until(() => player(bId).hp === 0 && player(bId).alive === false &&
    rooms.every(r => r.state.players.get(bId)?.hp === 0),
    12000, "PK defeat and shared zero HP");
  assert.equal(player(aId).pkKills, 1);
  assert.equal(player(bId).pkDeaths, 1);
  await until(() => killEvents.some(e => e.winnerId === aId && e.loserId === bId)
    && downEvents >= 4, 2500, "kill feed and death broadcasts");
  console.log("PASS: single PK kill, winner credit and loser death synchronized");
  await until(() => rooms.every(r =>
    r.state?.players?.get(bId)?.alive === true &&
    r.state?.players?.get(bId)?.hp === 100),
    7000, "server-driven player respawn");
  console.log("PASS: defeated player respawns with restored HP");

  // Reposition victim away from attacker, and verify no remote PK hit.
  b.send("move", { x: -14, z: 0 });
  await until(() => player(bId).x < -13.5, 9000, "victim walking away");
  const before = player(bId).hp;
  a.send("attack", { targetId: bId });
  await sleep(180);
  assert.equal(player(bId).hp, before, "PK may not damage beyond server range");
  await until(() => player(bId).hp < before, 6500,
    "server auto-approach moving player and hit in range");
  console.log("PASS: far-away PK requires a speed-limited approach before damage");

  a.send("move", { x: 0, z: 0 });
  await sleep(250);
  const hpAfterCancel = player(bId).hp;
  await sleep(1300);
  assert.equal(player(bId).hp, hpAfterCancel);
  console.log("PASS: PK auto-attack cancels when attacker taps ground");

  // A disconnected victim leaves no dangling target on the server.
  c.send("attack", { targetId: dId });
  await sleep(150);
  await d.leave();
  leftD = true;
  disconnectedRoom = d;
  await until(() => player(cId)?.targetId === "" && !player(dId),
    3500, "dead session target cleanup");
  console.log("PASS: opponent disconnect cleans up PK target and movement");

  console.log("PASS: MONTRA Free PK 4-player integration complete");
} catch(error) {
  console.error("FAIL: MONTRA Free PK integration:", error);
  process.exitCode = 1;
} finally {
  for(const room of rooms.reverse()) {
    // The disconnected client already left during the test. Calling
    // room.leave() twice can leave a pending promise/socket on Colyseus 0.18.
    if (room === disconnectedRoom && leftD) continue;
    try { await room.leave(); } catch (_) {}
  }
}
