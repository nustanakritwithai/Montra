import test from "node:test";
import assert from "node:assert/strict";
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
    assert.throws(()=>db.add(member,other,"อื่น"),/guild_leader_only/);
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
