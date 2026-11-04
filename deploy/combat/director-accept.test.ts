import test from "node:test";
import assert from "node:assert/strict";
import type {Client} from "colyseus";
import {MyRoom} from "./MyRoom.js";
import {Player} from "./schema/MyRoomState.js";
import {CommandBucket} from "./GameRules.js";
import {characterStore,type CharacterSnapshot} from "./CharacterStore.js";
import {makeClassInventory,type InventorySnapshot} from "./ItemRules.js";
import {objectiveRanger,type ForestObjective} from "./ForestObjectives.js";
import {worldDirector} from "./WorldDirector.js";

type Internals={messages:Record<string,(client:Client,message:unknown)=>void>;persistentCharacters:Map<string,string>;
  inventories:Map<string,InventorySnapshot>;forestObjectives:Map<string,ForestObjective>;directorClaims:Map<string,string[]>;
  gates:Map<string,{build:CommandBucket}>;pendingItemUses:Map<string,Promise<void>>};

test("event missions require the local NPC and an unclaimed active event",async()=>{
  worldDirector.observe("accept-test",[{mapId:"forbidden_forest",level:5}]);await new Promise<void>(resolve=>setImmediate(resolve));
  const event=worldDirector.snapshot(),keeper=objectiveRanger("forbidden_forest");assert.ok(event && keeper);
  const room=new MyRoom(),inside=room as unknown as Internals,id="player",player=new Player({characterName:"Tester",mapId:"forbidden_forest",
    x:keeper.x,y:keeper.y,z:keeper.z,pathId:"seer",ancestryId:"shrine",level:5,alive:true,hp:240});
  room.state.players.set(id,player);inside.persistentCharacters.set(id,"a".repeat(64));inside.inventories.set(id,makeClassInventory("seer"));
  inside.gates.set(id,{build:new CommandBucket(6,2)});
  const client={sessionId:id,send:()=>{}} as unknown as Client,save=characterStore.save;let written:CharacterSnapshot|undefined;
  characterStore.save=async snapshot=>{written=structuredClone(snapshot);};
  try{
    player.x=keeper.x+20;inside.messages.set_forest_objective(client,{id:event.objectiveId,eventId:event.id});
    assert.equal(inside.pendingItemUses.has(id),false);player.x=keeper.x;
    inside.messages.set_forest_objective(client,{id:event.objectiveId,eventId:event.id});await inside.pendingItemUses.get(id);
    assert.equal((written as CharacterSnapshot|undefined)?.forestObjective?.directorEventId,event.id);
    inside.forestObjectives.delete(id);inside.directorClaims.set(id,[event.id]);written=undefined;
    inside.messages.set_forest_objective(client,{id:event.objectiveId,eventId:event.id});
    assert.equal(inside.pendingItemUses.has(id),false);assert.equal(written,undefined);
  }finally{characterStore.save=save;worldDirector.forget("accept-test");}
});
