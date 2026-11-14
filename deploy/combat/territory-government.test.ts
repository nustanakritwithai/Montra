import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {GuildStore} from "./GuildStore.js";
import {parseGovernmentOrder,type GovernmentOrder} from "./TerritoryGovernment.js";
import {WAR_DURATION,WAR_PROTECTION} from "./TerritoryWar.js";

const hour=3_600_000, site="moon_pass", origin=100_000;
function take(s:GuildStore,place:string,actor:string,start:number){
  const field=s.war.start(place,s.war.member(actor)!,start);
  for(let n=1;n<=30;n++)s.war.advance(field,start+n*1000,2,0);
  return start+30_000;
}
function view(s:GuildStore,who:string,at:number,place=site){
  return s.war.government.view(place,s.war.member(who),at)!;
}
function act(s:GuildStore,who:string,at:number,action:GovernmentOrder["action"],place=site){
  const revision=view(s,who,at,place).revision;
  s.war.govern(who,{site:place,revision,action},at);
}
function fixture(run:(s:GuildStore,file:string)=>void){
  const dir=mkdtempSync(path.join(tmpdir(),"montra-estate-")),file=path.join(dir,"guilds.sqlite"),s=new GuildStore(file);
  try{s.create("a","A","Moon");s.create("b","B","River");run(s,file);}
  finally{s.close();rmSync(dir,{recursive:true,force:true});}
}

test("income uses server time, keeps the fraction across a rate change, enforces roles and rejects a replay from another connection",()=>fixture((s,file)=>{
  s.add("a","off","Officer");s.add("a","m","Member");
  const officer=s.view("off",()=>false)!;s.assign("a",officer.ownId,"rank","officer");
  const end=take(s,site,"a",origin),at=end+4*hour+30_000;
  assert.equal(view(s,"a",at).available,240);assert.equal(view(s,"b",at),undefined);
  const collect={site,revision:view(s,"a",at).revision,action:"collect"} as const;
  assert.throws(()=>s.war.govern("m",collect,at),/role/);
  assert.throws(()=>s.war.govern("b",collect,at),/owner/);
  s.war.govern("off",collect,at);
  const second=new GuildStore(file);
  try{
    assert.throws(()=>second.war.govern("off",collect,at),/stale/);
    assert.equal(view(second,"m",at).balance,240);
    assert.throws(()=>act(second,"off",at,"market"),/role/);
    act(second,"a",at,"market");
    assert.equal(view(s,"a",at).rate,75);assert.equal(view(s,"a",at).balance,0);
    assert.equal(view(s,"a",at+23_999).available,0);act(s,"a",at+24_000,"collect");
    assert.equal(view(second,"a",at+24_000).balance,1);
    assert.equal(view(second,"a",at).available,0);
    const before=view(s,"a",at+24_000);
    assert.throws(()=>act(s,"a",at+24_000,"warehouse"),/funds/);
    assert.deepEqual(view(s,"a",at+24_000),before);
  }finally{second.close();}
}));

test("city policy charges the commander and preserves accumulated income",()=>fixture((s)=>{
  const end=take(s,site,"a",origin),at=end+2*hour;
  act(s,"a",at,"collect");assert.equal(view(s,"a",at).balance,120);
  act(s,"a",at,"focus_trade");assert.equal(view(s,"a",at).rate,72);assert.equal(view(s,"a",at).balance,60);
  assert.throws(()=>act(s,"a",at,"focus_trade"),/unchanged/);
  act(s,"a",at+hour,"focus_storage");const estate=view(s,"a",at+hour);
  assert.equal(estate.available,72);assert.equal(estate.rate,60);assert.equal(estate.hours,12);assert.equal(estate.balance,0);
  assert.ok(estate.history.some(entry=>entry.reason==="focus_storage" && entry.amount===-60));
}));

test("deliveries are battle-bound, rate-limited, and pay the winner only once",()=>fixture((s,file)=>{
  const field=s.war.start(site,s.war.member("a")!,origin),token="11111111-1111-4111-8111-111111111111";
  s.war.deliverSupply(field,"a","attack",token,origin+9000);
  assert.throws(()=>s.war.deliverSupply(field,"a","attack",token,origin+10_000),/duplicate/);
  assert.throws(()=>s.war.deliverSupply(field,"a","attack","22222222-2222-4222-8222-222222222222",origin+10_000),/cooldown/);
  assert.throws(()=>s.war.deliverSupply(field,"b","attack","33333333-3333-4333-8333-333333333333",origin+10_000),/side|ended/);
  const second=new GuildStore(file);
  try{assert.equal(second.war.supplyCount(field,s.war.member("a")!.id),1);}finally{second.close();}
  for(let n=1;n<=30;n++)s.war.advance(field,origin+10_000+n*1000,2,0);
  const at=origin+40_000;
  assert.equal(view(s,"a",at).balance,5);
  s.war.inspect(site,at+hour);assert.equal(view(s,"a",at+hour).balance,5);
}));

test("conquest closes the old account once, preserves buildings and credits the next guild only from the result",()=>fixture((s,file)=>{
  const end=take(s,site,"a",origin),at=end+8*hour;
  assert.equal(view(s,"a",at+48*hour).available,480);
  act(s,"a",at,"collect");act(s,"a",at,"market");act(s,"a",at,"warehouse");
  assert.equal(view(s,"a",at).cap,900);assert.equal(view(s,"a",at).balance,60);
  const battle=s.war.start(site,s.war.member("b")!,at);
  assert.throws(()=>act(s,"a",at,"collect"),/battle/);
  // Damage an actual defending gate. The warehouse's extra capacity can be repaired during peace.
  for(let i=0;i<8;i++)s.war.gate(battle,"attack",false,at+i);
  for(let i=1;i<=30;i++)s.war.advance(battle,at+i*1000,2,0);
  const handover=at+30_000;
  assert.equal(view(s,"a",handover),undefined);assert.equal(view(s,"b",handover).available,0);
  assert.equal(view(s,"b",handover).market,2);assert.equal(view(s,"b",handover).warehouse,2);
  assert.equal(view(s,"b",handover).hours,8);assert.equal(view(s,"b",handover).damaged,true);
  const reader=new DatabaseSync(file);
  try{
    const entry=reader.prepare("SELECT delta FROM guild_treasury_entries WHERE reason='handover'").all();
    assert.deepEqual(entry.map(e=>e.delta),[30_000*75]); // exact fractional income belongs to the former owner
    s.war.inspect(site,handover);s.war.advance(battle,handover+1000,2,0);
    assert.equal(reader.prepare("SELECT count(*) AS n FROM guild_treasury_entries WHERE reason='handover'").get()!.n,1);
  }finally{reader.close();}
  const later=handover+4*hour;act(s,"b",later,"collect");
  assert.throws(()=>act(s,"b",later,"workshop"),/repair_first/);
  act(s,"b",later,"repair");assert.equal(view(s,"b",later).hours,12);
  act(s,"b",later,"workshop");assert.equal(view(s,"b",later).repairCost,40);
  assert.equal(view(s,"b",later).balance,120);
  assert.equal(s.view("a",()=>false)!.treasury,60);
  const other=take(s,"river_watch","b",later);assert.equal(view(s,"b",other,"river_watch").market,1);
  assert.equal(view(s,"b",other,"river_watch").balance,120);
  act(s,"b",other,"workshop","river_watch");
  assert.equal(view(s,"b",other).balance,0);
  s.leave("b");assert.equal(s.war.inspect(site,other).ownerId,null);
  const end2=take(s,site,"a",handover+WAR_PROTECTION+1);
  assert.equal(view(s,"a",end2).available,0);assert.equal(view(s,"a",end2).market,2);
}));

test("legacy owners start at migration and idle defence keeps existing capped income",()=>fixture((s,file)=>{
  const end=take(s,site,"a",origin);const db=new DatabaseSync(file);
  try{db.exec("DROP TABLE guild_treasury_entries; DROP TABLE guild_treasuries; DROP TABLE territory_estates");}finally{db.close();}
  const migrate=Date.now();const upgraded=new GuildStore(file);
  try{
    assert.equal(view(upgraded,"a",migrate).available,0);const next=migrate+2*hour+1000;
    assert.equal(view(upgraded,"a",next).available,120);const f=upgraded.war.start(site,upgraded.war.member("b")!,next);
    const deadline=next+WAR_DURATION;
    assert.equal(upgraded.war.inspect(site,deadline+9*hour).phase,"open");
    assert.equal(upgraded.war.inspect(site,deadline+9*hour).seq,f.seq);assert.equal(view(upgraded,"a",deadline+9*hour).available,480);
    assert.ok(end+WAR_PROTECTION<migrate);
    const again=new GuildStore(file);try{assert.equal(view(again,"a",next+20*hour).available,480);}finally{again.close();}
  }finally{upgraded.close();}
}));

test("a failed treasury write rolls back the battle result and a retry settles it exactly once",()=>fixture((s,file)=>{
  const end=take(s,site,"a",origin),start=end+WAR_PROTECTION;
  const f=s.war.start(site,s.war.member("b")!,start);
  for(let i=1;i<30;i++)s.war.advance(f,start+i*1000,2,0);
  const db=new DatabaseSync(file);
  try{
    db.exec("CREATE TRIGGER fixture_failure BEFORE INSERT ON guild_treasury_entries BEGIN SELECT RAISE(ABORT,'injected_failure'); END");
    assert.throws(()=>s.war.advance(f,start+30_000,2,0),/injected_failure/);
    assert.equal(s.war.inspect(site,start+30_000).phase,"battle");
    assert.equal(s.war.government.balance(s.war.member("a")!.id),0);
    db.exec("DROP TRIGGER fixture_failure");s.war.advance(f,start+30_000,2,0);
    assert.equal(s.war.inspect(site,start+30_000).owner,"River");
    assert.equal(s.war.government.balance(s.war.member("a")!.id),60);
  }finally{db.close();}
}));
test("all three buildings stop at level three and full storage never banks time for later",()=>fixture(s=>{
  const end=take(s,site,"a",origin);
  let at=end;
  for(const kind of ["market","market","warehouse","warehouse","workshop","workshop"] as const){
    at+=24*hour;const full=view(s,"a",at);
    assert.equal(full.available,full.cap);act(s,"a",at,"collect");
    act(s,"a",at,kind);assert.equal(view(s,"a",at).available,0);
  }
  const max=view(s,"a",at);assert.deepEqual([max.rate,max.hours,max.cap,max.repairCost],[90,16,1440,20]);
  for(const kind of ["market","warehouse","workshop"] as const)assert.throws(()=>act(s,"a",at,kind),/max/);
  assert.deepEqual(view(s,"a",at),max);
}));
test("invalid orders cannot set money, timestamps, ownership or SQL building names",()=>{
  for(const value of [null,[],{site,action:"constructor",revision:1},{site,action:"collect",revision:1,amount:100},
    {site,action:"collect",revision:-1},{site,action:"market",revision:1.5}])assert.equal(parseGovernmentOrder(value),null);
  assert.deepEqual(parseGovernmentOrder({site,action:"warehouse",revision:3}),{site,action:"warehouse",revision:3});
});
