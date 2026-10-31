/**
 * MONTRA PvP Duel Alpha — four real Colyseus clients in an isolated room.
 * Tests consent, target validation, server HP and cooldown, cancellation,
 * knockout, respawn and disconnect cleanup. No real player room is touched.
 */
import assert from "node:assert/strict";
import { Client } from "@colyseus/sdk";

const endpoint = process.env.MONTRA_TEST_URL || "http://127.0.0.1:4108";
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, timeout, label) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = check();
    if (result) return result;
    await sleep(70);
  }
  throw Error("Timeout waiting for: " + label);
}

const clients = Array.from({ length: 4 }, () => new Client(endpoint));
const rooms = [];
try {
  rooms.push(await clients[0].create("my_room"));
  for (let i = 1; i < 4; i++) {
    rooms.push(await clients[i].joinById(rooms[0].roomId));
  }
  const [a, b, c, d] = rooms;
  const stateOf = (r, id) => r.state?.players?.get(id);
  const aState = () => stateOf(a, a.sessionId);
  const bState = () => stateOf(a, b.sessionId);
  const cState = () => stateOf(a, c.sessionId);
  const dState = () => stateOf(a, d.sessionId);
  const ids = rooms.map(r => r.sessionId);
  let pvpHits = 0;
  let cSawHits = 0;
  let rejects = [];
  let ended = [];
  for (const [i, room] of rooms.entries()) {
    room.onMessage("pvp_hit", hit => {
      pvpHits++;
      if (i === 2) cSawHits++;
      assert.equal(hit.damage, 12, "damage must be server-defined");
    });
    room.onMessage("command_rejected", data => {
      if (i === 0) rejects.push(data.reason);
    });
    room.onMessage("duel_end", data => ended.push(data));
    for (const type of [
      "combat_notice", "combat_hit", "monster_hit", "duel_invite",
      "duel_invite_sent", "duel_started", "monster_respawn",
      "player_down", "player_respawn",
    ]) room.onMessage(type, () => {});
  }

  await until(() => rooms.every(r => r.state?.players?.size === 4),
    6500, "four players share one room");
  assert.equal(new Set(rooms.map(r => r.roomId)).size, 1);

  // No client can harm another human without a mutually accepted duel.
  a.send("attack", { targetId: b.sessionId });
  await until(() => rejects.includes("duel_not_active"), 3500,
    "unconsented attack rejected");
  await sleep(200);
  assert.equal(bState().hp, 100);

  a.send("duel_request", { targetId: a.sessionId }); // self challenge
  await until(() => rejects.includes("invalid_duel_target"), 2500, "self challenge rejected");
  a.send("duel_request", { targetId: b.sessionId, hp: 0 }); // injected field
  await until(() => rejects.includes("invalid_duel_request"), 2500, "spoof challenge rejected");
  assert.equal(aState().duelState, "none");

  a.send("duel_request", { targetId: b.sessionId });
  await until(() =>
    rooms.every(r =>
      stateOf(r, a.sessionId)?.duelState === "outgoing" &&
      stateOf(r, b.sessionId)?.duelState === "incoming"),
    4000, "challenge state replicated");
  assert.equal(cState().duelState, "none");

  // Random spectator cannot consent on behalf of a target.
  c.send("duel_reply", { targetId: a.sessionId, accept: true });
  await sleep(180);
  assert.equal(aState().duelState, "outgoing");
  b.send("duel_reply", { targetId: a.sessionId, accept: false });
  await until(() => aState().duelState === "none" && bState().duelState === "none",
    3500, "declined challenge resets both players");
  console.log("PASS: unconsented attack blocked; self/injected challenges rejected");
  console.log("PASS: bilateral opt-in and decline synchronize across four clients");

  a.send("duel_request", { targetId: b.sessionId });
  await until(() => bState().duelState === "incoming", 3500, "repeat challenge");
  b.send("duel_reply", { targetId: a.sessionId, accept: true });
  await until(() => aState().duelState === "active" &&
                  bState().duelState === "active" &&
                  cState().duelState === "none" &&
                  dState().duelState === "none",
    3500, "both duelers active");

  // Damage and cooldown cannot be supplied by attacker.
  a.send("attack", { targetId: b.sessionId, damage: 1000000 });
  await sleep(200);
  assert.equal(bState().hp, 100);
  a.send("attack", { targetId: b.sessionId });
  await until(() => bState().hp === 88 &&
                   rooms.every(r => stateOf(r, b.sessionId)?.hp === 88),
    5500, "duel damage on both clients");
  assert.ok(pvpHits >= 4 && cSawHits >= 1);
  for (let i = 0; i < 10; i++) a.send("attack", { targetId: b.sessionId });
  await sleep(270);
  assert.equal(bState().hp, 88, "repeated packets bypassed 1s cooldown");
  console.log("PASS: shared player HP 100 -> 88; spoofed damage and burst ignored");

  a.send("move", { x: 0, z: 0 });
  await sleep(240);
  const hpAfterCancel = bState().hp;
  await sleep(1400);
  assert.equal(bState().hp, hpAfterCancel, "autoattack continued after manual move");
  a.send("duel_cancel", { targetId: b.sessionId });
  await until(() => aState().duelState === "none" && bState().duelState === "none",
    3500, "forfeit ends duel");
  console.log("PASS: tap-to-move cancels player attack and forfeit ends duel");

  // Use B as challenger so A's earlier invitation rate limit is irrelevant.
  b.send("duel_request", { targetId: a.sessionId });
  await until(() => aState().duelState === "incoming", 3500, "reverse challenge");
  a.send("duel_reply", { targetId: b.sessionId, accept: true });
  await until(() => bState().duelState === "active", 3500, "reverse duel accepted");
  a.send("attack", { targetId: b.sessionId });
  await until(() =>
    bState().hp === 0 && bState().alive === false &&
    aState().duelState === "none" && bState().duelState === "none",
    15000, "one duel knockout");
  assert.ok(ended.some(x => x.reason === "knockout" && x.winnerId === a.sessionId));
  assert.equal(cState().hp, 100);
  assert.equal(dState().hp, 100);
  await until(() => bState().alive && bState().hp === 100,
    7000, "loser respawns on server clock");
  console.log("PASS: duel winner, loser knockout and synchronized respawn");

  // Disconnect invalidates the duel for remaining players.
  c.send("duel_request", { targetId: d.sessionId });
  await until(() => dState().duelState === "incoming", 3500, "spectator challenge");
  d.send("duel_reply", { targetId: c.sessionId, accept: true });
  await until(() => dState().duelState === "active", 3500, "spectator duel");
  await c.leave();
  await until(() =>
    d.state?.players?.get(d.sessionId)?.duelState === "none",
    3500, "partner disconnect terminates duel");
  console.log("PASS: opponent disconnect clears duel for surviving player");
  console.log("PASS: MONTRA PvP duel 4-client integration complete");
} catch (error) {
  console.error("FAIL: MONTRA PvP integration:", error);
  process.exitCode = 1;
} finally {
  for (const room of rooms.reverse()) {
    try { await room.leave(); } catch (_) {}
  }
}
