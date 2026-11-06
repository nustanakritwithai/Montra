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
const newToken = () => "mt1_" + randomBytes(32).toString("hex");
const rooms = new Set();
async function join(token, roomId) {
  const client = new Client(url);
  const options = {guestToken:token, worldVersion:1, templeVersion:1, atlasVersion:1};
  const room = roomId ? await client.joinById(roomId,options) : await client.create("my_room",options);
  rooms.add(room);
  const events = [];
  room.onMessage("*",(type,data) => events.push({type,data}));
  const me = () => room.state?.players?.get(room.sessionId);
  await until(()=>me()?.persistent, "join");
  const event = (type, check) => events.find(e => e.type === type && check(e.data))?.data;
  return { room, me, event };
}

try {
  const legacy = newToken(), burstToken = newToken();
  const id = createHash("sha256").update(legacy).digest("hex");
  await writeFile(path.join(directory, id + ".json"), JSON.stringify({version:1,id,name:"นักรบอาคม",level:1,experience:11,
    pkKills:0,pkDeaths:0,mapId:"ritual_village",x:0,y:0,z:0,hp:240,build:{path:"blade",ancestry:"woodland"},updatedAt:new Date().toISOString()}), {flag:"wx"});
  const steady = await join(legacy), roomId = steady.room.roomId, burst = await join(burstToken,roomId);
  assert.equal(steady.me().bladeTalentId,"steady");
  burst.room.send("select_build",{path:"seer",ancestry:"shrine",bladeTalent:"burst"});
  await until(()=>burst.event("command_rejected",e=>e.reason==="invalid_build"), "wrong path accepted");
  burst.room.send("select_build",{path:"blade",ancestry:"woodland",bladeTalent:"burst"});
  await until(()=>burst.me().bladeTalentId==="burst","select burst");
  burst.room.send("select_build",{path:"blade",ancestry:"shrine"});
  await until(()=>burst.me().ancestryId==="shrine","legacy update");
  assert.equal(burst.me().bladeTalentId,"burst");

  steady.room.send("party_invite",{targetId:burst.room.sessionId});
  const invite = await until(()=>burst.event("party_invitation",()=>true),"invite");
  burst.room.send("party_accept",{inviteId:invite.inviteId});
  await until(()=>steady.event("party_state",e=>e.members.length===2),"party");
  const first = performance.now();
  steady.room.send("cast_class_skill",{});
  await until(()=>steady.me().atk===25 && steady.event("class_skill_used",e=>e.targets===1),"steady ATK");
  assert.equal(burst.me().atk,20);
  const second = performance.now();
  burst.room.send("cast_class_skill",{});
  await until(()=>burst.me().atk===28 && burst.event("class_skill_used",e=>e.targets===1),"burst ATK");
  assert.equal(burst.me().def,30);assert.equal(burst.me().magicAtk,15);
  for (const caster of [steady,burst]) {
    assert.ok(caster.me().mana >= caster.me().maxMana - 20 && caster.me().mana < caster.me().maxMana - 19, "class skill charges 20 mana before regeneration");
    const remaining = caster.me().classSkillReadyAt - Date.now();
    assert.ok(remaining > 23_000 && remaining <= 25_000);
  }
  await until(()=>burst.me().atk===20 && steady.me().atk===25,"burst expires first",12000);
  assert.ok(performance.now()-second>=5700);
  await until(()=>steady.me().atk===20,"steady expires",10000);
  assert.ok(performance.now()-first>=9700);
  const readyAt = burst.me().classSkillReadyAt;
  await burst.room.leave();rooms.delete(burst.room);await sleep(400);
  const back = await join(burstToken,roomId);
  assert.equal(back.me().bladeTalentId,"burst");assert.equal(back.me().classSkillReadyAt,readyAt);assert.equal(back.me().atk,20);
  back.room.send("select_build",{path:"blade",ancestry:"shrine",bladeTalent:"steady"});
  await until(()=>back.event("command_rejected",e=>e.reason==="class_skill_cooldown"),"cooldown bypassed");
  console.log("PASS: blade talent self-only ATK, cost, cooldown, 6s/10s expiry, legacy save, persistence and respec lock");
} finally {
  for (const room of rooms) await room.leave().catch(()=>{});
}
