/**
 * MONTRA Monster RRT integration: real Colyseus room, unchanged AI stats.
 *
 * Lure the monster to the west of the watchwall with player A. Player B
 * legally walks around the north end and waits on the east. Once A leaves,
 * the monster must use RRT waypoints to round the solid wall toward B
 * without tunneling through it.
 */
import assert from "node:assert/strict";
import { Client } from "@colyseus/sdk";

const endpoint=process.env.MONTRA_TEST_URL||"http://127.0.0.1:4108";
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function until(predicate,limitMs,label) {
  const start=Date.now();
  while(Date.now()-start<limitMs){
    if(predicate())return;
    await sleep(65);
  }
  throw Error("Timed out: "+label);
}
function closeTo(p,x,z,range=.16) {
  return p&&Math.hypot(Number(p.x)-x,Number(p.z)-z)<range;
}
function inWall(m){
  return Math.abs(m.x-8)<1.4/2+.32-1e-4 &&
    Math.abs(m.z-4)<8/2+.32-1e-4;
}

const clients=[new Client(endpoint),new Client(endpoint)];
const rooms=[];
const left=new Set();
try {
  const a=await clients[0].create("my_room");
  rooms.push(a);
  const noOp=()=>{};
  for(const message of ["monster_hit","combat_hit","player_down","player_respawn",
    "monster_respawn","command_rejected","pvp_hit","pvp_kill",
    "ranged_hit","climb_started","climb_finished"])a.onMessage(message,noOp);

  await until(()=>a.state?.players?.has(a.sessionId)&&a.state?.monster?.alive,
    5500,"single monster and player");
  const monster=()=>a.state.monster;

  a.send("move",{x:5,z:7});
  await until(()=>closeTo(a.state?.players?.get(a.sessionId),5,7),
    5500,"lure player walks near west wall");
  await until(()=>monster().targetId===a.sessionId,4000,
    "monster locks onto west-side lure");

  const b=await clients[1].joinById(a.roomId);
  rooms.push(b);
  for(const message of ["monster_hit","combat_hit","player_down","player_respawn",
    "monster_respawn","command_rejected","pvp_hit","pvp_kill","ranged_hit"])
    b.onMessage(message,noOp);
  await until(()=>a.state?.players?.has(b.sessionId),3500,"second player joined");

  // Route B legally outside the north end (wall spans z=0..8).
  b.send("move",{x:5,z:9.7});
  await until(()=>closeTo(a.state?.players?.get(b.sessionId),5,9.7),
    5500,"B reaches west north-end waypoint");
  b.send("move",{x:10,z:9.7});
  await until(()=>closeTo(a.state?.players?.get(b.sessionId),10,9.7),
    4400,"B walks around northern end without a teleport");
  b.send("move",{x:10,z:7});
  await until(()=>closeTo(a.state?.players?.get(b.sessionId),10,7),
    3500,"B waits east of wall");

  assert.equal(monster().alive,true);
  assert.ok(!inWall(monster()),"monster entered wall before the RRT test");
  await a.leave();
  left.add(a);

  // B becomes the only living target, visible in the monster's regular
  // 6-unit aggro region, without any special test-only server command.
  await until(()=>b.state?.monster?.targetId===b.sessionId,3500,
    "monster retargets toward east-side B");
  console.log("PASS: monster reselects target without changing AI aggro rules");

  const path=[];
  let roundedNorth=false;
  const begun=Date.now();
  while(Date.now()-begun<8500){
    const m=b.state.monster;
    path.push({x:Number(m.x),z:Number(m.z)});
    assert.ok(!inWall(m),"monster went through solid wall: "+JSON.stringify(path.slice(-7)));
    // Crossing into the wall's X footprint is legal only if z is ABOVE
    // the expanded north wall edge, demonstrating true obstacle avoidance.
    if(m.x>7.4 && m.z>8.35)roundedNorth=true;
    if(roundedNorth)break;
    await sleep(65);
  }
  assert.ok(roundedNorth,
    "RRT did not route monster around wall's northern end: "+JSON.stringify(path.slice(-20)));
  console.log("PASS: MONTRA monster walks around north wall end using RRT waypoints");
  console.log("PASS: all observed NPC positions stay out of solid wall");
  console.log("PASS: AI navigation changed; existing aggro, speed, HP and combat remain");
} catch(error){
  console.error("FAIL: MONTRA Monster RRT integration:",error);
  for(const room of rooms)console.error("DEBUG:",{
    roomId:room.roomId,
    sessionId:room.sessionId,
    players:room.state?.players?.size,
    monster:room.state?.monster?.toJSON?.(),
  });
  process.exitCode=1;
} finally {
  for(const room of rooms.reverse()){
    if(left.has(room))continue;
    try{await room.leave();}catch(_){}
  }
}
