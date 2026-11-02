import test from "node:test";
import assert from "node:assert/strict";
import {groundSample,ridgeTerrain as t,terrainRayClear,RIDGE_PASS} from "./GroundTerrain.js";
import {WORLD_MAPS,groundAt,isSafeWorldPoint,provinceShotClear} from "./WorldMaps.js";
import {checkWarp} from "./WarpRules.js";
const map=WORLD_MAPS[RIDGE_PASS],y=(x:number,z:number)=>groundSample(t,x,z).height;
const p=(x:number,z:number,above=0)=>({x,z,y:y(x,z)+above});

test("both tiers have a center ramp and a second walkable approach in both directions",()=>{
  assert.equal(y(0,76),0);assert.equal(y(0,54),1.5);assert.equal(y(0,0),3);assert.equal(y(0,-24),4.5);assert.equal(y(0,-52),6);
  for(const [x,lo,hi] of [[0,66,42],[-95,66,42],[0,-12,-36],[95,-12,-36]]){
    for(const direction of [1,-1])for(let i=0;i<=48;i++){
      const z=direction>0?lo-i/2:hi+i/2;
      assert.ok(isSafeWorldPoint(map,p(x,z)));assert.ok(groundSample(t,x,z).grade<.14);
    }
  }
  for(const z of [43,-34])assert.ok(!isSafeWorldPoint(map,p(45,z)));
  assert.ok(!isSafeWorldPoint(map,p(0,54,1)));assert.equal(groundAt("river_watch",0,54),0);
});
test("terrain ray intersects the lip, supports visible high/low shots, and excludes underground rays",()=>{
  for(const [a,b,visible] of [[p(40,41,1.55),p(40,49,1),true],[p(40,49,1.55),p(40,41,1),true],
    [p(40,36,1.55),p(40,49,1),false],[p(40,49,1.55),p(40,36,1),false],
    [p(0,65,1),p(0,43,1),true],[p(0,64,-.5),p(0,50,1),false]] as const){
    assert.equal(terrainRayClear(t,a,b),visible);assert.equal(provinceShotClear(map,a,b),visible);
  }
  // Two points in one non-coplanar quad can be below its shared diagonal ridge.
  const saddle={xs:[0,10],zs:[0,10],heights:[[3,0],[0,3]],maxGrade:1};
  assert.equal(terrainRayClear(saddle,{x:9,z:1,y:2},{x:1,z:9,y:2}),false);
});
test("both world portals resolve at matching ground elevation; the original leveling shortcut stays open",()=>{
  assert.ok(WORLD_MAPS.hex_ridge.portals.some(p=>p.targetMapId==="naga_cavern"));
  assert.deepEqual(map.portals.map(p=>p.targetMapId),["hex_ridge","naga_cavern"]);
  for(const source of [map,WORLD_MAPS.hex_ridge,WORLD_MAPS.naga_cavern]){
    for(const portal of source.portals.filter(p=>p.targetMapId===RIDGE_PASS || source===map)){
      const ctx={mapId:source.id,position:{x:portal.x,z:portal.z,y:portal.groundY??0},alive:true,flying:false,climbing:false,dashing:false,changingHeight:false,lastCombatMs:-Infinity,lastWarpMs:-Infinity,nowMs:10000};
      assert.ok(checkWarp({portalId:portal.id},ctx).ok);
      if(ctx.position.y===6)assert.ok(!checkWarp({portalId:portal.id},{...ctx,position:{...ctx.position,y:0}}).ok);
    }
  }
});
