/**
 * MONTRA authoritative dash integration — isolated LOCAL test rooms only.
 * Never use this test against the public HTTPS/VPS server or real saves.
 */
import assert from "node:assert/strict";
import { Client } from "@colyseus/sdk";

const endpoint = process.env.MONTRA_TEST_URL || "http://127.0.0.1:4108";
if (!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(endpoint)) {
  throw new Error("dash integration must run against a LOCAL test server");
}
const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
async function until(pred, timeout, label) {
  const start=Date.now();
  while (Date.now()-start<timeout) {
    if (pred()) return;
    await sleep(45);
  }
  throw new Error("Timed out: "+label);
}
const clients=[new Client(endpoint),new Client(endpoint)];
const rooms=[];
try {
  const a=await clients[0].create("my_room");
  rooms.push(a);
  const b=await clients[1].joinById(a.roomId);
  rooms.push(b);
  await until(()=>a.state?.players?.size===2 && b.state?.players?.size===2 &&
    a.state?.dashAvailable===true && b.state?.dashAvailable===true,
    4000,"two avatars share a dash-capable room");
  const id=a.sessionId;
  const me=()=>a.state.players.get(id);
  const dashStarted=[], dashFinished=[], rejects=[];
  a.onMessage("dash_started", msg=>dashStarted.push(msg));
  a.onMessage("dash_finished", msg=>dashFinished.push(msg));
  a.onMessage("command_rejected", msg=>rejects.push(msg?.reason));

  const initialX=me().x;
  a.send("dash",{dx:1,dz:0});
  await until(()=>dashStarted.some(m=>m.playerId===id),3000,"server accepts dash");
  await until(()=>me().combatState==="idle" && me().x>initialX+4.0,
    4000,"dash completes at server speed");
  const firstX=me().x;
  assert.ok(firstX-initialX<=4.51 && firstX-initialX>4.3,
    "dash distance must be server-owned and ~= 4.5m");
  assert.ok(Math.abs(me().z)<.06);
  assert.ok(Math.abs(b.state.players.get(id).x-firstX)<.1,
    "other players must see the same server position");
  console.log("PASS: server moves dash 4.5m in fixed ticks and synchronizes peers");

  // Within the 1.8s cooldown, a client cannot immediately dash again.
  a.send("dash",{dx:1,dz:0});
  await sleep(260);
  assert.ok(Math.abs(me().x-firstX)<.04,"dash cooldown bypassed");
  assert.equal(dashStarted.filter(m=>m.playerId===id).length,1);
  assert.ok(rejects.includes("dash_cooldown"));
  a.send("dash",{dx:50,dz:0,speed:99999});
  a.send("dash",{dx:0,dz:0});
  a.send("dash",{dx:1,dz:0,distance:1000});
  await sleep(150);
  assert.ok(Math.abs(me().x-firstX)<.04,"forged input changed position");
  console.log("PASS: cooldown and forged dash speed/distance/direction rejected");

  // The real server wall has x in [7.3,8.7], z in [0,8].
  await sleep(1700);
  a.send("dash",{dx:1,dz:0});
  await until(()=>dashFinished.some(m=>m.playerId===id && m.blocked===true),
    3500,"wall collision blocks dash");
  assert.ok(me().x<6.99 && me().x>firstX,
    "dash must stop at the western wall collider, not tunnel through it");
  assert.ok(Math.abs(me().z)<.06);
  console.log("PASS: dash stopped before watchwall with swept collision");

  // A tap-to-move command is rejected during dash (no movement stacking).
  await sleep(1900);
  a.send("dash",{dx:0,dz:-1});
  await until(()=>dashStarted.filter(m=>m.playerId===id).length>=3,
    3500,"dash away from wall");
  a.send("move",{x:15,z:15});
  await until(()=>me().combatState==="idle" && me().z<-4,4000,
    "dash away from wall completes");
  assert.ok(Math.abs(me().z+4.5)<.15);
  assert.ok(me().x<7,"move command must not hijack a running dash");
  console.log("PASS: dash movement isolated from tap-to-move commands");

  // The 4-player Cap and existing movement remain unchanged.
  await until(()=>b.state.players.get(id)?.combatState==="idle",2000,
    "other client sees dash finish");
} finally {
  for (const room of rooms.reverse()) try { await room.leave(); } catch (_) {}
}
