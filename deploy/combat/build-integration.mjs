import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "@colyseus/sdk";

const endpoint = process.env.MONTRA_TEST_URL, directory = process.env.MONTRA_CHARACTER_DIR;
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(endpoint || "") ||
    !directory || !path.basename(directory).startsWith("montra-buff-test-"))
  throw Error("Use isolated localhost and a temporary montra-buff-test-* directory");

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(read, label) {
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) { const value = read(); if (value) return value; await sleep(40); }
  throw Error("Timed out: " + label);
}
const client = new Client(endpoint), rooms = new Set(), tokens = Array.from({length:3}, () => "mt1_" + randomBytes(32).toString("hex"));
async function join(index, roomId) {
  const options = {guestToken:tokens[index], worldVersion:1, templeVersion:1, atlasVersion:1};
  const room = roomId ? await client.joinById(roomId, options) : await client.create("my_room", options);
  rooms.add(room);
  const messages = [];
  room.onMessage("*", (type,data) => messages.push({type,data}));
  const me = () => room.state?.players?.get(room.sessionId);
  await waitFor(() => me()?.persistent, "join");
  return {room, me, event:(type, where = () => true) => messages.find(e => e.type === type && where(e.data))?.data};
}
try {
  // Legacy character written only into the disposable test directory.
  const id = createHash("sha256").update(tokens[0]).digest("hex");
  await writeFile(path.join(directory,id+".json"),JSON.stringify({version:1,id,name:"นักเดินทาง",level:1,experience:31,pkKills:0,pkDeaths:0,x:0,y:0,z:0,hp:30,updatedAt:new Date().toISOString()}),{flag:"wx"});
  const a = await join(0), b = await join(1,a.room.roomId), c = await join(2,a.room.roomId);
  assert.equal(a.me().pathId,""); assert.equal(a.me().experience,31);
  a.room.send("select_build",{path:"sentinel",ancestry:"woodland",gold:5000});
  await waitFor(() => a.event("command_rejected",e=>e.reason==="invalid_build"),"forged selection");
  a.room.send("select_build",{path:"sentinel",ancestry:"woodland"});
  b.room.send("select_build",{path:"mender",ancestry:"shrine"});
  await waitFor(() => a.me().pathId==="sentinel" && b.me().pathId==="mender","build selection");
  a.room.send("party_invite",{targetId:b.room.sessionId});
  const invite = await waitFor(() => b.event("party_invitation"),"party invite");
  b.room.send("party_accept",{inviteId:invite.inviteId});
  await waitFor(() => a.event("party_state",e=>e.members.length===2),"party formed");
  a.room.send("cast_class_skill",{});
  await waitFor(() => a.me().def===36 && b.me().def===36,"ward on both party members");
  assert.equal(c.me().def,30); assert.ok(a.me().stamina < a.me().maxStamina);
  const hp = a.me().hp;
  b.room.send("cast_class_skill",{});
  await waitFor(() => a.me().hp >= hp + 24,"party heal");
  const readyAt = a.me().classSkillReadyAt;
  await a.room.leave(); rooms.delete(a.room);
  await sleep(400);
  const back = await join(0,b.room.roomId);
  assert.equal(back.me().pathId,"sentinel"); assert.equal(back.me().ancestryId,"woodland");
  assert.equal(back.me().def,30); assert.equal(back.me().experience,31);
  assert.equal(back.me().classSkillReadyAt,readyAt);
  back.room.send("cast_class_skill",{});
  await waitFor(() => back.event("command_rejected",e=>e.reason==="class_skill_cooldown"),"cooldown after rejoin");
  console.log("PASS: legacy save, chosen path and ancestry, team ward/heal, outsider isolation, cooldown after rejoin");
} finally { for(const room of rooms) await room.leave().catch(()=>{}); }
