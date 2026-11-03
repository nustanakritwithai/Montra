import test from "node:test";
import {RULES} from "./GameRules.js";
import {DatabaseSync} from "node:sqlite";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {CASTLE_ID,CASTLE_DURATION,CAPTURE_RADIUS,castleObjectives,musterNodes,forwardCamps,castleLogistics,newPilot,tickPilot,pilotView,pilotWinner,changeCastleGate,pilotSpawn,type Side} from "./CastlePilot.js";
import {WORLD_MAPS,isSafeWorldPoint,isRestArea,getSafeMapSpawn,provinceShotClear} from "./WorldMaps.js";
import {crestCorners,wallRing} from "./StrategicProvinces.js";
import {GuildStore} from "./GuildStore.js";
import {WAR_PROTECTION} from "./TerritoryWar.js";
const roster=(ids:number[],side:Side="attack",count=1)=>castleObjectives.map(p=>({attack:side==="attack" && ids.includes(p.id)?count:0,defend:side==="defend" && ids.includes(p.id)?count:0}));
test("full castle road, gates, stairs, crest circuits and both previous world neighbours",()=>{
  const m=WORLD_MAPS[CASTLE_ID],r=m.strategic!.rampart!;
  assert.equal(Object.keys(WORLD_MAPS).length,17);assert.deepEqual(m.bounds,{minX:-350,maxX:350,minZ:-350,maxZ:350});
  assert.equal(r.deck.length,12);assert.equal(r.gates.length,9);assert.equal(new Set(r.stairs.map(s=>s.id)).size,18);
  assert.equal(m.strategic!.objectives!.length,7);assert.deepEqual(m.strategic!.activeObjectives,[1,2,3,4,5,6,7]);
  assert.deepEqual(r.gates.map(g=>g.id).sort(),Object.keys(newPilot().siege!.gates).sort());
  for(const point of [1,2,3])for(const side of ["attack","defend"] as const)for(let seat=0;seat<10;seat++)
    assert.ok(isSafeWorldPoint(m,pilotSpawn(point,side,seat)));
  // At the ordinary walking speed (3 m/s), each attacking seat can reach its first flag in 25 seconds.
  for(const id of musterNodes)for(let seat=0;seat<10;seat++){
    const spawn=pilotSpawn(id,"attack",seat),goal=castleObjectives[id-1];
    const distance=Math.hypot(spawn.x-goal.x,spawn.z-goal.z);assert.ok(distance/RULES.playerSpeed<=25);
    for(let t=0;t<=100;t++)assert.ok(isSafeWorldPoint(m,{x:spawn.x+(goal.x-spawn.x)*t/100,y:0,z:spawn.z+(goal.z-spawn.z)*t/100}));
  }
  for(const p of m.portals){assert.ok(isSafeWorldPoint(WORLD_MAPS[p.targetMapId],p.targetSpawn));}
  for(const id of ["fallen_city","asura_peak"]){assert.ok(WORLD_MAPS[id].portals.some(p=>p.targetMapId===CASTLE_ID));assert.ok(m.portals.some(p=>p.targetMapId===id));}
  assert.ok(!WORLD_MAPS.fallen_city.portals.some(p=>p.targetMapId==="asura_peak"));
  for(const [i,route] of m.paths!.entries())for(let j=1;j<route.length;j++){
    const a=route[j-1],b=route[j],n=Math.ceil(Math.hypot(a.x-b.x,a.z-b.z));
    for(let k=0;k<=n;k++){const v={x:a.x+(b.x-a.x)*k/n,y:0,z:a.z+(b.z-a.z)*k/n};
      assert.ok(isSafeWorldPoint(m,v),"route "+i+" "+v.x+","+v.z);if(!i)assert.ok(isRestArea(m.id,v));}
  }
  for(const s of r.stairs){assert.ok(isSafeWorldPoint(m,{...s.foot,y:0}));assert.deepEqual(getSafeMapSpawn(m.id,{...s.top,y:4}),{...s.top,y:4});}
  for(const g of r.gates){
    const b=g.box,x=b.x+b.width/2,z=b.z+b.length/2,alongX=b.width>b.length;
    const top={x,y:5,z},outside={x:x+(alongX?0:7),y:1.55,z:z+(alongX?7:0)};
    assert.ok(isSafeWorldPoint(m,{x,z,y:4}));assert.ok(isSafeWorldPoint(m,{x,z,y:0}));
    assert.ok(provinceShotClear(m,top,outside));assert.ok(provinceShotClear(m,outside,top));
    const inside={x:x-(outside.x-x),y:1.55,z:z-(outside.z-z)};
    assert.ok(provinceShotClear(m,inside,outside));assert.ok(!provinceShotClear(m,inside,outside,new Set([g.id])));
  }
  for(let i=0;i<12;i++){
    const from=r.corners[i],to=r.corners[(i-i%4)+(i+2)%4],route=[from,...crestCorners(r,from,to),to];
    assert.equal(wallRing(r,from.x,from.z),Math.floor(i/4));assert.ok(route.length>=3);
    for(let j=1;j<route.length;j++){const a=route[j-1],b=route[j];for(let t=0;t<=100;t++)assert.ok(isSafeWorldPoint(m,{x:a.x+(b.x-a.x)*t/100,z:a.z+(b.z-a.z)*t/100,y:4}));}
  }
});
test("camp formations are outside capture rings, behind real cover and escapable on two sides",()=>{
  const map=WORLD_MAPS[CASTLE_ID];
  for(const camp of forwardCamps){
    for(const dx of [-1,0,1])for(const dz of [-1,0,1]){
      const p={x:camp.x+dx,z:camp.z+dz,y:0};assert.ok(isSafeWorldPoint(map,p));
      assert.ok(castleObjectives.every(n=>Math.hypot(n.x-p.x,n.z-p.z)>CAPTURE_RADIUS));
      for(let offset=-9;offset<=9;offset++)assert.ok(isSafeWorldPoint(map,{...p,x:p.x+offset}));
    }
    assert.equal(provinceShotClear(map,{x:camp.x,z:camp.z-12,y:1},{x:camp.x,z:camp.z,y:1}),false);
  }
});
test("only uncontested owned nodes on passable supply lines feed the warehouse, including alternate lanes",()=>{
  const s=newPilot(true),counts=roster([]),campCounts=forwardCamps.map(()=>({attack:0,defend:0}));
  const get=()=>castleLogistics(pilotView(s),counts,campCounts,"defend")!;
  for(const i of [0,1,3,4])s.points[i].owner="defend";
  const gate=s.siege!.gates,status=(id:number)=>get().camps.find(c=>c.id===id)!.status;
  assert.equal(status(2),"cut");assert.equal(status(4),"cut");
  gate["outer-west"].open=true;assert.equal(status(2),"ready");assert.equal(status(4),"cut");
  gate["middle-west"].hp=0;assert.equal(status(4),"ready");
  campCounts[3].attack=1;assert.equal(status(4),"contested");assert.deepEqual(get().drums,[]);
  campCounts[3].attack=0;
  counts[1]={attack:1,defend:2};assert.equal(status(2),"contested");assert.equal(status(4),"cut");
  gate["outer-south"].open=true;gate["middle-south"].open=true;assert.equal(status(4),"ready");
  counts[4].attack=1;assert.equal(status(4),"cut");assert.deepEqual(get().drums,[5]);
  counts[3]={attack:1,defend:1};assert.equal(status(4),"contested");assert.deepEqual(get().drums,[4,5]);
  assert.deepEqual(castleLogistics(pilotView(s),counts,campCounts,"attack")!.drums,[]);
  counts[3].attack=0;s.points[3].pressure=12345;assert.deepEqual(get().drums,[5]);
  s.points[4].owner="attack";assert.deepEqual(get().drums,[]);assert.equal(status(3),"unheld");
  const {siege,...old}=s;old.points=old.points.slice(0,3);
  assert.equal(castleLogistics(pilotView(old),counts,campCounts,"attack"),undefined);
});
test("old musters migrate, retain their starting lane and scope camp preference to this battle and character",()=>{
  const dir=mkdtempSync(path.join(tmpdir(),"montra-camp-save-")),file=path.join(dir,"guilds.sqlite");
  const db=new DatabaseSync(file);
  db.exec("CREATE TABLE castle_pilot_musters(battle INTEGER,character TEXT,point INTEGER,PRIMARY KEY(battle,character));INSERT INTO castle_pilot_musters VALUES(7,'first',2)");db.close();
  let store=new GuildStore(file);
  try{
    const f={site:CASTLE_ID,seq:7},later={...f,seq:8};
    assert.equal(store.war.muster(f,"first",3),2);assert.equal(store.war.campPreference(f,"first"),0);
    store.war.campPreference(f,"first",4);store.close();store=new GuildStore(file);
    assert.equal(store.war.campPreference(f,"first"),4);assert.equal(store.war.campPreference(f,"peer"),0);
    assert.equal(store.war.muster(later,"first",1),1);assert.equal(store.war.campPreference(later,"first"),0);
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test("three occupied nodes award 288 hold points per minute; contest, cut and flip do not re-award first capture",()=>{
  const s=newPilot(),all=roster([2,4,5]);
  for(let t=0;t<60;t++)tickPilot(s,all,1000);
  assert.equal(pilotView(s).score.attack,60);
  for(let t=0;t<60;t++)tickPilot(s,all,1000);
  assert.equal(pilotView(s).score.attack,348);
  const reverse=roster([4],"defend",10);reverse[4]={attack:2,defend:2};
  for(let t=0;t<30;t++)tickPilot(s,reverse,1000);
  const v=pilotView(s);assert.equal(v.linked,null);assert.equal(v.points[3].owner,"defend");
  const cut=s.score.attack;tickPilot(s,reverse,1000);assert.equal(s.score.attack-cut,3*5000);
  for(let t=0;t<59;t++)tickPilot(s,all,1000);const before=s.score.attack;
  tickPilot(s,all,1000);assert.equal(s.score.attack-before,3*5000);assert.equal(pilotView(s).linked,"attack");
});
test("independent networks, contested throne, supply loss grace and decay",()=>{
  const s=newPilot(),live=30*60_000;
  tickPilot(s,roster([1,2,4,5]),60_000);
  assert.deepEqual(pilotView(s).networks.attack.sort(),[1,2,4,5]);
  tickPilot(s,roster([7],"attack",10),2000,live-1000);
  assert.equal(s.siege!.throne.attack,1000);
  const contested=roster([]);contested[6]={attack:5,defend:5};
  tickPilot(s,contested,2000,live+1000);assert.equal(s.siege!.throne.attack,1000);
  tickPilot(s,roster([7]),39_000,live+3000);
  s.siege!.gates["inner-west"].open=false;
  assert.equal(pilotView(s).throne!.attack.route,false);
  tickPilot(s,roster([7]),30_001,live+42_000);assert.equal(s.siege!.throne.attack,39_999);
  s.siege!.gates["inner-west"].open=true;
  tickPilot(s,roster([7]),1,live+72_001);assert.equal(s.siege!.throne.attack,40_000);
  s.points[3].owner="defend";
  assert.equal(pilotView(s).throne!.attack.middle,1);assert.equal(pilotView(s).throne!.attack.route,false);
  tickPilot(s,roster([7]),30_000,live+72_002);assert.equal(s.siege!.throne.attack,40_000);
  // A lone eastern outpost is excluded from the western component's 20% uplift.
  s.points[3].owner="attack";s.points[2].owner="attack";assert.deepEqual(pilotView(s).networks.attack.sort(),[1,2,4,5]);
});
test("neutral mirror victory, incumbent defence and gate controls",()=>{
  for(const side of ["attack","defend"] as const){
    const s=newPilot();tickPilot(s,roster([1,3,5,6],side),60_000);
    assert.equal(tickPilot(s,roster([7],side,8),121_000,30*60_000),120_000);
    assert.equal(pilotWinner(s),side);
  }
  const s=newPilot(true),id="inner-west";
  assert.throws(()=>changeCastleGate(s,id,"defend",false,100,true),/repair/);
  changeCastleGate(s,id,"attack",false,100);changeCastleGate(s,id,"defend",false,1000);
  assert.throws(()=>changeCastleGate(s,id,"attack",false,1000),/open/);
  assert.throws(()=>changeCastleGate(s,id,"defend",true,1000),/occupied/);
  changeCastleGate(s,id,"defend",false,1000);s.points[5].owner="defend";
  assert.throws(()=>changeCastleGate(s,id,"defend",false,5099,true),/repair/);
  changeCastleGate(s,id,"defend",false,5100,true);assert.equal(s.siege!.gates[id].hp,115);
  for(let i=0;i<8;i++)changeCastleGate(s,id,"attack",false,6000+i*1000);
  assert.equal(pilotView(s).gates![id].closed,false);assert.throws(()=>changeCastleGate(s,id,"defend",false,30_000,true),/inactive/);
  for(const g of Object.values(s.siege!.gates))g.open=true;
  tickPilot(s,roster([1,2,4,5],"defend"),60_000);
  tickPilot(s,roster([7],"defend"),120_000,30*60_000);assert.equal(s.siege!.throne.defend,0);
  const equal=newPilot();equal.middleTime.defend=1;assert.equal(pilotWinner(equal),"defend");
  equal.middleTime.attack=1;assert.equal(pilotWinner(equal),null);
});
test("old three-node rows keep their IDs and scoring after restart",()=>{
  const {siege,...old}=newPilot();old.points=old.points.slice(0,3);
  tickPilot(old,roster([2,4,5]),120_000);
  const view=pilotView(old);assert.equal(view.throne,undefined);assert.equal(view.score.attack,348);
  assert.deepEqual(view.points.map(p=>p.id),[2,4,5]);
});
test("live throne wins even against a score lead at the deadline; protection uses exact finish",()=>{
  for(const early of [0,500,15*60_000-120_000]){
    const dir=mkdtempSync(path.join(tmpdir(),"montra-castle-end-")),file=path.join(dir,"guilds.sqlite"),store=new GuildStore(file);
    try{
      store.create("a","A","West");store.create("d","D","East");const start=100000,end=start+CASTLE_DURATION-early;
      const field=store.war.start(CASTLE_ID,store.war.member("a")!,start);store.war.side(field,store.war.member("d")!,start,true);
      const s=newPilot();for(const id of [1,2,4,5])s.points[id-1].owner="attack";s.score.defend=1e9;s.siege!.throne.attack=118_500;
      const db=new DatabaseSync(file);db.prepare("UPDATE territory_battles SET pilot_json=?,sample=? WHERE seq=?").run(JSON.stringify(s),end-1500,field.seq);db.close();
      store.war.advance(field,end-500,0,0,roster([7]),end-1500);
      if(!early)assert.equal(store.war.inspect(CASTLE_ID,end).phase,"battle");
      store.war.advance(field,end+300,0,0,roster([7]),end-500);
      const result=store.war.inspect(CASTLE_ID,end+300);assert.equal(result.owner,"West");assert.equal(result.pilot!.throne!.victor,"attack");
      assert.equal(store.war.inspect(CASTLE_ID,end+WAR_PROTECTION-1).phase,"protected");
      assert.equal(store.war.inspect(CASTLE_ID,end+WAR_PROTECTION).phase,"open");
    }finally{store.close();rmSync(dir,{recursive:true,force:true});}
  }
});
test("durable castle scores, retry, deadline, eight-hour protection and independent fort ownership",()=>{
  const dir=mkdtempSync(path.join(tmpdir(),"montra-castle-")),file=path.join(dir,"guilds.sqlite");let store=new GuildStore(file);
  try{
    store.create("a","A","West");store.create("d","D","East");const m=store.war.member("a")!,start=100000;
    const f=store.war.start(CASTLE_ID,m,start);store.war.side(f,store.war.member("d")!,start,true);
    const all=roster([2,4,5],"attack",6);
    for(let t=1;t<=90;t++)store.war.advance(f,start+t*1000,0,0,all,start+(t-1)*1000);
    store.war.advance(f,start+90000,0,0,all);
    store.close();store=new GuildStore(file);assert.equal(store.war.inspect(CASTLE_ID,start+91000).pilot!.score.attack,348);
    store.war.advance(f,start+91000,0,0,all);assert.equal(store.war.inspect(CASTLE_ID,start+91000).pilot!.score.attack,348);
    const end=start+CASTLE_DURATION;assert.equal(store.war.inspect(CASTLE_ID,end).owner,"West");
    const estate=store.war.government.view(CASTLE_ID,m,end+3_600_000)!;
    assert.equal(estate.available,60);store.war.govern("a",{site:CASTLE_ID,revision:estate.revision,action:"collect"},end+3_600_000);
    assert.equal(store.war.government.balance(m.id),60);
    assert.equal(store.war.inspect(CASTLE_ID,end+WAR_PROTECTION-1).phase,"protected");
    assert.equal(store.war.inspect(CASTLE_ID,end+WAR_PROTECTION).phase,"open");assert.equal(store.war.inspect("moon_pass",end).owner,null);
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
