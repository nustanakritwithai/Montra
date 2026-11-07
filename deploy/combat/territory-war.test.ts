import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {tmpdir} from "node:os";
import {mkdtempSync,rmSync} from "node:fs";
import {GuildStore} from "./GuildStore.js";
import {WAR_PROTECTION,WAR_DURATION,WAR_HOLD,warEntryDamageFactor,warParticipationExperience} from "./TerritoryWar.js";

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
    store.war.gate(f,"defend",false,start);assert.equal(store.war.inspect(f.site,start).gateClosed,false);
    assert.throws(()=>store.war.gate(f,"defend",true,start),/occupied/);
    store.war.gate(f,"defend",false,start);store.war.gate(f,"attack",false,start);
    for(let i=1;i<=4;i++)store.war.advance(f,start+i*1000,2,2);
    assert.equal(store.war.inspect(f.site,start+4000).progress,0);
    store.war.advance(f,start+40_000,5,0);store.war.advance(f,start+40_000,5,0);
    assert.equal(store.war.inspect(f.site,start+40_000).progress,2);
    store.close();store=new GuildStore(file);
    assert.equal(store.war.inspect(f.site,start+40_000).gateHp,105);
    for(let i=0;i<7;i++)store.war.gate(f,"attack",false,start+40_000);
    assert.equal(store.war.inspect(f.site,start+40_000).gateClosed,false);
    for(let i=1;i<=29;i++)store.war.advance(f,start+40_000+i*1000,5,0);
    const won=start+69_000,reopen=won+WAR_PROTECTION;
    assert.equal(store.war.inspect(f.site,won).owner,"Moon");
    assert.equal(store.war.inspect(f.site,won).phaseEndsAt,reopen);
    assert.equal(store.war.inspect(other.site,start+WAR_DURATION).owner,null);
    assert.equal(store.war.inspect(f.site,reopen-1).phase,"protected");
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
    store.close();store=new GuildStore(file);
    assert.equal(store.war.inspect(field.site,deadline).owner,"Sun");
    assert.equal(store.war.inspect(field.site,deadline).ownerId,a.id);
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
