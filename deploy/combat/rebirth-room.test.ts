import test from "node:test";
import assert from "node:assert/strict";
import type {Client} from "colyseus";
import {MyRoom} from "./MyRoom.js";
import {Player} from "./schema/MyRoomState.js";
import {CommandBucket} from "./GameRules.js";
import {characterStore, type CharacterSnapshot} from "./CharacterStore.js";
import {makeClassInventory, type InventorySnapshot} from "./ItemRules.js";
import {serviceNpcsFor} from "./ServiceNpcs.js";
import {DEFAULT_MAP_ID} from "./WorldMaps.js";

type Internals={messages:Record<string,(client:Client,message:unknown)=>void>;persistentCharacters:Map<string,string>;
  inventories:Map<string,InventorySnapshot>;gates:Map<string,{build:CommandBucket}>;pendingItemUses:Map<string,Promise<void>>};

for(const fails of [false,true])test(`rebirth ${fails?"preserves old state when save fails":"saves before changing class"}`,async()=>{
  const room=new MyRoom(),internal=room as unknown as Internals,id="rebirth-session";
  const mentor=serviceNpcsFor(DEFAULT_MAP_ID).find(npc=>npc.role==="mentor");assert.ok(mentor);
  const player=new Player({characterName:"Tester",mapId:DEFAULT_MAP_ID,x:mentor.x,y:mentor.y,z:mentor.z,
    pathId:"sentinel",ancestryId:"shrine",level:100,alive:true,hp:240});
  room.state.players.set(id,player);internal.persistentCharacters.set(id,"a".repeat(64));
  internal.inventories.set(id,makeClassInventory("sentinel"));internal.gates.set(id,{build:new CommandBucket(3,1)});
  const events:string[]=[];const client={sessionId:id,send:(kind:string)=>events.push(kind)} as unknown as Client;
  const original=characterStore.save;let saved:CharacterSnapshot|undefined,unblock!:()=>void;
  const barrier=new Promise<void>(resolve=>{unblock=resolve;});
  characterStore.save=async snapshot=>{saved=structuredClone(snapshot);await barrier;if(fails)throw Error("disk failed");};
  try{
    internal.messages.start_rebirth(client,{path:"seer"});
    const pending=internal.pendingItemUses.get(id);assert.ok(pending);assert.equal(player.level,100);assert.equal(player.pathId,"sentinel");
    unblock();await pending;
    assert.equal(saved?.build?.path,"seer");
    assert.equal(player.level,fails?100:1);assert.equal(player.pathId,fails?"sentinel":"seer");
    assert.ok(events.includes(fails?"command_rejected":"rebirth_complete"));
  }finally{unblock();characterStore.save=original;}
});
