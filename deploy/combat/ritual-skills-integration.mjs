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
  mapId:"ritual_village", x:1.1, y:0, z:17.7, hp:240, build:{path:"seer",ancestry:"woodland"}, updatedAt:new Date().toISOString()
}), {flag:"wx"});
const room = await new Client(url).create("my_room", {guestToken:token, worldVersion:1, templeVersion:1, atlasVersion:1});
let lastTalismanReadyAt;
try {
  const events = [];
  room.onMessage("*", (type, data) => events.push({type,data}));
  const event = (type, match) => events.find(e => e.type === type && match(e.data))?.data;
  const me = () => room.state?.players?.get(room.sessionId);
  await until(() => me()?.persistent && room.state.ritualSkillsAvailable, "ritual skills available");
  assert.equal(me().pathId, "seer");
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
  console.log("PASS: occult rice and independent pot damage, shared legacy shot cooldown and possession");

  // No melee order is active. Invalid or distant targets must leave the seal ready.
  await sleep(600);
  room.send("apply_talisman", {targetId});
  await until(() => event("command_rejected", e => e.reason === "talisman_out_of_range"), "range");
  await sleep(600);
  room.send("apply_talisman", {targetId:room.sessionId});
  await until(() => event("command_rejected", e => e.reason === "invalid_talisman_target"), "monster targets only");
  assert.equal(me().talismanReadyAt, 0);
  room.send("move", {x:room.state.monster.x, z:room.state.monster.z});
  await until(() => Math.hypot(me().x-room.state.monster.x, me().z-room.state.monster.z) < 2.5, "within reach");
  const beforeSeal = room.state.monster.hp;
  const start = events.length;
  room.send("blessed_rice", {targetId});
  room.send("apply_talisman", {targetId});
  const seal = await until(() => event("combat_hit", e => e.source === "talisman" && e.targetId === targetId), "seal hit");
  const otherSpell = events.slice(start).find(e => e.type === "combat_hit" && e.data.source === "ranged")?.data;
  assert.ok(otherSpell?.damage > 0 && seal.damage > otherSpell.damage);
  assert.equal(seal.hp, beforeSeal - otherSpell.damage - seal.damage);
  lastTalismanReadyAt = me().talismanReadyAt;
  assert.ok(lastTalismanReadyAt > Date.now() && lastTalismanReadyAt <= Date.now() + 4000);
  room.send("apply_talisman", {targetId});
  await until(() => event("command_rejected", e => e.reason === "talisman_cooldown"), "seal cooldown");
  assert.equal(room.state.monster.hp, seal.hp);
  console.log("PASS: monster-only talisman, range, rice and seal together, authoritative HP and independent cooldown");
} finally {
  await room.leave();
}

await sleep(450);
const back = await new Client(url).create("my_room", {guestToken:token, worldVersion:1, templeVersion:1, atlasVersion:1});
try {
  await until(() => back.state?.players?.get(back.sessionId)?.persistent, "rejoin");
  assert.equal(back.state.players.get(back.sessionId).talismanReadyAt, lastTalismanReadyAt);
  console.log("PASS: talisman cooldown restored from character save");
} finally {
  await back.leave();
}
