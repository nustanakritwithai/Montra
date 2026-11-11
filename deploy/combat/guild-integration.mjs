import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {Client} from "@colyseus/sdk";

const url=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(url??"") || !dir ||
  !/^montra-(guild|monster)-test-/.test(path.basename(dir)))throw Error("Requires an isolated local test server");
const active=new Set(),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const token=i=>"mt1_"+createHash("sha256").update("guild-test-character-"+i).digest("hex");
async function waitFor(fn,label,timeout=10000){
  const end=Date.now()+timeout;
  while(Date.now()<end){const value=fn();if(value)return value;await sleep(40);}
  throw Error("timeout: "+label);
}
async function seed(i){
  const id=createHash("sha256").update(token(i)).digest("hex"),slots=Array(12).fill(null);
  slots[0]={itemId:"health_potion",quantity:2};slots[1]={itemId:"ritual_dagger",quantity:1};
  await writeFile(path.join(dir,id+".json"),JSON.stringify({version:1,id,name:"นักเดินทาง "+i,
    level:12,experience:0,pkKills:0,pkDeaths:0,x:0,y:0,z:0,hp:416,mapId:"ritual_village",
    inventory:{version:1,slots,equippedWeaponSlot:1},updatedAt:new Date().toISOString()}),{flag:"wx"});
}
async function join(i,roomId){
  const sdk=new Client(url),opts={guestToken:token(i),worldVersion:1,templeVersion:1,atlasVersion:1};
  const room=roomId?await sdk.joinById(roomId,opts):await sdk.create("my_room",opts);
  active.add(room);const events=[];room.onMessage("*",(type,data)=>events.push({type,data}));
  await waitFor(()=>room.state?.players?.get(room.sessionId),"join");
  assert.equal(room.state.guildAvailable,true);
  return {room,events};
}
async function leave(client){await client.room.leave();active.delete(client.room);await sleep(150);}
async function event(client,type,condition=()=>true){
  const found=await waitFor(()=>client.events.find(e=>e.type===type && condition(e.data)),type);
  return found.data;
}
async function send(client,type,data,expect,condition=()=>true){
  client.events.length=0;client.room.send(type,data);return event(client,expect,condition);
}
try{
  if(process.env.MONTRA_GUILD_STAGE==="read"){
    const member=await join(2);
    const state=await send(member,"get_guild",{},"guild_state",x=>x?.name==="นาคพิทักษ์");
    assert.equal(state.members.length,2);
    assert.equal(state.ownId,state.leaderId);
    assert.ok(state.members.some(m=>m.name==="นักเดินทาง 1" && !m.online));
    assert.ok(state.members.some(m=>m.name==="นักเดินทาง 1" && m.rank==="squad_leader" && m.squad===3 && m.specialty==="scout"));

    await leave(member);
    const oldLeader=await join(1);
    const restored=await send(oldLeader,"get_guild",{},"guild_state",x=>x?.name==="นาคพิทักษ์");
    assert.notEqual(restored.ownId,restored.leaderId);
    await leave(oldLeader);
    console.log("PASS guild ownership and membership survive server restart");
  }else{
    for(let i=1;i<=4;i++)await seed(i);
    const leader=await join(1),member=await join(2,leader.room.roomId),outsider=await join(3,leader.room.roomId);
    const guild=await send(leader,"guild_create",{name:"นาคพิทักษ์"},"guild_state",x=>x?.name==="นาคพิทักษ์");
    assert.equal(guild.ownId,guild.leaderId);assert.equal(guild.members.length,1);
    await send(outsider,"guild_create",{name:"นาคพิทักษ์"},"guild_error",x=>x?.reason==="guild_name_taken");
    await send(leader,"guild_invite",{targetId:member.room.sessionId},"guild_notice");
    const invitation=await event(member,"guild_invitation");
    await send(outsider,"guild_accept",{inviteId:invitation.inviteId},"guild_error",x=>x?.reason==="guild_invite_expired");
    // A wrong recipient cannot consume or invalidate another player's invitation.
    const accepted=await send(member,"guild_accept",{inviteId:invitation.inviteId},"guild_state",x=>x?.members?.length===2);
    assert.equal(accepted.name,"นาคพิทักษ์");
    assert.notEqual(accepted.ownId,accepted.leaderId);
    const player = client => client.room.state.players.get(client.room.sessionId);
    const baseDefense = new Map([member,leader,outsider].map(client=>[client,[player(client).def,player(client).magicDef]]));
    for (const teammate of [outsider, leader]) {
      teammate.events.length=0;
      await send(member,"party_invite",{targetId:teammate.room.sessionId},"party_notice");
      const invite = await event(teammate,"party_invitation");
      await send(teammate,"party_accept",{inviteId:invite.inviteId},"party_state",v=>v.leaderId===member.room.sessionId);
    }
    await send(leader,"plant_war_banner",{},"command_rejected",v=>v.reason==="war_banner_leader_required");
    leader.events.length=0;
    await send(member,"plant_war_banner",{x:99,def:100},"command_rejected",v=>v.reason==="invalid_war_banner");
    const planted = await send(member,"plant_war_banner",{},"war_banner_state",v=>v.buffed);
    assert.equal(planted.canPlant,true);
    assert.equal(planted.banner.ownerId,member.room.sessionId);
    assert.equal(planted.banner.radius,12);
    assert.equal((await event(leader,"war_banner_state",v=>v.buffed)).canPlant,false);
    const stranger = await send(outsider,"get_war_banner",{},"war_banner_state");
    assert.deepEqual(stranger,{canPlant:false,buffed:false,banner:null});
    for (const teammate of [member, leader]) {
      const [def,magicDef] = baseDefense.get(teammate);
      await waitFor(()=>player(teammate).def===Math.round(def*1.1) &&
        player(teammate).magicDef===Math.round(magicDef*1.1),"authoritative banner defenses");
    }
    assert.deepEqual([player(outsider).def,player(outsider).magicDef],baseDefense.get(outsider));
    await send(leader,"move",{x:-14,z:0},"war_banner_state",v=>!v.buffed && v.banner?.id===planted.banner.id);
    const [leaderDef,leaderMagicDef] = baseDefense.get(leader);
    await waitFor(()=>player(leader).def===leaderDef && player(leader).magicDef===leaderMagicDef,"remove defense out of range");
    await send(leader,"move",{x:planted.banner.x,z:planted.banner.z},"war_banner_state",v=>v.buffed);
    await waitFor(()=>player(leader).def===Math.round(leaderDef*1.1),"restore defense in range");
    await send(member,"plant_war_banner",{},"command_rejected",v=>v.reason==="war_banner_active");
    leader.events.length=0;
    outsider.events.length=0;
    await send(member,"party_leave",{},"party_state",v=>v.leaderId===null);
    await event(leader,"war_banner_state",v=>!v.buffed && v.banner===null);
    const [def,magicDef] = baseDefense.get(leader);
    await waitFor(()=>player(leader).def===def && player(leader).magicDef===magicDef,"remove defense on leadership change");
    await event(outsider,"party_state",v=>v.leaderId===outsider.room.sessionId);
    await send(outsider,"plant_war_banner",{},"command_rejected",v=>v.reason==="war_banner_leader_required");
    await send(outsider,"party_leave",{},"party_state",v=>v.leaderId===null);
    await send(leader,"party_leave",{},"party_state",v=>v.leaderId===null);
    console.log("PASS banner: party leader must belong to a guild, buff is guild-local and ends on leader change");
    await send(leader,"guild_assign",{memberId:accepted.ownId,kind:"rank",value:"officer"},"guild_state",x=>x?.members?.some(m=>m.id===accepted.ownId && m.rank==="officer"));
    await send(member,"guild_invite",{targetId:outsider.room.sessionId},"guild_notice");
    const stale=await event(outsider,"guild_invitation");
    await send(leader,"guild_assign",{memberId:accepted.ownId,kind:"rank",value:"member"},"guild_state",x=>x?.members?.some(m=>m.id===accepted.ownId && m.rank==="member"));
    await send(outsider,"guild_accept",{inviteId:stale.inviteId},"guild_error",x=>x?.reason==="guild_invite_expired");
    await send(member,"guild_invite",{targetId:outsider.room.sessionId},"guild_error",x=>x?.reason==="guild_officer_required");
    await sleep(1300);
    await send(leader,"guild_assign",{memberId:accepted.ownId,kind:"rank",value:"officer"},"guild_state",x=>x?.members?.some(m=>m.id===accepted.ownId && m.rank==="officer"));
    outsider.events.length=0;
    await send(member,"guild_invite",{targetId:outsider.room.sessionId},"guild_notice");
    const valid=await event(outsider,"guild_invitation");
    await send(outsider,"guild_accept",{inviteId:valid.inviteId},"guild_state",x=>x?.members?.length===3);
    const updated=await send(member,"get_guild",{},"guild_state",x=>x?.members?.length===3);
    const target=updated.members.find(m=>m.name==="นักเดินทาง 3");
    await send(member,"guild_assign",{memberId:target.id,kind:"squad",value:2},"guild_state",x=>x?.members?.some(m=>m.id===target.id && m.squad===2));
    await send(member,"guild_assign",{memberId:target.id,kind:"specialty",value:"engineer"},"guild_state",x=>x?.members?.some(m=>m.id===target.id && m.specialty==="engineer"));
    await send(member,"guild_assign",{memberId:target.id,kind:"rank",value:"squad_leader"},"guild_error",x=>x?.reason==="guild_leader_only");
    await send(outsider,"guild_leave",{},"guild_state",x=>x===null);
    await sleep(1300);
    await send(member,"guild_manage",{memberId:accepted.leaderId,action:"kick"},"guild_error",x=>x?.reason==="guild_leader_only");
    await send(leader,"guild_leave",{},"guild_error",x=>x?.reason==="guild_transfer_first");
    const changed=await send(leader,"guild_manage",{memberId:accepted.ownId,action:"transfer"},"guild_state",x=>x?.leaderId===accepted.ownId);
    assert.equal(changed.members.length,2);
    await send(member,"guild_assign",{memberId:changed.ownId,kind:"squad",value:3},"guild_state",x=>x?.members?.some(m=>m.id===changed.ownId && m.squad===3));
    await send(member,"guild_assign",{memberId:changed.ownId,kind:"specialty",value:"scout"},"guild_state",x=>x?.members?.some(m=>m.id===changed.ownId && m.specialty==="scout"));
    await send(member,"guild_assign",{memberId:changed.ownId,kind:"rank",value:"squad_leader"},"guild_state",x=>x?.members?.some(m=>m.id===changed.ownId && m.rank==="squad_leader"));

    await leave(member);
    const remote=await join(2);
    const crossRoom=await send(remote,"get_guild",{},"guild_state",x=>x?.name==="นาคพิทักษ์");
    assert.equal(crossRoom.ownId,crossRoom.leaderId);assert.ok(crossRoom.members.some(m=>m.name==="นักเดินทาง 1" && m.online));
    await leave(remote);await leave(outsider);await leave(leader);
    console.log("PASS guild invite, authorization, leadership, cross-room membership and disconnect");
  }
}finally{await Promise.allSettled([...active].map(room=>room.leave()));}
