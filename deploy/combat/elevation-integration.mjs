/**
 * MONTRA Elevation Alpha V0.1.9 — four real Colyseus clients.
 * Runs in a fresh isolated my_room. No production room is touched.
 * Validates server Y, ladder checks, collision, 3D LOS, elevated shots,
 * cross-height melee rejection, companion altitude and climb down.
 */
import assert from "node:assert/strict";
import { Client } from "@colyseus/sdk";

const endpoint=process.env.MONTRA_TEST_URL||"http://127.0.0.1:4108";
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,timeout,label) {
  const since=Date.now();
  while(Date.now()-since<timeout) {
    if(check())return;
    await sleep(70);
  }
  throw Error("Timed out: "+label);
}
const clients=Array.from({length:4},()=>new Client(endpoint));
const rooms=[];
try {
  rooms.push(await clients[0].create("my_room"));
  for(let i=1;i<4;i++)rooms.push(await clients[i].joinById(rooms[0].roomId));
  const [a,b,c,d]=rooms;
  const [aId,bId,cId,dId]=rooms.map(r=>r.sessionId);
  const p=(r,id)=>r.state?.players?.get(id);
  const aP=()=>p(a,aId),bP=()=>p(a,bId),cP=()=>p(a,cId);
  const fort=()=>a.state?.fortification;
  const rejected={};
  const shotHits=[];
  const firstShotEvents=[];
  const finishEvents=[];
  for(const [i,r] of rooms.entries()) {
    rejected[i]=[];
    r.onMessage("command_rejected", m=>rejected[i].push(m.reason));
    r.onMessage("ranged_hit", m=>shotHits.push({i,...m}));
    r.onMessage("climb_finished", m=>finishEvents.push(m));
    for(const type of [
      "combat_hit","combat_notice","pvp_hit","pvp_kill","monster_hit",
      "player_down","player_respawn","monster_respawn",
      "summon_hit","summon_spawn","summon_despawn","climb_started",
    ])r.onMessage(type,()=>{});
  }

  await until(()=>rooms.every(r=>r.state?.players?.size===4 &&
    Number(r.state?.fortification?.height)===4),6500,"four players and synchronized wall");
  assert.ok(rooms.every(r=>r.roomId===a.roomId));
  assert.ok(Math.abs(fort().ladderFootX-6.1)<.005, "Colyseus float32 ladder sync");
  assert.equal(fort().x,8);
  console.log("PASS: four players share authoritative 4m wall and ladder");

  // Browser can only send x/z destinations, never y, teleport or climb speed.
  a.send("move",{x:8,z:3,y:400});
  a.send("climb",{structureId:"watchwall-1",direction:"up",speed:9999});
  await sleep(280);
  assert.equal(aP().y,0);
  assert.equal(aP().x,0);
  a.send("climb",{structureId:"watchwall-1",direction:"up"});
  await sleep(170);
  assert.equal(aP().y,0); // Cannot climb from far from ladder foot.
  console.log("PASS: client-forged height, speed and remote climb denied");

  // B walks around the southern end of the wall to its east side.
  // B's first waypoint passes below z=0; this is a legal ground route.
  b.send("move",{x:10,z:-1.2});
  await until(()=>Math.hypot(bP().x-10,bP().z+1.2)<0.12,
    5800,"move east around fortification");
  b.send("move",{x:14,z:3});
  await until(()=>Math.hypot(bP().x-14,bP().z-3)<0.12,
    4400,"move to east-side shooting target");

  // From the WEST ground side, the wall must stop any line of fire east.
  const beforeB=bP().hp;
  c.send("shoot",{targetId:bId,damage:1000000,y:500});
  await sleep(250);
  assert.equal(bP().hp,beforeB,"forged shooting payload bypassed parser");
  await sleep(450);
  c.send("shoot",{targetId:bId});
  await until(()=>rejected[2].includes("shot_blocked"),2500,
    "solid wall blocks ground projectile");
  assert.equal(bP().hp,beforeB);
  console.log("PASS: wall blocks ground-level shots; forged damage/Y rejected");

  // A must walk to the foot of the ladder and be near enough to climb.
  a.send("move",{x:fort().ladderFootX,z:fort().ladderFootZ});
  await until(()=>Math.hypot(aP().x-fort().ladderFootX,
    aP().z-fort().ladderFootZ)<1.15,4500,"walk to ladder foot");
  a.send("climb",{structureId:"watchwall-1",direction:"up"});
  await until(()=>aP().y>0.2 && aP().y<4,2500,"begin server climb");
  const yBefore=aP().y;
  await sleep(200);
  assert.ok(aP().y>yBefore && aP().y-yBefore<0.65,
    "player climbed faster than 2.3 units/s");
  await until(()=>rooms.every(r=>Math.abs(p(r,aId)?.y-4)<.025),
    4500,"top height synchronized");
  assert.ok(rooms.every(r=>Math.abs(p(r,aId).x-8)<.1));
  console.log("PASS: ladder climb y=0 -> y=4 speed-capped and synchronized");

  // Standing on top cannot teleport to the ground by tapping a distant point.
  a.send("move",{x:0,z:0});
  await sleep(260);
  assert.ok(Math.abs(aP().y-4)<.01);
  a.send("move",{x:8,z:4.5});
  await until(()=>Math.abs(aP().z-4.5)<.13,3000,"walk along wall top");
  assert.equal(aP().y,4);
  console.log("PASS: top is walkable, ground shortcuts rejected");

  // Vertical separation excludes melee even if X/Z is near a lower player.
  a.send("attack",{targetId:bId});
  await sleep(250);
  assert.equal(bP().hp,beforeB);
  assert.equal(aP().targetId,"");
  console.log("PASS: elevated attacker cannot melee through vertical gap");

  // Elevated muzzle clears wall parapet and damages the same enemy that
  // ground shots could not reach. No client chooses damage or Y.
  a.send("shoot",{targetId:bId});
  await until(()=>bP().hp===beforeB-10 &&
    rooms.every(r=>p(r,bId)?.hp===beforeB-10),3500,
    "elevated PvP ranged hit");
  await until(()=>shotHits.some(h=>h.targetId===bId) &&
    shotHits.filter(h=>h.targetId===bId).length===4,3000,
    "four clients observe ranged projectile");
  assert.equal(aP().pkKills,0);
  console.log("PASS: elevated 3D shot damages another player by server-defined 10HP");

  await sleep(1250);
  const initialMonsterHp=a.state.monster.hp;
  a.send("shoot",{targetId:"possessed-1"});
  await until(()=>a.state.monster.hp===initialMonsterHp-10,2600,
    "shoot monster from elevated wall");
  assert.ok(rooms.every(r=>r.state.monster.hp===a.state.monster.hp));
  console.log("PASS: elevated shot also works against shared monster AI");

  // A's summoned guardian must appear at the current owner height.
  a.send("summon",{});
  await until(()=>rooms.every(r=>r.state.summons?.has(aId)),3500,
    "summon from upper level");
  assert.ok(rooms.every(r=>Math.abs(r.state.summons.get(aId).y-4)<.1));
  console.log("PASS: summoned NPC begins at owner elevation");

  // Walk back to top ladder and descend via authorized request only.
  a.send("move",{x:fort().ladderTopX,z:fort().ladderTopZ});
  await until(()=>Math.hypot(aP().x-fort().ladderTopX,
    aP().z-fort().ladderTopZ)<1.1,3000,"return to upper ladder");
  a.send("climb",{structureId:"watchwall-1",direction:"down"});
  await until(()=>rooms.every(r=>Math.abs(p(r,aId)?.y)<.025),4900,
    "authorized descent");
  assert.ok(finishEvents.some(e=>e.playerId===aId&&e.height===0));
  await until(()=>Math.abs(a.state.summons.get(aId)?.y)<1.1,
    3500,"spirit follows owner down");
  console.log("PASS: legal ladder descent and guardian altitude follow synchronized");
  console.log("PASS: MONTRA Elevation 4-player integration complete");
} catch(e) {
  console.error("FAIL: MONTRA Elevation integration:",e);
  console.error("DEBUG",rooms.map(r=>({
    roomId:r.roomId,players:r.state?.players?.size,
    me:r.state?.players?.get(r.sessionId)?.toJSON?.(),
    monster:r.state?.monster?.toJSON?.()
  })));
  process.exitCode=1;
} finally {
  for(const r of rooms.reverse()){
    try {await r.leave();}catch(_){}
  }
}
