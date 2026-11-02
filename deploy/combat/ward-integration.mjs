import assert from "node:assert/strict";
import {createHash, randomBytes} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {Client} from "@colyseus/sdk";

const url = process.env.MONTRA_TEST_URL, directory = process.env.MONTRA_CHARACTER_DIR;
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url || "") || !directory || !path.basename(directory).startsWith("montra-buff-test-")) {
  throw Error("Requires isolated localhost and a disposable montra-buff-test-* directory");
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read, label, timeout = 8000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const result = read();
    if (result) return result;
    await sleep(40);
  }
  throw Error("Timed out: " + label);
}
const rooms = new Set();
async function seed(z, pathId) {
  const token = "mt1_" + randomBytes(32).toString("hex");
  const id = createHash("sha256").update(token).digest("hex");
  const snapshot = {version:1, id, name:"นักทดสอบ", x:0, y:0, z, hp:240, level:1,
    mapId:"ritual_village", pkKills:0, pkDeaths:0, experience:0, updatedAt: new Date().toISOString(),
    build:{path:pathId, ancestry:"woodland"}};
  await writeFile(path.join(directory,id+".json"),JSON.stringify(snapshot),{flag:"wx"});
  return token;
}
async function join(token, roomId) {
  const client = new Client(url), options = {guestToken:token, worldVersion:1, templeVersion:1, atlasVersion:1};
  const room = roomId ? await client.joinById(roomId,options) : await client.create("my_room",options);
  rooms.add(room);
  const events = [];
  room.onMessage("*",(type,data)=>events.push({type,data}));
  const me = () => room.state?.players?.get(room.sessionId);
  const event = (type, check=()=>true) => events.find(e=>e.type===type && check(e.data))?.data;
  await until(()=>me()?.persistent,"join");
  return {room, me, event};
}
try {
  const a = await join(await seed(0,"sentinel"));
  const roomId = a.room.roomId, wideToken = await seed(0,"sentinel");
  const b = await join(wideToken,roomId), mid = await join(await seed(-15,"blade"),roomId), far = await join(await seed(-19,"blade"),roomId);
  assert.equal(a.me().wardTalentId,"lasting");
  assert.equal(mid.me().z,-15); assert.equal(far.me().z,-19);
  mid.room.send("select_build",{path:"blade",ancestry:"woodland",wardTalent:"wide"});
  await until(()=>mid.event("command_rejected",e=>e.reason==="invalid_build"),"talent rejected for other path");
  b.room.send("select_build",{path:"sentinel",ancestry:"woodland",wardTalent:"wide",radius:999});
  await until(()=>b.event("command_rejected",e=>e.reason==="invalid_build"),"forged radius rejected");
  b.room.send("select_build",{path:"sentinel",ancestry:"woodland",wardTalent:"wide"});
  await until(()=>b.me().wardTalentId==="wide","talent only change");
  b.room.send("select_build",{path:"sentinel",ancestry:"shrine"});
  await until(()=>b.me().ancestryId==="shrine","legacy client updates ancestry");
  assert.equal(b.me().wardTalentId,"wide");
  let count=1;
  for (const member of [b,mid,far]) {
    a.room.send("party_invite",{targetId:member.room.sessionId});
    const invite = await until(()=>member.event("party_invitation"),"invite");
    member.room.send("party_accept",{inviteId:invite.inviteId});
    const size = ++count;
    await until(()=>a.event("party_state",e=>e.members.length===size),"party membership");
  }
  const def = member => a.room.state.players.get(member.room.sessionId)?.def;
  const firstCast = performance.now();
  a.room.send("cast_class_skill",{});
  await until(()=>a.event("class_skill_used",e=>e.targets===2) && def(a)===36 && def(b)===36,"lasting ward within 12");
  assert.equal(def(mid),30);assert.equal(def(far),30);
  const secondCast = performance.now();
  b.room.send("cast_class_skill",{});
  await until(()=>b.event("class_skill_used",e=>e.targets===3) && def(a)===39 && def(mid)===36,"wide ward reaches 15 and stacks on casters");
  assert.equal(def(far),30);
  await until(()=>def(mid)===30 && def(a)===36,"wide expires first",12000);
  assert.ok(performance.now()-secondCast >= 5700,"wide ward ended early");
  await until(()=>def(a)===30,"lasting expires",10000);
  assert.ok(performance.now()-firstCast >= 9700,"lasting ward ended early");
  const readyAt = b.me().classSkillReadyAt;
  await b.room.leave();rooms.delete(b.room);
  await sleep(400);
  const back = await join(wideToken,roomId);
  assert.equal(back.me().wardTalentId,"wide");assert.equal(back.me().classSkillReadyAt,readyAt);
  back.room.send("select_build",{path:"sentinel",ancestry:"shrine",wardTalent:"lasting"});
  await until(()=>back.event("command_rejected",e=>e.reason==="class_skill_cooldown"),"respec blocked during cooldown");
  assert.equal(back.me().wardTalentId,"wide");
  console.log("PASS: old save and older selection payload, range at 15/19, both expirations, persisted wide talent and cooldown");
} finally {
  for (const room of rooms) await room.leave().catch(()=>{});
}
