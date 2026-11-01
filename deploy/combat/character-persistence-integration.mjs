/**
 * MONTRA three-slot integration (LOCAL TEST SERVER + TEMP CHARACTER DIRECTORY ONLY).
 * Stage "write" creates 3 isolated saves and exits; CI restarts Node; stage "read"
 * verifies all three saves and single-account session locking.
 */
import assert from "node:assert/strict";
import { Client } from "@colyseus/sdk";

const endpoint = process.env.MONTRA_TEST_URL || "http://127.0.0.1:4108";
const token = process.env.MONTRA_S2_TEST_TOKEN;
const stage = process.env.MONTRA_S2_TEST_STAGE;
if (!process.env.MONTRA_CHARACTER_DIR || !/^mt1_[0-9a-f]{64}$/.test(token || "")) {
  throw new Error("S3 tests require an isolated MONTRA_CHARACTER_DIR and test token");
}
if (!["write", "read"].includes(stage)) throw new Error("S3 test stage must be write or read");

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
async function createRoom(options) {
  const room = await new Client(endpoint).create("my_room", options);
  await until(() => room.state?.players?.get?.(room.sessionId), 5000, "player state");
  return room;
}
async function close(room) {
  if (!room) return;
  await room.leave();
  await sleep(250); // server finishes the atomic file write and releases account lease
}
const own = room => room.state.players.get(room.sessionId);
const slotData = [
  {slot: 1, name: "นักท่องมนตรา", x: 3, z: -2},
  {slot: 2, name: "นทีสอง", x: -3, z: -3},
  {slot: 3, name: "นทีสาม", x: -1, z: 4},
];

let room;
try {
  if (stage === "write") {
    for (const item of slotData) {
      // The first slot intentionally uses the OLD S2 join payload.
      room = await createRoom(item.slot === 1
        ? { guestToken: token }
        : { guestToken: token, characterSlot: item.slot });
      assert.equal(own(room).persistent, true);
      assert.equal(own(room).characterSlot, item.slot);
      assert.equal(own(room).characterName, "นักเดินทาง");
      room.send("rename_character", { name: item.name });
      await until(() => own(room)?.characterName === item.name, 3000, "rename slot " + item.slot);
      if (item.slot === 1) {
        room.send("rename_character", { name: "<script>" });
        await sleep(150);
        assert.equal(own(room).characterName, item.name, "invalid rename must be rejected");
      }
      room.send("move", { x: item.x, z: item.z });
      await until(() => Math.hypot(own(room)?.x - item.x, own(room)?.z - item.z) < 0.16,
        6500, "move in slot " + item.slot);
      if (item.slot === 3) {
        // Persist flight within the existing v1 snapshot's Y field; no new
        // account identity or file-migration contract is necessary.
        room.send("fly", {});
        await until(() => own(room)?.flying === true &&
          Math.abs(own(room)?.y - 6) < .02, 3600, "flight save for slot 3");
      }
      await close(room);
      room = null;
    }
    console.log("PASS: three independent character slots created and saved with distinct names/positions");
    console.log("PASS: legacy S2 join payload remains mapped to slot 1");
  } else {
    const savedIds = new Set();
    for (const item of slotData) {
      room = await createRoom({ guestToken: token, characterSlot: item.slot });
      const me = own(room);
      assert.equal(me.persistent, true);
      assert.equal(me.characterSlot, item.slot);
      assert.equal(me.characterName, item.name, "wrong name in save slot " + item.slot);
      assert.ok(Math.hypot(me.x - item.x, me.z - item.z) < 0.2,
        "wrong saved position in slot " + item.slot);
      assert.equal(me.level, 1);
      assert.equal(me.experience, 0);
      assert.equal(me.flying, item.slot === 3,
        "saved flying state restored from Y only for slot 3");
      assert.ok(Math.abs(me.y - (item.slot === 3 ? 6 : 0)) < .02,
        "wrong persistent altitude for slot " + item.slot);
      assert.equal(me.pkKills, 0);
      savedIds.add(me.characterId);

      if (item.slot === 1) {
        // Same Guest ID must not play two different characters at once.
        await assert.rejects(
          () => createRoom({ guestToken: token, characterSlot: 3 }),
          /character_already_online|join|error/i,
          "same Guest ID cannot log into another save concurrently"
        );
        let listing;
        room.onMessage("character_slots", message => { listing = message?.slots; });
        room.send("get_character_slots", {});
        await until(() => Array.isArray(listing) && listing.length === 3,
          3500, "three authoritative save previews");
        assert.deepEqual(listing.map(s => s.name), slotData.map(s => s.name));
        assert.deepEqual(listing.map(s => s.occupied), [true, true, true]);
        console.log("PASS: authoritative slot listing returns exactly three saved characters");
        const anon = await createRoom({});
        assert.equal(own(anon).persistent, false, "legacy non-token clients stay transient");
        await close(anon);
      }
      await close(room);
      room = null;
    }
    assert.equal(savedIds.size, 3, "all character slots must have unique public IDs");
    await assert.rejects(
      () => createRoom({ guestToken: token, characterSlot: 4 }),
      /invalid_character_slot|join|error/i
    );
    console.log("PASS: all three slots survive a full Node restart and keep separate data");
    console.log("PASS: account lease blocks cross-slot duplicate login, invalid slots and old anonymous clients");
  }
} finally {
  if (room) await room.leave().catch(() => {});
}
