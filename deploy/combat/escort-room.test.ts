import test from "node:test";
import assert from "node:assert/strict";
import type {Client} from "colyseus";
import {MyRoom} from "./MyRoom.js";
import {Player} from "./schema/MyRoomState.js";
import {CommandBucket} from "./GameRules.js";
import {characterStore,type CharacterSnapshot} from "./CharacterStore.js";
import {makeClassInventory,type InventorySnapshot} from "./ItemRules.js";
import {FOREST_OBJECTIVES,objectiveRanger,type ForestObjective} from "./ForestObjectives.js";
import {groundAt} from "./WorldMaps.js";

type Internals={messages:Record<string,(client:Client,message:unknown)=>void>;persistentCharacters:Map<string,string>;
  inventories:Map<string,InventorySnapshot>;forestObjectives:Map<string,ForestObjective>;gates:Map<string,{build:CommandBucket}>;
  pendingItemUses:Map<string,Promise<void>>;forestEscorts:Map<string,{x:number;y:number;z:number;hp:number}>;
  updateForestEscorts(dt:number):void};

test("escort starts at its NPC, follows nearby players, and rewards only at the destination",async()=>{
  const room=new MyRoom(),inside=room as unknown as Internals,id="escort",keeper=objectiveRanger("forbidden_forest"),def=FOREST_OBJECTIVES.escort_forbidden_forest;
  assert.ok(keeper && def?.escort);const goal=def.escort;
  const player=new Player({characterName:"Tester",mapId:def.mapId,x:keeper.x,y:keeper.y,z:keeper.z,pathId:"seer",ancestryId:"shrine",level:1,alive:true,hp:240});
  room.state.players.set(id,player);inside.persistentCharacters.set(id,"a".repeat(64));inside.inventories.set(id,makeClassInventory("seer"));
  inside.gates.set(id,{build:new CommandBucket(3,1)});inside.forestObjectives.set(id,{id:"escort_forbidden_forest",progress:0});
  const client={sessionId:id,send:()=>{}} as unknown as Client,original=characterStore.save;let saved:CharacterSnapshot|undefined;
  characterStore.save=async snapshot=>{saved=structuredClone(snapshot);};
  try{
    player.x=keeper.x+20;inside.messages.start_forest_escort(client,{});assert.equal(inside.forestEscorts.has(id),false);
    player.x=keeper.x;inside.messages.start_forest_escort(client,{});const npc=inside.forestEscorts.get(id);assert.ok(npc);
    player.x=keeper.x+4;inside.updateForestEscorts(.5);assert.ok(npc.x>keeper.x);assert.equal(saved,undefined);
    npc.x=goal.x;npc.z=goal.z;npc.y=groundAt(def.mapId,goal.x,goal.z);player.x=goal.x;player.z=goal.z;player.y=npc.y;
    inside.updateForestEscorts(.1);await inside.pendingItemUses.get(id);
    assert.equal((saved as CharacterSnapshot|undefined)?.forestObjective,null);assert.equal(inside.forestEscorts.has(id),false);assert.ok(player.experience>0);
  }finally{characterStore.save=original;}
});
