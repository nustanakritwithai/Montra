import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {DatabaseSync} from "node:sqlite";
import { GuildStore, parseGuildName } from "./GuildStore.js";

test("guild creation, membership, leadership and removal are durable and authoritative",()=>{
  const db=new GuildStore(":memory:");
  const leader="a".repeat(64),member="b".repeat(64),other="c".repeat(64);
  try{
    assert.equal(parseGuildName({name:"  นาคพิทักษ์  "}),"นาคพิทักษ์");
    assert.equal(parseGuildName({name:"<script>"}),null);
    assert.equal(parseGuildName({name:"ก"}),null);
    assert.equal(parseGuildName({name:"valid",leader}),null);
    db.create(leader,"หัวหน้า","นาคพิทักษ์");
    assert.throws(()=>db.create(other,"อื่น","นาคพิทักษ์"),/guild_name_taken/);
    assert.throws(()=>db.create(leader,"หัวหน้า","อีกกิลด์"),/guild_already_member/);
    db.add(leader,member,"สมาชิก");
    assert.throws(()=>db.add(member,other,"อื่น"),/guild_officer_required/);
    assert.throws(()=>db.add(leader,member,"สมาชิก"),/guild_already_member/);
    const view=db.view(leader,id=>id===leader)!;
    assert.equal(view.members.length,2);assert.equal(view.ownId,view.leaderId);
    assert.ok(view.members[0].online);assert.ok(!view.members[1].online);
    assert.ok(!JSON.stringify(view).includes(leader));
    assert.throws(()=>db.leave(leader),/guild_transfer_first/);
    assert.throws(()=>db.manage(member,view.ownId,"kick"),/guild_leader_only/);
    db.manage(leader,view.members[1].id,"transfer");
    assert.equal(db.view(member,()=>false)!.leaderId,view.members[1].id);
    db.manage(member,view.ownId,"kick");
    assert.equal(db.view(leader,()=>false),null);
    assert.equal(db.rename(member,"ชื่อใหม่"),true);
    assert.equal(db.view(member,()=>false)!.members[0].name,"ชื่อใหม่");
    db.leave(member);assert.equal(db.view(member,()=>false),null);
    db.create(other,"อื่น","นาคพิทักษ์");
  }finally{db.close();}
});

test("membership cap rejects the next join without altering the guild",()=>{
  const db=new GuildStore(":memory:"),leader="0".repeat(64);
  try{
    db.create(leader,"หัวหน้า","สมาคม");
    for(let i=1;i<30;i++)db.add(leader,i.toString(16).padStart(64,"0"),"สมาชิก "+i);
    assert.throws(()=>db.add(leader,"f".repeat(64),"เกิน"),/guild_full/);
    assert.equal(db.view(leader,()=>false)!.members.length,30);
    assert.equal(db.view("f".repeat(64),()=>false),null);
  }finally{db.close();}
});

test("existing guild data migrates without changing leadership, names or membership",()=>{
  const directory=mkdtempSync(path.join(tmpdir(),"montra-guild-migration-"));
  const file=path.join(directory,"guilds.sqlite"),old=new DatabaseSync(file);
  const leader="a".repeat(64),member="b".repeat(64);
  try{
    old.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE guilds(id TEXT PRIMARY KEY,name TEXT NOT NULL,name_key TEXT NOT NULL UNIQUE,leader TEXT NOT NULL);
      CREATE TABLE guild_members(member_id TEXT PRIMARY KEY,character_id TEXT NOT NULL UNIQUE,
        guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,name TEXT NOT NULL);`);
    old.prepare("INSERT INTO guilds VALUES(?,?,?,?)").run("guild1","นาค","นาค",leader);
    old.prepare("INSERT INTO guild_members VALUES(?,?,?,?)").run("leader1",leader,"guild1","หัวหน้า");
    old.prepare("INSERT INTO guild_members VALUES(?,?,?,?)").run("member1",member,"guild1","สมาชิก");
    old.close();
    for(let i=0;i<2;i++){
      const store=new GuildStore(file);
      try{
        const view=store.view(leader,()=>false)!;
        assert.equal(view.id,"guild1");assert.equal(view.leaderId,"leader1");
        assert.deepEqual(view.members.map(m=>[m.id,m.rank,m.squad,m.specialty]),
          [["leader1","commander",null,"none"],["member1","member",null,"none"]]);
      }finally{store.close();}
    }
  }finally{rmSync(directory,{recursive:true,force:true});}
});

test("commander appoints ranks, officers organize lower ranks, and squad limits hold",()=>{
  const store=new GuildStore(":memory:"),leader="0".repeat(64),people=Array.from({length:8},(_,i)=>(i+1).toString(16).padStart(64,"0"));
  try{
    store.create(leader,"หัวหน้า","กองทัพ");
    for(const [index,id] of people.entries())store.add(leader,id,"สมาชิก "+index);
    const view=store.view(leader,()=>false)!,member=(i:number)=>view.members[i+1].id;
    assert.throws(()=>store.assign(people[0],member(1),"squad",1),/guild_officer_required/);
    assert.throws(()=>store.assign(leader,member(1),"rank","squad_leader"),/guild_squad_required/);
    store.assign(leader,member(0),"rank","officer");
    store.assign(people[0],member(1),"squad",1);
    store.assign(people[0],member(1),"specialty","scout");
    assert.throws(()=>store.assign(people[0],member(1),"rank","squad_leader"),/guild_leader_only/);
    store.assign(leader,member(1),"rank","squad_leader");
    store.assign(leader,member(2),"squad",1);
    assert.throws(()=>store.assign(leader,member(2),"rank","squad_leader"),/guild_squad_leader_exists/);
    for(const i of [3,4,5])store.assign(people[0],member(i),"squad",1);
    assert.throws(()=>store.assign(leader,member(6),"squad",1),/guild_squad_full/);
    assert.throws(()=>store.assign(leader,member(1),"squad",null),/guild_squad_required/);
    assert.throws(()=>store.assign(people[0],view.ownId,"specialty","engineer"),/guild_officer_required/);
    assert.throws(()=>store.assign(leader,member(1),"specialty","administrator"),/guild_invalid_assignment/);
    const updated=store.view(leader,()=>false)!;
    assert.deepEqual([updated.members[2].rank,updated.members[2].squad,updated.members[2].specialty],["squad_leader",1,"scout"]);
    store.manage(leader,member(1),"transfer");
    const transferred=store.view(people[1],()=>false)!;
    assert.equal(transferred.members.find(m=>m.id===member(1))!.rank,"commander");
    assert.equal(transferred.members.find(m=>m.id===view.ownId)!.rank,"member");
    store.manage(people[1],view.ownId,"transfer");
    assert.equal(store.view(leader,()=>false)!.members.find(m=>m.id===member(1))!.rank,"member");
  }finally{store.close();}
});
