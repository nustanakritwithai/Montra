/**
 * MONTRA S1 Monster AI test: one isolated real Colyseus room.
 * Confirms the ghost chases and damages a player on a server timer.
 */
import assert from "node:assert/strict";
import { Client } from "@colyseus/sdk";

const endpoint = process.env.MONTRA_TEST_URL || "http://127.0.0.1:4108";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function until(check, timeout, description) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (check()) return;
    await sleep(80);
  }
  throw new Error("Timed out waiting for " + description);
}

const client = new Client(endpoint);
let room;
try {
  room = await client.create("my_room");
  let monsterHits = 0;
  let sawChase = false;
  room.onMessage("monster_hit", () => monsterHits++);
  for (const key of ["combat_hit", "combat_notice", "command_rejected", "monster_respawn", "player_down", "player_respawn"]) {
    room.onMessage(key, () => {});
  }
  room.onStateChange(state => {
    if (state?.monster?.aiState === "chase" || state?.monster?.aiState === "attack") {
      sawChase = true;
    }
  });

  await until(() => room.state?.players?.get(room.sessionId) && room.state.monster?.alive,
    6000, "initial state");
  const player = () => room.state.players.get(room.sessionId);
  assert.equal(Number(player().hp), 100);

  // Walk close to the ghost; it must autonomously choose and chase the player.
  room.send("move", { x: 1.1, z: 9.0 });
  await until(() => Number(player().hp) < 100 && monsterHits >= 1, 14000,
    "AI selecting, chasing and damaging its target");
  assert.ok(sawChase);
  assert.ok(Number.isFinite(Number(room.state.monster.facing)));

  const hpAfterFirstHit = Number(player().hp);
  assert.equal(hpAfterFirstHit, 92);
  await sleep(500); // monster attack cooldown is 1500ms
  assert.equal(Number(player().hp), hpAfterFirstHit, "monster bypassed cooldown");
  await until(() => Number(player().hp) < hpAfterFirstHit && monsterHits >= 2,
    3500, "second cooldown-limited monster attack");
  assert.equal(Number(player().hp), hpAfterFirstHit - 8);
  console.log("PASS: monster AI aggros and chases players using server state");
  console.log("PASS: monster damages player exactly 8HP, cooldown enforced");

  room.send("move", { x: 0, z: 0 });
} catch (error) {
  console.error("FAIL: MONTRA S1 monster AI test:", error);
  process.exitCode = 1;
} finally {
  try { await room?.leave(); } catch (_) {}
}
