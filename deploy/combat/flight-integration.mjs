/**
 * MONTRA V0.2.5 — isolated Colyseus 3D flight integration.
 * Runs only on a LOCAL test server. Never run against production players.
 */
import assert from "node:assert/strict";
import { Client } from "@colyseus/sdk";

const url = process.env.MONTRA_TEST_URL || "http://127.0.0.1:4108";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)) {
  throw new Error("Flight integration is LOCAL-TEST ONLY");
}
const sleep = ms => new Promise(done => setTimeout(done, ms));
async function until(check, ms, label) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (check()) return;
    await sleep(50);
  }
  throw new Error("Timed out: " + label);
}
const rooms = [];
try {
  const a = await new Client(url).create("my_room");
  rooms.push(a);
  const b = await new Client(url).joinById(a.roomId);
  rooms.push(b);
  const id = a.sessionId, me = () => a.state?.players?.get(id);
  const rejects = [];
  a.onMessage("command_rejected", notice => rejects.push(notice?.reason));
  const started = [], finished = [];
  a.onMessage("flight_started", event => started.push(event));
  a.onMessage("flight_finished", event => finished.push(event));
  await until(() => a.state?.flightAvailable === true &&
    b.state?.flightAvailable === true && me()?.y === 0 &&
    b.state?.players?.size === 2, 4500, "flight-capable room with two clients");
  assert.equal(me().flying, false);
  // Neither height nor speed can be provided by the browser.
  a.send("fly", {height: 99, speed: 50000});
  await until(()=>rejects.includes("invalid_flight"),2400,"forged flight rejected");
  assert.equal(me().y,0);
  // Room rate-limits rejection notices to 1 per 500ms.
  await sleep(570);

  a.send("fly", {});
  await until(() => me()?.y > 0.09 && me()?.y < 6, 2600,
    "server begins flight ascent");
  const before = me().y;
  // A move attempted during ascent MUST NOT be queued for later.
  a.send("move", {x: 19, z: 18});
  await sleep(160);
  assert.ok(me().y > before && me().y - before <= 1.2,
    "flight rose faster than 4 units/s");
  assert.equal(me().x, 0);
  assert.ok(rejects.includes("flight_in_progress"));
  await until(() => me()?.flying === true && Math.abs(me().y - 6) < 0.02 &&
    Math.abs(b.state.players.get(id)?.y - 6) < 0.02, 3600,
    "6m flight synchronized to both clients");
  assert.ok(started.some(x => x.playerId === id && x.direction === "up"));
  assert.ok(finished.some(x => x.playerId === id && x.flying === true));
  console.log("PASS: server-owned 6m ascent at 4m/s, forged height rejected, replicated to peers");

  a.send("dash", {dx: 1, dz: 0});
  await until(()=>rejects.includes("flying"),2300,"no dash in flight");
  await sleep(570);
  a.send("climb", {structureId:"watchwall-1",direction:"up"});
  // Climb is also rejected while flying.
  await until(()=>rejects.filter(reason=>reason==="flying").length>=2,2500,
    "no ladder while flying");

  // Flying crosses the watchwall with a valid planar move at the SAME 6m height.
  a.send("move", {x:8,z:4.5});
  await until(() => Math.hypot(me()?.x - 8, me()?.z - 4.5) < 0.16,
    5400,"fly over watchwall");
  assert.equal(me().y,6);
  await until(() => Math.abs(b.state.players.get(id)?.x - 8)<0.2,
    2000,"other client sees flight path");
  a.send("fly", {});
  await until(() => !me()?.flying && Math.abs(me()?.y - 4)<.02,
    3000,"land on watchwall");
  assert.ok(finished.some(x => x.playerId === id && x.altitude === 4));
  console.log("PASS: free 6m flight over wall and safe landing on walkable 4m crest");

  a.send("move",{x:8,z:5.5});
  await until(()=>Math.abs(me()?.z - 5.5)<0.12,2500,"walk along wall crest");
  a.send("move",{x:6,z:5.5});
  await until(()=>rejects.includes("must_descend"),2300,
    "walking off wall still forbidden");
  assert.ok(me().x>7.45 && me().y===4);
  console.log("PASS: existing wall-top walking retained and cannot step off edge");

  // From wall, launch back to air and test an unsafe landing seam.
  a.send("fly",{});
  await until(()=>me()?.flying && Math.abs(me()?.y-6)<.02,
    2600,"launch from wall into air");
  a.send("move",{x:8.65,z:5.5});
  await until(()=>Math.abs(me()?.x - 8.65)<0.12,
    2600,"move above the wall's non-walkable side");
  a.send("fly",{});
  await until(()=>rejects.includes("landing_blocked"),2300,
    "cannot land inside solid wall collider");
  assert.equal(me().y,6);
  assert.equal(me().flying,true);
  a.send("move",{x:6,z:5.5});
  await until(()=>Math.abs(me()?.x - 6)<0.14,2900,
    "move away from solid wall seam");
  a.send("fly",{});
  await until(()=>!me()?.flying && Math.abs(me()?.y)<0.02,
    3400,"land safely on ground");
  assert.ok(Math.abs(b.state.players.get(id)?.y)<0.1);
  console.log("PASS: blocked seam landing denied; safe 0m descent and peer sync");
} finally {
  for (const room of rooms.reverse()) await room.leave().catch(() => {});
}
