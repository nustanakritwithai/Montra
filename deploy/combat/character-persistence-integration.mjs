/**
 * MONTRA S2 integration: run only against a LOCAL test server with a TEMP data
 * directory, never against live players. CI runs 'write', restarts Node and
 * then runs 'read' using the same server-owned character storage directory.
 */
import assert from "node:assert/strict";
import { Client } from "@colyseus/sdk";

const endpoint = process.env.MONTRA_TEST_URL || "http://127.0.0.1:4108";
const token = process.env.MONTRA_S2_TEST_TOKEN;
const stage = process.env.MONTRA_S2_TEST_STAGE;
if (!process.env.MONTRA_CHARACTER_DIR || !/^mt1_[0-9a-f]{64}$/.test(token || "")) {
  throw new Error("S2 test requires MONTRA_CHARACTER_DIR and MONTRA_S2_TEST_TOKEN for isolated testing");
}
if (stage !== "write" && stage !== "read") {
  throw new Error("S2 test stage must be write or read");
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, timeout, label) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = check();
    if (result) return result;
    await sleep(70);
  }
  throw new Error("Timed out: " + label);
}
async function createRoom(credentials) {
  const client = new Client(endpoint);
  const room = await client.create("my_room", credentials);
  await until(() => room.state?.players?.get?.(room.sessionId), 5000, "player state");
  return room;
}

let room;
try {
  room = await createRoom({ guestToken: token });
  let me = room.state.players.get(room.sessionId);
  assert.equal(me.persistent, true, "guest character must be loaded through server storage");
  assert.match(me.characterId, /^[a-f0-9]{12}$/);

  if (stage === "write") {
    assert.equal(me.characterName, "นักเดินทาง");
    room.send("rename_character", { name: "นักท่องมนตรา" });
    await until(() => room.state.players.get(room.sessionId)?.characterName === "นักท่องมนตรา",
      3000, "server-confirmed name");
    room.send("rename_character", { name: "<script>" });
    await sleep(200);
    assert.equal(room.state.players.get(room.sessionId).characterName, "นักท่องมนตรา",
      "malformed name must be ignored");
    room.send("move", { x: 3, z: -2 });
    await until(() => {
      const p = room.state.players.get(room.sessionId);
      return p && Math.hypot(p.x - 3, p.z + 2) < 0.16;
    }, 6000, "character reaches persistent destination");
    console.log("PASS: S2 character created, rename validated, and authoritative movement completed");
  } else {
    assert.equal(me.characterName, "นักท่องมนตรา", "name was not restored after Node restart");
    assert.ok(Math.hypot(me.x - 3, me.z + 2) < 0.2,
      "position was not restored after Node restart");
    assert.equal(me.level, 1);
    assert.equal(me.experience, 0);
    assert.equal(me.pkKills, 0);
    assert.equal(me.pkDeaths, 0);

    await assert.rejects(
      () => createRoom({ guestToken: token }),
      /character_already_online|join|error/i,
      "second active session must not hijack the same character"
    );
    const anonymous = await createRoom({});
    assert.equal(anonymous.state.players.get(anonymous.sessionId).persistent, false,
      "legacy anonymous client should remain compatible but transient");
    await anonymous.leave();
    console.log("PASS: S2 character reloads after complete server restart");
    console.log("PASS: duplicate guest sessions rejected; legacy clients remain compatible");
  }
} finally {
  if (room) await room.leave().catch(() => {});
}
