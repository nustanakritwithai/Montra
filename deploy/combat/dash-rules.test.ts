import assert from "node:assert/strict";
import { test } from "node:test";
import { RULES } from "./GameRules.js";
import { FORT, isOnTop, touchesWallBody } from "./HeightRules.js";
import { parseDashCommand, advanceDash, DASH_SWEEP_STEP } from "./DashRules.js";

test("dash: exact direction payload rejects speed, range, height and invalid numbers", () => {
  assert.deepEqual(parseDashCommand({dx: 1, dz: 0}), {dx:1,dz:0});
  assert.deepEqual(parseDashCommand({dx: 0, dz: -1}), {dx:0,dz:-1});
  const d = parseDashCommand({dx:Math.SQRT1_2,dz:Math.SQRT1_2});
  assert.ok(d && Math.abs(Math.hypot(d.dx,d.dz)-1) < 1e-10);
  for (const message of [
    null, {}, {dx:0,dz:0}, {dx:2,dz:0}, {dx:0.5,dz:0},
    {dx:Infinity,dz:0}, {dx:NaN,dz:1}, {dx:"1",dz:0},
    {dx:1,dz:0,speed:1000}, {dx:1,dz:0,distance:200},
    {dx:1,dz:0,y:4}, {dx:1}, {dz:1}, [],
  ]) assert.equal(parseDashCommand(message), null);
});

test("dash: fixed 20Hz steps honor server speed and total range", () => {
  const direction = {dx:1,dz:0};
  let pos = {x:0,z:-5};
  let cumulative=0, last=0;
  while (cumulative < RULES.dashDistance - 1e-6) {
    const result = advanceDash(pos, direction,
      Math.min(RULES.dashSpeed / RULES.tickRate, RULES.dashDistance - cumulative),
      () => true);
    assert.ok(result.moved > 0 && result.moved <= RULES.dashSpeed / RULES.tickRate+1e-8);
    assert.ok(result.x >= last);
    cumulative += result.moved;
    pos = {x:result.x,z:result.z};
    last = pos.x;
    assert.ok(cumulative < RULES.dashDistance+0.001);
  }
  assert.ok(Math.abs(cumulative - RULES.dashDistance)<1e-5);
  assert.ok(Math.abs(pos.x - RULES.dashDistance)<1e-5);
  assert.ok(DASH_SWEEP_STEP<=0.1);
});

test("dash: swept collisions stop before wall instead of tunnelling", () => {
  const from = {x:5.5,z:4};
  const d = {dx:1,dz:0};
  const wall = advanceDash(from,d,4.5,(x,z)=>!touchesWallBody(x,z));
  assert.equal(wall.blocked,true);
  assert.ok(wall.x < FORT.x - FORT.width/2 - FORT.capsuleRadius);
  assert.ok(wall.moved > 0);
  assert.equal(wall.z,4);
  assert.equal(touchesWallBody(wall.x,wall.z),false);
});

test("dash: running along platform ends at its walkable edge", () => {
  const from = {x:FORT.x,z:1.1};
  const a=advanceDash(from,{dx:0,dz:-1},4.5,(x,z)=>isOnTop(x,z));
  assert.equal(a.blocked,true);
  assert.ok(isOnTop(a.x,a.z));
  assert.ok(!isOnTop(a.x,a.z-.11));
});

test("dash: clamps at map edge and never exceeds accepted movement", () => {
  const a=advanceDash({x:19,z:-3},{dx:1,dz:0},10,()=>true);
  assert.equal(a.blocked,true);
  assert.ok(a.x<=RULES.mapLimit);
  assert.ok(a.moved<=1.001);
  assert.deepEqual(advanceDash({x:0,z:0},{dx:1,dz:0},Infinity,()=>true),
    {x:0,z:0,moved:0,blocked:true});
});
