import assert from "node:assert/strict";
import {createHash, randomBytes} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {Client} from "@colyseus/sdk";

const url = process.env.MONTRA_TEST_URL, directory = process.env.MONTRA_CHARACTER_DIR;
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(url || "") || !directory || !path.basename(directory).startsWith("montra-buff-test-")) {
  throw Error("Use an isolated localhost server and a disposable montra-buff-test-* directory");
}
const sleep = ms => new Promise(done => setTimeout(done, ms));
async function until(read, message, timeout = 8000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = read();
    if (value) return value;
    await sleep(40);
  }
  throw Error(message);
}
const token = "mt1_" + randomBytes(32).toString("hex");
const id = createHash("sha256").update(token).digest("hex");
await writeFile(path.join(directory, id + ".json"), JSON.stringify({
  version:1, id, name:"ผู้ฝึกอาคม", level:1, experience:0, pkKills:0, pkDeaths:0,
  mapId:"ritual_village", x:1.1, y:0, z:17.7, hp:240, updatedAt:new Date().toISOString()
}), {flag:"wx"});
const room = await new Client(url).create("my_room", {guestToken:token, worldVersion:1, templeVersion:1, atlasVersion:1});
try {
  const events = [];
  room.onMessage("*", (type, data) => events.push({type,data}));
  const event = (type, match) => events.find(e => e.type === type && match(e.data))?.data;
  const me = () => room.state?.players?.get(room.sessionId);
  await until(() => me()?.persistent && room.state.ritualSkillsAvailable, "ritual skills available");
  assert.equal(me().pathId, "");
  const targetId = room.state.monster.id;
  const originalHp = room.state.monster.hp;
  room.send("blessed_rice", {targetId});
  const rice = await until(() => event("ranged_hit", e => e.skill === "blessed_rice" && e.targetId === targetId), "rice hit");
  assert.ok(rice.damage > 0);
  assert.equal(room.state.monster.hp, originalHp - rice.damage);
  assert.equal(room.state.summons.size, 0);

  room.send("shoot", {targetId});
  room.send("pot_summon", {});
  await until(() => event("command_rejected", e => e.reason === "shot_cooldown"), "legacy shot cannot bypass cooldown");
  await until(() => room.state.summons.get(room.sessionId)?.kind === "pot_spirit", "pot opens during rice cooldown");
  const hit = await until(() => event("summon_hit", e => e.ownerId === room.sessionId && e.targetId === targetId), "pot spirit hunts");
  assert.ok(hit.damage > 0);
  assert.equal(room.state.monster.hp, originalHp - rice.damage - hit.damage);
  assert.equal(me().targetId, "");
  assert.equal(room.state.monster.targetId, "");
  room.send("possess", {});
  await until(() => me().possessionActive && !room.state.summons.has(room.sessionId), "pot spirit enters owner");
  room.send("pot_summon", {});
  await until(() => event("command_rejected", e => e.reason === "possession_active"), "one spirit per owner");
  console.log("PASS: classless rice and independent pot damage, shared legacy shot cooldown and possession");
} finally {
  await room.leave();
}
