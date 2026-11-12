import test from "node:test";
import assert from "node:assert/strict";
import {
  MONSTER_NAV, MONSTER_WALLS,
  isMonsterFree, isMonsterSegmentClear,
  planMonsterRRT, smoothMonsterPath, MonsterRRTNavigator, distanceXZ,
} from "./MonsterRRT.js";
import { waterDepthAt, waterTerrain } from "./GroundTerrain.js";
import { monsterHabitatGoal, monsterHabitatHeight, monsterHabitatSegmentClear } from "./MonsterHabitat.js";
import { WORLD_MAPS, type WorldMapDefinition } from "./WorldMaps.js";

const near=(a:number,b:number,tolerance=1e-5)=>Math.abs(a-b)<tolerance;

test("land routes detour around water and aquatic routes stop at the shore",()=>{
  const layout:WorldMapDefinition={
    id:"test_pool",name:"Test pool",bounds:{minX:0,maxX:12,minZ:0,maxZ:12},
    spawn:{x:2,y:0,z:6},obstacles:[],portals:[],water:[{x:4,z:2,width:4,length:8}],
  };
  const map={...layout,...waterTerrain(layout)};
  const start={x:2,z:6},goal={x:10,z:6},inWater={x:6,z:6};
  const land=(from:typeof start,to:typeof start)=>monsterHabitatSegmentClear(map,"land",from,to);
  const water=(from:typeof start,to:typeof start)=>monsterHabitatSegmentClear(map,"water",from,to);
  assert.equal(land(start,goal),false);
  const route=planMonsterRRT(start,goal,{seed:71,bounds:map.bounds,obstacles:[],canTraverse:land});
  assert.equal(route.found,true);
  assert.equal(route.direct,false);
  for(let i=1;i<route.path.length;i++)assert.ok(land(route.path[i-1],route.path[i]));
  assert.equal(water(inWater,start),false);
  const bank=monsterHabitatGoal(map,"water",inWater,start);
  assert.ok(bank.x<inWater.x && bank.x>start.x);
  assert.ok(water(inWater,bank));
});

test("land monsters can cross the market bridge on its deck and cannot climb the side",t=>{
  const map=WORLD_MAPS.ritual_village,bridge=map.walkBridges?.[0];
  if(!bridge)return t.skip("world expansion disabled");
  const start={x:bridge.x[0],z:bridge.z},end={x:bridge.x[3],z:bridge.z};
  const deck={x:(bridge.x[1]+bridge.x[2])/2,z:bridge.z};
  assert.ok(waterDepthAt(map,deck.x,deck.z)>0);
  assert.equal(monsterHabitatHeight(map,"land",deck),bridge.height);
  assert.ok(monsterHabitatSegmentClear(map,"land",start,end));
  assert.equal(monsterHabitatSegmentClear(map,"land",deck,{x:deck.x,z:deck.z+bridge.width}),false);
});

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

test("Colyseus Schema-like getter coordinates are converted into ordinary waypoints",()=>{
  // Colyseus Schema 5 stores serializable values behind nonenumerable getters:
  // spreading an instance copies internal symbols, NOT public x and z.
  function schemaLike(x:number,z:number):{x:number;z:number} {
    const point={};
    Object.defineProperties(point,{
      x:{get:()=>x,enumerable:false},
      z:{get:()=>z,enumerable:false},
    });
    return point as {x:number;z:number};
  }
  const from=schemaLike(2.2,10.4);
  const goal=schemaLike(5,7);
  assert.deepEqual(Object.keys(from),[]);
  const planned=planMonsterRRT(from,goal);
  assert.ok(planned.found && planned.direct);
  assert.deepEqual(planned.path,[{x:2.2,z:10.4},{x:5,z:7}]);

  const navigator=new MonsterRRTNavigator();
  const next=navigator.nextWaypoint(from,goal,2000,"chase:owner");
  assert.deepEqual(next,{x:5,z:7});
  assert.ok(Number.isFinite(next?.x) && Number.isFinite(next?.z));
});
