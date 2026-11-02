import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {CASTLE_ID,CASTLE_DURATION,pilotNodes,newPilot,tickPilot,pilotView} from "./CastlePilot.js";
import {WORLD_MAPS,isSafeWorldPoint,isRestArea,getSafeMapSpawn} from "./WorldMaps.js";
import {crestCorners,wallRing} from "./StrategicProvinces.js";
import {GuildStore} from "./GuildStore.js";
import {WAR_PROTECTION} from "./TerritoryWar.js";
test("full castle road, gates, stairs, crest circuits and both previous world neighbours",()=>{
  const m=WORLD_MAPS[CASTLE_ID],r=m.strategic!.rampart!;
  assert.equal(Object.keys(WORLD_MAPS).length,16);assert.deepEqual(m.bounds,{minX:-1000,maxX:1000,minZ:-1000,maxZ:1000});
  assert.equal(r.deck.length,12);assert.equal(r.gates.length,9);assert.equal(new Set(r.stairs.map(s=>s.id)).size,18);
  assert.equal(m.strategic!.objectives!.length,7);assert.deepEqual(m.strategic!.activeObjectives,[2,4,5]);
  for(const p of m.portals){assert.ok(isSafeWorldPoint(WORLD_MAPS[p.targetMapId],p.targetSpawn));}
  for(const id of ["fallen_city","asura_peak"]){assert.ok(WORLD_MAPS[id].portals.some(p=>p.targetMapId===CASTLE_ID));assert.ok(m.portals.some(p=>p.targetMapId===id));}
  assert.ok(!WORLD_MAPS.fallen_city.portals.some(p=>p.targetMapId==="asura_peak"));
  for(const [i,route] of m.paths!.entries())for(let j=1;j<route.length;j++){
    const a=route[j-1],b=route[j],n=Math.ceil(Math.hypot(a.x-b.x,a.z-b.z));
    for(let k=0;k<=n;k++){const v={x:a.x+(b.x-a.x)*k/n,y:0,z:a.z+(b.z-a.z)*k/n};
      assert.ok(isSafeWorldPoint(m,v),"route "+i+" "+v.x+","+v.z);if(!i)assert.ok(isRestArea(m.id,v));}
  }
  for(const s of r.stairs){assert.ok(isSafeWorldPoint(m,{...s.foot,y:0}));assert.deepEqual(getSafeMapSpawn(m.id,{...s.top,y:4}),{...s.top,y:4});}
  for(let i=0;i<12;i++){
    const from=r.corners[i],to=r.corners[(i-i%4)+(i+2)%4],route=[from,...crestCorners(r,from,to),to];
    assert.equal(wallRing(r,from.x,from.z),Math.floor(i/4));assert.ok(route.length>=3);
    for(let j=1;j<route.length;j++){const a=route[j-1],b=route[j];for(let t=0;t<=100;t++)assert.ok(isSafeWorldPoint(m,{x:a.x+(b.x-a.x)*t/100,z:a.z+(b.z-a.z)*t/100,y:4}));}
  }
});
test("three occupied nodes award 288 hold points per minute; contest, cut and flip do not re-award first capture",()=>{
  const s=newPilot(),all=pilotNodes.map(()=>({attack:1,defend:0}));
  for(let t=0;t<60;t++)tickPilot(s,all,1000);
  assert.equal(pilotView(s).score.attack,60);
  for(let t=0;t<60;t++)tickPilot(s,all,1000);
  assert.equal(pilotView(s).score.attack,348);
  const reverse=[{attack:0,defend:0},{attack:0,defend:10},{attack:2,defend:2}];
  for(let t=0;t<30;t++)tickPilot(s,reverse,1000);
  const v=pilotView(s);assert.equal(v.linked,null);assert.equal(v.points[1].owner,"defend");
  const cut=s.score.attack;tickPilot(s,reverse,1000);assert.equal(s.score.attack-cut,3*5000);
  for(let t=0;t<59;t++)tickPilot(s,all,1000);const before=s.score.attack;
  tickPilot(s,all,1000);assert.equal(s.score.attack-before,3*5000);assert.equal(pilotView(s).linked,"attack");
});
test("durable castle scores, retry, deadline, eight-hour protection and independent fort ownership",()=>{
  const dir=mkdtempSync(path.join(tmpdir(),"montra-castle-")),file=path.join(dir,"guilds.sqlite");let store=new GuildStore(file);
  try{
    store.create("a","A","West");store.create("d","D","East");const m=store.war.member("a")!,start=100000;
    const f=store.war.start(CASTLE_ID,m,start);store.war.side(f,store.war.member("d")!,start,true);
    const all=pilotNodes.map(()=>({attack:6,defend:0}));
    for(let t=1;t<=90;t++)store.war.advance(f,start+t*1000,0,0,all,start+(t-1)*1000);
    store.war.advance(f,start+90000,0,0,all);
    store.close();store=new GuildStore(file);assert.equal(store.war.inspect(CASTLE_ID,start+91000).pilot!.score.attack,348);
    store.war.advance(f,start+91000,0,0,all);assert.equal(store.war.inspect(CASTLE_ID,start+91000).pilot!.score.attack,348);
    const end=start+CASTLE_DURATION;assert.equal(store.war.inspect(CASTLE_ID,end).owner,"West");
    assert.equal(store.war.inspect(CASTLE_ID,end+WAR_PROTECTION-1).phase,"protected");
    assert.equal(store.war.inspect(CASTLE_ID,end+WAR_PROTECTION).phase,"open");assert.equal(store.war.inspect("moon_pass",end).owner,null);
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
