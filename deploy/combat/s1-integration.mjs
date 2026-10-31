/**
 * MONTRA S1 integration test using real Colyseus 0.18 rooms and real sockets.
 * No production players are touched: client.create() makes an isolated room.
 * Runs from C:\\Montra\\online-server with @colyseus/sdk already installed.
 */
import { Client } from "@colyseus/sdk";
import assert from "node:assert/strict";

const endpoint = process.env.MONTRA_TEST_URL || "http://127.0.0.1:4108";
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function until(check, timeout, label) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = check();
    if (value) return value;
    await sleep(70);
  }
  throw new Error("Timed out: " + label);
}

const clients = Array.from({ length: 4 }, () => new Client(endpoint));
const rooms = [];
let combatEvents = 0;
let sawMonsterAI = false;
let sawRateLimit = false;
try {
  rooms.push(await clients[0].create("my_room"));
  for (let i = 1; i < clients.length; i++) {
    rooms.push(await clients[i].joinById(rooms[0].roomId));
  }
  for (const r of rooms) {
    r.onMessage("combat_notice", () => {});
    r.onMessage("combat_hit", () => combatEvents++);
    r.onMessage("monster_hit", () => {});
    r.onMessage("monster_respawn", () => {});
    r.onMessage("player_respawn", () => {});
    r.onMessage("player_down", () => {});
    r.onMessage("command_rejected", message => {
      if (message?.reason === "move_rate_limited") sawRateLimit = true;
    });
    r.onStateChange(state => {
      if (state?.monster?.aiState === "chase" || state?.monster?.aiState === "attack") {
        sawMonsterAI = true;
      }
    });
  }

  const allHere = () => rooms.every(r =>
    r.state?.players?.size === 4 && r.state?.monster?.hp === 100
  );
  await until(allHere, 7000, "four players in one shared room");
  assert.equal(new Set(rooms.map(r => r.roomId)).size, 1);

  // Forged positions, speed and damage must be rejected.
  const idA = rooms[0].sessionId;
  const initialX = Number(rooms[0].state.players.get(idA).x);
  rooms[0].send("move", { x: 20, z: 20, speed: 9999 });
  rooms[0].send("move", { x: 9999, z: 0 });
  rooms[0].send("move", { x: Number.NaN, z: 0 });
  rooms[0].send("attack", { targetId: "possessed-1", damage: 1000000 });
  rooms[0].send("attack", { targetId: "possessed-1", hp: 0 });
  await sleep(300);
  assert.ok(Math.abs(rooms[0].state.players.get(idA).x - initialX) < 0.05);
  assert.equal(Number(rooms[0].state.monster.hp), 100);
  console.log("PASS: forged movement speed, NaN, damage and HP payloads rejected");

  // Multiple simultaneous characters must move at the SERVER speed.
  const starts = rooms.map(r => {
    const p = rooms[0].state.players.get(r.sessionId);
    return { x: Number(p.x), z: Number(p.z) };
  });
  const destinations = [
    { x: 10, z: 0 }, { x: -10, z: 0 },
    { x: 4, z: 4 }, { x: 6, z: -4 },
  ];
  const started = Date.now();
  rooms.forEach((r, i) => r.send("move", destinations[i]));
  await sleep(700);
  const elapsed = (Date.now() - started) / 1000;
  for (let i = 0; i < rooms.length; i++) {
    const p = rooms[0].state.players.get(rooms[i].sessionId);
    const dist = Math.hypot(Number(p.x) - starts[i].x, Number(p.z) - starts[i].z);
    assert.ok(dist > 0.4, "player " + i + " should move");
    assert.ok(dist <= elapsed * 3 + 0.35, "server speed cap breached by player " + i);
  }
  const heading = Number(rooms[0].state.players.get(idA).facing);
  assert.ok(Math.abs(heading + Math.PI / 2) < 0.12,
    "authoritative facing should track movement to +X");
  await until(() => rooms.every(r => Math.abs(
    Number(r.state.players.get(idA)?.facing) - heading
  ) < 0.08), 4000, "shared server-facing direction");
  console.log("PASS: four player positions, max speed and facing synchronized");

  // Stop the exploratory moves before combat.
  rooms.forEach(r => {
    const p = r.state.players.get(r.sessionId);
    r.send("move", { x: Number(p.x), z: Number(p.z) });
  });
  await sleep(250);

  // Genuine attack from far away: damage is not allowed until a walk closes range.
  const originalHp = Number(rooms[0].state.monster.hp);
  rooms[0].send("attack", { targetId: "possessed-1" });
  await sleep(150);
  assert.equal(Number(rooms[0].state.monster.hp), originalHp,
    "remote attack must not instantly damage monster");

  await until(() => Number(rooms[0].state?.monster?.hp) < originalHp &&
                    rooms.every(r => Number(r.state?.monster?.hp) ===
                          Number(rooms[0].state?.monster?.hp)),
  14000, "attack from distance, auto-approach and shared damage");
  assert.ok(combatEvents >= 4, "all four clients should receive combat events");
  console.log("PASS: attacks obey range and broadcast shared HP to four users");

  // Tap ground cancels continuous attacks, not just the UI animation.
  rooms[0].send("move", { x: 0, z: 0 });
  await sleep(250);
  const hpAfterCancel = Number(rooms[0].state.monster.hp);
  await sleep(1300); // cross the 1s player attack cooldown
  assert.equal(Number(rooms[0].state.monster.hp), hpAfterCancel);
  assert.equal(Number(rooms[3].state.monster.hp), hpAfterCancel);
  console.log("PASS: manual movement stops server automatic attacks");

  // Three other players plus A defeat the same target; no negative HP.
  rooms.forEach(r => r.send("attack", { targetId: "possessed-1" }));
  await until(() => rooms.every(r =>
    Number(r.state?.monster?.hp) === 0 && r.state?.monster?.alive === false
  ), 17000, "shared monster defeat");
  assert.ok(sawMonsterAI, "monster chase/attack AI should have activated");
  console.log("PASS: four-user combat kills the monster once; AI chase activated");

  // Respawn is driven by the server's clock; clients receive the same result.
  await until(() => rooms.every(r =>
    Number(r.state?.monster?.hp) === 100 && r.state?.monster?.alive === true
  ), 10000, "synchronized monster respawn");
  console.log("PASS: synchronized monster respawn via server time");

  // Rate limit invalid command floods without corrupting state.
  for (let n = 0; n < 40; n++) {
    rooms[0].send("move", { x: n % 2 ? 9 : -9, z: 0 });
  }
  await until(() => sawRateLimit, 2000, "move command rate limiting");
  for (const r of rooms) {
    const p = r.state.players.get(idA);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z));
    assert.ok(Math.abs(p.x) <= 20 && Math.abs(p.z) <= 20);
  }
  console.log("PASS: excessive commands rate-limited without invalid state");
  console.log("PASS: MONTRA S1 Server Engine 4-user integration complete");
} catch (error) {
  console.error("FAIL: MONTRA S1 Server Engine integration:", error);
  process.exitCode = 1;
} finally {
  for (const r of rooms.reverse()) {
    try { await r.leave(); } catch (_) {}
  }
}
