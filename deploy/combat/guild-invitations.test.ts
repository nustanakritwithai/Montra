import test from "node:test";
import assert from "node:assert/strict";
import {LegacyGuildInvitations} from "./guild-invitations-oracle.js";

test("original invitations replace only recipient or expired entries, with 60-second lifetime",()=>{
  const owner=new LegacyGuildInvitations();
  const a=owner.issue("a","b","g",0),b=owner.issue("a","c","g",1);
  assert.equal(owner.guildInvites.get(a)?.expires,60000);
  const c=owner.issue("d","b","h",2);
  assert.equal(owner.guildInvites.has(a),false);assert.equal(owner.guildInvites.has(b),true);
  assert.deepEqual(owner.accept(c,"b",60001,()=>true),{from:"d",to:"b",guildId:"h",expires:60002});
  owner.issue("e","f","j",60002);assert.equal(owner.guildInvites.size,1);
});
test("original accept consumes only expired entries; decline expiry does not consume",()=>{
  const owner=new LegacyGuildInvitations(),id=owner.issue("a","b","g",0);
  assert.throws(()=>owner.decline(id,"b",60000),/guild_invite_expired/);
  assert.equal(owner.guildInvites.has(id),true);
  assert.throws(()=>owner.accept(id,"wrong",1,()=>true),/guild_invite_expired/);
  assert.throws(()=>owner.accept(id,"b",1,()=>false),/guild_invite_expired/);
  assert.equal(owner.guildInvites.has(id),true);
  owner.accept(id,"b",1,()=>true);assert.equal(owner.guildInvites.has(id),true,"membership must commit first");
  assert.throws(()=>owner.accept(id,"wrong",60000,()=>true),/guild_invite_expired/);
  assert.equal(owner.guildInvites.has(id),false);
});
test("original leave closes each invite after deleting it; transport failure stops subsequent cleanup",()=>{
  const owner=new LegacyGuildInvitations(),a=owner.issue("a","b","g",0),b=owner.issue("a","c","g",0);
  const events:string[]=[];
  assert.throws(()=>owner.leave("a",to=>{events.push(to);assert.equal(owner.guildInvites.has(a),false);throw Error("disconnected");}),/disconnected/);
  assert.deepEqual(events,["b"]);assert.equal(owner.guildInvites.has(b),true);
  owner.leave("c",to=>events.push(to));assert.deepEqual(events,["b","c"]);assert.equal(owner.guildInvites.size,0);
});

import {MyRoom} from "./MyRoom.js";
import type {Client} from "colyseus";
test("original room adapters retain expired decline, consume expired accept and preserve notices",()=>{
  const room=new MyRoom(),inside=room as unknown as {
    guildInvites:GuildInvitations; simulatedMs:number;
    persistentCharacters:Map<string,string>;
    guildAction(client:Client,action:(character:string)=>void):void;
  };
  inside.guildAction=(_client,action)=>action("character");
  const events:unknown[]=[];
  const receiver={sessionId:"b",send:(...args:unknown[])=>events.push(args)} as unknown as Client;
  const sender={sessionId:"a",send:(...args:unknown[])=>events.push(args)} as unknown as Client;
  room.clients.push(sender,receiver);
  let id=inside.guildInvites.issue("a","b","g",0);
  inside.simulatedMs=60000;
  assert.throws(()=>room.messages.guild_decline(receiver,{inviteId:id}),/guild_invite_expired/);
  inside.simulatedMs=0;
  room.messages.guild_decline(receiver,{inviteId:id});
  assert.deepEqual(events,[["guild_invitation_closed",{}],["guild_notice",{reason:"invitation_declined"}]]);
  id=inside.guildInvites.issue("a","b","g",0);
  inside.simulatedMs=60000;
  assert.throws(()=>room.messages.guild_accept(receiver,{inviteId:id}),/guild_invite_expired/);
  inside.simulatedMs=0;
  assert.throws(()=>room.messages.guild_decline(receiver,{inviteId:id}),/guild_invite_expired/);
});

import {GuildInvitations} from "./GuildInvitations.js";

test("owner matches frozen lifecycle across replacement, expiry, decline, completion and interrupted disconnect",()=>{
  const old=new LegacyGuildInvitations(),owner=new GuildInvitations();
  const pairs:Array<[string,string]>=[];
  const snapshot=()=>{
    const actual=(owner as unknown as {invitations:Map<string,unknown>}).invitations;
    assert.deepEqual([...actual.values()],[...old.guildInvites.values()]);
  };
  const outcome=(fn:()=>unknown)=>{try{return {value:fn()};}catch(error){return {error:(error as Error).message};}};
  let seed=3091;
  const random=(n:number)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
  for(let step=0;step<900;step++){
    const now=random(4)*30000,from=`p${random(4)}`,to=`p${random(4)}`,action=random(7);
    if(action===0 || !pairs.length){
      pairs.push([old.issue(from,to,"g",now),owner.issue(from,to,"g",now)]);
    }else{
      const [a,b]=pairs[random(pairs.length)];
      if(action===1){
        const available=Boolean(random(2));
        assert.deepEqual(outcome(()=>owner.prepareAccept(b,to,now,()=>available?"leader":undefined).invite),outcome(()=>old.accept(a,to,now,()=>available)));
      }else if(action===2){
        assert.deepEqual(outcome(()=>owner.decline(b,to,now)),outcome(()=>old.decline(a,to,now)));
      }else if(action===3){old.complete(a);owner.complete(b);
      }else if(action===4 || action===5){
        const traces=[[],[]] as string[][];
        const closed=(n:number)=>(target:string)=>{traces[n].push(target);if(action===5)throw Error("transport");};
        assert.deepEqual(outcome(()=>owner.leave(from,closed(0))),outcome(()=>old.leave(from,closed(1))));
        assert.deepEqual(traces[0],traces[1]);
      }else {old.clear();owner.clear();}
    }
    snapshot();
  }
});

test("invitations are room-local and acceptance remains retryable until membership commits",()=>{
  const a=new GuildInvitations(),b=new GuildInvitations(),id=a.issue("leader","member","guild",0);
  assert.throws(()=>b.prepareAccept(id,"member",1,()=>"character"),/guild_invite_expired/);
  assert.throws(()=>{
    a.prepareAccept(id,"member",1,()=>"character");
    throw Error("membership write failed");
  },/membership write failed/);
  assert.equal(a.prepareAccept(id,"member",1,()=>"character").leader,"character");
  a.complete(id);
  assert.throws(()=>a.prepareAccept(id,"member",1,()=>"character"),/guild_invite_expired/);
  const next=a.issue("leader","member","guild",2);a.clear();
  assert.throws(()=>a.decline(next,"member",3),/guild_invite_expired/);
});
