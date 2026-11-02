import test from "node:test";
import assert from "node:assert/strict";
import {WORLD_MAPS,isSafeWorldPoint,isWorldSegmentClear,meleeHeightBlocked,groundAt,onMapGround,provinceShotClear} from "./WorldMaps.js";
import {groundSample} from "./GroundTerrain.js";
import {FORT} from "./HeightRules.js";
import {RIVER_CITY,riverNodes} from "./RiverCity.js";
import {CASTLE_ID,castleObjectives,forwardCamps} from "./CastlePilot.js";
import {Player,Monster} from "./schema/MyRoomState.js";
import {checkWarp} from "./WarpRules.js";
const ids=["ritual_village","forbidden_forest","bound_temple","mantra_capital","moon_pass","river_watch",RIVER_CITY,CASTLE_ID];
test("eight old maps gain walkable relief while preserving travel and the footprints of their original paths",()=>{
  for(const id of ids){
    const map=WORLD_MAPS[id],flat={...map,terrain:undefined},t=map.terrain!;
    assert.ok(t && map.reliefLabels,id);assert.ok(Math.max(...t.heights.flat())>1,id);
    for(let i=1;i<t.xs.length;i++)for(let j=1;j<t.zs.length;j++)for(const [u,v] of [[.75,.25],[.25,.75]]){
      assert.ok(groundSample(t,t.xs[i-1]+u*(t.xs[i]-t.xs[i-1]),t.zs[j-1]+v*(t.zs[j]-t.zs[j-1])).grade<=t.maxGrade,id);
    }
    for(const route of map.paths??[])for(let i=1;i<route.length;i++){
      const a=route[i-1],b=route[i],n=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z));
      for(let k=0;k<=n;k++){
        const x=a.x+(b.x-a.x)*k/n,z=a.z+(b.z-a.z)*k/n;
        assert.equal(isSafeWorldPoint(map,{x,y:groundAt(id,x,z),z}),isSafeWorldPoint(flat,{x,y:0,z}),id+" path");
      }
    }
    for(const p of map.portals){
      assert.equal(groundAt(id,p.x,p.z),0,p.id);
      assert.ok(checkWarp({portalId:p.id},{mapId:id,position:{x:p.x,y:0,z:p.z},alive:true,flying:false,climbing:false,dashing:false,changingHeight:false,lastCombatMs:-Infinity,lastWarpMs:-Infinity,nowMs:0}).ok,p.id);
    }
  }
});
test("replicated actors can fight at close range on relief, including a below-ground camp",()=>{
  for(const [id,x,z] of [["forbidden_forest",-33,-17],["forbidden_forest",-28,-55],["bound_temple",-27,-18]] as const){
    const p=new Player({mapId:id,x,z,y:groundAt(id,x,z)}),m=new Monster({mapId:id,x:x+.3,z,y:groundAt(id,x+.3,z)});
    assert.ok(isSafeWorldPoint(WORLD_MAPS[id],p));assert.ok(isWorldSegmentClear(id,p,m));assert.ok(isWorldSegmentClear(id,m,p));
  }
});
test("melee approach follows the court slope while gates and different wall layers still block attacks",()=>{
  const map=WORLD_MAPS[RIVER_CITY],feet=(x:number,z:number,layer=0)=>({mapId:map.id,x,z,y:groundAt(map.id,x,z)+layer});
  const low=feet(23,-76),high=feet(23,-64);
  assert.ok(high.y-low.y>2.8);assert.equal(meleeHeightBlocked(low,high,2.8),false);
  assert.ok(isWorldSegmentClear(map.id,feet(50,96,4),feet(51.5,96,4)));
  assert.ok(meleeHeightBlocked(feet(50,100.5),feet(50,96,4),2.8));
  assert.ok(isWorldSegmentClear(map.id,feet(0,100),feet(0,92)));
  assert.equal(isWorldSegmentClear(map.id,feet(0,100),feet(0,92),new Set(["G11"])),false);
});
test("solid foundations support stair feet, deck loops and independently closed gates",()=>{
  for(const id of ids){
    const map=WORLD_MAPS[id],r=map.strategic?.rampart;
    if(!r)continue;
    for(const s of r.stairs){
      assert.equal(groundAt(id,s.foot.x,s.foot.z),0);assert.ok(isSafeWorldPoint(map,{...s.foot,y:0}));
      assert.equal(groundAt(id,s.top.x,s.top.z),0);assert.ok(isSafeWorldPoint(map,{...s.top,y:r.height}));
    }
    for(const d of r.deck)for(const u of [.05,.5,.95])for(const v of [.05,.5,.95])assert.equal(groundAt(id,d.x+d.width*u,d.z+d.length*v),0);
    for(const g of r.gates){
      const b=g.box,x=b.x+b.width/2,z=b.z+b.length/2,alongX=b.width>b.length;
      const a={x:x+(alongX?0:5),z:z+(alongX?5:0),y:1.4},c={x:2*x-a.x,z:2*z-a.z,y:1.4};
      assert.ok(!provinceShotClear(map,a,c,new Set([g.id])),id+" "+g.id);
      assert.ok(isSafeWorldPoint(map,{x,z,y:4}),id+" crest "+g.id);
    }
  }
  assert.ok(isSafeWorldPoint(WORLD_MAPS.ritual_village,{x:FORT.ladderTopX,z:FORT.ladderTopZ,y:4}));
  assert.equal(groundAt("ritual_village",FORT.ladderFootX,FORT.ladderFootZ),0);
});
test("elevated victory and supply objectives, reinforcements and village roles remain reachable",()=>{
  for(const [id,nodes] of [[RIVER_CITY,Object.values(riverNodes)],[CASTLE_ID,[...castleObjectives,...forwardCamps]]] as const){
    for(const p of nodes){
      const y=groundAt(id,p.x,p.z),feet={mapId:id,x:p.x,z:p.z,y};
      assert.ok(onMapGround(feet));assert.ok(isSafeWorldPoint(WORLD_MAPS[id],feet),id+" "+p.x+","+p.z);
      assert.ok(!onMapGround({...feet,y:y+4}));
    }
  }
  assert.equal(groundAt(RIVER_CITY,riverNodes.T.x,riverNodes.T.z),4.5);
  assert.equal(groundAt(CASTLE_ID,690,100),18);
  assert.ok(!isSafeWorldPoint(WORLD_MAPS[RIVER_CITY],{...riverNodes.T,y:10.5}));
  assert.equal(groundAt("ritual_village",2.4,2.4),0);
});
