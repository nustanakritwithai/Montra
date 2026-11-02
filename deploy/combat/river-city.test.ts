import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {RIVER_CITY,gridPoint,riverNodes,riverGateSpecs,newRiverBattle,changeRiverGate,sampleRiverPosts,riverSupplied,RIVER_WAR_DURATION} from "./RiverCity.js";
import {WORLD_MAPS,isSafeWorldPoint,provinceShotClear} from "./WorldMaps.js";
import {wallRing,crestCorners} from "./StrategicProvinces.js";
import {GuildStore} from "./GuildStore.js";
import {WAR_PROTECTION} from "./TerritoryWar.js";
const map=WORLD_MAPS[RIVER_CITY],r=map.strategic!.rampart!;
const feet=(p:{x:number;z:number},y=0)=>({...p,y});

test("B01 preserves the two crossings, facility courts and independently walkable elevated circuits at the enlarged pitch",()=>{
  assert.deepEqual(map.bounds,{minX:-248,maxX:248,minZ:-200,maxZ:200});
  assert.deepEqual(map.strategic!.sites.filter(s=>s.kind==="bridge").map(s=>s.x),[-112,112]);
  for(let i=0;i<31;i++)assert.equal(isSafeWorldPoint(map,feet(gridPoint(i,21))),i===8 || i===22);
  assert.equal(r.gates.length,5);assert.equal(r.stairs.length,4);assert.equal(r.deck.length,8);
  for(const p of Object.values(riverNodes))assert.ok(isSafeWorldPoint(map,feet(p)));
  for(const f of map.strategic!.riverCity!.facilities)assert.ok(!isSafeWorldPoint(map,feet(f)));
  for(const [i,s] of r.stairs.entries()){
    assert.ok(isSafeWorldPoint(map,feet(s.foot)));assert.ok(isSafeWorldPoint(map,feet(s.top,4)));
    assert.equal(wallRing(r,s.top.x,s.top.z),Math.floor(i/2));
    const other=r.stairs[i^1];assert.ok(crestCorners(r,s.top,other.top).length>=2);
  }
  for(const gate of r.gates){
    const b=gate.box,x=b.x+b.width/2,z=b.z+b.length/2,h=gate.side==="south" || gate.side==="north";
    const a={x:x+(h?0:6),z:z+(h?6:0),y:1.5},c={x:x-(h?0:6),z:z-(h?6:0),y:1.5};
    assert.ok(isSafeWorldPoint(map,{x,z,y:4}));assert.ok(provinceShotClear(map,a,c));
    assert.ok(!provinceShotClear(map,a,c,new Set([gate.id])));assert.ok(provinceShotClear(map,{...a,y:5.5},{...c,y:5.5},new Set([gate.id])));
  }
  const high={x:48,y:5.55,z:96},low={x:48,y:1.55,z:109};
  assert.ok(provinceShotClear(map,high,low));assert.ok(provinceShotClear(map,low,high));
  assert.ok(!provinceShotClear(map,{...high,y:1.55,z:90},low));
  function reachable(closed:Set<string>){
    const q=[[15,23]],seen=new Set<string>();
    while(q.length){const [i,j]=q.pop()!,p=gridPoint(i,j),key=i+","+j;if(seen.has(key) || !isSafeWorldPoint(map,feet(p)))continue;
      if(r.gates.some(g=>closed.has(g.id) && Math.abs(p.x-g.box.x-g.box.width/2)<1 && Math.abs(p.z-g.box.z-g.box.length/2)<1))continue;
      if(i===17 && j===9)return true;seen.add(key);
      for(const [di,dj] of [[0,1],[1,0],[0,-1],[-1,0]])q.push([i+di,j+dj]);
    }return false;
  }
  for(const g of r.gates)assert.ok(reachable(new Set([g.id])),g.id);
  assert.equal(reachable(new Set(riverGateSpecs.filter(g=>g.ring===0).map(g=>g.id))),false);
});
test("a supply post, a physical route and an uncontested garrison make distinct contributions",()=>{
  const b=newRiverBattle(true),c=[{attack:1,defend:0},{attack:0,defend:0},{attack:1,defend:0}];
  for(let i=0;i<6;i++)sampleRiverPosts(b,c,1);
  assert.equal(b.posts[0].owner,"attack");assert.ok(!riverSupplied(b,"attack"));
  for(const id of ["G13","G22"])for(let i=0;i<4;i++)changeRiverGate(b,id,"attack",false);
  assert.ok(riverSupplied(b,"attack"));assert.equal(b.gates.G11.hp,120);
  c[0].defend=1;sampleRiverPosts(b,c,1);assert.ok(!riverSupplied(b,"attack"));
  c[0].attack=0;for(let i=0;i<12;i++)sampleRiverPosts(b,c,1);
  assert.equal(b.posts[0].owner,"defend");assert.ok(riverSupplied(b,"defend"));
  changeRiverGate(b,"G11","defend",false);assert.throws(()=>changeRiverGate(b,"G11","defend",true),/occupied/);
  assert.throws(()=>changeRiverGate(b,"G22","defend",false),/inactive/);
});
test("a restart restores each gate and post and keeps the deadline tied to the original start",()=>{
  const dir=mkdtempSync(path.join(tmpdir(),"montra-b01-test-")),file=path.join(dir,"guilds.sqlite");
  let store=new GuildStore(file);
  try{
    store.create("old","Old","Harbour");store.create("new","New","River");const t=200000;
    const c=[{attack:1,defend:0},{attack:0,defend:0},{attack:0,defend:0}];
    const first=store.war.start(RIVER_CITY,store.war.member("old")!,t);
    for(let i=1;i<=40;i++)store.war.advance(first,t+i*1000,2,0,undefined,undefined,null,c);
    const start=t+40000+WAR_PROTECTION,field=store.war.start(RIVER_CITY,store.war.member("new")!,start);
    store.war.riverGate(field,"G13","attack",false,start+1000);
    c[1].defend=1;
    for(let i=1;i<=7;i++)store.war.advance(field,start+i*1000,0,0,undefined,undefined,null,c);
    const before=store.war.inspect(RIVER_CITY,start+7000);
    store.close();store=new GuildStore(file);
    const restored=store.war.inspect(RIVER_CITY,start+27000);
    assert.deepEqual(restored.river,before.river);assert.equal(restored.seconds,before.seconds-20);
    assert.equal(restored.river!.gates.G13.hp,105);assert.equal(restored.river!.posts[1].owner,"defend");
    const end=store.war.inspect(RIVER_CITY,start+RIVER_WAR_DURATION);
    assert.equal(end.phase,"protected");assert.equal(end.owner,"Harbour");
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test("neutral B01 can be claimed by either side, and an incumbent retains the city on timeout",()=>{
  const s=new GuildStore(":memory:"),start=100000;
  try{
    s.create("a","A","South");s.create("d","D","North");const a=s.war.member("a")!,d=s.war.member("d")!;
    const f=s.war.start(RIVER_CITY,a,start);s.war.side(f,d,start,true);
    const empty=[{attack:0,defend:0},{attack:0,defend:0},{attack:0,defend:0}];
    for(let i=1;i<=35;i++)s.war.advance(f,start+i*1000,2,0,undefined,undefined,null,empty);
    assert.equal(s.war.inspect(RIVER_CITY,start+35000).progress,0);
    empty[1].defend=1;
    for(let i=36;i<=76;i++)s.war.advance(f,start+i*1000,0,2,undefined,undefined,null,empty);
    const end=start+70000;assert.equal(s.war.inspect(RIVER_CITY,end).owner,"North");
    const next=s.war.start(RIVER_CITY,a,end+WAR_PROTECTION);
    assert.ok(s.war.inspect(RIVER_CITY,end+WAR_PROTECTION).river!.gates.G11.closed);
    const deadline=end+WAR_PROTECTION+RIVER_WAR_DURATION;
    assert.equal(s.war.inspect(RIVER_CITY,deadline-1).phase,"battle");assert.equal(s.war.inspect(RIVER_CITY,deadline).owner,"North");
    assert.equal(s.war.inspect(RIVER_CITY,deadline).phase,"protected");assert.ok(next.seq>f.seq);
  }finally{s.close();}
});
