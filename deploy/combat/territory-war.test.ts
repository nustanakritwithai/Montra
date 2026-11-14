import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {tmpdir} from "node:os";
import {mkdtempSync,rmSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {GuildStore} from "./GuildStore.js";
import {WAR_PROTECTION,WAR_DURATION,WAR_HOLD,getWarDefinition,warSites,warEntryDamageFactor,warParticipationExperience} from "./TerritoryWar.js";
import {CASTLE_DURATION,CASTLE_ENABLED,CASTLE_ID,CASTLE_SEATS} from "./CastlePilot.js";
import {RIVER_CITY,RIVER_WAR_DURATION,riverNodes} from "./RiverCity.js";

test("only registered battle sites admit guild wars, with independent profiles",()=>{
  const expected=["moon_pass","river_watch",RIVER_CITY,...(CASTLE_ENABLED?[CASTLE_ID]:[])];
  assert.deepEqual(Object.keys(warSites).sort(),expected.sort());
  for(const id of ["moon_pass","river_watch"]){
    const rules=getWarDefinition(id)!;
    assert.equal(rules.mode,"banner");
    assert.equal(rules.durationMs,WAR_DURATION);
    assert.equal(rules.seatsPerSide,5);
    assert.deepEqual(rules.entry,warSites[id]);
  }
  const river=getWarDefinition(RIVER_CITY)!;
  assert.equal(river.mode,"river");
  assert.equal(river.durationMs,RIVER_WAR_DURATION);
  assert.equal(river.seatsPerSide,5);
  assert.deepEqual(river.entry,riverNodes.A);
  assert.notDeepEqual(river.entry,warSites[RIVER_CITY]);
  const castle=getWarDefinition(CASTLE_ID);
  if(CASTLE_ENABLED){
    assert.equal(castle?.mode,"castle");
    assert.equal(castle?.durationMs,CASTLE_DURATION);
    assert.equal(castle?.seatsPerSide,CASTLE_SEATS);
    assert.deepEqual(castle?.entry,warSites[CASTLE_ID]);
  }else assert.equal(castle,undefined);

  const store=new GuildStore(":memory:");
  try{
    store.create("a","A","Moon");
    const member=store.war.member("a")!;
    for(const id of ["ritual_village","mantra_capital","fallen_city","twin_neck_pass","bound_temple","bamboo_frontier","__proto__"]){
      assert.equal(getWarDefinition(id),undefined);
      assert.throws(()=>store.war.start(id,member,0),/war_unknown/);
    }
  }finally{store.close();}
});

test("early level damage scaling and war participation EXP stay bounded",()=>{
  assert.equal(warEntryDamageFactor(1,1),1);
  assert.equal(warEntryDamageFactor(40,100),1);
  assert.equal(warEntryDamageFactor(1,100),3.6);
  assert.ok(Math.abs(warEntryDamageFactor(100,1)-1/3.6)<1e-12);
  assert.throws(()=>warEntryDamageFactor(0,1));
  assert.equal(warParticipationExperience(150),3);
  assert.equal(warParticipationExperience(125100),3127);
  assert.equal(warParticipationExperience(0),0);
});

test("the mine changes gate damage only at Moon Pass; river supply requires a lead at the main flag",()=>{
  const dir=mkdtempSync(path.join(tmpdir(),"montra-relay-")),store=new GuildStore(path.join(dir,"guilds.sqlite"));
  try{
    store.create("a","A","Moon");store.create("d","D","Tide");
    const a=store.war.member("a")!,d=store.war.member("d")!,start=100000;
    const mine=store.war.start("moon_pass",a,start),river=store.war.start("river_watch",a,start);
    store.war.side(river,d,start,true);store.war.side(mine,d,start,true);
    store.war.gate(mine,"attack",false,start,"attack");assert.equal(store.war.inspect(mine.site,start).gateHp,90);
    store.war.gate(mine,"attack",false,start,"defend");assert.equal(store.war.inspect(mine.site,start).gateHp,80);
    store.war.gate(mine,"attack",false,start,null);assert.equal(store.war.inspect(mine.site,start).gateHp,65);
    store.war.gate(river,"attack",false,start,"attack");assert.equal(store.war.inspect(river.site,start).gateHp,105);
    let now=start;
    for(const [at,df,owner,expected] of [[0,0,"attack",0],[1,1,"attack",0],[1,0,"attack",2],[3,0,"attack",5],
      [0,1,"attack",4],[0,1,"defend",2],[1,0,null,3]] as const){
      now+=1000;store.war.advance(river,now,at,df,undefined,undefined,owner);
      assert.equal(store.war.inspect(river.site,now).progress,expected);
    }
    store.war.advance(mine,start+1000,1,0,undefined,undefined,"attack");
    assert.equal(store.war.inspect(mine.site,start+1000).progress,1);
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test("capture progress, contested flags, deadline, independent protection and durable ownership",()=>{
  const dir=mkdtempSync(path.join(tmpdir(),"montra-war-")),file=path.join(dir,"guilds.sqlite");
  let store=new GuildStore(file);
  try{
    store.create("a","A","Moon");store.create("b","B","River");store.add("a","c","C");
    const a=store.war.member("a")!,b=store.war.member("b")!,c=store.war.member("c")!;
    const start=1_000_000;
    assert.throws(()=>store.war.start("moon_pass",c,start),/war_officer/);
    const f=store.war.start("moon_pass",a,start),other=store.war.start("river_watch",b,start);
    assert.equal(store.war.inspect(f.site,start).phaseEndsAt,start+WAR_DURATION);
    assert.throws(()=>store.war.start("moon_pass",b,start),/war_unavailable/);
    assert.equal(store.war.side(f,b,start,true),"defend");
    const [first,second]=Object.keys(store.war.inspect(f.site,start).gates!);
    store.war.gate(f,"defend",false,start);assert.equal(store.war.inspect(f.site,start).gates![first].closed,false);
    assert.equal(store.war.inspect(f.site,start).gates![second].closed,true,"only the used gate opens");
    assert.throws(()=>store.war.gate(f,"defend",true,start),/occupied/);
    store.war.gate(f,"defend",false,start);store.war.gate(f,"attack",false,start);
    for(let i=1;i<=4;i++)store.war.advance(f,start+i*1000,2,2);
    assert.equal(store.war.inspect(f.site,start+4000).progress,0);
    store.war.advance(f,start+40_000,5,0);store.war.advance(f,start+40_000,5,0);
    assert.equal(store.war.inspect(f.site,start+40_000).progress,2);
    store.close();store=new GuildStore(file);
    assert.equal(store.war.inspect(f.site,start+40_000).gateHp,105);
    for(let i=0;i<7;i++)store.war.gate(f,"attack",false,start+40_000);
    // Breaking one gate opens only that gate; the other keeps its HP and still blocks.
    assert.deepEqual(store.war.inspect(f.site,start+40_000).gates,{[first]:{hp:0,closed:false},[second]:{hp:120,closed:true}});
    assert.equal(store.war.inspect(f.site,start+40_000).gateClosed,true);
    assert.throws(()=>store.war.gate(f,"attack",false,start+40_000,null,first),/war_gate_inactive/);
    for(let i=1;i<=29;i++)store.war.advance(f,start+40_000+i*1000,5,0);
    const won=start+69_000,reopen=won+3_600_000;
    assert.equal(store.war.inspect(f.site,won).owner,"Moon");
    assert.equal(store.war.inspect(f.site,won).phaseEndsAt,reopen);
    assert.equal(store.war.inspect(other.site,start+WAR_DURATION).owner,null);
    store.close();store=new GuildStore(file);
    assert.equal(store.war.inspect(f.site,reopen-1).phase,"protected");
    assert.throws(()=>store.war.start(f.site,b,reopen-1),/war_unavailable/);
    assert.equal(store.war.inspect(f.site,reopen).phase,"open");
    assert.equal(store.war.inspect(other.site,reopen).phase,"open");
    assert.throws(()=>store.war.start(f.site,a,reopen),/war_unavailable/);
    const next=store.war.start(f.site,b,reopen);
    assert.equal(store.war.side(next,a,reopen),"defend");assert.equal(store.war.inspect(next.site,reopen).gateHp,120);
    store.war.advance(f,reopen+1000,WAR_HOLD,0);
    assert.equal(store.war.inspect(f.site,reopen+1000).progress,0);
    store.close();store=new GuildStore(file);
    assert.equal(store.war.inspect(f.site,reopen+WAR_DURATION+WAR_PROTECTION).phase,"open");
    assert.equal(store.war.inspect(f.site,reopen+WAR_DURATION+WAR_PROTECTION).phaseEndsAt,null);
    assert.equal(store.war.inspect(f.site,reopen+WAR_DURATION+WAR_PROTECTION).owner,"Moon");
    store.leave("c");store.leave("a");
    assert.equal(store.war.inspect(f.site,reopen+WAR_DURATION+WAR_PROTECTION).owner,null);
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});


test("no-winner timeout reopens immediately, survives reload, and permits a new war",()=>{
  const dir=mkdtempSync(path.join(tmpdir(),"montra-war-timeout-")),file=path.join(dir,"guilds.sqlite");
  let store=new GuildStore(file);
  try{
    store.create("a","A","Sun");store.create("b","B","Moon");
    const a=store.war.member("a")!,b=store.war.member("b")!,start=100_000;
    const field=store.war.start("river_watch",a,start),deadline=start+WAR_DURATION;
    store.war.side(field,b,start,true);
    assert.equal(store.war.inspect(field.site,deadline-1).phase,"battle");
    const expired=store.war.inspect(field.site,deadline);
    assert.equal(expired.phase,"open");assert.equal(expired.ownerId,null);
    assert.equal(expired.owner,null);assert.equal(expired.phaseEndsAt,null);
    assert.equal(expired.attacker,null);assert.equal(expired.defender,null);
    assert.throws(()=>store.war.side(field,a,deadline),/war_ended/);
    store.close();store=new GuildStore(file);
    assert.equal(store.war.inspect(field.site,deadline).phase,"open");
    const next=store.war.start(field.site,b,deadline);
    assert.ok(next.seq>field.seq);assert.equal(store.war.inspect(field.site,deadline).phase,"battle");
    assert.equal(store.war.inspect(field.site,deadline).owner,null);
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

test("an incumbent retains ownership after an uncaptured siege times out",()=>{
  const dir=mkdtempSync(path.join(tmpdir(),"montra-war-owner-")),file=path.join(dir,"guilds.sqlite");
  let store=new GuildStore(file);
  try{
    store.create("a","A","Sun");store.create("b","B","Moon");
    const a=store.war.member("a")!,b=store.war.member("b")!,start=100_000;
    const field=store.war.start("river_watch",a,start);
    for(let i=1;i<=WAR_HOLD;i++)store.war.advance(field,start+i*1000,1,0);
    const attackAt=start+WAR_HOLD*1000+WAR_PROTECTION;
    store.war.start(field.site,b,attackAt);
    const deadline=attackAt+WAR_DURATION;
    assert.equal(store.war.inspect(field.site,deadline).ownerId,a.id);
    // This is a defensive victory, not the no-winner case.
    assert.equal(store.war.inspect(field.site,deadline).phase,"protected");
    assert.equal(store.war.inspect(field.site,deadline).phaseEndsAt,deadline+3_600_000);
    store.close();store=new GuildStore(file);
    assert.equal(store.war.inspect(field.site,deadline).owner,"Sun");
    assert.equal(store.war.inspect(field.site,deadline).ownerId,a.id);
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

test("ordinary gates keep separate HP/open state and migrate legacy single-gate rows",()=>{
  const dir=mkdtempSync(path.join(tmpdir(),"montra-gates-")),file=path.join(dir,"guilds.sqlite");
  let store=new GuildStore(file);
  try{
    store.create("a","A","Sun");store.create("b","B","Moon");
    const a=store.war.member("a")!,b=store.war.member("b")!,start=100_000;
    const field=store.war.start("river_watch",a,start);store.war.side(field,b,start,true);
    assert.deepEqual(store.war.inspect(field.site,start).gates,{"south--18":{hp:120,closed:true},"north--22":{hp:120,closed:true}});
    for(let i=0;i<8;i++)store.war.gate(field,"attack",false,start,null,"north--22");
    store.war.gate(field,"defend",false,start,null,"south--18");store.war.gate(field,"defend",false,start,null,"south--18");
    const s=store.war.inspect(field.site,start);
    assert.deepEqual(s.gates,{"south--18":{hp:120,closed:true},"north--22":{hp:0,closed:false}});
    assert.equal(s.gateHp,0);assert.equal(s.gateClosed,true);
    assert.throws(()=>store.war.gate(field,"attack",false,start,null,"missing"),/war_gate_inactive/);
    store.close();store=new GuildStore(file);
    assert.deepEqual(store.war.inspect(field.site,start).gates,s.gates,"per-gate state survives reload");
    // A row written by the previous single-gate schema seeds every gate from gate_hp/gate_open.
    const raw=new DatabaseSync(file);
    raw.prepare("UPDATE territory_battles SET gates_json=NULL,gate_hp=45,gate_open=1 WHERE seq=?").run(field.seq);raw.close();
    assert.deepEqual(store.war.inspect(field.site,start).gates,{"south--18":{hp:45,closed:false},"north--22":{hp:45,closed:false}});
    store.war.gate(field,"defend",false,start,null,"north--22");
    assert.deepEqual(store.war.inspect(field.site,start).gates,{"south--18":{hp:45,closed:false},"north--22":{hp:45,closed:true}});
    // A corrupt gates_json row falls back to gate_hp/gate_open for every gate instead of crashing inspect().
    const bad=new DatabaseSync(file);
    bad.prepare("UPDATE territory_battles SET gates_json='{not json',gate_hp=70,gate_open=0 WHERE seq=?").run(field.seq);bad.close();
    assert.deepEqual(store.war.inspect(field.site,start).gates,{"south--18":{hp:70,closed:true},"north--22":{hp:70,closed:true}});
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

test("pre-migration databases gain gates_json without dropping legacy gate columns",()=>{
  const dir=mkdtempSync(path.join(tmpdir(),"montra-gates-old-")),file=path.join(dir,"guilds.sqlite");
  const old=new DatabaseSync(file);
  old.exec(`CREATE TABLE territory_battles(seq INTEGER PRIMARY KEY,site TEXT NOT NULL,incumbent TEXT,attacker TEXT NOT NULL,defender TEXT,
    started INTEGER NOT NULL,progress REAL NOT NULL DEFAULT 0,sample INTEGER NOT NULL,ended INTEGER,winner TEXT,
    gate_hp INTEGER NOT NULL DEFAULT 120,gate_open INTEGER NOT NULL DEFAULT 0,pilot_json TEXT,city_json TEXT)`);
  old.close();
  const store=new GuildStore(file);
  try{
    const raw=new DatabaseSync(file);
    const cols=raw.prepare("PRAGMA table_info(territory_battles)").all().map(c=>c.name);raw.close();
    for(const c of ["gate_hp","gate_open","gates_json"])assert.ok(cols.includes(c),c);
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
