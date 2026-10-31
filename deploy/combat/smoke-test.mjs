// MONTRA Combat Alpha smoke test (run from the online-server root).
// Creates an isolated Colyseus room: does not hit monsters in existing player rooms.
import { Client } from "@colyseus/sdk";

const endpoint = process.env.MONTRA_TEST_URL || "http://127.0.0.1:4108";
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function until(check, timeoutMs, label) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = check();
    if (value) return value;
    await sleep(75);
  }
  throw new Error("Timeout waiting for " + label);
}

const clientA = new Client(endpoint);
const clientB = new Client(endpoint);
let roomA;
let roomB;

try {
  roomA = await clientA.create("my_room");
  roomB = await clientB.joinById(roomA.roomId);
  if (roomA.roomId !== roomB.roomId) {
    throw new Error("Two users were assigned to different rooms");
  }

  await until(() =>
    roomA.state?.monster && roomB.state?.monster &&
    roomA.state?.players?.size === 2 && roomB.state?.players?.size === 2,
    6000, "shared initial state"
  );

  const first = Number(roomA.state.monster.hp);
  if (!Number.isFinite(first) || first !== 100) {
    throw new Error("Expected monster HP 100; got " + first);
  }

  let seenA = 0;
  let seenB = 0;
  roomA.onMessage("combat_hit", () => seenA++);
  roomB.onMessage("combat_hit", () => seenB++);

  // The player begins far away; the server must auto-approach and hit.
  roomA.send("attack", { targetId: "possessed-1" });

  const after = await until(() => {
    const hpA = Number(roomA.state?.monster?.hp);
    const hpB = Number(roomB.state?.monster?.hp);
    return hpA < first && hpA === hpB && seenA > 0 && seenB > 0 ? hpA : null;
  }, 12000, "authoritative synchronized combat damage");

  // Stop auto-attacking by issuing a manual move.
  roomA.send("move", { x: 0, z: 0 });
  await sleep(150);
  console.log("PASS: two users in room " + roomA.roomId);
  console.log("PASS: shared monster HP " + first + " -> " + after);
  console.log("PASS: combat_hit observed by both clients");
  console.log("PASS: manual move command issued to cancel auto-attack");
} catch (error) {
  console.error("MONTRA COMBAT SMOKE TEST FAILED:", error);
  process.exitCode = 1;
} finally {
  try { await roomB?.leave(); } catch (_) {}
  try { await roomA?.leave(); } catch (_) {}
}
