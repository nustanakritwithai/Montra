import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import path from "node:path";
import type {Client} from "colyseus";
import {MyRoom} from "./MyRoom.js";
import {Player} from "./schema/MyRoomState.js";
import {characterStore} from "./CharacterStore.js";
import {guildStore} from "./GuildStore.js";
import {serviceNpcsFor} from "./ServiceNpcs.js";
import {objectiveRanger,type ForestObjective} from "./ForestObjectives.js";

type Internals={messages:Record<string,(client:Client,message:unknown)=>void>;persistentCharacters:Map<string,string>;forestObjectives:Map<string,ForestObjective>};
test("guide requires a nearby NPC and returns current server war state",async()=>{
  const dir=await mkdtemp(path.join(process.cwd(),"montra-guide-"));
  const mutable=characterStore as unknown as {directory:string},old=mutable.directory;mutable.directory=dir;
  const guild=guildStore();
  try{
    const npc=serviceNpcsFor("moon_pass").find(n=>n.role==="strategy");assert.ok(npc);
    const room=new MyRoom(),inside=room as unknown as Internals,id="guide-player",character="a".repeat(64);
    const player=new Player({characterName:"Tester",mapId:"moon_pass",x:npc.x+20,y:npc.y,z:npc.z,pathId:"seer",ancestryId:"shrine",level:5,alive:true,hp:240});
    room.state.players.set(id,player);inside.persistentCharacters.set(id,character);
    const events:Array<{requestId:number;error?:string;answer?:string}>=[];
    const client={sessionId:id,send:(type:string,data:{requestId:number;error?:string;answer?:string})=>{if(type==="npc_guide_result")events.push(data);}} as unknown as Client;
    inside.messages.ask_npc_guide(client,{npcId:npc.id,question:"ด่านนี้เปิดตีไหม",requestId:1});
    assert.equal(events[0]?.error,"near_npc");
    player.x=npc.x;player.y=npc.y;player.z=npc.z;
    inside.messages.ask_npc_guide(client,{npcId:npc.id,question:"ด่านนี้เปิดตีไหม",requestId:2});
    await new Promise<void>(resolve=>setImmediate(resolve));
    assert.equal(events[1]?.requestId,2);assert.match(events[1]?.answer ?? "",/เปิดให้ท้าชิง/);
    inside.messages.ask_npc_guide(client,{npcId:npc.id,question:"ด่านนี้เปิดตีไหม",requestId:3});
    assert.equal(events[2]?.error,"cooldown");
    const ranger=objectiveRanger("forbidden_forest");assert.ok(ranger);
    const rangerId="guide-quest",rangerPlayer=new Player({characterName:"Tester",mapId:ranger.mapId,x:ranger.x,y:ranger.y,z:ranger.z,pathId:"seer",ancestryId:"shrine",level:4,alive:true,hp:240});
    room.state.players.set(rangerId,rangerPlayer);inside.persistentCharacters.set(rangerId,"b".repeat(64));inside.forestObjectives.set(rangerId,{id:"west",progress:2});
    const questEvents:Array<{answer?:string;error?:string}>=[],questClient={sessionId:rangerId,send:(type:string,data:{answer?:string;error?:string})=>{if(type==="npc_guide_result")questEvents.push(data);}} as unknown as Client;
    inside.messages.ask_npc_guide(questClient,{npcId:`${ranger.mapId}_ranger`,question:"แนะนำภารกิจ",requestId:1});
    await new Promise<void>(resolve=>setImmediate(resolve));
    assert.match(questEvents[0]?.answer ?? "",/2\/8/);
  }finally{guild.close();mutable.directory=old;await rm(dir,{recursive:true,force:true});}
});
