import test from "node:test";
import assert from "node:assert/strict";
import type {Client} from "colyseus";
import {MyRoom} from "./MyRoom.js";
import {Player} from "./schema/MyRoomState.js";
import {CommandBucket} from "./GameRules.js";
import {characterStore, type CharacterSnapshot} from "./CharacterStore.js";
import {makeClassInventory, type InventorySnapshot} from "./ItemRules.js";
import {objectiveRanger, type ForestObjective} from "./ForestObjectives.js";

type Internals={messages:Record<string,(client:Client,message:unknown)=>void>;persistentCharacters:Map<string,string>;
  inventories:Map<string,InventorySnapshot>;forestObjectives:Map<string,ForestObjective>;gates:Map<string,{build:CommandBucket}>;
  pendingItemUses:Map<string,Promise<void>>};

for(const fails of [false,true])test(`delivery ${fails?"keeps the task if saving fails":"commits the reward once at the destination"}`,async()=>{
  const room=new MyRoom(),inside=room as unknown as Internals,id="courier",ranger=objectiveRanger("bound_temple");assert.ok(ranger);
  const player=new Player({characterName:"Tester",mapId:"bound_temple",x:ranger.x,y:ranger.y,z:ranger.z,
    pathId:"seer",ancestryId:"shrine",level:10,alive:true,hp:240});
  room.state.players.set(id,player);inside.persistentCharacters.set(id,"a".repeat(64));inside.inventories.set(id,makeClassInventory("seer"));
  inside.gates.set(id,{build:new CommandBucket(3,1)});inside.forestObjectives.set(id,{id:"delivery_forbidden_forest_bound_temple",progress:4});
  const events:string[]=[];const client={sessionId:id,send:(kind:string)=>events.push(kind)} as unknown as Client;
  const original=characterStore.save;let saved:CharacterSnapshot|undefined,unblock!:()=>void;
  const barrier=new Promise<void>(resolve=>{unblock=resolve;});
  characterStore.save=async snapshot=>{saved=structuredClone(snapshot);await barrier;if(fails)throw Error("disk failed");};
  try{
    player.x=ranger.x+20;inside.messages.finish_forest_delivery(client,{});
    assert.equal(inside.pendingItemUses.has(id),false);assert.equal(saved,undefined);player.x=ranger.x;
    inside.messages.finish_forest_delivery(client,{});const pending=inside.pendingItemUses.get(id);assert.ok(pending);
    assert.equal(player.experience,0);assert.ok(inside.forestObjectives.has(id));
    unblock();await pending;
    assert.equal((saved as CharacterSnapshot|undefined)?.forestObjective,null);
    if(fails){assert.equal(player.experience,0);assert.ok(inside.forestObjectives.has(id));assert.ok(events.includes("command_rejected"));}
    else {assert.ok(player.experience>0);assert.equal(inside.forestObjectives.has(id),false);assert.ok(events.includes("experience_gained"));}
  }finally{unblock();characterStore.save=original;}
});
