/** Run only against an isolated localhost server and temporary character directory. */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "@colyseus/sdk";

const endpoint = process.env.MONTRA_TEST_URL;
const directory = process.env.MONTRA_CHARACTER_DIR;
if (!/^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(endpoint || "") ||
    !directory || !/^(?:montra-chat-test-|montra-world-test-)/.test(path.basename(directory))) {
  throw new Error("chat integration requires isolated localhost and montra-chat-test-* data");
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label, timeout = 5000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (check()) return; await sleep(40); }
  throw new Error("Timed out: " + label);
}
const token = "mt1_" + randomBytes(32).toString("hex");
const file = path.join(directory, createHash("sha256").update(token).digest("hex") + ".json");
let rooms = [];
try {
  // Create and edit only the throwaway character, while it is offline.
  let seed = await new Client(endpoint).create("my_room", { guestToken: token });
  await until(() => seed.state?.players?.get(seed.sessionId), "seed player");
  await seed.leave(); await sleep(500);
  const snapshot = JSON.parse(await readFile(file, "utf8"));
  snapshot.mapId = "forbidden_forest"; snapshot.x = 0; snapshot.y = 0; snapshot.z = 12;
  await writeFile(file, JSON.stringify(snapshot));

  const a = await new Client(endpoint).create("my_room"); rooms.push(a);
  const b = await new Client(endpoint).joinById(a.roomId); rooms.push(b);
  const c = await new Client(endpoint).joinById(a.roomId, { guestToken: token }); rooms.push(c);
  await until(() => a.state?.chatAvailable === true && a.state.players.size === 3 &&
    a.state.players.get(c.sessionId)?.mapId === "forbidden_forest", "three players across maps");
  const messages = [[], [], []], rejected = [];
  [a,b,c].forEach((room, index) => room.onMessage("chat_message", m => messages[index].push(m)));
  a.onMessage("command_rejected", m => rejected.push(m.reason));
  a.send("chat", { channel: "map", text: "สวัสดี 👋" });
  await until(() => messages[0].length === 1 && messages[1].length === 1, "map chat delivered");
  await sleep(250);
  assert.equal(messages[2].length, 0, "other map must not receive map chat");
  assert.equal(messages[0][0].name, a.state.players.get(a.sessionId).characterName);
  assert.equal(messages[0][0].senderId, a.sessionId);

  a.send("chat", { channel: "world", text: "<img src=x onerror=alert(1)>" });
  await until(() => messages.every(list => list.some(m => m.channel === "world")), "world reaches both maps");
  assert.equal(messages[2][0].text, "<img src=x onerror=alert(1)>");
  a.send("chat", { channel: "world", text: "forged", name: "admin" });
  await until(() => rejected.includes("invalid_chat"), "forged identity rejected");
  assert.ok(messages.every(list => !list.some(m => m.text === "forged")));
  await sleep(650);
  a.send("chat", { channel: "map", text: "one" });
  a.send("chat", { channel: "map", text: "two" });
  a.send("chat", { channel: "map", text: "three" });
  await until(() => rejected.includes("chat_rate_limited"), "spam rate limited");
  assert.ok(messages[2].every(m => m.channel === "world"));
  console.log("PASS: map and room chat isolation, server identity, forged payload rejection and rate limiting");
} finally {
  for (const room of rooms.reverse()) await room.leave().catch(() => {});
}
