import test from "node:test";
import assert from "node:assert/strict";
import {
  FORT, distance3d, isOnGround, isOnPlatform, isOnTop, touchesWallBody,
  parseClimbRequest, progressClimb, wallBlocksShot,
} from "./HeightRules.js";

test("Only ladder up/down commands with exact structure ID are valid", () => {
  assert.deepEqual(parseClimbRequest({structureId:"watchwall-1",direction:"up"}),
    {structureId:FORT.id,direction:"up"});
  assert.deepEqual(parseClimbRequest({structureId:"watchwall-1",direction:"down"}),
    {structureId:FORT.id,direction:"down"});
  for (const bad of [
    null, [], {}, 1, "up",
    {direction:"up"},
    {structureId:FORT.id,direction:"fly"},
    {structureId:"other-wall",direction:"up"},
    {structureId:FORT.id,direction:"up",y:100},
    {structureId:FORT.id,direction:"up",speed:999},
    {structureId:FORT.id,direction:"up",damage:1000},
  ]) assert.equal(parseClimbRequest(bad),null);
});

test("Climb speed is server-limited and completes at exact top height", () => {
  let p={x:FORT.ladderFootX,y:0,z:FORT.ladderFootZ};
  const top={x:FORT.ladderTopX,y:FORT.height,z:FORT.ladderTopZ};
  const first=progressClimb(p,top,1/20);
  assert.ok(distance3d(p,first.point)<=FORT.climbSpeed/20+1e-8);
  assert.ok(first.point.y>0 && first.point.y<FORT.height);
  for(let i=0;i<150;i++) p=progressClimb(p,top,1/20).point;
  assert.deepEqual(p,top);
  assert.ok(isOnPlatform(p.y));
  assert.ok(isOnGround(0));
});

test("Solid wall blocks traversing ground, but top is a valid standing surface", () => {
  assert.ok(touchesWallBody(FORT.x, FORT.z));
  assert.equal(touchesWallBody(0,0),false);
  assert.ok(isOnTop(FORT.x,FORT.z));
  assert.equal(isOnTop(FORT.x+2,FORT.z),false);
  assert.equal(isOnTop(0,0),false);
});

test("Ground arrows hit stone wall, elevated arrows pass above parapet", () => {
  const groundWest={x:5,y:1.55,z:3};
  const groundEast={x:11,y:1,z:3};
  assert.equal(wallBlocksShot(groundWest,groundEast),true);
  assert.equal(wallBlocksShot(groundEast,groundWest),true);
  const elevated={x:FORT.x,y:FORT.height+FORT.shootOriginHeight,z:3};
  const groundTarget={x:1,y:1,z:3};
  assert.equal(wallBlocksShot(elevated,groundTarget),false);
  assert.equal(wallBlocksShot(groundTarget,elevated),false);
});

test("Vertical difference contributes to real combat range", () => {
  const ground={x:1,y:0,z:3}, top={x:1,y:FORT.height,z:3};
  assert.equal(distance3d(ground,top),FORT.height);
  assert.ok(distance3d(ground,top)>2.8);
});
