import test from "node:test";
import assert from "node:assert/strict";
import {
  MONSTER_NAV, MONSTER_WALLS,
  isMonsterFree, isMonsterSegmentClear,
  planMonsterRRT, smoothMonsterPath, MonsterRRTNavigator, distanceXZ,
} from "./MonsterRRT.js";

const near=(a:number,b:number,tolerance=1e-5)=>Math.abs(a-b)<tolerance;

test("Direct unobstructed paths need no RRT tree expansion",()=>{
  const start={x:1.1,z:10.4},goal={x:4,z:10};
  const path=planMonsterRRT(start,goal);
  assert.ok(path.found);
  assert.ok(path.direct);
  assert.equal(path.iterations,0);
  assert.deepEqual(path.path,[start,goal]);
});

test("RRT from RRT-Game-Lab adapts to X/Z and navigates around the watchwall",()=>{
  const start={x:6,z:4},goal={x:11,z:4};
  assert.equal(isMonsterSegmentClear(start,goal),false,
    "the direct segment must cross the wall");
  for(const seed of [2,11,71,91,155,991,2026]){
    const result=planMonsterRRT(start,goal,{seed,iterations:MONSTER_NAV.iterations});
    assert.ok(result.found,
      "RRT must find walkable route from both sides; seed="+seed+
      " nodes="+result.nodes+" iterations="+result.iterations);
    assert.ok(!result.direct);
    assert.ok(result.path.length>=3);
    assert.deepEqual(result.path[0],start);
    assert.deepEqual(result.path.at(-1),goal);
    assert.ok(result.path.some(p=>p.z>8.3||p.z<-.3),
      "route must go around an end of the solid wall");
    for(let k=1;k<result.path.length;k++){
      assert.ok(isMonsterSegmentClear(result.path[k-1],result.path[k]),
        "RRT segment "+k+" crosses the wall: "+JSON.stringify(result.path));
    }
  }
});

test("Unreachable or forged out-of-world goals never bypass wall physics",()=>{
  for(const goal of [
    {x:8,z:4}, {x:250,z:10}, {x:Number.NaN,z:10},
  ]){
    const result=planMonsterRRT({x:6,z:4},goal,{iterations:100});
    assert.equal(result.found,false);
    assert.equal(result.path.length,0);
  }
  assert.equal(isMonsterFree({x:8,z:4}),false);
  assert.equal(isMonsterFree({x:6,z:4}),true);
  assert.equal(MONSTER_WALLS.length,1);
});

test("RRT smoothing cannot cut through wall just to shorten route",()=>{
  const start={x:6,z:4},goal={x:11,z:4};
  const points=[start,{x:6,z:9},{x:10,z:9},goal];
  const smoothed=smoothMonsterPath(points);
  assert.ok(smoothed.length>=3);
  assert.deepEqual(smoothed[0],start);
  assert.deepEqual(smoothed.at(-1),goal);
  for(let i=1;i<smoothed.length;i++){
    assert.ok(isMonsterSegmentClear(smoothed[i-1],smoothed[i]));
  }
});

test("Cached navigation follows RRT waypoints without changing tick movement",()=>{
  const start={x:6,z:4},goal={x:11,z:4};
  const nav=new MonsterRRTNavigator();
  let position={...start};
  let elapsed=0,points=0,crossed=false;
  // The room moves a monster at the existing chase speed, 20Hz.
  for(let i=0;i<900;i++){
    const next=nav.nextWaypoint(position,goal,elapsed,"chase:player-1");
    if(next){
      const d=distanceXZ(position,next);
      const step=Math.min(d,1.9/20);
      const newPos={
        x:position.x+(next.x-position.x)*step/d,
        z:position.z+(next.z-position.z)*step/d,
      };
      assert.ok(isMonsterSegmentClear(position,newPos));
      assert.ok(distanceXZ(position,newPos)<=1.9/20+1e-8);
      position=newPos;
      points++;
      if(position.x>8.7)crossed=true;
    }
    elapsed+=50;
    if(distanceXZ(position,goal)<0.2)break;
  }
  assert.ok(points>0);
  assert.ok(crossed,"monster crossed to opposite side, around wall");
  assert.ok(distanceXZ(position,goal)<0.2,
    "monster must eventually reach destination without wall tunneling: "+
      JSON.stringify(position));
});

test("RRT navigation gives up safely when goal is invalid",()=>{
  const nav=new MonsterRRTNavigator();
  assert.equal(nav.nextWaypoint({x:1,z:1},{x:8,z:4},0,"chase:a"),null);
  assert.ok(near(MONSTER_NAV.replanMs,1300));
  nav.clear();
  assert.equal(nav.nextWaypoint({x:1,z:1},{x:1,z:1},0,"chase:a"),null);
});
