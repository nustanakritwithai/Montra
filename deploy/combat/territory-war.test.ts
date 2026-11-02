import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {tmpdir} from "node:os";
import {mkdtempSync,rmSync} from "node:fs";
import {GuildStore} from "./GuildStore.js";
import {WAR_PROTECTION,WAR_DURATION,WAR_HOLD} from "./TerritoryWar.js";

test("capture progress, contested flags, deadline, independent protection and durable ownership",()=>{
  const dir=mkdtempSync(path.join(tmpdir(),"montra-war-")),file=path.join(dir,"guilds.sqlite");
  let store=new GuildStore(file);
  try{
    store.create("a","A","Moon");store.create("b","B","River");store.add("a","c","C");
    const a=store.war.member("a")!,b=store.war.member("b")!,c=store.war.member("c")!;
    const start=1_000_000;
    assert.throws(()=>store.war.start("moon_pass",c,start),/war_officer/);
    const f=store.war.start("moon_pass",a,start),other=store.war.start("river_watch",b,start);
    assert.throws(()=>store.war.start("moon_pass",b,start),/war_unavailable/);
    assert.equal(store.war.side(f,b,start,true),"defend");
    for(let i=1;i<=4;i++)store.war.advance(f,start+i*1000,2,2);
    assert.equal(store.war.inspect(f.site,start+4000).progress,0);
    store.war.advance(f,start+40_000,5,0);store.war.advance(f,start+40_000,5,0);
    assert.equal(store.war.inspect(f.site,start+40_000).progress,2);
    store.close();store=new GuildStore(file);
    for(let i=1;i<=29;i++)store.war.advance(f,start+40_000+i*1000,5,0);
    const won=start+69_000,reopen=won+WAR_PROTECTION;
    assert.equal(store.war.inspect(f.site,won).owner,"Moon");
    assert.equal(store.war.inspect(other.site,start+WAR_DURATION).owner,null);
    assert.equal(store.war.inspect(f.site,reopen-1).phase,"protected");
    assert.equal(store.war.inspect(other.site,reopen).phase,"protected");
    assert.throws(()=>store.war.start(f.site,a,reopen),/war_unavailable/);
    const next=store.war.start(f.site,b,reopen);
    assert.equal(store.war.side(next,a,reopen),"defend");
    store.war.advance(f,reopen+1000,WAR_HOLD,0);
    assert.equal(store.war.inspect(f.site,reopen+1000).progress,0);
    store.close();store=new GuildStore(file);
    assert.equal(store.war.inspect(f.site,reopen+WAR_DURATION+WAR_PROTECTION).phase,"open");
    assert.equal(store.war.inspect(f.site,reopen+WAR_DURATION+WAR_PROTECTION).owner,"Moon");
    store.leave("c");store.leave("a");
    assert.equal(store.war.inspect(f.site,reopen+WAR_DURATION+WAR_PROTECTION).owner,null);
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
