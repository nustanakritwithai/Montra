import test from "node:test";
import assert from "node:assert/strict";
import type {Client} from "colyseus";
import {MyRoom} from "./MyRoom.js";
import {Monster,Player} from "./schema/MyRoomState.js";
import {CommandBucket} from "./GameRules.js";
import {characterStore} from "./CharacterStore.js";
import {makeClassInventory,type InventorySnapshot} from "./ItemRules.js";
import {FOREST_OBJECTIVES,type ForestObjective} from "./ForestObjectives.js";

type Internals={messages:Record<string,(client:Client,message:unknown)=>void>;persistentCharacters:Map<string,string>;
  inventories:Map<string,InventorySnapshot>;forestObjectives:Map<string,ForestObjective>;gates:Map<string,{build:CommandBucket}>;
  pendingItemUses:Map<string,Promise<void>>;pendingRewards:Map<string,Promise<void>>;forestDefenses:Map<string,{hp:number}>;
  simulatedMs:number;updateForestDefenses():void;grantMonsterExperience(id:string,amount:number,level:number,tier:"normal",boss:boolean,monsterId:string):void};

test("defense needs a guard at the camp and only advances during an active defense",async()=>{
  const room=new MyRoom(),inside=room as unknown as Internals,id="guard",def=FOREST_OBJECTIVES.defense_forbidden_forest,area=def.defense!;
  const player=new Player({characterName:"Tester",mapId:def.mapId,x:area.x,y:0,z:area.z,pathId:"seer",ancestryId:"shrine",level:1,alive:true,hp:240});
  const monster=new Monster({id:"forest_west_1",mapId:def.mapId,x:area.x,z:area.z,alive:true,level:1});
  room.state.players.set(id,player);room.state.monsters.set(monster.id,monster);inside.persistentCharacters.set(id,"a".repeat(64));
  inside.inventories.set(id,makeClassInventory("seer"));inside.gates.set(id,{build:new CommandBucket(3,1)});inside.forestObjectives.set(id,{id:"defense_forbidden_forest",progress:0});
  const client={sessionId:id,send:()=>{}} as unknown as Client,original=characterStore.save;
  characterStore.save=async()=>{};
  try{
    inside.grantMonsterExperience(id,50,1,"normal",false,monster.id);await inside.pendingRewards.get(id);
    assert.equal(inside.forestObjectives.get(id)?.progress,0);
    player.x=area.x+area.radius+2;inside.messages.start_forest_defense(client,{});assert.equal(inside.pendingItemUses.has(id),false);
    player.x=area.x;inside.messages.start_forest_defense(client,{});await inside.pendingItemUses.get(id);
    assert.equal(inside.forestDefenses.get(id)?.hp,120);
    inside.simulatedMs=3000;inside.updateForestDefenses();assert.equal(inside.forestDefenses.get(id)?.hp,118);
    inside.grantMonsterExperience(id,50,1,"normal",false,monster.id);await inside.pendingRewards.get(id);
    assert.equal(inside.forestObjectives.get(id)?.progress,1);
  }finally{characterStore.save=original;}
});
